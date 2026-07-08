# Métricas diarias de auditoría — Diseño (Proyecto A)

- **Fecha:** 2026-07-08
- **Autor:** Leonardo + Claude
- **Estado:** Diseño aprobado (pendiente plan de implementación)
- **Ámbito:** PRISMA-SYSTEM · sección nueva en `admin-vakdor`

---

## 1. Objetivo

Tener tres "expertos" (auditores automáticos) que **una vez por día** revisen distintas áreas del sistema, calculen un **semáforo** (verde/amarillo/rojo) por indicador, escriban un **análisis en criollo** con IA, y dejen todo en una nueva sección **Métricas** de `admin-vakdor` — más un **mail resumen** cada mañana.

Los tres expertos:

1. **WhatsApp** — salud comercial y operativa de los leads.
2. **Salud del sistema** — infraestructura y plataformas que sostienen PRISMA.
3. **Redes / SEO / Meta** — marketing (orgánico, publicidad, tráfico web, UX).

**Regla de oro:** el **semáforo lo calcula una regla fija** (umbrales), no la IA. La **IA sólo redacta** el análisis. Así el estado nunca depende del humor de un modelo.

---

## 2. Arquitectura (quién corre dónde)

| Experto | Cómo corre | Motivo |
|---|---|---|
| **1 · WhatsApp** | Módulo en la app (server-side) + cron | los datos ya viven en Supabase |
| **2 · Salud** | Agente Claude programado (routine) | usa MCP/skills: EasyPanel, Vercel, Cloudflare, GitHub, Supabase, n8n |
| **3 · Redes/SEO/Meta** | Agente Claude programado (routine) | usa MCP/skills: Buffer, Meta Ads, GA, GSC, Clarity |

Los dos agentes Claude escriben su resultado en la **misma tabla** `audit_snapshots`, igual que el módulo server-side del Experto 1. El dashboard lee esa tabla.

> **Nota honesta:** las MCP/skills existen en la sesión de Claude, no dentro de la app desplegada. Por eso los expertos 2 y 3 (que dependen de esas conexiones) corren como agentes Claude programados y no como módulos server-side.

---

## 3. Los tres expertos

### 3.1 Experto 1 — WhatsApp *(global + por agencia)*

Fuentes: `wa_conversations`, `wa_messages`, `wa_contacts`, `wa_n8n_dead_letter`, columna `metricas` (jsonb), tablas de campañas.

**Sub-secciones e indicadores:**

- **Actividad:** leads nuevos hoy · conversaciones activas ahora · volumen de mensajes (entrantes/salientes) · contactos nuevos en agenda.
- **Atención / SLA:** sin responder · tiempo de 1ª respuesta (mediana) · tasa de respuesta (% de leads entrantes con al menos una respuesta) · **agente ciego** (dead-letters sin procesar).
- **Embudo:** leads calificados (con presupuesto) · propiedades mostradas (recomendaciones enviadas) · visitas agendadas · handoffs (derivaciones a asesor).
- **Origen y salud del lead:** campaña (goteo) vs orgánico · reactivaciones (dormidos que volvieron) · enfriados (activos que se apagaron).

**Umbrales de semáforo (borrador, a afinar con datos reales):**

| Indicador | Verde | Amarillo | Rojo |
|---|---|---|---|
| Sin responder | 0 pendientes +2 h | algunos | alguno +6 h en horario hábil |
| Agente ciego (dead-letters) | 0 | 1–2 | +2 |
| Tasa de respuesta | ≥ objetivo | cerca | por debajo |
| Enfriados | pocos / bajando | subiendo | pico |

**Scope:** se escribe una fila `global` + una fila por cada agencia (roomix, etc.). El panel tiene toggle Global ⇄ agencia.

### 3.2 Experto 2 — Salud del sistema *(global · agente Claude)*

- **Infra (EasyPanel · panel.vakdor.com / 161.35.14.211):** estado arriba/abajo de **n8n, evolution-api, roomix-worker, acm-extractor, redis** + CPU/RAM/disco del server. *(chatwoot excluido.)*
- **Plataformas:** Vercel (deploys OK/fallidos, errores runtime) · GitHub (Actions: tokko-sync, market-sync, campaigns-drip) · Cloudflare (DNS/proxy de subdominios).
- **Datos & automation:** Supabase advisors (seguridad/RLS + performance) · n8n health check · errores de n8n en las últimas 24 h.

**Semáforo:** cada bloque tiene su sub-semáforo; el semáforo del experto = **el peor** de sus sub-semáforos (rojo manda). Rojo si un servicio crítico está caído, un deploy de producción falló, un subdominio no resuelve, o hay un advisor de seguridad tipo ERROR.

### 3.3 Experto 3 — Redes / SEO / Meta *(global · agente Claude)*

- **Orgánico (Buffer):** LinkedIn + Instagram — impresiones, alcance, engagement, tendencia 7 d.
- **Publicidad (Meta Ads):** gasto, resultados, CPL/CTR, **alerta de anomalías**.
- **Web & SEO:** Google Analytics (tráfico) · Search Console (clicks/impresiones/posición + **quick wins**) · **Clarity** (rage-clicks, dead-clicks, highlights de heatmap).

**Semáforo:** de tendencia (verde subiendo / amarillo plano / rojo cayendo). Anomalía de Meta → rojo.

**Gotcha Clarity:** su API permite **10 requests/día y ventanas de 1–3 días** → corre **1×/día** únicamente.

---

## 4. Modelo de datos

Tabla nueva `audit_snapshots`:

| columna | tipo | nota |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `experto` | text | `whatsapp` \| `sistema` \| `redes` |
| `scope` | text | `global` o `<agency_id>` |
| `semaforo` | text | `verde` \| `amarillo` \| `rojo` \| `gris` |
| `resumen` | text | análisis redactado por IA |
| `metricas` | jsonb | números crudos + sub-semáforos |
| `run_at` | timestamptz | `now()` |
| `created_at` | timestamptz | `now()` |

- Índice `(experto, scope, run_at desc)` para traer rápido el último snapshot.
- **RLS habilitada** (mismo patrón que las tablas `finance_*`): escritura por service role; lectura por admin autenticado.
- Se **guarda historial** (una fila por corrida) → habilita mini-tendencias/sparklines en el dashboard.

---

## 5. Flujo diario (scheduling)

1. **06:30 AR** — corren los dos agentes Claude (Exp. 2 y 3); cada uno recolecta, calcula su semáforo según las reglas de este spec, redacta y escribe su fila en `audit_snapshots` (vía MCP de Supabase).
2. **07:00 AR** — `tokko-sync.yml` (cron ya existente, corre 2×/día) dispara:
   - `/api/cron/audit-whatsapp` → Experto 1 (server-side) escribe filas global + por agencia.
   - `/api/cron/audit-notify` → arma y envía **el mail** con los 3 expertos, lo rojo destacado arriba.
3. **18:00 AR** — `tokko-sync.yml` vuelve a correr → Experto 1 saca una foto de la tarde. `audit-notify` **no** envía mail (guard: sólo envía cuando la hora UTC = 10, es decir la corrida de las 07:00 AR).

Los endpoints nuevos se **cuelgan** de `tokko-sync.yml` con el mismo patrón ya usado por `finance-sync` (`if: always()` + `continue-on-error: true`), protegidos con `CRON_SECRET`.

---

## 6. Notificación (email)

- Vía **Resend** (ya usado en `Aviso_Asesor`).
- Asunto: `PRISMA · Métricas <fecha> — <N en rojo>`.
- Cuerpo con marca Vakdor: los tres bloques con su semáforo + "Lectura del analista" (texto IA); lo rojo primero.
- Un solo mail por día (corrida de las 07:00).

---

## 7. Sección "Métricas" (UI)

- Página `app/admin-vakdor/metricas/page.tsx` (server) → componente `MetricasClient`.
- Nueva entrada **"Métricas"** en `components/admin-vakdor/sidebar.tsx`.
- Lee `audit_snapshots` (el último por experto+scope).
- Estética: tema dark existente (`#070B14`), **sobria, sin emojis ni colorinche**, tipo panel financiero. El color sólo aparece como punto/píldora tenue del semáforo.
- **vakdor-motion** para transiciones suaves (entrada de tarjetas, cambio de agencia).

**Estructura de página (una sola página scrolleable, todo a la vista):**

```
MÉTRICAS                                Última actualización: 07:04
● WhatsApp   ● Salud   ● Redes              [ WhatsApp | Salud | Redes ]  ← barra resumen + saltos

▓ 1 · WHATSAPP                     ● semáforo     [ Global ▾ agencia ]
  Actividad:   Leads nuevos · Conv. activas · Msgs in/out · Contactos nuevos
  Atención/SLA: Sin responder · 1ª respuesta · Tasa resp. · Agente ciego
  Embudo:      Calificados · Prop. mostradas · Visitas agendadas · Handoffs
  Origen:      Campaña/orgánico · Reactivaciones · Enfriados
  Lectura del analista: "…texto IA…"

▓ 2 · SALUD DEL SISTEMA           ● semáforo
  Infra (EasyPanel): n8n · evolution · worker · extractor · redis · Server CPU/RAM
  Plataformas:       Vercel (deploys) · GitHub (Actions) · Cloudflare (DNS/proxy)
  Datos & Automation: Supabase advisors (RLS) · n8n health · n8n errores 24h
  Lectura del analista: "…"

▓ 3 · REDES / SEO / META          ● semáforo
  Orgánico (Buffer): LinkedIn · Instagram (impr/alcance/eng)
  Publicidad (Meta): Gasto · Resultados · CPL/CTR · Anomalías
  Web & SEO:         Analytics (tráfico) · Search Console (clicks/pos/quick-wins) · Clarity
  Lectura del analista: "…"
```

- Barra resumen arriba (vistazo de 2 s): tres semáforos + saltos a cada bloque.
- Cada tarjeta KPI: número grande + etiqueta + mini-tendencia + variación vs. período anterior + punto de semáforo.
- Grid responsivo (4 col escritorio · 2 tablet · 1 móvil).

---

## 8. Orden de construcción

1. Migración `audit_snapshots` + RLS + índice.
2. `lib/admin-vakdor/audit/whatsapp.ts` (recolección + cálculo de semáforo + redacción IA con Gemini flash) + endpoint `/api/cron/audit-whatsapp`.
3. `lib/admin-vakdor/audit/notify.ts` + endpoint `/api/cron/audit-notify` (Resend + guard de hora).
4. Enganchar los dos pasos nuevos en `.github/workflows/tokko-sync.yml`.
5. Página **Métricas** + entrada en sidebar + `MetricasClient` con vakdor-motion. Probar en local.
6. Routines de Claude para Exp. 2 y 3 (prompt con reglas de semáforo + qué recolectar + escribir a `audit_snapshots`). Confirmar que la routine tenga las MCP conectadas.
7. Actualizar los 4 docs (LÓGICA / TÉCNICO / FUNCIONAL-ASESOR / FUNCIONAL-DIRECTOR) y mergear a main con OK de Leonardo.

Todo en la rama `feat/metricas-auditoria-diaria`, probado en local, merge sólo con OK.

---

## 9. Riesgos y puntos a confirmar en el build

- **Estructura real de `metricas` (jsonb):** verificar contra el esquema real cómo se mapean calificados / visitas agendadas / presupuesto antes de programar esos indicadores.
- **MCPs dentro de las routines de Claude:** confirmar que el entorno de la routine tenga conectadas Meta Ads, GA, GSC, Cloudflare, Vercel, n8n, Supabase + skills EasyPanel y Buffer.
- **EasyPanel:** cómo accede la routine (vía skill `vakdor-easypanel`).
- **Buffer:** confirmar que sigue funcionando vía skill (API pública cerrada).
- **Umbrales de semáforo:** son borrador; afinar con datos reales las primeras semanas.
- **Costos:** dos routines Claude/día (chico) + redacción IA del Exp. 1 (Gemini flash, centavos).

---

## 10. Fuera de alcance

- **GEO** (posicionamiento en motores generativos) — experimental, descartado por ahora.
- **Proyecto B** (Marketing / Pipeline de contenido y auto-publicación) — diseño aparte.
