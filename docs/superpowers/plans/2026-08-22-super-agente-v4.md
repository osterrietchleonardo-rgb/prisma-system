# Super Agente de Seguimiento — Plan V4 (documento único y completo)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.
>
> **Este documento es AUTOCONTENIDO.** Contiene: la visión completa del Super Agente
> (Parte I), el plan de ejecución TDD de la Fase 1 con todo el código (Parte II), y el
> diseño detallado de las fases 2-5 y la habilitación de llamadas (Parte III). No depende
> de ningún otro plan. La Parte II se ejecuta ahora; cada fase de la Parte III recibe su
> propio plan de ejecución estilo Parte II cuando le toque, DESPUÉS de correr su task de
> verificación (regla de la casa: verificar contra código y producción antes de crear).

**Goal:** Un agente de dirección operativa dentro de PRISMA que hace seguimiento a los
**leads** (si, cuándo, cómo y por qué medio contactar — con razón legible en castellano y
evidencia citada), seguimiento a los **asesores** (escalera de avisos hasta el director
con propuesta de reasignación), coaching personalizado por datos reales, ejecución de
**comandos en lenguaje natural** de clientes y asesores, **vigías** sobre el inventario,
y gestión completa del **ciclo de vida de plantillas de WhatsApp** — todo con
trazabilidad total y control del director.

**Architecture:** "Cerebro nuevo, cuerpo actual". UN solo chasis para todos los frentes:
un **loop de agente con herramientas de solo lectura** (el modelo investiga lo que
necesita, verifica los hechos contra la base antes de afirmarlos, y emite la decisión
como tool call validada) + **guardrails duros en código** que cortan antes o después del
LLM + un **ejecutor** separado que es el único que escribe. El cuerpo es la capa de
**canales** (whatsapp_plantilla / whatsapp_libre / email / llamada / interno) con reglas
por canal y destinatario. La memoria es **unificada por composición, no por migración**:
el expediente de cada lead es una vista compuesta de las memorias que ya existen en
producción, más tablas nuevas solo aditivas. La Fase 1 arranca en **modo sombra** (decide
y registra, no envía) y se activa por agencia; el flujo viejo de n8n queda apagado como
rollback instantáneo.

**Tech Stack:** Next.js (repo PRISMA actual, deploy Vercel) · Supabase Postgres (tablas
nuevas + funciones SQL, todo aditivo) · `@anthropic-ai/sdk` **directo** con loop manual
(`claude-sonnet-5`, thinking adaptativo, prompt caching), reutilizando `MODELO` y
`verificarNoTruncada` del wrapper probado `lib/admin-vakdor/marketing/claude.ts` · Zod ·
Vitest · n8n solo como reloj (workflow de 2 nodos) · Evolution/Meta vía el
`/api/whatsapp/dispatch` existente (sin modificar) · Resend (ya en producción) para email
de salida · Cloudflare Email Routing + Worker (a verificar) para email de entrada ·
Retell + voz de ElevenLabs para llamadas (habilitación futura, detrás de flag).

**Spec:** `c:\Users\LENOVO\Downloads\PRISMA-Agente-Seguimiento-Especificacion.md` (v3.0)
+ la visión de Leonardo capturada el 21-22/8/2026 (Parte I de este documento).

---
---

# PARTE I — LA VISIÓN COMPLETA

## I.1 Los cinco frentes del Super Agente

| # | Frente | Qué hace |
|---|---|---|
| 1 | **Seguimiento al lead** | Decide si contactar, cuándo, por qué medio (WhatsApp/email/llamada) y con qué mensaje; entiende la situación completa (por qué no respondió, si espera al asesor) y en ese caso manda el aviso de tranquilidad ("tu consulta está con el asesor"). |
| 2 | **Seguimiento al asesor** | Ve qué clientes tiene cada asesor en handoff o esperando coordinar visita y hace cuánto; lo apura por escalera: WhatsApp → email → re-aviso → si a las 24h no atendió al cliente, WhatsApp + email al director con la situación, la justificación y la propuesta de reasignación. |
| 3 | **Notificador / coach del asesor** | Personalizado según uso real y verificable: recordar cargar actividades en el tracking, tips con datos propios (responder a cierta hora sube el cierre), incentivo de frecuencia, felicitaciones por logros reales (captaciones, ventas, cierres). |
| 4 | **Comandos en lenguaje natural** | El asesor dice "decile al cliente tal cosa" / "mandale por email" → el agente lo hace sin perder contexto. El cliente dice "mandame la info por email", "llamame en un rato", "avisame la semana que viene" → se convierte en compromiso con vencimiento y se cumple por el canal correcto. |
| 5 | **Vigías** | "Avisame si baja de precio o si aparece un depto como me gusta" → alerta persistente que se dispara con los cambios reales del inventario y avisa con el dato citado. |

**El criterio de medición de la escalera del asesor (frente 2):** "no contesta" no se mide
por si respondió el aviso — se mide por si **atendió al cliente** (verificable en
`wa_messages`). Es mejor dato y no depende de canales de vuelta.

## I.2 Restricciones de realidad (condicionan todo el diseño)

1. **La regla de las 24 horas de Meta.** Si el destinatario no escribió al número en las
   últimas 24h, por WhatsApp solo salen **plantillas aprobadas** — nada de texto libre.
   Aplica igual cuando el destinatario es el **asesor**: los avisos del frente 2 y el
   coach del frente 3 necesitan sus propias plantillas. Forzar esta regla ya costó una
   cuenta bloqueada por Meta (el envío masivo de julio).
2. **Llamadas: hoy no hay infraestructura.** Primera versión realista: el agente le pide
   al **asesor** que llame (eso es un compromiso rastreable). Telefonía programática
   (Retell) es una habilitación aparte, detrás de flag (§I.6.3).
3. **El email hoy es de ida.** Resend manda pero el agente no recibe respuestas (ya
   documentado con los emails de handoff). La reciprocidad es una investigación de la
   fase 2 (§III.2.4).

## I.3 La memoria unificada global

### Lo que existe HOY en producción (no se toca nada de esto)

| Memoria | Dueño | Qué guarda |
|---|---|---|
| `wa_messages` | Sistema | **La verdad** de todos los mensajes de WhatsApp (entrantes y salientes) |
| `n8n_chat_histories` | Agente conversacional (n8n) | Lo que el conversacional procesó OK — su memoria de trabajo. El dispatch **ya inyecta acá** lo que se envía por fuera del chat, así el bot sabe qué salió |
| `wa_conversations.metricas` (jsonb) | Analizador GPT (n8n) | La memoria semántica del lead: los campos capturados (nombre, zona, presupuesto, urgencia…). La escribe el analizador, la lee el conversacional |
| `wa_conversations.follow_ups_history` (jsonb[]) | Dispatch | Snapshot de cada seguimiento enviado |
| `wa_conversations` (columnas de estado) | App + n8n | funnel_status, visit_status, bot_active, opt_out, next_follow_up_at… |

La **Fase 1** suma, también aditivo: `seguimiento_decisiones` (cada decisión con razón,
evidencia y trace de qué miró), `compromisos` (la primitiva "alguien debe algo con
vencimiento") y `lead_eventos` (la línea de tiempo).

### El principio: unificar por COMPOSICIÓN, no por migración

**La memoria unificada global no es un almacén nuevo: es el "expediente" de cada lead,
una vista compuesta que el Super Agente arma leyendo las fuentes existentes con sus
herramientas.** Cada memoria actual sigue siendo dueña de lo suyo y se escribe por el
camino que ya funciona en producción. Cero migración de datos, cero cambio en el workflow
PRISMA de n8n, cero riesgo sobre lo que hoy factura.

```
                    EXPEDIENTE DEL LEAD (vista, no tabla)
  ┌────────────────────────────────────────────────────────────────────┐
  │  leer_mensajes        → wa_messages           (verdad WhatsApp)    │
  │  (semilla)            → wa_conversations.metricas (memoria semánt.)│
  │  leer_compromisos     → compromisos           (quién debe qué)     │
  │  leer_intentos_previos→ seguimiento_decisiones (razón + evidencia) │
  │  (panel)              → lead_eventos          (línea de tiempo)    │
  │  leer_interacciones   → interacciones_canal   (email/llamadas, F2+)│
  └────────────────────────────────────────────────────────────────────┘
```

Las cuatro reglas de escritura (lo menos invasivo posible — esto está en producción):

1. **`lead_eventos` es la columna vertebral cronológica.** TODO lo que cualquier frente
   hace — decisión, envío, aviso al asesor, solicitud de plantilla, llamada, email,
   escalamiento — deja su fila. Es solo-agregar y existe desde la Fase 1.
2. **Los canales nuevos escriben en tabla nueva.** Emails y llamadas van a
   `interacciones_canal` (fase 2, aditiva) — NUNCA a `wa_messages`, que es de WhatsApp y
   de producción.
3. **El conversacional se entera por el patrón que ya funciona: la inyección.** El
   dispatch ya inyecta en `n8n_chat_histories` lo que sale por fuera; cuando el Super
   Agente mande un email o haga una llamada relevante para la conversación, inyecta un
   resumen de una línea por el MISMO mecanismo ("[sistema] Se le envió por email la ficha
   de Av. Mitre 1200"). El workflow de n8n no se toca: sigue leyendo su memoria como
   siempre y "mágicamente" sabe lo que pasó en otros canales.
4. **`metricas` la sigue escribiendo solo el analizador actual.** El Super Agente la lee;
   no la escribe. Si una fase futura necesita claves nuevas, se hace por el analizador
   existente (cambio de prompt en n8n con el método seguro documentado), no con un
   segundo escritor compitiendo.

**Qué NO se hace (y por qué):** no se crea una "tabla de memoria del super agente" que
duplique conversaciones ni métricas. Ya se vivió el costo de tener dos memorias
(`wa_messages` vs `n8n_chat_histories`: un mensaje caído deja ciego al agente) — el
diseño evita crear una tercera. Cada dato tiene UN dueño; el Super Agente compone.

(Existe un proyecto a MUY largo plazo — §III.10 — para que el historial que ve cada
modelo se derive como proyección del diario. No cambia nada de lo anterior hasta
entonces.)

## I.4 Canales: la capa de salida

Toda comunicación del Super Agente sale por un canal con reglas propias. La decisión de
la Fase 1 ya nace con la columna `canal`; las fases 2+ suman los canales de verdad.

| Canal | Destinatarios | Regla dura | Desde |
|---|---|---|---|
| `whatsapp_plantilla` | lead, asesor | Solo plantillas aprobadas por Meta; ventana 6-23 AR; la regla de 24h de Meta la vuelve obligatoria si el destinatario no escribió en 24h | Fase 1 (lead) |
| `whatsapp_libre` | lead, asesor | Solo dentro de la ventana de 24h desde el último mensaje del destinatario; texto libre vía Evolution/Meta | Fase 3 |
| `email` | lead, asesor, director | Salida por Resend (ya en producción); entrada por el camino de §III.2.4; siempre con footer identificando al agente | Fase 2 |
| `llamada` | lead | Retell + voz ElevenLabs, detrás de flag `llamadas_habilitadas`. Con flag apagado se degrada a compromiso `llamada_prometida` asignado al asesor | Habilitación L (§III.7) |
| `interno` | asesor, director | Notificación dentro de PRISMA + botones de acción (aprobar plantilla, reasignar) — el canal de las decisiones con control total | Fase 2 |

**Regla transversal:** el agente elige el canal con este orden de preferencia por defecto
— (a) el canal donde la conversación está viva (ventana de 24h abierta), (b) el que el
destinatario pidió ("mandame por email"), (c) plantilla de WhatsApp, (d) email. La
elección queda registrada con su razón en la decisión (columna `canal` + `razon`).

### El número compartido: quién contesta cada mensaje que entra

Todos los WhatsApp (los del conversacional, los seguimientos y — en fase 2 — los avisos
al asesor) salen y entran por **el mismo número de la agencia**. El árbitro de "quién
contesta" es determinista: **quién escribe + en qué estado está la conversación**.

| Entra un mensaje de… | Estado | Quién contesta | Cómo se garantiza |
|---|---|---|---|
| **Lead** | `bot_active = true` | El conversacional de n8n, como hoy — **sabiendo qué seguimiento salió**, porque el dispatch ya inyectó la plantilla enviada en `n8n_chat_histories` | Mecanismo existente, sin cambios. El Super Agente se retira solo: la regla de silencio (20h) lo saca de la cancha en cuanto la conversación revive, y `sigueElegible` bloquea cualquier envío en carrera |
| **Lead** | `bot_active = false` (handoff) | El asesor humano; el bot calla (como hoy) | Guardrail 3: con humano al mando el Super Agente ni decide ni envía al lead; la escalera (F2) vigila que el asesor conteste de verdad |
| **Asesor / director** (fase 2) | — | **Nadie automático hacia el lead.** El mensaje NO entra al conversacional: se registra como respuesta al aviso y, desde fase 3, pasa por el detector de comandos ("decile al cliente…") | El **gate de internos** (§III.2.6): allowlist de teléfonos de asesores/directores ANTES de crear conversación — sin esto, el bot trataría al asesor como un lead y lo saldría a calificar |

El principio: **el Super Agente solo le escribe al lead cuando la conversación está
muerta, y el conversacional siempre retoma cuando revive** — nunca compiten, porque
operan en estados disjuntos, y comparten memoria por la inyección.

## I.5 Integraciones del director (tab Integraciones de `/director/configuracion`)

La página ya existe y ya marca el patrón: **verificado el 22/8/2026 en
`app/director/configuracion/page.tsx`** — tab "Integraciones" con la Card de Google
Calendar por OAuth (`/api/google-calendar/connect`, `/status`, `/disconnect`, con estado,
email de la cuenta conectada y desconexión). Las integraciones nuevas son Cards hermanas
en esa misma tab, con el mismo lenguaje visual.

### I.5.1 Email del agente (fase 2) — la decisión: casilla administrada, no OAuth

| | Opción A — casilla administrada en dominio PRISMA (**elegida**) | Opción B — conectar el Gmail propio (OAuth) |
|---|---|---|
| Alta | **Automática al registro**: se asigna `seguimiento-ag<6hex>@<dominio>` — con Resend no se "crean buzones", solo se envía FROM un dominio verificado | Flujo OAuth por director (como Calendar), consentimiento y verificación de app de Google |
| Costo | **Gratis** (plan actual de Resend para salida + Cloudflare Email Routing para entrada; límites exactos del plan a verificar en la fase 2) | Gratis pero con cuotas de Gmail API y mantenimiento de tokens |
| Entrega | SPF/DKIM controlados por nosotros | Depende de la cuenta del cliente |
| Recepción | Catch-all del subdominio → webhook (§III.2.4) | Polling/watch de Gmail API |
| Riesgo | Bajo — todo nuestro | Medio — tokens vencidos, apps no verificadas, soporte |

**Decisión: Opción A para todos al registro** (cumple "automático y gratis"); la Opción B
queda como mejora futura opcional para la agencia que quiera que los emails salgan de su
propia casilla. **Dato que condiciona la fase 2:** el dominio verificado en Resend hoy es
`vakbot.vakdor.com` (no `vakdor.com`) — la verificación de la fase 2 decide si se reusa o
se verifica uno dedicado (p.ej. `agentes.vakdor.com`); verificar dominio nuevo en Resend +
Cloudflare toca DNS ⇒ **OK de Leonardo**.

**La Card en Integraciones:** estado de la casilla (dirección asignada, activa/no), botón
"Probar ida y vuelta" (manda un email de prueba y espera la respuesta por el camino de
entrada — la prueba ES la verificación), y a futuro el botón "Conectar mi propio email".

### I.5.2 Google Calendar (ya existe — se consume, no se construye)

Sin trabajo nuevo en el corto plazo. Las fases 2-3 lo **usan**: cuando el Super Agente
coordina o re-coordina una visita, sincroniza al calendario del que ya esté conectado por
el flujo existente. Único trabajo eventual: extender la conexión a asesores si hoy es
solo del director (a verificar en la fase 2 — la UI actual habla de "las visitas que te
asignás a vos mismo").

### I.5.3 Agente de llamadas — Retell + voz ElevenLabs (HABILITACIÓN FUTURA)

Queda **diseñado pero apagado**, detrás del flag `llamadas_habilitadas` (default `false`)
en `seguimiento_config`. La Card en Integraciones aparece desde la fase 2 como "Agente de
llamadas — Próximamente" (toggle deshabilitado), para que el director sepa que existe.
El diseño completo del flujo está en §III.7.

## I.6 El gestor de plantillas (transversal a todas las fases)

**Lo que ya existe:** el provisionador crea 8 plantillas automáticas por agencia con
prefijo `ag<6hex>_` y el estado de aprobación de Meta se rastrea por plantilla
(`wa_templates.status`) y por instancia (`whatsapp_instances.templates_status`). La Task 2
de la Fase 1 lo audita.

**El principio:** catálogo **curado y versionado** — la cantidad y el formato de las
plantillas se controlan en un solo lugar, y al registrarse una agencia se crean todas
juntas. Meta impone un tope de plantillas por WABA y califica su calidad (puede
pausarlas); el número exacto del tope se consulta contra la WABA real, no se asume.

**El flujo de plantilla nueva** (situación imprevista que necesita una que no está):

```
necesidad detectada → decisión queda `bloqueada_sin_plantilla` + compromiso con vencimiento
  → aviso al director por WhatsApp + email: justificación, texto propuesto, qué proceso la necesita
  → aprobación por BOTÓN en el panel de PRISMA (no interpretando una respuesta de chat:
     queda registrado quién aprobó, cuándo y qué versión exacta del texto)
  → creación en la WABA del cliente → el reloj (cada 30 min) consulta el estado en Meta
  → aprobada → la PRÓXIMA corrida del decisor la encuentra disponible y decide de nuevo
     con contexto fresco (no hay "máquina de resume": el ciclo del reloj ES la reanudación)
  → todo el camino queda en lead_eventos: se necesitó → se pidió → se aprobó → Meta aprobó → se usó
```

**Las tres reglas acordadas (22/8/2026):**

1. **Rechazo de Meta → primero autonomía, después el director.** El agente analiza el
   motivo del rechazo: si es arreglable por él (redacción, formato, variables, claridad),
   reformula y reenvía solo — con tope de **2 reformulaciones autónomas**. Si el motivo
   es de política/categoría/marca, o se agotó el tope, escala al director con el motivo
   de Meta y su justificación. Lo más autónomo posible, nunca sin límite.
2. **Fallback multi-canal a las 24 horas.** Si a las 24h del aviso original la plantilla
   no está disponible (rechazada, tope de la WABA, demora de Meta), esa comunicación
   concreta sale por **otro medio**: email, o pedido de llamada al asesor. El compromiso
   con el cliente no vence esperando a Meta.
3. **Nunca crear sin aprobación del director**, y siempre verificando el tope real de la
   WABA antes de enviar la creación.

## I.7 El mapa de fases

| Fase | Qué entrega | Depende de |
|---|---|---|
| **1 (Parte II, se ejecuta ahora)** | El decisor del lead con loop + herramientas, compromisos, trazabilidad, sombra → activo. Solo WhatsApp. | — |
| **2 (§III.2)** | La escalera del asesor multi-canal + email bidireccional + flujo de plantilla nueva con aprobación del director + provisionador corriendo al registro + casilla de email por agencia + **identidad unificada, observabilidad al operador y aprobaciones consume-once** (§III.2.8). | Fase 1 (compromisos, eventos, reloj) + Task 2 |
| **3 (§III.3)** | Comandos y compromisos detectados en la conversación: detector sobre lo que dicen cliente y asesor → compromisos → ejecutor multi-canal que los cumple respetando la regla de 24h. | Fase 2 (canales) |
| **4 (§III.4)** | Vigías: tabla de alertas + detección de cambios en el sync de Tokko (precio, altas que matchean). | Fase 1; verificar si el sync guarda historial de precios |
| **5 (§III.5)** | Coach del asesor. Última a propósito: sus fuentes de datos (tracking de actividades, métricas de uso) **no están verificadas** — verificar antes de diseñar. | Verificación de fuentes + fase 2 (canal al asesor) |
| **C (§III.6)** | Módulo de Campañas: agentes especializados por listas de números (reclutador, captador de propietarios) con interruptores que silencian selectivamente a los agentes core, montado sobre el portero. | Fase 2 (gate/portero) + fase 3 (whatsapp_libre) |
| **L (§III.7)** | Habilitación de llamadas (Retell + ElevenLabs). No tiene fecha: se enciende cuando el negocio lo pague. | Fases 1-3 estables + pricing medido |

Cada fase entrega valor sola, corre en **sombra** antes de encender, enciende solo para
la agencia de prueba con OK, y ninguna rompe la anterior. Todo DDL es aditivo con
rollback = DROP.

---
---

# PARTE II — FASE 1: PLAN DE EJECUCIÓN (TDD, task por task)

## II.1 Por qué esta forma (las decisiones de diseño)

| Decisión | Por qué |
|---|---|
| Todo dentro del repo PRISMA, cero servicios nuevos | No hay servicios extra en EasyPanel que mantener. Vercel ya corre, ya tiene las env vars y el service role de Supabase. |
| Solo tablas **nuevas** + 1 bloque de UI | Ninguna tabla existente se altera. `wa_conversations`, `wa_messages`, el agente conversacional (workflow PRISMA de n8n) y `/api/whatsapp/dispatch` quedan intactos. |
| Modo sombra primero, activación por agencia | El decisor corre días registrando qué HABRÍA hecho antes de mandar un solo mensaje. Se activa solo para PRISMAIA - VAKDOR con OK. |
| El flujo viejo de n8n queda apagado, no borrado | Rollback = apagar `seguimiento_config.modo` y (si se quisiera) reencender el flujo viejo. Dos minutos. |
| Reglas duras en código, el LLM solo decide | Los guardrails (§II.final) cortan ANTES o DESPUÉS del LLM. Si el LLM falla, no se manda nada (degradación elegante). |
| **Loop de agente con herramientas, no una llamada única** | Un clasificador de un tiro afirma a ciegas: puede retomar "el PH de Caseros" sin saber si se vendió o cambió de precio. El loop con `leer_propiedad` verifica contra la base ANTES de afirmar — la regla "ninguna afirmación sin el dato" a nivel del propio agente, verificable en el trace. |
| La decisión sale como tool call, no como texto parseado | Extraer JSON con regex es la misma clase de fragilidad que ya costó 12 clientes/mes con el parser de n8n. Como tool call, la API estructura el JSON; Zod valida; si falla, el error vuelve al modelo como tool_result y se auto-corrige en el mismo loop. |
| Loop manual, no el tool runner beta del SDK | Menos dependencia de betas y control total del ciclo. |
| **Diferencial de mercado** | Ningún CRM inmobiliario hace esto: seguimiento que **decide no molestar**, deja la **razón y la evidencia en castellano** visibles para el asesor, rastrea **compromisos** ("Martín debe una respuesta, vence en 3h") y escala al director cuando nadie responde. |
| Escalable multi-tenant desde el día 1 | Todo filtra por `agency_id`, un solo código, la personalización es data (`seguimiento_config`). Sumar una agencia = una fila. |

## II.2 Global Constraints

- **Rama nueva SIEMPRE desde main**: `feat/super-agente-fase-1`, con worktree. Nunca
  `git add -A` — siempre archivos explícitos.
- **Escribir en n8n requiere OK explícito de Leonardo** (crear el workflow reloj,
  credenciales). Leer es libre.
- **Migraciones Supabase**: por Management API con `SUPABASE_API_KEY_MANAGEMENT`, con OK
  previo de Leonardo. Todo DDL de este plan es **aditivo** (solo `CREATE`); rollback =
  `DROP` de lo creado. Las migraciones del repo NO se aplican solas.
- **Nada de secretos hardcodeados**: el reloj n8n usa credencial HTTP Header Auth, nunca
  la clave pegada en el nodo (lección del hallazgo de seguridad del 17/8).
- **Se prueba con la agencia PRISMAIA - VAKDOR** (94 propiedades). Central es del cliente
  real y NO se toca. Nunca entrar como un asesor real.
- **La sombra corre en LAS DOS agencias** (PRISMAIA y Central — decisión de Leonardo
  24/8: en Central es donde el análisis de "qué HABRÍA hecho" vale más). Sombra = solo
  lectura + registro en tablas nuevas. **Pasar Central a modo `activo` (envíos reales)
  queda FUERA de este plan**: requeriría su propio OK explícito, aparte.
- **El nombre del lead es SOLO el de `metricas.nombre`** (decisión de Leonardo 24/8):
  jamás usar el nombre del perfil de WhatsApp (`contact_name` — trae emojis y cualquier
  cosa; queda peor). Antes que un nombre malo, mejor ningún mensaje: sin nombre en
  metricas, no hay plantilla de seguimiento (el filtro de la Capa 1 lo garantiza). Los
  ~1.400 contactos sin nombre son mayormente del envío masivo `Reclutamientormx0726` —
  no son leads de propiedades. El agente conoce el ORIGEN de cada contacto
  (`wa_contacts.clasificacion`: Whatsapp-Consulta / Reclutamientormx0726 /
  Whatsapp-Manual / Importado) vía la semilla.
- **Verificar TODO en el navegador antes de entregar**: escritorio y celular (celular con
  emulación de dispositivo, no achicando la ventana). Claude levanta `npm run dev` y
  entrega el link.
- **Merge a main solo con OK de Leonardo.**
- **El agente jamás cierra un lead solo**: la acción `abandonar` apaga el seguimiento
  (`requires_follow_up=false`) pero NUNCA marca `closed_lost` automático.
- **Las herramientas del agente son de SOLO lectura.** Ninguna tool escribe en la base,
  manda mensajes ni toca estado. Escribir es exclusivo del ejecutor (Task 15), después de
  los guardrails.
- **Tope duro de 6 iteraciones por lead** (`MAX_ITERACIONES`). Si el agente no emitió
  decisión válida al llegar, se registra el error y NO se manda nada.
- **Deadline de corrida: 240 s.** El runner deja de tomar leads nuevos al pasarlo (los
  que quedan esperan la próxima corrida). `maxDuration = 300` da 60 s de colchón.
- **Modelo**: `claude-sonnet-5` vía `@anthropic-ai/sdk` directo, reutilizando `MODELO` y
  `verificarNoTruncada` de `lib/admin-vakdor/marketing/claude.ts`. Gotchas documentados:
  `temperature/top_p` dan 400; el thinking adaptativo consume el presupuesto de salida;
  `stop_reason: "max_tokens"` = fallo. Gotcha del loop: los bloques `thinking` de cada
  respuesta se devuelven **tal cual** en el mensaje assistant siguiente (siempre `push`
  de `res.content` completo, nunca solo el texto).
- **Prompt caching**: un solo `cache_control` al final del bloque system cubre todo el
  prefijo estable (tools + system, en ese orden los renderiza la API). Lo variable
  (semilla del lead, resultados de tools) va en `messages`. Verificar con
  `usage.cache_read_input_tokens > 0` de la 2ª llamada del loop en adelante.
- **El costo no se asume, se mide**: `seguimiento_decisiones.costo_usd` se calcula con
  los tokens reales; el criterio de salida de la sombra (Task 12) incluye un tope de
  costo por decisión acordado con Leonardo.
- Tests con Vitest, colocados junto al código (`lib/seguimiento/*.test.ts`), patrón de
  `lib/acm/`. Comando: `npx vitest run lib/seguimiento`.
- Plantillas del sistema ya provisionadas por agencia con prefijo `ag<6hex>_`:
  `seg_f1_seguimiento`, `seg_f2_valor`, `seg_f3_breakup`, `visita_recordatorio_24h`,
  `visita_recordatorio_3h`, `visita_recordatorio_1h` (+2 a confirmar en Task 0). El
  dispatch antepone el prefijo solo.

## II.3 Estado actual verificado (17-22/8/2026, contra n8n, el repo y el navegador — no de memoria)

- Flujo n8n "Seguimiento" (`hr3cuwHg0gzsnlqB`): **apagado a propósito** desde el 5/8
  12:31. Corrió bien hasta esa hora. La tool Gestion_Visita del agente conversacional:
  **desconectada a propósito**.
- Lógica vieja: cadencia fija F1 (24h) → F2 (+3 días) → F3 (breakup, marcaba
  `closed_lost`); recordatorios de visita 24h/3h/1h + no-show; un modelo nano redactaba
  solo la frase de cierre `{{2}}` de la plantilla.
- `/api/whatsapp/dispatch` (`app/api/whatsapp/dispatch/route.ts`): valida ventana 6am–23pm
  AR, resuelve plantilla real desde `wa_templates`, envía por Evolution o Meta según
  `whatsapp_instances.integration_type`, guarda en `wa_messages`, **inyecta en
  `n8n_chat_histories`** (el conversacional se entera de lo enviado), y agrega snapshot a
  `wa_conversations.follow_ups_history`. **No se modifica.**
- Columnas verificadas de `wa_conversations`: `id, agency_id, contact_phone, contact_name,
  requires_follow_up, next_follow_up_at, follow_ups_sent, funnel_status, visit_status,
  visit_scheduled_at, visit_address, bot_active, opt_out, metricas (jsonb),
  recovery_stage, dropoff_reason, follow_ups_history (jsonb[]), last_message_at,
  instance_id`.
- `whatsapp_instances`: `agency_id, flows_active, templates_status, token,
  phone_number_id, evo_instance_name, integration_type, business_id`.
- En el repo: vitest configurado, `@anthropic-ai/sdk` + zod instalados,
  `ANTHROPIC_API_KEY` y `RESEND_API_KEY`/`RESEND_FROM` en `.env`, wrapper Claude en
  `lib/admin-vakdor/marketing/claude.ts` (exporta `MODELO = "claude-sonnet-5"` y
  `verificarNoTruncada`), ventana horaria en `lib/whatsapp/sending-window.ts`, ficha del
  lead en `components/whatsapp/LeadTraceability.tsx` (client component con supabase
  client).
- `app/director/configuracion/page.tsx` (verificado 22/8): tab "Integraciones" con Google
  Calendar por OAuth (`/api/google-calendar/connect|status|disconnect`) — el ancla de las
  integraciones de la fase 2.
- Resend en producción: emails de handoff y el informe semanal
  (`app/api/cron/weekly-report/route.ts`); dominio verificado: `vakbot.vakdor.com`.
- `properties.notas_ia` existe (notas del asesor para la IA por propiedad).

**Resultados de las Tasks 0-2 (ejecutadas 24/8/2026 — detalle en
`scratch/_sa-task0-verificacion.md`, `_sa-task1-properties.md`, `_sa-task2-provisionador.md`):**

- `wa_messages.role` real: `lead | bot | human | internal` (el asesor desde el panel SÍ
  escribe, con `role='human'`; los 188 `internal` son los marcadores de handoff).
- El equipo vive en **`profiles`** (role director/asesor, email, phone, agency_id,
  estado, notification_prefs). No existe tabla `agents`. Y `wa_conversations` tiene
  **`agent_id`** (asesor asignado — lo usa la RLS y lo usará la escalera de fase 2).
- RLS patrón: `agency_id = get_my_agency_id() AND (get_my_role()='director' OR agent_id = auth.uid())`.
- Las 8 plantillas del sistema: **todas APPROVED en las dos agencias**. Nombre real del
  no-show: `visita_post_noshow`. La octava es `reactivacion_snoozed`. Variables por
  plantilla verificadas contra los cuerpos reales (ver el bloque de PLANTILLAS en Task 4).
- Provisionador: `injectCoreTemplates()` en `app/actions/whatsapp-templates.ts`, corre
  **automáticamente al conectar WhatsApp** (Evolution y Meta, en `app/actions/whatsapp.ts`);
  el cron `app/api/cron/sync-templates` ya sincroniza el estado contra Meta.
- `properties`: `title` (no publication_title), `status` = operación (Venta/Alquiler),
  `is_active` = disponibilidad, `notas_ia` jsonb; la búsqueda necesita `city` en el OR.
- `metricas`: la clave de presupuesto es `presupuesto_max`; solo 535/~1995 conversaciones
  tienen `nombre` (decisión pendiente: fallback a `contact_name` en la Capa 1).
- Agencia de prueba: PRISMAIA - VAKDOR = `57c6134b-89dc-4968-bd1a-27364cf99195`.
- Hallazgos para fases futuras: `tracking_pipeline_moves`, `performance_logs`,
  `performance_objectives`, `lead_activities` (las fuentes del coach EXISTEN),
  `notifications`+`push_subscriptions` (canal interno), `wa_campaigns`+
  `wa_campaign_recipients` (base del módulo C), `google_calendar_tokens`,
  `wa_n8n_dead_letter`.

## II.4 Estructura de archivos (qué se crea y qué se toca)

```
CREAR:
  supabase/migrations/2026-08-22-super-agente-fase1.sql  (referencia; se aplica por Management API)
  lib/seguimiento/tipos.ts            # Zod schemas + types compartidos
  lib/seguimiento/tipos.test.ts
  lib/seguimiento/guardrails.ts       # reglas duras puras (silencio, intentos, confianza, presupuesto)
  lib/seguimiento/guardrails.test.ts
  lib/seguimiento/prioridad.ts        # scoring determinístico (Capa 2)
  lib/seguimiento/prioridad.test.ts
  lib/seguimiento/herramientas.ts     # tools de solo lectura del agente (Capa 3a)
  lib/seguimiento/herramientas.test.ts
  lib/seguimiento/semilla.ts          # el user-message inicial, mínimo y determinístico (Capa 3b)
  lib/seguimiento/semilla.test.ts
  lib/seguimiento/agente.ts           # prompt + tools API + loop manual (Capa 3c)
  lib/seguimiento/agente.test.ts
  lib/seguimiento/ejecutor.ts         # decisión → dispatch + actualización de estado (Capa 4)
  lib/seguimiento/ejecutor.test.ts
  lib/seguimiento/visitas.ts          # recordatorios 24/3/1 + no-show, determinístico
  lib/seguimiento/visitas.test.ts
  lib/seguimiento/escalamiento.ts     # leads esperando humano >2h → email al director
  lib/seguimiento/escalamiento.test.ts
  lib/seguimiento/compromisos.ts      # derivación y sincronización de compromisos
  lib/seguimiento/compromisos.test.ts
  lib/seguimiento/eventos.ts          # registrar en lead_eventos
  app/api/seguimiento/run/route.ts    # orquestador (el único endpoint nuevo)
  components/whatsapp/SeguimientoPanel.tsx  # bloque "Agente de seguimiento" para la ficha

MODIFICAR (lo único existente que se toca):
  components/whatsapp/LeadTraceability.tsx  # importa y renderiza <SeguimientoPanel/>
  docs/interno/LOGICA-PRISMA.md             # documentación al final

NO SE TOCA: app/api/whatsapp/dispatch/route.ts · el workflow PRISMA de n8n ·
            wa_conversations/wa_messages/wa_templates (ni una columna) · Evolution
```

Convención interna: cada módulo de `lib/seguimiento/` exporta funciones puras que reciben
datos y devuelven datos; los únicos que tocan red son `route.ts` (DB), `herramientas.ts`
(DB, solo lectura), `agente.ts` (LLM) y `ejecutor.ts` (dispatch) — siempre inyectables
para test.

Las 5 capas: **Capa 1** elegibilidad (SQL) → **Capa 2** prioridad (scoring
determinístico) → **Capa 3** decisión (loop de agente) → **Capa 4** ejecución (guardrails
+ dispatch existente) → **Capa 5** registro (tablas nuevas, panel).

---

# DÍA 1 — Verificar, migrar, tipar

### Task 0: Verificación del esquema real (solo lectura, sin OK necesario)

**Files:**
- Create: `scratch/_sa-task0-verificacion.md` (resultados; scratch no se commitea)

Las queries corren por la Management API de Supabase (recordar: devuelve solo el
resultado del ÚLTIMO statement — correr de a una).

- [ ] **Step 1: Confirmar valores reales de enums informales**

```sql
SELECT DISTINCT role FROM wa_messages LIMIT 20;
```
```sql
SELECT DISTINCT funnel_status, count(*) FROM wa_conversations GROUP BY 1;
```
```sql
SELECT DISTINCT visit_status, count(*) FROM wa_conversations GROUP BY 1;
```

- [ ] **Step 2: Enumerar las claves reales de `metricas` (alimenta el scoring de Task 6)**

```sql
SELECT k, count(*) FROM wa_conversations, jsonb_object_keys(metricas) k
GROUP BY k ORDER BY count(*) DESC;
```

- [ ] **Step 3: Confirmar las plantillas del sistema que existen de verdad**

```sql
SELECT template_name, status FROM wa_templates
WHERE agency_id = (SELECT agency_id FROM whatsapp_instances LIMIT 1)
  AND template_name LIKE 'ag%';
```
Anotar el nombre real de la plantilla de no-show (el nodo viejo `Enviar_Plantilla_V_NS`
la usaba) y de las 2 restantes de las 8 documentadas. Verificar también cuántas variables
esperan las `visita_recordatorio_*` reales (cotejar contra `wa_templates.components`).

- [ ] **Step 4: Confirmar dónde vive el email del director (para Task 19)**

```sql
SELECT column_name FROM information_schema.columns WHERE table_name = 'agencies';
```
```sql
SELECT column_name FROM information_schema.columns WHERE table_name = 'agents';
```

- [ ] **Step 5: Copiar el patrón de RLS que usan las tablas actuales (para la migración)**

```sql
SELECT tablename, policyname, qual FROM pg_policies WHERE tablename = 'wa_conversations';
```

- [ ] **Step 6: Volcar todo a `scratch/_sa-task0-verificacion.md`.** Si algún valor
  difiere de lo asumido en este plan (roles, plantillas, claves de metricas), **corregir
  las constantes del plan antes de seguir** — el plan manda, pero los datos reales mandan
  más.

### Task 1: Verificar las columnas reales de `properties` (solo lectura, sin OK)

La herramienta `leer_propiedad` (Task 7) consulta `properties`. Los nombres de columna
que usa el plan son candidatos — el dato real manda.

**Files:**
- Create: `scratch/_sa-task1-properties.md`

- [ ] **Step 1: Volcar el esquema de `properties`**

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'properties' ORDER BY ordinal_position;
```

- [ ] **Step 2: Confirmar qué columnas identifican y describen una propiedad publicada** —
  los equivalentes reales de: dirección, título de publicación, tipo de operación
  (venta/alquiler), precio, moneda, estado/disponibilidad, `notas_ia`. Anotar cómo se
  distingue una propiedad **activa** de una vendida/pausada:

```sql
SELECT DISTINCT status, count(*) FROM properties GROUP BY 1;
```
(ajustar el nombre `status` al que exista de verdad según el Step 1).

- [ ] **Step 3: Probar la búsqueda que va a usar la tool** con un texto real de la
  agencia de prueba (un barrio que aparezca en las conversaciones):

```sql
SELECT id, address FROM properties
WHERE agency_id = (SELECT agency_id FROM whatsapp_instances LIMIT 1)
  AND address ILIKE '%caseros%' LIMIT 5;
```

- [ ] **Step 4: Volcar todo a `scratch/_sa-task1-properties.md`** y corregir la constante
  `COLUMNAS_PROPIEDAD` de la Task 7 con los nombres reales antes de implementarla.

### Task 2: Auditoría del provisionador de plantillas (solo lectura, sin OK)

El provisionador **ya existe en PRISMA** (8 plantillas automáticas por agencia con
prefijo `ag<6hex>_`). La visión (Parte I) lo convierte en pieza central: hay que saber
exactamente qué hace hoy antes de extenderlo en la fase 2, y la fase 1 depende de que las
plantillas de seguimiento estén en su catálogo.

**Files:**
- Create: `scratch/_sa-task2-provisionador.md`

- [ ] **Step 1: Encontrar el provisionador en el repo** — grep por la creación de
  plantillas (`wa_templates`, el prefijo `ag`, "provision", nombres como
  `seg_f1_seguimiento`) y anotar: en qué archivo vive, **cuándo corre** (¿al registrar la
  agencia? ¿a mano? ¿endpoint?), y de dónde sale el catálogo (¿hardcodeado? ¿tabla?).
- [ ] **Step 2: Volcar el catálogo real y su estado en la agencia de prueba:**

```sql
SELECT template_name, status, created_at FROM wa_templates
WHERE agency_id = (SELECT agency_id FROM whatsapp_instances LIMIT 1)
ORDER BY template_name;
```

- [ ] **Step 3: Cruzar catálogo vs. necesidades y anotar el veredicto:**
  - **Fase 1:** ¿están `seg_f1/f2/f3`, `visita_recordatorio_24h/3h/1h` y la de no-show,
    todas `approved`? Si falta alguna → es bloqueante de la Task 17 (encendido) y se
    resuelve por el provisionador existente, no a mano.
  - **Fases 2+ (registrar, no construir ahora):** faltantes conocidas — plantilla(s) de
    aviso al **asesor** (handoff/visita esperando) y de tranquilidad al **cliente** ("tu
    consulta está con el asesor"). Anotar cuántas plantillas admite la WABA real (el
    límite sale de la cuenta de Meta — consultarlo, no asumirlo).
- [ ] **Step 4:** Si el provisionador NO corre automáticamente al registro de la agencia,
  anotarlo como brecha para la fase 2 (la visión pide "al registrarse, se crean todas
  juntas") — no se arregla en la fase 1.

### Task 3: Migración SQL — 4 tablas nuevas + 2 funciones (⚠️ REQUIERE OK DE LEONARDO)

**Files:**
- Create: `supabase/migrations/2026-08-22-super-agente-fase1.sql`

**Interfaces:**
- Produces: tablas `seguimiento_config`, `seguimiento_decisiones`, `compromisos`,
  `lead_eventos`; funciones `seguimiento_candidatos(int)` y
  `seguimiento_esperando_humano(int)`. Todo lo posterior depende de esto.

- [ ] **Step 1: Escribir la migración (aditiva, cero ALTER de tablas existentes)**

```sql
-- ═══ Config por agencia: la personalización es data ═══
create table if not exists seguimiento_config (
  agency_id              uuid primary key,
  modo                   text not null default 'apagado'
                         check (modo in ('apagado','sombra','activo')),
  silencio_minimo_horas  int  not null default 20,
  max_intentos           int  not null default 3,
  max_mensajes_dia       int  not null default 50,   -- presupuesto diario por agencia
  escalamiento_horas     int  not null default 2,    -- espera antes de avisar al director
  max_escalamientos_dia  int  not null default 3,
  llamadas_habilitadas   boolean not null default false,  -- habilitación L (Parte III)
  creado_en              timestamptz default now(),
  actualizado_en         timestamptz default now()
);

-- ═══ Toda decisión del agente queda registrada ═══
create table if not exists seguimiento_decisiones (
  id               uuid primary key default gen_random_uuid(),
  agency_id        uuid not null,
  conversation_id  uuid not null,
  modo             text not null check (modo in ('sombra','activo')),
  canal            text not null default 'whatsapp'
                   check (canal in ('whatsapp','email','llamada','interno')),
  accion           text not null check (accion in ('contactar','posponer','abandonar','escalar')),
  plantilla        text,
  frase_cierre     text,
  proximo_intento_horas int,
  razon            text not null,          -- en castellano, la ve el asesor
  confianza        numeric(3,2) not null,
  score            int not null default 0,
  contexto_snapshot jsonb not null default '{}',  -- el trace: pasos + tokens + metricas
  decision_cruda   jsonb not null default '{}',   -- salida literal del agente (incluye evidencia)
  ejecutada        boolean not null default false,
  resultado        text,                   -- enviada | bloqueada_<motivo> | error_<detalle>
  costo_usd        numeric(10,6),
  creado_en        timestamptz default now()
);
create index on seguimiento_decisiones (conversation_id, creado_en desc);
create index on seguimiento_decisiones (agency_id, creado_en desc);

-- ═══ Compromisos: lo que el sistema persigue (la pieza más valiosa) ═══
create table if not exists compromisos (
  id               uuid primary key default gen_random_uuid(),
  agency_id        uuid not null,
  conversation_id  uuid not null,
  tipo             text not null check (tipo in
                   ('visita_agendada','respuesta_pendiente','documentacion_pendiente',
                    'envio_prometido','llamada_prometida')),
  descripcion      text not null,
  asumido_por      text not null check (asumido_por in ('lead','asesor','agente')),
  vence_en         timestamptz,
  estado           text not null default 'activo'
                   check (estado in ('activo','cumplido','vencido','cancelado')),
  origen           text,                   -- decision_id o 'visita' o 'manual'
  metadata         jsonb default '{}',
  creado_en        timestamptz default now(),
  cerrado_en       timestamptz
);
create index on compromisos (conversation_id, estado);
create index on compromisos (agency_id, estado, vence_en);

-- ═══ Línea de tiempo por lead: la columna vertebral de la memoria unificada ═══
create table if not exists lead_eventos (
  id               bigserial primary key,
  agency_id        uuid not null,
  conversation_id  uuid not null,
  tipo             text not null,
  -- decision | envio | envio_bloqueado | compromiso_creado | compromiso_cerrado
  -- escalamiento | cambio_estado | error
  actor            text not null default 'agente_seguimiento',
  descripcion      text not null,          -- en castellano, legible
  datos            jsonb default '{}',
  ts               timestamptz default now()
);
create index on lead_eventos (conversation_id, ts desc);
create index on lead_eventos (agency_id, tipo, ts desc);

-- ═══ RLS: mismo patrón verificado de wa_conversations (24/8): el director ve toda su
--     agencia; el asesor solo sus conversaciones (wa_conversations.agent_id). El service
--     role (runner) bypassa RLS; estas policies son para la ficha en el navegador. ═══
alter table seguimiento_config     enable row level security;
alter table seguimiento_decisiones enable row level security;
alter table compromisos            enable row level security;
alter table lead_eventos           enable row level security;

create policy seguimiento_config_select on seguimiento_config for select
  using (agency_id = get_my_agency_id());

create policy seguimiento_decisiones_select on seguimiento_decisiones for select
  using (agency_id = get_my_agency_id() and (get_my_role() = 'director'
    or exists (select 1 from wa_conversations wc
               where wc.id = conversation_id and wc.agent_id = auth.uid())));

create policy compromisos_select on compromisos for select
  using (agency_id = get_my_agency_id() and (get_my_role() = 'director'
    or exists (select 1 from wa_conversations wc
               where wc.id = conversation_id and wc.agent_id = auth.uid())));

create policy lead_eventos_select on lead_eventos for select
  using (agency_id = get_my_agency_id() and (get_my_role() = 'director'
    or exists (select 1 from wa_conversations wc
               where wc.id = conversation_id and wc.agent_id = auth.uid())));

-- ═══ Capa 1: elegibilidad en SQL puro ═══
create or replace function seguimiento_candidatos(p_limit int default 40)
returns setof wa_conversations
language sql stable as $$
  select wc.*
  from wa_conversations wc
  join whatsapp_instances wi on wi.agency_id = wc.agency_id
  join seguimiento_config  sc on sc.agency_id = wc.agency_id
  where sc.modo in ('sombra','activo')
    and wc.requires_follow_up = true
    and wc.opt_out = false
    and wc.bot_active = true                          -- humano al mando ⇒ afuera
    and wc.next_follow_up_at <= now()
    and wc.funnel_status not in ('closed_won','closed_lost','snoozed')
    and wc.visit_status not in ('scheduled','confirmed')
    -- SOLO el nombre de metricas (decisión 24/8): sin él no hay plantilla, y el nombre
    -- del perfil de WhatsApp NO se usa jamás. Los sin-nombre son mayormente del envío
    -- masivo de reclutamiento, no leads de propiedades.
    and coalesce(btrim(wc.metricas->>'nombre'),'') <> ''
    and wi.flows_active = true
    and wi.templates_status = 'approved'
    -- regla de silencio: si hubo CUALQUIER mensaje hace menos de
    -- silencio_minimo_horas, la conversación está viva y acá no se toca nada
    and (wc.last_message_at is null
         or wc.last_message_at < now() - make_interval(hours => sc.silencio_minimo_horas))
    and wc.follow_ups_sent < sc.max_intentos
  order by wc.next_follow_up_at asc
  limit p_limit
$$;

-- ═══ Escalamiento: leads con humano a cargo que nadie atiende (versión mínima) ═══
create or replace function seguimiento_esperando_humano(p_horas int default 2)
returns setof wa_conversations
language sql stable as $$
  select wc.*
  from wa_conversations wc
  join seguimiento_config sc on sc.agency_id = wc.agency_id
  where sc.modo = 'activo'
    and wc.bot_active = false                          -- hubo handoff a humano
    and wc.opt_out = false
    and wc.last_message_at < now() - make_interval(hours => p_horas)
    -- nota: el filtro "último mensaje es del LEAD" se completa en código con el
    -- valor real de `role` confirmado en Task 0 Step 1 (ver escalamiento.ts)
$$;

-- ═══ Visitas auto-realizadas (portado del nodo viejo Auto_Realizada; columnas
--     verificadas 24/8 en scheduled_visits) ═══
create or replace function seguimiento_marcar_visitas_realizadas() returns void
language sql as $$
  update public.scheduled_visits set estado_visita = 'realizada'
  where estado_visita = 'confirmada'
    and (fecha_visita + hora_visita) at time zone 'America/Argentina/Buenos_Aires' < now();
$$;

-- Filas iniciales: LAS DOS agencias en sombra (decisión 24/8; sombra no envía nada)
insert into seguimiento_config (agency_id, modo) values
  ('57c6134b-89dc-4968-bd1a-27364cf99195', 'sombra'),  -- PRISMAIA - VAKDOR
  ('4962bf85-a92c-4c33-ba07-380686bbab76', 'sombra')   -- Central Real Estate (SOLO sombra)
on conflict (agency_id) do nothing;
```

- [ ] **Step 2: Pedir OK a Leonardo mostrando el SQL completo.** Sin OK, no se aplica.
- [ ] **Step 3: Aplicar por Management API.** Probar antes con `BEGIN … ROLLBACK` que el
  SQL compila contra la base real.
- [ ] **Step 4: Verificar:** `select * from seguimiento_config;` debe devolver 1 fila
  (PRISMAIA, modo sombra). `select * from seguimiento_candidatos(5);` debe devolver 0
  filas o filas válidas sin error.
- [ ] **Step 5: Commit**

```bash
git checkout main && git pull && git checkout -b feat/super-agente-fase-1
git add supabase/migrations/2026-08-22-super-agente-fase1.sql
git commit -m "feat(seguimiento): esquema del super agente fase 1 (4 tablas + 2 funciones, solo aditivo)"
```

### Task 4: Tipos y contratos (`tipos.ts`)

**Files:**
- Create: `lib/seguimiento/tipos.ts`
- Test: `lib/seguimiento/tipos.test.ts`

**Interfaces:**
- Produces: `PLANTILLAS`, `DecisionSchema`, `Decision`, `DecisionAgenteSchema`,
  `DecisionAgente` (= `Decision` + `evidencia`), `PasoAgente`, `Candidato`,
  `ConfigAgencia`, `CompromisoActivo` — los consume todo el resto del plan.

- [ ] **Step 1: Test que falla**

```ts
import { describe, it, expect } from "vitest"
import { DecisionSchema, DecisionAgenteSchema, PLANTILLAS } from "./tipos"

describe("DecisionSchema", () => {
  it("acepta una decisión de contactar válida", () => {
    const d = DecisionSchema.parse({
      accion: "contactar", plantilla: "seg_f1_seguimiento",
      frase_cierre: "¿Pudiste ver lo de la cochera que te preocupaba?",
      proximo_intento_horas: 72, razon: "Preguntó por cochera y no siguió; retomo esa duda puntual.",
      confianza: 0.85,
    })
    expect(d.accion).toBe("contactar")
  })
  it("rechaza contactar sin plantilla", () => {
    expect(() => DecisionSchema.parse({
      accion: "contactar", plantilla: null, frase_cierre: null,
      proximo_intento_horas: null, razon: "x".repeat(20), confianza: 0.9,
    })).toThrow()
  })
  it("rechaza confianza fuera de rango", () => {
    expect(() => DecisionSchema.parse({
      accion: "posponer", plantilla: null, frase_cierre: null,
      proximo_intento_horas: 48, razon: "El lead avisó que responde el lunes.", confianza: 1.4,
    })).toThrow()
  })
  it("las plantillas de seguimiento existen en el catálogo", () => {
    expect(PLANTILLAS.f1).toBe("seg_f1_seguimiento")
  })
})

describe("DecisionAgenteSchema", () => {
  it("exige evidencia además de los campos de la decisión", () => {
    const d = DecisionAgenteSchema.parse({
      accion: "contactar", plantilla: "seg_f1_seguimiento",
      frase_cierre: "¿Pudiste ver lo de la cochera que te preocupaba?",
      proximo_intento_horas: 72, razon: "Preguntó por cochera y no siguió.",
      evidencia: "Mensaje del 16/8 14:00: «¿Tiene cochera el PH?» — sin respuesta posterior del lead.",
      confianza: 0.85,
    })
    expect(d.evidencia).toContain("cochera")
  })
  it("rechaza evidencia vacía o de relleno", () => {
    expect(() => DecisionAgenteSchema.parse({
      accion: "posponer", plantilla: null, frase_cierre: null,
      proximo_intento_horas: 48, razon: "El lead avisó que responde el lunes.",
      evidencia: "n/a", confianza: 0.9,
    })).toThrow()
  })
  it("mantiene la coherencia: contactar sin plantilla se rechaza", () => {
    expect(() => DecisionAgenteSchema.parse({
      accion: "contactar", plantilla: null, frase_cierre: null,
      proximo_intento_horas: null, razon: "x".repeat(20),
      evidencia: "y".repeat(20), confianza: 0.9,
    })).toThrow()
  })
})
```

- [ ] **Step 2: Correr y ver que falla** — `npx vitest run lib/seguimiento/tipos.test.ts`
  → FAIL (módulo no existe).
- [ ] **Step 3: Implementar**

```ts
import { z } from "zod"

/** Nombres SIN prefijo de agencia: el dispatch antepone `ag<6hex>_` solo. */
export const PLANTILLAS = {
  f1: "seg_f1_seguimiento",
  f2: "seg_f2_valor",
  f3: "seg_f3_breakup",
  visita24: "visita_recordatorio_24h",
  visita3: "visita_recordatorio_3h",
  visita1: "visita_recordatorio_1h",
  noShow: "visita_post_noshow",          // nombre real verificado 24/8 (Task 0)
  reactivacion: "reactivacion_snoozed",  // la 8ª del catálogo; candidata futura del decisor
} as const

/*
 * Variables por plantilla (cuerpos reales verificados 24/8 en whatsapp-templates.ts):
 *   f1/f2:            [nombre, frase]      f3: [nombre] — SIN frase, el cierre es fijo
 *   visita24/visita3: [nombre, hora, direccion]     visita1: [nombre, hora]
 *   noShow:           [nombre]            reactivacion: [nombre, frase]
 */

const camposDecision = {
  accion: z.enum(["contactar", "posponer", "abandonar", "escalar"]),
  plantilla: z.enum([PLANTILLAS.f1, PLANTILLAS.f2, PLANTILLAS.f3]).nullable(),
  /** La frase que completa la variable {{2}} de la plantilla. */
  frase_cierre: z.string().min(5).max(300).nullable(),
  proximo_intento_horas: z.number().int().min(4).max(720).nullable(),
  /** En castellano. La ve el asesor en la ficha. */
  razon: z.string().min(10).max(500),
  confianza: z.number().min(0).max(1),
}

type CamposDecision = {
  accion: string; plantilla: string | null; frase_cierre: string | null
  proximo_intento_horas: number | null
}

function validarCoherencia(d: CamposDecision, ctx: z.RefinementCtx) {
  if (d.accion === "contactar" && (!d.plantilla || !d.frase_cierre))
    ctx.addIssue({ code: "custom", message: "contactar exige plantilla y frase_cierre" })
  if (d.accion === "posponer" && d.proximo_intento_horas == null)
    ctx.addIssue({ code: "custom", message: "posponer exige proximo_intento_horas" })
}

export const DecisionSchema = z.object(camposDecision).superRefine(validarCoherencia)
export type Decision = z.infer<typeof DecisionSchema>

/** La decisión del agente suma la evidencia citada. Asignable a Decision. */
export const DecisionAgenteSchema = z.object({
  ...camposDecision,
  /** Qué dato concreto sostiene la decisión: el mensaje, la métrica o la propiedad LEÍDA. */
  evidencia: z.string().min(15).max(400),
}).superRefine(validarCoherencia)
export type DecisionAgente = z.infer<typeof DecisionAgenteSchema>

/** Un paso de investigación del loop. Se guarda en contexto_snapshot y se ve en el panel. */
export interface PasoAgente {
  herramienta: string
  input: Record<string, unknown>
  /** Primeros 200 caracteres del resultado, para el trace. */
  resumen: string
}

/** Fila de wa_conversations que devuelve seguimiento_candidatos(). Solo lo que se usa. */
export interface Candidato {
  id: string
  agency_id: string
  contact_phone: string
  contact_name: string | null
  funnel_status: string
  visit_status: string
  visit_scheduled_at: string | null
  visit_address: string | null
  follow_ups_sent: number
  next_follow_up_at: string | null
  last_message_at: string | null
  metricas: Record<string, unknown>
  follow_ups_history: Array<Record<string, unknown>> | null
  requires_follow_up: boolean
  bot_active: boolean
  opt_out: boolean
}

export interface ConfigAgencia {
  agency_id: string
  modo: "apagado" | "sombra" | "activo"
  silencio_minimo_horas: number
  max_intentos: number
  max_mensajes_dia: number
  escalamiento_horas: number
  max_escalamientos_dia: number
}

export interface CompromisoActivo {
  tipo: string
  descripcion: string
  asumido_por: string
  vence_en: string | null
}
```

- [ ] **Step 4: Correr y ver que pasa** — `npx vitest run lib/seguimiento/tipos.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git add lib/seguimiento/tipos.ts lib/seguimiento/tipos.test.ts && git commit -m "feat(seguimiento): tipos, contrato Zod de la decision y evidencia"`

---

# DÍA 2 — Guardrails y prioridad

### Task 5: Guardrails duros en código (`guardrails.ts`)

**Files:**
- Create: `lib/seguimiento/guardrails.ts`
- Test: `lib/seguimiento/guardrails.test.ts`

**Interfaces:**
- Consumes: `Candidato`, `ConfigAgencia`, `Decision` de `tipos.ts`.
- Produces: `puedeEjecutar(decision, candidato, config, enviadosHoyAgencia): { ok: true } | { ok: false; motivo: string }`
  y `sigueElegible(antes: Candidato, ahora: Candidato): boolean`.

La Capa 1 (SQL) ya filtró la mayoría. Esto es la **doble verificación antes de ejecutar**
— porque entre la decisión y el envío pueden pasar minutos y el lead puede haber escrito.
Ojo con las fechas: el guardrail "1 mensaje por día" compara el **día argentino**, no el
UTC — entre las 21:00 y las 23:59 AR el día UTC ya es el siguiente, justo dentro de la
ventana de envío (6-23 AR).

- [ ] **Step 1: Test que falla**

```ts
import { describe, it, expect } from "vitest"
import { puedeEjecutar, sigueElegible } from "./guardrails"
import type { Candidato, ConfigAgencia, Decision } from "./tipos"

const config: ConfigAgencia = {
  agency_id: "a1", modo: "activo", silencio_minimo_horas: 20,
  max_intentos: 3, max_mensajes_dia: 50, escalamiento_horas: 2, max_escalamientos_dia: 3,
}
const base: Candidato = {
  id: "c1", agency_id: "a1", contact_phone: "+5491100000000", contact_name: "Test",
  funnel_status: "open", visit_status: "none", visit_scheduled_at: null, visit_address: null,
  follow_ups_sent: 1, next_follow_up_at: null, last_message_at: "2026-08-15T10:00:00Z",
  metricas: { nombre: "Test" }, follow_ups_history: [], requires_follow_up: true,
  bot_active: true, opt_out: false,
}
const decision: Decision = {
  accion: "contactar", plantilla: "seg_f1_seguimiento",
  frase_cierre: "¿Seguís buscando en la zona?", proximo_intento_horas: 72,
  razon: "Lead tibio con búsqueda definida, retomo con pregunta suave.", confianza: 0.8,
}

describe("puedeEjecutar", () => {
  it("bloquea confianza < 0.5", () => {
    const r = puedeEjecutar({ ...decision, confianza: 0.4 }, base, config, 0)
    expect(r).toEqual({ ok: false, motivo: "confianza_baja" })
  })
  it("bloquea si la agencia agotó el presupuesto diario", () => {
    const r = puedeEjecutar(decision, base, config, 50)
    expect(r).toEqual({ ok: false, motivo: "presupuesto_diario_agotado" })
  })
  it("bloquea si ya se le mandó un seguimiento hoy (1 por día)", () => {
    const hoy = new Date().toISOString()
    const c = { ...base, follow_ups_history: [{ at: hoy, type: "seg_f1_seguimiento" }] }
    const r = puedeEjecutar(decision, c, config, 0)
    expect(r).toEqual({ ok: false, motivo: "ya_contactado_hoy" })
  })
  it("compara el día en hora argentina, no UTC", () => {
    // 22:30 AR de ayer: NO debe contar como "contactado hoy"
    const ayer2230AR = new Date()
    ayer2230AR.setDate(ayer2230AR.getDate() - 1)
    ayer2230AR.setHours(22, 30, 0, 0)
    const c = { ...base, follow_ups_history: [{ at: ayer2230AR.toISOString(), type: "seg_f1_seguimiento" }] }
    expect(puedeEjecutar(decision, c, config, 0).ok).toBe(true)
  })
  it("bloquea intentos agotados", () => {
    const r = puedeEjecutar(decision, { ...base, follow_ups_sent: 3 }, config, 0)
    expect(r).toEqual({ ok: false, motivo: "max_intentos" })
  })
  it("deja pasar el caso sano", () => {
    expect(puedeEjecutar(decision, base, config, 5).ok).toBe(true)
  })
})

describe("sigueElegible (releída justo antes de enviar)", () => {
  it("aborta si entró un mensaje nuevo desde la decisión", () => {
    const ahora = { ...base, last_message_at: "2026-08-18T09:00:00Z" }
    expect(sigueElegible(base, ahora)).toBe(false)
  })
  it("aborta si un humano tomó el chat (bot_active pasó a false)", () => {
    expect(sigueElegible(base, { ...base, bot_active: false })).toBe(false)
  })
  it("aborta si el lead hizo opt-out en el medio", () => {
    expect(sigueElegible(base, { ...base, opt_out: true })).toBe(false)
  })
  it("pasa si nada cambió", () => {
    expect(sigueElegible(base, { ...base })).toBe(true)
  })
})
```

- [ ] **Step 2: Correr → FAIL.**
- [ ] **Step 3: Implementar**

```ts
import type { Candidato, ConfigAgencia, Decision } from "./tipos"

type Veredicto = { ok: true } | { ok: false; motivo: string }

/** Día calendario argentino de una fecha (el guardrail diario compara días AR, no UTC). */
const DIA_AR = (d: Date | string) =>
  new Date(d).toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" })

/** ¿Ya salió una plantilla de seguimiento hoy (día argentino)? */
function contactadoHoy(c: Candidato): boolean {
  const hoy = DIA_AR(new Date())
  return (c.follow_ups_history ?? []).some(
    (e) => typeof e.at === "string" && DIA_AR(e.at as string) === hoy
  )
}

export function puedeEjecutar(
  d: Decision, c: Candidato, config: ConfigAgencia, enviadosHoyAgencia: number
): Veredicto {
  if (d.accion !== "contactar") return { ok: true }   // solo el envío tiene guardrails de envío
  if (d.confianza < 0.5) return { ok: false, motivo: "confianza_baja" }
  if (enviadosHoyAgencia >= config.max_mensajes_dia)
    return { ok: false, motivo: "presupuesto_diario_agotado" }
  if (contactadoHoy(c)) return { ok: false, motivo: "ya_contactado_hoy" }
  if (c.follow_ups_sent >= config.max_intentos) return { ok: false, motivo: "max_intentos" }
  if (c.opt_out) return { ok: false, motivo: "opt_out" }
  if (!c.bot_active) return { ok: false, motivo: "humano_al_mando" }
  return { ok: true }
}

/** Releer la conversación justo antes de despachar: si algo cambió, no se envía. */
export function sigueElegible(antes: Candidato, ahora: Candidato): boolean {
  if (ahora.last_message_at !== antes.last_message_at) return false  // habló alguien
  if (!ahora.bot_active) return false
  if (ahora.opt_out) return false
  if (!ahora.requires_follow_up) return false
  if (ahora.visit_status === "scheduled" || ahora.visit_status === "confirmed") return false
  return true
}
```

- [ ] **Step 4: Correr → PASS.**
- [ ] **Step 5: Commit** — `git add lib/seguimiento/guardrails.ts lib/seguimiento/guardrails.test.ts && git commit -m "feat(seguimiento): guardrails duros en codigo (doble verificacion pre-envio, dia AR)"`

### Task 6: Scoring determinístico (`prioridad.ts`)

**Files:**
- Create: `lib/seguimiento/prioridad.ts`
- Test: `lib/seguimiento/prioridad.test.ts`

**Interfaces:**
- Consumes: `Candidato`, `CompromisoActivo` de `tipos.ts`.
- Produces: `calcularScore(c: Candidato, compromisos: CompromisoActivo[]): number` — lo
  usa el runner para ordenar y cortar la cola (los top N van al agente; el resto espera
  la próxima corrida).

**Nota:** las claves de `metricas` usadas acá deben cotejarse contra el volcado real de
Task 0 Step 2. Las de abajo son las candidatas; si el nombre real difiere, se ajusta la
constante — la lógica no cambia.

- [ ] **Step 1: Test que falla**

```ts
import { describe, it, expect } from "vitest"
import { calcularScore } from "./prioridad"
import type { Candidato } from "./tipos"

const base: Candidato = {
  id: "c1", agency_id: "a1", contact_phone: "+549110000", contact_name: "T",
  funnel_status: "open", visit_status: "none", visit_scheduled_at: null, visit_address: null,
  follow_ups_sent: 0, next_follow_up_at: null, last_message_at: null,
  metricas: { nombre: "T" }, follow_ups_history: [], requires_follow_up: true,
  bot_active: true, opt_out: false,
}

describe("calcularScore", () => {
  it("un compromiso por vencer pesa más que cualquier señal", () => {
    const conCompromiso = calcularScore(base, [{
      tipo: "respuesta_pendiente", descripcion: "x", asumido_por: "asesor",
      vence_en: new Date(Date.now() + 3 * 3600e3).toISOString(),
    }])
    const conPresupuesto = calcularScore(
      { ...base, metricas: { nombre: "T", presupuesto_max: "150000" } }, [])
    expect(conCompromiso).toBeGreaterThan(conPresupuesto)
  })
  it("cada intento previo sin respuesta resta", () => {
    expect(calcularScore({ ...base, follow_ups_sent: 2 }, []))
      .toBeLessThan(calcularScore(base, []))
  })
  it("nunca devuelve negativo", () => {
    expect(calcularScore({ ...base, follow_ups_sent: 3 }, [])).toBeGreaterThanOrEqual(0)
  })
})
```

- [ ] **Step 2: Correr → FAIL.**
- [ ] **Step 3: Implementar**

```ts
import type { Candidato, CompromisoActivo } from "./tipos"

/** Claves de metricas con señal de compra. Verificadas 24/8 contra el volcado real (Task 0). */
const SENALES_POSITIVAS: Array<[clave: string, puntos: number]> = [
  ["presupuesto_max", 30],   // la clave real (no existe "presupuesto")
  ["zona", 15],
  ["propiedad_interes", 25],
  ["apto_credito", 10],
  ["urgencia", 15],
  ["email", 10],
]

export function calcularScore(c: Candidato, compromisos: CompromisoActivo[]): number {
  let score = 0

  // La señal más fuerte: compromiso vencido o por vencer en <6h
  const seisHoras = Date.now() + 6 * 3600e3
  if (compromisos.some((k) => k.vence_en && new Date(k.vence_en).getTime() < seisHoras))
    score += 40

  for (const [clave, puntos] of SENALES_POSITIVAS) {
    const v = c.metricas?.[clave]
    if (v !== undefined && v !== null && String(v).trim() !== "" && String(v) !== "false")
      score += puntos
  }

  if (c.visit_status === "completed" || c.funnel_status === "visited") score += 20
  score -= 10 * c.follow_ups_sent          // cada intento sin respuesta enfría

  return Math.max(0, score)
}
```

- [ ] **Step 4: Correr → PASS.** Ajustar `SENALES_POSITIVAS` con las claves reales de
  Task 0 (los tests no dependen de los nombres exactos, salvo `presupuesto` — renombrar
  en ambos lados si difiere).
- [ ] **Step 5: Commit** — `git add lib/seguimiento/prioridad.ts lib/seguimiento/prioridad.test.ts && git commit -m "feat(seguimiento): scoring deterministico de prioridad (capa 2)"`

---

# DÍA 3 — El cerebro: herramientas, semilla y el loop del agente

### Task 7: Las herramientas de solo lectura (`herramientas.ts`)

**Files:**
- Create: `lib/seguimiento/herramientas.ts`
- Test: `lib/seguimiento/herramientas.test.ts`

**Interfaces:**
- Consumes: `Candidato` de `tipos.ts`; `SupabaseClient` (service role, se lo pasa el runner).
- Produces: `interface Herramientas` (el contrato que consume el loop de la Task 9 —
  inyectable para test) y `crearHerramientas(db, candidato): Herramientas`. Cada
  herramienta devuelve **texto plano compacto** (es lo que lee el modelo) y ante error de
  DB devuelve el error como texto — nunca lanza: un fallo de una tool no debe matar el
  loop; el modelo decide con lo que tiene o baja la confianza.

- [ ] **Step 1: Test que falla** (con un mock mínimo de Supabase por método encadenado)

```ts
import { describe, it, expect, vi } from "vitest"
import { crearHerramientas } from "./herramientas"
import type { Candidato } from "./tipos"

const base = {
  id: "c1", agency_id: "a1", contact_phone: "+549110000", contact_name: "Laura",
  funnel_status: "open", visit_status: "none", visit_scheduled_at: null, visit_address: null,
  follow_ups_sent: 1, next_follow_up_at: null, last_message_at: null,
  metricas: { nombre: "Laura" }, follow_ups_history: [], requires_follow_up: true,
  bot_active: true, opt_out: false,
} as Candidato

/** Mock encadenable: cada from() devuelve un builder cuyo await resuelve `respuesta`. */
function dbMock(respuesta: { data: unknown; error: null | { message: string } }) {
  const builder: Record<string, unknown> = {}
  for (const m of ["select", "eq", "or", "order", "limit", "in", "gte"])
    builder[m] = vi.fn().mockReturnValue(builder)
  builder.then = (resolve: (v: unknown) => void) => resolve(respuesta)
  return { from: vi.fn().mockReturnValue(builder) } as never
}

describe("leer_mensajes", () => {
  it("devuelve los mensajes viejo→nuevo con autor y fecha", async () => {
    const h = crearHerramientas(dbMock({
      data: [
        { role: "bot", content: "Sí, cochera pasante.", created_at: "2026-08-16T14:00:00Z" },
        { role: "user", content: "¿Tiene cochera el PH?", created_at: "2026-08-16T13:58:00Z" },
      ], error: null,
    }), base)
    const t = await h.leer_mensajes({ cantidad: 10 })
    expect(t.indexOf("¿Tiene cochera")).toBeLessThan(t.indexOf("cochera pasante"))
    expect(t).toContain("[user]")
  })
  it("sin mensajes lo dice en texto, no explota", async () => {
    const h = crearHerramientas(dbMock({ data: [], error: null }), base)
    expect(await h.leer_mensajes({})).toContain("no hay mensajes")
  })
  it("un error de DB vuelve como texto, no como excepción", async () => {
    const h = crearHerramientas(dbMock({ data: null, error: { message: "timeout" } }), base)
    expect(await h.leer_mensajes({})).toContain("timeout")
  })
})

describe("leer_propiedad", () => {
  it("cuando no hay coincidencias lo dice explícitamente y prohíbe nombrarla", async () => {
    const h = crearHerramientas(dbMock({ data: [], error: null }), base)
    const t = await h.leer_propiedad({ busqueda: "castillo en la luna" })
    expect(t).toMatch(/NO se encontró/i)
    expect(t).toMatch(/no la menciones/i)
  })
  it("sanitiza la búsqueda para el filtro .or de PostgREST", async () => {
    const db = dbMock({ data: [], error: null })
    const h = crearHerramientas(db, base)
    await h.leer_propiedad({ busqueda: "PH, (Caseros) 50%" })
    const builder = (db as { from: ReturnType<typeof vi.fn> }).from.mock.results[0].value
    const patron = builder.or.mock.calls[0][0] as string
    // la coma y los paréntesis del INPUT se sanean (la coma que separa las dos
    // condiciones del .or es propia del patrón y sí tiene que estar)
    expect(patron).toContain("PH Caseros 50")
    expect(patron).not.toContain("(Caseros)")
  })
})
```

- [ ] **Step 2: Correr → FAIL.** `npx vitest run lib/seguimiento/herramientas.test.ts`
- [ ] **Step 3: Implementar**

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Candidato } from "./tipos"

/** Contrato de las herramientas del agente. TODAS de solo lectura. Inyectable para test. */
export interface Herramientas {
  leer_mensajes(input: { cantidad?: number }): Promise<string>
  leer_intentos_previos(input: Record<string, never>): Promise<string>
  leer_compromisos(input: Record<string, never>): Promise<string>
  leer_propiedad(input: { busqueda: string }): Promise<string>
}

/** Columnas reales de properties (verificadas 24/8, Task 1). `status` es la OPERACIÓN
 *  (Venta/Alquiler); la disponibilidad es `is_active`. `notas_ia` es jsonb. */
const COLUMNAS_PROPIEDAD = "id, title, address, city, status, is_active, price, currency, notas_ia"

export function crearHerramientas(db: SupabaseClient, c: Candidato): Herramientas {
  return {
    async leer_mensajes({ cantidad = 10 }) {
      const n = Math.min(Math.max(cantidad, 1), 50)
      const { data, error } = await db.from("wa_messages")
        .select("role, content, created_at")
        .eq("conversation_id", c.id)
        .order("created_at", { ascending: false }).limit(n)
      if (error) return `error leyendo mensajes: ${error.message}`
      if (!data?.length) return "(no hay mensajes en esta conversación)"
      return [...data].reverse()
        .map((m) => `[${String(m.created_at).slice(0, 16)}] [${m.role}] ${String(m.content).slice(0, 400)}`)
        .join("\n")
    },

    async leer_intentos_previos() {
      const { data, error } = await db.from("seguimiento_decisiones")
        .select("plantilla, razon, creado_en, resultado")
        .eq("conversation_id", c.id).eq("accion", "contactar")
        .order("creado_en", { ascending: false }).limit(5)
      if (error) return `error leyendo intentos: ${error.message}`
      if (!data?.length) return "(ningún intento de seguimiento previo)"
      return data.map((i) =>
        `- ${String(i.creado_en).slice(0, 10)}: ${i.plantilla ?? "sin plantilla"} — ${i.razon}` +
        (i.resultado ? ` [${i.resultado}]` : "")
      ).join("\n")
    },

    async leer_compromisos() {
      const { data, error } = await db.from("compromisos")
        .select("tipo, descripcion, asumido_por, vence_en")
        .eq("conversation_id", c.id).eq("estado", "activo")
      if (error) return `error leyendo compromisos: ${error.message}`
      if (!data?.length) return "(sin compromisos activos)"
      return data.map((k) =>
        `- [${k.tipo}] ${k.descripcion} (asumido por ${k.asumido_por}${k.vence_en ? `, vence ${k.vence_en}` : ""})`
      ).join("\n")
    },

    async leer_propiedad({ busqueda }) {
      // PostgREST parsea el filtro .or con comas y paréntesis: se sanean del input
      const q = busqueda.replace(/[,()%]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80)
      if (!q) return "búsqueda vacía: pasá una dirección, barrio o parte del título"
      // city va en el OR: las direcciones platenses son "133 entre 45 y 46" y el
      // barrio/ciudad vive en city (verificado 24/8: sin city, "La Plata" no matchea)
      const { data, error } = await db.from("properties")
        .select(COLUMNAS_PROPIEDAD)
        .eq("agency_id", c.agency_id)
        .or(`address.ilike.%${q}%,title.ilike.%${q}%,city.ilike.%${q}%`)
        .limit(3)
      if (error) return `error consultando propiedades: ${error.message}`
      if (!data?.length)
        return `NO se encontró ninguna propiedad de la agencia que coincida con «${q}». ` +
               `No la menciones como disponible en el mensaje.`
      return data.map((p: Record<string, unknown>) => [
        `• ${p.title ?? p.address} — ${p.address ?? ""}, ${p.city ?? ""} (${p.status ?? "?"})` +
          (p.is_active ? "" : " ⚠️ NO DISPONIBLE: no la ofrezcas"),
        `  precio: ${p.price ?? "?"} ${p.currency ?? ""}`,
        p.notas_ia ? `  notas del asesor: ${JSON.stringify(p.notas_ia).slice(0, 200)}` : null,
      ].filter(Boolean).join("\n")).join("\n")
    },
  }
}
```

- [ ] **Step 4: Correr → PASS.** Ajustar `COLUMNAS_PROPIEDAD` y el render con lo
  verificado en Task 1.
- [ ] **Step 5: Commit** — `git add lib/seguimiento/herramientas.ts lib/seguimiento/herramientas.test.ts && git commit -m "feat(seguimiento): herramientas de solo lectura del agente"`

### Task 8: La semilla (`semilla.ts`)

El user-message inicial del loop, **mínimo a propósito**: solo lo que el agente necesita
para decidir QUÉ investigar. Todo lo demás lo pide por herramientas.

**Files:**
- Create: `lib/seguimiento/semilla.ts`
- Test: `lib/seguimiento/semilla.test.ts`

**Interfaces:**
- Consumes: `Candidato` de `tipos.ts`.
- Produces: `renderizarSemilla(c: Candidato, score: number, compromisosActivos: number, ahoraISO: string): string`
  — determinística: mismo input, mismo texto (la consume el runner en Task 10).

- [ ] **Step 1: Test que falla**

```ts
import { describe, it, expect } from "vitest"
import { renderizarSemilla } from "./semilla"
import type { Candidato } from "./tipos"

const base = {
  id: "c1", agency_id: "a1", contact_phone: "+549110000", contact_name: "Laura",
  funnel_status: "open", visit_status: "none", visit_scheduled_at: null, visit_address: null,
  follow_ups_sent: 1, next_follow_up_at: null, last_message_at: "2026-08-16T14:00:00Z",
  metricas: { nombre: "Laura", zona: "Caseros", presupuesto: "120000" },
  follow_ups_history: [], requires_follow_up: true, bot_active: true, opt_out: false,
} as Candidato

describe("renderizarSemilla", () => {
  it("incluye identidad, origen, etapa, métricas y la consigna de investigar", () => {
    const t = renderizarSemilla(base, 55, 1, "2026-08-22T15:00:00-03:00", "Whatsapp-Consulta")
    expect(t).toContain("Laura")
    expect(t).toContain("Caseros")
    expect(t).toContain("Whatsapp-Consulta")
    expect(t).toContain("Intentos de seguimiento ya enviados: 1")
    expect(t).toContain("Compromisos activos: 1")
    expect(t).toMatch(/investig/i)
  })
  it("el nombre sale de metricas, jamás del perfil de WhatsApp", () => {
    const t = renderizarSemilla(
      { ...base, contact_name: "🔥Lau🔥", metricas: {} }, 0, 0, "2026-08-22T15:00:00-03:00")
    expect(t).not.toContain("🔥")
    expect(t).toContain("sin nombre capturado")
  })
  it("no incluye los mensajes de la conversación (eso es de leer_mensajes)", () => {
    const t = renderizarSemilla(base, 55, 0, "2026-08-22T15:00:00-03:00")
    expect(t).not.toContain("cochera")
  })
  it("no explota con métricas vacías", () => {
    const t = renderizarSemilla({ ...base, metricas: {} }, 0, 0, "2026-08-22T15:00:00-03:00")
    expect(t).toContain("(sin datos capturados)")
  })
})
```

- [ ] **Step 2: Correr → FAIL. Implementar**

```ts
import type { Candidato } from "./tipos"

/** El user-message inicial del loop. Mínimo: el agente investiga el resto con herramientas. */
export function renderizarSemilla(
  c: Candidato, score: number, compromisosActivos: number, ahoraISO: string,
  clasificacion: string | null = null,
): string {
  const metricas = Object.entries(c.metricas ?? {})
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
    .map(([k, v]) => `  - ${k}: ${String(v)}`)
    .join("\n") || "  (sin datos capturados)"

  return [
    `Fecha y hora actual (Argentina): ${ahoraISO}`,
    // El nombre válido es SOLO el de metricas (jamás el del perfil de WhatsApp)
    `Lead: ${String(c.metricas?.nombre ?? "").trim() || "sin nombre capturado"} · etapa: ${c.funnel_status} · score interno: ${score}`,
    `Origen del contacto: ${clasificacion ?? "desconocido"} (Whatsapp-Consulta = consultó él; Reclutamiento* = entró por un envío masivo de reclutamiento, NO es lead de propiedades)`,
    `Último mensaje (de cualquiera): ${c.last_message_at ?? "nunca"}`,
    `Intentos de seguimiento ya enviados: ${c.follow_ups_sent}`,
    `Compromisos activos: ${compromisosActivos} (el detalle con leer_compromisos)`,
    `Datos capturados del lead:\n${metricas}`,
    `Investigá con tus herramientas lo que necesites y emití tu decisión con emitir_decision.`,
  ].join("\n\n")
}
```

- [ ] **Step 3: Correr → PASS.**
- [ ] **Step 4: Commit** — `git add lib/seguimiento/semilla.ts lib/seguimiento/semilla.test.ts && git commit -m "feat(seguimiento): semilla minima del loop"`

### Task 9: El loop del agente (`agente.ts`)

El corazón del sistema. Loop manual sobre `client.messages.create` con tools; la decisión
sale como tool call de `emitir_decision`, validada con Zod; los errores de validación y
los requisitos de investigación vuelven al modelo como `tool_result` con `is_error` para
que se auto-corrija dentro del mismo loop.

**Files:**
- Create: `lib/seguimiento/agente.ts`
- Test: `lib/seguimiento/agente.test.ts`

**Interfaces:**
- Consumes: `Herramientas` (Task 7); `DecisionAgenteSchema`, `PasoAgente`, `PLANTILLAS`
  (Task 4); `MODELO`, `verificarNoTruncada` de `@/lib/admin-vakdor/marketing/claude`;
  `Anthropic` de `@anthropic-ai/sdk`.
- Produces: `decidirConAgente(semilla, herramientas, llamar?): Promise<ResultadoAgente>`
  con `ResultadoAgente = { decision: DecisionAgente; pasos: PasoAgente[]; tokens: { entrada; salida; cacheLeido } }`;
  `estimarCostoUSD(tokens): number`; `PROMPT_AGENTE`; `MAX_ITERACIONES`. `llamar` es
  inyectable: `(messages: Anthropic.MessageParam[]) => Promise<Anthropic.Message>` — los
  tests pasan respuestas guionadas, cero red.

- [ ] **Step 1: Test que falla**

```ts
import { describe, it, expect, vi } from "vitest"
import { decidirConAgente, MAX_ITERACIONES, PROMPT_AGENTE } from "./agente"
import type { Herramientas } from "./herramientas"

const decisionValida = {
  accion: "contactar", plantilla: "seg_f1_seguimiento",
  frase_cierre: "¿Pudiste ver lo de la cochera que te preocupaba?",
  proximo_intento_horas: 72, razon: "Preguntó por cochera y no siguió; retomo esa duda.",
  evidencia: "Mensaje [user] del 16/8: «¿Tiene cochera el PH?» — sin respuesta posterior.",
  confianza: 0.85,
}

const toolUse = (name: string, input: unknown, id = `t_${name}`) =>
  ({ type: "tool_use", id, name, input })

/** Respuesta guionada de la API: content + usage mínimos. */
const respuesta = (content: unknown[], stop = "tool_use") => ({
  stop_reason: stop, content,
  usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 400 },
}) as never

/** llamar() que devuelve el guion en orden. */
const guion = (...respuestas: unknown[]) => {
  let i = 0
  return vi.fn(async () => respuestas[i++] as never)
}

const herramientasMock = (): Herramientas & { llamadas: string[] } => {
  const llamadas: string[] = []
  const tool = (nombre: string, salida: string) => async () => { llamadas.push(nombre); return salida }
  return {
    llamadas,
    leer_mensajes: tool("leer_mensajes", "[16/8] [user] ¿Tiene cochera el PH?"),
    leer_intentos_previos: tool("leer_intentos_previos", "(ningún intento previo)"),
    leer_compromisos: tool("leer_compromisos", "(sin compromisos activos)"),
    leer_propiedad: tool("leer_propiedad", "• PH Caseros (venta) precio: 120000 USD · estado: activa"),
  }
}

describe("decidirConAgente", () => {
  it("flujo feliz: investiga y emite la decisión con su trace", async () => {
    const h = herramientasMock()
    const llamar = guion(
      respuesta([toolUse("leer_mensajes", { cantidad: 10 })]),
      respuesta([toolUse("leer_intentos_previos", {})]),
      respuesta([toolUse("emitir_decision", decisionValida)]),
    )
    const r = await decidirConAgente("semilla", h, llamar)
    expect(r.decision.accion).toBe("contactar")
    expect(r.pasos.map((p) => p.herramienta)).toEqual(["leer_mensajes", "leer_intentos_previos"])
    expect(r.tokens.entrada).toBe(300)   // 3 llamadas × 100
    expect(h.llamadas).toContain("leer_mensajes")
  })

  it("rechaza contactar sin haber leído los mensajes y el modelo se corrige", async () => {
    const h = herramientasMock()
    const llamar = guion(
      respuesta([toolUse("emitir_decision", decisionValida)]),        // apurado: sin investigar
      respuesta([toolUse("leer_mensajes", {}), toolUse("leer_intentos_previos", {})]),
      respuesta([toolUse("emitir_decision", decisionValida, "t2")]),
    )
    const r = await decidirConAgente("semilla", h, llamar)
    expect(r.decision.accion).toBe("contactar")
    // la primera emisión volvió como error: el 2º mensaje que recibió la API lo contiene
    const segundaLlamada = (llamar.mock.calls[1][0] as Array<{ content: unknown }>)
    const resultados = JSON.stringify(segundaLlamada.at(-1))
    expect(resultados).toContain("leer_mensajes")
    expect(resultados).toContain("is_error")
  })

  it("decisión inválida (Zod) vuelve como error y no corta el loop", async () => {
    const h = herramientasMock()
    const invalida = { ...decisionValida, plantilla: null }   // contactar sin plantilla
    const llamar = guion(
      respuesta([toolUse("leer_mensajes", {}), toolUse("leer_intentos_previos", {})]),
      respuesta([toolUse("emitir_decision", invalida)]),
      respuesta([toolUse("emitir_decision", decisionValida, "t3")]),
    )
    const r = await decidirConAgente("semilla", h, llamar)
    expect(r.decision.plantilla).toBe("seg_f1_seguimiento")
  })

  it("agotar las iteraciones sin decisión válida tira error (no se manda nada)", async () => {
    const h = herramientasMock()
    const llamar = vi.fn(async () => respuesta([toolUse("leer_compromisos", {})]))
    await expect(decidirConAgente("semilla", h, llamar)).rejects.toThrow(/iteraciones/)
    expect(llamar).toHaveBeenCalledTimes(MAX_ITERACIONES)
  })

  it("respuesta truncada por max_tokens = fallo de la llamada", async () => {
    const h = herramientasMock()
    const llamar = guion(respuesta([], "max_tokens"))
    await expect(decidirConAgente("semilla", h, llamar)).rejects.toThrow(/max_tokens/)
  })

  it("terminar sin tool call es fallo (el agente DEBE decidir por herramienta)", async () => {
    const h = herramientasMock()
    const llamar = guion(respuesta([{ type: "text", text: "creo que hay que contactar" }], "end_turn"))
    await expect(decidirConAgente("semilla", h, llamar)).rejects.toThrow(/sin emitir/)
  })

  it("el prompt prohíbe lo que el negocio prohíbe y exige verificar", () => {
    expect(PROMPT_AGENTE).toContain("expensas")
    expect(PROMPT_AGENTE).toContain("PROHIBIDO")
    expect(PROMPT_AGENTE).toContain("leer_propiedad")
  })
})
```

- [ ] **Step 2: Correr → FAIL. Implementar**

```ts
import Anthropic from "@anthropic-ai/sdk"
import { MODELO, verificarNoTruncada } from "@/lib/admin-vakdor/marketing/claude"
import { DecisionAgenteSchema, PLANTILLAS, type DecisionAgente, type PasoAgente } from "./tipos"
import type { Herramientas } from "./herramientas"

export const MAX_ITERACIONES = 6
const MAX_TOKENS = 4000

/**
 * Bloque estable. El cache_control del final cubre TODO el prefijo (tools + system):
 * a partir de la 2ª llamada del loop se lee al 10% del costo.
 * Las reglas duras NO viven acá (guardrails.ts + requisitosInvestigacion); esto guía el criterio.
 */
export const PROMPT_AGENTE = `Sos el agente de seguimiento de una inmobiliaria argentina. Tu trabajo NO es mandar mensajes: es DECIDIR, para un lead puntual, si corresponde contactarlo hoy, esperar, o dejar de insistir. Un buen asesor sabe cuándo NO escribir. Menos mensajes, mejor dirigidos.

REGLA DE ORO: ninguna afirmación sin el dato leído. Todo lo que digas en la frase o en la razón tiene que salir de algo que LEÍSTE en esta investigación con tus herramientas. Si no lo leíste, no existe.

MÉTODO (en este orden):
1. leer_mensajes SIEMPRE primero: la conversación real es la fuente principal. Si la charla parece larga o hay una negociación, pedí más mensajes (cantidad hasta 50).
2. leer_intentos_previos: para NO repetir el ángulo de un intento anterior.
3. leer_compromisos si la semilla dice que hay activos: un compromiso vencido o por vencer manda sobre todo lo demás.
4. Si vas a mencionar una propiedad en el mensaje, ANTES verificála con leer_propiedad. Si la búsqueda no devuelve nada o el estado no es activo/disponible, NO la menciones como disponible. Esta regla no tiene excepciones.
5. Terminá SIEMPRE con emitir_decision. Nunca respondas con texto suelto.

ACCIONES POSIBLES (input de emitir_decision):
- "contactar": mandar UNA plantilla de WhatsApp hoy. Elegí cuál:
  · "${PLANTILLAS.f1}" — primer toque suave, retoma una duda o interés puntual del historial.
  · "${PLANTILLAS.f2}" — segundo toque, aporta valor o destraba un requisito (presupuesto, zona, requisito excluyente).
  · "${PLANTILLAS.f3}" — último toque, cierre honesto y puerta abierta. OJO: su texto es fijo — tu frase_cierre NO se envía en f3 (escribila igual: queda como registro de tu criterio).
  "frase_cierre": la frase que completa la plantilla. Español rioplatense (voseo: querés, pudiste, te sirve), tono conversacional, sin presión. PROHIBIDO inventar propiedades, precios, zonas o datos que no hayas leído. PROHIBIDO afirmar montos de expensas. PROHIBIDO prometer "te confirmo y te aviso". Si el historial es corto, pregunta genérica y natural. Terminá con una pregunta fácil de responder.
- "posponer": hoy no corresponde (contestó hace poco, dijo que avisa, es mal momento). Indicá "proximo_intento_horas" (4 a 720).
- "abandonar": insistir ya molesta (agotó interés, solo curioseaba, señales claras de no). El sistema apaga el seguimiento pero NO cierra el lead.
- "escalar": hay algo que un humano tiene que ver YA (pidió hablar con una persona, hay un compromiso de un asesor vencido, o algo no cierra). Explicalo en "razon".

CAMPOS:
- "razon": la lee el asesor humano. Clara, en castellano, una o dos frases.
- "evidencia": citá el dato concreto que sostiene la decisión — el mensaje (con fecha), la métrica o la propiedad verificada. Sin evidencia real, bajá la confianza y posponé.
- "confianza": 0 a 1. Si dudás, bajala — con menos de 0.5 el sistema no ejecuta.`

/** Definición de tools para la API. El validador real de emitir_decision es Zod (abajo). */
export const HERRAMIENTAS_API = [
  {
    name: "leer_mensajes",
    description: "Lee los últimos N mensajes reales de la conversación de WhatsApp con este lead, con autor y fecha, de viejo a nuevo. Empezá SIEMPRE por acá.",
    input_schema: {
      type: "object",
      properties: { cantidad: { type: "integer", minimum: 1, maximum: 50, description: "cuántos mensajes traer (default 10)" } },
      additionalProperties: false,
    },
  },
  {
    name: "leer_intentos_previos",
    description: "Lee los intentos de seguimiento ya enviados a este lead, con la razón de cada uno y su resultado. Obligatorio antes de contactar: nunca repitas un ángulo.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "leer_compromisos",
    description: "Lee los compromisos activos de este lead (visitas agendadas, respuestas pendientes) con quién los asumió y cuándo vencen.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "leer_propiedad",
    description: "Busca una propiedad REAL de la agencia por dirección, barrio o título y devuelve su estado actual (precio, disponibilidad, notas del asesor). OBLIGATORIO antes de mencionar cualquier propiedad en el mensaje.",
    input_schema: {
      type: "object",
      properties: { busqueda: { type: "string", description: "dirección, barrio o parte del título" } },
      required: ["busqueda"],
      additionalProperties: false,
    },
  },
  {
    name: "emitir_decision",
    description: "Emite tu decisión final para este lead. Terminá SIEMPRE la investigación con esta herramienta.",
    input_schema: {
      type: "object",
      properties: {
        accion: { type: "string", enum: ["contactar", "posponer", "abandonar", "escalar"] },
        plantilla: { type: ["string", "null"], enum: [PLANTILLAS.f1, PLANTILLAS.f2, PLANTILLAS.f3, null] },
        frase_cierre: { type: ["string", "null"], description: "la frase que completa la plantilla; null si no contactás" },
        proximo_intento_horas: { type: ["integer", "null"], minimum: 4, maximum: 720 },
        razon: { type: "string", description: "en castellano; la lee el asesor" },
        evidencia: { type: "string", description: "el dato concreto que sostiene la decisión: mensaje citado, métrica o propiedad verificada" },
        confianza: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["accion", "razon", "evidencia", "confianza"],
      additionalProperties: false,
    },
  },
] as const

export type LlamarAPI = (messages: Anthropic.MessageParam[]) => Promise<Anthropic.Message>

function crearLlamadaReal(): LlamarAPI {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY")
  const client = new Anthropic({ apiKey })
  return (messages) =>
    client.messages.create({
      model: MODELO,
      max_tokens: MAX_TOKENS,
      thinking: { type: "adaptive" },
      // Un solo breakpoint al final del system cachea TODO el prefijo estable
      // (tools + system). Lo variable (el lead) va en messages.
      system: [{ type: "text", text: PROMPT_AGENTE, cache_control: { type: "ephemeral" } }],
      tools: HERRAMIENTAS_API as unknown as Anthropic.Messages.ToolUnion[],
      messages,
    })
}

export interface TokensLoop { entrada: number; salida: number; cacheLeido: number }
export interface ResultadoAgente { decision: DecisionAgente; pasos: PasoAgente[]; tokens: TokensLoop }

/** Regla dura en código: contactar exige haber leído mensajes e intentos previos. */
export function requisitosInvestigacion(d: DecisionAgente, pasos: PasoAgente[]): string | null {
  if (d.accion !== "contactar") return null
  const usadas = new Set(pasos.map((p) => p.herramienta))
  if (!usadas.has("leer_mensajes"))
    return "rechazada: antes de contactar tenés que leer los mensajes reales (leer_mensajes)"
  if (!usadas.has("leer_intentos_previos"))
    return "rechazada: antes de contactar tenés que revisar los intentos previos (leer_intentos_previos)"
  return null
}

/** Sonnet 5, precio de lista USD/MTok. El costo real se coteja contra la factura en Task 12. */
const TARIFA = { entrada: 3, salida: 15, cacheLeido: 0.3 }
export function estimarCostoUSD(t: TokensLoop): number {
  return (t.entrada * TARIFA.entrada + t.salida * TARIFA.salida + t.cacheLeido * TARIFA.cacheLeido) / 1e6
}

/**
 * El loop. Si en MAX_ITERACIONES no hay decisión válida: throw — el runner registra el
 * error y NO se manda nada (degradación elegante).
 */
export async function decidirConAgente(
  semilla: string, herramientas: Herramientas, llamar: LlamarAPI = crearLlamadaReal(),
): Promise<ResultadoAgente> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: semilla }]
  const pasos: PasoAgente[] = []
  const tokens: TokensLoop = { entrada: 0, salida: 0, cacheLeido: 0 }

  for (let i = 0; i < MAX_ITERACIONES; i++) {
    const res = await llamar(messages)
    verificarNoTruncada(res.stop_reason, MAX_TOKENS)
    tokens.entrada += res.usage.input_tokens
    tokens.salida += res.usage.output_tokens
    tokens.cacheLeido += res.usage.cache_read_input_tokens ?? 0

    const llamadas = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
    if (!llamadas.length)
      throw new Error(`el agente terminó sin emitir decisión (stop: ${res.stop_reason})`)

    // El content COMPLETO vuelve como assistant (thinking incluido: lo exige el tool use)
    messages.push({ role: "assistant", content: res.content })

    const resultados: Anthropic.ToolResultBlockParam[] = []
    for (const tu of llamadas) {
      if (tu.name === "emitir_decision") {
        const parseada = DecisionAgenteSchema.safeParse(tu.input)
        if (!parseada.success) {
          resultados.push({
            type: "tool_result", tool_use_id: tu.id, is_error: true,
            content: `decisión inválida, corregila: ${parseada.error.issues.map((x) => x.message).join("; ")}`,
          })
          continue
        }
        const rechazo = requisitosInvestigacion(parseada.data, pasos)
        if (rechazo) {
          resultados.push({ type: "tool_result", tool_use_id: tu.id, is_error: true, content: rechazo })
          continue
        }
        return { decision: parseada.data, pasos, tokens }
      }
      const fn = herramientas[tu.name as keyof Herramientas]
      if (!fn) {
        resultados.push({ type: "tool_result", tool_use_id: tu.id, is_error: true, content: `herramienta desconocida: ${tu.name}` })
        continue
      }
      const salida = await fn(tu.input as never)
      pasos.push({ herramienta: tu.name, input: tu.input as Record<string, unknown>, resumen: salida.slice(0, 200) })
      resultados.push({ type: "tool_result", tool_use_id: tu.id, content: salida })
    }
    messages.push({ role: "user", content: resultados })
  }
  throw new Error(`el agente agotó ${MAX_ITERACIONES} iteraciones sin decisión válida`)
}
```

- [ ] **Step 3: Correr → PASS.** `npx vitest run lib/seguimiento/agente.test.ts`
- [ ] **Step 4: Prueba real con UN lead (manual, sin enviar nada):** script temporal en
  scratch que arma la semilla de una conversación real de PRISMAIA - VAKDOR, crea las
  herramientas con el service role, y llama `decidirConAgente()`. Leer: (a) ¿qué
  herramientas usó y en qué orden? (b) ¿la evidencia cita algo real? (c) ¿si nombró una
  propiedad, la verificó primero? (d) ¿`usage.cache_read_input_tokens > 0` de la 2ª
  llamada en adelante? (e) el costo estimado del lead. Ajustar el prompt con lo que salga.
  (Regla de la casa: verificar contra datos reales ANTES de dar por bueno.)
- [ ] **Step 5: Commit** — `git add lib/seguimiento/agente.ts lib/seguimiento/agente.test.ts && git commit -m "feat(seguimiento): loop del agente con herramientas y decision como tool call"`

---

# DÍA 4 — Modo sombra corriendo solo

### Task 10: Eventos + el orquestador en sombra (`eventos.ts`, `route.ts`)

**Files:**
- Create: `lib/seguimiento/eventos.ts`, `app/api/seguimiento/run/route.ts`

**Interfaces:**
- Consumes: todo lo anterior + `createClient` de `@supabase/supabase-js` con service role
  (mismo patrón que el dispatch).
- Produces: `POST /api/seguimiento/run` con header `x-api-key: SEGUIMIENTO_SECRET`, body
  `{ "tarea": "seguimiento" | "visitas" | "escalamiento" }` (default `"seguimiento"`).
  Devuelve `{ procesados, decisiones: [{conversation_id, accion, razon}] }`.

- [ ] **Step 1: `eventos.ts` — registrar en la línea de tiempo** (trivial, sin test
  propio: lo cubren los tests de integración del ejecutor)

```ts
import type { SupabaseClient } from "@supabase/supabase-js"

export async function registrarEvento(
  db: SupabaseClient, agencyId: string, conversationId: string,
  tipo: string, descripcion: string, datos: Record<string, unknown> = {},
  actor = "agente_seguimiento",
) {
  const { error } = await db.from("lead_eventos").insert({
    agency_id: agencyId, conversation_id: conversationId,
    tipo, actor, descripcion, datos,
  })
  if (error) console.error("[seguimiento] error registrando evento:", error.message)
  // nunca rompe el flujo: el evento es trazabilidad, no lógica
}
```

- [ ] **Step 2: El runner (sombra). Escribir `app/api/seguimiento/run/route.ts`**

Tres decisiones dentro del runner que importan:
- **Dedupe de decisiones recientes**: en sombra el estado del lead no avanza — sin esto,
  la misma cola entraría al agente cada 30 minutos (48 corridas/día × 8 leads = cientos
  de llamadas para decidir lo mismo). Se filtran los leads con decisión en las últimas
  20 h, sin tocar el estado del lead (que es la gracia de la sombra).
- **Deadline de 240 s**: el loop llama al LLM 2-5 veces por lead; el runner deja de tomar
  leads nuevos al pasar el deadline y lo que queda espera la próxima corrida.
- **`MAX_LLM = 8`**: menos leads por corrida que un decisor de una llamada, porque cada
  lead cuesta más tiempo.

```ts
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { calcularScore } from "@/lib/seguimiento/prioridad"
import { decidirConAgente, estimarCostoUSD } from "@/lib/seguimiento/agente"
import { crearHerramientas } from "@/lib/seguimiento/herramientas"
import { renderizarSemilla } from "@/lib/seguimiento/semilla"
import { registrarEvento } from "@/lib/seguimiento/eventos"
import type { Candidato, CompromisoActivo, ConfigAgencia } from "@/lib/seguimiento/tipos"

export const maxDuration = 300
const MAX_CANDIDATOS = 40    // los trae la Capa 1
const MAX_LLM = 8            // solo los mejores llegan al agente; el resto, próxima corrida
const DEADLINE_MS = 240_000  // deja 60s de colchón antes del timeout
const DEDUPE_HORAS = 20      // no re-decidir un lead ya decidido hace poco

export async function POST(req: Request) {
  if (req.headers.get("x-api-key") !== process.env.SEGUIMIENTO_SECRET)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (process.env.SEGUIMIENTO_MODO === "apagado")   // kill-switch global
    return NextResponse.json({ skipped: "kill_switch_global" })

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { tarea = "seguimiento" } = await req.json().catch(() => ({}))
  if (tarea !== "seguimiento")
    return NextResponse.json({ error: `tarea desconocida: ${tarea}` }, { status: 400 })
    // Task 16 suma "visitas"; Task 19 suma "escalamiento"

  // ── Capa 1: elegibilidad en SQL ──
  const { data: candidatos, error } = await db.rpc("seguimiento_candidatos", { p_limit: MAX_CANDIDATOS })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: configs } = await db.from("seguimiento_config").select("*")
  const configPorAgencia = new Map<string, ConfigAgencia>((configs ?? []).map((c) => [c.agency_id, c]))

  // ── Capa 2: puntuar, ordenar ──
  const puntuados = await Promise.all((candidatos as Candidato[] ?? []).map(async (c) => {
    const { data: comps } = await db.from("compromisos")
      .select("tipo, descripcion, asumido_por, vence_en")
      .eq("conversation_id", c.id).eq("estado", "activo")
    const compromisos = (comps ?? []) as CompromisoActivo[]
    return { c, compromisos, score: calcularScore(c, compromisos) }
  }))
  puntuados.sort((a, b) => b.score - a.score)

  // ── Dedupe: fuera los leads con decisión reciente (clave en sombra) ──
  const idsPuntuados = puntuados.map((x) => x.c.id)
  const { data: recientes } = await db.from("seguimiento_decisiones")
    .select("conversation_id")
    .in("conversation_id", idsPuntuados)
    .gte("creado_en", new Date(Date.now() - DEDUPE_HORAS * 3600e3).toISOString())
  const yaDecididos = new Set((recientes ?? []).map((r) => r.conversation_id))
  const cola = puntuados.filter((x) => !yaDecididos.has(x.c.id)).slice(0, MAX_LLM)

  // ── Capa 3: el agente decide, uno por uno (secuencial: previsible) ──
  const inicio = Date.now()
  const resultados: Array<{ conversation_id: string; accion: string; razon: string }> = []
  for (const { c, compromisos, score } of cola) {
    if (Date.now() - inicio > DEADLINE_MS) break   // lo que queda espera la próxima corrida
    const config = configPorAgencia.get(c.agency_id)
    if (!config || config.modo === "apagado") continue

    const ahoraISO = new Date().toLocaleString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" })
    const { data: contacto } = await db.from("wa_contacts").select("clasificacion")
      .eq("agency_id", c.agency_id).eq("phone", c.contact_phone).maybeSingle()
    const semilla = renderizarSemilla(c, score, compromisos.length, ahoraISO, contacto?.clasificacion ?? null)
    const herramientas = crearHerramientas(db, c)

    try {
      const { decision, pasos, tokens } = await decidirConAgente(semilla, herramientas)
      const { data: fila } = await db.from("seguimiento_decisiones").insert({
        agency_id: c.agency_id, conversation_id: c.id, modo: config.modo,
        canal: "whatsapp",   // fase 1: único canal; la columna existe para las fases 2+
        accion: decision.accion, plantilla: decision.plantilla,
        frase_cierre: decision.frase_cierre,
        proximo_intento_horas: decision.proximo_intento_horas,
        razon: decision.razon, confianza: decision.confianza, score,
        contexto_snapshot: { pasos, tokens, metricas: c.metricas },   // el trace: qué miró
        decision_cruda: decision,                                      // incluye la evidencia
        ejecutada: false,
        costo_usd: estimarCostoUSD(tokens),
      }).select("id").single()
      await registrarEvento(db, c.agency_id, c.id, "decision",
        `[${config.modo}] ${decision.accion}: ${decision.razon}`,
        { score, confianza: decision.confianza, herramientas: pasos.map((p) => p.herramienta) })
      resultados.push({ conversation_id: c.id, accion: decision.accion, razon: decision.razon })
      void fila // Task 15 usa fila.id para enchufar el ejecutor cuando config.modo === "activo"
    } catch (e) {
      // Degradación elegante: si el agente falla, NO se manda nada y se registra
      await registrarEvento(db, c.agency_id, c.id, "error",
        `agente falló: ${String(e).slice(0, 200)}`)
    }
  }

  return NextResponse.json({ procesados: cola.length, decisiones: resultados })
}
```

- [ ] **Step 3: Generar `SEGUIMIENTO_SECRET`** (32 bytes aleatorios), agregarlo a `.env`
  local y a Vercel (env var, con redeploy). Anotar que existe — NUNCA pegarlo en un nodo
  de n8n.
- [ ] **Step 4: Probar en local contra la base real:** `npm run dev` +
  `curl -X POST localhost:3000/api/seguimiento/run -H "x-api-key: $SEGUIMIENTO_SECRET" -H "Content-Type: application/json" -d '{"tarea":"seguimiento"}'`.
  Verificar: filas nuevas en `seguimiento_decisiones` con `modo='sombra'`,
  `contexto_snapshot.pasos` con las herramientas usadas, `costo_usd` cargado, razones
  legibles, **cero mensajes enviados** (verificar que no hubo POST al dispatch mirando
  `wa_messages`), y que una **segunda corrida inmediata NO re-decide los mismos leads**
  (dedupe).
- [ ] **Step 5: Correr toda la suite** — `npx vitest run lib/seguimiento` → PASS.
- [ ] **Step 6: Commit** — `git add lib/seguimiento/eventos.ts app/api/seguimiento/run/route.ts && git commit -m "feat(seguimiento): runner en modo sombra con dedupe y deadline"`

### Task 11: El reloj (⚠️ REQUIERE OK DE LEONARDO — escribe en n8n)

**Files:** ninguno en el repo (workflow de n8n + credencial).

- [ ] **Step 1: Crear la credencial** HTTP Header Auth en n8n: nombre
  `PRISMA Seguimiento`, header `x-api-key`, valor `SEGUIMIENTO_SECRET`. **Con OK.**
- [ ] **Step 2: Crear workflow `SuperAgente_Reloj`** (2 nodos): Schedule Trigger cada 30
  min → HTTP Request `POST https://prisma.vakdor.com/api/seguimiento/run` body
  `{"tarea":"seguimiento"}`, auth por la credencial, `onError: continueRegularOutput`.
  **Con OK.** Backup del JSON en `docs/interno/n8n-backups/`.
- [ ] **Step 3: Activarlo y verificar 2 corridas**: ejecuciones OK en n8n + decisiones
  nuevas en la tabla.
- [ ] **Step 4 (opcional, aprovechando el viaje):** mover la clave hardcodeada
  `x-api-key` de los 7 nodos del flujo viejo "Seguimiento" a una credencial y **rotar
  `DISPATCH_SECRET`** (hallazgo de seguridad del 17/8). También requiere OK; si Leonardo
  prefiere, se difiere.
- [ ] **Step 5: Commit del backup** — `git add docs/interno/n8n-backups/SuperAgente_Reloj-2026-08-22.json && git commit -m "chore(n8n): backup del reloj del super agente"`

### Task 12: Control de calidad de la sombra — hechos, no impresiones (correr 24–48h)

**Files:**
- Create: `scratch/_sa-comparacion-sombra.sql` (no se commitea)

- [ ] **Step 1: Queries de revisión** (tras 24h de sombra):

```sql
SELECT accion, count(*), round(avg(confianza), 2) AS conf_media,
       round(avg(costo_usd)::numeric, 4) AS costo_medio_usd,
       round(avg(jsonb_array_length(contexto_snapshot->'pasos')), 1) AS pasos_promedio
FROM seguimiento_decisiones WHERE modo = 'sombra' GROUP BY accion;
```
```sql
-- Las 20 más recientes con evidencia y trace, para leerlas una por una con Leonardo
SELECT sd.creado_en, wc.contact_name, sd.accion, sd.plantilla, sd.frase_cierre,
       sd.razon, sd.decision_cruda->>'evidencia' AS evidencia,
       sd.contexto_snapshot->'pasos' AS pasos, sd.confianza, sd.costo_usd
FROM seguimiento_decisiones sd JOIN wa_conversations wc ON wc.id = sd.conversation_id
WHERE sd.modo = 'sombra' ORDER BY sd.creado_en DESC LIMIT 20;
```

- [ ] **Step 2: Verificación de HECHOS, decisión por decisión:**
  - Toda `frase_cierre` que menciona una propiedad → ¿el trace tiene un `leer_propiedad`
    con esa búsqueda? ¿el estado que devolvió coincide con lo que la frase afirma?
    (cotejar contra `properties` a mano).
  - Toda `evidencia` → ¿el mensaje citado existe de verdad en `wa_messages`? (spot-check
    de al menos 10).
  - ¿Algún caso agotó las 6 iteraciones o falló? → leer los `lead_eventos` tipo `error` y
    entender por qué.
  - Comparar contra la cadencia vieja: para cada decisión, ¿qué habría hecho el flujo
    viejo (F1/F2/F3 según `follow_ups_sent`)? ¿El agente evita mensajes inútiles?
    ¿pospone con criterio? ¿las frases suenan humanas?
- [ ] **Step 3: Criterio de salida (todos, no alguno):**
  - **0 alucinaciones** en frases y evidencias (una sola = se ajusta el prompt y se
    repite la sombra).
  - **≥80% de razones que Leonardo firmaría.** ✅ **Firmadas por Leonardo el 25/8/2026** (las 40
    del día 1, `scratch/_sa-sombra-LECTURA-dia1-2026-08-25.md`).
  - **Costo medio por decisión ≤ US$0,10** (tope acordado por Leonardo el 25/8; el
    runner registra un evento `costo_alto` por cada decisión que lo supere) viendo el
    `costo_medio_usd` real. Además, cotejar la estimación contra la Console de Anthropic
    — una tarifa de tabla interna ya nos mintió una vez (Google: la real era el doble).
  - `cache_read_input_tokens > 0` en las corridas (si el caché no pega, el costo real es
    ~10× el esperado).
**Resultado de la primera lectura (25/8/2026, análisis en `scratch/_sa-sombra-analisis-2026-08-25.md`):**
- 45 corridas del reloj, 45 success. 40 leads únicos decididos (todos Central; PRISMAIA sin
  elegibles): 30 contactar · 8 escalar · 1 posponer · 1 abandonar.
- Evidencia: 77/77 fechas citadas tienen mensajes reales (0 inventadas). Propiedades: 0
  frases ofrecen una NO DISPONIBLE. Guardrail de investigación: 0 violaciones. 1 fallo del
  modelo en 81 (respondió con texto): sin envío, registrado.
- Costo: estimado US$0,054/decisión vs **real US$0,037** (cost report de Anthropic del
  24/8: US$1,49 por 40 decisiones) — la estimación es ~44% conservadora (precio intro).
  Caché: 627k tokens leídos, 0 decisiones sin caché.
- **Tres defectos encontrados y corregidos el 25/8 (commit 654a082):** (A) la Capa 1 con
  40 candidatos + dedupe vaciaba la cola y 50 leads nunca entraban → 200 candidatos;
  (B) `leer_intentos_previos` mostraba decisiones de SOMBRA como intentos enviados → 30/40
  decisiones del 25/8 creían que el breakup ya había salido → solo cuenta lo ejecutado,
  la sombra se muestra aparte como NO enviada; las 40 filas contaminadas se borraron con
  OK; (C) horas en UTC en `leer_mensajes` → hora argentina.
- Pendiente: la firma de Leonardo sobre las 40 (archivo
  `scratch/_sa-sombra-LECTURA-dia1-2026-08-25.md`), y validar el criterio de elegir F3 como
  primer mensaje del agente cuando el flujo viejo ya mandó 2 seguimientos (19/35 casos).

- [ ] **Step 4: Ajustar el prompt con lo que salga** y repetir la sombra si el cambio fue
  grande. Commit: `git add lib/seguimiento/agente.ts && git commit -m "fix(seguimiento): ajuste de prompt tras revision de sombra"`

### Task 12b: Plantillas de seguimiento v2 (✅ textos aprobados por Leonardo el 25/8; crear en Meta con OK dado para PRISMAIA)

**Por qué cambiarlas (hechos de la sombra):** las 3 plantillas actuales nacieron para una
escalera fija F1→F2→F3: la F3 dice "vamos a pausar los recordatorios" y no tiene variable
(19 de 35 contactar del día 1 cayeron ahí con la frase descartada), la F1 presupone "tu
consulta sobre la propiedad", y los cierres son rígidos.

**Reglas de Leonardo (25/8), después de ver ejemplos reales:**
1. **Todas empiezan con el nombre** (`Hola {{1}}`): más personalización. **Sin nombre válido
   (3+ letras en `metricas.nombre`) no hay seguimiento** — el filtro de la Capa 1 se queda.
2. **Tono natural y humano**, como una persona que se acuerda del lead y quiere ayudarlo:
   nada de "quedamos a disposición", "aguardamos", "recordamos que"; sin "che"; 1-2 frases;
   sin repetir palabras del texto fijo.
3. **La línea de BAJA solo desde el 2º seguimiento sin respuesta**: no está en la
   plantilla; el ejecutor la agrega al final de `{{2}}` cuando `follow_ups_sent ≥ 1`
   (" Si preferís que no te escriba más, decime BAJA."). Determinístico.
4. **Lead esperando a un humano** (coordinación de visita o handoff sin respuesta): el
   seguimiento es EMPÁTICO — `seg_pendiente` le dice que estamos hablando con el asesor
   responsable para que se comunique con él a la brevedad — y **en el mismo acto se avisa al
   asesor** (ver Task 14/19). Es la única plantilla que va con la acción `escalar`.

**Diseño:** dos variables — `{{1}}` nombre, `{{2}}` el mensaje del agente — texto fijo con el
nombre de la agencia (`agencies.name`, lo tiene el provisionador) y cierre corto.

| Plantilla | Cuándo | Cuerpo (con {AGENCIA} = agencies.name) |
|---|---|---|
| `seg_retomar` | Primer toque: retoma lo puntual que quedó colgado | "Hola {{1}}, ¿cómo va? Te escribo de {AGENCIA} porque me quedé pensando en tu búsqueda. {{2}} Contame y lo vemos." |
| `seg_valor` | Aporta un dato concreto o destraba el requisito | "Hola {{1}}, te escribo de {AGENCIA}. {{2}} Si te sirve, decime y te paso más." |
| `seg_pendiente` | Con `escalar`: se le prometió algo / esperaba a un humano | "Hola {{1}}, te escribo de {AGENCIA} por algo que te quedamos debiendo. {{2}} Perdón por la demora." |
| `seg_novedad` | SOLO con una novedad positiva verificada (vigías, fase 4) | "Hola {{1}}, te escribo de {AGENCIA} porque apareció algo que puede interesarte. {{2}} ¿Querés que te cuente más?" |
| `seg_puerta_abierta` | Último toque, con valor, sin presión ni pedidos | "Hola {{1}}, te escribo de {AGENCIA}. {{2}} Cuando quieras retomar, escribime por acá y seguimos." |

Ejemplos reales generados por el agente sobre leads de Central (Natalia, Fernando, Maia,
Juan, Mauro): `scratch/_sa-plantillas-v2-ejemplos.md`. Las 3 viejas y `reactivacion_snoozed`
quedan (no se borran).

- [x] **Step 1: OK de Leonardo sobre los textos** (25/8, tras dos rondas de ejemplos).
- [x] **Step 2 (25/8):** las 5 en el catálogo de `injectCoreTemplates` (`lib/whatsapp/plantillas-v2.ts`,
  módulo puro, con el nombre de la agencia en el texto fijo; `seg_pendiente` UTILITY) y creadas en
  **PRISMAIA - VAKDOR** con el one-off `manual-crear-plantillas-v2.test.ts` (5/5 con id de Meta).
- [x] **Step 3 (25/8):** **Meta aprobó las 5 en ~5 minutos** (18:30); `wa_templates` reflejado
  (el cron `sync-templates` corre a las 00:00 UTC, se adelantó a mano).
- [x] **Step 4 (25/8, commit a64ac3f):** el runner trae las plantillas APROBADAS de cada agencia y
  la semilla las lista con su texto fijo; el agente elige SOLO entre esas (Central sigue con
  f1/f2/f3 hasta que se creen las v2 ahí); prompt con el estilo aprobado; `armarVariables` en
  `plantillas.ts` (f3 solo nombre; v2 nombre + frase + BAJA solo con `follow_ups_sent ≥ 1`, nunca
  en `seg_pendiente`); una decisión con plantilla no disponible queda
  `bloqueada_plantilla_no_disponible`.
- [ ] **Step 5:** sombra con las nuevas en PRISMAIA (hoy sin candidatos: probar con
  `SEGUIMIENTO_SIMULAR_V2=1` sobre leads de Central, solo lectura) → OK → crearlas en Central (⚠️ OK).

### Task 12c: `leer_propiedad_por_link` (diseño verificado el 25/8 contra n8n y la base)

**Hecho:** las consultas llegan con links de portales — dominios reales de
`metricas.link_compartido` en Central: mercadolibre (482), argenprop (131), centralre.com.ar
(35), ficha.info (6), buscainmueble (4), zonaprop (2). **No existe un mapa directo
link→propiedad**: `tokko_data.public_url` es siempre `ficha.info/p/...` y coincide con 0 de
los links que mandan los leads.

**Cómo lo resuelve hoy `Cartera_Propiedades` (n8n, solo lectura):** `extraer_agency_id` saca
la URL del texto → `Tiene_Link` → `Extraer_Web` (POST al `acm-extractor` de EasyPanel con
`x-extractor-secret`, timeout 120 s) devuelve `sujeto` {tipo, barrio, dirección, dormitorios,
m2, amenidades} + precio/moneda → `Preparar_Busqueda` arma la consulta y los `ref_*` →
embedding Gemini 768 → la tool SQL `CARTERA_PROPIEDADES` busca en `properties` por zona,
dirección, precio y vector.

**Diseño de la herramienta del agente:** reutilizar **el extractor que ya usa la app**
(`lib/acm/extract.ts` → `extractFromUrl(url)`: tier 1 server-side + tier 2 vía
`ACM_EXTRACTOR_URL` público, alcanzable desde Vercel) y con `sujeto.direccion` /
`sujeto.barrio` / precio buscar en `properties` de la agencia (mismo `.or` de
`leer_propiedad` + tolerancia de precio ±15%). Input: `{ url }`. Salida: la misma ficha de
`leer_propiedad` (con `is_active`) o "no está en la cartera: era de otra inmobiliaria o se
retiró". El agente la usa cuando `link_compartido` o `propiedades_mostradas` traen URL.
Caché por URL 24h (los 86 leads que mandaron el mismo link de ML no deben disparar 86
extracciones). **Hallazgo de seguridad al pasar:** el nodo `Extraer_Web` tiene el secreto
del extractor pegado en el nodo (mismo patrón que el hallazgo del 17/8) — anotar para
mover a credencial, con OK.

- [ ] **Step 1:** test con `extractFromUrl` mockeado (3 casos: match activo, match inactivo,
  sin match) — patrón de `herramientas.test.ts`.
- [ ] **Step 2:** implementar en `herramientas.ts` + registrar en `HERRAMIENTAS_API` + línea en
  el prompt ("si el lead mandó un link, leelo por link antes de hablar de esa propiedad").
- [ ] **Step 3:** prueba real con `manual-real.test.ts` sobre un lead con `link_compartido`.

### Task 12d: Alineación con los analizadores de n8n (leído el 25/8, solo lectura)

**Qué hace cada nodo (verificado en el workflow PRISMA):**
- `Analizar conversación` (gpt-4.1): clasificador de 14 etiquetas de seguridad/relevancia.
- `Analizar_Conversacion` (gpt-5.4-nano): `etiquetas` + `score_bant` → `Actualizar_Etiquetas_Score`.
- `Analizar_Conversacion1` (nano): las ~42 métricas (`nombre`, `urgencia`, `etapa`,
  `fue_derivado_a_humano`, `link_compartido`, `propiedades_mostradas`, `calificado`…).
- `Analizar_Conversacion2` (nano): `opt_out`, `visit_status`, `visit_scheduled_at`,
  `requires_follow_up` (+ justificación). **Solo `opt_out` y `requires_follow_up` llegan a
  `wa_conversations`** (`Actualizar_Metricas2`); `visit_status` de la conversación lo escribe
  el sync de visitas de la app (`scheduled_visits`, agendadas por el asesor).
- **`next_follow_up_at` NO lo decide ningún analizador**: lo fija el webhook de entrada
  (`app/api/webhooks/{evolution,meta}/route.ts`) = ahora + 24 h en cada mensaje entrante,
  reseteando `follow_ups_sent = 0` y `requires_follow_up = true`; el flujo viejo lo movía
  +3 días por F1/F2 y a null en F3.

**Cómo decide hoy "¿necesita seguimiento?":** `requires_follow_up` = true por defecto; false
solo si hay visita pactada o handoff explícito en el texto. Pero el webhook lo vuelve a poner
en true con cada mensaje del lead. Evidencia en Central: 324 conversaciones con
`fue_derivado_a_humano = true`, de las cuales **94 tienen `requires_follow_up = true`**; y
`bot_active = false` en 1.521 conversaciones — no es marca de handoff.

**Los 8 escalar del día 1 comparten la firma:** `fue_derivado_a_humano = true` (6/8) o
`etapa = handoff`, asesor asignado (7/8), **0 mensajes `internal` y 0 mensajes `human`**,
`requires_follow_up = true`. Es decir: el bot dijo "te paso con un asesor", se asignó un
asesor, y nadie escribió nunca.

**Alineación aplicada (25/8):** (1) guardrail `en_handoff` en código — un lead derivado no
recibe seguimiento automático: si nadie lo atendió, se escala; (2) la semilla avisa al
agente cuando el lead está derivado. **Pendiente (Task 19 y fase 2):** la función
`seguimiento_esperando_humano` usa `bot_active = false` como marca de handoff — hay que
reescribirla con la firma real (`metricas.fue_derivado_a_humano` / `etapa = handoff` y
ausencia de `role = 'human'` posterior) — migración chica con OK. Los analizadores de n8n
**no se tocan**: el criterio "¿necesita seguimiento?" pasa a vivir en el Super Agente, que
lee lo que ellos capturan y decide con el hilo completo.

### Task 12e: Avisos por WhatsApp a asesores y director (análisis del 25/8 — antes de crear las v2 en Central)

**Para qué:** los avisos de la escalera (Task 14 Step 1b, §III.2.3) y las aprobaciones salen
**por email Y por WhatsApp a la vez**. El WhatsApp al asesor sale del MISMO número de la
agencia que atiende a los leads, así que (a) la regla de 24 h de Meta obliga a plantilla, y
(b) su respuesta entra por el mismo webhook que los leads.

**Tres hechos que condicionan el orden (verificados 25/8):**
1. **Ningún asesor ni director tiene teléfono cargado:** Central 0/29 asesores y 0/4
   directores; PRISMAIA 0/3. Todos tienen email. No existe campo de teléfono en la config
   del asesor ni del director ni en Equipo; `agency_invites.invitee_phone` existe pero está
   vacío en las 39 invitaciones y ningún código lo lee.
2. **Colisiones teléfono-asesor vs. conversaciones: 0** — solo porque no hay teléfonos. En
   cuanto un asesor conteste un aviso, sin el gate de internos (§III.2.6) el conversacional lo
   trata como lead. **El gate va ANTES del primer aviso por WhatsApp.**
3. Los avisos necesitan un **link directo al chat en PRISMA** (verificar la URL real de la
   conversación en la ficha al construirlo).

**Prerrequisitos, en orden:**
- [ ] **P1 — Teléfono del equipo** (🔧 **lo está haciendo Leonardo, 25/8**, en su terminal — contrato: `profiles.phone` en E.164, asesores Y directores): campo `phone` en el perfil del asesor y del director
  (misma normalización E.164 y doble verificación del alta de contactos) + edición por el
  director en Equipo. Cargarlo es el opt-in del asesor a recibir avisos. (UI chica; OK de
  Leonardo por tocar la app.)
- [x] **P2 — Gate de internos: va en la APP, no en n8n** (✅ implementado el 26/8, commit `7bc8d29`, pendiente el OK de merge: `lib/whatsapp/gate-internos.ts` + inserción en `evolution/route.ts` y `meta/route.ts`; 10 tests; migración `interacciones_canal` aplicada; **prueba real contra el preview con el celular cargado en PRISMAIA: 200 handled by gate, fila registrada, 0 conversaciones nuevas, 0 wa_messages, confirmación enviada; el reenvío del mismo wamid no duplica**) (corregido el 26/8 al verificar el
  recorrido real). El mensaje entrante NO lo recibe n8n primero: lo recibe el webhook de la app
  (`app/api/webhooks/evolution/route.ts` — y su espejo `meta/route.ts`), que (1) saca el
  teléfono del `remoteJid` (línea ~60), (2) descarta duplicados, (3) busca o CREA la
  `wa_conversation` para la agencia de la instancia, (4) guarda en `wa_messages`/`wa_contacts`,
  y recién (5) dispara n8n si `bot_active` (línea ~264/324). **El gate se inserta entre (1) y
  (3):** si el teléfono (dígitos, misma convención `549…`) está en `profiles.phone` de esa
  agencia → guardar en `interacciones_canal` (canal whatsapp, direccion entrada,
  destinatario asesor/director), anotar en el caso abierto de `escalamientos_asesor` si lo hay,
  mandar la confirmación fija ("Recibido, quedó anotado. Para responderle al cliente entrá a
  PRISMA: [link]") y **return** — sin conversación, sin `wa_messages`, sin n8n. Si no hay
  teléfono cargado, no hay gate que aplicar: la escalera manda solo email. Es código TypeScript
  testeable en la rama; **toca el webhook de producción**, así que va con tests, prueba real con
  el celular de Leonardo como director de PRISMAIA, y OK antes de mergear.
- [ ] **P3 — Plantillas de asesor/director aprobadas** en la WABA de la agencia (abajo).

**El catálogo propuesto (todas UTILITY — avisan de una gestión pendiente, no venden —, es_AR,
{{1}} siempre el nombre del destinatario, último parámetro siempre el link a PRISMA):**

| Plantilla | Cuándo sale (y con qué email) | Cuerpo |
|---|---|---|
| `asesor_cliente_esperando` | Nivel 1: al `escalar` (junto con el email al asesor, Task 14 Step 1b) | "Hola {{1}}, tenés un cliente esperando tu respuesta en PRISMA: {{2}}. Entrá y respondele desde acá: {{3}}" |
| `asesor_sigue_esperando` | Niveles 2-3: recordatorio si no le escribió al cliente (junto con el email del nivel 2) | "Hola {{1}}, {{2}} sigue esperando desde hace {{3}}. Si no lo podés tomar, avisá por acá y lo reasignamos: {{4}}" |
| `director_asesor_sin_respuesta` | Nivel 4 (24 h): al director, con la decisión en el panel (junto con su email) | "Hola {{1}}, {{2}} pese a los avisos. Decidilo en PRISMA: reasignar, tomarlo vos o dar más tiempo: {{3}}" |
| `director_aprobacion_pendiente` | Cualquier aprobación consume-once (plantilla nueva, acción sensible) | "Hola {{1}}, el agente necesita tu OK para {{2}}. Revisalo y decidí en PRISMA: {{3}}" |
| `asesor_visitas_manana` (opcional) | La noche anterior, si tiene visitas agendadas | "Hola {{1}}, mañana tenés {{2}} en agenda: {{3}}. Confirmá o reprogramá desde PRISMA: {{4}}" |
| `operador_alerta` (opcional, §III.2.8.2) | `system_events` críticos, al WhatsApp de Leonardo | "Hola {{1}}, PRISMA reporta un problema: {{2}}. Detalle: {{3}}" |

Ejemplos con datos reales de la sombra (Belen, Delfina):
- Nivel 1 → "Hola Martín, tenés un cliente esperando tu respuesta en PRISMA: Belen pidió
  coordinar una visita el 1/8 y hace 3 semanas que nadie le escribe. Entrá y respondele
  desde acá: prisma.vakdor.com/…"
- Nivel 4 → "Hola Víctor, Fernanda lleva 24 horas sin atender a Delfina, que quedó
  esperando la confirmación de la visita del 3/8, pese a los avisos. Decidilo en PRISMA:
  reasignar, tomarlo vos o dar más tiempo: prisma.vakdor.com/…"

Reglas: mismo tono humano y corto de las v2 de clientes; **nunca datos del lead más allá
del nombre y qué espera** (el detalle está en PRISMA); tope de avisos por asesor por día y
solo en horario laboral (§III.2.3); el "atendido" se mide por un mensaje `human` al cliente,
no por la respuesta al aviso. Las de asesor NO llevan BAJA (son operativas; el opt-out es
sacar el teléfono del perfil).

**Verificado el 26/8 (links, ids y formato de teléfonos):**
- **P1 hecho por Leonardo:** el celular se guarda en `profiles.phone` como dígitos sin "+"
  (`549…`, 13 dígitos) — **la misma convención que `wa_conversations.contact_phone`**
  (1.871 leads `5491…` de 13 dígitos), así que la allowlist del gate compara dígito a dígito
  sin conversiones. Normalizador existente: `normalizeArgPhone()` en `lib/whatsapp/phone-ar.ts`.
  Cargados al 26/8: 1 (PRISMAIA); Central 0/33 → los asesores tienen que cargarlo.
- **Link al chat: YA EXISTE.** `/director/leads-whatsapp/[id]` y `/asesor/leads-whatsapp/[id]`
  con `[id] = wa_conversations.id`. Ojo: la ruta del asesor exige `agent_id = usuario`: el link
  del aviso solo abre si la conversación está **asignada** a ese asesor — la escalera avisa al
  asesor asignado (`wa_conversations.agent_id`) y, si no hay, al director. El panel de la
  Task 18 (`SeguimientoPanel` en `LeadTraceability`) vive en esa misma ficha: el link aterriza
  donde están la razón, la evidencia y los compromisos.
- **Lo que NO existe y hay que desarrollar (fase 2):**
  (a) **botones de acción en la ficha** para la escalera: "Lo tomo" / "Reasignar a…" /
  "Dar más tiempo" (director) — la respuesta del asesor por WhatsApp no ejecuta nada, solo se
  anota; (b) **pantalla de aprobaciones del director** (`aprobaciones` consume-once, §III.2.8.3:
  ver el pedido con justificación y Aprobar/Rechazar con un clic) — el link de
  `director_aprobacion_pendiente` apunta ahí; (c) la **confirmación automática fija** al asesor
  que contesta un aviso ("Recibido, quedó anotado. Para responderle al cliente entrá a PRISMA:
  [link]") — texto libre desde n8n dentro de la ventana de 24 h, sin IA; (d) lectura de
  `profiles.phone` en la escalera y en el gate.

**Regla de canal para el equipo (Leonardo, 26/8):** el aviso sale **por email siempre** y
**por WhatsApp además, solo si el asesor/director tiene celular cargado**. Los celulares se
van completando; la lógica es la misma con o sin celular. Aviso con link al chat = solo al
asesor **asignado**; sin asesor asignado → al director.

**Email personalizado por agencia (§I.5.1, precisado el 26/8):** hoy todo sale de
`RESEND_FROM = "PRISMA <no-reply@…>"`. Tres niveles, del más barato al más propio:
(1) **ya, sin que el cliente haga nada:** `from` con el NOMBRE de la agencia
("Central Real Estate Argentina <no-reply@…>") y `reply_to` = email del director o del
asesor asignado, así las respuestas caen en SU casilla; (2) casilla administrada por agencia
en dominio PRISMA (`seguimiento-ag…@agentes.vakdor.com`) — automática, habilita recibir;
(3) **dominio propio del cliente** verificado en Resend (el cliente carga 3 registros DNS
—SPF/DKIM— en su dominio, p.ej. `seguimiento@centralre.com.ar`) o Gmail por OAuth — opt-in
para quien quiera que salga desde su propio dominio. Fase 2 arranca con (1) + (2).

**Orden recomendado (decisión 25/8):** P1 (teléfono) → P2 (gate) → crear en PRISMAIA las de
asesor/director y probarlas con el teléfono de Leonardo como director → **crear en Central las
v2 de clientes y las de asesor juntas** (un solo OK, una sola espera de Meta) → encender la
escalera en sombra.

- [ ] **Step 1:** OK de Leonardo sobre el catálogo y el orden.
- [ ] **Step 2:** P1 en la app (perfil + Equipo) con su verificación en navegador.
- [x] **Step 3 (26/8):** P2 en el webhook de la app (evolution + meta), con tests. **Mergeado a `main`
  (`b39e455`, fast-forward de 28 commits, 393 tests + build OK) y probado en PRODUCCIÓN con un
  mensaje real de Leonardo desde su celular (perfil de asesor de PRISMAIA): log
  `[Meta Webhook] Mensaje interno … registrado, confirmación enviada`, fila en
  `interacciones_canal`, cero `wa_messages`, el bot NO contestó.** Hechos que salieron del camino:
  - En producción los mensajes entran por **`/api/webhooks/meta`** (Meta directo a la app);
    Evolution solo ENVÍA. Su webhook de instancia (`byEvents: true`) manda sufijos
    `/send-message` que dan 404 (ruido). El webhook global de Evolution está deshabilitado.
    Un desvío temporal del webhook de instancia de PRISMAIA al preview no sirvió (canal
    equivocado) y se restauró.
  - La confirmación es texto libre: Meta solo la entrega si el asesor escribió en las últimas
    24 h (probada: llegó desde +54 9 221 202-4714). En el flujo real la ventana siempre está
    abierta. Meta escribe los celulares AR sin el 9 → el gate compara en forma canónica.
  - **Caída de Supabase** (~02:20 a 03:29 AR, instancia Micro 1 GB, reinicio manual desde el
    dashboard): durante la caída el webhook de Meta **devolvió 200 sin poder procesar** (la
    búsqueda de instancia falla → "no encontrada" → 200) y Meta NO reintenta con 200 → **los
    mensajes de leads que llegaron en esa ventana se perdieron en silencio**. **Resuelto el
    26/8** (rama `fix/webhook-503-base-caida`, en `main` como `3137a13`): los dos webhooks
    (`meta` y `evolution`) responden **503** cuando la base no contesta (al buscar la
    instancia, chequear duplicados o crear la conversación) y Meta reintenta; un
    `phone_number_id` desconocido sigue dando 200. Probado en local: base inalcanzable → 503;
    base sana + instancia desconocida → 200 sin escribir nada. Sigue pendiente:
    `system_events` (§III.2.8.2) avisándole a Leonardo de la caída.
  - Bug visto en logs: links a `/director/leads-whatsapp/Mensaje%20de%20voz%20recibido`
    (texto del mensaje en vez del id).
  - Regla de Leonardo: el link del aviso se adapta al rol del destinatario y apunta al chat
    concreto (`/director/leads-whatsapp/[id]` para el director, que ve todo y reasigna desde
    la configuración de ese chat).
- [x] **Step 4 (26/8):** `plantillasEquipo()` en el provisionador y **creadas y APROBADAS por Meta en PRISMAIA**
  (primer intento rechazado: "las variables no pueden estar al principio ni al final" → cierre fijo
  tras el link, regla fijada en test). Meta reclasificó `asesor_sigue_esperando` como MARKETING
  (el resto UTILITY). Falta: probar un aviso real de escalera al celular de Leonardo (con la Task 14).
- [ ] **Step 5:** Central: clientes + asesores juntas (OK).

---

# DÍA 5 — Compromisos: lo que el sistema persigue

### Task 13: Módulo de compromisos (`compromisos.ts`)

> **HECHA 26/8.** `lib/seguimiento/compromisos.ts` (+ 5 tests): `derivarCompromisosDeVisita`,
> `sincronizarCompromisos` (corre al inicio de cada corrida) y `crearCompromisoEscalar` (Task 14).

**Files:**
- Create: `lib/seguimiento/compromisos.ts`
- Test: `lib/seguimiento/compromisos.test.ts`
- Modify: `app/api/seguimiento/run/route.ts` (llamar `sincronizarCompromisos` al inicio)

**Interfaces:**
- Produces: `derivarCompromisosDeVisita(c: Candidato): { tipo, descripcion, asumido_por, vence_en } | null`
  (pura) y `sincronizarCompromisos(db)` (marca vencidos + crea compromisos de visita
  faltantes). La visita se deriva de `wa_conversations.visit_status/visit_scheduled_at`
  (columnas verificadas).

- [ ] **Step 1: Test que falla**

```ts
import { describe, it, expect } from "vitest"
import { derivarCompromisosDeVisita } from "./compromisos"
import type { Candidato } from "./tipos"

const base = {
  id: "c1", agency_id: "a1", contact_phone: "+549110000", contact_name: "Laura",
  funnel_status: "open", visit_status: "scheduled",
  visit_scheduled_at: "2026-08-27T15:00:00-03:00", visit_address: "Av. Mitre 1200, Caseros",
  follow_ups_sent: 0, next_follow_up_at: null, last_message_at: null,
  metricas: {}, follow_ups_history: [], requires_follow_up: true, bot_active: true, opt_out: false,
} as Candidato

describe("derivarCompromisosDeVisita", () => {
  it("visita agendada ⇒ compromiso del lead con vencimiento en la visita", () => {
    const k = derivarCompromisosDeVisita(base)
    expect(k).toMatchObject({ tipo: "visita_agendada", asumido_por: "lead" })
    expect(k!.descripcion).toContain("Av. Mitre 1200")
    expect(k!.vence_en).toBe("2026-08-27T15:00:00-03:00")
  })
  it("sin visita ⇒ null", () => {
    expect(derivarCompromisosDeVisita({ ...base, visit_status: "none", visit_scheduled_at: null })).toBeNull()
  })
  it("sin dirección usa texto genérico, jamás inventa", () => {
    const k = derivarCompromisosDeVisita({ ...base, visit_address: null })
    expect(k!.descripcion).toContain("la propiedad acordada")
  })
})
```

- [ ] **Step 2: Correr → FAIL. Implementar**

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Candidato } from "./tipos"

export function derivarCompromisosDeVisita(c: Candidato) {
  if (!["scheduled", "confirmed"].includes(c.visit_status) || !c.visit_scheduled_at) return null
  return {
    tipo: "visita_agendada" as const,
    descripcion: `Visita a ${c.visit_address?.trim() || "la propiedad acordada"}`,
    asumido_por: "lead" as const,
    vence_en: c.visit_scheduled_at,
  }
}

/** Corre al inicio de cada corrida: vence lo vencido, crea compromisos de visita nuevos. */
export async function sincronizarCompromisos(db: SupabaseClient) {
  // 1. Marcar vencidos (idempotente)
  await db.from("compromisos")
    .update({ estado: "vencido" })
    .eq("estado", "activo")
    .lt("vence_en", new Date().toISOString())

  // 2. Compromisos de visita para conversaciones con visita y sin compromiso activo
  const { data: conVisita } = await db.from("wa_conversations")
    .select("id, agency_id, visit_status, visit_scheduled_at, visit_address")
    .in("visit_status", ["scheduled", "confirmed"])
    .gt("visit_scheduled_at", new Date().toISOString())
  for (const c of conVisita ?? []) {
    const { data: ya } = await db.from("compromisos").select("id")
      .eq("conversation_id", c.id).eq("tipo", "visita_agendada").eq("estado", "activo").limit(1)
    if (ya?.length) continue
    const k = derivarCompromisosDeVisita(c as Candidato)
    if (k) await db.from("compromisos").insert({
      agency_id: c.agency_id, conversation_id: c.id, ...k, origen: "visita",
    })
  }
}
```

- [ ] **Step 3: Enchufar en el runner:** en `route.ts`, antes de la Capa 1:
  `await sincronizarCompromisos(db)`. (Los compromisos ya alimentan el scoring de Task 6,
  la semilla y la herramienta `leer_compromisos` — nada más que tocar.)
- [ ] **Step 4: Correr suite + una corrida local de sombra.** Verificar en SQL que un
  lead de prueba con visita agendada tiene su compromiso.
- [ ] **Step 5: Commit** — `git add lib/seguimiento/compromisos.ts lib/seguimiento/compromisos.test.ts app/api/seguimiento/run/route.ts && git commit -m "feat(seguimiento): compromisos activos (la senal mas fuerte del agente)"`

### Task 14: Compromisos creados por el agente (escalar ⇒ respuesta_pendiente)

> **HECHA 26/8, incluido el Step 1b.** En el runner, `escalar` ⇒ compromiso `respuesta_pendiente`
> (24 h, máx. 1 activo por chat, en sombra también) + `avisarPorEscalar` (`lib/seguimiento/avisos.ts`,
> 13 tests): destinatario = asesor asignado activo, si no el director; email por Resend siempre
> (remitente "Agencia vía PRISMA") y WhatsApp además si tiene celular, con la plantilla UTILITY
> `asesor_cliente_esperando` **solo si Meta la aprobó en esa agencia**; link al chat concreto con la
> URL del rol (`/{director|asesor}/leads-whatsapp/[id]`); una vez por chat cada 24 h; TODO queda en
> `interacciones_canal` (canal, resultado, motivo si se omitió, wamid) y en `lead_eventos`. En sombra
> no manda: registra `aviso_simulado` con a quién habría ido. **Probado de verdad el 26/8 12:45**
> desde el número de PRISMAIA al celular y al Gmail del perfil "Leonardo Asesor": email y WhatsApp
> `enviado`, 0 `wa_messages` en el chat del lead (el aviso no ensucia la conversación).
> Pendiente chico: Evolution devuelve otra forma para plantillas y el `wamid` quedó null; se guarda
> la respuesta cruda para aprenderla.

**Files:**
- Modify: `app/api/seguimiento/run/route.ts`

- [ ] **Step 1:** Cuando la decisión es `escalar`, además del evento, crear compromiso
  `respuesta_pendiente` asumido por `asesor`, vence en +24h, `origen` = id de la decisión
  — con dedupe (máximo 1 activo de este tipo por conversación, mismo patrón `ya?.length`
  de Task 13):

```ts
if (decision.accion === "escalar") {
  const { data: yaEscalado } = await db.from("compromisos").select("id")
    .eq("conversation_id", c.id).eq("tipo", "respuesta_pendiente")
    .eq("estado", "activo").limit(1)
  if (!yaEscalado?.length) {
    await db.from("compromisos").insert({
      agency_id: c.agency_id, conversation_id: c.id,
      tipo: "respuesta_pendiente", descripcion: decision.razon,
      asumido_por: "asesor", vence_en: new Date(Date.now() + 24 * 3600e3).toISOString(),
      origen: fila?.id ?? "decision",
    })
  }
}
```
(En sombra también se crea: es información para el asesor, no un envío.)
- [ ] **Step 1b (regla 25/8 — el aviso al asesor va en el mismo acto):** en modo activo, cuando
  la decisión es `escalar`, además del compromiso se manda un **email al asesor asignado**
  (`wa_conversations.agent_id` → `profiles.email`; si no hay asesor asignado, al director) con
  el caso, la razón y la evidencia, por Resend (misma técnica que Task 19). Y si la decisión trae
  `seg_pendiente` + frase, el ejecutor le manda al lead el mensaje empático por el dispatch (con
  todos los guardrails de envío; hasta que Meta apruebe la plantilla queda `bloqueada_*`). Así
  "estoy hablando con tu asesor para que te contacte" es verdad en el momento en que se dice.
  Task 19 queda como red de seguridad: si el asesor no atiende en `escalamiento_horas`, director.
- [ ] **Step 2: Corrida local + verificación SQL.**
- [ ] **Step 3: Commit** — `git add app/api/seguimiento/run/route.ts && git commit -m "feat(seguimiento): escalar crea compromiso respuesta_pendiente para el asesor"`

---

# DÍA 6 — Ejecución real, gradual

### Task 15: El ejecutor (`ejecutor.ts`) — de la decisión al dispatch

**Files:**
- Create: `lib/seguimiento/ejecutor.ts`
- Test: `lib/seguimiento/ejecutor.test.ts`
- Modify: `app/api/seguimiento/run/route.ts`

**Interfaces:**
- Consumes: `puedeEjecutar`, `sigueElegible` (Task 5); el endpoint `/api/whatsapp/dispatch`
  existente (POST con `{agency_id, conversation_id, contact_phone, template_name, variables}`
  + header `x-api-key: DISPATCH_SECRET`).
- Produces: `ejecutarDecision(db, decision, candidato, config, decisionId, fetchFn?): Promise<{ resultado: string }>`
  — `fetchFn` inyectable para test.

- [ ] **Step 1: Test que falla** (con `fetchFn` mock y un `db` mock mínimo):

```ts
import { describe, it, expect, vi } from "vitest"
import { ejecutarDecision } from "./ejecutor"
// fixtures `config`, `base` (candidato), `decision` idénticos a guardrails.test.ts

function dbMock(candidatoActual: unknown) {
  const builder: Record<string, unknown> = {}
  for (const m of ["select", "eq", "gte", "update"])
    builder[m] = vi.fn().mockReturnValue(builder)
  builder.single = vi.fn().mockResolvedValue({ data: candidatoActual })
  builder.then = (resolve: (v: unknown) => void) => resolve({ count: 0, data: null, error: null })
  return { from: vi.fn().mockReturnValue(builder), rpc: vi.fn() } as never
}

describe("ejecutarDecision", () => {
  it("relee la conversación y aborta si entró un mensaje nuevo", async () => {
    const fetchMock = vi.fn()
    const r = await ejecutarDecision(
      dbMock({ ...base, last_message_at: "2026-08-22T10:00:00Z" }), decision, base, config, "d1", fetchMock)
    expect(r.resultado).toBe("bloqueada_conversacion_cambio")
    expect(fetchMock).not.toHaveBeenCalled()          // NO llamó al dispatch
  })
  it("con todo OK llama al dispatch con la plantilla y la frase", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, wamid: "w1" }) })
    const r = await ejecutarDecision(dbMock({ ...base }), decision, base, config, "d1", fetchMock)
    expect(r.resultado).toBe("enviada")
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.template_name).toBe("seg_f1_seguimiento")
    expect(body.variables[1]).toBe(decision.frase_cierre)
  })
  it("si el dispatch salta la ventana horaria, queda bloqueada y NO cuenta intento", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: false, skipped: "fuera_de_ventana_horaria" }) })
    const r = await ejecutarDecision(dbMock({ ...base }), decision, base, config, "d1", fetchMock)
    expect(r.resultado).toBe("bloqueada_fuera_de_ventana_horaria")
  })
})
```
(El `dbMock` de arriba es el esqueleto; completarlo hasta que compile con los llamados
reales del ejecutor — el test define el contrato, el mock lo sigue.)

- [ ] **Step 2: Correr → FAIL. Implementar**

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import { puedeEjecutar, sigueElegible } from "./guardrails"
import { registrarEvento } from "./eventos"
import type { Candidato, ConfigAgencia, Decision } from "./tipos"

type FetchFn = typeof fetch

export async function ejecutarDecision(
  db: SupabaseClient, d: Decision, c: Candidato, config: ConfigAgencia,
  decisionId: string, fetchFn: FetchFn = fetch,
): Promise<{ resultado: string }> {
  const marcar = async (resultado: string, ejecutada = false) => {
    await db.from("seguimiento_decisiones").update({ resultado, ejecutada }).eq("id", decisionId)
    return { resultado }
  }

  // Presupuesto diario de la agencia (enviados hoy = decisiones ejecutadas hoy)
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const { count } = await db.from("seguimiento_decisiones")
    .select("id", { count: "exact", head: true })
    .eq("agency_id", c.agency_id).eq("ejecutada", true)
    .gte("creado_en", hoy.toISOString())

  const veredicto = puedeEjecutar(d, c, config, count ?? 0)
  if (!veredicto.ok) return marcar(`bloqueada_${veredicto.motivo}`)

  // Doble verificación: releer la conversación AHORA (guardrail anti-colisión)
  const { data: actual } = await db.from("wa_conversations").select("*").eq("id", c.id).single()
  if (!actual || !sigueElegible(c, actual as Candidato))
    return marcar("bloqueada_conversacion_cambio")

  // Despachar por el camino existente (ventana horaria, plantilla real, Evolution/Meta,
  // wa_messages, n8n_chat_histories y follow_ups_history: TODO eso ya lo hace el dispatch)
  const res = await fetchFn(`${process.env.NEXT_PUBLIC_APP_URL ?? "https://prisma.vakdor.com"}/api/whatsapp/dispatch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.DISPATCH_SECRET ?? "" },
    body: JSON.stringify({
      agency_id: c.agency_id, conversation_id: c.id, contact_phone: c.contact_phone,
      template_name: d.plantilla,
      // SOLO metricas.nombre — jamás el nombre de WhatsApp (decisión 24/8). La Capa 1
      // garantiza que existe. f3 tiene una sola variable: el cierre es texto fijo.
      variables: d.plantilla === "seg_f3_breakup"
        ? [String(c.metricas?.nombre ?? "")]
        : [String(c.metricas?.nombre ?? ""), d.frase_cierre],
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return marcar(`error_dispatch_${res.status}`)
  if (data.skipped) return marcar(`bloqueada_${data.skipped}`)

  // Actualizar estado del lead (lo que antes hacían los nodos Actualizar_F*)
  const horas = d.proximo_intento_horas ?? 72
  await db.from("wa_conversations").update({
    follow_ups_sent: c.follow_ups_sent + 1,
    next_follow_up_at: new Date(Date.now() + horas * 3600e3).toISOString(),
    recovery_stage: "follow_up",
  }).eq("id", c.id)

  await registrarEvento(db, c.agency_id, c.id, "envio",
    `Enviada ${d.plantilla}: "${d.frase_cierre}" — ${d.razon}`, { wamid: data.wamid ?? null })
  return marcar("enviada", true)
}
```

- [ ] **Step 3: Enchufar en el runner** (donde Task 10 dejó la nota `void fila`): tras
  guardar la decisión, si `config.modo === "activo"`:

```ts
if (config.modo === "activo" && fila) {
  if (decision.accion === "contactar") {
    await ejecutarDecision(db, decision, c, config, fila.id)
  } else if (decision.accion === "posponer") {
    await db.from("wa_conversations").update({
      next_follow_up_at: new Date(Date.now() + decision.proximo_intento_horas! * 3600e3).toISOString(),
    }).eq("id", c.id)
  } else if (decision.accion === "abandonar") {
    // NUNCA closed_lost automático: solo apaga el seguimiento, reversible
    await db.from("wa_conversations").update({
      requires_follow_up: false, next_follow_up_at: null, dropoff_reason: "agente_abandono",
    }).eq("id", c.id)
  }
  // "escalar" ya creó su compromiso en Task 14; el aviso llega por Task 19
}
```
- [ ] **Step 4: Correr suite completa** — `npx vitest run lib/seguimiento` → PASS.
- [ ] **Step 5: Commit** — `git add lib/seguimiento/ejecutor.ts lib/seguimiento/ejecutor.test.ts app/api/seguimiento/run/route.ts && git commit -m "feat(seguimiento): ejecutor con doble verificacion y presupuesto diario (capa 4)"`

### Task 16: Recordatorios de visita, determinísticos (`visitas.ts`)

La confirmación de visita es **deliberadamente casi determinística** (24h/3h/1h). Acá no
hay LLM — se porta la lógica del flujo viejo al runner, con una mejora: sin extracción de
dirección por un modelo (usa `visit_address`; si falta, texto genérico).

**Files:**
- Create: `lib/seguimiento/visitas.ts`
- Test: `lib/seguimiento/visitas.test.ts`
- Modify: `app/api/seguimiento/run/route.ts` (tarea `"visitas"`)

**Interfaces:**
- Produces: `queRecordatorioToca(c: Candidato, ahoraMs: number): "visita24" | "visita3" | "visita1" | "noShow" | null`
  (pura) y `correrVisitas(db, fetchFn?)`.

- [ ] **Step 1: Test que falla**

```ts
import { describe, it, expect } from "vitest"
import { queRecordatorioToca } from "./visitas"
// fixture `base` como en Task 13, visit_status: "scheduled"

const AHORA = Date.parse("2026-08-22T12:00:00-03:00")
const visita = (horas: number, history: Array<Record<string, unknown>> = []) => ({
  ...base,
  visit_scheduled_at: new Date(AHORA + horas * 3600e3).toISOString(),
  follow_ups_history: history,
})

describe("queRecordatorioToca", () => {
  it("a 20h de la visita toca el de 24h", () => {
    expect(queRecordatorioToca(visita(20), AHORA)).toBe("visita24")
  })
  it("si el de 24h ya salió, a 2.5h toca el de 3h", () => {
    const h = [{ type: "visita_recordatorio_24h", at: new Date(AHORA - 3600e3).toISOString() }]
    expect(queRecordatorioToca(visita(2.5, h), AHORA)).toBe("visita3")
  })
  it("no repite un recordatorio ya enviado", () => {
    const h = [{ type: "visita_recordatorio_3h", at: new Date(AHORA - 600e3).toISOString() }]
    expect(queRecordatorioToca(visita(2.5, h), AHORA)).toBeNull()
  })
  it("visita pasada sin confirmar ⇒ noShow", () => {
    expect(queRecordatorioToca(visita(-1), AHORA)).toBe("noShow")
  })
  it("faltan 3 días ⇒ nada", () => {
    expect(queRecordatorioToca(visita(72), AHORA)).toBeNull()
  })
})
```

- [ ] **Step 2: Correr → FAIL. Implementar**

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import { PLANTILLAS, type Candidato } from "./tipos"
import { registrarEvento } from "./eventos"

const VENTANAS: Array<{ clave: "visita24" | "visita3" | "visita1"; hasta: number; desde: number }> = [
  { clave: "visita24", hasta: 25, desde: 4 },   // mismas ventanas que los If del flujo viejo
  { clave: "visita3",  hasta: 4,  desde: 1.5 },
  { clave: "visita1",  hasta: 1.5, desde: 0 },
]

function yaSalio(c: Candidato, plantilla: string): boolean {
  return (c.follow_ups_history ?? []).some((e) => e.type === plantilla)
}

export function queRecordatorioToca(c: Candidato, ahoraMs: number) {
  if (!c.visit_scheduled_at) return null
  const horas = (Date.parse(c.visit_scheduled_at) - ahoraMs) / 3600e3
  if (horas <= 0) {
    if (c.visit_status === "scheduled" && !yaSalio(c, PLANTILLAS.noShow)) return "noShow"
    return null
  }
  for (const v of VENTANAS) {
    if (horas <= v.hasta && horas > v.desde && !yaSalio(c, PLANTILLAS[v.clave])) return v.clave
  }
  return null
}

/** Corre con tarea="visitas". Manda por el dispatch, igual que el ejecutor. */
export async function correrVisitas(db: SupabaseClient, fetchFn: typeof fetch = fetch) {
  const { data: conVisita } = await db.from("wa_conversations").select("*")
    .eq("visit_status", "scheduled").eq("opt_out", false).not("visit_scheduled_at", "is", null)
  const { data: configs } = await db.from("seguimiento_config").select("agency_id, modo")
  const activos = new Set((configs ?? []).filter((x) => x.modo === "activo").map((x) => x.agency_id))

  for (const c of (conVisita ?? []) as Candidato[]) {
    if (!activos.has(c.agency_id)) continue
    const cual = queRecordatorioToca(c, Date.now())
    if (!cual) continue
    const plantilla = PLANTILLAS[cual]
    const direccion = c.visit_address?.trim() || "la propiedad acordada"
    // SOLO metricas.nombre (decisión 24/8). Sin nombre no se manda: se registra y sigue.
    const nombre = String(c.metricas?.nombre ?? "").trim()
    if (!nombre) {
      await registrarEvento(db, c.agency_id, c.id, "envio_bloqueado",
        `Recordatorio ${plantilla} sin enviar: el lead no tiene nombre en metricas`)
      continue
    }
    const hora = new Date(c.visit_scheduled_at!).toLocaleTimeString("es-AR",
      { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" })
    // Variables reales por plantilla (verificado 24/8): 24h/3h = [nombre, hora, dirección];
    // 1h = [nombre, hora]; no-show = [nombre]
    const variables =
      cual === "visita1" ? [nombre, hora] :
      cual === "noShow"  ? [nombre] :
      [nombre, hora, direccion]
    const res = await fetchFn(`${process.env.NEXT_PUBLIC_APP_URL ?? "https://prisma.vakdor.com"}/api/whatsapp/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.DISPATCH_SECRET ?? "" },
      body: JSON.stringify({
        agency_id: c.agency_id, conversation_id: c.id, contact_phone: c.contact_phone,
        template_name: plantilla,
        variables,
      }),
    })
    const data = await res.json().catch(() => ({}))
    await registrarEvento(db, c.agency_id, c.id,
      data?.success ? "envio" : "envio_bloqueado",
      `Recordatorio de visita ${plantilla} (${direccion})`, { respuesta: data })
  }

  // Auto-realizada (portado literal del nodo viejo Auto_Realizada)
  await db.rpc("seguimiento_marcar_visitas_realizadas").throwOnError()
}
```

La función `seguimiento_marcar_visitas_realizadas()` se agrega a la migración de Task 3
(o migración chica aparte, con OK):

```sql
create or replace function seguimiento_marcar_visitas_realizadas() returns void
language sql as $$
  update public.scheduled_visits set estado_visita = 'realizada'
  where estado_visita = 'confirmada'
    and (fecha_visita + hora_visita) at time zone 'America/Argentina/Buenos_Aires' < now();
$$;
```
Variables ya verificadas (24/8, Task 0): 24h/3h = [nombre, hora, dirección];
1h = [nombre, hora]; no-show = [nombre]. El código de arriba ya las respeta.

- [ ] **Step 3: Enchufar** `tarea === "visitas"` en el runner + agregar al reloj de n8n
  un segundo llamado (mismo workflow, nodo HTTP con body `{"tarea":"visitas"}`, cada 30
  min) — con OK.
- [ ] **Step 4: Correr suite → PASS. Commit** — `git add lib/seguimiento/visitas.ts lib/seguimiento/visitas.test.ts app/api/seguimiento/run/route.ts supabase/migrations/2026-08-22-super-agente-fase1.sql && git commit -m "feat(seguimiento): recordatorios de visita deterministicos 24/3/1 + no-show"`

### Task 17: Encender de verdad (⚠️ REQUIERE OK DE LEONARDO)

- [ ] **Step 1: Checklist previo:** sombra revisada (Task 12, criterio de salida
  cumplido) · suite verde · deploy en Vercel con `SEGUIMIENTO_SECRET` y
  `SEGUIMIENTO_MODO=activo` · reloj corriendo · plantillas de fase 1 todas `approved`
  (Task 2).
- [ ] **Step 2: Con OK explícito:** `update seguimiento_config set modo = 'activo' where agency_id = <PRISMAIA>;`
  — solo esa agencia.
- [ ] **Step 3: Observar las primeras 3 corridas en vivo:** decisiones, envíos reales en
  `wa_messages`, el mensaje llegando al WhatsApp de prueba, `lead_eventos` completo.
  Verificar que el conversacional ve la plantilla en su historial (ya lo garantiza el
  dispatch).
- [ ] **Step 4: Rollback documentado:** `update seguimiento_config set modo = 'sombra'`
  (o `SEGUIMIENTO_MODO=apagado` en Vercel para todo). Dos minutos, sin deploy.

---

# DÍA 7 — Trazabilidad visible, escalamiento y cierre

### Task 18: El bloque "Agente de seguimiento" en la ficha del lead

**Files:**
- Create: `components/whatsapp/SeguimientoPanel.tsx`
- Modify: `components/whatsapp/LeadTraceability.tsx` (importar y renderizar el bloque)

**Interfaces:**
- Consumes: tablas `seguimiento_decisiones`, `compromisos` vía supabase client (las RLS
  de Task 3 habilitan la lectura desde el navegador).
- Produces: componente `<SeguimientoPanel conversationId={string} />` que muestra
  compromisos activos y las últimas decisiones con **razón, evidencia y qué miró el
  agente**.

- [ ] **Step 1: Implementar el componente** (client component, mismo estilo shadcn/Card
  del archivo vecino):

```tsx
"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Bot, AlertTriangle } from "lucide-react"

interface Decision {
  id: string; accion: string; razon: string; confianza: number
  ejecutada: boolean; resultado: string | null; creado_en: string; modo: string
  decision_cruda: { evidencia?: string } | null
  contexto_snapshot: { pasos?: Array<{ herramienta: string; input: Record<string, unknown> }> } | null
}
interface Compromiso { id: string; tipo: string; descripcion: string; asumido_por: string; vence_en: string | null }

const COLOR_ACCION: Record<string, string> = {
  contactar: "bg-green-100 text-green-800",
  posponer: "bg-blue-100 text-blue-800",
  abandonar: "bg-gray-100 text-gray-800",
  escalar: "bg-red-100 text-red-800",
}

const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })

export default function SeguimientoPanel({ conversationId }: { conversationId: string }) {
  const supabase = createClient()
  const [decisiones, setDecisiones] = useState<Decision[]>([])
  const [compromisos, setCompromisos] = useState<Compromiso[]>([])

  useEffect(() => {
    async function cargar() {
      const [d, k] = await Promise.all([
        supabase.from("seguimiento_decisiones")
          .select("id, accion, razon, confianza, ejecutada, resultado, creado_en, modo, decision_cruda, contexto_snapshot")
          .eq("conversation_id", conversationId)
          .order("creado_en", { ascending: false }).limit(5),
        supabase.from("compromisos")
          .select("id, tipo, descripcion, asumido_por, vence_en")
          .eq("conversation_id", conversationId).eq("estado", "activo"),
      ])
      setDecisiones(d.data ?? [])
      setCompromisos(k.data ?? [])
    }
    cargar()
  }, [conversationId])

  if (!decisiones.length && !compromisos.length) return null

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Bot className="h-4 w-4" /> Agente de seguimiento
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {compromisos.length > 0 && (
          <div className="space-y-1">
            <p className="font-medium text-xs text-muted-foreground">COMPROMISOS ACTIVOS</p>
            {compromisos.map((k) => (
              <div key={k.id} className="flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-amber-500 shrink-0" />
                <span>
                  {k.descripcion} · <span className="text-muted-foreground">{k.asumido_por}</span>
                  {k.vence_en && <> · vence {fechaCorta(k.vence_en)}</>}
                </span>
              </div>
            ))}
          </div>
        )}
        {decisiones.length > 0 && (
          <div className="space-y-2">
            <p className="font-medium text-xs text-muted-foreground">ÚLTIMAS DECISIONES</p>
            {decisiones.map((d) => (
              <div key={d.id} className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Badge className={COLOR_ACCION[d.accion] ?? ""} variant="secondary">{d.accion}</Badge>
                  {d.modo === "sombra" && <Badge variant="outline">sombra</Badge>}
                  <span className="text-xs text-muted-foreground">{fechaCorta(d.creado_en)}</span>
                </div>
                <p className="text-muted-foreground">{d.razon}</p>
                {d.decision_cruda?.evidencia && (
                  <p className="text-xs text-muted-foreground italic">Evidencia: {d.decision_cruda.evidencia}</p>
                )}
                {(d.contexto_snapshot?.pasos?.length ?? 0) > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Miró: {d.contexto_snapshot!.pasos!.map((p) =>
                      p.herramienta === "leer_propiedad"
                        ? `propiedad («${String(p.input?.busqueda ?? "")}»)`
                        : p.herramienta.replace("leer_", "").replace("_", " ")
                    ).join(" · ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Integrar en `LeadTraceability.tsx`:**
  `import SeguimientoPanel from "./SeguimientoPanel"` y renderizarlo como primera Card del
  panel (recibe `conversation.id`). No tocar nada más del archivo.
- [ ] **Step 3: Verificar en el navegador (regla de la casa):** `npm run dev`, entrar con
  la cuenta de director de PRISMAIA - VAKDOR, abrir un lead con decisiones → el bloque se
  ve; razón + evidencia + "Miró: mensajes · intentos previos · propiedad («PH Caseros»)"
  se leen bien. **Repetir en celular con emulación de dispositivo** (no achicando la
  ventana): el bloque no rompe el layout.
- [ ] **Step 4: Commit** — `git add components/whatsapp/SeguimientoPanel.tsx components/whatsapp/LeadTraceability.tsx && git commit -m "feat(seguimiento): panel con decisiones, evidencia y trace en la ficha del lead"`

### Task 19: Escalamiento mínimo al director (`escalamiento.ts`)

Versión mínima de la escalera (nivel único → director directo; la escalera completa
multi-canal es la fase 2, §III.2): si un lead con humano a cargo lleva más de
`escalamiento_horas` sin respuesta, email al director. Máximo `max_escalamientos_dia` por
día; nunca dos veces el mismo caso sin cambios.

**Files:**
- Create: `lib/seguimiento/escalamiento.ts`
- Test: `lib/seguimiento/escalamiento.test.ts`
- Modify: `app/api/seguimiento/run/route.ts` (tarea `"escalamiento"`)

**Interfaces:**
- Consumes: `seguimiento_esperando_humano()` (Task 3), Resend (`RESEND_API_KEY`,
  `RESEND_FROM` — misma técnica que los emails de handoff), email del director según lo
  confirmado en Task 0 Step 4.
- Produces: `armarEmailEscalamiento(lead, horas): { asunto, html }` (pura, testeable) y
  `correrEscalamiento(db, fetchFn?)`.

- [ ] **Step 1: Test que falla**

```ts
import { describe, it, expect } from "vitest"
import { armarEmailEscalamiento } from "./escalamiento"

describe("armarEmailEscalamiento", () => {
  it("trae el dato, el tiempo y la acción sugerida (nunca solo el problema)", () => {
    const { asunto, html } = armarEmailEscalamiento(
      { contact_name: "Laura Gómez", contact_phone: "+5491100000000" }, 4)
    expect(asunto).toContain("Laura Gómez")
    expect(html).toContain("4 horas")
    expect(html).toMatch(/¿|sugerencia|responder/i)   // acción sugerida, no solo la queja
  })
})
```

- [ ] **Step 2: Implementar**

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import { registrarEvento } from "./eventos"

export function armarEmailEscalamiento(
  lead: { contact_name: string | null; contact_phone: string }, horas: number
) {
  const nombre = lead.contact_name ?? lead.contact_phone
  return {
    asunto: `🔴 Lead sin atender — ${nombre}`,
    html: [
      `<p><strong>${nombre}</strong> (${lead.contact_phone}) escribió y un asesor tomó el chat,`,
      `pero lleva <strong>${horas} horas</strong> sin respuesta.</p>`,
      `<p>Sugerencia: entrá a PRISMA y respondele, o pedile a otro asesor que lo tome.</p>`,
      `<p style="color:#888">— Agente de seguimiento de PRISMA</p>`,
    ].join("\n"),
  }
}

export async function correrEscalamiento(db: SupabaseClient, fetchFn: typeof fetch = fetch) {
  const { data: configs } = await db.from("seguimiento_config").select("*")
  for (const config of configs ?? []) {
    if (config.modo !== "activo") continue
    const { data: esperando } = await db.rpc("seguimiento_esperando_humano", { p_horas: config.escalamiento_horas })
    const casos = (esperando ?? []).filter((c: { agency_id: string }) => c.agency_id === config.agency_id)
    if (!casos.length) continue

    // Higiene: tope diario + nunca repetir el mismo caso sin cambios
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
    const { data: yaHoy } = await db.from("lead_eventos")
      .select("conversation_id").eq("agency_id", config.agency_id)
      .eq("tipo", "escalamiento").gte("ts", hoy.toISOString())
    const avisados = new Set((yaHoy ?? []).map((e) => e.conversation_id))
    if (avisados.size >= config.max_escalamientos_dia) continue

    // Email del director: query según la columna confirmada en Task 0 Step 4
    const { data: directorEmail } = await db.rpc("seguimiento_email_director", { p_agency: config.agency_id })
    if (!directorEmail) continue

    for (const caso of casos.slice(0, config.max_escalamientos_dia - avisados.size)) {
      if (avisados.has(caso.id)) continue
      const horas = Math.round((Date.now() - Date.parse(caso.last_message_at)) / 3600e3)
      const { asunto, html } = armarEmailEscalamiento(caso, horas)
      await fetchFn("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: process.env.RESEND_FROM, to: directorEmail, subject: asunto, html }),
      })
      await registrarEvento(db, config.agency_id, caso.id, "escalamiento",
        `Email al director: ${asunto}`, { horas })
    }
  }
}
```

La función `seguimiento_email_director(uuid)` se escribe en una migración chica (con OK)
sobre la tabla real verificada 24/8 — el equipo vive en **`profiles`** (role
'director'/'asesor', email, phone, estado):
`select email from profiles where agency_id = $1 and role = 'director' limit 1`
(afinar por `estado` al escribirla). El filtro "último mensaje es del LEAD" usa el valor
real **`role = 'lead'`** de `wa_messages` (verificado: lead/bot/human/internal) —
completándolo en `correrEscalamiento` con una consulta a `wa_messages` por caso si la
función SQL no alcanza.

- [ ] **Step 3: Enchufar** `tarea === "escalamiento"` en el runner + tercer llamado del
  reloj n8n cada 30 min (con OK). Probar con un caso armado en la agencia de prueba:
  handoff simulado, bajar el umbral a 0.1h, verificar que llega UN email y que el segundo
  run NO lo repite.
- [ ] **Step 4: Correr suite → PASS. Commit** — `git add lib/seguimiento/escalamiento.ts lib/seguimiento/escalamiento.test.ts app/api/seguimiento/run/route.ts && git commit -m "feat(seguimiento): escalamiento al director con tope diario y sin repetidos"`

### Task 20: Verificación integral + documentación + merge (⚠️ merge REQUIERE OK)

- [ ] **Step 1: Suite completa** — `npm run test` (todo el repo) → verde. `npm run build`
  → sin errores.
- [ ] **Step 2: Verificación funcional en el navegador (escritorio + celular emulado):**
  - Ficha del lead con panel (decisiones + evidencia + trace + compromisos) ✔
  - Un ciclo completo real en la agencia de prueba: lead frío → el agente investiga →
    decisión → plantilla llega al WhatsApp → responder desde el celular → el
    conversacional retoma sabiendo qué plantilla salió → `lead_eventos` cuenta la
    historia completa ✔
  - Un lead con visita agendada recibe el recordatorio que toca ✔
  - Kill-switch probado: `modo='sombra'` frena los envíos en la corrida siguiente ✔
- [ ] **Step 3: Revisión de costos reales:** sumar `costo_usd` de las corridas y
  cotejarlo contra la Console/Usage API de Anthropic (la trampa conocida: mirar el caché
  en tokens, no en dólares). Anotar el número real en la doc.
- [ ] **Step 4: Documentar:**
  - `docs/interno/LOGICA-PRISMA.md`: sección nueva "Super Agente de Seguimiento — Fase 1"
    — las 5 capas, el loop con herramientas, tablas, modos (apagado/sombra/activo),
    guardrails, rollback, y el mapa de fases (Parte I y III de este plan).
  - `docs/compartible/`: guía funcional para no técnicos (estilo de la casa: usabilidad y
    tips, sin tecnicismos) — qué ve el asesor en la ficha, qué significa cada acción, qué
    es la evidencia, qué emails le llegan al director.
- [ ] **Step 5: Mostrar todo a Leonardo → con su OK: merge a main.** El flujo viejo de
  n8n queda apagado tal como está (rollback disponible); se le agrega al nombre
  `(REEMPLAZADO por /api/seguimiento/run — ver LOGICA-PRISMA.md)` con OK, para que nadie
  lo reencienda por error.
- [ ] **Step 6: Commit final + merge**

```bash
git add docs/interno/LOGICA-PRISMA.md docs/compartible/guia-super-agente.md
git commit -m "docs(seguimiento): logica interna y guia funcional del super agente fase 1"
# con OK de Leonardo:
git checkout main && git merge feat/super-agente-fase-1 && git push
```

---

## Los 18 guardrails de la Fase 1 (todos en código, ninguno solo en el prompt)

1. `opt_out` corta en SQL antes de todo (Capa 1)
2. Regla de silencio: cualquier mensaje < `silencio_minimo_horas` (20h) ⇒ el seguimiento no existe para ese lead
3. `bot_active = false` (humano al mando) ⇒ ni decisión ni envío ni recordatorio
4. Doble verificación pre-envío: se relee la conversación; si algo cambió, se bloquea
5. Máximo 1 mensaje de seguimiento por lead por día (comparado en día argentino, no UTC)
6. Máximo `max_intentos` (3) por lead — hard stop
7. Presupuesto diario por agencia (`max_mensajes_dia`)
8. `confianza < 0.5` ⇒ no se ejecuta
9. Falla el agente ⇒ no se manda nada, se registra el error (degradación elegante)
10. Ventana horaria 6–23 AR — la aplica el dispatch (ya probada en producción)
11. El agente jamás marca `closed_lost` — `abandonar` solo apaga el seguimiento
12. Escalamiento: tope `max_escalamientos_dia` (3) y nunca el mismo caso dos veces sin cambios
13. Kill-switch en dos niveles: por agencia (`seguimiento_config.modo`) y global (`SEGUIMIENTO_MODO`)
14. Herramientas de SOLO lectura — el loop no puede escribir nada; enviar es exclusivo del ejecutor
15. Tope de 6 iteraciones del loop — sin decisión válida al llegar: error registrado, nada enviado
16. Requisitos de investigación en código — `contactar` sin haber leído mensajes e intentos previos se rechaza dentro del loop (es un `if`, no una regla de prompt)
17. Deadline de corrida (240 s) — nunca un timeout a mitad de un lead
18. Dedupe (20 h) — un lead decidido no vuelve a entrar al agente hasta que pase el plazo

## Puntos de la Fase 1 que requieren OK explícito de Leonardo (en orden)

1. **Task 3** — aplicar la migración SQL (4 tablas + 2 funciones + la de visitas, aditivo)
2. **Task 11** — crear credencial + workflow reloj en n8n (y opcional: rotar `DISPATCH_SECRET`)
3. **Task 12 Step 3** — acordar el tope de costo por decisión viendo el número real de la sombra
4. **Task 16** — segundo llamado del reloj (visitas)
5. **Task 17** — pasar PRISMAIA - VAKDOR de `sombra` a `activo` (primeros envíos reales)
6. **Task 19** — tercer llamado del reloj (escalamiento) + migración chica del email del director
7. **Task 20** — merge a main

---
---

# PARTE III — LAS FASES SIGUIENTES, EN DETALLE

> Método de cada fase: (a) task de verificación de solo lectura → (b) plan de ejecución
> TDD estilo Parte II → (c) sombra → (d) OK → (e) encendido para la agencia de prueba.
> Los esquemas de abajo son bosquejos de diseño: el plan de ejecución de cada fase los
> cierra contra lo verificado.

## III.2 FASE 2 — El asesor en el circuito: escalera, email bidireccional, plantillas a demanda

### III.2.1 Verificaciones previas (solo lectura)

- [ ] ¿Dónde viven teléfono y email de cada **asesor**? (Task 0 Step 4 releva columnas;
  acá se confirma que hay teléfono utilizable)
- [ ] ¿El provisionador de plantillas corre al registro o a mano? (sale de Task 2)
- [ ] ¿Cuántas plantillas admite la WABA real y cuántas hay?
- [ ] ¿Resend ofrece inbound hoy? Si no: probar Cloudflare Email Routing + Worker →
  webhook con un email real de ida y vuelta (el DNS de vakdor.com ya está en Cloudflare;
  escribir DNS ⇒ OK)
- [ ] ¿Qué dominio para la casilla del agente? (`vakbot.vakdor.com` ya verificado en
  Resend vs. uno dedicado)
- [ ] ¿La conexión de Google Calendar es solo del director o también de asesores?
- [ ] ¿Dónde identifica el webhook/flujo de n8n al remitente entrante y dónde se crea la
      `wa_conversation`? (para ubicar el **gate de internos** de §III.2.6 ANTES de ese
      punto — leer el workflow es libre, modificarlo requiere OK)
- [ ] ¿Escribe algo en `wa_messages` la respuesta del asesor desde el panel de PRISMA?
      (¿con qué `role`?) — completa el mapa de cobertura de la memoria (§I.3)

### III.2.2 Esquema aditivo (bosquejo)

```sql
-- Toda interacción por canales no-WhatsApp. NUNCA se mezcla con wa_messages.
create table interacciones_canal (
  id               uuid primary key default gen_random_uuid(),
  agency_id        uuid not null,
  conversation_id  uuid,                  -- null si el destinatario es asesor/director
  destinatario     text not null check (destinatario in ('lead','asesor','director')),
  destinatario_ref text not null,         -- teléfono, email o id según el caso
  canal            text not null check (canal in ('email','llamada','whatsapp','interno')),
  direccion        text not null check (direccion in ('salida','entrada')),
  asunto           text,
  contenido        text not null,         -- cuerpo del email o transcript de la llamada
  metadata         jsonb default '{}',    -- message-id, wamid, retell_call_id, etc.
  ts               timestamptz default now()
);
create index on interacciones_canal (conversation_id, ts desc);
create index on interacciones_canal (agency_id, destinatario, ts desc);

-- El ciclo de vida de una plantilla pedida a demanda
create table plantillas_solicitudes (
  id                uuid primary key default gen_random_uuid(),
  agency_id         uuid not null,
  nombre_propuesto  text not null,
  categoria         text not null,        -- utility / marketing (lo exige Meta)
  cuerpo_propuesto  text not null,
  justificacion     text not null,        -- la lee el director
  proceso_origen    text,                 -- qué decisión/compromiso la necesitó
  estado            text not null default 'solicitada' check (estado in
                    ('solicitada','aprobada_director','rechazada_director',
                     'enviada_meta','aprobada_meta','rechazada_meta')),
  reformulaciones   int not null default 0,   -- tope 2 autónomas (regla acordada)
  motivo_rechazo    text,
  resuelta_por      text,                 -- 'agente' | email del director
  creado_en         timestamptz default now(),
  actualizado_en    timestamptz default now()
);

-- La casilla administrada por agencia
create table casillas_agente (
  agency_id   uuid primary key,
  direccion   text not null unique,       -- seguimiento-ag<6hex>@<dominio verificado>
  estado      text not null default 'activa' check (estado in ('activa','pausada')),
  creado_en   timestamptz default now()
);

-- La escalera del asesor: un caso por cliente desatendido
create table escalamientos_asesor (
  id               uuid primary key default gen_random_uuid(),
  agency_id        uuid not null,
  conversation_id  uuid not null,
  asesor_ref       text not null,
  origen           text not null,         -- 'handoff' | 'visita_pendiente'
  detectado_en     timestamptz not null,
  avisos           jsonb not null default '[]',  -- [{nivel, canal, ts, respondio}]
  estado           text not null default 'abierto' check (estado in
                   ('abierto','atendido','escalado_director','reasignado','cerrado')),
  cerrado_en       timestamptz
);
create unique index on escalamientos_asesor (conversation_id) where estado = 'abierto';

-- Identidad unificada omnicanal (§III.2.8.1): un lead, varias identidades de canal.
-- Arranca solo con teléfonos (lo que existe hoy); queda listo para email/IG/web/llamadas
-- sin migración. Los merges de duplicados se registran como evento, nunca se borran filas.
create table lead_identities (
  agency_id    uuid not null,
  canal        text not null,             -- 'whatsapp'|'email'|'instagram'|'facebook'|'web'|'llamada'
  external_id  text not null,             -- E.164 | email | handle | psid | session-id
  lead_id      uuid not null,             -- canónico (fase 2: el id de wa_conversations)
  verificada   boolean not null default false,
  creado_en    timestamptz not null default now(),
  primary key (agency_id, canal, external_id)
);

-- Observabilidad hacia el operador (§III.2.8.2): el sistema le avisa a Leonardo
-- cuando ÉL falla, no solo cuando un lead necesita algo.
create table system_events (
  id           bigint generated always as identity primary key,
  agency_id    uuid,                      -- null = evento de plataforma, no de una agencia
  severidad    text not null check (severidad in ('critico','warning','info')),
  tipo         text not null,             -- 'envio/fallo','webhook/caido','aprobacion/vencida',
                                          -- 'schedule/no_disparo','plantilla/rechazada'...
  payload      jsonb not null default '{}',
  notificado_en timestamptz,              -- crítico → WhatsApp/email inmediato; resto → digest
  creado_en    timestamptz not null default now()
);
create index on system_events (severidad, creado_en desc);

-- Aprobaciones consume-once (§III.2.8.3): el mecanismo ÚNICO de aprobación humana.
-- Se guarda la ACCIÓN EXACTA a ejecutar; al aprobar, el sistema re-ejecuta eso
-- server-side — el modelo nunca reescribe lo aprobado. Fail-closed: sin respuesta,
-- no se ejecuta. Una aprobación se consume una sola vez.
create table aprobaciones (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null,
  conversation_id uuid,
  solicitada_por text not null,           -- 'agente_seguimiento' | 'escalera' | ...
  accion        jsonb not null,           -- la llamada exacta a re-ejecutar al aprobar
  aprobador     text not null,            -- 'director' | 'asesor:<id>'
  justificacion text not null,            -- la lee el humano
  estado        text not null default 'pendiente'
                check (estado in ('pendiente','aprobada','rechazada','vencida')),
  decidida_por  text,
  decidida_en   timestamptz,
  consumida     boolean not null default false,
  vence_en      timestamptz,
  creado_en     timestamptz not null default now()
);
create index on aprobaciones (agency_id, estado, creado_en desc);
```

### III.2.3 La escalera del asesor (frente 2)

```
Detección (cada corrida del reloj): cliente con humano a cargo (bot_active=false) u
  orden de coordinar visita, cuyo último mensaje es del LEAD y lleva > umbral sin
  respuesta del asesor  →  se abre un caso en escalamientos_asesor.

Nivel 1 (t0):      WhatsApp al asesor (plantilla si su ventana de 24h está cerrada):
                   qué cliente, hace cuánto espera, link directo al chat.
Nivel 2 (t0+2h):   email al asesor (misma info + el historial del caso).
Nivel 3 (t0+6h):   segundo WhatsApp ("seguís teniendo a X esperando…").
Nivel 4 (t0+24h):  WhatsApp + email al DIRECTOR con: el caso completo, los avisos
                   enviados y si el asesor respondió algo, la justificación, y la
                   pregunta con botones EN EL PANEL: [Reasignar a …] [Lo tomo yo]
                   [Dar más tiempo]. La reasignación efectiva la ejecuta el sistema
                   con la elección del director — el agente nunca reasigna solo.
```

- **"Atendido" se mide por el dato, no por la promesa:** el caso se cierra solo cuando
  aparece un mensaje del asesor al cliente en `wa_messages` posterior a t0. Si el asesor
  contesta el aviso "ya lo atiendo" pero no le escribe al cliente, la escalera SIGUE.
- Guardrails: tope de avisos por asesor por día; avisos solo en horario laboral; cada
  aviso y respuesta queda en `avisos` (jsonb) y en `lead_eventos`; el director puede
  pausar la escalera por asesor (vacaciones).
- Mientras el caso está abierto, el frente 1 puede mandarle al **cliente** el aviso de
  tranquilidad ("tu consulta la está viendo el asesor") — como decisión normal del
  decisor, con su plantilla, respetando el límite de 1 mensaje/día y sin prometer plazos.
- Reemplaza al escalamiento mínimo de la Task 19 (que queda como el fallback del nivel 4).

### III.2.4 Email bidireccional

- **Salida:** módulo `lib/canales/email.ts` sobre Resend (ya en producción — referencia:
  `app/api/cron/weekly-report/route.ts`). FROM = la casilla de `casillas_agente`; todo
  envío escribe `interacciones_canal` + `lead_eventos` + (si es relevante para la
  conversación) la inyección al conversacional (§I.3).
- **Entrada:** según lo verificado en III.2.1 — camino preferido: Cloudflare Email
  Routing con catch-all del subdominio → Worker → `POST /api/email/inbound` (firmado con
  secreto). El endpoint: identifica la casilla destino → agencia; matchea el remitente
  contra leads (email en `metricas`) y asesores; guarda en `interacciones_canal`
  (direccion='entrada'); registra el evento; y **crea un compromiso** para que la próxima
  corrida del decisor lo procese con contexto completo (no se responde en caliente: el
  ritmo del reloj es el ritmo del sistema).
- Lo que habilita: el director aprueba respondiendo un email, el asesor contesta "decile
  al cliente tal cosa" por email (la fase 3 lo ejecuta), y "mandame la info por email"
  tiene ida y vuelta completa.

### III.2.5 Plantillas a demanda + provisionador al registro

Implementa el flujo de §I.6 sobre `plantillas_solicitudes`: aviso al director por
WhatsApp + email con justificación y texto propuesto → **botón Aprobar/Rechazar en el
panel** → creación en la WABA → el reloj consulta el estado en Meta cada corrida →
aprobada ⇒ la próxima corrida del decisor la usa. Con las tres reglas acordadas (rechazo
⇒ hasta 2 reformulaciones autónomas y después director; fallback a email/llamada a las
24h; nunca crear sin aprobación y verificando el tope de la WABA). Además: si la Task 2
encontró que el provisionador no corre al registro, esta fase lo engancha al alta de
agencia (todas las plantillas del catálogo, juntas). Y suma la Card de email en la tab
Integraciones (§I.5.1) + la Card "Agente de llamadas — Próximamente".

### III.2.6 El gate de internos: el mismo número, sin que el bot "califique" al asesor

**El problema:** los avisos de la escalera le llegan al asesor por el MISMO número de
WhatsApp que atiende a los leads. Cuando el asesor contesta ("ya lo atiendo"), su mensaje
entra por el mismo webhook — y sin un filtro, el conversacional lo trataría como un lead
nuevo: le crearía una `wa_conversation`, lo saludaría y lo saldría a calificar.

**La solución (determinista, un solo punto de corte):**

```
mensaje entrante → ¿el teléfono del remitente está en la allowlist de internos
                    (asesores + director de la agencia, en E.164)?
  NO  → sigue el flujo actual intacto (lead → conversacional / asesor humano)
  SÍ  → NO pasa al conversacional y NO crea wa_conversation. En cambio:
        1. se guarda en interacciones_canal (canal=whatsapp, direccion=entrada,
           destinatario=asesor) — queda en el expediente
        2. si hay un caso abierto en escalamientos_asesor para ese asesor, el mensaje
           se anota como respuesta en `avisos` (el caso NO se cierra por esto:
           "atendido" se mide en wa_messages, no en promesas)
        3. desde fase 3, el texto pasa por el detector de comandos
           ("decile al cliente tal cosa" → compromiso)
```

Detalles que importan:

- **El gate va ANTES de la creación de conversación** en el flujo de n8n (ubicación
  exacta según la verificación de III.2.1). Es un nodo Switch con lookup contra la
  allowlist — el único cambio al workflow del conversacional en todo el plan, chico y
  con OK explícito + backup del JSON antes de tocar.
- **La allowlist sale de la tabla real de asesores** (confirmada en Task 0 Step 4),
  normalizada a E.164 con el mismo normalizador que ya usa el alta de contactos.
- **Los teléfonos internos también se excluyen de la Capa 1** del decisor y de cualquier
  campaña: un asesor jamás debe ser "candidato a seguimiento" (se agrega el filtro a
  `seguimiento_candidatos` en la migración de la fase 2).
- **Plan B si tocar el workflow se considera demasiado riesgoso:** un **segundo número**
  (instancia Evolution aparte) exclusivo para avisos internos. Separa perfecto sin gate,
  a costa de otro número que mantener y de perder "todo en un chat". La decisión se toma
  en la fase 2 con el workflow a la vista; el diseño de las tablas sirve igual para
  ambos caminos.

### III.2.7 Criterio de salida de la fase 2 (sombra propia)

La escalera corre en sombra (registra qué avisos HABRÍA mandado) 1 semana. Salida: 0
falsos positivos de "asesor desatento" firmados por Leonardo; el email de ida y vuelta
probado con un caso real; una solicitud de plantilla completa de punta a punta en la
agencia de prueba; y las alertas críticas de `system_events` llegando de verdad al
WhatsApp/email de Leonardo (probadas con un fallo provocado).

### III.2.8 Las tres piezas adoptadas del blueprint de agentes (24/8/2026)

Adoptadas tras el análisis del blueprint `PRISMA_BLUEPRINT_AGENTES.md` (los dos repos de
referencia fueron verificados — ver §III.10). Son las que pagan su costo ya en la fase 2:

**III.2.8.1 — Identidad unificada omnicanal (`lead_identities`).** Hoy todo está clavado
al teléfono (`wa_conversations`); con la expansión de canales (email ya en fase 2; widget
web, Instagram, Facebook y llamadas en el horizonte), un lead que entra por un canal y
sigue por otro necesita un `lead_id` canónico con identidades por canal. La tabla nace en
fase 2 **solo con teléfonos** (una fila por conversación existente, backfill trivial) y el
matcheo del email inbound (§III.2.4) pasa a resolverse por acá en vez de buscar en
`metricas`. Regla: los merges de leads duplicados se registran como evento en
`lead_eventos` — nunca se borran filas. Costo hoy: mínimo. Costo de NO hacerlo: una
migración dolorosa cuando el segundo canal real llegue.

**III.2.8.2 — Observabilidad hacia el operador (`system_events` + notificador).** La fase
1 tiene trazabilidad por lead, pero nadie le avisa a Leonardo cuando el SISTEMA falla:
envíos que fallan, el webhook caído, aprobaciones vencidas sin respuesta, corridas del
reloj que no dispararon, plantillas rechazadas por Meta. Cada una es una fila en
`system_events`; un paso del reloj las notifica: `critico` → WhatsApp/email inmediato a
Leonardo; el resto → digest diario por email. Versión mínima en fase 2 (solo críticos);
un agente de optimización que proponga mejoras leyendo métricas agregadas queda para
mucho después, cuando haya volumen de datos.

**III.2.8.3 — Aprobaciones consume-once (`aprobaciones`).** Reemplaza los estados de
aprobación sueltos por caso por UN mecanismo: el agente no ejecuta la acción sensible —
guarda **la llamada exacta** en `aprobaciones.accion`, el humano recibe el aviso con la
justificación y un botón en el panel, y al aprobar **el sistema re-ejecuta esa acción
guardada** — el modelo nunca la reescribe, la aprobación se consume una sola vez, y sin
respuesta no se ejecuta nada (fail-closed). Lo usan: la solicitud de plantilla nueva
(`plantillas_solicitudes` conserva su ciclo de vida Meta, pero su aprobación del director
pasa por acá), la reasignación de la escalera (nivel 4), y toda acción sensible futura
(fases 3-5). Auditoría completa: pedido y decisión quedan como eventos apareados en
`lead_eventos`.

## III.3 FASE 3 — Comandos y compromisos detectados en la conversación (frente 4)

**Qué:** un **detector** que corre sobre los mensajes nuevos (de cliente y asesor) y
convierte pedidos en compromisos ejecutables — sin que nadie cargue nada a mano.

| Quien dice | Ejemplo | Se convierte en |
|---|---|---|
| Cliente | "mandame la info por email" | compromiso `envio_prometido` (canal email, vence +2h) |
| Cliente | "llamame en un rato" / "avisame la semana que viene" | compromiso `llamada_prometida` / `respuesta_pendiente` con vencimiento calculado |
| Cliente | "avisame si baja de precio o aparece algo así" | una **vigía** (fase 4) |
| Asesor | "decile al cliente tal cosa" / "mandale la ficha por email" | compromiso `envio_prometido` asumido por `agente`, con el contenido indicado |

**Diseño:**
- El detector es un paso barato del reloj: toma los mensajes nuevos desde la última
  corrida y con una llamada chica (modelo económico, salida validada con Zod igual que el
  decisor) extrae `{hay_pedido, tipo, contenido, vencimiento_relativo, confianza}`. Con
  confianza < 0.7 no crea nada — registra el evento "posible pedido" para revisión.
- **Ejecutar es del ejecutor, no del detector.** El compromiso creado lo levanta la
  próxima corrida del decisor con el expediente completo — que valida contra las reglas
  de canal (¿ventana de 24h abierta? ⇒ whatsapp_libre; ¿pidió email? ⇒ email) y los
  guardrails de siempre.
- **"Decile al cliente X" nunca es literal a ciegas:** el agente redacta sobre la
  instrucción del asesor con las prohibiciones vigentes (expensas, no inventar) y guarda
  instrucción original + mensaje enviado en el expediente. Si la instrucción pide algo
  prohibido, escala al asesor con el porqué en vez de ejecutar.
- Guardrails: idempotencia (mismo mensaje no genera dos compromisos — hash del mensaje
  origen en metadata), tope de compromisos auto-creados por lead por día, y sombra: las
  primeras semanas el detector solo CREA compromisos visibles en el panel y el asesor
  confirma con un clic; la auto-ejecución se enciende por agencia cuando la precisión
  medida lo justifique.

**Verificación previa:** medir en `wa_messages` reales cuántos de estos pedidos aparecen
por semana (muestreo sobre una muestra representativa) — dimensiona si el detector corre
sobre todo el tráfico o solo conversaciones activas.

## III.4 FASE 4 — Vigías sobre el inventario (frente 5)

```sql
create table vigias (
  id               uuid primary key default gen_random_uuid(),
  agency_id        uuid not null,
  conversation_id  uuid not null,
  tipo             text not null check (tipo in ('baja_precio','nueva_coincidencia')),
  criterio         jsonb not null,   -- {property_id} o {zona, tipo, presupuesto_max, ambientes...}
  estado           text not null default 'activa' check (estado in ('activa','disparada','cancelada')),
  creada_por       text not null,    -- 'detector' | 'asesor'
  creado_en        timestamptz default now(),
  disparada_en     timestamptz
);
```

- **Baja de precio** necesita historial: verificar si el sync de Tokko guarda precio
  anterior; si no, tabla aditiva `propiedades_precios_hist` (property_id, precio, moneda,
  ts) poblada por un hook del sync — la lógica del sync existente no se modifica, solo se
  le agrega el snapshot.
- **Nueva coincidencia** reusa lo que ya existe: los embeddings de `properties` y los
  filtros duros del ACM — el matching es el mismo problema ya resuelto para comparables,
  con el criterio del lead como query.
- Al disparar: la vigía NO manda sola — crea un compromiso con la evidencia (precio
  anterior → nuevo, o la propiedad nueva) y el decisor lo ejecuta con todas las reglas de
  canal y frecuencia. Aviso perfecto = con el dato citado, por el canal correcto, sin
  duplicados (estado `disparada`).

## III.5 FASE 5 — El coach del asesor (frente 3)

Última a propósito: es la única cuyo insumo no está verificado. **Nada se diseña en firme
hasta correr su verificación:**

- [ ] ¿Existe un tracking de actividades del asesor? ¿Qué tabla, qué eventos, desde cuándo?
- [ ] ¿Qué se puede medir HOY sin construir nada?: tiempo de respuesta por asesor
  (computable de `wa_messages`), cierres/captaciones (funnel_status + properties),
  frecuencia de uso (¿sesiones en los logs de auth de Supabase?).
- [ ] ¿La correlación "responder a cierta hora sube el cierre" da con NUESTROS datos? (el
  tip solo se manda si el dato propio lo respalda — nunca un consejo genérico disfrazado
  de dato).

Con eso verificado, el coach es el mismo chasis: corrida semanal/diaria por asesor,
herramientas `leer_metricas_asesor` / `leer_logros`, decide si hay algo que valga la pena
decir (el default es NO mandar nada — un coach que spamea se ignora a la semana), canal
según la ventana de 24h, tope estricto de frecuencia (máx 2 mensajes/semana), opt-out por
asesor, y cada mensaje con su dato citado ("cerraste 2 visitas esta semana" sale de una
query, no de una impresión). Las felicitaciones se disparan por evento real (cierre,
captación), no por calendario.

## III.6 MÓDULO C — Campañas con agentes especializados

Adoptado del blueprint (su P4, patrón "first contact binds" de Synapse). Alcance de
producto nuevo que la visión original no tenía y que conecta con lo que ya existe (las
campañas por goteo actuales): **una campaña = plantilla de agente + lista de números +
interruptores + condición de cierre.**

- **El portero.** El gate de internos (§III.2.6) se generaliza a un router único a la
  entrada del webhook: (1) resolver identidad → lead (`lead_identities`), (2) resolver
  agencia, (3) ¿este contacto está en una campaña activa? → despachar al agente de la
  campaña y aplicar sus interruptores; si no → flujo actual intacto. Mientras no haya
  campañas activas es un pass-through: deploy sin riesgo.
- **Interruptores:** una campaña puede silenciar selectivamente a los agentes core para
  sus números (`suppress`: el conversacional, el seguimiento, o ambos) — el caso "no le
  hagan seguimiento a estos números" sale gratis. Al cerrar la campaña (fecha, opt-out u
  objetivo cumplido), el número vuelve solo al comportamiento default. Todo cambio de
  ruteo queda en `lead_eventos` (`campaign/attached`, `campaign/detached`).
- **Casos que habilita:** reclutador que ultra-califica candidatos a asesor, captador de
  propietarios, y listas frías con agente propio sin ensuciar al conversacional core.
- **Esquema (bosquejo):** `campanas` (agency_id, nombre, plantilla_agente, overrides,
  suppress text[], condicion_cierre jsonb, estado) + `campana_numeros` (campana_id,
  telefono E.164, estado activo/cerrado/optout). Los agentes de campaña usan el MISMO
  chasis (loop + herramientas + guardrails) con otra semilla y otro prompt — acá es donde
  el modelo de "plantillas de agente por capas" del blueprint (capa Vakdor → capa agencia
  → capa campaña) se vuelve necesario y se implementa.
- **Cuándo:** después de la fase 3 (necesita el portero de la fase 2 y `whatsapp_libre`
  de la fase 3). Guardrails propios: presupuesto diario por campaña, ventana horaria,
  opt-out inmediato y goteo — las lecciones de la cuenta bloqueada por Meta aplican acá
  con más fuerza que en ningún otro lado.

## III.7 HABILITACIÓN L — Llamadas (Retell + voz ElevenLabs)

No es una fase con fecha: es un módulo diseñado que se enciende cuando (a) los frentes
1-3 estén estables, (b) el pricing real por minuto esté medido (Retell cobra por minuto y
la voz de ElevenLabs tiene tier gratis con límites — números exactos a verificar contra
los pricings reales el día que se habilite, no se asumen hoy), y (c) Leonardo decida que
el caso de negocio lo paga. Hasta entonces, todo "llamar" del sistema es un compromiso
`llamada_prometida` asignado al asesor — que ya funciona desde la fase 1.

Flujo cuando se habilite (flag `llamadas_habilitadas`, ya en `seguimiento_config`):

```
decisor decide canal=llamada
  → flag apagado ⇒ degrada: compromiso `llamada_prometida` asignado al asesor + aviso
  → flag prendido ⇒
      1. crear llamada vía API de Retell con: número del lead, script objetivo,
         y el CONTEXTO del expediente (qué se habló, qué se busca, qué NO decir —
         las mismas prohibiciones del prompt: expensas, inventar propiedades)
      2. Retell ejecuta con la voz configurada (ElevenLabs) y devuelve por webhook:
         transcript completo + resultado (atendió/no, qué dijo, compromisos nuevos)
      3. el webhook escribe: interacciones_canal (canal=llamada, direccion=salida,
         contenido=transcript) + lead_eventos + inyección de resumen al conversacional
      4. si de la llamada salen compromisos ("me dijo que lo llame el lunes"),
         el detector de la fase 3 los crea — el ciclo sigue solo
```

Guardrails propios del canal: ventana horaria más estricta que WhatsApp (p.ej. 9-20 AR,
configurable), máximo 1 llamada por lead por semana, jamás llamar a quien pidió no ser
llamado, transcript siempre en el expediente, y costo por minuto medido antes de
habilitar para clientes.

## III.8 Mapa de OKs y de riesgo por fase

| Fase | OKs de Leonardo | Riesgo principal | Mitigación |
|---|---|---|---|
| 1 | migración, reloj n8n, tope de costo, encendido, merge (lista completa en Parte II) | frases con datos inventados | evidencia + leer_propiedad + sombra con criterio de 0 alucinaciones |
| 2 | migración F2, DNS/dominio email, credencial del webhook, encendido escalera | falso "asesor desatento"; email mal ruteado | sombra de la escalera; "atendido" medido en wa_messages; prueba de ida y vuelta real |
| 3 | encendido de auto-ejecución por agencia | ejecutar un pedido mal interpretado | confianza mínima 0.7 + modo confirmación (un clic del asesor) antes de auto-ejecutar |
| 4 | hook de snapshot en el sync | avisos duplicados o con dato viejo | estado `disparada` + evidencia con precio citado |
| 5 | qué métricas se usan y frecuencia | coach percibido como vigilancia/spam | opt-out, tope semanal, solo datos propios citables |
| C | activar el portero en modo ruteo; cada campaña nueva | bloqueo de la cuenta de Meta por volumen/calidad | goteo + presupuesto por campaña + opt-out inmediato (lecciones de la cuenta LOCKED) |
| L | contratar Retell / habilitar flag | costo por minuto; experiencia de llamada | flag por agencia, pricing medido antes, transcript siempre en el expediente |

## III.9 Mapa spec v3.0 → este plan (qué entra en la fase 1, qué después)

| Sección de la spec | Estado |
|---|---|
| 2. Principios P-1…P-13 | ✅ Fase 1 (P-9 vía el dispatch existente como despachador único de WhatsApp; P-1 reforzado: evidencia + verificación por herramientas) |
| 6.2 Expediente 3 ejes | ✅ Fase 1 parcial con columnas existentes + `compromisos`; completo con `interacciones_canal` (F2) |
| 6.3 Compromisos | ✅ Fase 1 (visitas derivadas + creados por decisor); detector LLM en mensajes = Fase 3 |
| 6.4 Eventos | ✅ `lead_eventos` (Fase 1), versión mínima sin triggers |
| 6.5 Outbox | ⏭ Futuro. Fase 1: dispatch síncrono con doble verificación — el volumen actual no exige cola |
| 7.5 Elegibilidad 3 ejes | ✅ `seguimiento_candidatos()` (Fase 1) |
| 8.2 Regla de silencio | ✅ En SQL (Fase 1) |
| 8.3 Locks de propiedad | ✅ Equivalente F1: silencio 20h + `bot_active` + doble verificación + dedupe. Locks explícitos = futuro, si aparecen colisiones reales en `lead_eventos` |
| 8.5 Bloques de traspaso | ✅ Parcial: el dispatch ya inyecta lo enviado en `n8n_chat_histories`; el agente lee sus intentos previos con razones; la inyección se extiende a email/llamadas en F2+ |
| 10. Capas 0-5 | ✅ Fase 1 |
| 11.1 Modo Seguimiento | ✅ Fase 1 completo |
| 11.2 Confirmación de visita | ✅ Fase 1 (interpretar la respuesta la hace el conversacional, que ya está) |
| 11.3 Supervisión | ✅ Mínima en Fase 1 (director directo); escalera completa multi-canal + reasignación = Fase 2 |
| 12. Mediación | ✅ Fase 3 (comandos del asesor), con la decisión abierta del WhatsApp personal a resolver ahí |
| 9.2-9.6 Email/llamadas/otros canales inbound | ✅ Email = Fase 2; llamadas = Habilitación L; Instagram/widget = futuro |
| 14.2 Provisionador de plantillas | ✅ Ya existe; auditoría en Task 2; al registro + a demanda = Fase 2 |
| 17. Observabilidad | ✅ Fase 1 (ficha + razón + evidencia + trace + `lead_eventos`) |
| 19. Costos | ✅ Capas 0-2 gratis; loop cacheado con tope de 8 leads/corrida y 6 iteraciones; costo medido por decisión |
| 20. Fases 0-4 | ✅ Este plan ES esas fases adaptadas al esquema real, extendidas por la visión 21-22/8 |

## III.10 Proyectos a largo plazo (sin fecha; documentados para no cerrarles la puerta)

### III.10.1 El historial como proyección del diario (`derive_messages`)

**La idea** (patrón del event log de deepseek-harness): que el historial que ve CADA
modelo — el conversacional incluido — no sea una tabla propia (`n8n_chat_histories`) sino
una **proyección derivada del diario** (`lead_eventos` + `wa_messages` +
`interacciones_canal`): una función que, dado un lead y un agente, compila el contexto
exacto que ese agente debe ver, con visibilidad por evento (`external`/`internal`) y
compactación segura de rangos viejos (resumen que reemplaza en la proyección pero jamás
borra los eventos originales).

**Por qué NO ahora:** implica migrar la memoria del conversacional que está en producción
facturando — exactamente lo que la memoria unificada por composición (§I.3) evita. El
patrón de inyección cubre hoy el 90% del valor con el 5% del riesgo.

**Cuándo reconsiderarlo:** cuando (a) haya 3+ agentes escribiendo en los mismos hilos y
la inyección empiece a quedar chica, o (b) se reescriba el conversacional fuera de n8n
por otra razón. En ese momento, la referencia de diseño es `docs/subsystems/session.md`
del repo (event log append-only, `deriveMessages()`, fork/replay) y el archivado no
destructivo de Synapse (contexto compilado desde cadenas de archivo + cola viva).

**Qué ya dejamos preparado:** `lead_eventos` con `actor` y datos tipados es el embrión
del diario; la regla "cada dato tiene un dueño" hace que la proyección futura sea un
SELECT, no una migración.

### III.10.2 Los repos de referencia (verificados el 24/8/2026)

El blueprint que originó las adopciones de §III.2.8, §III.6 y esta sección es
`PRISMA_BLUEPRINT_AGENTES.md` (Downloads). Sus dos repos de referencia **existen y
coinciden con lo que el blueprint describe** (verificado por fetch directo el 24/8/2026):

- **`deepseek-ai/deepseek-harness`** (MIT, TypeScript, monorepo pnpm, "everything is a
  plugin" sobre el framework Cordis, en developer preview con breaking changes
  declarados). Confirmado que `docs/subsystems/` contiene `approval.md`, `compaction.md`,
  `attachment.md`, `code-runtime.md`, etc. — el mapa de lectura del blueprint es real.
- **`zai-org/Synapse`** (Apache-2.0, Node 22 + Fastify + PostgreSQL + Redis, en fase
  temprana de diseño). Confirmados textualmente en su README: los wakeups durables, el
  grants ledger `workspace_resource_grants`, las **aprobaciones consume-once que
  re-ejecutan la llamada original server-side** (el origen directo de §III.2.8.3), la
  memoria permisionada y el contexto compilado desde archivos.

**La regla sigue siendo la del blueprint y la nuestra: replicar patrones, no embeber
frameworks.** Ambos declaran contratos inestables — razón de más para copiar diseño
(con atribución, licencias permisivas) y no depender de su roadmap. El resto del
blueprint (workspace de documentos, sandbox de ejecución, skills del rubro) queda como
lectura de referencia para cuando el producto llegue ahí.

