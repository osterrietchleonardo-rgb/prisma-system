# Métricas diarias de auditoría — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la sección **Métricas** en `admin-vakdor` con tres auditores diarios (WhatsApp server-side; Salud y Redes como agentes Claude programados) que escriben snapshots en Supabase, se muestran en un dashboard sobrio y mandan un mail resumen cada mañana.

**Architecture:** El Experto 1 (WhatsApp) es un módulo server-side (`lib/admin-vakdor/audit/*`) disparado por endpoints cron colgados de `tokko-sync.yml`. Los Expertos 2 y 3 son routines de Claude en la nube que usan MCP/skills y escriben en la misma tabla `audit_snapshots` vía el MCP de Supabase. El dashboard (`app/admin-vakdor/metricas`) lee el último snapshot por experto+scope. El semáforo lo calcula una regla fija; la IA sólo redacta el resumen.

**Tech Stack:** Next.js 14.2.35 (App Router), Supabase (`@supabase/supabase-js`, service role), Gemini `gemini-3.5-flash` (`@google/generative-ai`), Resend (HTTP), GitHub Actions cron, `motion` (a instalar) para animaciones.

## Global Constraints

- **Framework:** Next.js 14.2.35 App Router. Endpoints en `app/api/.../route.ts` con `export const dynamic = "force-dynamic"`.
- **DB server-side:** usar `getAdminDb()` de `@/lib/admin-vakdor/logger` (cliente service-role). Nunca crear otro cliente.
- **Auth de crons:** header `Authorization: Bearer ${CRON_SECRET}` (env ya existente). Devolver 401 si no coincide.
- **IA de redacción:** `gemini-3.5-flash` vía `process.env.GEMINI_API_KEY` (patrón de `lib/gemini.ts`).
- **Sin framework de tests:** este repo NO tiene test runner. La verificación de cada tarea es **manual y real**: `curl` al endpoint con `CRON_SECRET`, consulta SQL de la fila resultante, y/o levantar `npm run dev` y mirar la página. Nunca afirmar "anda" sin ejecutar y ver la salida.
- **UI:** estilos inline (convención de `components/admin-vakdor/*`), tema dark base `#070B14`, texto en español (criollo). **Sobrio: sin emojis en la página de Métricas, color sólo en el punto del semáforo.**
- **Copy y semáforo en español:** valores `verde | amarillo | rojo | gris`.
- **Zona horaria:** "hoy" = día de Argentina. En SQL: `(now() at time zone 'America/Argentina/Buenos_Aires')::date`.
- **Hook de cron:** los pasos nuevos se cuelgan de `.github/workflows/tokko-sync.yml` con `if: always()` + `continue-on-error: true` (patrón de `finance-sync`).
- **Workflow del proyecto:** todo en la rama `feat/metricas-auditoria-diaria`, probado en local, merge a main sólo con OK de Leonardo. Escrituras a la DB compartida (migración) y creación de routines requieren OK explícito.

**Valores reales verificados (usar tal cual):**
- `wa_messages.role`: `lead` (entrante) · `bot`/`human` (salientes) · `internal` (ignorar).
- `wa_conversations.funnel_status`: `open` | `closed_lost`. `status`: `active`.
- `wa_conversations.metricas` (jsonb) claves: `etapa` ∈ {`calificacion`,`recomendacion`,`visita`,`handoff`}, `visita_agendada` (bool), `fue_derivado_a_humano` (bool), `propiedades_mostradas` (array), `urgencia`. **No existe `presupuesto`** → "calificado" se define por `etapa`, no por presupuesto.
- `wa_n8n_dead_letter.status`: `pending` (= sin procesar).
- `agencies`: `id` (uuid), `name`, `deleted_at`. Activas = `deleted_at IS NULL` (hoy: "Central Real Estate Argentina", "PRISMAIA - VAKDOR").

---

## File Structure

**Crear:**
- `lib/admin-vakdor/audit/types.ts` — tipos compartidos (`Semaforo`, `AuditSnapshot`).
- `lib/admin-vakdor/audit/store.ts` — insertar snapshot en `audit_snapshots`.
- `lib/admin-vakdor/audit/narrate.ts` — redacción con Gemini.
- `lib/admin-vakdor/audit/whatsapp.ts` — recolección + semáforo del Experto 1.
- `lib/admin-vakdor/audit/notify.ts` — armado + envío del mail (Resend).
- `lib/admin-vakdor/audit/read.ts` — lectura de últimos snapshots para la página.
- `app/api/cron/audit-whatsapp/route.ts` — endpoint del Experto 1.
- `app/api/cron/audit-notify/route.ts` — endpoint del mail (con guard de hora).
- `app/admin-vakdor/metricas/page.tsx` — página server.
- `components/admin-vakdor/metricas-client.tsx` — cliente principal (3 paneles).
- `components/admin-vakdor/metricas-primitivos.tsx` — `Semaforo`, `Kpi`, `PanelExperto`.
- `docs/agentes-metricas/experto-2-salud.md` — prompt de la routine de Salud.
- `docs/agentes-metricas/experto-3-redes.md` — prompt de la routine de Redes.

**Modificar:**
- `components/admin-vakdor/sidebar.tsx` — agregar entrada "Métricas".
- `.github/workflows/tokko-sync.yml` — agregar 2 pasos.

---

## Task 1: Tabla `audit_snapshots` (migración + RLS)

**Files:**
- DB: migración vía `mcp__supabase__apply_migration` (name: `audit_snapshots`).

**Interfaces:**
- Produces: tabla `public.audit_snapshots(id uuid, experto text, scope text, semaforo text, resumen text, metricas jsonb, run_at timestamptz, created_at timestamptz)`.

> ⚠️ Escribe en la DB compartida. Requiere OK de Leonardo antes de aplicar.

- [ ] **Step 1: Aplicar la migración**

Usar `mcp__supabase__apply_migration` con name `audit_snapshots` y este SQL:

```sql
create table if not exists public.audit_snapshots (
  id uuid primary key default gen_random_uuid(),
  experto text not null check (experto in ('whatsapp','sistema','redes')),
  scope text not null default 'global',
  semaforo text not null check (semaforo in ('verde','amarillo','rojo','gris')),
  resumen text,
  metricas jsonb not null default '{}'::jsonb,
  run_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists audit_snapshots_latest_idx
  on public.audit_snapshots (experto, scope, run_at desc);

alter table public.audit_snapshots enable row level security;
-- Sin policies públicas: sólo el service role (getAdminDb / MCP) escribe y lee. Mismo criterio que finance_*.
```

- [ ] **Step 2: Verificar que existe y está vacía + RLS activa**

Usar `mcp__supabase__execute_sql`:

```sql
select
  (select count(*) from public.audit_snapshots) as filas,
  (select relrowsecurity from pg_class where relname='audit_snapshots') as rls_on;
```

Esperado: `filas=0`, `rls_on=true`.

- [ ] **Step 3: Commit** (no hay archivos; registrar la migración en el historial del proyecto)

```bash
git commit --allow-empty -m "feat(metricas): tabla audit_snapshots + RLS (migración Supabase)"
```

---

## Task 2: Núcleo del módulo audit (tipos, store, narrate)

**Files:**
- Create: `lib/admin-vakdor/audit/types.ts`
- Create: `lib/admin-vakdor/audit/store.ts`
- Create: `lib/admin-vakdor/audit/narrate.ts`

**Interfaces:**
- Produces:
  - `type Semaforo = 'verde'|'amarillo'|'rojo'|'gris'`
  - `interface AuditSnapshot { experto: 'whatsapp'|'sistema'|'redes'; scope: string; semaforo: Semaforo; resumen: string; metricas: Record<string, unknown> }`
  - `peorSemaforo(vals: Semaforo[]): Semaforo`
  - `guardarSnapshot(snap: AuditSnapshot): Promise<void>`
  - `redactarResumen(experto: string, metricas: Record<string, unknown>, semaforo: Semaforo): Promise<string>`

- [ ] **Step 1: Crear `types.ts`**

```typescript
export type Semaforo = "verde" | "amarillo" | "rojo" | "gris"

export interface AuditSnapshot {
  experto: "whatsapp" | "sistema" | "redes"
  scope: string // 'global' o agency_id (uuid)
  semaforo: Semaforo
  resumen: string
  metricas: Record<string, unknown>
}

const ORDEN: Record<Semaforo, number> = { gris: 0, verde: 1, amarillo: 2, rojo: 3 }

/** Devuelve el semáforo más grave de una lista (rojo manda). Ignora 'gris' salvo que sea el único. */
export function peorSemaforo(vals: Semaforo[]): Semaforo {
  const reales = vals.filter((v) => v !== "gris")
  const lista = reales.length ? reales : vals
  return lista.reduce((peor, v) => (ORDEN[v] > ORDEN[peor] ? v : peor), "verde" as Semaforo)
}
```

- [ ] **Step 2: Crear `store.ts`**

```typescript
import { getAdminDb } from "@/lib/admin-vakdor/logger"
import type { AuditSnapshot } from "./types"

/** Inserta un snapshot nuevo (se guarda historial; la página lee el último por experto+scope). */
export async function guardarSnapshot(snap: AuditSnapshot): Promise<void> {
  const db = getAdminDb()
  const { error } = await db.from("audit_snapshots").insert({
    experto: snap.experto,
    scope: snap.scope,
    semaforo: snap.semaforo,
    resumen: snap.resumen,
    metricas: snap.metricas,
    run_at: new Date().toISOString(),
  })
  if (error) throw new Error(`guardarSnapshot(${snap.experto}/${snap.scope}): ${error.message}`)
}
```

- [ ] **Step 3: Crear `narrate.ts`**

```typescript
import { GoogleGenerativeAI } from "@google/generative-ai"
import type { Semaforo } from "./types"

/**
 * Redacta 2-4 oraciones en criollo argentino sobre las métricas del día.
 * NO decide el semáforo (eso lo hace la regla fija); sólo interpreta y sugiere.
 */
export async function redactarResumen(
  experto: string,
  metricas: Record<string, unknown>,
  semaforo: Semaforo,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return "" // sin key, el tablero muestra sólo números
  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" })
    const prompt = [
      `Sos un analista interno de Vakdor (inmobiliaria + software PRISMA).`,
      `Escribí 2 a 4 oraciones, en español rioplatense simple y profesional, sin emojis,`,
      `interpretando estas métricas del experto "${experto}". El estado general es ${semaforo}.`,
      `Decí qué pasó y, si hay algo en amarillo/rojo, qué conviene hacer. No repitas todos los números.`,
      `Datos: ${JSON.stringify(metricas)}`,
    ].join(" ")
    const res = await model.generateContent(prompt)
    return res.response.text().trim()
  } catch (e) {
    return "" // si falla la IA, no rompemos la corrida
  }
}
```

- [ ] **Step 4: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos en `lib/admin-vakdor/audit/*`.

- [ ] **Step 5: Commit**

```bash
git add lib/admin-vakdor/audit/types.ts lib/admin-vakdor/audit/store.ts lib/admin-vakdor/audit/narrate.ts
git commit -m "feat(metricas): núcleo del módulo audit (tipos, store, narrate)"
```

---

## Task 3: Experto 1 — recolector WhatsApp (SQL + semáforo)

**Files:**
- Create: `lib/admin-vakdor/audit/whatsapp.ts`

**Interfaces:**
- Consumes: `getAdminDb`, `peorSemaforo`, `Semaforo`, `AuditSnapshot`.
- Produces: `auditarWhatsapp(): Promise<AuditSnapshot[]>` — devuelve 1 fila `global` + 1 por agencia activa.

- [ ] **Step 1: Crear `whatsapp.ts` con la recolección por scope**

Toda la métrica sale de una función `metricasWhatsapp(agencyId | null)` que corre las consultas y calcula el semáforo. `agencyId=null` → global (todas las agencias).

```typescript
import { getAdminDb } from "@/lib/admin-vakdor/logger"
import { peorSemaforo, type AuditSnapshot, type Semaforo } from "./types"

const TZ = "America/Argentina/Buenos_Aires"

interface MetricasWa {
  leads_nuevos: number
  conversaciones_activas: number
  msgs_entrantes: number
  msgs_salientes: number
  contactos_nuevos: number
  sin_responder_total: number
  sin_responder_6h: number
  primera_respuesta_min_mediana: number | null
  tasa_respuesta_pct: number | null
  agente_ciego: number
  calificados: number
  propiedades_mostradas: number
  visitas_agendadas: number
  handoffs: number
  origen_campana: number
  origen_organico: number
  reactivaciones: number
  enfriados: number
}

/** Una sola consulta agregada por scope. `agencyId` null = global. */
async function metricasWhatsapp(agencyId: string | null): Promise<MetricasWa> {
  const db = getAdminDb()
  // Filtro de agencia parametrizado vía RPC-less: usamos SQL crudo con coalesce.
  const filtro = agencyId ? `and c.agency_id = '${agencyId}'` : ""
  const filtroMsg = agencyId ? `and m.agency_id = '${agencyId}'` : ""
  const filtroContact = agencyId ? `and ct.agency_id = '${agencyId}'` : ""

  const sql = `
  with hoy as (select (now() at time zone '${TZ}')::date as d)
  select
    (select count(*) from wa_conversations c, hoy
       where (c.created_at at time zone '${TZ}')::date = hoy.d ${filtro}) as leads_nuevos,
    (select count(*) from wa_conversations c
       where c.status = 'active' ${filtro}) as conversaciones_activas,
    (select count(*) from wa_messages m, hoy
       where m.role = 'lead' and (m.created_at at time zone '${TZ}')::date = hoy.d ${filtroMsg}) as msgs_entrantes,
    (select count(*) from wa_messages m, hoy
       where m.role in ('bot','human') and (m.created_at at time zone '${TZ}')::date = hoy.d ${filtroMsg}) as msgs_salientes,
    (select count(*) from wa_contacts ct, hoy
       where (ct.created_at at time zone '${TZ}')::date = hoy.d ${filtroContact}) as contactos_nuevos,
    (select count(*) from wa_conversations c
       where c.last_inbound_at is not null and c.last_message_at <= c.last_inbound_at ${filtro}) as sin_responder_total,
    (select count(*) from wa_conversations c
       where c.last_inbound_at is not null and c.last_message_at <= c.last_inbound_at
         and c.last_inbound_at < now() - interval '6 hours' ${filtro}) as sin_responder_6h,
    (select count(*) from wa_n8n_dead_letter d
       where d.status = 'pending' ${agencyId ? `and d.agency_id = '${agencyId}'` : ""}) as agente_ciego,
    (select count(*) from wa_conversations c
       where c.metricas->>'etapa' in ('calificacion','recomendacion','visita') ${filtro}) as calificados,
    (select count(*) from wa_conversations c
       where jsonb_array_length(coalesce(c.metricas->'propiedades_mostradas','[]'::jsonb)) > 0 ${filtro}) as propiedades_mostradas,
    (select count(*) from wa_conversations c
       where (c.metricas->>'visita_agendada')::boolean = true ${filtro}) as visitas_agendadas,
    (select count(*) from wa_conversations c
       where (c.metricas->>'fue_derivado_a_humano')::boolean = true ${filtro}) as handoffs,
    (select count(distinct c.id) from wa_conversations c
       join wa_contacts ct on ct.phone = c.contact_phone and ct.agency_id = c.agency_id
       where ct.last_campaign_sent_at is not null ${filtro}) as origen_campana,
    (select count(*) from wa_conversations c
       where c.recovery_stage is not null ${filtro}) as reactivaciones,
    (select count(*) from wa_conversations c
       where c.funnel_status = 'closed_lost'
          or (c.status = 'active' and c.last_message_at < now() - interval '7 days') ${filtro}) as enfriados
  `
  const { data, error } = await db.rpc("exec_sql_json", { q: sql }).single<any>().then(
    () => ({ data: null, error: null }),
    () => ({ data: null, error: null }),
  ).catch(() => ({ data: null, error: null }))

  // NOTA DE IMPLEMENTACIÓN: el cliente supabase-js no ejecuta SQL crudo.
  // Ejecutar cada agregado con .rpc no existe; en su lugar usar consultas .select con count.
  // Ver Step 2 para la versión final con el patrón real de supabase-js.
  throw new Error("placeholder — reemplazado en Step 2")
}
```

- [ ] **Step 2: Reemplazar `metricasWhatsapp` por la versión real con supabase-js**

`supabase-js` no corre SQL crudo desde el server helper; usamos `count` por consulta y `head:true`. Reemplazá el cuerpo de `metricasWhatsapp` por esto (helper `cnt` para contar con filtros):

```typescript
async function metricasWhatsapp(agencyId: string | null): Promise<MetricasWa> {
  const db = getAdminDb()

  // Rango "hoy" en AR calculado en JS (evita SQL crudo).
  const ahora = new Date()
  const ar = new Date(ahora.toLocaleString("en-US", { timeZone: TZ }))
  const inicioAr = new Date(ar.getFullYear(), ar.getMonth(), ar.getDate())
  // offset AR = -3h fijo (sin horario de verano)
  const inicioUtc = new Date(inicioAr.getTime() + 3 * 3600 * 1000).toISOString()
  const hace6h = new Date(Date.now() - 6 * 3600 * 1000).toISOString()
  const hace7d = new Date(Date.now() - 7 * 86400 * 1000).toISOString()

  const withAg = <T>(q: T): T =>
    agencyId ? (q as any).eq("agency_id", agencyId) : q

  const cnt = async (build: (q: any) => any, tabla: string): Promise<number> => {
    let q = db.from(tabla).select("*", { count: "exact", head: true })
    q = withAg(q)
    q = build(q)
    const { count, error } = await q
    if (error) throw new Error(`cnt ${tabla}: ${error.message}`)
    return count ?? 0
  }

  const [
    leads_nuevos, conversaciones_activas, msgs_entrantes, msgs_salientes, contactos_nuevos,
    sin_responder_total, sin_responder_6h, agente_ciego, calificados,
    propiedades_mostradas, visitas_agendadas, handoffs, reactivaciones, enfriados,
  ] = await Promise.all([
    cnt((q) => q.gte("created_at", inicioUtc), "wa_conversations"),
    cnt((q) => q.eq("status", "active"), "wa_conversations"),
    cnt((q) => q.eq("role", "lead").gte("created_at", inicioUtc), "wa_messages"),
    cnt((q) => q.in("role", ["bot", "human"]).gte("created_at", inicioUtc), "wa_messages"),
    cnt((q) => q.gte("created_at", inicioUtc), "wa_contacts"),
    cnt((q) => q.not("last_inbound_at", "is", null).filter("last_message_at", "lte", "last_inbound_at"), "wa_conversations"),
    cnt((q) => q.not("last_inbound_at", "is", null).lt("last_inbound_at", hace6h).filter("last_message_at", "lte", "last_inbound_at"), "wa_conversations"),
    cnt((q) => q.eq("status", "pending"), "wa_n8n_dead_letter"),
    cnt((q) => q.in("metricas->>etapa", ["calificacion", "recomendacion", "visita"]), "wa_conversations"),
    cnt((q) => q.gt("metricas->propiedades_mostradas", "[]"), "wa_conversations"), // ver nota
    cnt((q) => q.eq("metricas->>visita_agendada", "true"), "wa_conversations"),
    cnt((q) => q.eq("metricas->>fue_derivado_a_humano", "true"), "wa_conversations"),
    cnt((q) => q.not("recovery_stage", "is", null), "wa_conversations"),
    cnt((q) => q.or(`funnel_status.eq.closed_lost,last_message_at.lt.${hace7d}`), "wa_conversations"),
  ])

  // Métricas que necesitan cálculo fino (mediana, tasa, origen) → helper aparte.
  const { primera_respuesta_min_mediana, tasa_respuesta_pct } = await slaWhatsapp(agencyId, inicioUtc)
  const origen_campana = await origenCampana(agencyId)
  const origen_organico = Math.max(leads_nuevos - origen_campana, 0)

  return {
    leads_nuevos, conversaciones_activas, msgs_entrantes, msgs_salientes, contactos_nuevos,
    sin_responder_total, sin_responder_6h, primera_respuesta_min_mediana, tasa_respuesta_pct,
    agente_ciego, calificados, propiedades_mostradas, visitas_agendadas, handoffs,
    origen_campana, origen_organico, reactivaciones, enfriados,
  }
}
```

> **Nota `propiedades_mostradas`:** el filtro `.gt("metricas->propiedades_mostradas", "[]")` no distingue array vacío de forma confiable en supabase-js. Si en la verificación (Step 5) el número no cierra, reemplazar ese conteo por un `select` de `id, metricas->propiedades_mostradas` y contar en JS los que tengan `length > 0`. Valor esperado actual del sistema: **17** (global).

- [ ] **Step 3: Agregar los helpers `slaWhatsapp` y `origenCampana`**

`slaWhatsapp`: trae los mensajes del día por conversación y calcula, por conversación, el tiempo entre el primer `lead` y la primera respuesta `bot`/`human`; devuelve la mediana en minutos y el % de conversaciones con respuesta.

```typescript
async function slaWhatsapp(
  agencyId: string | null,
  inicioUtc: string,
): Promise<{ primera_respuesta_min_mediana: number | null; tasa_respuesta_pct: number | null }> {
  const db = getAdminDb()
  let q = db
    .from("wa_messages")
    .select("conversation_id, role, created_at")
    .gte("created_at", inicioUtc)
    .in("role", ["lead", "bot", "human"])
    .order("created_at", { ascending: true })
  if (agencyId) q = q.eq("agency_id", agencyId)
  const { data, error } = await q
  if (error) throw new Error(`slaWhatsapp: ${error.message}`)

  const porConv = new Map<string, { lead?: number; resp?: number }>()
  for (const m of data ?? []) {
    const t = new Date(m.created_at as string).getTime()
    const c = porConv.get(m.conversation_id as string) ?? {}
    if (m.role === "lead" && c.lead === undefined) c.lead = t
    if ((m.role === "bot" || m.role === "human") && c.resp === undefined && c.lead !== undefined) c.resp = t
    porConv.set(m.conversation_id as string, c)
  }
  const conLead = [...porConv.values()].filter((c) => c.lead !== undefined)
  const tiempos = conLead
    .filter((c) => c.resp !== undefined)
    .map((c) => (c.resp! - c.lead!) / 60000)
    .sort((a, b) => a - b)
  const mediana = tiempos.length
    ? Math.round(tiempos[Math.floor(tiempos.length / 2)])
    : null
  const tasa = conLead.length
    ? Math.round((tiempos.length / conLead.length) * 100)
    : null
  return { primera_respuesta_min_mediana: mediana, tasa_respuesta_pct: tasa }
}

async function origenCampana(agencyId: string | null): Promise<number> {
  const db = getAdminDb()
  // Conversaciones cuyo contacto (mismo teléfono+agencia) tuvo una campaña enviada.
  let cq = db.from("wa_contacts").select("phone").not("last_campaign_sent_at", "is", null)
  if (agencyId) cq = cq.eq("agency_id", agencyId)
  const { data: contactos, error: ce } = await cq
  if (ce) throw new Error(`origenCampana contactos: ${ce.message}`)
  const phones = (contactos ?? []).map((c) => c.phone as string)
  if (!phones.length) return 0
  let vq = db.from("wa_conversations").select("*", { count: "exact", head: true }).in("contact_phone", phones)
  if (agencyId) vq = vq.eq("agency_id", agencyId)
  const { count, error } = await vq
  if (error) throw new Error(`origenCampana convs: ${error.message}`)
  return count ?? 0
}
```

- [ ] **Step 4: Agregar el cálculo de semáforo y `auditarWhatsapp`**

```typescript
function semaforoWhatsapp(m: MetricasWa): { semaforo: Semaforo; sub: Record<string, Semaforo> } {
  const sub: Record<string, Semaforo> = {
    agente_ciego: m.agente_ciego === 0 ? "verde" : m.agente_ciego <= 2 ? "amarillo" : "rojo",
    sin_responder: m.sin_responder_6h > 0 ? "rojo" : m.sin_responder_total > 0 ? "amarillo" : "verde",
    tasa_respuesta:
      m.tasa_respuesta_pct === null ? "gris" : m.tasa_respuesta_pct >= 80 ? "verde" : m.tasa_respuesta_pct >= 50 ? "amarillo" : "rojo",
    enfriados: m.enfriados === 0 ? "verde" : "amarillo",
  }
  return { semaforo: peorSemaforo(Object.values(sub)), sub }
}

/** Devuelve el snapshot global + uno por agencia activa. */
export async function auditarWhatsapp(): Promise<AuditSnapshot[]> {
  const db = getAdminDb()
  const { data: agencias, error } = await db.from("agencies").select("id, name").is("deleted_at", null)
  if (error) throw new Error(`auditarWhatsapp agencias: ${error.message}`)

  const scopes: { scope: string; agencyId: string | null; nombre: string }[] = [
    { scope: "global", agencyId: null, nombre: "Global" },
    ...(agencias ?? []).map((a) => ({ scope: a.id as string, agencyId: a.id as string, nombre: a.name as string })),
  ]

  const snaps: AuditSnapshot[] = []
  for (const s of scopes) {
    const m = await metricasWhatsapp(s.agencyId)
    const { semaforo, sub } = semaforoWhatsapp(m)
    snaps.push({
      experto: "whatsapp",
      scope: s.scope,
      semaforo,
      resumen: "", // lo completa el endpoint con narrate
      metricas: { ...m, agencia: s.nombre, sub_semaforos: sub },
    })
  }
  return snaps
}
```

- [ ] **Step 5: Verificar la lógica contra la DB real (sin endpoint todavía)**

Comparar el conteo del recolector con SQL directo. Correr con `mcp__supabase__execute_sql`:

```sql
select
  (select count(*) from wa_conversations where metricas->>'etapa' in ('calificacion','recomendacion','visita')) as calificados,
  (select count(*) from wa_conversations where (metricas->>'visita_agendada')::boolean = true) as visitas,
  (select count(*) from wa_conversations where (metricas->>'fue_derivado_a_humano')::boolean = true) as handoffs;
```

Anotar los valores. En el Step siguiente (Task 4) el endpoint debe devolver estos mismos números en `scope=global`.

- [ ] **Step 6: Commit**

```bash
git add lib/admin-vakdor/audit/whatsapp.ts
git commit -m "feat(metricas): Experto 1 WhatsApp — recolector, SLA, origen y semáforo"
```

---

## Task 4: Endpoint cron del Experto 1 + enganche al workflow

**Files:**
- Create: `app/api/cron/audit-whatsapp/route.ts`
- Modify: `.github/workflows/tokko-sync.yml`

**Interfaces:**
- Consumes: `auditarWhatsapp`, `redactarResumen`, `guardarSnapshot`.
- Produces: `GET /api/cron/audit-whatsapp` → escribe N filas en `audit_snapshots` y responde `{ ok, filas }`.

- [ ] **Step 1: Crear el endpoint**

```typescript
import { NextResponse } from "next/server"
import { auditarWhatsapp } from "@/lib/admin-vakdor/audit/whatsapp"
import { redactarResumen } from "@/lib/admin-vakdor/audit/narrate"
import { guardarSnapshot } from "@/lib/admin-vakdor/audit/store"

export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization")
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const snaps = await auditarWhatsapp()
    for (const s of snaps) {
      s.resumen = await redactarResumen("WhatsApp", s.metricas, s.semaforo)
      await guardarSnapshot(s)
    }
    return NextResponse.json({
      ok: true,
      filas: snaps.length,
      resumen: snaps.map((s) => ({ scope: s.scope, semaforo: s.semaforo })),
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
```

- [ ] **Step 2: Levantar local y probar el endpoint con el CRON_SECRET real**

Levantar dev (Claude lo hace): `npm run dev`. Luego, con el valor de `CRON_SECRET` del `.env`:

```bash
curl -sS "http://localhost:3000/api/cron/audit-whatsapp" -H "Authorization: Bearer <CRON_SECRET>" | jq
```

Esperado: `ok:true`, `filas:3` (global + 2 agencias), cada una con su `semaforo`.

- [ ] **Step 3: Verificar que las filas quedaron en Supabase con los números correctos**

`mcp__supabase__execute_sql`:

```sql
select scope, semaforo, metricas->>'calificados' as calificados,
       metricas->>'visitas_agendadas' as visitas, metricas->>'handoffs' as handoffs, left(resumen,80) as resumen
from audit_snapshots where experto='whatsapp' order by run_at desc limit 3;
```

Esperado: la fila `global` coincide con los números de Task 3 Step 5; `resumen` tiene texto en criollo.

- [ ] **Step 4: Colgar el paso en `tokko-sync.yml`**

Agregar al final de `jobs.sync.steps` (después del paso de finance-sync), respetando el patrón:

```yaml
      # Colgado del mismo cron (2×/día): Experto 1 (WhatsApp) del módulo de Métricas.
      - name: Trigger Audit WhatsApp (Experto 1)
        if: always()
        continue-on-error: true
        run: |
          curl -sS --max-time 120 -X GET "https://${{ secrets.SITE_DOMAIN }}/api/cron/audit-whatsapp" \
               -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```

- [ ] **Step 5: Commit**

```bash
git add app/api/cron/audit-whatsapp/route.ts .github/workflows/tokko-sync.yml
git commit -m "feat(metricas): endpoint cron Experto 1 + enganche a tokko-sync"
```

---

## Task 5: Mail resumen (Resend) + endpoint con guard de hora

**Files:**
- Create: `lib/admin-vakdor/audit/notify.ts`
- Create: `app/api/cron/audit-notify/route.ts`
- Modify: `.github/workflows/tokko-sync.yml`

**Env nuevas (agregar en `.env` local + Vercel):** `RESEND_API_KEY`, `AUDIT_MAIL_TO` (destino, ej. `osterrietchleonardo@vakdor.com`), `AUDIT_MAIL_FROM` (ej. `PRISMA <no-reply@vakbot.vakdor.com>` — dominio verificado en Resend).

**Interfaces:**
- Consumes: `getAdminDb`.
- Produces: `enviarMailMetricas(): Promise<{ enviado: boolean; motivo?: string }>`; `GET /api/cron/audit-notify`.

- [ ] **Step 1: Crear `notify.ts` (lee últimos snapshots + arma y manda el mail)**

```typescript
import { getAdminDb } from "@/lib/admin-vakdor/logger"

const COLOR: Record<string, string> = { verde: "#16a34a", amarillo: "#d97706", rojo: "#dc2626", gris: "#6b7280" }

/** Último snapshot global por experto. */
async function ultimosGlobales() {
  const db = getAdminDb()
  const { data, error } = await db
    .from("audit_snapshots")
    .select("experto, semaforo, resumen, run_at")
    .eq("scope", "global")
    .order("run_at", { ascending: false })
  if (error) throw new Error(`ultimosGlobales: ${error.message}`)
  const vistos = new Set<string>()
  const out: { experto: string; semaforo: string; resumen: string }[] = []
  for (const r of data ?? []) {
    if (vistos.has(r.experto)) continue
    vistos.add(r.experto)
    out.push({ experto: r.experto, semaforo: r.semaforo, resumen: r.resumen ?? "" })
  }
  return out
}

const NOMBRE: Record<string, string> = { whatsapp: "WhatsApp", sistema: "Salud del sistema", redes: "Redes / SEO / Meta" }

export async function enviarMailMetricas(): Promise<{ enviado: boolean; motivo?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  const to = process.env.AUDIT_MAIL_TO
  const from = process.env.AUDIT_MAIL_FROM ?? "PRISMA <no-reply@vakbot.vakdor.com>"
  if (!apiKey || !to) return { enviado: false, motivo: "falta RESEND_API_KEY o AUDIT_MAIL_TO" }

  const items = await ultimosGlobales()
  // Ordenar: rojo primero, luego amarillo, luego verde.
  const peso: Record<string, number> = { rojo: 0, amarillo: 1, verde: 2, gris: 3 }
  items.sort((a, b) => (peso[a.semaforo] ?? 9) - (peso[b.semaforo] ?? 9))
  const rojos = items.filter((i) => i.semaforo === "rojo").length

  const fecha = new Date().toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })
  const filas = items
    .map(
      (i) => `
      <tr>
        <td style="padding:12px 0;border-top:1px solid #eee;vertical-align:top;width:24px">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${COLOR[i.semaforo]}"></span>
        </td>
        <td style="padding:12px 0;border-top:1px solid #eee">
          <strong style="font-size:14px;color:#111">${NOMBRE[i.experto] ?? i.experto}</strong>
          <div style="font-size:13px;color:#555;margin-top:4px;line-height:1.5">${i.resumen || "Sin novedades."}</div>
        </td>
      </tr>`,
    )
    .join("")

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#111">
    <h2 style="font-size:16px;margin:0 0 4px">PRISMA · Métricas del ${fecha}</h2>
    <p style="font-size:13px;color:#777;margin:0 0 12px">${rojos ? `${rojos} experto(s) en rojo` : "Todo en orden"}</p>
    <table style="width:100%;border-collapse:collapse">${filas}</table>
    <p style="font-size:11px;color:#aaa;margin-top:16px">Detalle completo en admin-vakdor → Métricas.</p>
  </div>`

  const subject = `PRISMA · Métricas ${fecha}${rojos ? ` — ${rojos} en rojo` : ""}`
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html }),
  })
  if (!res.ok) return { enviado: false, motivo: `Resend ${res.status}: ${await res.text()}` }
  return { enviado: true }
}
```

- [ ] **Step 2: Crear el endpoint con guard de hora (mail sólo en la corrida de las 07:00 AR = 10 UTC)**

```typescript
import { NextResponse } from "next/server"
import { enviarMailMetricas } from "@/lib/admin-vakdor/audit/notify"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization")
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  // Guard: sólo manda mail en la corrida de las 10 UTC (07:00 AR). ?force=1 para probar.
  const { searchParams } = new URL(req.url)
  const force = searchParams.get("force") === "1"
  const horaUtc = new Date().getUTCHours()
  if (!force && horaUtc !== 10) {
    return NextResponse.json({ ok: true, enviado: false, motivo: `corrida ${horaUtc}h UTC, no es la del mail` })
  }
  const r = await enviarMailMetricas()
  return NextResponse.json({ ok: true, ...r })
}
```

- [ ] **Step 3: Probar el envío real con `?force=1`**

Con `npm run dev` corriendo y las env `RESEND_API_KEY`/`AUDIT_MAIL_TO` cargadas:

```bash
curl -sS "http://localhost:3000/api/cron/audit-notify?force=1" -H "Authorization: Bearer <CRON_SECRET>" | jq
```

Esperado: `{ ok:true, enviado:true }` y **el mail llega a la casilla** (verificar bandeja). Si `enviado:false`, leer `motivo`.

- [ ] **Step 4: Colgar el paso del mail en `tokko-sync.yml`** (después del de audit-whatsapp)

```yaml
      # Mail resumen de Métricas. El endpoint decide (guard interno) mandar sólo en la corrida de las 10 UTC.
      - name: Trigger Audit Notify (mail resumen)
        if: always()
        continue-on-error: true
        run: |
          curl -sS --max-time 60 -X GET "https://${{ secrets.SITE_DOMAIN }}/api/cron/audit-notify" \
               -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```

- [ ] **Step 5: Commit**

```bash
git add lib/admin-vakdor/audit/notify.ts app/api/cron/audit-notify/route.ts .github/workflows/tokko-sync.yml
git commit -m "feat(metricas): mail resumen diario (Resend) + guard de hora + enganche"
```

---

## Task 6: Sección "Métricas" en admin-vakdor (dashboard)

**Files:**
- Create: `lib/admin-vakdor/audit/read.ts`
- Create: `components/admin-vakdor/metricas-primitivos.tsx`
- Create: `components/admin-vakdor/metricas-client.tsx`
- Create: `app/admin-vakdor/metricas/page.tsx`
- Modify: `components/admin-vakdor/sidebar.tsx`

**Interfaces:**
- Consumes: `getAdminDb`.
- Produces: `leerSnapshots(): Promise<{ whatsapp: SnapRow[]; sistema?: SnapRow; redes?: SnapRow }>`; página en `/admin-vakdor/metricas`.

- [ ] **Step 1: Instalar `motion`**

```bash
npm install motion
```

Esperado: `motion` en `dependencies` de package.json.

- [ ] **Step 2: Crear `read.ts` (último snapshot por experto+scope)**

```typescript
import { getAdminDb } from "@/lib/admin-vakdor/logger"

export interface SnapRow {
  experto: string
  scope: string
  semaforo: string
  resumen: string
  metricas: Record<string, any>
  run_at: string
}

export async function leerSnapshots(): Promise<{ whatsapp: SnapRow[]; sistema: SnapRow | null; redes: SnapRow | null }> {
  const db = getAdminDb()
  const { data, error } = await db
    .from("audit_snapshots")
    .select("experto, scope, semaforo, resumen, metricas, run_at")
    .order("run_at", { ascending: false })
    .limit(200)
  if (error) throw new Error(`leerSnapshots: ${error.message}`)

  const visto = new Set<string>()
  const whatsapp: SnapRow[] = []
  let sistema: SnapRow | null = null
  let redes: SnapRow | null = null
  for (const r of (data ?? []) as SnapRow[]) {
    const key = `${r.experto}:${r.scope}`
    if (visto.has(key)) continue
    visto.add(key)
    if (r.experto === "whatsapp") whatsapp.push(r)
    else if (r.experto === "sistema" && !sistema) sistema = r
    else if (r.experto === "redes" && !redes) redes = r
  }
  return { whatsapp, sistema, redes }
}
```

- [ ] **Step 3: Crear `metricas-primitivos.tsx` (Semaforo, Kpi, PanelExperto)**

Estilo sobrio, dark, sin emojis; color sólo en el punto del semáforo.

```tsx
"use client"
import type { ReactNode } from "react"

const COLOR: Record<string, string> = { verde: "#16a34a", amarillo: "#d97706", rojo: "#dc2626", gris: "#6b7280" }

export function Semaforo({ estado, size = 10 }: { estado: string; size?: number }) {
  return (
    <span style={{ display: "inline-block", width: size, height: size, borderRadius: "50%", background: COLOR[estado] ?? COLOR.gris }} />
  )
}

export function Kpi({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 10, padding: "14px 16px", minWidth: 0,
    }}>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", marginTop: 4, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

export function PanelExperto({
  titulo, semaforo, resumen, right, children,
}: { titulo: string; semaforo: string; resumen?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Semaforo estado={semaforo} size={12} />
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "#fff", margin: 0, letterSpacing: "-0.01em" }}>{titulo}</h2>
        </div>
        {right}
      </div>
      {children}
      {resumen && (
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.6, marginTop: 12, fontStyle: "italic" }}>{resumen}</p>
      )}
    </section>
  )
}

export function Grid({ children }: { children: ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>{children}</div>
}
```

- [ ] **Step 4: Crear `metricas-client.tsx` (los 3 paneles + toggle de agencia en WhatsApp)**

```tsx
"use client"
import { useState } from "react"
import { motion } from "motion/react"
import type { SnapRow } from "@/lib/admin-vakdor/audit/read"
import { PanelExperto, Kpi, Grid, Semaforo } from "./metricas-primitivos"

export default function MetricasClient({
  whatsapp, sistema, redes,
}: { whatsapp: SnapRow[]; sistema: SnapRow | null; redes: SnapRow | null }) {
  const global = whatsapp.find((w) => w.scope === "global")
  const [scope, setScope] = useState<string>("global")
  const waActual = whatsapp.find((w) => w.scope === scope) ?? global

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1100, margin: "0 auto" }}>
      {/* Encabezado + barra resumen */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#fff", margin: 0 }}>Métricas</h1>
        <div style={{ display: "flex", gap: 16, fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
          <span><Semaforo estado={global?.semaforo ?? "gris"} /> WhatsApp</span>
          <span><Semaforo estado={sistema?.semaforo ?? "gris"} /> Salud</span>
          <span><Semaforo estado={redes?.semaforo ?? "gris"} /> Redes</span>
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        {/* PANEL 1 — WHATSAPP */}
        {waActual && (
          <PanelExperto
            titulo="1 · WhatsApp"
            semaforo={waActual.semaforo}
            resumen={waActual.resumen}
            right={
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                style={{ background: "#131A2D", color: "#fff", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "6px 10px", fontSize: 12 }}
              >
                <option value="global">Global</option>
                {whatsapp.filter((w) => w.scope !== "global").map((w) => (
                  <option key={w.scope} value={w.scope}>{w.metricas?.agencia ?? w.scope}</option>
                ))}
              </select>
            }
          >
            <Grid>
              <Kpi label="Leads nuevos" value={waActual.metricas.leads_nuevos ?? 0} />
              <Kpi label="Conv. activas" value={waActual.metricas.conversaciones_activas ?? 0} />
              <Kpi label="Sin responder" value={waActual.metricas.sin_responder_total ?? 0} sub={`${waActual.metricas.sin_responder_6h ?? 0} +6h`} />
              <Kpi label="Agente ciego" value={waActual.metricas.agente_ciego ?? 0} />
              <Kpi label="1ª respuesta" value={waActual.metricas.primera_respuesta_min_mediana ?? "—"} sub="min (mediana)" />
              <Kpi label="Tasa respuesta" value={waActual.metricas.tasa_respuesta_pct != null ? `${waActual.metricas.tasa_respuesta_pct}%` : "—"} />
              <Kpi label="Calificados" value={waActual.metricas.calificados ?? 0} />
              <Kpi label="Prop. mostradas" value={waActual.metricas.propiedades_mostradas ?? 0} />
              <Kpi label="Visitas agendadas" value={waActual.metricas.visitas_agendadas ?? 0} />
              <Kpi label="Handoffs" value={waActual.metricas.handoffs ?? 0} />
              <Kpi label="Campaña / orgánico" value={`${waActual.metricas.origen_campana ?? 0}/${waActual.metricas.origen_organico ?? 0}`} />
              <Kpi label="Enfriados" value={waActual.metricas.enfriados ?? 0} />
            </Grid>
          </PanelExperto>
        )}

        {/* PANEL 2 — SALUD (lo llena la routine; si no hay datos, gris) */}
        <PanelExperto titulo="2 · Salud del sistema" semaforo={sistema?.semaforo ?? "gris"} resumen={sistema?.resumen}>
          {sistema ? (
            <Grid>
              {Object.entries(sistema.metricas?.servicios ?? {}).map(([k, v]) => (
                <Kpi key={k} label={k} value={String((v as any)?.estado ?? v)} />
              ))}
            </Grid>
          ) : (
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Sin datos todavía (corre 06:30).</p>
          )}
        </PanelExperto>

        {/* PANEL 3 — REDES */}
        <PanelExperto titulo="3 · Redes / SEO / Meta" semaforo={redes?.semaforo ?? "gris"} resumen={redes?.resumen}>
          {redes ? (
            <Grid>
              {Object.entries(redes.metricas?.kpis ?? {}).map(([k, v]) => (
                <Kpi key={k} label={k} value={String(v)} />
              ))}
            </Grid>
          ) : (
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Sin datos todavía (corre 06:30).</p>
          )}
        </PanelExperto>
      </motion.div>
    </div>
  )
}
```

- [ ] **Step 5: Crear la página server**

```tsx
import { leerSnapshots } from "@/lib/admin-vakdor/audit/read"
import MetricasClient from "@/components/admin-vakdor/metricas-client"

export const metadata = { title: "Métricas · Panel Admin", robots: { index: false, follow: false } }
export const dynamic = "force-dynamic"

export default async function MetricasPage() {
  const { whatsapp, sistema, redes } = await leerSnapshots()
  return <MetricasClient whatsapp={whatsapp} sistema={sistema} redes={redes} />
}
```

- [ ] **Step 6: Agregar la entrada en el sidebar**

En `components/admin-vakdor/sidebar.tsx`, agregar al array `NAV` después de `Finanzas`:

```typescript
  { href: "/admin-vakdor/metricas", icon: "◫", label: "Métricas" },
```

- [ ] **Step 7: Verificar en local**

Con `npm run dev` (Claude lo levanta), abrir `http://localhost:3000/admin-vakdor/metricas` (logueado como admin). Verificar: se ven los 3 paneles; WhatsApp con datos reales y toggle Global/agencia funcionando; Salud y Redes en gris con "Sin datos todavía". Sacar screenshot para Leonardo.

- [ ] **Step 8: Commit**

```bash
git add lib/admin-vakdor/audit/read.ts components/admin-vakdor/metricas-primitivos.tsx components/admin-vakdor/metricas-client.tsx app/admin-vakdor/metricas/page.tsx components/admin-vakdor/sidebar.tsx package.json package-lock.json
git commit -m "feat(metricas): sección Métricas en admin-vakdor (3 paneles + toggle agencia + motion)"
```

---

## Task 7: Experto 2 — routine de Salud del sistema

**Files:**
- Create: `docs/agentes-metricas/experto-2-salud.md` (prompt de referencia, versionado en el repo)

**Interfaces:**
- Produces: una routine de Claude programada (06:30 AR) que escribe un snapshot `experto='sistema', scope='global'` en `audit_snapshots`.

- [ ] **Step 1: Escribir el prompt de la routine en `docs/agentes-metricas/experto-2-salud.md`**

Contenido (texto completo del prompt):

```markdown
# Routine — Experto 2: Salud del sistema (diaria 06:30 AR)

Sos el auditor de infraestructura de Vakdor. Cada día revisás la salud del sistema
PRISMA y dejás un snapshot en Supabase. NO cambies nada; sólo leés y reportás.

## Qué revisar (sólo lectura)
1. **EasyPanel** (skill vakdor-easypanel): estado de n8n, evolution-api, roomix-worker,
   acm-extractor, redis. Marcá cuáles están arriba/abajo y CPU/RAM/disco del server.
2. **Vercel** (MCP vercel): último deploy de producción (¿OK o error?) y errores de runtime recientes.
3. **GitHub** (`gh` CLI): estado de la última corrida de los workflows tokko-sync, market-sync, campaigns-drip.
4. **Cloudflare** (MCP cloudflare): que los subdominios (prisma, n8n, evolution, vakbot) resuelvan.
5. **Supabase** (MCP supabase get_advisors): advisors de seguridad y performance.
6. **n8n** (MCP n8n-server n8n_health_check + n8n_executions): que esté vivo y errores de las últimas 24h.

## Cómo calcular el semáforo (regla fija, no lo decidas "a ojo")
- Sub-semáforo por bloque: rojo si un servicio crítico está caído, un deploy de prod falló,
  un subdominio no resuelve, o hay un advisor de seguridad tipo ERROR. Amarillo si hay
  warnings/uso alto de recursos/errores no críticos. Verde si todo OK.
- Semáforo del experto = el PEOR de los sub-semáforos.

## Cómo guardar (MCP supabase execute_sql)
Insertá UNA fila. `metricas` es un jsonb con esta forma:
{ "servicios": { "n8n": {"estado":"..."}, "evolution": {...}, ... },
  "plataformas": { "vercel": "...", "github": "...", "cloudflare": "..." },
  "datos": { "supabase_advisors": N, "n8n_errores_24h": N },
  "sub_semaforos": {...} }

INSERT SQL (reemplazá <...>):
insert into public.audit_snapshots (experto, scope, semaforo, resumen, metricas)
values ('sistema','global','<verde|amarillo|rojo>', '<2-4 oraciones criollas>', '<jsonb>'::jsonb);

El `resumen` lo redactás vos: 2-4 oraciones en español rioplatense, sobrio, sin emojis,
diciendo qué está bien y qué revisar. Corré 1×/día.
```

- [ ] **Step 2: Verificar que las MCP/skills están disponibles en el entorno de routines**

Antes de programar, confirmar (manualmente en una sesión de Claude Code / routine de prueba) que responden: skill `vakdor-easypanel`, MCP `vercel`, `gh` CLI, MCP `cloudflare`, MCP `supabase` (get_advisors + execute_sql), MCP `n8n-server`. Si alguna no está, anotarla como pendiente (no bloquea las demás).

- [ ] **Step 3: Correr el prompt UNA vez a mano y verificar la fila**

Ejecutar el prompt en una sesión de Claude Code. Luego, con `mcp__supabase__execute_sql`:

```sql
select semaforo, left(resumen,80), metricas->'servicios' from audit_snapshots where experto='sistema' order by run_at desc limit 1;
```

Esperado: una fila con semáforo coherente, resumen en criollo y el jsonb de servicios. Verificar que el PANEL 2 del dashboard ahora muestra datos (recargar `/admin-vakdor/metricas`).

- [ ] **Step 4: Programar la routine (06:30 AR = 09:30 UTC) — requiere OK de Leonardo**

Usar la skill `/schedule` con cron `30 9 * * *` y el prompt del archivo. Confirmar con Leonardo antes de crearla.

- [ ] **Step 5: Commit**

```bash
git add docs/agentes-metricas/experto-2-salud.md
git commit -m "feat(metricas): Experto 2 Salud — prompt de routine + programación"
```

---

## Task 8: Experto 3 — routine de Redes / SEO / Meta

**Files:**
- Create: `docs/agentes-metricas/experto-3-redes.md`

**Interfaces:**
- Produces: routine de Claude (06:30 AR) que escribe snapshot `experto='redes', scope='global'`.

- [ ] **Step 1: Escribir el prompt en `docs/agentes-metricas/experto-3-redes.md`**

```markdown
# Routine — Experto 3: Redes / SEO / Meta (diaria 06:30 AR)

Sos el analista de marketing de Vakdor. Cada día medís cómo vienen las redes, la
publicidad y el SEO, y dejás un snapshot en Supabase. Sólo leés.

## Qué medir
1. **Orgánico** (skill vakdor-metricas / Buffer): impresiones, alcance y engagement de
   LinkedIn e Instagram, tendencia vs. la semana anterior.
2. **Publicidad** (MCP meta-ads): gasto, resultados, CPL/CTR y alertas de anomalías.
3. **Google Analytics** (MCP google-analytics): usuarios/sesiones y tendencia.
4. **Search Console** (MCP gsc): clicks, impresiones, posición media y quick wins.
5. **Clarity** (`node scripts/clarity.mjs`): rage-clicks, dead-clicks, highlights. OJO:
   límite 10 requests/día y ventanas de 1-3 días → una sola corrida por día.

## Semáforo (regla de tendencia)
- Verde: métricas subiendo o estables al alza. Amarillo: planas o caída leve.
  Rojo: caída marcada o anomalía de Meta detectada.
- Semáforo del experto = el peor de los sub-semáforos.

## Guardar (MCP supabase execute_sql)
`metricas` jsonb con: { "kpis": { "linkedin_impresiones": N, "ig_alcance": N,
  "meta_gasto": N, "meta_cpl": N, "ga_usuarios": N, "gsc_clicks": N, ... },
  "quick_wins": [...], "sub_semaforos": {...} }

insert into public.audit_snapshots (experto, scope, semaforo, resumen, metricas)
values ('redes','global','<verde|amarillo|rojo>','<2-4 oraciones>','<jsonb>'::jsonb);

Resumen: 2-4 oraciones criollas, sobrio, sin emojis, con la sugerencia más útil del día.
```

- [ ] **Step 2: Verificar disponibilidad de conexiones**

Confirmar que responden: skill `vakdor-metricas` (Buffer), MCP `meta-ads`, `google-analytics`, `gsc`, y el script `scripts/clarity.mjs`. Anotar faltantes.

- [ ] **Step 3: Correr a mano y verificar fila + panel**

```sql
select semaforo, left(resumen,80), metricas->'kpis' from audit_snapshots where experto='redes' order by run_at desc limit 1;
```

Esperado: fila con kpis reales; PANEL 3 del dashboard muestra datos.

- [ ] **Step 4: Programar la routine (06:30 AR) — requiere OK de Leonardo**

`/schedule` con cron `30 9 * * *` (misma franja que Salud). Confirmar con Leonardo.

- [ ] **Step 5: Commit**

```bash
git add docs/agentes-metricas/experto-3-redes.md
git commit -m "feat(metricas): Experto 3 Redes/SEO/Meta — prompt de routine + programación"
```

---

## Task 9: Documentación del proyecto + cierre

**Files:**
- Modify: los 4 docs del proyecto (LÓGICA / TÉCNICO / FUNCIONAL-ASESOR / FUNCIONAL-DIRECTOR) según corresponda.

- [ ] **Step 1: Actualizar TÉCNICO y LÓGICA**

Documentar: tabla `audit_snapshots`, el módulo `lib/admin-vakdor/audit/*`, los 2 endpoints cron y su enganche a `tokko-sync.yml`, las 2 routines de Claude, y las env nuevas (`RESEND_API_KEY`, `AUDIT_MAIL_TO`, `AUDIT_MAIL_FROM`).

- [ ] **Step 2: Actualizar FUNCIONAL-DIRECTOR** (lenguaje no técnico)

Explicar la sección Métricas: qué muestra cada panel, el semáforo, el mail diario, y el toggle Global/agencia. Sin tecnicismos.

- [ ] **Step 3: Verificación final de extremo a extremo**

Con todo mergeado en la rama: correr los 3 endpoints/routines, abrir `/admin-vakdor/metricas`, confirmar los 3 paneles con datos reales y semáforos, y que llegó el mail. Sacar screenshot final.

- [ ] **Step 4: Commit y preparar merge (con OK de Leonardo)**

```bash
git add docs/
git commit -m "docs(metricas): actualizar TÉCNICO/LÓGICA/FUNCIONAL con la sección Métricas"
```

---

## Self-Review (cobertura del spec)

- **Semáforo por regla fija + resumen IA:** Task 2 (narrate), Task 3 (semaforoWhatsapp), Tasks 7/8 (reglas en el prompt). ✔
- **Experto 1 global + por agencia + 4 bloques de métricas:** Task 3 (todos los indicadores) + Task 6 (toggle). ✔
- **Experto 2 (EasyPanel sin chatwoot, Vercel, GitHub, Cloudflare, Supabase, n8n) como agente Claude:** Task 7. ✔
- **Experto 3 (Buffer, Meta, GA, GSC, Clarity) como agente Claude:** Task 8. ✔
- **Tabla `audit_snapshots` + RLS + historial:** Task 1. ✔
- **Flujo diario (06:30 routines / 07:00 Exp1+mail / 18:00 sin mail):** Tasks 4, 5, 7, 8. ✔
- **Mail Resend con rojos primero:** Task 5. ✔
- **Dashboard sobrio con estructura por secciones + motion:** Task 6. ✔
- **GEO fuera de alcance:** no aparece. ✔
- **Puntos a confirmar en build (MCPs en routines, mapeo metricas):** Tasks 7/8 Step 2, y nota de `propiedades_mostradas` en Task 3. ✔

**Riesgo abierto conocido:** el conteo `propiedades_mostradas` en supabase-js (filtro de array vacío) — mitigado con la nota de fallback a conteo en JS en Task 3.
