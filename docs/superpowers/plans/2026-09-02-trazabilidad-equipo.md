# Trazabilidad del equipo — la bitácora que pidió Kevin

**Fecha:** 2026-09-02 · **Rama:** `feat/trazabilidad-equipo` (desde main `32bb38c`)

## El pedido (audio de Kevin, 2/9, transcripto con Whisper)

> "Me están llegando los whatsapps de reporting. Podríamos hacer que me arme un listado en el
> cual yo puedo entrar… no necesito el mensaje, sino que me reportó que Ailén hace tantas horas
> no contestó a esa persona, y después de eso pueda actualizar a decir 'ya tomó contacto'…
> quiero saber que en las acciones que voy tomando, el asesor está tomando acciones sobre eso."

## Las decisiones de Leonardo (mensaje del 2/9)

1. **No es un tablero de estados: es una bitácora cronológica** por cliente. Renglón por
   renglón, todo lo que pasó: el cliente consultó, el bot derivó, el aviso de 2 h salió, el
   asesor contestó a tal hora, agendó la visita, cargó la actividad en el tracking…
2. **Nada de página nueva suelta** ("estamos agregando muchas páginas relacionadas"): el ítem
   "Aprobaciones" del menú pasa a llamarse **"Equipo"**, con dos solapas: *Aprobaciones* (lo
   que ya existe, intacto) y **Trazabilidad** (lo nuevo).
3. **Filtros por asesor y por cliente** — con muchos clientes es la única forma de que sirva.
4. Lo que pasa **por fuera del sistema no se controla** (la llamada de Kevin, un WhatsApp
   directo): no se inventa un botón para eso en v1. La confirmación que Kevin busca es la que
   el chat sí ve: **el asesor le escribió al cliente**.
5. **Solo los directores lo ven. Los asesores NO.**

## Fuentes de datos (verificadas contra producción el 2/9)

| Evento del guion de Kevin | Fuente | ¿Existe hoy? |
|---|---|---|
| El cliente escribió / el bot respondió / **el asesor respondió** | `wa_messages` (role user/assistant/human) | ✔ |
| El cliente pidió humano (handoff) + email al asesor | marcador interno en `wa_messages` + `metricas` | ✔ (derivado; el email de n8n no se loguea aparte — v2) |
| Avisos de escalera 2/5/10/20 h, con canal y entrega | `lead_eventos` tipo `escalera` + `interacciones_canal` (wamid) | ✔ |
| Compromisos del bot ("un asesor te contacta") | `lead_eventos` tipo `compromiso_creado` | ✔ |
| No lo puedo tomar / Lo tomo / Reasignación / Dar tiempo / Reactivado / Reapertura | `lead_eventos` tipos `asesor_no_puede`, `asesor_tomo`, `reasignacion`, `director_dio_tiempo`, `lead_reactivado`, `reapertura_cliente`, `aprobacion_decidida` | ✔ |
| Decisiones del Super Agente | `lead_eventos` tipo `decision` | ✔ |
| **Agendó / confirmó / realizó / canceló la visita** | `scheduled_visits` (fuente de verdad, migración 20260710) | ✘ estado sí, evento no → **Task 1: trigger** |
| Cargó actividad en el tracking | `lead_activities` (agent_id, created_at) | ✔ tabla existe (Central: 0 usos en 30 días — la trazabilidad va a hacer visible ese vacío, a propósito) |

## Tasks

### Task 1 — Migración `2026-09-02-trazabilidad.sql` (aditiva)
- Trigger AFTER INSERT OR UPDATE OF estado_visita ON `scheduled_visits` → inserta en
  `lead_eventos` (tipo `visita_agendada|visita_confirmada|visita_realizada|visita_no_asistio|
  visita_cancelada|visita_reprogramada`, actor `asesor`), resolviendo la conversación por
  agency_id + teléfono normalizado (misma técnica que el sync existente). Si no hay
  conversación, no inserta (no rompe el INSERT original: EXCEPTION WHEN OTHERS → NULL, jamás
  voltear la visita por un log).
- Índice `lead_eventos (agency_id, ts desc)` para el listado por agencia.
- Rollback: `drop trigger`, `drop function`, `drop index`.
- Se aplica por Management API (como siempre; las migraciones del repo no corren solas).

### Task 2 — `lib/equipo/trazabilidad.ts` (puro, con tests)
- Tipo `EventoTraza { ts, categoria ('cliente'|'bot'|'asesor'|'agente'|'aviso'|'director'|'visita'|'tracking'), titulo, detalle?, quien? }`.
- `construirTraza(...)`: recibe las filas crudas de las 5 fuentes y devuelve la línea de
  tiempo ordenada, con textos en español simple y hora AR (`America/Argentina/Buenos_Aires`).
  Mapa tipo→texto para cada `lead_eventos.tipo` conocido; los desconocidos no rompen (texto
  genérico). Mensajes del chat: solo los primeros ~90 caracteres (Kevin "no necesita el
  mensaje", necesita el hecho y la hora).
- Tests: el guion completo de Kevin como caso (consulta → handoff → 2 h → 5 h → director →
  respuesta del asesor → visita → tracking), más: reasignación con motivo, orden estable ante
  timestamps iguales, tipo desconocido.

### Task 3 — Server actions (en `app/actions/equipo.ts`, patrón existente)
- `listarConversacionesConActividad({ asesorId?, busqueda?, dias = 14 })`: SOLO director
  (misma verificación de rol que `listarAprobaciones`); lee con `createAdminClient()` tras
  verificar (las tablas de eventos no tienen SELECT para directores por RLS, igual que
  `aprobaciones`); devuelve conversaciones de la agencia con actividad en el período: nombre,
  teléfono, asesor asignado, último evento y hace cuánto. Paginado (50).
- `trazaDeConversacion(conversationId)`: verifica director + que la conversación sea de su
  agencia; junta las 5 fuentes y devuelve `construirTraza(...)`.

### Task 4 — UI
- `components/director-sidebar.tsx`: "Aprobaciones" → **"Equipo"** (mismo href
  `/director/aprobaciones` — los emails de aviso ya enlazan ahí y NO se rompen; el badge de
  pendientes queda igual).
- `app/director/aprobaciones/page.tsx`: título "Equipo", `Tabs` (shadcn) con *Aprobaciones*
  (el `AprobacionesClient` intacto) y *Trazabilidad* (`TrazabilidadClient` nuevo). Deep-link
  `?tab=trazabilidad`.
- `TrazabilidadClient`: filtros arriba (desplegable de asesores + buscador nombre/teléfono),
  lista de conversaciones con actividad; al elegir una se abre la línea de tiempo (columna en
  escritorio, apilado en celular). Íconos y color por categoría; misma estética que
  Aprobaciones. Sin auto-refresh agresivo (botón actualizar).
- El guard de rutas ya deja `/director/*` solo a directores; los asesores no ven nada.

### Task 5 — Probar de verdad
- Tests + build en el worktree (build detached, NUNCA con dev corriendo).
- Navegador escritorio y celular (390×844) como director de PRISMAIA; sembrar en PRISMAIA una
  secuencia de eventos de prueba si hace falta (PRISMAIA está `apagado`: el agente no corre;
  los eventos semilla se insertan a mano y se borran al final).
- Verificar el trigger de visitas insertando una visita de prueba en PRISMAIA.

### Task 6 — Cierre
- OK de Leonardo → merge a main (flujo clásico desde el worktree del Socio) → docs
  (TECNICO, LOGICA, FUNCIONAL-DIRECTOR: sección de la solapa) → bitácora.

## Para v2 (NO en esta rama)
- Registrar el email de handoff que manda n8n en `interacciones_canal` (toca n8n → OK aparte).
- Botón "ya tomé contacto" del director (acción fuera del chat) si Kevin lo sigue pidiendo
  después de usar la bitácora.
- El reporte mensual a la dirección y los avisos de incentivo de uso: misma fuente de datos.
