# Inventario de los subflujos del bot de WhatsApp (n8n)

Fuente: los exports en `C:\Users\LENOVO\Desktop\CODE\Antigravity - Apps\PRISMA-SYSTEM-superagente\scratch\n8n-bot\`
(copiados el 15/9/2026 a las 17:34). Leídos con node siguiendo `connections` a partir del disparador.
Todo lo que sigue sale del JSON; lo que no está en el flujo figura como **"no está en el flujo"**.
Las inferencias sobre cómo se comporta n8n aparecen marcadas como **(comportamiento de n8n)**.

| Subflujo | id n8n | Última edición (`updatedAt`) | Nodo en PRISMA | ¿Conectado al agente principal? |
|---|---|---|---|---|
| Gestion_Handoff | `Xy0tpQWNwj5dVXSw` | 2026-09-03 14:21 UTC | "Gestion_Handoff" | Sí |
| Avisar_Asesor | `bx5bqyUigVr3Hlvf` | 2026-09-03 14:21 UTC | "Aviso_Asesor" | Sí |
| Cartera_Propiedades | `NQtasQlz0N86Oxa6` | 2026-08-25 21:23 UTC | "Cartera_Propiedades" | Sí |
| Conocimiento_Contexto | `YMbDGxapNzpKgnqZ` | 2026-07-30 18:01 UTC | "Conocimiento_Contexto" | Sí |
| Gestion_Visita | `EnwkA8ZPyieCqLEo` | 2026-07-02 11:40 UTC | "Gestion_Visita" | **No: está DESACTIVADO y sin conexión** (`ai_tool: [[]]`) |

## Lo que comparten los cinco

- **Cómo se disparan.** Siempre igual. En PRISMA cada uno es un nodo `toolWorkflow` v2.2, que el
  "Agente IA CEO" usa como herramienta, con `workflowInputs` vacío. En el subflujo, el disparador es "When Executed by Another Workflow"
  (`executeWorkflowTrigger` v1.1) con `inputSource: "passthrough"`. **Lo único que llega es un campo `query` de
  texto libre, escrito por el modelo.** Todos los IDs (agency_id, conversation_id, lead_id, email del
  asesor) viajan metidos en ese texto y el subflujo los saca con expresiones regulares.
- **Base de datos.** Todos usan la credencial Postgres `MEMORIA_PRISMA` (id `Vje6BCZn5QY9nNWy`), una
  conexión directa. No pasan por la API de Supabase.
- **Modelos.** Cuando hay IA, es OpenAI con la credencial `OPENAI_PRISMA` (id `sELIerYlyCiF7cB2`). Ningún
  subflujo configura temperatura, máximo de tokens ni máximo de iteraciones (`options: {}`), así que usan
  los valores por defecto. Como comparación, los modelos del flujo PRISMA sí fijan `temperature: 0.1` o `reasoningEffort`.
- **Sin descripción de herramienta.** Ninguna herramienta interna de los subflujos tiene descripción para el
  modelo (`toolDescription`): no está en el flujo.
- **Claves escritas en el flujo.** La API key de Resend (`re_6P5m…`) aparece dos veces, en Gestion_Handoff y en
  Avisar_Asesor. El secreto del extractor (`x-extractor-secret: Leito…`) está en Cartera_Propiedades.
  Acá van tapadas a propósito.

---

## 1. Gestion_Handoff (12 nodos)

### 1.1 Qué hace
Cuando el cliente pide hablar con una persona, apaga el bot en esa conversación y le manda un email
al asesor de la propiedad. Si no hay asesor, se lo manda al director de la agencia. Deja el aviso anotado en el
chat y en la bitácora del cliente.

### 1.2 Entrada
- Es la herramienta "Gestion_Handoff" del agente principal. La descripción que ve el modelo es:
  ```
  Llamar a esta herramienta para transferir el cliente a un asesor humano.
  agency_id:{{ $('Set valores').item.json.body.lead.agency_id }}
  conversation_id:{{ $('Set valores').item.json.body.conversacion.conversation_id }}
  ```
- El formato del `query` no está en la herramienta. Lo fija el system prompt del "Agente IA CEO", sección
  `# HANDOFF A HUMANO`, y exige mantener intactas las frases que el subflujo busca:
  ```
  El usuario lead_id:<contact_phone> quiere hablar con un humano porque [motivo]. Está interesado en la propiedad [dirección]. El asesor asignado es email_asesor:[...]; nombre_asesor:[...]; celular_asesor:[...]. DATOS DEL LEAD: nombre:[...]; tipo_operacion:[...]; tipo_propiedad:[...]; zona:[...]; ambientes_buscados:[...]; presupuesto:[...] [moneda]; criterios_innegociables:[...]; etapa:[...]; necesita_vender_para_comprar:[...]; credito:[...]; email:[...]. El id de la conversación es conversation_id:<uuid>. La inmobiliaria es agency_id:<uuid>.
  ```
- Campos que se extraen en "extraer_info": `agency_id` (si no aparece queda `"default_session"`), `lead_id`
  (regex `lead_id:(\d+)`), `conversation_id`, `direccion`, `motivo`, `email_asesor`, `nombre_asesor`,
  `celular_asesor`, `lead_nombre`, `lead_email`, `lead_tipo_op`, `lead_tipo_prop`, `lead_zona`, `lead_ambientes`,
  `lead_presupuesto`, `lead_criterios`, `lead_etapa`, `lead_vender`, `lead_credito`.

### 1.3 Pasos, en orden
1. "When Executed by Another Workflow": recibe `query`.
2. "extraer_info" (Code): parsea el texto, arma el asunto `Un cliente pide atención · <dirección>` y el HTML
   del email con dos tarjetas: "Propiedad consultada" y "Qué necesita el cliente". También arma un
   `resend_body`, que después **no se usa**.
3. "Buscar_agent_id" (Postgres select): busca en `profiles` la fila cuyo `email` coincide con `email_asesor`, con `LIMIT 1`.
4. "valores" (Set): junta query, agency_id, lead_id, conversation_id, email_asesor, `agent_id` (= `profiles.id`) y
   `nombre_asesor` (= `profiles.full_name`).
5. "Buscar_director_fundador" (Postgres SQL): busca el director dueño de la agencia.
6. "Destinatario" (Code): decide a quién mandar y si el envío se programa para más tarde.
7. "Hay_email_asesor" (IF): `email_destino` contiene "@".
   - **Sí**: "Enviar_Email_Resend", luego "Anotar_Email_En_Bitacora", luego "DERIVAR_CONVERSACION".
   - **No**: va directo a "DERIVAR_CONVERSACION".
8. "DERIVAR_CONVERSACION" (Postgres SQL): apaga el bot.
9. "AVISAR_MENSAJE_INTERNO" (Postgres insert): mensaje interno en el chat.
10. "respuesta" (Code): arma la salida determinista.

### 1.4 Modelos de IA
No tiene. El comentario en "respuesta" dice que este nodo "Reemplaza al AI Agent". Todo el subflujo es determinista.

### 1.5 Consultas a la base
- "Buscar_agent_id": `SELECT * FROM public.profiles WHERE email = <email_asesor> LIMIT 1`, generado por el
  nodo. **No filtra por agencia.**
- "Buscar_director_fundador":
  ```sql
  SELECT p.email, p.full_name
  FROM public.agencies a
  JOIN public.profiles p ON p.id = a.owner_id
  WHERE a.id::text = $1
    AND p.role = 'director'
    AND COALESCE(p.estado,'activo') = 'activo'
  LIMIT 1;            -- $1 = valores.agency_id
  ```

### 1.6 Escrituras y llamadas externas
- **`wa_conversations`**, en "DERIVAR_CONVERSACION". Corre **siempre**, haya habido email o no:
  ```sql
  UPDATE public.wa_conversations
  SET bot_active = false,
      agent_id   = COALESCE(NULLIF($2::text, 'ninguno')::uuid, agent_id)
  WHERE id = $1::uuid
  RETURNING id, contact_phone, agent_id, bot_active;
  -- $1 = conversation_id ; $2 = agent_id del asesor o 'ninguno'
  ```
  Si no encontró asesor, deja el `agent_id` que ya tenía la conversación. Cuando el aviso va al director, no le asigna la conversación.
- **`wa_messages`**, en "AVISAR_MENSAJE_INTERNO". Inserta `conversation_id`, `agency_id`,
  `content = "⚠️ Handoff activado: El bot se ha desactivado."`, `role = "internal"`, `message_type = "text"`.
- **`lead_eventos`**, en "Anotar_Email_En_Bitacora". Solo corre en la rama con email, después del POST a Resend:
  ```sql
  INSERT INTO public.lead_eventos (agency_id, conversation_id, tipo, actor, descripcion, datos)
  VALUES ($1::uuid, $2::uuid,
    CASE WHEN $6 <> '' THEN 'aviso_equipo' ELSE 'aviso_fallido' END, 'bot',
    CASE
      WHEN $6 <> '' AND $8 <> '' THEN 'Email de aviso al ' || $3 || ' programado para las 6:00 (llegó de madrugada): «' || $4 || '»'
      WHEN $6 <> '' THEN 'Se le avisó por email al ' || $3 || ': «' || $4 || '»'
      ELSE 'NO se pudo enviar el email de aviso al ' || $3 || ' («' || $4 || '»)'
    END,
    jsonb_build_object('canal','email','origen','n8n_handoff','detalle',$3,'email',$5,'resend_id',nullif($6,''),'error',nullif($7,''),'programado_para',nullif($8,'')))
  RETURNING id;
  -- $1 agency_id, $2 conversation_id, $3 aviso_para (asesor|director), $4 asunto, $5 email_destino,
  -- $6 id de Resend, $7 mensaje de error, $8 scheduled_at
  ```
- **Email (Resend)**, en "Enviar_Email_Resend": `POST https://api.resend.com/emails`, con `Authorization: Bearer re_…`
  escrito en el nodo.
  - Remitente: `PRISMA IA <no-reply@vakbot.vakdor.com>`.
  - Destinatario: el asesor, si su email es válido; si no, el director fundador.
  - Asunto: `Un cliente pide atención · <dirección>` para el asesor, o `Un cliente pide atencion y no tiene asesor
    asignado` para el director. En ese caso además se agrega arriba del cuerpo el aviso "Te llega a vos como director de la agencia".
  - Botón: "Atender ahora", que lleva a `https://prisma.vakdor.com` (portada de la app, no la conversación).
  - Horario: si en Argentina son entre las 23:00 y las 6:00 (calculado como UTC-3 fijo), manda
    `scheduled_at` para programar el email a las 6:00.
- WhatsApp: no manda nada. No usa plantillas, ni Evolution, ni Meta.

### 1.7 Salida
Lo que devuelve "respuesta" es exactamente esto:
```json
{ "respuesta": "<texto para el agente>", "exito_total": bool,
  "resultado_derivacion": "ok | no se derivo la conversacion",
  "resultado_aviso_interno": "ok | no se registro el mensaje interno",
  "resultado_aviso_email": "ok (asesor|director) | Resend no devolvio id | no se ejecuto el envio | sin destinatario: ...",
  "aviso_para": "asesor | director | nadie", "asesor": "<email destino>" }
```
`respuesta` toma uno de tres textos fijos:
- Si se derivó y salió el email: "Derivacion exitosa. Informar al cliente que se estaran comunicando a la brevedad."
- Si se derivó pero no salió el email: "…no se pudo avisar por email a nadie. No le prometas al cliente que lo van a contactar…".
- Si no se derivó: "No se pudo completar la derivacion…".

### 1.8 Qué se decide con reglas y qué con IA
Todo es con reglas:
- El email es válido si cumple `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`. Si el del asesor lo es, va al asesor; si no, al director; si tampoco hay, a nadie.
- El IF pregunta si hay "@" en el destino.
- La franja de 23 a 6 se calcula en código.

La IA solo interviene antes, en el agente principal, que decide cuándo derivar y escribe el texto de entrada.

### 1.9 Multi-agencia
- Por agencia lee `agencies.owner_id`, que es el director fundador.
- Hardcodeado: el remitente, la marca "PRISMA IA" y el link `prisma.vakdor.com` son iguales para todas las
  agencias, y el nombre de la agencia no aparece en el email. La hora de Argentina está fija en UTC-3, lo que choca con un mercado LATAM.
  La key de Resend es única.
- El asesor se busca **por email en toda la tabla `profiles`, sin filtrar por agencia**.

### 1.10 Frágil o raro
- **Los errores cortan el subflujo.** "DERIVAR_CONVERSACION" y "AVISAR_MENSAJE_INTERNO" no tienen `onError`. Si
  `conversation_id` llega vacío (`''::uuid`) o `agency_id` es `"default_session"`, el subflujo falla entero y el
  agente recibe un error, no el JSON de "respuesta".
- **El orden es arriesgado.** Primero se manda el email y recién después se apaga el bot. Si el UPDATE falla, el asesor ya
  recibió el aviso pero el bot sigue hablando.
- **Teléfonos con "+".** `lead_id:(\d+)` no admite un "+" ni un espacio después de los dos puntos. Si `contact_phone` viene
  con "+", `lead_id` queda vacío. El formato real de `contact_phone` no está en el flujo. Avisar_Asesor usa otra regex más tolerante.
- **Saludo equivocado.** Cuando el aviso va al director, el saludo sigue diciendo "Hola <nombre_asesor>" con lo que haya escrito el
  agente. Se calcula `nombre_destinatario` pero nunca se usa en el HTML.
- **Código que sobra.** Hay piezas que se calculan y no se usan: `resend_body` en "extraer_info" y `nombre_asesor`/`agent_id` repetidos en "valores".
  Dos campos del Set se llaman `=conversation_id` y `=email_asesor`, con un "=" adelante. Funciona, pero es raro.
- **HTML sin escapar.** Los valores que escribe el modelo se meten en el HTML tal cual.
- **Motivo cortado.** `motivo` se corta en el primer "."; el prompt pide que el motivo no lleve puntos.

---

## 2. Avisar_Asesor (9 nodos). En PRISMA la herramienta se llama "Aviso_Asesor"

### 2.1 Qué hace
Le manda un email al asesor de una propiedad en dos casos: cuando un cliente consultó por un link de su cartera
(el email dice "Nuevo interesado") o cuando quiere visitarla y dejó su disponibilidad. No repite el mismo aviso
por la misma propiedad dentro de las 24 horas.

### 2.2 Entrada
- Es la herramienta "Aviso_Asesor". La descripción que ve el modelo es:
  ```
  Llamar para avisar al asesor sobre su cliente en dos casos: (1) consultó un link de una propiedad de su cartera, o (2) quiere visitar una propiedad y dejó su disponibilidad para que el asesor coordine.

  agency_id:{{ ...lead.agency_id }}
  conversation_id:{{ ...conversacion.conversation_id }}
  ```
- El formato del `query` lo fija el prompt principal, sección `# FORMATO AVISO_ASESOR`. Tiene un BLOQUE BASE con `DATOS DEL
  ASESOR`, `PROPIEDAD CONSULTADA` y `DATOS DEL LEAD`. Para el caso LINK lleva otro encabezado; el caso VISITA suma
  `MOTIVO`, `DISPONIBILIDAD DEL CLIENTE` y `CALIFICACION`. El prompt pide escribir "no registrado" en cada campo que falte.
- Campos que se extraen en "extraer_agency_id":
  - IDs: `extracted_agency_id` (si falta, `"default_session"`), `extracted_conversation_id` (si falta, `"default_conversation"`) y `lead_id` (`[0-9+]{6,}`).
  - Asesor: email, nombre y celular.
  - Propiedad: `prop_direccion` (es la única que no corta en ". "), `prop_precio`, `prop_ambientes`, `prop_dormitorios`, `prop_banos`,
    `prop_apto_credito` y `prop_ficha` (la primera URL del texto).
  - Lead: nombre, email, tipo_op, tipo_prop, zona, ambientes (primero `ambientes_buscados`, si no, "ambientes" dentro del bloque
    DATOS DEL LEAD), presupuesto, criterios, etapa, vender, credito, acompanado, hace_cuanto y calificado.
  - Visita: `es_visita`, `disponibilidad`, `visita_fecha` y `visita_hora`.

### 2.3 Pasos, en orden
1. "When Executed by Another Workflow".
2. "extraer_agency_id" (Code): parsea, detecta si es una visita con una regex, arma el asunto y un HTML distinto
   para cada caso, calcula `scheduled_at` y arma `resend_body_final`.
3. "Buscar_agent_id" (Postgres select): trae de `profiles` la fila con ese `email = email_asesor`.
4. "DERIVAR_CONVERSACION" (Postgres update sobre `wa_conversations`).
5. "Reservar_Aviso" (Postgres SQL): es el candado de 24 horas.
6. "Hay_email_asesor" (IF): `email_asesor` no está vacío **y** "Reservar_Aviso" devolvió un `id`.
   - **Sí**: "Enviar_Email_Resend", luego "Anotar_Email_En_Bitacora", luego "respuesta".
   - **No**: va directo a "respuesta".
7. "respuesta" (Code).

### 2.4 Modelos de IA
No tiene. Es determinista.

### 2.5 Consultas a la base
- "Buscar_agent_id": `SELECT * FROM public.profiles WHERE email = <email_asesor> LIMIT 1`. **No filtra por agencia.**

### 2.6 Escrituras y llamadas externas
- **`wa_conversations`**, en "DERIVAR_CONVERSACION". Es un UPDATE que busca la fila por `id = extracted_conversation_id` y pone
  **`bot_active = true`** y `agent_id = Buscar_agent_id.id ?? null`. Corre siempre que "Buscar_agent_id" haya devuelto
  una fila. A pesar del nombre, **no deriva nada: vuelve a prender el bot y asigna el asesor.**
- **`wa_conversations.metricas`**, en "Reservar_Aviso". Corre antes del envío:
  ```sql
  UPDATE public.wa_conversations
  SET metricas = COALESCE(metricas,'{}'::jsonb) || jsonb_build_object('ultimo_aviso',
        jsonb_build_object('caso', $1, 'prop', $2, 'at', now()))
  WHERE id = $3::uuid
    AND NOT ( COALESCE(metricas->'ultimo_aviso'->>'caso','') = $1
          AND lower(COALESCE(metricas->'ultimo_aviso'->>'prop','')) = lower($2)
          AND $2 <> ''
          AND (metricas->'ultimo_aviso'->>'at')::timestamptz > now() - interval '24 hours' )
  RETURNING id;
  -- $1 = 'visita' | 'link' ; $2 = prop_direccion ; $3 = conversation_id
  ```
- **`lead_eventos`**, en "Anotar_Email_En_Bitacora". Es el mismo INSERT que en Handoff, con
  `origen = 'n8n_avisar_asesor'` y `detalle = 'coordinar_visita' | 'consulta_propiedad'`. La descripción siempre dice "al asesor".
- **Email (Resend)**: `POST https://api.resend.com/emails`, con la misma key escrita en el nodo.
  - Remitente: `PRISMA IA <no-reply@vakbot.vakdor.com>`.
  - Destinatario: `to: [email_asesor]`, tal cual lo escribió el agente.
  - Asunto: `Quiere visitar: <dirección>` en el caso visita, y `Nuevo interesado en tu propiedad: <dirección | consulta>` en el caso link.
  - Botón: "Coordinar la visita" o "Ir al sistema", con link directo a `https://prisma.vakdor.com/asesor/leads-whatsapp/<conversation_id>`.
  - En el email, los campos vacíos del lead aparecen en rojo como "no registrado".
  - Tiene la misma regla de 23 a 6 con `scheduled_at` que Handoff.
- WhatsApp: no manda nada.

### 2.7 Salida
La devuelve "respuesta":
- Caso normal: `{ "email_enviado": bool, "conversacion_derivada": bool, "asesor": "<email>", "asunto": "<asunto>", "motivo"?: "<por qué falló>" }`.
- Caso duplicado (la reserva no devolvió id): `{ "email_enviado": true, "ya_avisado": true, "conversacion_derivada": true, "asesor", "asunto",
  "nota": "El asesor ya fue avisado por esta propiedad en las ultimas 24 horas; no se reenvio el email." }`. El código
  explica que se responde "éxito" **a propósito**, para que el agente no reintente ni derive.

### 2.8 Qué se decide con reglas y qué con IA
Todo es con reglas:
- Si es visita o link lo decide la regex de `esVisita`.
- El candado es de 24 horas por conversación, caso y dirección.
- El IF exige email no vacío y la reserva ganada.
- La franja de 23 a 6 se calcula en código.

La IA solo decide en el agente principal cuándo llamar a la herramienta y qué escribirle.

### 2.9 Multi-agencia
- Por agencia no lee nada. `agency_id` se usa solo para la bitácora.
- **No hay plan B si falta el asesor**: a diferencia de Handoff, acá no se avisa al director.
- Tiene los mismos hardcodeos que Handoff: remitente, marca, dominio, UTC-3 y key de Resend. `profiles` se busca por email en todas las agencias.

### 2.10 Frágil o raro
- **Se corta en silencio si no encuentra al asesor (comportamiento de n8n).** "Buscar_agent_id" no tiene `alwaysOutputData`. Si el email no está en
  `profiles` (por ejemplo, porque llegó "no registrado"), el nodo no devuelve filas y la rama se corta. No se manda el email, no se anota
  nada y el agente no recibe el JSON de "respuesta".
- **Un error de base se informa como éxito.** Si "Reservar_Aviso" falla (por ejemplo, porque la conversación llegó como
  `"default_conversation"` y no es un uuid), el nodo sigue por `alwaysOutputData` sin `id`. Entonces "respuesta"
  contesta `ya_avisado: true` y `email_enviado: true`, **aunque no se haya mandado nada**.
- **El candado se pone antes de enviar.** Si Resend falla, cualquier reintento dentro de las 24 horas se contesta como "ya avisado"
  y el asesor nunca recibe el email. La bitácora sí anota `aviso_fallido`.
- **Sin dirección no hay candado.** Si la dirección llega vacía, `$2 <> ''` es falso y el aviso se manda siempre.
- **Guarda un solo aviso.** Se guarda solo el último aviso, así que si alternan link y visita de propiedades distintas, se pisan entre sí.
- **Puede volver a prender el bot.** Si el agente llama a Aviso_Asesor después de un Handoff en el mismo turno, el bot se reactiva
  (`bot_active = true`) y además `agent_id` puede quedar en `null`.
- **El nombre engaña.** "conversacion_derivada" en la salida no quiere decir que la conversación se derivó; significa que se hizo el UPDATE.
- **HTML sin escapar**, igual que en Handoff.

---

## 3. Cartera_Propiedades (10 nodos)

### 3.1 Qué hace
Busca en el stock de la inmobiliaria las propiedades que coinciden con lo que pide el cliente, o la propiedad
de un link que mandó más otras parecidas. Devuelve hasta 10, con su porcentaje de coincidencia y la ficha armada.

### 3.2 Entrada
- Es la herramienta "Cartera_Propiedades". La descripción que ve el modelo es:
  ```
  llamar a esta herramientas para buscar información de propiedades según requerimientos del cliente.

  # importante enviar:

  - Tipo_Operacion : "Alquiler" o "Venta"
  - Tipo_Propiedad: "Departamento", "Casa", "PH", "Local", "Terreno", etc.
  - Comentarios sobre necesidades/requerimientos del cliente
  - *importante:* enviar el identificador del usuario : agency_id:{{ ... }}, e identificador de la conversacion:{{ ... }}
  ```
- El prompt principal fija dos formatos de `query`:
  - Búsqueda por criterios: `"[tipo] en [operación] en [lugar], [ambientes] ambientes, presupuesto hasta [monto] [moneda], [características]. agency_id:…, conversation_id:…"`.
  - Link: `"Información sobre la propiedad en [URL]. agency_id:…, conversation_id:…"`.
- "extraer_agency_id" saca `extracted_agency_id` (si falta, `"default_session"`), `extracted_conversation_id`,
  `extracted_url` (la primera URL) y `clean_query` (el texto sin IDs ni URL).

### 3.3 Pasos, en orden
1. "When Executed by Another Workflow".
2. "extraer_agency_id" (Code).
3. "Tiene_Link" (IF): `extracted_url` no está vacío.
   - **Sí**: pasa por "Extraer_Web" (lee el aviso) y después va a "Preparar_Busqueda".
   - **No**: va directo a "Preparar_Busqueda".
4. "Preparar_Busqueda" (Code). Si hubo link y el extractor devolvió `sujeto`, rehace `clean_query` con tipo, barrio,
   dirección, dormitorios, m² y amenities. También agrega al input del agente el bloque
   `[DATOS DE LA PROPIEDAD DEL LINK - …]: <JSON del aviso>` y calcula los valores de referencia `ref_price`, `ref_currency`,
   `ref_rooms` (dormitorios + 1), `ref_zona`, `ref_addr` y `ref_from_link`.
5. "Generar_Embedding" (HTTP): vectoriza `clean_query`.
6. "AI Agent" (LangChain agent v3.1): recibe como texto `query + agent_extra`. Usa:
   - "OpenAI Chat Model" como modelo.
   - "Simple Memory" como memoria.
   - La herramienta "CARTERA_PROPIEDADES" (postgresTool).
7. Es el último nodo: su salida es la que vuelve al agente principal.

### 3.4 Modelos de IA
- **Chat:** OpenAI `gpt-5.4-mini-2026-03-17`. No tiene temperatura, tokens ni iteraciones configurados. No usa output parser.
- **Memoria:** "Simple Memory", que es `memoryBufferWindow` y vive en la RAM de n8n. La clave es `<conversation_id>_buffer` y
  guarda los últimos 25 mensajes.
- **Embedding:** Google `gemini-embedding-001` por `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent`,
  con la credencial `httpQueryAuth` "Query Auth account" (id `9sWQDmKFONtGTVQ7`). El cuerpo es
  `{ content:{parts:[{text: clean_query}]}, taskType:'RETRIEVAL_QUERY', outputDimensionality:768 }`.
- **Prompt del "AI Agent".** Tiene unos 12.800 caracteres, así que acá va resumido. El texto completo está en el nodo:
  - Rol: "Especialista en Análisis Técnico de Cartera".
  - **CASO A, con link:** usar los datos del aviso que ya vienen en el input, sin leer el link. Llamar a la herramienta con
    zona, ambientes, tipo y características, **nunca con `max_price`**. Aplicar la "DOBLE VERIFICACION": la
    propiedad del link es la fila que trae `es_del_link=true`, o la que tiene `coincide_precio` y además `coincide_calle`,
    o `coincide_ambientes` y `coincide_zona`. Se marca una sola, se pone primera, y su justificación arranca con
    "🔗 ESTA ES LA PROPIEDAD DEL LINK — las siguientes son comparables.". Hay un chequeo de coherencia de precio
    que tiene una excepción cuando el aviso es de venta y el stock de alquiler, o al revés.
  - **CASO B, con criterios:** llamar a la herramienta y formatear el resultado tal cual.
  - Jerga local: "espacios aéreos" es balcón, terraza o patio; "en altura" es del 5º piso para arriba; dormitorios = ambientes − 1.
  - Cómo llenar cada parámetro: al PH se lo llama `Condo`; las referencias de lugar como un estadio o un shopping se traducen al barrio.
  - Reglas críticas: devolver exactamente las filas que dio la herramienta, en su orden. `coincidencia_pct` es igual a `match_pct`
    literal. No se descarta nada por precio.
  - Mapeo campo por campo desde `tokko_data`:
    - Siempre se usa `fake_address`, nunca `real_address`.
    - Se traducen `situation`, `orientation` y `property_condition`.
    - Se sacan entre 3 y 6 destacados solo de `description`.
    - `condiciones_y_requisitos` se toma de `transaction_requirements` y de la descripción.
    - Del asesor se toma `assigned_agent` (name, email, cellphone).
    - `notas_ia` se copian palabra por palabra en `notas_internas`.
  - Salida: **solo JSON**, con este esquema:
    ```json
    {
      "busqueda_exitosa": true,
      "cantidad_retornada": 0,
      "origen_busqueda": "url | criterios",
      "propiedades": [
        {
          "coincidencia_pct": 0,
          "info_general": { "...": "..." },
          "espacios_y_superficies": { "...": "..." },
          "detalles_tecnicos": { "amenities_y_servicios": [], "destacados_descripcion": [], "condiciones_y_requisitos": [] },
          "analisis_experto": { "justificacion": "", "diferencias_con_pedido": "", "valor_destacado": "" },
          "enlaces": { "foto_principal": "", "ficha_completa": "", "video": "" },
          "notas_internas": [],
          "asesor": { "nombre_asesor": "", "email_asesor": "", "celular_asesor": "" }
        }
      ]
    }
    ```

### 3.5 Consultas a la base (herramienta "CARTERA_PROPIEDADES", SQL armado con `$fromAI`)
**Parámetros que llena el modelo** (`$fromAI`). Todos se limpian con regex antes de meterlos en el SQL:

| Parámetro | Qué es |
|---|---|
| `prop_type` | Valores válidos: Departamento, Casa, Lote, Condo, Bussiness Premises, Oficina, Garage, Weekend House, Hotel, Warehouse |
| `status_val` | Venta, Alquiler o Temporary rent |
| `max_price` | Presupuesto máximo |
| `currency` | USD por defecto |
| `rooms` | Ambientes |
| `zona` | Barrios en minúscula separados por coma; se les sacan los acentos |
| `caracteristicas` | Palabras sueltas unidas con ` | ` para `to_tsquery` |

**Valores que no pone el modelo:** `p_vec`, el embedding de Gemini convertido a `::vector(768)`, y los valores de
referencia del link que calcula "Preparar_Busqueda".

**Tabla:** `properties p`. Lee:
- `id`, `tokko_id`, `agency_id`, `title`, `description`, `price`, `currency`, `property_type`, `status`, `address`, `city`, `bedrooms`,
  `bathrooms`, `covered_area`, `total_area`, `images`, `notas_ia`, `assigned_agent`, `assigned_agent_id`, `embedding`, `created_at`.
- Un objeto `tokko_data` reconstruido. Toma de `p.tokko_data`: operations, type, room/suite/bathroom_amount, superficies, age,
  fake_address, location, floor, publication_title, description, expenses, cocheras, disposition, orientation,
  property_condition, credit_eligible, geo, public_url, real_address, development.tags, situation,
  transaction_requirements, toilet/living/floors_amount, reference_code. Además calcula:
  - `amenities_and_services`: los nombres de `tags`.
  - `pets_allowed`: si existe el tag `Pets allowed`.
  - `is_professional`: si existe el tag `Work able` o la descripción dice "apto profesional", "apto profesionales" o "uso profesional". Se acompaña de `is_professional_origen`.
  - `video_url`: el primer video.
  - `cover_photo`: la foto marcada con `is_front_cover`.

**Filtros duros (WHERE):**
- `p.agency_id = '<extracted_agency_id>'::uuid`.
- `p.is_active = TRUE`.
- Tipo: si viene, tiene que coincidir, comparado con `replace(lower(...),'ss','s')`.
- Operación: si viene, `p.status = p_status`, **salvo cuando el origen es un link**.
- Precio: `p.price > 0 AND p.price <= max_price * 1.20 AND p.currency = p_currency`.
- Ambientes: `room_amount BETWEEN rooms-1 AND rooms+1`.

**Zona:** busca cada barrio (sin acentos) dentro de `city` o `address` con `ILIKE`. Se quedan las filas `en_zona`, más la del link.
**Si ninguna fila cae en la zona, devuelve todas sin mirar la zona.**

**`match_pct`:** es un puntaje normalizado sobre los criterios que se usaron:

| Criterio | Puntos |
|---|---|
| Zona | 35 |
| Ambientes | 30 si son iguales, 15 si difieren en ±1 |
| Parecido semántico | 25 × (1 − distancia coseno `p.embedding <=> p_vec`) |
| Palabras clave | 10, por `to_tsvector('simple', descripción+título) @@ to_tsquery` |

Si no hay ningún criterio, vale 100.

**Datos para comparar contra el link:** `es_del_link`, `coincide_precio`, `coincide_calle`, `coincide_ambientes`,
`coincide_zona`, `precio_link`, `moneda_link`, `calle_link`, `zona_link` y `ambientes_link`.

**Orden y límite:** `ORDER BY es_del_link DESC, coincide_precio DESC, coincide_calle DESC, match_pct DESC, _dist_vec ASC NULLS LAST, _created_at DESC NULLS LAST LIMIT 10`.

La búsqueda vectorial la hace el propio SQL, con el operador `<=>` sobre la columna `properties.embedding`. **No usa una
RPC ni una función aparte.**

### 3.6 Escrituras y llamadas externas
- A la base no escribe nada.
- **"Extraer_Web"**: `POST http://agencia_vakdor_acm-extractor:80/extract`, un servicio interno de EasyPanel, con la cabecera
  `x-extractor-secret` escrita en el nodo. El cuerpo es `{ url }`, el timeout es de 120 s y reintenta si falla. Se espera que la respuesta traiga `sujeto`
  (tipo_propiedad, barrio, direccion, dormitorios, m2_cubiertos, amenidades), `precio` y `moneda`.
- **Gemini embeddings**: la llamada descrita en 3.4.
- No manda emails ni WhatsApp.

### 3.7 Salida
Lo que vuelve es la salida del "AI Agent": `{ "output": "<string con el JSON del esquema de arriba>" }`. No se valida
en ningún nodo que sea JSON válido.

### 3.8 Qué se decide con reglas y qué con IA
- **Con reglas:**
  - El IF que decide si hay link.
  - Todos los filtros y el `match_pct` del SQL.
  - El orden y el tope de 10.
  - `es_del_link` y los `coincide_*`.
  - Qué campo muestra la dirección: `fake_address`, porque el SQL entrega los dos y el prompt manda.
- **Con IA:**
  - Qué parámetros pasar: sobre todo cómo traduce la zona y el tipo.
  - Reconocer la propiedad del link cuando el SQL no la marcó (la regla de datos duros).
  - El chequeo de coherencia del precio.
  - Traducir y mapear todos los campos.
  - Destacados, condiciones y el análisis experto.

### 3.9 Multi-agencia
- Filtra por `properties.agency_id`. Todo sale de `tokko_data`, así que **el esquema depende de Tokko** (los nombres en
  inglés de Tokko: `Condo`, `Bussiness Premises`, `Work able`, `Pets allowed`).
- La moneda por defecto (USD) está fija, igual que la jerga porteña del prompt ("espacios aéreos", "en altura", "PH").
- El host del extractor está fijo. El nombre del proyecto `agencia_vakdor` no es de ninguna agencia cliente.

### 3.10 Frágil o raro
- **Agencia que no llega.** Si el agente no manda el `agency_id`, queda `"default_session"` y el cast a uuid rompe la herramienta.
- **Qué se vectoriza.** El embedding se hace del texto crudo `clean_query` (o del resumen del aviso) **antes** de que el modelo decida
  los parámetros, así que el vector no refleja los criterios limpios.
- **Embedding que falla.** "Generar_Embedding" tiene `onError: continueRegularOutput`. Si falla, la búsqueda sigue sin el componente semántico
  y el porcentaje se recalcula en silencio.
- **La zona se ignora sin avisar.** Cuando no hay nada en la zona pedida, el SQL devuelve de todas las zonas. El que tiene que
  notarlo y avisarle al cliente es el modelo, porque ninguna columna lo dice.
- **Memoria de 25 mensajes.** Con esa memoria, el sub-agente "recuerda" búsquedas anteriores y puede mezclar resultados.
  Además vive en la RAM de n8n y se pierde si n8n se reinicia.
- **Casts que pueden romper.** `(tokko_data->>'room_amount')::int` falla si el valor no es numérico. Es un riesgo que depende de los datos.
- **URLs que no son avisos.** Cualquier URL del texto dispara el scraping, aunque sea un link de ficha interna.
- **Prompt largo.** Son unos 12,8 mil caracteres por llamada, y la salida es JSON libre sin parser. Ya hay precedente de problemas en el parseo.

---

## 4. Conocimiento_Contexto (6 nodos)

### 4.1 Qué hace
Contesta preguntas sobre la inmobiliaria: la empresa, las zonas, las condiciones y los servicios. Para eso lee el texto
de conocimiento que la agencia cargó en su configuración de WhatsApp. Si ahí no está, responde que no tiene esa información.

### 4.2 Entrada
- Es la herramienta "Conocimiento_Contexto". La descripción que ve el modelo es:
  ```
  llamar a esta herramienta para acceder a conocimiento de contexto de la inmobiliaria.
  agency_id:{{ ...lead.agency_id }}
  conversation_id:{{ ...conversacion.conversation_id }}
  ```
- Formato del `query` según el prompt principal: `"[pregunta del cliente]. agency_id:…, conversation_id:…"`.
- "extraer_agency_id" saca `extracted_agency_id` (si falta, `"default_session"`) y `extracted_conversation_id` (si falta, `"default_conversation"`).

### 4.3 Pasos, en orden
1. "When Executed by Another Workflow".
2. "extraer_agency_id" (Code).
3. "AI Agent", que recibe `{{ $json.query }}`. Usa "OpenAI Chat Model", "Simple Memory" y la herramienta "CONOCIMIENTO_CONTEXTO".
4. Su salida es la que vuelve al agente principal.

### 4.4 Modelos de IA
- OpenAI **`gpt-5.4-nano-2026-03-17`**, sin temperatura ni otras opciones.
- Memoria "Simple Memory" en RAM, con clave `<conversation_id>_Buffer` (con B mayúscula) y **ventana de 100 mensajes**.
- El prompt completo (1.179 caracteres):
  ```
  IDENTIDAD Y ROL
  Sos el asistente especializado (sub-agente IA), cuya función es proveer información precisa sobre la inmobiliaria al agente IA principal. Tu única fuente de información es la herramienta "CONOCIMIENTO_CONTEXTO".

  INSTRUCCIONES DE COMPORTAMIENTO

  Antes de responder, analizá exhaustivamente el contenido recuperado por CONOCIMIENTO_CONTEXTO: el contexto, los detalles, las implicancias y cualquier información relacionada con la consulta recibida.
  Si encontrás información relevante, respondé de forma clara, precisa y basándote estrictamente en lo que la herramienta provee. No agregues suposiciones ni datos externos.
  Si no encontrás información suficiente o relacionada, no inventes, no supongas ni completes con conocimiento propio. Respondé con transparencia:

  "En este momento no cuento con información sobre ese tema. Si lo necesitás, puedo derivarte con un asesor que podrá ayudarte mejor."


  RESTRICCIONES

  No uses fuentes externas ni conocimiento previo.
  No especules ni rellenes vacíos de información.
  No respondas sobre temas que excedan el alcance de la inmobiliaria.
  ```

### 4.5 Consultas a la base
La herramienta "CONOCIMIENTO_CONTEXTO" (postgresTool, select) hace
`SELECT knowledge_text, knowledge_embedding FROM public.whatsapp_ai_settings WHERE agency_id = <extracted_agency_id> LIMIT 1`.
**No es una búsqueda vectorial:** trae el texto completo y, además, el vector crudo (`knowledge_embedding`), que termina dentro del
contexto del modelo sin que nadie lo use. El modelo no le pasa ningún parámetro.

### 4.6 Escrituras y llamadas externas
No tiene. Solo usa el modelo de OpenAI.

### 4.7 Salida
`{ "output": "<texto libre del modelo>" }`.

### 4.8 Qué se decide con reglas y qué con IA
Con reglas solo se extrae el `agency_id`. Todo lo demás lo decide la IA: si la respuesta está en el texto y cómo redactarla.

### 4.9 Multi-agencia
Lee `whatsapp_ai_settings` de la agencia. No tiene hardcodeos.

### 4.10 Frágil o raro
- Si falta `agency_id`, se consulta con `"default_session"` y no devuelve fila. En ese caso el modelo contesta "no cuento con información".
- **Devuelve el embedding al modelo**: es un gasto de tokens inútil.
- La ventana de 100 mensajes en RAM, compartida por conversación, puede hacer que conteste con lo que recuerda en vez de volver a consultar.
- La herramienta no tiene descripción.
- La frase fija "puedo derivarte con un asesor" puede chocar con las reglas de derivación del agente principal.
- El filtro usa `$json.extracted_agency_id` desde un sub-nodo de herramienta; depende de cómo n8n resuelve `$json` en ese contexto.

---

## 5. Gestion_Visita (11 nodos). DESACTIVADO en PRISMA

### 5.1 Qué hace
La idea era agendar, cambiar o cancelar visitas en la tabla `scheduled_visits`, revisando que el asesor tuviera libre el
horario y calificando al cliente con BANT. **Hoy no se usa**: en PRISMA el nodo "Gestion_Visita" está desactivado y
no está conectado al agente. El prompt principal dice "Vos NO agendás… vía Aviso_Asesor" y no nombra a Gestion_Visita.

### 5.2 Entrada
- Descripción de la herramienta, que quedó sin uso:
  ```
  Llamar a esta herramienta para agendar visita a propiedades.
  agency_id:{{ ... }}
  Conversation_id:{{ ... }}
  ```
- "extraer_info" saca:
  - IDs: `agency_id`, `lead_id` (`lead_id:(\d+)`) y `conversation_id` (`Conversation_id:`).
  - Cliente: `nombre_completo` (`Nombre_Completo:`), `email_usuario` y `presupuesto`.
  - Propiedad: `propiedad_titulo` y `direccion` (con la frase "visita a la propiedad de X,").
  - Visita: `fecha_visita` ("el <día> <d> de <mes> <aaaa>"), `hora_visita` ("a las HH:MM hs") y `preferencias`.
  - Otros: `tipo_operacion` y `email_asesor`.

  El formato de `query` que esto supone **no está en el prompt principal actual**.

### 5.3 Pasos, en orden
1. "When Executed by Another Workflow".
2. "extraer_info" (Code).
3. "Historial_Conversacion" (Postgres select).
4. "Buscar_agent_id" (Postgres select, se ejecuta una sola vez).
5. "AI Agent". Usa "OpenAI Chat Model", "Simple Memory" y tres herramientas: "GESTION_VISITA_VERIFICAR", "GESTION_VISITA_CREAR" y "GESTION_VISITA_MODIFICAR".
6. "respuesta" (Set).

### 5.4 Modelos de IA
- OpenAI `gpt-5.4-mini-2026-03-17`, con `responsesApiEnabled: false` y sin temperatura.
- Memoria en RAM con clave `<conversation_id>_buffer` y ventana de 100 mensajes. Es **la misma clave que usa Cartera_Propiedades**. Si las
  dos memorias chocan depende de cómo n8n aísla la memoria entre workflows, y eso no está en el flujo.
- Prompt (unos 8.100 caracteres), resumido:
  - Se le inyecta todo el historial (`JSON.stringify($('Historial_Conversacion').all())`), los datos de "extraer_info" y el
    `agent_id`.
  - Tarea 1: detectar si hay que CREAR, MODIFICAR o CANCELAR.
  - Tarea 2: usar VERIFICAR y dejar al menos 30 minutos entre visitas del asesor. Si hay choque, no avanzar y proponer dos franjas.
  - Tarea 3: calcular BANT de 0 a 12, con 3 puntos por variable. HOT es 10-12, WARM 6-9 y COLD 0-5.
  - Tarea 4: ejecutar la herramienta que corresponda.
  - Tarea 5: devolver solo JSON con `accion`, `estado_visita`, `motivo_cambio`, `disponibilidad_asesor`, `resultado_herramienta`,
    `scheduled_visits{…21 campos}` y `respuesta_agente_principal`. Esta última va con voseo y sin emojis.

### 5.5 Consultas a la base
- "Historial_Conversacion": `SELECT * FROM public.n8n_chat_histories WHERE session_id = <conversation_id>`. Es la tabla
  de la memoria Postgres del agente principal, cuyo nodo "Memoria" usa como clave el `conversation_id`.
- "Buscar_agent_id": `SELECT * FROM public.profiles WHERE email = <email_asesor>`, sin `LIMIT` explícito y **sin filtrar por agencia**.
- "GESTION_VISITA_VERIFICAR": `SELECT` sobre `scheduled_visits` **`WHERE email = <agent_id del asesor>`**.
  Compara la columna del email del cliente con un UUID, así que nunca va a encontrar nada. `returnAll` lo decide el modelo.

### 5.6 Escrituras
- **"GESTION_VISITA_CREAR"** hace un INSERT en `scheduled_visits`. La operación no está declarada, así que usa la que viene por defecto en el nodo.
  - Columnas que salen del código: `lead_id`, `telefono` (= lead_id), `nombre_completo`, `email`, `propiedad_titulo` (= `titulo_direccion`),
    `tipo_operacion`, `presupuesto`, `agency_id` y `agent_id`.
  - Columnas que llena el modelo: `fecha_visita`, `hora_visita`, `zona_propiedad`, `estado_visita`,
    `calificacion_lead`, `score_bant`, `intereses_clave`, `objeciones_detectadas`, `decisores`, `origen_consulta`,
    `resumen_conversacion`, `motivo_cambio` y `updated_at`.
- **"GESTION_VISITA_MODIFICAR"** hace un UPDATE en `scheduled_visits` **buscando por `lead_id`**. Actualiza fecha, hora,
  propiedad_titulo, zona, estado, presupuesto, calificación, score, intereses, objeciones, decisores, origen,
  resumen, motivo_cambio, `agent_id` y `updated_at`. **No filtra por agencia ni por visita**: cambia todas las filas de ese
  teléfono.
- No manda emails ni WhatsApp, ni hace llamadas externas.

### 5.7 Salida
"respuesta" (Set) devuelve `{ "respuesta": "<AI Agent.output>" }`, que es el JSON de la Tarea 5 guardado como string.

### 5.8 Qué se decide con reglas y qué con IA
Casi todo lo decide la IA: qué acción corresponde, si hay disponibilidad (con la cuenta de los 30 minutos), el puntaje BANT, la fecha y la hora.
Con reglas solo se extraen los datos y se leen el historial y el asesor.

### 5.9 Multi-agencia
Guarda `agency_id` al crear, pero ni la modificación ni la verificación filtran por agencia. `profiles` se busca por email en todas las agencias.

### 5.10 Frágil o raro
- **Está muerto**: desactivado y sin conexión.
- VERIFICAR filtra por la columna equivocada (`email = agent_id`), así que siempre dice que el asesor está libre.
- MODIFICAR busca por `lead_id` y puede pisar todas las visitas de ese teléfono, incluso las de otras agencias.
- Los estados no coinciden: la herramienta dice "agendada / modificada / cancelada" y el prompt "agendada / reprogramada / cancelada".
- Hay campos del JSON del prompt que no existen como columnas: `propiedad_id`, `conversation_id` y `email_asesor`.
- `updated_at` lo escribe el modelo como texto.
- Si "Historial_Conversacion" o "Buscar_agent_id" no devuelven filas, la rama se corta **(comportamiento de n8n)**, porque ninguno tiene `alwaysOutputData`.
- Las regex de "extraer_info" dependen de un formato de frase que el agente principal ya no produce.

---

## Cruces útiles para la reescritura

- **Lógica duplicada.**
  - Avisar_Asesor y Gestion_Handoff comparten bastante: parseo casi idéntico con `grab`, plantilla HTML hermana,
    la misma regla de 23 a 6, el mismo INSERT en `lead_eventos` con otro `origen`, y la búsqueda del asesor por email en
    `profiles`.
  - Los tres sub-agentes con IA repiten `extraer_agency_id` casi igual.
- **Dos flujos que se contradicen sobre el bot.** Handoff lo apaga (`bot_active=false`) y Aviso_Asesor lo prende (`bot_active=true`).
- **Todas las entradas son texto.** Pasar por parámetros tipados (agency_id, conversation_id, email del asesor) elimina casi todos los
  problemas de parseo.
- **Los IDs podrían no pasar por el modelo.** agency_id y conversation_id ya los conoce el flujo PRISMA (`Set valores`) y hoy igual se
  los hace escribir al modelo.
- **Memoria.** Hay tres memorias en RAM, una por sub-agente, además de la memoria Postgres del agente principal
  (`n8n_chat_histories`, clave conversation_id, ventana de 15).
