# Inventario del flujo principal "PRISMA" (n8n) — para reescribirlo como agente en código

**Fuente:** `PRISMA-SYSTEM-superagente/scratch/n8n-bot/PRISMA.json`. Workflow `PRISMA`, `active: true`,
`updatedAt 2026-08-25T22:12:49.095Z`, `versionId 4b585e3b-7f73-49ae-9a29-b44998444030`. 89 nodos.
`settings`: `executionOrder v1`, `timezone America/Argentina/Buenos_Aires`, `callerPolicy workflowsFromSameOwner`,
`binaryMode separate`. **No hay `errorWorkflow`** en `settings`. `pinData` vacío, `staticData` null.

Donde algo **no está en el JSON** y lo saqué del código de PRISMA, lo marco con **[PRISMA]** y el archivo.
El system prompt completo está en `prompt-agente-principal-n8n.md` (misma carpeta).

---

## 0. Mapa del grafo (recorrido por `connections`)

```
"Webhook" → "Set valores" → "push_mensajes" (Redis RPUSH) → "get_mensajes" (Redis GET) → "Switch"
   "Switch" out0 "No hacer nada"  → "No Operation, do nothing"        (fin de esta ejecución)
   "Switch" out2 "Esperar"(fallback) → "Wait"(45) → "get_mensajes" (loop)
   "Switch" out1 "Seguir" → "Eliminar_Mensajes" (Redis DEL) → "dividir mensajes" → "JSON parse" → "tipo de mensaje"
        audio  → "Token_Meta_audio" → "Resolver_Media_audio" → "obtener audio" → "transcribir audio" → "contenido - audio" ─┐
        imagen → "Token_Meta" → "Resolver_Media" → "obtener imagen" → "analizar imagen" → "contenido - imagen" ──────────────┤
        texto  → "set valores - texto" ────────────────────────────────────────────────────────────────────────────────────┤
                                                               "unir mensajes"(merge 3) → "ordenar mensajes" → "agregar mensajes" → "chat input"
"chat input" → "Analizar conversación" (clasificador) → "REGLAS" (switch 14 salidas)
   salidas 0,1,2,3,8,9,13 → "Date & Time" → "CONTEXTO_PRISMA" → "Memoria Lead" → "Armar_Memoria" → "Agente IA CEO"
   salidas 4,5,6,7,10,11,12 → SIN CONEXIÓN (silencio)
"Agente IA CEO"  [ai_languageModel 0: "OpenAI Chat Model" | 1: "Anthropic Chat Model"] [ai_memory: "Memoria"]
                 [ai_tool: "Conocimiento_Contexto", "Cartera_Propiedades", "Gestion_Handoff", "Aviso_Asesor"]
   → "Normalizar_Salida_Agente" → "Formato_Mensajes" [LLM "OpenAI Chat Model5"; parser "Auto-fixing Output Parser1"
                                   (LLM "OpenAI Chat Model6", parser "Structured Output Parser1")]
"Formato_Mensajes" out0 (éxito) → en paralelo:
   (a) "If - part_1" → cadena de envío (respuesta1…respuesta10, ver §7)
   (b) "Analizar_Conversacion" → "Actualizar_Etiquetas_Score"
   (c) "Historial_Conversacion_Lead" → "Analizar_Conversacion1" → "Execute a SQL query"
                                    → "Analizar_Conversacion2" → "Actualizar_Metricas2"
                                                               → "Confirmar_Visita_Calendario"
"Formato_Mensajes" out1 (error) → "No Operation, do nothing2" (silencio)
```

Nodos sueltos o apagados: "Gestion_Visita" (**disabled**, su `ai_tool` está vacío: `[[]]`), "Parsear mensaje"
(recibe el modelo "OpenAI Chat Model1" pero no sale hacia ningún nodo: huérfano).

---

## 1. Entrada

**"Webhook"** (`n8n-nodes-base.webhook` v2.1): `POST`, `path: "whatsapp-incoming"`, `options: {}`.
- **ACK:** no hay `responseMode` en el JSON, así que queda el default del nodo (responder al recibir).
  [PRISMA] `lib/whatsapp/n8nTrigger.ts` lo confirma: "n8n responde al webhook al instante (ACK) y devuelve la
  respuesta de la IA de forma asíncrona vía POST a /api/n8n/reply". PRISMA reintenta 3 veces (timeout 15 s)
  y si falla guarda en `wa_n8n_dead_letter`.
- **Autenticación del webhook:** ninguna (no hay `authentication` ni header check). Cualquiera con la URL dispara.

**"Set valores"** (Set) copia del payload:
| Campo que lee | Dónde lo deja |
|---|---|
| `body.agency_id` | `body.lead.agency_id` |
| `body.conversation_id` | `body.conversacion.conversation_id` |
| `body.contact_name` | `body.conversacion.contact_name` |
| `body.contact_phone` | `body.conversacion.contact_phone` |
| `body.message.content` / `.type` / `.received_at` | `body.conversacion.message.content/type/received_at` |
| `body.message_id` (id de la fila en `wa_messages`) | `body.conversacion.message.message_id` |
| `body.message.media?.id` (o `''`) | `body.conversacion.message.media_id` |
| `body.conversation` (objeto etiquetas/score/status/bot_active) | `body.conversacion.etiquetas` — **nadie lo lee después** |
| `body.history` (array) | `body.history` |
| `body.reply_url` | `body.reply_url` — **nadie lo usa** (los envíos van a una URL fija) |

[PRISMA] Payload que arma `app/api/webhooks/meta/route.ts` (líneas 297-345): `debug_v`, `webhook_event_id`,
`message_id`, `agency_id`, `conversation_id`, `contact_phone`, `contact_name`,
`message{id, content, type, wamid, received_at, media{id,mime_type,caption,voice}|null}`,
`conversation{etiquetas, score, status, bot_active}`, `history` (últimos 10 `wa_messages`, `{role, content, at}`,
de más viejo a más nuevo, **incluye el mensaje actual**), `reply_url`.
El de Evolution (`app/api/webhooks/evolution/route.ts` 352-395) agrega `instance_name`, `evolution_url`,
**no trae `message.media`**, y saca el mensaje actual del `history`.

**Validaciones / filtros dentro del flujo: NINGUNO.** No está en el flujo: chequeo de `bot_active`, `opt_out`,
internos, grupos, mensajes propios, duplicados, horario, agencia inexistente. Todo eso lo hace PRISMA antes:
- [PRISMA] `bot_active=false` → no dispara n8n; guarda el mensaje del lead en `n8n_chat_histories` (Meta route 358-379).
- [PRISMA] Gate de internos (`lib/whatsapp/gate-internos.ts`): si el teléfono es de un asesor/director de la agencia,
  no hay conversación ni n8n.
- [PRISMA] Dedupe por `wamid` en `wa_messages`. Evolution ignora `fromMe`. Meta ignora tipos distintos de
  text/image/audio/video/interactive (documentos, ubicación, stickers, reacciones **nunca llegan a n8n** por Meta).
- `opt_out`: ni PRISMA (Meta route) ni el flujo lo miran antes de responder.
- Grupos: el flujo no los filtra. [PRISMA] Evolution solo corta `remoteJid` por `@`; no vi filtro de `@g.us` en las líneas leídas.
- [PRISMA] `/api/n8n/reply` descarta la respuesta si al momento de enviar `bot_active` es false.

---

## 2. Ventana de espera / agrupado de mensajes (debounce)

Hecho con Redis (credencial `REDIS_PRISMA`), un `Switch` y un `Wait`:

1. **"push_mensajes"**: Redis `push`, `tail: true` (RPUSH) a la lista `{{conversation_id}}_buffer`, valor
   `JSON.stringify($('Set valores').first().json.body.conversacion.message)` (content, type, received_at, message_id, media_id).
2. **"get_mensajes"**: Redis `get` de la misma clave → `message` (array de strings JSON).
3. **"Switch"** (onError `continueRegularOutput`, retry):
   - out0 **"No hacer nada"**: `JSON.parse(message.last()).message_id != message_id de esta ejecución` → esta
     ejecución muere (la atiende la ejecución del mensaje más nuevo).
   - out1 **"Seguir"**: `DateTime.fromISO(último.received_at)` **before** `$now.minus(45,"seconds")` → procesa.
   - fallback **"Esperar"** → **"Wait"** `{"amount":45}` → vuelve a "get_mensajes".
4. **"Eliminar_Mensajes"**: Redis `delete` de `{{conversation_id}}_buffer`; pasa adelante el array leído en el paso 2.
5. "dividir mensajes" (splitOut `message`) → "JSON parse" → se procesa cada mensaje del lote.

- **Unidad del Wait:** el JSON no trae `unit`. La memoria del proyecto (`whatsapp-ventana-agrupa-mensajes.md`)
  dice que se midió en producción y son **segundos**. Latencia medida allí: p50 69 s, p90 84 s.
- `received_at` lo pone PRISMA (`new Date()` en Vercel) y se compara contra `$now` de n8n: depende de que los relojes coincidan.
- **Lock: no hay.** Ninguna clave `_lock` ni exclusión entre ejecuciones de la misma conversación.

**Carreras que se leen del diseño:**
- **Ejecuciones solapadas:** si el agente de la ejecución A tarda más de 45 s y llega un mensaje nuevo, la
  ejecución B arranca su propio agente mientras A todavía no guardó su respuesta en "Memoria" → respuestas
  duplicadas o repreguntas (la memoria del proyecto lo midió en ~2 % de las ejecuciones que llegan al agente).
- **Mensaje perdido entre "Seguir" y "Eliminar_Mensajes":** A lee el buffer, decide "Seguir"; si en ese instante
  B hace RPUSH, el DEL de A borra también el mensaje de B, pero A procesa solo lo que leyó antes. Cuando B
  despierta, el buffer está vacío: `message.last()` falla, y con `continueRegularOutput` el ítem sale por la
  primera salida ("No hacer nada") → el mensaje de B no se responde nunca. (Inferencia del diseño; no medido.)
- La latencia mínima es ~45 s aunque sea un solo mensaje (la primera pasada siempre cae en "Esperar").

---

## 3. Adjuntos

"tipo de mensaje" (Switch sobre `$('JSON parse').item.json.type`): `audio` → rama audio; `image` → rama imagen;
fallback `texto` → todo lo demás.

| Tipo | Qué hace |
|---|---|
| **Audio** | "Token_Meta_audio" (`SELECT token, phone_number_id FROM whatsapp_instances WHERE agency_id=$1 LIMIT 1`) → "Resolver_Media_audio" (`GET https://graph.facebook.com/v20.0/{media_id}` con Bearer) → "obtener audio" (descarga la `url`, respuesta binaria) → **"transcribir audio"** (nodo OpenAI `resource: audio, operation: transcribe`, `options: {}`: **el JSON no fija modelo**, toma el default del nodo; credencial `OPENAI_PRISMA`) → "contenido - audio": `<transcripcion del audio enviado por usuario> {texto o 'No se pudo transcribir el audio'} <.../>` |
| **Imagen** | "Token_Meta" → "Resolver_Media" → "obtener imagen" → **"analizar imagen"** (OpenAI `image/analyze`, modelo **`gpt-4.1-mini-2025-04-14`**, `detail: auto`, `maxTokens 4000`, entrada base64; prompt: "Describir detalladamente la imagen… extraer cuidadosamente cada número, fecha, nombre… NO inventar") → "contenido - imagen": `<descripcion imagen…> {descripción} <…/> \| <comentario imagen agregada por usuario> {caption, vacío si era 'Imagen recibida'} <…/>` |
| **Texto** (y todo lo demás: video, interactive, "other") | "set valores - texto": `<texto> {content} <text/>`. Un **video** llega solo como su caption o "Video recibido" ([PRISMA] Meta route 120). Por Evolution, todo lo no soportado llega como "Mensaje multimedia o no soportado". |
| **Documentos, ubicaciones** | **No está en el flujo.** [PRISMA] Meta los descarta antes de llamar a n8n. |

Luego "unir mensajes" (merge 3 entradas) → "ordenar mensajes" (por `created_at`, que viene de `received_at`) →
"agregar mensajes" (junta `content` en `mensajes`) → "chat input": `mensajes.join("\n")`. Ese string es lo que ve el agente.

- Ramas de audio/imagen **sin `onError`**: si falla Meta (token vencido, media borrada) la ejecución entera se
  cae y el lote completo queda sin respuesta.
- Por **Evolution** el payload no trae `media.id` → `media_id=''` → "Resolver_Media*" pide `graph.facebook.com/v20.0/`
  vacío → falla toda la ejecución para cualquier audio/imagen que entre por Evolution.

---

## 4. Memorias

Hay **cuatro** fuentes de "historia", distintas entre sí:

1. **"Memoria"** (`memoryPostgresChat` v1.3, credencial Postgres `MEMORIA_PRISMA`) conectada al agente:
   `sessionKey = conversation_id`, `contextWindowLength: 15`. No define `tableName` → usa la tabla default
   del nodo, `n8n_chat_histories` (la misma que leen "Historial_Conversacion_Lead" y los webhooks de PRISMA).
   Guarda el turno humano (el texto de "chat input" con el envoltorio "# Mensaje a responder del usuario") y la
   salida del agente.
2. **`body.history`** del payload (últimos 10 `wa_messages`): lo usan "Analizar conversación" (clasificador) y
   "Analizar_Conversacion" (etiquetas/score).
3. **"Historial_Conversacion_Lead"**: `SELECT` de `n8n_chat_histories WHERE session_id = conversation_id`,
   `limit 100`, **sin ORDER BY**. Lo usan "Analizar_Conversacion1" (filtra `type !== 'tool'`) y "Analizar_Conversacion2" (no filtra).
4. **MEMORIA DEL LEAD** (desde `wa_conversations.metricas`):
   - **"Memoria Lead"** (Postgres): `SELECT c.metricas, c.contact_name, p.email AS email_asesor_asignado,
     p.full_name AS nombre_asesor_asignado FROM wa_conversations c LEFT JOIN profiles p ON p.id=c.agent_id AND
     COALESCE(p.estado,'activo')='activo' WHERE c.contact_phone=$1 AND c.agency_id::text=$2 ORDER BY
     c.last_message_at DESC NULLS LAST LIMIT 1` (`alwaysOutputData`, onError continue).
   - **"Armar_Memoria"** (Code): arma `memoria_texto` con bloques: `YA SABEMOS` (los 11 del MÍNIMO con dato),
     `FALTA DEL MINIMO` (pendientes numerados, en orden: Nombre, Tipo de operación, Tipo de propiedad, Zona,
     Ambientes, Presupuesto, Urgencia, Necesita vender para comprar*, Crédito·etapa*, Acompañado por otro asesor,
     Hace cuánto busca; *solo compra: si la operación es alquiler/inversión van a "no aplican"), `OTROS`
     (criterios_duros, email, composición familiar, motivo, superficie mín., banco, preaprobado, apto crédito,
     experiencia, inversor — solo si hay dato), `NIVEL 3` (intereses, necesidades, amenities, servicios,
     cercanías, características), `ESTADO` (propiedad_interes, link_compartido, etapa, calificacion_completitud/11
     y calificado, "va un turno atrasada"), `ASESOR ASIGNADO A ESTA CONVERSACION` (si hay email), `YA MOSTRADAS`
     (direccion + url de `propiedades_mostradas`).
   - Se inyecta al final del system prompt: `{{ $('Armar_Memoria').item.json.memoria_texto || '(memoria no disponible…)' }}`.

**Nodo que EXTRAE/actualiza métricas: "Analizar_Conversacion1"**
- Modelo **`gpt-5.4-nano-2026-03-17`** (nodo OpenAI v2.1, Responses), `executeOnce`, `alwaysOutputData`, retry, onError continue.
- **Cuándo:** después de "Formato_Mensajes", en paralelo con el envío; o sea, **después** de la respuesta del turno
  (lo que extrae lo usa el turno SIGUIENTE).
- Entrada: `JSON.stringify` de las filas de "Historial_Conversacion_Lead" sin tool → `{content, type}`.
- Prompt resumido: analista de conversaciones inmobiliarias argentinas; solo JSON; null si no hay certeza
  ("el sistema NO pisa el valor previo con un null"); 26 reglas (moneda USD/ARS por contexto, urgencia
  inmediata/corto/medio/explorando y null si nunca habló de plazos, nombre, email, criterios_duros,
  propiedad_interes, link_compartido, propiedades_mostradas como objetos `{url,direccion,precio}` sacados de
  "Ficha completa:", etapa, necesita_vender, hace_cuanto_busca, acompanado_asesor, banco_credito, etapa_credito,
  calificacion_completitud 0-11 y calificado sí/parcial/no).
- Campos que devuelve (42): nombre, email, barrio_consultado, zona, tipo_operacion, tipo_propiedad,
  ambientes_buscados, superficie_min_m2, superficie_max_m2, presupuesto_min, presupuesto_max, moneda_presupuesto,
  criterios_duros, composicion_familiar, experiencia_compradora, motivo_busqueda, urgencia, es_inversor,
  tiene_preaprobacion_credito, banco_credito, etapa_credito, apto_credito, necesita_vender_para_comprar,
  hace_cuanto_busca, acompanado_asesor, calificacion_completitud, calificado, visita_agendada, reserva_confirmada,
  solicito_hablar_con_humano, fue_derivado_a_humano, cantidad_seguimientos_ia, etapa, propiedad_consultada,
  propiedad_interes, link_compartido, propiedades_mostradas, motivo_no_avance, intereses, necesidades,
  caracteristicas_propiedad, servicios_consultados, amenities_consultados, lugares_cercanos_buscados.
- Escritura: **"Execute a SQL query"**: `UPDATE public.wa_conversations SET metricas = COALESCE(metricas,'{}'::jsonb)
  || jsonb_strip_nulls($1::jsonb) WHERE contact_phone = $2;` con `$1` = texto del bloque `output_text`.
  **Filtra solo por teléfono, no por agencia.**

---

## 5. Clasificadores / enrutadores previos al agente

**"Analizar conversación"** (nodo OpenAI v1.8, `executeOnce`, retry, onError `continueRegularOutput`):
- Modelo **`gpt-4.1-2025-04-14`**, `temperature 0.2`, `jsonOutput: true`.
- Entrada: `HISTORIAL_CONVERSACION` = `body.history`, `MENSAJE_ACTUAL` = "chat input", `USER_ID` = agency_id.
- Prompt: "REGLA CERO — ante cualquier duda, RELEVANTE_MEDIA_PRIORIDAD". Paso 1 filtro de seguridad (10 etiquetas de
  bloqueo), Paso 2 "nunca bloquear" (link de portal, historial no vacío, cliente molesto, rubro, colega externo),
  Paso 3 comercial. Salida `{ "categoria_principal": "..." }`.
- No hay clasificador de idioma ni de intención aparte: **no está en el flujo**.

**"REGLAS"** (Switch v3.3, `executeOnce`, onError continue, sin fallback) lee `$json.message.content.categoria_principal`:
| Salida | Etiqueta | Destino |
|---|---|---|
| 0 | RELEVANTE_ALTA_PRIORIDAD | "Date & Time" → agente |
| 1 | RELEVANTE_MEDIA_PRIORIDAD | agente |
| 2 | SEMI_RELEVANTE_CONSULTIVA | agente |
| 3 | IRRELEVANTE_BENIGNO | agente |
| 4 | SPAM_COMERCIAL_EXTERNO | **sin conexión → silencio** |
| 5 | INGENIERÍA_SOCIAL_BÁSICA | **silencio** |
| 6 | INGENIERÍA_SOCIAL_AVANZADA | **silencio** |
| 7 | PROMPT_INJECTION_TÉCNICO | **silencio** |
| 8 | EXTRACCIÓN_DATOS_SENSIBLES | agente (aunque es de "bloqueo") |
| 9 | CONTENIDO_HOSTIL_DIRECTO | agente (aunque es de "bloqueo") |
| 10 | CONTENIDO_INAPROPIADO_CONTEXTUAL | **silencio** |
| 11 | SPAM_AUTOMATIZADO_AGRESIVO | **silencio** |
| 12 | SPAM_VISUAL_NO_RELEVANTE | **silencio** |
| 13 | INCOHERENTE_PATOLÓGICO | agente |

Silencio = no hay respuesta, no se registra nada, no corren las métricas. Si el clasificador falla o devuelve
una etiqueta que no está en la lista, **ninguna regla coincide y tampoco hay respuesta** (no hay fallback).

---

## 6. El agente principal: "Agente IA CEO"

- Tipo `@n8n/n8n-nodes-langchain.agent` v3, `promptType: define`, `hasOutputParser: false`, `needsFallback: true`,
  `options.maxIterations: 25`, `retryOnFail: true` (sin `maxTries`/`waitBetweenTries` explícitos → defaults de n8n), sin `onError`.
- **Modelo principal** (índice 0): "OpenAI Chat Model" → **`gpt-5.4-mini-2026-03-17`**, `maxTokens 8000`,
  `reasoningEffort: medium`, sin temperatura.
- **Fallback** (índice 1): "Anthropic Chat Model" → **`claude-sonnet-4-6`**, `maxTokensToSample 4000`,
  `temperature 0.3`, `thinking: false`, `topK -1`.
- **Memoria**: "Memoria" (§4.1).
- **User message** (`text`, 161 caracteres): `# Mensaje a responder del usuario:\n - Mensaje: {{ $('chat input').first().json.mensajes }}\n - Fecha actual: {{ $('Date & Time').item.json.formattedDate }}` ("Date & Time" = `$now` en formato `dd/MM/yyyy HH:mm:ss`).
- **System prompt**: `options.systemMessage`, **59.275 caracteres** (incluido el `=` inicial), 560 líneas,
  guardado textual en `prompt-agente-principal-n8n.md`. 30 expresiones `{{ }}`, 12 distintas:
  - de **"CONTEXTO_PRISMA"** (`whatsapp_ai_settings`): `bot_name` (3×), `company_name` (4×), `geographic_zone`,
    `tone`, `personality`, `language`, `working_hours` (2×).
  - de **"Set valores"**: `body.lead.agency_id` (6×), `body.conversacion.conversation_id` (6×), `body.conversacion.contact_phone` (3×).
  - de **"Armar_Memoria"**: `memoria_texto` (1×, con fallback de texto).
  - `$now.toLocal().format('dd/MM/yyyy HH:mm')` (1×).
- Secciones: IDENTIDAD Y ROL · PRECEDENCIA · OBJETIVO · REGLAS DE COMUNICACIÓN · INICIO DE CONVERSACIÓN ·
  ANTI-INVENCIÓN Y ANTI-REPETICIÓN · CALIFICACIÓN (MÍNIMO 11 campos, regla de insistencia 2 veces, RITMO) ·
  INTERPRETACIÓN DEL CLIENTE · FICHA DE UNA PROPIEDAD · ZONA DE BÚSQUEDA · RECOMENDACIÓN DE PROPIEDADES ·
  RESPONDER DUDAS (incluye NOTAS INTERNAS) · EXPENSAS Y CONDICIONES DE ALQUILER · PROPIEDAD COMPARTIDA POR LINK ·
  DESAMBIGUACIÓN · CRÉDITO HIPOTECARIO · COORDINAR VISITA (3 tiempos; nunca confirma) · FORMATO AVISO_ASESOR ·
  HANDOFF A HUMANO (+ REGLA DEL EMAIL DEL ASESOR) · COLEGA O INMOBILIARIA EXTERNA · BASE DE CONOCIMIENTO ·
  GESTIÓN DE VISITAS EXISTENTES · FORMATO DE SALIDA · CÓMO USAR MEMORIA DEL LEAD · MEMORIA DEL LEAD ·
  CONTEXTO DE EJECUCIÓN · checklist final "ANTES DE ENVIAR".
- **Formato de salida pedido:** `{"output":{"Mensaje":"…","Fecha":"…"}}`.

**Herramientas conectadas** (`toolWorkflow` v2.2). Todas con `workflowInputs.mappingMode: defineBelow` y
**schema vacío**: no hay parámetros tipados; el modelo manda un texto libre y el prompt le exige incluir
`agency_id:` y `conversation_id:` literales para que el subflujo los saque del texto.

| Nodo tool | Subflujo (id) | Descripción que ve el modelo | Texto que el prompt le manda a armar |
|---|---|---|---|
| "Cartera_Propiedades" | `NQtasQlz0N86Oxa6` "Cartera_Propiedades" | "llamar a esta herramientas para buscar información de propiedades según requerimientos del cliente. # importante enviar: Tipo_Operacion ("Alquiler"/"Venta"), Tipo_Propiedad, Comentarios sobre necesidades… *importante:* enviar agency_id:{{…}}, e identificador de la conversacion:{{…}}" | Búsqueda: `"[tipo] en [operación] en [lugar], [amb] ambientes, presupuesto hasta [monto] [moneda], [extras]. agency_id:…, conversation_id:…"`. Link: `"Información sobre la propiedad en [URL]. agency_id:…, conversation_id:…"` |
| "Conocimiento_Contexto" | `YMbDGxapNzpKgnqZ` "Conocimiento_Contexto" | "llamar a esta herramienta para acceder a conocimiento de contexto de la inmobiliaria. agency_id:{{…}} conversation_id:{{…}}" | `"[pregunta]. agency_id:…, conversation_id:…"` |
| "Gestion_Handoff" | `Xy0tpQWNwj5dVXSw` "Gestion_Handoff" | "Llamar a esta herramienta para transferir el cliente a un asesor humano. agency_id… conversation_id…" | Frase fija que el subflujo parsea: `"El usuario lead_id:{tel} quiere hablar con un humano porque [motivo]. Está interesado en la propiedad [dir]. El asesor asignado es email_asesor:…; nombre_asesor:…; celular_asesor:…. DATOS DEL LEAD: nombre:…; tipo_operacion:…; …; email:…. El id de la conversación es conversation_id:…. La inmobiliaria es agency_id:…."` |
| "Aviso_Asesor" | `bx5bqyUigVr3Hlvf` "Avisar_Asesor" | "Llamar para avisar al asesor sobre su cliente en dos casos: (1) consultó un link de una propiedad de su cartera, o (2) quiere visitar una propiedad y dejó su disponibilidad…" | Bloque base "DATOS DEL ASESOR… PROPIEDAD CONSULTADA… DATOS DEL LEAD…" + encabezado CASO LINK o CASO VISITA (+ DISPONIBILIDAD y CALIFICACION) |
| "Gestion_Visita" | `EnwkA8ZPyieCqLEo` | "Llamar a esta herramienta para agendar visita…" | **DISABLED y desconectado** |

---

## 7. Post-proceso de la respuesta

1. **"Normalizar_Salida_Agente"** (Code, sin onError): aplana la salida del agente (texto o lista de bloques de
   la Responses API), saca los ```json```, parsea `output.Mensaje`/`Fecha`. Si el JSON vino cortado rescata
   `"Mensaje"` con regex; si es prosa la manda tal cual. **Tira error** si no hay forma de leerlo o queda vacío →
   la ejecución se cae y no hay respuesta. Siempre sale `{output:{Mensaje, Fecha}}`.
2. **"Formato_Mensajes"** (chainLlm v1.5, `retryOnFail`, `alwaysOutputData`, onError **`continueErrorOutput`**):
   - LLM "OpenAI Chat Model5": `gpt-5.4-mini-2026-03-17`, `temperature 0.1`, `maxTokens 2048`.
   - Parser "Auto-fixing Output Parser1" (LLM "OpenAI Chat Model6": `gpt-5.4-mini-2026-03-17`, temp 0.1) sobre
     "Structured Output Parser1" (ejemplo de JSON con `response.part_1…part_9`).
   - Entrada: `respuesta a formatear : {{ $json.output.Mensaje }}`. El campo `Fecha` no se usa.
   - Prompt: "Sos un ROUTER de mensajes, no un redactor"; todo texto tiene que existir textual en el mensaje;
     prohibido inventar un CTA (`part_9` vacío si el agente no cerró con pregunta).
     - Caso A (sin propiedades): `part_1` 1er párrafo, `part_2` 2º, `part_7`/`part_8` siguientes, `part_9` pregunta/cierre final.
     - Caso B (con propiedades, máximo 3): `part_1`/`part_2` intro; `part_3`/`3.1`/`3.2` = URL tras "Foto: ";
       `part_4`/`4.1`/`4.2` = bloque completo de la propiedad sin la línea "Foto:"; `part_5`/`part_6` documento y
       descripción; `part_9` cierre.
     - Reglas duras: no reformatear la ficha ni tocar la URL de "Ficha completa:"; `part_3*` solo si empieza con
       `https://static.tokkobroker.com/` (si no, vacío y la línea "Foto:" queda dentro de `part_4*`); `part_5`
       solo `https://airtable.com/` o que contenga `googledrive`; las 13 claves siempre presentes.
   - Salida de error → "No Operation, do nothing2" → **el cliente no recibe nada** y no corren las métricas.
3. **Emojis:** el agente tiene prohibidos emojis y viñetas; el formateador no agrega nada. No hay post-proceso de emojis.

**Cómo se arma la salida (cadena secuencial, `Wait - N` = `amount: 2` entre mensajes):**
| Paso | Condición (If, `notEmpty`) | Wait | Envío | `reply` | `media_url` / `media_type` |
|---|---|---|---|---|---|
| 1 | "If - part_1": part_1 | — | "respuesta1" | part_1 | "" / text |
| 2 | "If - Parte 2": part_2 | "Wait - 2" | "respuesta2" | part_2 | "" / text |
| 3 | "If - Parte 3 + 4": part_3 **Y** part_4 | "Wait - 3 + 4" | "respuesta3" | part_4 (caption) | part_3.trim() / image |
| 4 | "If - Parte 3.1 + 4.1" | "Wait - 3.1 + 4.1" | "respuesta4" | part_4.1 | part_3.1 / image |
| 5 | "If - Parte 3.2 + 4.2" | "Wait - 3.2 + 4.2" | "respuesta5" | part_4.2 | part_3.2 / image |
| 6 | "If - Parte 5": part_5 | "Wait - 5" | "respuesta6" | part_5 (**la URL del documento, como texto**) | "" / text |
| 7 | "If - Parte 6" | "Wait - 6" | "respuesta7" | part_6 | "" / text |
| 8 | "If - Parte 7" | "Wait - 7" | "respuesta8" | part_7 | "" / text |
| 9 | "If - Parte 8" | "Wait - 8" | "respuesta9" | part_8 | "" / text |
| 10 | "If - Parte 9" | "Wait - 9" | "respuesta10" | part_9 | "" / text |

La rama "false" de cada If salta al siguiente If; la última termina en "No Operation, do nothing4"/"…1".

---

## 8. Envío

- Los 10 nodos "respuestaN" (HTTP v4.3, retry, onError continue) hacen `POST` a **`https://prisma.vakdor.com/api/n8n/reply`
  fija** (no usan `body.reply_url`). Payload:
  `{conversation_id: $('Webhook').item.json.body.conversation_id, reply, media_url, media_type, update_score: "", add_etiquetas: [], secret: "<secreto en texto plano>"}`.
  **No mandan `instance_name`**, así que el chequeo anti-cruce de PRISMA no se activa.
- El flujo **no** llama a Meta Cloud API ni a Evolution para responder; solo a PRISMA. (Sí llama a Graph API para bajar adjuntos, §3.)
- [PRISMA] `app/api/n8n/reply/route.ts`: valida `secret` contra `N8N_REPLY_SECRET`; lee `wa_conversations`; si
  `bot_active=false` descarta; busca `whatsapp_instances` por `conv.instance_id`; si es Evolution usa
  `sendText`/`sendMedia` con delay de tipeo (40 ms/carácter, entre 800 y 4000 ms, `presence: composing`); si no,
  Meta Graph `v20.0/{phone_number_id}/messages`. Escribe `wa_messages` (`content`, `role:'bot'`, `message_type`,
  `wamid`, `metadata{source:'n8n', sent_via, media_url}`) y `wa_conversations.last_message_at` (y `score`/`etiquetas`
  si vienen; desde este flujo nunca vienen). Emite broadcast `refresh-whatsapp` en `agency-{id}` y `active-agency-{id}`.

---

## 9. Handoff, aviso al asesor, visitas, cartera, conocimiento

| Qué | Dónde se dispara | Condición | Datos que pasan |
|---|---|---|---|
| Cartera | tool "Cartera_Propiedades" | **decisión del modelo** (prompt: condición mínima operación+tipo+zona+presupuesto; o link compartido apenas tiene el nombre; antes de handoff para conseguir `email_asesor`) | texto libre con criterios, agency_id, conversation_id |
| Conocimiento | tool "Conocimiento_Contexto" | modelo: preguntas sobre empresa, zonas, condiciones, servicios | pregunta + ids |
| Aviso al asesor | tool "Aviso_Asesor" | modelo: CASO LINK (apenas encuentra la propiedad del link con `email_asesor`, 1 vez por propiedad) y CASO VISITA (TIEMPO 3: mínimo cubierto, o el cliente cierra la charla, o pide humano) | bloque base + encabezado de caso (§6) |
| Handoff | tool "Gestion_Handoff" | modelo: pide humano, enojo sostenido, herramienta falla 2 veces, hipoteca/legal/técnico, negociar, colega externo, cambios en visitas existentes | frase parseable con lead_id, motivo, propiedad, asesor, datos del lead, ids |
| Agendar visita | "Gestion_Visita" | **apagado y desconectado** | — |
| Confirmar visita | "Confirmar_Visita_Calendario" (post-respuesta, **determinista sobre la salida de un LLM**) | `Analizar_Conversacion2` devolvió `visit_status = 'confirmed'` | UPDATE `scheduled_visits` (ver §10) |

- **En el flujo principal no hay handoff determinista**: todo depende de que el modelo llame a la herramienta.
  El flujo principal no escribe `bot_active` en ningún nodo.
- "Analizar_Conversacion2" (gpt-5.4-nano) detecta `opt_out`, `visit_status` (none/scheduled/confirmed/cancelled),
  `visit_scheduled_at`, `requires_follow_up` (false si hay visita o si hubo handoff explícito) y `justification`.
  Solo se usan `opt_out`, `requires_follow_up` y `visit_status==='confirmed'`; `visit_scheduled_at`, `scheduled`
  y `cancelled` no se escriben en ningún lado.

---

## 10. Escrituras a la base (todas con credencial Postgres `MEMORIA_PRISMA`, directo, sin pasar por la app)

| Nodo | Tabla → columnas | Filtro | Cuándo |
|---|---|---|---|
| "Memoria" (implícito del agente) | `n8n_chat_histories` (session_id, message) | session_id = conversation_id | cada turno del agente |
| "Actualizar_Etiquetas_Score" | `wa_conversations` → `score` (= `score_bant` 1-12), `etiquetas` (**reemplaza el array**) | `contact_phone` **(sin agencia)** | post-respuesta, desde "Analizar_Conversacion" |
| "Execute a SQL query" | `wa_conversations.metricas` (merge jsonb con strip_nulls) | `contact_phone` **(sin agencia)** | post-respuesta, desde "Analizar_Conversacion1" |
| "Actualizar_Metricas2" | `wa_conversations` → `opt_out`, `requires_follow_up` | `contact_phone` **(sin agencia)** | post-respuesta, desde "Analizar_Conversacion2" |
| "Confirmar_Visita_Calendario" | `scheduled_visits.estado_visita = 'confirmada'` | dígitos de `lead_id` = dígitos del teléfono, `agency_id`, `estado_visita IN ('agendada','reprogramada')`, y visit_status='confirmed' | post-respuesta |
| Redis "push_mensajes"/"Eliminar_Mensajes" | lista `{conversation_id}_buffer` | — | entrada |

"Analizar_Conversacion" (etiquetas/score): `gpt-5.4-nano-2026-03-17`, prompt "hasta 8 etiquetas snake_case
(intención, tipo, zona, presupuesto, urgencia, objeciones, estado, perfil lead_hot/warm/cold) + score BANT 1-12",
entrada `body.history`. Lecturas: `whatsapp_ai_settings`, `whatsapp_instances` (x2), `wa_conversations`+`profiles`, `n8n_chat_histories`.
Por su lado, PRISMA escribe `wa_messages` y `last_message_at` en `/api/n8n/reply` (§8).

---

## 11. Manejo de errores

- **Sin `errorWorkflow`.** Ninguna rama avisa a nadie cuando algo falla.
- **Si falla, la ejecución se cae (sin `onError`):** "Webhook", "Set valores", nodos Redis, "Wait", "dividir mensajes",
  "JSON parse", "tipo de mensaje", toda la rama audio/imagen, merge/sort/aggregate, "chat input", "Date & Time",
  **"Agente IA CEO"** (tiene retry), **"Normalizar_Salida_Agente"** (tira error a propósito). Resultado: el lote
  queda sin respuesta, sin aviso.
- **Silencio controlado:** "Formato_Mensajes" falla → "No Operation, do nothing2"; "REGLAS" sin coincidencia o
  salida desconectada; "Switch" con error cae en la salida 0 "No hacer nada".
- **`continueRegularOutput`** (el error pasa como si nada): "Switch", "REGLAS", "Analizar conversación",
  "CONTEXTO_PRISMA", "Memoria Lead", "Armar_Memoria", "Structured Output Parser1", "respuesta1…10", los 3
  analizadores post-respuesta y sus 4 escrituras. Si "respuestaN" falla, sigue con la parte siguiente: el
  cliente puede recibir un mensaje partido.
- **Reintentos** (`retryOnFail` sin valores explícitos → defaults de n8n): "Analizar conversación", "Agente IA CEO",
  "Structured Output Parser1", "Formato_Mensajes", "CONTEXTO_PRISMA", "Switch", "respuesta1…10",
  "Analizar_Conversacion", "Analizar_Conversacion1", "Analizar_Conversacion2", "Historial_Conversacion_Lead".
- **Salida mal formada del modelo:** agente → "Normalizar_Salida_Agente" (rescate por regex o prosa);
  formateador → "Auto-fixing Output Parser1" (re-pide al LLM); métricas → si el JSON no parsea, el `::jsonb`
  o `parseJson()` fallan y el update se pierde en silencio.
- **Fallback de modelo:** solo en el agente (OpenAI → Anthropic). El clasificador, el formateador y los analizadores no tienen.
- [PRISMA] Del lado de entrada hay reintentos + `wa_n8n_dead_letter`; del lado de salida, `/api/n8n/reply` devuelve 4xx/5xx y n8n lo ignora (onError continue).

---

## 12. Configuración por agencia (qué lo hace multi-agencia)

- `agency_id` viene en el payload y se propaga a todo.
- **"CONTEXTO_PRISMA"**: `SELECT * FROM whatsapp_ai_settings WHERE agency_id = … LIMIT 1` (`alwaysOutputData`).
  El prompt usa **7 columnas**: `bot_name`, `company_name`, `geographic_zone`, `tone`, `personality`, `language`,
  `working_hours`. Por eso es "Sofía" o "Lara": **ninguno de esos nombres está en el JSON** (0 coincidencias con
  "Sofía", "Lara", "Central", "VAKDOR"). Si la tabla tiene otras columnas (p. ej. un prompt propio), el flujo no las lee.
- **"Token_Meta"/"Token_Meta_audio"**: token de `whatsapp_instances` por agencia (`LIMIT 1`), solo para bajar adjuntos.
- **"Memoria Lead"**: métricas y asesor asignado por teléfono + agencia.
- Las herramientas reciben `agency_id` dentro del texto.
- **Igual para todas las agencias:** el prompt de 59 K (solo cambian las 7 variables), los modelos, el clasificador,
  el formateador (atado a fotos de Tokko), las credenciales (una sola `OPENAI_PRISMA`, una `Anthropic account`,
  un Postgres, un Redis), la URL y el secreto de respuesta.

---

## 13. Lo raro o frágil

1. **Sin lock por conversación** → respuestas solapadas/duplicadas (§2) y posible mensaje perdido entre "Seguir" y el DEL.
2. **Tres UPDATE de `wa_conversations` filtran solo por `contact_phone`** ("Actualizar_Etiquetas_Score",
   "Execute a SQL query", "Actualizar_Metricas2"): si el mismo número habla con dos agencias (o hay más de una
   fila), se pisan las métricas, etiquetas, opt_out y score de TODAS.
3. **"Historial_Conversacion_Lead": `limit 100` sin ORDER BY** → en conversaciones largas los analizadores pueden
   ver solo las primeras 100 filas y dejar de actualizar las métricas (inferencia: depende del orden físico).
4. **Fotos atadas a Tokko:** "Formato_Mensajes" solo acepta `part_3*` si la URL empieza con `https://static.tokkobroker.com/`;
   si no, deja `part_3` vacío y "If - Parte 3 + 4" exige `part_3` **Y** `part_4` → **la ficha entera no se envía**
   (se pierde, no queda como texto). Afecta a cualquier agencia o propiedad que no sea de Tokko.
5. **El documento (`part_5`) se manda como texto** con `media_type: text` en "respuesta6", no como archivo.
   `part_5` solo acepta airtable/googledrive: rastro de otro negocio (administración de alquileres).
6. **"Structured Output Parser1" contradice al prompt del formateador:** su ejemplo dice `part_9: "Call to action
   (Invitación a agendar visita…)"`, `part_3` "Obligatorio", `part_5` "Contrato, Comprobante de pago o Factura…
   inquilino". El auto-fixer ve esas descripciones.
7. **REGLAS:** 7 salidas desconectadas (silencio total, sin registro) y sin fallback; en cambio EXTRACCIÓN_DATOS_SENSIBLES
   y CONTENIDO_HOSTIL_DIRECTO, que el clasificador describe como bloqueo, sí pasan al agente.
8. **Secreto de `/api/n8n/reply` en texto plano**, repetido en los 10 nodos; URL de producción fija (ignora `reply_url`);
   webhook de entrada sin autenticación.
9. **Evolution + adjuntos:** sin `media.id` en el payload, cualquier audio/imagen de Evolution hace caer la ejecución (§3).
10. **Lectura frágil de la Responses API:** "Analizar_Conversacion", "Actualizar_Etiquetas_Score",
    "Actualizar_Metricas2" y "Confirmar_Visita_Calendario" leen `output[0].content[0].text`; si el primer elemento
    es un bloque de razonamiento, falla (y cae en silencio por `continueRegularOutput`). "Execute a SQL query" sí
    busca con `find(type==='message')`.
11. **SQL armado por interpolación de texto** en "Confirmar_Visita_Calendario" (teléfono, agency_id y el
    `visit_status` que devuelve el LLM van dentro del string SQL).
12. **Reintento del agente = efectos duplicados:** `retryOnFail` en "Agente IA CEO" vuelve a correr las
    herramientas (un aviso o handoff puede salir dos veces). Igual con "respuestaN": un timeout con reintento puede
    duplicar el mensaje de WhatsApp.
13. **Etiquetas pisadas:** "Actualizar_Etiquetas_Score" reemplaza el array `etiquetas` entero en cada turno
    (si el panel de PRISMA usa esa columna para etiquetas manuales, se borran). El `score` BANT es 1-12, mientras
    `/api/n8n/reply` documenta `score` 0-100.
14. **Caché del prompt:** el comentario del prompt dice "todo lo de arriba es estático y cachea", pero
    `conversation_id` y `agency_id` aparecen desde la sección RECOMENDACIÓN (línea ~251 del prompt), y `bot_name`/
    `company_name` en la primera línea: el prefijo cacheable es por agencia y, pasada la mitad, por conversación.
15. **Si una agencia no tiene fila en `whatsapp_ai_settings`**, el prompt sale "Sos , asistente de  en ." (no hay valores por defecto).
16. **Dos fechas distintas:** user message `dd/MM/yyyy HH:mm:ss` ("Date & Time") vs system `dd/MM/yyyy HH:mm` (`$now`);
    `Fecha` de la salida del agente no la usa nadie.
17. **Restos:** "Parsear mensaje" + "OpenAI Chat Model1" huérfanos; "Gestion_Visita" apagado; `body.conversacion.etiquetas`
    y `body.reply_url` sin uso; mezcla de `$('Webhook')` y `$('Set valores')` para el mismo `conversation_id`;
    "respuesta1-3" usan `.first()` y "respuesta4-10" `.item`.
18. **Métricas un turno atrasadas** por diseño (se extraen después de responder) y en carrera con el próximo mensaje:
    si el lead escribe rápido, "Memoria Lead" puede leer antes de que termine "Execute a SQL query".
19. **Tools sin schema:** los ids viajan dentro de texto libre; si el modelo los copia mal, el subflujo busca en otra
    agencia o no encuentra nada (el prompt lo advierte: "si no van exactos la búsqueda falla").
20. **Supuestos de Argentina / Central dentro del prompt "genérico":** rioplatense, expensas "pedido expreso de la
    inmobiliaria", ejemplos de Belgrano/Núñez, fichas de Tokko, portales argentinos en el clasificador.
