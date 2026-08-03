# Informe semanal de performance al director fundador

**Fecha:** 2026-08-03
**Rama:** `feat/informe-semanal-director`

## Problema

El director no tiene forma de ver, semana a semana, qué hizo el equipo con los leads que el
bot le entrega. Hoy los datos existen pero están repartidos entre la base de PRISMA y la API
de Resend, y nadie los cruza. El panel de handoffs sin atender (ya en main) muestra el
*ahora*; falta la mirada semanal y por asesor.

Medición real de la semana del 27-jul al 2-ago (Central Real Estate), verificada antes de
escribir este spec:

- 131 consultas ingresadas
- 29 handoffs → **7 atendidos (24%)**, 22 sin atender
- 27 derivaciones por coordinación de visita → **0 con respuesta dentro de PRISMA**
- 0 de esos 56 leads cargados como actividad en Tracking Performance

## Alcance

Un email semanal, los lunes, al director **fundador** de cada inmobiliaria activa, con la
performance de la semana anterior: global y por asesor.

Fuera de alcance: cambiar los flujos de n8n, agregar marcadores nuevos en `wa_messages`,
o cualquier pantalla en la app. El informe lee lo que ya existe.

## Fuentes de datos

Todas verificadas contra la base de producción y la API de Resend.

| Métrica | Fuente | Nota |
|---|---|---|
| Consultas ingresadas | `wa_conversations` creadas en la semana **con ≥1 mensaje `role='lead'`** | El filtro de mensaje del cliente es obligatorio: la semana del 20-jul tuvo 1.397 conversaciones creadas y solo 232 con respuesta del cliente (envío masivo de campaña). Sin el filtro el informe miente. |
| Handoffs aplicados | `wa_messages` con `role='internal'` y `content ILIKE '%Handoff activado%'` | Único marcador confiable. `bot_active=false` NO sirve: la mayoría se apagó a mano desde la app. Se toma el **último** handoff por conversación. |
| Derivaciones por coordinación de visita | Resend `GET /emails`, asunto que empieza con `Quiere visitar:` | `Avisar_Asesor` **no deja rastro en la base**: manda el email y actualiza `wa_conversations`. El email es la única evidencia. Verificado: 76 históricos, 27 en la semana medida. |
| Derivaciones por consulta de link | Resend, asunto `Nuevo interesado en tu propiedad:` | 285 históricos. Se incluye como sección secundaria. |
| Vínculo email → conversación | El HTML del email trae el teléfono del lead → `wa_conversations.contact_phone` | Verificado 27/27 emails con teléfono y 25/25 teléfonos únicos matcheados. Normalización: solo dígitos, se sacan `54` y `9` iniciales, se comparan los últimos 10. |
| Intervención del asesor | Primer `wa_messages` con `role='human'`, o `role='internal'` que no sea la marca de handoff, posterior al evento | Los asesores a veces quedan registrados como `internal`. Misma regla que `lib/queries/handoffs.ts`. |
| Rangos de tiempo | `< 1h` / `1-4h` / `4-24h` / `+24h` / `sin atender` | Coincide con los umbrales del panel existente (demorado 2h, crítico 24h). |
| Asesor responsable | Handoff → `wa_conversations.agent_id` → `profiles.full_name`. Visita → destinatario del email → `profiles.email` | |
| Etapa de pipeline | `performance_logs` (status ≠ `eliminada`) + `tracking_pipeline_moves`, agrupados por teléfono normalizado | Misma clave que `lib/tracking/pipeline.ts` (`clientKeyFromLog`). Etapa = evento más reciente por `created_at`. |
| Destinatario | `agencies` con `estado='activo'` → `owner_id` → `profiles.email` | `owner_id` es el marcador exacto del fundador. Los 3 directores que se sumaron después a Central quedan afuera sin lógica extra. |

## Las tres señales de las derivaciones por visita

Después de una derivación por visita el bot **queda encendido** (`Avisar_Asesor` setea
`bot_active = true`). El asesor no entra al chat: contesta por su celular, fuera de PRISMA.
Por eso medir "escribió en la conversación" da 0 de 27 y sería engañoso presentarlo como
"nadie hizo nada".

El informe muestra **tres señales por separado**, sin mezclarlas en un solo porcentaje:

1. **Chat** — escribió en la conversación de PRISMA (señal fuerte, con rango de tiempo)
2. **Visita** — apareció una fila en `scheduled_visits` después del email (señal fuerte, resultado real)
3. **Email** — `last_event = 'clicked'` en Resend (señal débil: solo se registra si tocó un link)
4. **Sin rastro** — ninguna de las tres

La columna "Sin rastro" es la que le importa al director.

## Arquitectura

Sigue el patrón que ya usa `campaigns-drip`: GitHub Action → endpoint protegido con
`CRON_SECRET`. No se usa Vercel Cron (plan free).

```
.github/workflows/weekly-report.yml   cron lunes 11:00 UTC (8am AR) + workflow_dispatch
        │  curl con Authorization: Bearer CRON_SECRET
        ▼
app/api/cron/weekly-report/route.ts   orquesta: agencias activas → por cada una, calcula y manda
        │
        ├── lib/reports/weekly/window.ts    calcula el lunes-domingo anterior en hora AR
        ├── lib/reports/weekly/sources.ts   lecturas: Supabase (admin) y Resend
        ├── lib/reports/weekly/data.ts      cálculo puro: agrega, bucketea, arma por-asesor
        ├── lib/reports/weekly/email.ts     HTML de marca
        └── lib/reports/weekly/send.ts      POST a Resend
```

Reusa los helpers que ya existen, no los reinventa:

- `assertCron(req)` de `lib/admin-vakdor/cron-auth` para la autorización (falla cerrado)
- `getAdminDb()` de `lib/admin-vakdor/logger` para leer sin RLS (el informe cruza todas las
  agencias, así que no puede depender del cliente con sesión)
- La regla de "quién es el marcador del handoff" y "qué cuenta como respuesta de la agencia"
  se toma tal cual de `lib/queries/handoffs.ts`

**Por qué archivos separados:** `data.ts` no toca la red — recibe filas y devuelve el informe
armado, así se puede testear con datos fijos. `sources.ts` es el único que sabe de Supabase y
de Resend. `email.ts` recibe el informe ya calculado y devuelve un string.

### Ventana semanal

Lunes 00:00:00 a domingo 23:59:59.999 hora Argentina (UTC-3, sin horario de verano), la
semana **anterior** a la corrida. Corriendo el lunes 3-ago cubre 27-jul → 2-ago.

### Modo prueba

`GET /api/cron/weekly-report?dry=1` devuelve el HTML del informe sin mandar ningún email.
`&agency=<uuid>` lo acota a una inmobiliaria. Sirve para revisar antes de que lo lea el cliente.

## Estructura del email

Marca PRISMA, mismo lenguaje visual que los emails de `Avisar_Asesor`: azul `#131A2D`,
cobre `#B57E3B`, tarjetas con borde izquierdo cobre, tablas de 1px.

1. **Encabezado** — nombre de la inmobiliaria, rango de fechas
2. **Resumen** — 5 números grandes: consultas ingresadas · handoffs · derivaciones por visita · % de handoffs atendidos · leads cargados en pipeline
3. **Sección A — Handoffs** — total por rango de tiempo + tabla por asesor (derivados, atendidos, %, y los 5 rangos)
4. **Sección B — Coordinación de visita** — total + tabla por asesor con las tres señales y "Sin rastro"
5. **Sección C — Consultas por link** — total + tabla por asesor (secundaria, misma lógica que B)
6. **Sección D — Pipeline** — de los leads derivados en la semana, cuántos tienen actividad en Tracking Performance y en qué etapa; el resto como "sin cargar"
7. **Pie** — nota metodológica corta y link al panel de handoffs

Los asesores se ordenan por volumen de derivaciones, de mayor a menor. Se incluye fila TOTAL.

## Manejo de errores

- **Resend caído o rate-limited**: el informe se manda igual, con las secciones B y C marcadas
  como "no disponible esta semana". Los handoffs salen de la base y no dependen de Resend.
- **Inmobiliaria sin datos en la semana**: se manda igual, con los ceros. Un lunes sin email
  es indistinguible de un cron roto.
- **Agencia sin `owner_id` o sin email**: se saltea, se loguea y se sigue con las demás. Una
  inmobiliaria mal configurada no puede impedir que las otras reciban el suyo.
- **Falla el envío de una**: se captura por agencia; el endpoint devuelve el detalle por
  inmobiliaria (`enviado` / `motivo`) con HTTP 200 salvo que fallen todas.
- **Paginación de Resend**: `GET /emails` pagina de a 100 con `after`. Se corta al llegar a
  emails anteriores al inicio de la ventana, con un techo de 10 páginas por las dudas.
- **Detalle de emails**: el teléfono sale de `GET /emails/{id}` (uno por email). Con ~30-60
  emails por semana es aceptable; se hace con concurrencia limitada a 5.

## Testing

- `data.ts` con filas fijas: bucketeo de rangos (bordes exactos en 1h, 4h y 24h), agrupación
  por asesor, fila TOTAL, y el caso "sin asesor asignado".
- `window.ts`: que el lunes 3-ago devuelva 27-jul 00:00 AR → 2-ago 23:59 AR, y que un
  domingo también devuelva la semana anterior completa.
- Normalización de teléfonos: los formatos reales encontrados (`+54 1150458476`,
  `5491154054949`, `+5491151175948`) tienen que caer en la misma clave.
- Prueba de punta a punta con `?dry=1` contra la base real, comparando contra los números ya
  medidos a mano (29 handoffs / 7 atendidos / 27 visitas / 0 en pipeline).

## Variables de entorno

Ya existen todas, verificado en el código: `RESEND_API_KEY` y `RESEND_FROM` (los usa
`lib/admin-vakdor/audit/notify.ts`), `CRON_SECRET` (`lib/admin-vakdor/cron-auth.ts`),
`NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (`lib/supabase/admin.ts`), y
`SITE_DOMAIN` como secret de GitHub (lo usa `campaigns-drip.yml`).

No hay que dar de alta nada nuevo en Vercel ni en GitHub.

## Riesgos conocidos

- **El asunto de los emails es el contrato.** Si alguien edita el asunto en `Avisar_Asesor` o
  en `Gestion_Handoff`, las secciones B y C se van a cero en silencio. Mitigación: el informe
  muestra el total de emails leídos de Resend; si es 0 con handoffs > 0, avisa en el pie.
- **La etapa de pipeline hoy va a decir "sin cargar" para casi todos** (0 de 29 la semana
  pasada). Es el estado real, no un bug.
- **`Avisar_Asesor` no escribe en `wa_messages`.** Si más adelante se le agrega un mensaje
  interno como el del handoff, conviene migrar las secciones B y C a la base y dejar de
  depender de Resend.
