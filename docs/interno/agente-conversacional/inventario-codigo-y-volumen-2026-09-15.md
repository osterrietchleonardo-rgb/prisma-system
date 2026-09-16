# Inventario: el bot de WhatsApp del lado de PRISMA, y cuánto volumen maneja

Relevado el 15-sep-2026 sobre `main` (commit `8002bec`) de
`C:\Users\LENOVO\Desktop\CODE\Antigravity - Apps\PRISMA-SYSTEM`. Todo fue de solo lectura:
en la base solo se hicieron `select` y `count head`. Las citas van como `archivo:línea`.

Scripts de las consultas (en el scratchpad): `volumen.mjs` → `volumen.json`, y
`volumen2.mjs` → `volumen2.json`. La ventana de 30 días va de **2026-08-16T20:40Z a
2026-09-15T20:40Z**. Los días y las horas se cuentan en hora argentina (UTC-3).

---

## Lo más importante primero

1. **Hoy todos los mensajes de los leads entran por el webhook de Meta, y todas las
   respuestas del bot salen por Evolution.** En los últimos 30 días, los 3.659 mensajes de
   leads de Central tienen en `metadata` la forma del objeto `message` de Meta. Ninguno tiene
   la forma `data` de Evolution (consulta 2.1). Aun así, las dos instancias tienen
   `integration_type = 'evolution'`, y por eso `/api/n8n/reply` elige la rama de Evolution
   (`app/api/n8n/reply/route.ts:104`). El webhook de Evolution sigue en el código, pero hoy
   no recibe leads.
2. **Ningún webhook comprueba quién le escribe.** El de Meta no valida la firma
   `X-Hub-Signature-256`, y el de Evolution no pide ninguna clave. Revisé las dos rutas y
   busqué "hub-signature" y "app_secret" en `app/` y `lib/`: no aparece en ningún lado.
   `/api/n8n/reply` solo exige el secreto si `N8N_REPLY_SECRET` está configurado
   (`reply/route.ts:45-48`).
3. **El webhook de Meta descarta en silencio los documentos, las ubicaciones, los stickers y
   los contactos.** Solo acepta text, image, audio, video e interactive; todo lo demás cae en
   `else continue` (`meta/route.ts:117-123`), sin guardarlo ni avisarle a n8n.
4. **La ventana que agrupa mensajes importa mucho.** El 28,4 % de los mensajes de leads llega
   a menos de 45 s del mensaje anterior del mismo lead (B.3).
5. **El bot tarda 74 s en contestar (mediana), y 128 s el 90 % de las veces.** Se mide desde
   el primer mensaje del turno. Encaja con una espera de ~45 s más el tiempo del modelo (B.4).
6. **El volumen es chico.** En promedio, Central recibe 122 mensajes de leads por día (máximo
   245) y el bot manda 172 (máximo 351). La hora de más carga tuvo 48 mensajes de leads y el
   minuto de más carga, 6. No hay problema de escala.
7. **El prompt del bot no se edita desde PRISMA.** `whatsapp_ai_settings` tiene nombre, tono,
   zona y horario del bot, pero ninguna columna de prompt (A.6).

---

## A. El código

### A.1 Webhooks de entrada

#### `app/api/webhooks/meta/route.ts` (402 líneas) — el que se usa hoy

- **`maxDuration = 60`** (`:12`), para que entren los 3 intentos a n8n de hasta 15 s cada uno.
- **GET de verificación** (`:15-30`): compara `hub.verify_token` con
  `WHATSAPP_WEBHOOK_VERIFY_TOKEN`. Si esa variable no está, usa un valor fijo escrito en el
  código (`:21`).
- **POST.** No valida la firma. Solo filtra `payload.object === 'whatsapp_business_account'`
  (`:42`). Después recorre `entry[].changes[]`:
  - Si `field = message_template_status_update`, hace un UPDATE de `wa_templates`
    (`status` y `rejection_reason`) por `meta_template_id` (`:64-77`).
  - Si `field = messages` y trae `statuses`, llama a `actualizarEstadoEntrega` por wamid
    (`:82-90`, en `lib/whatsapp/delivery-status.ts:54-85`). El estado nunca retrocede, salvo
    `failed`, que siempre gana.
  - Si `field = messages` y trae `messages`:
    - Busca la instancia por `phone_number_id` (`:98-109`).
    - Arma el contenido según el tipo (`:116-123`). A audio, imagen y video les pone un texto
      fijo ("Mensaje de voz recibido", etc.). **Los demás tipos se descartan.**
    - **Gate de internos** (`:128-138`): si el teléfono es de un asesor o director de la
      agencia, `procesarMensajeInterno` lo registra en `interacciones_canal`, le contesta
      "recibido" con el link a PRISMA y corta ahí. No crea conversación ni llama a n8n
      (`lib/whatsapp/gate-internos.ts:57-83` y `:100-144`). Si algo falla, deja pasar el
      mensaje por el camino normal.
    - **Descarta repetidos por `wamid`** mirando `wa_messages` (`:142-155`).
    - **`buscarOCrearConversacion`** (`:162-182`, en `lib/whatsapp/conversations.ts:35-104`):
      busca el chat y, si no está, lo crea. El índice único `(agency_id, contact_phone)`
      decide quién gana la carrera; si el INSERT choca (23505), vuelve a buscar. Un chat nuevo
      nace con `bot_active=true`, `status='active'`, `clasificacion='Consulta'`,
      `funnel_status='open'`, `requires_follow_up=true`, `next_follow_up_at=+24h`,
      `follow_ups_sent=0`, `last_inbound_at` y `unread_count=1`.
    - Si el chat ya existía, actualiza `contact_name`, `last_message_at`, `last_inbound_at`,
      `unread_count+1` y `next_follow_up_at=+24h`, y pone `requires_follow_up=true` y
      `follow_ups_sent=0` (`:201-212`). **No reabre `funnel_status`** (el de Evolution sí,
      ver más abajo).
    - Sincroniza `wa_contacts` si puede; si falla, sigue igual (`:217-240`).
    - Hace un INSERT en `wa_messages` con `role='lead'`, `message_type=message.type`, `wamid`
      y `metadata=message` (el objeto crudo de Meta) (`:243-255`).
    - **Adjuntos** (`:259-278`): llama a `guardarAdjuntoEntrante`
      (`lib/whatsapp/adjuntos-entrantes.ts:40-71`). Pide el archivo a la Graph API v21.0 en
      dos pasos (datos del media y después la descarga, con el token de la instancia), lo sube
      al bucket `documents` en `wa-inbound/{agency}/{conv}/{mediaId}.{ext}` con upsert, y
      suma `media_url`, `media_mime` y `media_saved_at` al `metadata` del mensaje. Corre en
      paralelo y se espera con `allSettled` antes de contestarle a Meta (`:390`).
    - **Disparo a n8n solo si `bot_active`** (`:281-357`). Lee los últimos 10 mensajes
      (`:283-288`) y `etiquetas, score, status` (`:291-295`), arma el payload y llama a
      `triggerN8nWithSafetyNet`. Se juntan todos con `Promise.all` antes de responder
      (`:386-388`).
    - **Con el bot apagado** (`:358-379`) guarda el mensaje del lead en `n8n_chat_histories`
      (`session_id=conversation_id`, `type:'human'`, con el formato de texto del agente), para
      que la memoria de n8n no pierda lo que pasó.
  - Si la base falló, contesta **503** para que Meta reintente (`:57`, `:104-107` y
    `:392-396`). Una instancia desconocida recibe 200.
  - **El webhook de Meta no avisa a la pantalla en vivo cuando llega un lead** (no hace
    `channel().send`). El de Evolution sí lo hace.

#### `app/api/webhooks/evolution/route.ts` (417 líneas) — hoy no recibe leads (B, consulta 2.1)

- **`maxDuration = 60`** (`:11`). No hay ninguna autenticación.
- Si llega `messages.update`, actualiza el estado de entrega por wamid (`:34-47`). Solo
  procesa `messages.upsert` y descarta los `fromMe` (`:50-67`).
- Descarta repetidos por wamid (`:71-81`). El contenido se arma así:
  `conversation || extendedTextMessage.text || imageMessage.caption || audioMessage.url ||
  'Mensaje multimedia o no soportado'` (`:84-89`). El tipo queda en text, image, audio u
  other (`:92-98`). **No baja los adjuntos.**
- Busca la instancia por `evo_instance_name` o `instance_name` (`:102-106`). Si la base
  falla, contesta 503 (`:110-113`); si la instancia no existe, 404.
- Tiene el mismo gate de internos (`:126-136`) y el mismo `buscarOCrearConversacion`
  (`:143-171`).
- Si el chat ya existía, además **reabre `funnel_status`** cuando estaba `snoozed` o
  `closed_lost`, y agrega un evento `client_responded` a `follow_ups_history` con una foto
  del estado (`:198-243`).
- Hace en paralelo el INSERT en `wa_messages` (`metadata=data`), la sincronización de
  contactos y la lectura del historial (`:249-302`). Después avisa a la pantalla en vivo
  (`agency-{id}` y `active-agency-{id}`, evento `refresh-whatsapp`) (`:310-321`).
- Con el bot apagado, guarda en `n8n_chat_histories` y termina (`:325-346`). Con el bot
  prendido, dispara n8n (`:351-410`). El payload suma `instance_name` y `evolution_url`.

#### `lib/whatsapp/n8nTrigger.ts` (127 líneas)

- `callN8n(payload)` (`:42-83`) hace POST a `N8N_WEBHOOK_URL` hasta **3 intentos**. Cada uno
  tiene un **timeout de 15 s** y la espera entre intentos crece (500 ms, después 1.000 ms).
  Cualquier 2xx cuenta como éxito.
- `triggerN8nWithSafetyNet` (`:91-127`): si los 3 intentos fallan, guarda el payload en
  `wa_n8n_dead_letter` con `status='pending'`. Si ni eso se puede guardar, deja el payload
  completo en el log.
- Según el comentario de `:12-15`, n8n contesta al instante ("recibido") y la respuesta real
  llega después, por `/api/n8n/reply`.
- **Payload** (el de Meta, `meta/route.ts:297-345`): `debug_v`, `webhook_event_id` (uuid),
  `message_id`, `agency_id`, `conversation_id`, `contact_phone`, `contact_name`,
  `message{ id, content, type, wamid, received_at, media{id, mime_type, caption, voice} | null }`,
  `conversation{ etiquetas, score, status, bot_active }`, `history[]` (hasta 10
  `{role, content, at}`, del más viejo al más nuevo) y `reply_url`.

### A.2 Rutas bajo `app/api/n8n/`

Hay solo dos: `reply/` y `retry-pending/`.

#### `app/api/n8n/reply/route.ts` (298 líneas)

- **No define `maxDuration`**, así que usa el valor por defecto de Vercel.
- **Recibe:** `conversation_id`, `reply`, `secret`, `update_score` (0-100), `add_etiquetas[]`,
  `instance_name`, `media_url` y `media_type` (le corrige errores de tipeo: "imege" pasa a
  "image") (`:27-42`).
- **Seguridad:** el `secret` se compara con `N8N_REPLY_SECRET` **solo si la variable existe**
  (`:45-48`).
- **Si el bot está apagado, descarta la respuesta** y contesta `success:false` (`:69-74`).
- **Anti-cruce:** si llega `instance_name` y no coincide con el `evo_instance_name` de la
  conversación, contesta 400 (`:88-97`).
- **Envío por Evolution**, que es lo que corre hoy (`:104-184`): `POST
  {EVOLUTION_API_URL}/message/sendText/{evo}` con `delay` = 40 ms por carácter (entre 800 y
  4.000 ms) y `presence:'composing'`. Si trae media, usa `/message/sendMedia/{evo}` y deduce
  el mimetype por la extensión. El `wamid` sale de `key.id` o `messageId`.
- **Envío por Meta**, solo como alternativa (`:189-230`): Graph **v20.0**
  `/{phone_number_id}/messages`, texto o `{type:{link, caption}}`.
- **Guarda** (`:238-273`): un INSERT en `wa_messages` con `role='bot'`, el `message_type`
  (text o el tipo del media), el `wamid` y `metadata{source:'n8n', sent_via, media_url}`; y
  un UPDATE de `wa_conversations`: `last_message_at`, más `score` y la unión de `etiquetas`
  si vinieron. Después avisa a la pantalla en vivo (`:276-286`).
- **No hay protección contra repetidos.** No hay ninguna clave de idempotencia: si n8n manda
  el mismo reply dos veces, sale dos veces al cliente y queda guardado dos veces.

#### `app/api/messages/bot-reply/route.ts` (96 líneas) — una ruta vieja aparte

- Exige `Bearer BOT_REPLY_SECRET`. Primero guarda el mensaje `role='bot'` y después lo manda
  por Evolution con `instance_name`, sin `evo_instance_name`. No revisa `bot_active`.
- **Por grep, nada del repo la llama.** Si n8n la usa, no lo verifiqué.

### A.3 Mensajes que no llegaron a n8n y reintentos

- **Tabla:** `supabase/migrations/20260624120000_wa_n8n_dead_letter.sql:18-42`. Columnas
  `id, conversation_id, agency_id, message_id, contact_phone, source, payload jsonb, attempts,
  last_error, status ('pending'|'reprocessed'|'failed'), created_at, updated_at,
  reprocessed_at`. Tiene RLS sin políticas, así que solo la toca la service role.
  - En la base hay además **un estado `discarded`**, que no figura en la migración (B.6).
- **`app/api/n8n/retry-pending/route.ts`** (121 líneas, `maxDuration = 60`, `:7`). Acepta
  `Bearer CRON_SECRET`, o bien `x-retry-secret` o `?secret=` con `N8N_REPLY_SECRET`. Si no
  coincide ninguno, rechaza (`:33-42`).
  - Toma los `pending` (con `?maxAgeHours` opcional), `limit` entre 1 y 100 (25 si no se
    indica), del más viejo al más nuevo, y los vuelve a mandar con `callN8n`.
  - Si sale bien, pasa a `reprocessed`; si no, suma los intentos y guarda el error
    (`:55-109`).
- **`.github/workflows/n8n-retry-pending.yml`**: corre cada 15 min (`:8`, que en la práctica
  se atrasa, ver la memoria "github-actions-cron-se-atrasa"). Llama con
  `?maxAgeHours=3&limit=50` y `Bearer CRON_SECRET` (`:21-22`). Lo más viejo que 3 h queda
  pendiente para decidir a mano.

### A.4 Funciones para mandar mensajes

No hay un módulo central de envío. La llamada a Evolution o a Meta está **copiada en unos
nueve lugares**, con versiones distintas de la Graph API (v19, v20 y v21):

| Qué manda | Dónde | Canal |
|---|---|---|
| Respuesta del bot (texto o media) | `app/api/n8n/reply/route.ts:104-230` | Evolution sendText/sendMedia; si no, Meta v20 |
| Plantilla de seguimiento (desde n8n) | `app/api/whatsapp/dispatch/route.ts:97-188` (`x-api-key = DISPATCH_SECRET`, respeta la franja 6-23 AR en `:24-31`) | Evolution sendTemplate con `components` (`:110-148`); si no, Meta v20 |
| Texto manual del asesor | `app/actions/whatsapp.ts:392` `sendDirectMessage` | **Solo Evolution** (`:464`) |
| Archivo manual del asesor | `app/actions/whatsapp.ts:560` `sendDirectMedia` | **Solo Evolution** (`:667`) |
| Plantilla de campaña (una a la vez) | `app/actions/whatsapp.ts:1434` `sendCampaignMessage` | Meta v20 (`:1545`) |
| Campañas por goteo | `lib/whatsapp/campaign-sender.ts:53` `processCampaign` | Meta v20 (`:241`) |
| Plantillas de aviso al equipo | `lib/seguimiento/avisos.ts:235-311` `enviarPlantillaEquipo` | **Meta primero** (`:264`); si no, Evolution sendTemplate (`:286`) |
| Confirmación a un asesor que escribió | `lib/whatsapp/gate-internos.ts:151-185` `crearEnviadorTexto` | Evolution sendText; si no, Meta v19 |
| Ruta vieja del bot | `app/api/messages/bot-reply/route.ts:69` | Evolution |

- **La pieza más reutilizable es `crearEnviadorTexto`** (`gate-internos.ts:151`): recibe
  `(db, instanceId)` y devuelve `(tel, texto) => Promise<void>`, y ya elige entre Evolution y
  Meta. Sirve de base, pero no devuelve el wamid, no manda archivos y no simula que está
  escribiendo.
- **Ventana de 24 h de Meta.** El código solo la controla en el envío manual del asesor:
  `sendDirectMessage` (`app/actions/whatsapp.ts:439-456`) y `sendDirectMedia` (`:616-632`),
  mirando `wa_conversations.last_inbound_at`. `/api/n8n/reply` no la controla, porque parte
  de que el bot contesta dentro de la ventana. El director tiene, al reasignar, la opción de
  "plantilla de reapertura" (`app/actions/equipo.ts:259`).
- **`lib/whatsapp/sending-window.ts` no es la ventana de 24 h.** Es la franja horaria
  permitida para mensajes proactivos: de 6 a 23 h AR (`dentroDeVentanaEnvio`, `:34-37`), más
  `horasHabiles()` (`:57-68`). El comentario de `:8-10` aclara que no se aplica a las
  respuestas del bot.

### A.5 Derivación a un asesor (handoff) en el código

- **La marca** es un mensaje `role='internal'` cuyo texto contiene "Handoff activado". Lo
  escribe el flujo Gestion_Handoff de **n8n**, no PRISMA (`lib/queries/handoffs.ts:6-21`).
  PRISMA solo lo lee.
- **`getHandoffsDashboardData`** (`lib/queries/handoffs.ts:75-189`):
  1. Busca las marcas (tope de 500).
  2. Trae esas conversaciones, con el alcance que da la RLS según el rol.
  3. Trae los mensajes posteriores a la marca.

  Un handoff cuenta como "atendido" si después aparece un mensaje `human`, o un `internal` que
  no sea la marca. Si no, queda "sin atender", con gravedad reciente, demorado (≥ 2 h) o
  crítico (≥ 24 h). El comentario de `:23` dice "~60 en total"; **hoy hay 236** (B, consulta
  2.3).
- **`/api/whatsapp/handoffs-pendientes`** (`route.ts:10-42`): devuelve `{pendientes}` para la
  burbuja del celular. Usa la misma consulta; el asesor ve los suyos y el director los de toda
  la agencia.
- Lo usan los paneles de `app/director/dashboard/page.tsx:133` y
  `app/asesor/dashboard/page.tsx:115`.
- **`bot_active` no sirve para saber si hubo handoff** (`handoffs.ts:9-10` y
  `lib/seguimiento/guardrails.ts:39-45`). El Super Agente usa `metricas.fue_derivado_a_humano`
  o `metricas.etapa='handoff'`.
- **Cómo el asesor toma el control y se lo devuelve al bot:** con el interruptor
  "IA respondiendo / Control manual" (`components/whatsapp/ActiveChat.tsx:284-290` y
  `:670-674`), que llama a `toggleBotActive` (`app/actions/whatsapp.ts:364-386`). Ese UPDATE
  de `bot_active` no deja registro de quién ni cuándo.
  - Mientras el bot está apagado, los mensajes del lead se copian a `n8n_chat_histories`
    (A.1), y los del asesor también, como `type:'ai'` (`whatsapp.ts:510-542`).
  - **No hay nada que devuelva el bot solo.**
  - Las campañas pueden prender `bot_active` al responder, según `bot_active_on_reply`
    (`campaign-sender.ts:313` y `:334`).

### A.6 Configuración del bot por agencia

- **`whatsapp_instances`**, columnas reales según la consulta de esquema: `id, agency_id,
  instance_name, token, phone_number_id, business_id, status, phone_display, created_at,
  updated_at, evo_instance_name, integration_type, evo_instance_id, messaging_limit_tier,
  templates_status, flows_active`.
  - **El proveedor sale de `integration_type`**, más la presencia de `phone_number_id` y
    `token`.
  - `flows_active` y `templates_status` solo aparecen en `app/api/cron/sync-templates/route.ts`
    y en tres migraciones. **Ningún código de los webhooks lee `flows_active`**: no apaga el
    bot.
- **`whatsapp_ai_settings`**, columnas: `id, agency_id, agent_id, bot_name, company_name,
  language, tone, personality, geographic_zone, currency, working_hours, property_types,
  min_anticipation_hours, cancelation_deadline_hours, created_at, updated_at, tokko_agent_id,
  knowledge_text, knowledge_embedding`.
  - Se edita desde el navegador en `components/whatsapp/AiSettingsTab.tsx:80-175`. Si no hay
    fila, crea una con "Valentina" como nombre.
  - El documento de conocimiento (.docx) se procesa en
    `app/api/whatsapp/ai-settings/knowledge-upload/route.ts:13-63`: extrae el texto con
    mammoth y genera el embedding con Gemini `gemini-embedding-001`.
  - **Esa ruta no verifica quién la llama** (usa la service role y actualiza por `settingId`
    sin revisar la sesión).
  - Además, lee `bot_name`: `lib/seguimiento/avisos.ts:86-94` y
    `app/api/propiedades/[id]/notas-ia/route.ts:114`.
  - **`app/api/whatsapp/ai-settings/` no tiene `route.ts` propio**; solo existe
    `knowledge-upload/`.
- **El prompt del bot vive solo en n8n.** No hay ninguna columna de prompt, y en la base
  `knowledge_text` está en null para las dos agencias (B.7). Si n8n usa las columnas de
  `whatsapp_ai_settings`, desde acá no se ve.

### A.7 Qué lee y escribe PRISMA de las columnas del lead en `wa_conversations`

Columnas reales: `id, agency_id, instance_id, contact_phone, contact_name, last_message_at,
last_inbound_at, bot_active, status, score, etiquetas, created_at, unread_count, agent_id,
pipeline_stage, metricas, funnel_status, requires_follow_up, next_follow_up_at, opt_out,
follow_ups_sent, follow_ups_history, recovery_stage, dropoff_reason, visit_status,
visit_scheduled_at, visit_reminder_24h_sent, visit_reminder_3h_sent, visit_reminder_1h_sent,
clasificacion, visit_address, clasificaciones_historial`.

| Columna | PRISMA escribe | PRISMA lee |
|---|---|---|
| `metricas` | **Nada.** Ninguna ruta del código hace UPDATE de `metricas` en `wa_conversations`; la llena n8n | Super Agente (`lib/seguimiento/*`: contexto.ts:31, guardrails.ts:42, semilla, escalamiento, despedida), `app/actions/equipo.ts:48`, `app/api/conversational-insights/analyze/route.ts:426`, auditoría `lib/admin-vakdor/audit/whatsapp.ts` |
| `score`, `etiquetas` | `/api/n8n/reply` (`:243-250`); etiquetas también `updateEtiquetas` (`whatsapp.ts:799`) y `updateConversationDetails` (`:1109`) | Los webhooks, para el payload |
| `funnel_status` | Webhooks (nace `open`; Evolution reabre); `lib/queries/director.ts:161-186` (`cerrado`→`closed_won`, `perdido`→`closed_lost`); `app/actions/equipo.ts:373,394` | Dashboards, Super Agente |
| `pipeline_stage` | `updateWaConversationStage` (`lib/queries/director.ts:161`), llamado desde `LeadsWhatsappClient.tsx:104`; `sendToPipeline` (`whatsapp.ts:1914`) | Pipeline y dashboards |
| `clasificacion` | Webhooks (`Consulta`), `updateConversationDetails`, campañas | Filtros y campañas |
| `visit_*` | **Un trigger en la base** que copia `scheduled_visits` → `wa_conversations` (`supabase/migrations/20260710120000_visitas_calendario_sync.sql:1-2`, `:64-106`); RPC `seguimiento_marcar_visitas_realizadas` (`lib/seguimiento/visitas.ts:138`) | Recordatorios (`visitas.ts:30-100`), guardrails |
| `follow_ups_*`, `next_follow_up_at`, `requires_follow_up` | Webhooks (reinician el reloj), `dispatch` (`:261-264`, agrega a `follow_ups_history`), Super Agente | Super Agente |

### A.8 Piezas que ya existen para armar un agente en código

- **`lib/seguimiento/agente.ts`**: el bucle del agente con herramientas, sobre Anthropic
  (`decidirConAgente`, `:171-235`). Tiene hasta 6 vueltas, `thinking adaptive`, caché del
  prompt y las herramientas (`:133`), valida la decisión final con Zod
  (`emitir_decision`) y aplica reglas duras en código (`requisitosInvestigacion`, `:151`).
  - **La estructura sirve casi tal cual.** Está hecha para decidir y no para conversar: no
    hace streaming, termina con una herramienta obligatoria y su prompt es de seguimiento.
- **`lib/seguimiento/herramientas.ts`**: 4 herramientas de solo lectura (`leer_mensajes`,
  `leer_intentos_previos`, `leer_compromisos`, `leer_propiedad`), inyectables para las pruebas.
  - `leer_mensajes` y `leer_propiedad` sirven tal cual.
  - `leer_propiedad` es un `ilike` sobre dirección, título y ciudad, con tope de 3 resultados:
    **no usa embeddings.**
- **`lib/seguimiento/guardrails.ts`**: `puedeEjecutar`, `enHandoff` y `sigueElegible`, para
  mensajes proactivos. **La idea de "volver a leer la conversación antes de mandar" sirve
  tal cual** para evitar respuestas cruzadas.
- **`lib/seguimiento/avisos.ts`**: avisos al equipo por Resend y por plantilla de WhatsApp,
  con registro en `interacciones_canal`. **Sirve tal cual para el handoff hecho en código**
  (avisar al asesor).
- **`lib/seguimiento/eventos.ts`**: `registrarEvento` → `lead_eventos`, para dejar rastro de
  lo que pasó con cada lead. Sirve tal cual.
- **Buscador IA** (`app/api/ai/consultor/route.ts`, `lib/openai.ts`, `lib/buscador-stream.ts`):
  - El modelo es `gpt-5.4-mini` por Chat Completions (`lib/openai.ts:21-27`). Tiene streaming
    con `generateContentStream` (`:55-99`), y el navegador consume el NDJSON en
    `lib/buscador-stream.ts`.
  - **No usa herramientas**: el modelo saca los filtros como JSON y después redacta la
    respuesta.
  - **Lo que sirve es la búsqueda, no la forma de conversar.**
- **Búsqueda de propiedades por significado**: embedding de la consulta con Gemini
  `generateEmbedding(texto,'RETRIEVAL_QUERY')` (`consultor/route.ts:643`, `lib/gemini.ts:17`),
  más:
  - la RPC **`match_properties_ia`** (`consultor/route.ts:674-675`), que recibe
    `p_query_embedding, p_operation, p_type_patterns, p_rooms, p_bedrooms, p_bathrooms,
    p_price_min/max, p_currency, p_loc_patterns, p_amenity_patterns, p_floor_min/max,
    p_free_text_patterns, p_poligono, p_agency_id, p_include_agent/p_exclude_agent, p_limit`;
  - **`buscar_roomix`** para la red (`:732`);
  - y `match_agency_documents` (otra RPC).

  **Sirve para una herramienta `buscar_propiedades` del bot**, pero la lógica de preparar la
  búsqueda (`:333-640`) está metida adentro de la ruta: habría que sacarla a una función.
- **`lib/whatsapp/sending-window.ts`**: franja horaria para los mensajes proactivos. Sirve
  tal cual para seguimientos; no se aplica a las respuestas.
- **Otras piezas que sirven tal cual:**
  - `lib/whatsapp/conversations.ts` (crear el chat sin duplicarlo);
  - `lib/whatsapp/adjuntos-entrantes.ts` (bajar los adjuntos de Meta);
  - `lib/whatsapp/gate-internos.ts` (mensajes del equipo);
  - `lib/whatsapp/delivery-status.ts` (estado de entrega).
- **Cómo corre hoy el Super Agente:** `app/api/seguimiento/run/route.ts` (`maxDuration = 300`,
  `:19`; exige `x-api-key = SEGUIMIENTO_SECRET`, `:32`). **Quién lo llama no está en el
  repo**: no aparece en `.github/workflows` ni en `vercel.json`, cuyo único cron es
  `sync-templates`.

---

## B. Volumen y tiempos (últimos 30 días)

Hay **2 agencias**: Central Real Estate Argentina, y PRISMAIA - VAKDOR (la cuenta de
pruebas, con volumen casi nulo). Los números son de Central salvo que diga otra cosa.

### B.1 Mensajes por rol y conversaciones nuevas

Consulta: `wa_messages.select('id, conversation_id, agency_id, role, message_type,
created_at, src:metadata->>source').gte('created_at', DESDE)`, paginada de a 1.000, y agrupada
en JS por agencia, rol y día AR. **Total: 9.222 mensajes.**

| Central | Total 30 d | Promedio/día | Máximo/día (día) |
|---|---|---|---|
| lead | 3.659 | 122 | 245 (1-sep) |
| bot | 5.163 | 172 | 351 (1-sep) |
| human | 203 | 6,8 | 23 (1-sep) |
| internal | 162 | 5,4 | 19 (9-sep) |

- De los mensajes del bot: 4.603 son texto de n8n, 517 son imágenes de n8n y 43 son
  plantillas (`metadata->>source` y `message_type`).
- PRISMAIA - VAKDOR tuvo 10 mensajes de leads y 23 del bot en todo el mes.
- **Conversaciones nuevas de Central:** 481 en 30 días, **16 por día** en promedio, con un
  máximo de 29 (1-sep). Consulta: `wa_conversations.select('id, agency_id, bot_active,
  created_at')` completa, agrupada por día AR.

### B.2 Picos

- **Hora de más carga:** 48 mensajes de leads (1-sep, de 19 a 20 h AR). El 90 % de las horas
  con actividad tuvo 19 mensajes o menos.
- **Minuto de más carga:** 6 mensajes de leads (2-sep, 19:28 AR). Le siguen dos minutos con
  5 (19-ago, a las 12:21 y a las 17:19).
- Por hora del día (AR, total del mes): el pico es a las 12 h (405 mensajes). Hay actividad
  de 8 a 24 h, y de madrugada casi nada (48 a las 0 h, 0 a las 4 h).

### B.3 Mensajes pegados (lo que agrupa la ventana)

Se tomó cada mensaje de lead y se comparó con el mensaje de lead anterior en la misma
conversación, ordenados por `created_at`.

| Central | Mensajes de lead | Llegan < 10 s | < 30 s | **< 45 s** | < 90 s |
|---|---|---|---|---|---|
| Sobre todos los mensajes de lead | 3.659 | 13,3 % | 25,4 % | **28,4 % (1.038)** | 34,2 % |
| Sobre los que tienen un mensaje de lead anterior | 3.169 | — | — | **32,8 %** | — |

### B.4 Tiempo de respuesta del bot

Un **turno** empieza con el primer mensaje de lead que llega después de un mensaje que no es
de lead, y termina con el siguiente mensaje `bot` que no sea una plantilla. Si antes contesta
un `human`, el turno no se cuenta.

| Central | Mediana | p90 |
|---|---|---|
| Desde el **primer** mensaje del turno | **74,5 s** | **128,6 s** |
| Desde el **último** mensaje del turno | 71,2 s | 120,3 s |

- De 2.503 turnos: 2.323 tuvieron respuesta del bot, 112 no la tuvieron (o la respuesta fue
  una plantilla) y en 68 contestó antes un humano.
- Solo 7 respuestas tardaron más de 30 minutos. Si se las saca, los números casi no cambian
  (74,4 s y 127,6 s).

### B.5 Tipos de mensaje que entran (lead, 30 d)

- **Central:** text 3.564, audio 87, image 8. **No hay ni un video, documento, ubicación ni
  interactive**: el webhook de Meta descarta los documentos y las ubicaciones (A.1), así que
  el cero de esos dos tipos puede ser un efecto del filtro.
- **Adjuntos guardados:** de los 95 adjuntos, solo 17 tienen `media_url` guardado. La descarga
  empezó el 11-sep (`adjuntos-entrantes.ts:6-8`). 92 mensajes tienen como contenido el texto
  fijo ("Mensaje de voz recibido", etc.), y **el bot recibe ese texto, no el audio** (consulta
  2.1).

### B.6 Mensajes que no llegaron a n8n

Consulta: `wa_n8n_dead_letter.select('id, agency_id, source, status, attempts, created_at,
reprocessed_at, last_error')`.

- **11 filas en total**, del 30-jun al 24-ago-2026: 5 `reprocessed` y **6 `discarded`** (un
  estado que la migración no documenta).
- **En los últimos 30 días hubo 2**, las dos del 24-ago a las 10:50 UTC, con source `meta`,
  de Central, con error `HTTP 502 Bad Gateway`, 7 intentos y ya `reprocessed`.
- Errores más frecuentes en toda la historia: `fetch failed` (5), `timeout >15000ms` (4) y
  `HTTP 502` (2).

### B.7 Agencias con el bot activo e instancias

- **Instancias:** hay 2 y las dos tienen `integration_type='evolution'` y, a la vez,
  `phone_number_id` y token de Meta. Las dos están en `status='connected'`,
  `templates_status='approved'`, `flows_active=true` y `messaging_limit_tier='TIER_2K'`.
  **Instancias solo Meta: 0; solo Evolution: 0; las 2 tienen las dos cosas.**
  - Por dónde entran los mensajes: todo por Meta (consulta 2.1: 3.659 mensajes con la forma
    `meta(message)` y 0 con la forma `evolution(data)`).
  - Por dónde sale el bot: por Evolution (`reply/route.ts:104`).
- **Bot activo:** las dos agencias tienen instancia y configuración de IA (`bot_name` "Sofía"
  para Central y "Lara" para VAKDOR). No hay un interruptor por agencia; el bot se prende o
  apaga por conversación.
  - Central tiene 2.344 conversaciones: 637 con `bot_active=true` y 1.707 con `false`.
  - VAKDOR tiene 1 conversación, con el bot prendido.
  - **La única agencia con tráfico real es Central.**
- **Otros datos de contexto (consulta 2):**
  - `n8n_chat_histories`: 17.779 filas.
  - Marcas de handoff: 236 en total, 103 en los últimos 30 días.
  - Conversaciones de Central con `metricas` cargadas: 1.124; con
    `fue_derivado_a_humano='true'`: 457.
  - Entrega de los mensajes del bot en 30 días: 3.420 leídos, 1.583 entregados, 129 enviados,
    **23 fallidos** y 8 sin estado.

---

## Lo que no se pudo verificar desde acá

- Qué hace n8n por dentro (la ventana de 45 s, el prompt, las herramientas, cuándo escribe
  `metricas` o la marca de handoff): no se miró n8n, porque la consigna era solo el código y
  la base.
- Si n8n llama a `/api/messages/bot-reply` o a `/api/whatsapp/dispatch`.
- Quién dispara `/api/seguimiento/run`.
- Si `N8N_REPLY_SECRET` y `DISPATCH_SECRET` están cargados en Vercel. No están en el `.env`
  local de superagente (solo están `BOT_REPLY_SECRET`, las de Evolution, las de Supabase y
  `WHATSAPP_WEBHOOK_VERIFY_TOKEN`). Si no están en Vercel, esas dos rutas quedan abiertas.
