# Diseño — Visitas confirmables regidas por el calendario

**Fecha:** 2026-07-10
**Autor:** Leonardo + Claude
**Estado:** Aprobado (diseño) — pendiente plan de implementación

---

## 1. Contexto y problema

El motor de seguimientos (workflow n8n `Seguimiento`, trigger cada 30 min) tiene dos ramas:

- **Rama F (inactividad / "no contestó"):** se gobierna por `wa_conversations.requires_follow_up = true`.
- **Rama V (recordatorios de visita 24h/3h/1h + no-show):** se gobierna por `wa_conversations.visit_status` y usa `wa_conversations.visit_scheduled_at`.

Hoy `visit_status` y `visit_scheduled_at` los setea **solo el bot** (`Analizar_Conversacion2` → `Actualizar_Metricas2` del workflow `PRISMA`), analizando el chat. Problemas:

1. El bot solo corre con `bot_active = true`. Cuando un asesor toma la conversación (handoff) y coordina la visita a mano, el bot no corre → `visit_status` nunca pasa a `scheduled` → **la rama V nunca dispara** para visitas coordinadas por humanos (el caso normal: el bot por diseño no agenda y `Gestion_Visita` está desactivada).
2. El criterio del bot para marcar `scheduled` exige un pacto explícito día+hora en el chat, que casi nunca ocurre.

Existe un sistema de calendario completo (tabla `scheduled_visits`, espejada al Google Calendar de cada asesor vía `google_event_id`; se opera desde `NewVisitDialog`, `EditVisitDialog`, la página pública `/agendar` y `asesor/director/calendario`).

## 2. Objetivo

Que las visitas se rijan por el **calendario real** (`scheduled_visits`) y que el motor de seguimientos persiga el objetivo central: **que el cliente confirme la visita**. El ciclo de vida completo de la visita (agendada → confirmada → realizada / no-show / cancelada) vive en el calendario y se refleja automáticamente en la conversación de WhatsApp.

## 3. Decisiones tomadas

- **Enfoque de sync:** trigger en la base de datos (fuente única de verdad). Descartados: código disperso en la app y cron en n8n.
- **Al cancelar:** reactivar los seguimientos por inactividad (`requires_follow_up = true`, temporizador reseteado).
- **Dirección del recordatorio:** el trigger sincroniza la dirección real; la rama V la usa, dejando el LLM `Mensaje V` como **fallback** cuando no haya dirección sincronizada.
- **Confirmada:** la marcan **ambos** — el cliente por WhatsApp (respuesta al recordatorio) y el asesor a mano en el calendario.
- **Realizada:** **automática** al pasar la hora de una visita confirmada, **y** a mano por el asesor. **La decisión del asesor siempre pisa lo automático.** `realizada` solo se permite si el estado anterior fue `confirmada`.
- **No-show:** si el cliente confirmó pero no asistió, el asesor marca `no_asistio` (pisa cualquier `realizada` automática).

## 4. Modelo de estados

`scheduled_visits.estado_visita` (fuente de verdad) y su mapeo a `wa_conversations.visit_status`:

| `estado_visita` | `visit_status` | Recordatorios V | Seguimientos F |
|---|---|---|---|
| `agendada` | `scheduled` | Persiguen confirmación (24/3/1h) | off |
| `confirmada` | `confirmed` | Se detienen (ya confirmó) | off |
| `realizada` | `completed` | off | off |
| `no_asistio` | `no_show` | Rama NS / post-no-show | reactivados |
| `cancelada` | `cancelled` | off | reactivados |

**Transiciones válidas:**
- `agendada → confirmada` (cliente confirma por WhatsApp, o asesor a mano)
- `agendada/confirmada → cancelada` (cliente o asesor)
- `confirmada → realizada` (auto al pasar la hora, o asesor a mano) — **solo desde `confirmada`**
- `confirmada → no_asistio` (asesor; el cliente confirmó pero no fue)
- `cancelada/no_asistio → agendada` (reprogramación con nueva fecha/hora)

**Regla de precedencia:** una acción manual del asesor es un UPDATE explícito y siempre gana. El job automático de `realizada` solo actúa sobre visitas que siguen en `confirmada` con la hora ya pasada, por lo que nunca pisa una decisión manual (`realizada`/`no_asistio` ya sacan la visita de `confirmada`).

## 5. Arquitectura y propiedad de columnas

**Fuente única de verdad = `scheduled_visits`.** Un trigger propaga a `wa_conversations`.

**Cambio de propiedad de columnas (crítico):**

| Columna en `wa_conversations` | Dueño ANTES | Dueño DESPUÉS |
|---|---|---|
| `visit_status` | bot (`Actualizar_Metricas2`) | **calendario (trigger)** |
| `visit_scheduled_at` | bot | **calendario (trigger)** |
| `visit_address` (nueva) | — | **calendario (trigger)** |
| `requires_follow_up` | bot | bot (handoff) **+** calendario (visita/cancelación/no-show) |
| `opt_out` | bot | bot (sin cambios) |

Hay que **quitar `visit_status` y `visit_scheduled_at` de lo que escribe `Actualizar_Metricas2`** para que el bot no pise al calendario. La rama F sigue protegida por su gate `visit_status NOT IN ('scheduled','confirmed')`, con `visit_status` ya como propiedad exclusiva del calendario.

## 6. Modelo de datos

`scheduled_visits` (existente): `lead_id text` (teléfono), `fecha_visita date`, `hora_visita time`, `estado_visita text`, `propiedad_titulo text`, `zona_propiedad text`, `agency_id uuid`, `agent_id uuid`, `google_event_id text`.
- Amplía valores de `estado_visita` a: `agendada` | `confirmada` | `realizada` | `no_asistio` | `cancelada`.

`wa_conversations` (existente): `contact_phone`, `agency_id`, `visit_status`, `visit_scheduled_at`, `visit_reminder_24h_sent/3h_sent/1h_sent`, `requires_follow_up`, `next_follow_up_at`, `metricas`.
- Amplía valores de `visit_status` a: `none` | `scheduled` | `confirmed` | `completed` | `no_show` | `cancelled`.
- **Nueva columna** `visit_address text`: dirección/ubicación de la visita para el recordatorio (`{{3}}`), desde `scheduled_visits.propiedad_titulo` (fallback `zona_propiedad`).

## 7. Lógica del trigger `sync_visit_to_conversation()`

`AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW` sobre `scheduled_visits`. Fila efectiva: `NEW` (INSERT/UPDATE) u `OLD` (DELETE).

Match: `wa_conversations.agency_id = <row>.agency_id AND regexp_replace(contact_phone,'\D','','g') = regexp_replace(<row>.lead_id,'\D','','g')`.

`visit_scheduled_at` = `(<row>.fecha_visita + <row>.hora_visita) AT TIME ZONE 'America/Argentina/Buenos_Aires'`.

| `estado_visita` resultante | Acción sobre las conversaciones que matchean |
|---|---|
| `agendada` | `visit_status='scheduled'`, `visit_scheduled_at=<calc>`, `visit_address=<calc>`, `requires_follow_up=false`, flags recordatorio a `false` |
| `confirmada` | `visit_status='confirmed'`, mantiene fecha/dirección, `requires_follow_up=false` (no resetea flags: ya no se persigue confirmación) |
| `realizada` | `visit_status='completed'`, `requires_follow_up=false` |
| `no_asistio` | `visit_status='no_show'`, `requires_follow_up=true`, `next_follow_up_at=now()` |
| `cancelada` / DELETE | `visit_status='cancelled'`, `visit_scheduled_at=null`, `visit_address=null`, `requires_follow_up=true`, `next_follow_up_at=now()`, flags a `false` |

Notas: idempotente; si no hay conversación para ese teléfono no toca nada; si hay varias con el mismo teléfono en la agencia, las actualiza todas.

## 8. Mecanismos de cambio de estado

**Confirmación por el cliente (WhatsApp) — independiente de `bot_active`:**
Las plantillas de recordatorio aprobadas en Meta **NO tienen botones**: el cliente responde con **texto natural libre** ("sí, confirmo", "ahí estoy", "dale", "no voy a poder", "cancelá", etc.). Por lo tanto no hay match exacto contra un botón; hay que **interpretar intención**. Dos caminos según el estado del bot:

- **Bot activo:** el agente principal ya interpreta la respuesta. La confirmación fluye por el agente (que puede setear el estado vía una acción). Detalle de wiring en el plan de la Fase 2.
- **Bot apagado (asesor atendiendo):** el webhook de entrada (`/api/webhooks/evolution` y `/api/webhooks/meta`, que corren siempre) detecta que existe una visita `agendada`/`confirmada` reciente para ese teléfono+agencia y, solo entonces, clasifica el texto entrante como confirmación / cancelación / ninguna. La clasificación se hace con un **clasificador liviano** (heurística de palabras clave en español rioplatense + fallback a un LLM barato ante ambigüedad — se define en el plan). Ante confirmación → `estado_visita='confirmada'`; ante cancelación → `cancelada`; ante duda → no hace nada (no arriesga). El trigger propaga a `wa_conversations`.

Este clasificador solo se activa cuando hay una visita abierta esperando confirmación, para acotar el alcance y el costo (no analiza todos los mensajes entrantes).

**Acciones del asesor (UI calendario):** botones para `confirmada`, `realizada` y `no_asistio` (además del cancelar/reprogramar ya existentes). `realizada`/`no_asistio` solo se ofrecen cuando la visita está `confirmada`.

**Job automático de `realizada`:** un proceso programado (pg_cron o schedule n8n) que hace `UPDATE scheduled_visits SET estado_visita='realizada' WHERE estado_visita='confirmada' AND (fecha_visita+hora_visita) < now()`. Nunca pisa una decisión manual (porque esas ya no están en `confirmada`).

## 9. Cambios en n8n (requieren OK explícito de Leonardo)

1. `Actualizar_Metricas2` (`PRISMA`): quitar del mapeo `visit_status` y `visit_scheduled_at`. Mantener `opt_out` y `requires_follow_up`.
2. Rama V (`Seguimiento`): `Edit Fields` toma `direccion_visita` de `visit_address` del filtro V; si viene vacío, usa la salida de `Mensaje V` (fallback). `Mensaje V` se conserva como respaldo.
3. Revisar la rama NS para integrarla con `estado_visita='no_asistio'` (detalle en el plan de la fase correspondiente).

## 10. Fases de implementación

- **Fase 1 — Núcleo de sincronización (fundación).** Migración: columna `visit_address`, ampliación de estados, trigger `sync_visit_to_conversation` (los 5 estados). Cambios n8n #1 y #2. Test con el número de Leonardo. Entrega: recordatorios regidos por el calendario y corte automático al confirmar/cancelar.
- **Fase 2 — Confirmación por el cliente (WhatsApp).** Interpretación del texto natural de respuesta al recordatorio (las plantillas no tienen botones): vía el agente cuando el bot está activo, y vía clasificador liviano en el webhook de entrada cuando el bot está apagado → `confirmada`/`cancelada`.
- **Fase 3 — UI del calendario + `realizada` automática + no-show.** Botones del asesor (`confirmada`/`realizada`/`no_asistio`), job automático de `realizada`, precedencia del asesor, e integración de la rama NS.

Cada fase es entregable y testeable por separado; el plan de implementación detalla la Fase 1 primero.

## 11. Match y edge cases

- Teléfono: verificado mismo formato hoy; se normaliza a solo-dígitos en el match.
- Reprogramar al pasado / visita vencida: el trigger actualiza; la rama V solo dispara ventanas futuras.
- Doble escritura calendario/bot: resuelta al sacarle al bot la propiedad de `visit_status`/`visit_scheduled_at`.
- Lead sin conversación de WhatsApp (Tokko/manual): no hay fila que tocar (correcto).

## 12. Plan de pruebas (antes de producción, con +5492213089334)

En rama de Supabase (o transacción con rollback):
1. `agendada` → `wa_conversations`: `scheduled`, fecha (zona AR), `visit_address`, `requires_follow_up=false`, flags en `false`.
2. Reprogramar → `visit_scheduled_at` nuevo, flags reseteados.
3. `confirmada` → `confirmed`, deja de perseguir confirmación.
4. `realizada` → `completed`.
5. `no_asistio` → `no_show`, `requires_follow_up=true`.
6. `cancelada` → `cancelled`, fecha null, `requires_follow_up=true`.
7. Teléfono sin conversación → no rompe ni afecta filas ajenas.
8. Con el bot prendido, `Actualizar_Metricas2` ya no pisa `visit_status`.

## 13. Docs a actualizar al cerrar

- `docs/interno/LOGICA-PRISMA.md`, `docs/interno/TECNICO-PRISMA.md`. FUNCIONAL-ASESOR/DIRECTOR solo si cambia el uso (los botones del calendario en Fase 3 sí lo tocarían).

## 14. Fuera de alcance

- Reactivar la tool `Gestion_Visita` del bot.
- Nurture post-visita (más allá de la plantilla de no-show existente).
- Cambios en el diseño del calendario o en Google Calendar sync (más allá de los botones de estado en Fase 3).

## 15. Trabajo previo relacionado (ya aplicado en esta sesión)

- Rama F: filtro `bot_active = true` + guard de nombre.
- Rama V: guard de nombre; se quitó `bot_active`.
- `Analizar_Conversacion2`: `requires_follow_up=false` también ante handoff explícito.
- `Formato_Mensajes`: viñeta `•` → `-` en las fichas de propiedades.
