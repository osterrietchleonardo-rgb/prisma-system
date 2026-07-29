# Vista Pipeline en Tracking Performance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar una vista de tablero por etapas dentro de la solapa *Actividad* de Tracking Performance, donde cada cliente aparece una sola vez en su etapa actual y se puede mover entre etapas, sin modificar el comportamiento del listado actual ni los números del Dashboard.

**Architecture:** La vista Pipeline es una proyección en memoria de `performance_logs` (que no se modifica) más una tabla nueva `tracking_pipeline_moves` que solo registra los movimientos manuales. Las tarjetas se agrupan por celular normalizado; la etapa de cada tarjeta es el evento más reciente entre sus actividades y sus movimientos. Mover a una etapa que todavía no tiene actividad abre el mismo `PerformanceLogForm` de siempre y guarda con la misma `savePerformanceLog`.

**Tech Stack:** Next.js 14 (App Router, componentes cliente), TypeScript, Supabase (`@supabase/ssr`), `@dnd-kit/core` + `@dnd-kit/sortable` (ya instalados), `libphonenumber-js` vía `lib/whatsapp/phone.ts`, Tailwind + componentes `@/components/ui/*`, `sonner` para avisos.

## Global Constraints

- **Spec de referencia:** `docs/superpowers/specs/2026-07-28-tracking-vista-pipeline-design.md`. Ante cualquier duda, manda el spec.
- **No romper nada.** El listado de actividades, sus filtros, *Nueva Actividad*, editar/eliminar con motivo, las solapas *Objetivos* y *Configuración IA*, y el pipeline de leads de `/director/pipeline` quedan intactos.
- **Ninguna métrica del Dashboard puede cambiar de valor.** Mover una tarjeta hacia atrás o hacia una etapa ya recorrida **no crea** ningún `performance_logs`.
- **No se instalan dependencias nuevas.** Todo lo necesario ya está en `package.json`.
- **No se inventa un framework de tests.** El repo no tiene ninguno (`scripts` solo tiene `dev`/`build`/`start`/`lint`). La verificación es: `npx tsc --noEmit`, `npm run lint`, `npm run build`, scripts de comprobación contra datos reales en `scratch/` (idioma ya usado por el repo) y prueba manual en local.
- **Orden lineal de etapas, fijo:** `prospeccion → prelisting → prebuying → captacion → reserva → cierre`.
- **Un solo normalizador de teléfonos:** `normalizePhoneE164()` de `lib/whatsapp/phone.ts`. Prohibido escribir otro.
- **Las migraciones del repo NO se aplican solas.** Se aplican con la Management API de Supabase usando `SUPABASE_API_KEY_MANAGEMENT` y `SUPABASE_PROJECT_REF` del `.env`.
- **Trabajo en rama**, nunca directo sobre `main`. Merge solo con OK explícito de Leonardo.
- **Textos de interfaz en español rioplatense**, tuteo, sin tecnicismos (es lo que ven asesores y directores).

---

## Estructura de archivos

**Se crean:**

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/20260728120000_create_tracking_pipeline_moves.sql` | Tabla de movimientos manuales + RLS |
| `lib/tracking/pipeline.ts` | Lógica pura: etapas, clave de cliente, armado de tarjetas. Sin I/O |
| `actions/tracking/movePipelineCard.ts` | Server action que registra un movimiento manual |
| `components/tracking/pipeline/PipelineCard.tsx` | Tarjeta de cliente + menú "Mover a…" |
| `components/tracking/pipeline/PipelineColumn.tsx` | Columna droppable de una etapa |
| `components/tracking/pipeline/PipelineBoard.tsx` | Tablero: DnD, resolución del movimiento, estado |
| `components/tracking/pipeline/PipelineStageDialog.tsx` | Popup que envuelve `PerformanceLogForm` con etapa y cliente fijados |
| `components/tracking/pipeline/PipelineClientSheet.tsx` | Panel lateral con la trazabilidad del cliente |
| `scratch/verify-pipeline-cards.mjs` | Comprobación de la lógica pura contra datos reales |

**Se modifican:**

| Archivo | Cambio |
|---|---|
| `lib/tracking/types.ts` | `leads` con `phone`; tipos `PipelineMove` |
| `lib/tracking/queries.ts` | El select de `leads` incluye `phone`; se agrega `getPipelineMoves()` |
| `components/tracking/PerformanceLogForm.tsx` | Cliente obligatorio + props `forcedType` / `lockedClient` / `defaults` |
| `components/tracking/TrackingPerformanceView.tsx` | Switch Lista \| Pipeline y comportamiento de filtros |

---

## Preparación (una sola vez, antes de la Task 1)

- [x] **Crear la rama desde `main` actualizado**

```bash
cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM"
git checkout main
git pull
git checkout -b feat/tracking-vista-pipeline
```

---

### Task 1: Tabla `tracking_pipeline_moves` + RLS

Guarda los movimientos manuales del tablero. Es append-only: nunca se actualiza ni se borra una fila, así queda la trazabilidad completa de quién movió qué y cuándo.

**Files:**
- Create: `supabase/migrations/20260728120000_create_tracking_pipeline_moves.sql`
- Create: `scratch/apply-pipeline-moves-migration.mjs`

**Interfaces:**
- Consumes: nada (primera task).
- Produces: tabla `public.tracking_pipeline_moves` con columnas `id uuid`, `agency_id uuid`, `agent_id uuid`, `client_key text`, `lead_id uuid null`, `wa_contact_id uuid null`, `from_stage text null`, `to_stage text`, `created_at timestamptz`.

- [x] **Step 1: Escribir la migración**

Crear `supabase/migrations/20260728120000_create_tracking_pipeline_moves.sql`:

```sql
-- ============================================================================
-- Movimientos manuales de la vista Pipeline de Tracking Performance.
-- - Cada fila es "alguien arrastró la tarjeta del cliente X a la etapa Y".
-- - Tabla APPEND-ONLY: no se actualiza ni se borra, es la trazabilidad.
-- - NO reemplaza a performance_logs: acá no hay actividad comercial, por eso
--   mover una tarjeta hacia atrás no altera ninguna métrica del Dashboard.
-- - client_key = celular normalizado E.164 sin "+" (lib/whatsapp/phone.ts), o
--   "lead:<uuid>" / "wa:<uuid>" cuando el teléfono no se puede normalizar.
-- - La etapa actual de una tarjeta = el evento más reciente entre sus
--   performance_logs y sus filas acá (se compara por created_at).
-- Mismo patrón/RLS que public.performance_logs.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tracking_pipeline_moves (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  agent_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_key    text NOT NULL,
  lead_id       uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  wa_contact_id uuid REFERENCES public.wa_contacts(id) ON DELETE SET NULL,
  from_stage    text CHECK (from_stage IN ('prospeccion','prelisting','prebuying','captacion','reserva','cierre')),
  to_stage      text NOT NULL CHECK (to_stage IN ('prospeccion','prelisting','prebuying','captacion','reserva','cierre')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- El tablero siempre lee "los movimientos de mi agencia, el más nuevo primero".
CREATE INDEX IF NOT EXISTS tracking_pipeline_moves_agency_created_idx
  ON public.tracking_pipeline_moves (agency_id, created_at DESC);

CREATE INDEX IF NOT EXISTS tracking_pipeline_moves_client_idx
  ON public.tracking_pipeline_moves (agency_id, client_key);

-- ── RLS (mismo criterio que performance_logs) ───────────────────────────────
ALTER TABLE public.tracking_pipeline_moves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tracking_pipeline_moves_select" ON public.tracking_pipeline_moves;
DROP POLICY IF EXISTS "tracking_pipeline_moves_insert" ON public.tracking_pipeline_moves;

-- SELECT: el director ve toda su agencia; el asesor, solo lo suyo.
CREATE POLICY "tracking_pipeline_moves_select" ON public.tracking_pipeline_moves
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.agency_id = tracking_pipeline_moves.agency_id
      AND (p.role = 'director' OR tracking_pipeline_moves.agent_id = auth.uid())
  )
);

-- INSERT: solo en nombre propio y dentro de la propia agencia.
CREATE POLICY "tracking_pipeline_moves_insert" ON public.tracking_pipeline_moves
FOR INSERT
TO authenticated
WITH CHECK (
  agent_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.agency_id = tracking_pipeline_moves.agency_id
  )
);
```

- [x] **Step 2: Escribir el script que aplica la migración**

Las migraciones del repo no se aplican solas. Crear `scratch/apply-pipeline-moves-migration.mjs`:

```js
// Aplica la migración de tracking_pipeline_moves vía Management API de Supabase.
// Uso: node scratch/apply-pipeline-moves-migration.mjs
import fs from "node:fs";

const env = fs.readFileSync(".env", "utf8");
const get = (k) => {
  const m = env.match(new RegExp("^" + k + "=(.*)$", "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : null;
};

const ref = get("SUPABASE_PROJECT_REF");
const key = get("SUPABASE_API_KEY_MANAGEMENT");
if (!ref || !key) throw new Error("Faltan SUPABASE_PROJECT_REF o SUPABASE_API_KEY_MANAGEMENT en .env");

const sql = fs.readFileSync(
  "supabase/migrations/20260728120000_create_tracking_pipeline_moves.sql",
  "utf8"
);

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
});

const out = await res.json();
console.log(res.status, JSON.stringify(out));
if (!res.ok) process.exit(1);
```

- [x] **Step 3: Aplicar la migración**

```bash
node scratch/apply-pipeline-moves-migration.mjs
```

Esperado: `200 []`. Si devuelve error, leerlo y corregir el SQL antes de seguir.

- [x] **Step 4: Verificar que la tabla existe con las columnas correctas**

```bash
node -e "
const fs=require('fs');
const env=fs.readFileSync('.env','utf8');
const g=k=>{const m=env.match(new RegExp('^'+k+'=(.*)\$','m'));return m?m[1].trim().replace(/^[\"']|[\"']\$/g,''):null};
fetch('https://api.supabase.com/v1/projects/'+g('SUPABASE_PROJECT_REF')+'/database/query',{method:'POST',headers:{Authorization:'Bearer '+g('SUPABASE_API_KEY_MANAGEMENT'),'Content-Type':'application/json'},body:JSON.stringify({query:\"select column_name from information_schema.columns where table_name='tracking_pipeline_moves' order by ordinal_position\"})}).then(r=>r.json()).then(d=>console.log(JSON.stringify(d)));
"
```

Esperado: las 9 columnas `id, agency_id, agent_id, client_key, lead_id, wa_contact_id, from_stage, to_stage, created_at`.

- [x] **Step 5: Verificar que la RLS quedó activa**

```bash
node -e "
const fs=require('fs');
const env=fs.readFileSync('.env','utf8');
const g=k=>{const m=env.match(new RegExp('^'+k+'=(.*)\$','m'));return m?m[1].trim().replace(/^[\"']|[\"']\$/g,''):null};
fetch('https://api.supabase.com/v1/projects/'+g('SUPABASE_PROJECT_REF')+'/database/query',{method:'POST',headers:{Authorization:'Bearer '+g('SUPABASE_API_KEY_MANAGEMENT'),'Content-Type':'application/json'},body:JSON.stringify({query:\"select relrowsecurity from pg_class where relname='tracking_pipeline_moves'\"})}).then(r=>r.json()).then(d=>console.log(JSON.stringify(d)));
"
```

Esperado: `[{"relrowsecurity":true}]`.

- [x] **Step 6: Commit**

```bash
git add supabase/migrations/20260728120000_create_tracking_pipeline_moves.sql
git commit -m "feat(tracking): tabla tracking_pipeline_moves para los movimientos del tablero"
```

---

### Task 2: Lógica pura del pipeline

Todo el razonamiento (clave de cliente, agrupación, etapa actual) vive en un archivo sin I/O, para poder verificarlo con datos reales sin levantar la app.

**Files:**
- Create: `lib/tracking/pipeline.ts`
- Modify: `lib/tracking/types.ts` (agregar `phone` a `leads`, agregar `PipelineMove`)
- Create: `scratch/verify-pipeline-cards.mjs`

**Interfaces:**
- Consumes: `PerformanceLog` y `ActivityType` de `lib/tracking/types.ts`; `normalizePhoneE164` de `lib/whatsapp/phone.ts`.
- Produces:
  - `PIPELINE_STAGES: readonly PipelineStageDef[]` — las 6 etapas en orden lineal.
  - `clientKeyFromLog(log: PerformanceLog): string | null`
  - `buildPipeline(logs: PerformanceLog[], moves: PipelineMove[]): { cards: PipelineCard[]; sinCliente: number }`
  - Tipos `PipelineStageDef`, `PipelineCard`.

- [ ] **Step 1: Agregar `phone` a `leads` y el tipo `PipelineMove` en `lib/tracking/types.ts`**

En `lib/tracking/types.ts:73-76`, reemplazar el bloque `leads`:

```ts
  leads?: {
    id: string;
    full_name: string;
    phone: string | null;
  } | null;
```

Y al final del archivo agregar:

```ts
/** Fila de public.tracking_pipeline_moves: un movimiento manual del tablero. */
export interface PipelineMove {
  id: string;
  agency_id: string;
  agent_id: string;
  client_key: string;
  lead_id: string | null;
  wa_contact_id: string | null;
  from_stage: ActivityType | null;
  to_stage: ActivityType;
  created_at: string;
}
```

- [ ] **Step 2: Escribir `lib/tracking/pipeline.ts`**

```ts
import {
  Search,
  ClipboardList,
  Wallet,
  Handshake,
  FileSignature,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { normalizePhoneE164 } from "@/lib/whatsapp/phone";
import type { ActivityType, PerformanceLog, PipelineMove } from "./types";

export interface PipelineStageDef {
  id: ActivityType;
  title: string;
  /** Clase de Tailwind para el punto de color de la columna. */
  color: string;
  icon: LucideIcon;
}

/**
 * Las 6 etapas EN ORDEN LINEAL. El orden de este array es la única fuente de
 * verdad de qué es "avanzar" y qué es "retroceder" en el tablero.
 *
 * Ojo: el embudo real es ramificado (prelisting/captación son del vendedor,
 * prebuying del comprador; ver lib/queries/dashboard.ts). El tablero igual usa
 * orden lineal a propósito: es predecible y no bloquea nada. El asesor de un
 * comprador simplemente saltea prelisting y captación.
 */
export const PIPELINE_STAGES: readonly PipelineStageDef[] = [
  { id: "prospeccion", title: "Prospección", color: "bg-sky-500", icon: Search },
  { id: "prelisting", title: "Prelisting", color: "bg-indigo-500", icon: ClipboardList },
  { id: "prebuying", title: "Prebuying", color: "bg-violet-500", icon: Wallet },
  { id: "captacion", title: "Captación", color: "bg-amber-500", icon: Handshake },
  { id: "reserva", title: "Reserva", color: "bg-orange-500", icon: FileSignature },
  { id: "cierre", title: "Cierre", color: "bg-emerald-500", icon: Trophy },
] as const;

export interface PipelineCard {
  /** Celular normalizado, o "lead:<id>" / "wa:<id>" como respaldo. */
  clientKey: string;
  clientName: string;
  /** E.164 sin "+", o null si el teléfono no se pudo normalizar. */
  clientPhone: string | null;
  leadId: string | null;
  waContactId: string | null;
  /** Columna donde cae la tarjeta = etapa del evento más reciente. */
  stage: ActivityType;
  /** Etapas que YA tienen actividad cargada: definen si el popup pide datos. */
  stagesConActividad: ActivityType[];
  /** Propiedad del registro más reciente (puede cambiar en el camino). */
  propertyLabel: string | null;
  propertyId: string | null;
  propiedadRef: string | null;
  activityCount: number;
  /** fecha_actividad de la actividad más reciente (para el filtro de fechas). */
  lastActivityDate: string | null;
  /** Todas las fechas de actividad, para saber si cae dentro de un rango. */
  activityDates: string[];
  agentId: string;
  agentName: string | null;
  /** Actividades del cliente, de más nueva a más vieja. Para el panel lateral. */
  logs: PerformanceLog[];
}

/**
 * Clave de agrupación de un registro. Manda el contacto de WhatsApp sobre el
 * lead de Tokko: wa_contacts.phone está cargado en las 1.529 filas, mientras
 * que leads.phone está vacío en 496 de 8.325.
 *
 * Devuelve null si el registro no tiene ningún cliente vinculado: esos no
 * generan tarjeta (se cuentan aparte para avisarle al usuario).
 */
export function clientKeyFromLog(log: PerformanceLog): string | null {
  if (log.wa_contact_id) {
    const phone = normalizePhoneE164(log.wa_contacts?.phone);
    return phone ?? `wa:${log.wa_contact_id}`;
  }
  if (log.lead_id) {
    const phone = normalizePhoneE164(log.leads?.phone);
    return phone ?? `lead:${log.lead_id}`;
  }
  return null;
}

function labelDePropiedad(log: PerformanceLog): string | null {
  return (
    log.properties?.title ||
    log.properties?.address ||
    log.propiedad_ref ||
    null
  );
}

function nombreDeCliente(log: PerformanceLog, fallback: string): string {
  return log.wa_contacts?.name || log.leads?.full_name || fallback;
}

/**
 * Arma las tarjetas del tablero: una por cliente.
 *
 * Reglas (spec 4.2 y 4.3):
 * - Las actividades eliminadas no cuentan para nadie, tampoco para el director.
 * - Los registros sin cliente vinculado no generan tarjeta; se devuelven contados.
 * - La etapa es la del evento más reciente por created_at (momento en que se
 *   registró), no por fecha_actividad: un movimiento manual no tiene fecha de
 *   actividad, y lo último que hizo el asesor tiene que mandar aunque cargue
 *   una actividad con fecha retroactiva.
 */
export function buildPipeline(
  logs: PerformanceLog[],
  moves: PipelineMove[]
): { cards: PipelineCard[]; sinCliente: number } {
  const vivos = logs.filter((l) => l.status !== "eliminada");

  let sinCliente = 0;
  const porCliente = new Map<string, PerformanceLog[]>();

  for (const log of vivos) {
    const key = clientKeyFromLog(log);
    if (!key) {
      sinCliente++;
      continue;
    }
    const actual = porCliente.get(key);
    if (actual) actual.push(log);
    else porCliente.set(key, [log]);
  }

  // Último movimiento manual por cliente.
  const ultimoMovimiento = new Map<string, PipelineMove>();
  for (const move of moves) {
    const previo = ultimoMovimiento.get(move.client_key);
    if (!previo || move.created_at > previo.created_at) {
      ultimoMovimiento.set(move.client_key, move);
    }
  }

  const cards: PipelineCard[] = [];

  for (const [clientKey, delCliente] of porCliente) {
    // De más nueva a más vieja por created_at.
    const ordenados = [...delCliente].sort((a, b) =>
      a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0
    );
    const ultima = ordenados[0];

    const move = ultimoMovimiento.get(clientKey);
    const stage: ActivityType =
      move && move.created_at > ultima.created_at ? move.to_stage : ultima.type;

    const stagesConActividad = Array.from(new Set(ordenados.map((l) => l.type)));

    // El nombre y el teléfono se toman del registro más nuevo que los tenga.
    const conNombre = ordenados.find((l) => l.wa_contacts?.name || l.leads?.full_name);
    const phone =
      normalizePhoneE164(ultima.wa_contacts?.phone) ??
      normalizePhoneE164(ultima.leads?.phone) ??
      null;

    cards.push({
      clientKey,
      clientName: conNombre ? nombreDeCliente(conNombre, clientKey) : clientKey,
      clientPhone: phone,
      leadId: ultima.lead_id ?? null,
      waContactId: ultima.wa_contact_id ?? null,
      stage,
      stagesConActividad,
      propertyLabel: labelDePropiedad(ultima),
      propertyId: ultima.property_id ?? null,
      propiedadRef: ultima.propiedad_ref ?? null,
      activityCount: ordenados.length,
      lastActivityDate: ultima.fecha_actividad ?? null,
      activityDates: ordenados.map((l) => l.fecha_actividad).filter(Boolean),
      agentId: ultima.agent_id,
      agentName: ultima.profiles?.full_name ?? null,
      logs: ordenados,
    });
  }

  return { cards, sinCliente };
}
```

- [ ] **Step 3: Verificar que compila**

```bash
npx tsc --noEmit
```

Esperado: sin errores. Si `lucide-react` no exporta alguno de esos íconos, cambiarlo por uno que sí exista y seguir.

- [ ] **Step 4: Escribir el script de comprobación contra datos reales**

Crear `scratch/verify-pipeline-cards.mjs`. Reproduce la lógica de agrupación contra la base real y muestra el resultado, para confirmar que agrupa como esperamos antes de tocar la interfaz:

```js
// Comprueba la agrupación del pipeline contra los datos reales.
// Uso: node scratch/verify-pipeline-cards.mjs
import fs from "node:fs";
import { parsePhoneNumberFromString } from "libphonenumber-js";

const env = fs.readFileSync(".env", "utf8");
const get = (k) => {
  const m = env.match(new RegExp("^" + k + "=(.*)$", "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : null;
};

// Misma regla que lib/whatsapp/phone.ts (incluido el "9" móvil de Argentina).
function normalizePhoneE164(raw, country = "AR") {
  if (!raw) return null;
  try {
    const pn = parsePhoneNumberFromString(String(raw).trim(), country);
    if (pn && pn.isValid()) {
      let d = pn.number.replace(/\D/g, "");
      if (country === "AR" && d.startsWith("54") && !d.startsWith("549")) d = "549" + d.slice(2);
      return d;
    }
  } catch {}
  return null;
}

const q = async (sql) => {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${get("SUPABASE_PROJECT_REF")}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${get("SUPABASE_API_KEY_MANAGEMENT")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    }
  );
  const out = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(out));
  return out;
};

const logs = await q(`
  select pl.id, pl.type, pl.status, pl.created_at, pl.fecha_actividad,
         pl.lead_id, pl.wa_contact_id, pl.propiedad_ref,
         l.full_name lead_name, l.phone lead_phone,
         w.name wa_name, w.phone wa_phone
  from performance_logs pl
  left join leads l on l.id = pl.lead_id
  left join wa_contacts w on w.id = pl.wa_contact_id
  order by pl.created_at desc
`);

const vivos = logs.filter((l) => l.status !== "eliminada");
let sinCliente = 0;
const porCliente = new Map();

for (const log of vivos) {
  let key = null;
  if (log.wa_contact_id) key = normalizePhoneE164(log.wa_phone) ?? `wa:${log.wa_contact_id}`;
  else if (log.lead_id) key = normalizePhoneE164(log.lead_phone) ?? `lead:${log.lead_id}`;
  if (!key) { sinCliente++; continue; }
  if (!porCliente.has(key)) porCliente.set(key, []);
  porCliente.get(key).push(log);
}

console.log(`Actividades vivas: ${vivos.length}`);
console.log(`Sin cliente vinculado (no generan tarjeta): ${sinCliente}`);
console.log(`Tarjetas que se arman: ${porCliente.size}\n`);

for (const [key, items] of porCliente) {
  const ultima = items[0];
  const nombre = ultima.wa_name || ultima.lead_name || key;
  console.log(
    `- ${nombre} [${key}] → etapa ${ultima.type} | ${items.length} activ. | etapas: ${[...new Set(items.map((i) => i.type))].join(", ")}`
  );
}
```

- [ ] **Step 5: Correr la comprobación**

```bash
node scratch/verify-pipeline-cards.mjs
```

Esperado, con los datos actuales: `Sin cliente vinculado` debe dar **20**, y las tarjetas deben salir de los 7 registros restantes. **Confirmar a ojo que ningún cliente aparece dos veces en la lista.** Si aparece repetido, el problema está en la normalización del teléfono y hay que resolverlo antes de seguir.

- [ ] **Step 6: Commit**

```bash
git add lib/tracking/pipeline.ts lib/tracking/types.ts scratch/verify-pipeline-cards.mjs
git commit -m "feat(tracking): logica de armado de tarjetas del pipeline por cliente"
```

---

### Task 3: Leer movimientos y registrar uno nuevo

**Files:**
- Modify: `lib/tracking/queries.ts` (select de `leads` con `phone`, y `getPipelineMoves()`)
- Create: `actions/tracking/movePipelineCard.ts`

**Interfaces:**
- Consumes: `PipelineMove`, `ActivityType` de `lib/tracking/types.ts`.
- Produces:
  - `getPipelineMoves(): Promise<PipelineMove[]>` en `lib/tracking/queries.ts`
  - `movePipelineCard(input: MovePipelineCardInput): Promise<{ success: boolean; error?: string }>` en `actions/tracking/movePipelineCard.ts`, con
    `MovePipelineCardInput = { clientKey: string; leadId: string | null; waContactId: string | null; fromStage: ActivityType | null; toStage: ActivityType }`

- [ ] **Step 1: Ampliar el select de `leads` y agregar `getPipelineMoves`**

En `lib/tracking/queries.ts:17`, el select trae `leads(id, full_name)` **sin teléfono**, y sin él la agrupación por celular no funciona. Reemplazar esa línea por:

```ts
    .select("*, profiles(full_name, email), properties(id, title, address, tokko_id), leads(id, full_name, phone), wa_contacts(id, name, phone)")
```

Y agregar al final del archivo:

```ts
/**
 * Movimientos manuales del tablero. La RLS ya filtra sola: el asesor ve los
 * suyos y el director los de toda la agencia.
 */
export async function getPipelineMoves(): Promise<PipelineMove[]> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("tracking_pipeline_moves")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching pipeline moves", error);
    return [];
  }
  return (data ?? []) as PipelineMove[];
}
```

Y actualizar el import de la primera línea:

```ts
import { PerformanceLog, PipelineMove } from "./types";
```

- [ ] **Step 2: Escribir la server action**

Crear `actions/tracking/movePipelineCard.ts`:

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ActivityType } from "@/lib/tracking/types";

export interface MovePipelineCardInput {
  clientKey: string;
  leadId: string | null;
  waContactId: string | null;
  fromStage: ActivityType | null;
  toStage: ActivityType;
}

/**
 * Registra que alguien movió a mano la tarjeta de un cliente a otra etapa.
 *
 * IMPORTANTE: esto NO crea una actividad. Es justamente lo que permite mover
 * una tarjeta hacia atrás (o hacia una etapa ya recorrida) sin inflar las
 * métricas del Dashboard. Cuando la etapa destino todavía no tiene actividad,
 * el que llama primero guarda la actividad con savePerformanceLog y recién
 * después no necesita llamar acá.
 */
export async function movePipelineCard(
  input: MovePipelineCardInput
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "No autenticado" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("agency_id")
    .eq("id", user.id)
    .single();

  if (!profile?.agency_id) return { success: false, error: "Perfil no encontrado" };

  const { error } = await supabase.from("tracking_pipeline_moves").insert([{
    agency_id: profile.agency_id,
    agent_id: user.id,
    client_key: input.clientKey,
    lead_id: input.leadId,
    wa_contact_id: input.waContactId,
    from_stage: input.fromStage,
    to_stage: input.toStage,
  }]);

  if (error) {
    console.error("Error moving pipeline card:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/director/tracking-performance");
  revalidatePath("/asesor/tracking-performance");

  return { success: true };
}
```

- [ ] **Step 3: Verificar que compila**

```bash
npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 4: Commit**

```bash
git add lib/tracking/queries.ts actions/tracking/movePipelineCard.ts
git commit -m "feat(tracking): leer y registrar movimientos del pipeline"
```

---

### Task 4: Cliente vinculado obligatorio

Sin cliente no hay tarjeta. Este es el único cambio que altera la rutina actual del asesor, y aplica también al botón *Nueva Actividad* de siempre, para que no convivan dos comportamientos del mismo formulario.

**Files:**
- Modify: `components/tracking/PerformanceLogForm.tsx`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `PerformanceLogForm` rechaza el envío si el usuario no eligió cliente.

- [ ] **Step 1: Validar el cliente elegido en el submit**

En `components/tracking/PerformanceLogForm.tsx`, dentro de `onSubmit`, insertar este bloque **inmediatamente después** de la línea `let finalValues = { ...values };` y **antes** de `// Si seleccionó nuevo contacto manual, lo creamos primero`:

```ts
      // Cliente obligatorio: sin cliente no se puede armar la tarjeta del
      // pipeline. Se valida sobre lo que el usuario ELIGIÓ, no sobre el
      // resultado de resolverlo (ver el caso del alta manual más abajo).
      if (clientType === "ninguno") {
        toast.error("Vinculá un cliente: elegí un lead de Tokko, un contacto de WhatsApp, o cargalo como contacto nuevo.");
        setIsSubmitting(false);
        return;
      }
      if (clientType === "tokko" && !values.lead_id) {
        toast.error("Elegí el lead de Tokko de la lista.");
        setIsSubmitting(false);
        return;
      }
      if (clientType === "whatsapp" && !values.wa_contact_id) {
        toast.error("Elegí el contacto de WhatsApp de la lista.");
        setIsSubmitting(false);
        return;
      }
```

- [ ] **Step 2: Avisar cuando el alta manual no puede vincular**

El caso ya existe y **no se rompe**: `createManualContact` puede devolver `wa_contact_id` vacío si el número ya es de otro asesor, y el registro se guarda igual. Solo se agrega el aviso.

Buscar este bloque exacto (es la única aparición de `finalValues.wa_contact_id`):

```ts
        // Puede venir vacío si el lead es de otro asesor y no hay contacto que
        // enlazar; el registro se guarda igual, solo sin el vínculo.
        finalValues.wa_contact_id = result.wa_contact_id ?? null;
```

y reemplazarlo por:

```ts
        // Puede venir vacío si el lead es de otro asesor y no hay contacto que
        // enlazar; el registro se guarda igual, solo sin el vínculo. En ese
        // caso no va a generar tarjeta en el tablero, y hay que avisarlo.
        finalValues.wa_contact_id = result.wa_contact_id ?? null;
        if (!result.wa_contact_id) {
          toast.warning("La actividad se guarda, pero no va a aparecer en el tablero: ese celular ya es de otro asesor.");
        }
```

- [ ] **Step 3: Sacar el "(Opcional)" del bloque de cliente**

El encabezado dice `Activos Vinculados (Opcional)` y ahora el cliente es obligatorio. Reemplazar esta línea exacta:

```tsx
             <h3 className="text-xs uppercase tracking-wider">Activos Vinculados (Opcional)</h3>
```

por:

```tsx
             <h3 className="text-xs uppercase tracking-wider">Propiedad (opcional) y Cliente</h3>
```

Y marcar el campo como obligatorio. Reemplazar esta línea exacta:

```tsx
              <Label className="text-sm font-medium">Vincular Cliente</Label>
```

por:

```tsx
              <Label className="text-sm font-medium">Vincular Cliente *</Label>
```

- [ ] **Step 4: Verificar que compila y que el lint pasa**

```bash
npx tsc --noEmit && npm run lint
```

Esperado: sin errores.

- [ ] **Step 5: Commit**

```bash
git add components/tracking/PerformanceLogForm.tsx
git commit -m "feat(tracking): el cliente vinculado pasa a ser obligatorio al cargar actividad"
```

---

### Task 5: Formulario reutilizable con etapa y cliente fijados

El popup del tablero tiene que ser **el mismo formulario**, no una copia. Se le agregan props opcionales que, cuando vienen, fijan la etapa y el cliente y ocultan esos selectores.

**Files:**
- Modify: `components/tracking/PerformanceLogForm.tsx`

**Interfaces:**
- Consumes: `ActivityType` de `lib/tracking/types.ts`.
- Produces: `PerformanceLogForm` acepta
  `forcedType?: ActivityType`,
  `lockedClient?: { label: string; leadId: string | null; waContactId: string | null }`,
  `defaults?: { propertyId: string | null; propiedadRef: string | null }`.
  Sin esas props se comporta exactamente como hoy.

- [ ] **Step 1: Ampliar las props y los valores por defecto**

Reemplazar el bloque `interface Props { … }` completo (el que hoy tiene solo `onSuccess`, `logToEdit` e `isDirector`) por:

```tsx
interface Props {
  onSuccess: () => void;
  logToEdit?: PerformanceLog | null;
  isDirector?: boolean;
  /** Fija la etapa y oculta el selector. Lo usa el popup del tablero. */
  forcedType?: ActivityType;
  /** Fija el cliente y oculta el selector. Lo usa el popup del tablero. */
  lockedClient?: {
    label: string;
    leadId: string | null;
    waContactId: string | null;
  };
  /** Precarga la propiedad del último registro del cliente (editable). */
  defaults?: { propertyId: string | null; propiedadRef: string | null };
}
```

Reemplazar la línea de la firma `export function PerformanceLogForm({ onSuccess, logToEdit, isDirector = false }: Props) {` por:

```tsx
export function PerformanceLogForm({
  onSuccess,
  logToEdit,
  isDirector = false,
  forcedType,
  lockedClient,
  defaults,
}: Props) {
```

Y ampliar el import existente de `@/lib/tracking/types` para incluir `ActivityType`:

```tsx
import { performanceLogSchema, PerformanceLogFormData, PerformanceLog, ActivityType } from "@/lib/tracking/types";
```

- [ ] **Step 2: Aplicar los valores fijados en los defaults del formulario**

En `defaultValues`, reemplazar la **rama del ternario que corre cuando NO hay `logToEdit`** (la que empieza en `} : {` y hoy fija `type: "prospeccion"`) por:

```tsx
    } : {
      type: forcedType ?? "prospeccion",
      propiedad_ref: defaults?.propiedadRef ?? "",
      property_id: defaults?.propertyId ?? null,
      lead_id: lockedClient?.leadId ?? null,
      wa_contact_id: lockedClient?.waContactId ?? null,
      monto_operacion: 0,
      comision_generada: 0,
      fecha_actividad: new Date().toISOString().split("T")[0],
      metadata: {},
    },
```

- [ ] **Step 3: Fijar el `clientType` cuando el cliente viene bloqueado**

Reemplazar la declaración `const [clientType, setClientType] = useState<...>("ninguno");` por:

```tsx
  const [clientType, setClientType] = useState<"ninguno" | "tokko" | "whatsapp" | "manual">(
    lockedClient ? (lockedClient.waContactId ? "whatsapp" : "tokko") : "ninguno"
  );
```

- [ ] **Step 4: Ocultar el selector de etapa cuando viene fijada**

Reemplazar la sección entera que abre con el comentario `{/* SECCIÓN 1: Actividad a registrar */}` (desde su `<section className="space-y-4">` hasta el `</section>` que la cierra) por:

```tsx
      <section className="space-y-4">
        <header className="flex items-center gap-2 text-accent font-semibold">
           <Briefcase className="w-4 h-4" />
           <h3 className="text-sm uppercase tracking-wider">Actividad a registrar</h3>
        </header>

        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-2">
            <Label htmlFor="type">Tipo de Actividad *</Label>
            {forcedType ? (
              // Viene del tablero: la etapa la decide la columna donde soltaste
              // la tarjeta, así que se muestra pero no se cambia acá.
              <div className="h-12 px-3 flex items-center rounded-md border border-accent/20 bg-accent/5 text-base font-semibold capitalize">
                {forcedType}
              </div>
            ) : (
              <Select onValueChange={(v) => {
                setValue("type", v as any);
                setValue("metadata", {}); // Reset metadata on type change
                setValue("monto_operacion", 0);
                setValue("comision_generada", 0);
              }} value={watch("type")}>
                <SelectTrigger className="h-12 text-base">
                  <SelectValue placeholder="Seleccionar actividad..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="prospeccion">Prospección</SelectItem>
                  <SelectItem value="prelisting">Prelisting</SelectItem>
                  <SelectItem value="prebuying">Prebuying</SelectItem>
                  <SelectItem value="captacion">Captación</SelectItem>
                  <SelectItem value="reserva">Reserva</SelectItem>
                  <SelectItem value="cierre">Cierre</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </section>
```

- [ ] **Step 5: Ocultar el selector de cliente cuando viene bloqueado**

Dentro del recuadro "Vincular Cliente", envolver el `<Select value={clientType} …>` **y** los tres bloques condicionales que le siguen (`{clientType === "tokko" && …}`, `{clientType === "whatsapp" && …}`, `{clientType === "manual" && …}`): si `lockedClient` está presente se muestra el cliente fijo; si no, se muestra todo como hoy.

```tsx
            {lockedClient ? (
              // Viene del tablero: la tarjeta ES el cliente, no se cambia acá.
              <div className="px-3 py-2.5 rounded-md border border-accent/20 bg-accent/5 text-sm font-semibold">
                {lockedClient.label}
              </div>
            ) : (
              <>
                {/* ...acá va exactamente el bloque actual, sin cambios:
                    el <Select value={clientType}> y los tres bloques
                    condicionales de tokko / whatsapp / manual... */}
              </>
            )}
```

Al implementar, mover el bloque existente tal cual dentro del `<>...</>`, sin modificarlo.

- [ ] **Step 6: Verificar que compila y que la vista actual sigue igual**

```bash
npx tsc --noEmit && npm run lint && npm run build
```

Esperado: build exitoso. Como ninguna prop nueva se está pasando todavía, el formulario debe comportarse **exactamente** como antes.

- [ ] **Step 7: Commit**

```bash
git add components/tracking/PerformanceLogForm.tsx
git commit -m "feat(tracking): el formulario acepta etapa y cliente fijados para el tablero"
```

---

### Task 6: Tarjeta y columna del tablero

**Files:**
- Create: `components/tracking/pipeline/PipelineCard.tsx`
- Create: `components/tracking/pipeline/PipelineColumn.tsx`

**Interfaces:**
- Consumes: `PipelineCard` (tipo) y `PIPELINE_STAGES` de `lib/tracking/pipeline.ts`.
- Produces:
  - `PipelineCardItem({ card, onOpen, onMoveTo })` — `onMoveTo: (stage: ActivityType) => void`
  - `PipelineColumnView({ stage, cards, onOpenCard, onMoveCard })`

> Nota de nombres: el componente se llama `PipelineCardItem` (no `PipelineCard`) para no chocar con el **tipo** `PipelineCard` de `lib/tracking/pipeline.ts`.

- [ ] **Step 1: Escribir la tarjeta**

Crear `components/tracking/pipeline/PipelineCard.tsx`:

```tsx
"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MoreVertical, MapPin, Phone, Activity } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { PIPELINE_STAGES, type PipelineCard } from "@/lib/tracking/pipeline";
import type { ActivityType } from "@/lib/tracking/types";
import { formatPhoneInternational } from "@/lib/whatsapp/phone";

interface Props {
  card: PipelineCard;
  onOpen: (card: PipelineCard) => void;
  onMoveTo: (card: PipelineCard, stage: ActivityType) => void;
  showAgent?: boolean;
}

export function PipelineCardItem({ card, onOpen, onMoveTo, showAgent }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.clientKey, data: { type: "PipelineCard", card } });

  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group rounded-xl border border-white/5 bg-card/60 p-3 space-y-2 backdrop-blur-sm transition-all",
        isDragging && "opacity-40"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        {/* El área de arrastre es el cuerpo, no el menú. */}
        <button
          type="button"
          onClick={() => onOpen(card)}
          className="text-left flex-1 min-w-0"
          {...attributes}
          {...listeners}
        >
          <p className="font-bold text-sm truncate">{card.clientName}</p>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Mover a otra etapa"
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 shrink-0"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="text-xs">Mover a…</DropdownMenuLabel>
            {PIPELINE_STAGES.map((stage) => (
              <DropdownMenuItem
                key={stage.id}
                disabled={stage.id === card.stage}
                onClick={() => onMoveTo(card, stage.id)}
              >
                {stage.title}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {card.clientPhone && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Phone className="w-3 h-3 shrink-0" />
          <span className="truncate">{formatPhoneInternational(card.clientPhone) ?? card.clientPhone}</span>
        </p>
      )}

      {card.propertyLabel && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <MapPin className="w-3 h-3 shrink-0" />
          <span className="truncate">{card.propertyLabel}</span>
        </p>
      )}

      <div className="flex items-center justify-between pt-1 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Activity className="w-3 h-3" />
          {card.activityCount} {card.activityCount === 1 ? "actividad" : "actividades"}
        </span>
        {card.lastActivityDate && (
          <span>{new Date(card.lastActivityDate).toLocaleDateString("es-AR")}</span>
        )}
      </div>

      {showAgent && card.agentName && (
        <p className="text-[10px] font-medium text-accent/80 truncate">{card.agentName}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Escribir la columna**

Crear `components/tracking/pipeline/PipelineColumn.tsx`:

```tsx
"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { cn } from "@/lib/utils";
import { PipelineCardItem } from "./PipelineCard";
import type { PipelineCard, PipelineStageDef } from "@/lib/tracking/pipeline";
import type { ActivityType } from "@/lib/tracking/types";

interface Props {
  stage: PipelineStageDef;
  cards: PipelineCard[];
  onOpenCard: (card: PipelineCard) => void;
  onMoveCard: (card: PipelineCard, stage: ActivityType) => void;
  showAgent?: boolean;
}

export function PipelineColumnView({ stage, cards, onOpenCard, onMoveCard, showAgent }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const Icon = stage.icon;

  return (
    <div className="flex flex-col w-[280px] shrink-0 h-full bg-accent/5 rounded-xl border border-accent/10">
      <div className="p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn("p-1.5 rounded-lg text-white", stage.color)}>
            <Icon className="h-4 w-4" />
          </div>
          <h3 className="font-bold text-sm leading-tight">{stage.title}</h3>
        </div>
        <span className="text-xs font-bold bg-muted px-2 py-0.5 rounded-full">{cards.length}</span>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 p-2 space-y-2 overflow-y-auto scrollbar-hide min-h-[300px] transition-colors rounded-b-xl",
          isOver && "bg-accent/10"
        )}
      >
        <SortableContext items={cards.map((c) => c.clientKey)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <PipelineCardItem
              key={card.clientKey}
              card={card}
              onOpen={onOpenCard}
              onMoveTo={onMoveCard}
              showAgent={showAgent}
            />
          ))}
        </SortableContext>

        {cards.length === 0 && (
          <div className="h-full flex items-center justify-center p-8 text-center opacity-30">
            <p className="text-xs font-medium">Sin clientes en esta etapa</p>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verificar que compila**

```bash
npx tsc --noEmit
```

Esperado: sin errores. Si `@dnd-kit/utilities` no estuviera instalado, usar `transform` a mano (`translate3d`) en vez de `CSS.Transform.toString`; **no** instalar paquetes.

- [ ] **Step 4: Commit**

```bash
git add components/tracking/pipeline/PipelineCard.tsx components/tracking/pipeline/PipelineColumn.tsx
git commit -m "feat(tracking): tarjeta y columna de la vista pipeline"
```

---

### Task 7: Popup de etapa

Envuelve el `PerformanceLogForm` con la etapa destino y el cliente ya fijados.

**Files:**
- Create: `components/tracking/pipeline/PipelineStageDialog.tsx`

**Interfaces:**
- Consumes: `PerformanceLogForm` con las props de la Task 5; `PIPELINE_STAGES`.
- Produces: `PipelineStageDialog({ open, onOpenChange, card, targetStage, isDirector, onSaved })`.

- [ ] **Step 1: Escribir el popup**

Crear `components/tracking/pipeline/PipelineStageDialog.tsx`:

```tsx
"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { PerformanceLogForm } from "@/components/tracking/PerformanceLogForm";
import { PIPELINE_STAGES, type PipelineCard } from "@/lib/tracking/pipeline";
import type { ActivityType } from "@/lib/tracking/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: PipelineCard | null;
  targetStage: ActivityType | null;
  isDirector?: boolean;
  onSaved: () => void;
}

export function PipelineStageDialog({ open, onOpenChange, card, targetStage, isDirector, onSaved }: Props) {
  if (!card || !targetStage) return null;

  const stage = PIPELINE_STAGES.find((s) => s.id === targetStage);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[560px] p-0 border-l border-accent/10">
        <div className="h-full flex flex-col">
          <SheetHeader className="p-6 pb-2">
            <SheetTitle className="text-2xl font-bold tracking-tight">
              Pasar a {stage?.title}
            </SheetTitle>
            <SheetDescription className="text-sm text-muted-foreground mt-1">
              {card.clientName} todavía no tiene actividad en esta etapa. Completá los datos
              y queda registrada como cualquier otra actividad.
            </SheetDescription>
          </SheetHeader>

          <Separator className="opacity-50" />

          <ScrollArea className="flex-1 px-6 pt-6">
            <PerformanceLogForm
              isDirector={isDirector}
              forcedType={targetStage}
              lockedClient={{
                label: card.clientName,
                leadId: card.leadId,
                waContactId: card.waContactId,
              }}
              defaults={{ propertyId: card.propertyId, propiedadRef: card.propiedadRef }}
              onSuccess={() => {
                onSaved();
                onOpenChange(false);
              }}
            />
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Verificar que compila**

```bash
npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 3: Commit**

```bash
git add components/tracking/pipeline/PipelineStageDialog.tsx
git commit -m "feat(tracking): popup para cargar la etapa al mover una tarjeta"
```

---

### Task 8: Panel de trazabilidad del cliente

**Files:**
- Create: `components/tracking/pipeline/PipelineClientSheet.tsx`

**Interfaces:**
- Consumes: `PipelineCard`, `PIPELINE_STAGES`, `PipelineMove`.
- Produces: `PipelineClientSheet({ open, onOpenChange, card, moves, onEditLog })` con `onEditLog: (log: PerformanceLog) => void`.

- [ ] **Step 1: Escribir el panel**

Crear `components/tracking/pipeline/PipelineClientSheet.tsx`:

```tsx
"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit2, MapPin, ArrowRight } from "lucide-react";
import { PIPELINE_STAGES, type PipelineCard } from "@/lib/tracking/pipeline";
import type { PerformanceLog, PipelineMove } from "@/lib/tracking/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: PipelineCard | null;
  moves: PipelineMove[];
  onEditLog: (log: PerformanceLog) => void;
}

const tituloEtapa = (id: string) => PIPELINE_STAGES.find((s) => s.id === id)?.title ?? id;

export function PipelineClientSheet({ open, onOpenChange, card, moves, onEditLog }: Props) {
  if (!card) return null;

  // Actividades y movimientos manuales, intercalados por cuándo se registraron.
  const eventos = [
    ...card.logs.map((log) => ({ kind: "log" as const, at: log.created_at, log })),
    ...moves
      .filter((m) => m.client_key === card.clientKey)
      .map((move) => ({ kind: "move" as const, at: move.created_at, move })),
  ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[560px] p-0 border-l border-accent/10">
        <div className="h-full flex flex-col">
          <SheetHeader className="p-6 pb-2">
            <SheetTitle className="text-2xl font-bold tracking-tight">{card.clientName}</SheetTitle>
            <SheetDescription className="text-sm text-muted-foreground mt-1">
              Está en <strong>{tituloEtapa(card.stage)}</strong> · {card.activityCount}{" "}
              {card.activityCount === 1 ? "actividad" : "actividades"}
            </SheetDescription>
          </SheetHeader>

          <Separator className="opacity-50" />

          <ScrollArea className="flex-1 px-6 py-6">
            <div className="space-y-3">
              {eventos.map((ev, i) =>
                ev.kind === "log" ? (
                  <div key={`log-${ev.log.id}`} className="rounded-xl border border-white/5 bg-card/40 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline" className="capitalize">{tituloEtapa(ev.log.type)}</Badge>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(ev.log.fecha_actividad).toLocaleDateString("es-AR")}
                        </span>
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => onEditLog(ev.log)}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>

                    {(ev.log.properties?.title || ev.log.propiedad_ref) && (
                      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate">{ev.log.properties?.title || ev.log.propiedad_ref}</span>
                      </p>
                    )}

                    {ev.log.monto_operacion ? (
                      <p className="text-xs font-semibold">
                        USD {Number(ev.log.monto_operacion).toLocaleString("es-AR")}
                      </p>
                    ) : null}

                    {Object.entries(ev.log.metadata || {}).length > 0 && (
                      <div className="text-[11px] text-muted-foreground space-y-0.5">
                        {Object.entries(ev.log.metadata).map(([k, v]) => (
                          <p key={k}>
                            <span className="capitalize">{k.replace(/_/g, " ")}:</span> {String(v)}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div key={`move-${ev.move.id}`} className="flex items-center gap-2 px-3 py-2 text-[11px] text-muted-foreground">
                    <ArrowRight className="w-3 h-3 shrink-0" />
                    <span>
                      Movido {ev.move.from_stage ? `de ${tituloEtapa(ev.move.from_stage)} ` : ""}
                      a <strong>{tituloEtapa(ev.move.to_stage)}</strong> el{" "}
                      {new Date(ev.move.created_at).toLocaleDateString("es-AR")}
                    </span>
                  </div>
                )
              )}
            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Verificar que compila**

```bash
npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 3: Commit**

```bash
git add components/tracking/pipeline/PipelineClientSheet.tsx
git commit -m "feat(tracking): panel lateral con la trazabilidad del cliente"
```

---

### Task 9: Tablero completo con la regla de movimiento

Es el corazón: decide si mover pide datos o no.

**Files:**
- Create: `components/tracking/pipeline/PipelineBoard.tsx`

**Interfaces:**
- Consumes: `buildPipeline`, `PIPELINE_STAGES` de `lib/tracking/pipeline.ts`; `movePipelineCard`; `PipelineColumnView`; `PipelineCardItem`; `PipelineStageDialog`; `PipelineClientSheet`.
- Produces: `PipelineBoard({ logs, moves, isDirector, cardFilter, onRefresh, onEditLog })`, donde
  `cardFilter: (card: PipelineCard) => boolean` decide qué tarjetas se ven (nunca en qué columna caen).

- [ ] **Step 1: Escribir el tablero**

Crear `components/tracking/pipeline/PipelineBoard.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { AlertCircle } from "lucide-react";
import { PIPELINE_STAGES, buildPipeline, type PipelineCard } from "@/lib/tracking/pipeline";
import type { ActivityType, PerformanceLog, PipelineMove } from "@/lib/tracking/types";
import { movePipelineCard } from "@/actions/tracking/movePipelineCard";
import { PipelineColumnView } from "./PipelineColumn";
import { PipelineCardItem } from "./PipelineCard";
import { PipelineStageDialog } from "./PipelineStageDialog";
import { PipelineClientSheet } from "./PipelineClientSheet";

interface Props {
  /** Actividades ya filtradas por asesor, SIN filtrar por fecha/tipo/estado. */
  logs: PerformanceLog[];
  moves: PipelineMove[];
  isDirector?: boolean;
  /** Filtra qué tarjetas se ven, nunca en qué columna caen. */
  cardFilter: (card: PipelineCard) => boolean;
  onRefresh: () => void;
  onEditLog: (log: PerformanceLog) => void;
}

export function PipelineBoard({ logs, moves, isDirector, cardFilter, onRefresh, onEditLog }: Props) {
  const [activeCard, setActiveCard] = useState<PipelineCard | null>(null);
  const [openCard, setOpenCard] = useState<PipelineCard | null>(null);
  const [pending, setPending] = useState<{ card: PipelineCard; stage: ActivityType } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const { cards, sinCliente } = useMemo(() => buildPipeline(logs, moves), [logs, moves]);
  const visibles = useMemo(() => cards.filter(cardFilter), [cards, cardFilter]);

  /**
   * LA REGLA (spec 4.4). Vale igual para adelante que para atrás:
   * - Si la etapa destino YA tiene actividad de ese cliente → solo se registra
   *   el movimiento. No crea actividad, no toca métricas.
   * - Si NO la tiene → se abre el popup con los campos de esa etapa.
   */
  const resolverMovimiento = async (card: PipelineCard, destino: ActivityType) => {
    if (destino === card.stage) return;

    if (!card.stagesConActividad.includes(destino)) {
      setPending({ card, stage: destino });
      return;
    }

    const res = await movePipelineCard({
      clientKey: card.clientKey,
      leadId: card.leadId,
      waContactId: card.waContactId,
      fromStage: card.stage,
      toStage: destino,
    });

    if (!res.success) {
      // La tarjeta vuelve sola a su lugar porque la posición se recalcula
      // desde los datos: al no refrescar, nada cambió.
      toast.error(res.error || "No se pudo mover la tarjeta");
      return;
    }

    toast.success(`${card.clientName} pasó a ${PIPELINE_STAGES.find((s) => s.id === destino)?.title}`);
    onRefresh();
  };

  const onDragStart = (e: DragStartEvent) => {
    if (e.active.data.current?.type === "PipelineCard") {
      setActiveCard(e.active.data.current.card as PipelineCard);
    }
  };

  const onDragEnd = async (e: DragEndEvent) => {
    const card = activeCard;
    setActiveCard(null);
    if (!card || !e.over) return;

    const overId = String(e.over.id);
    const destino = PIPELINE_STAGES.some((s) => s.id === overId)
      ? (overId as ActivityType)
      : cards.find((c) => c.clientKey === overId)?.stage;

    if (destino) await resolverMovimiento(card, destino);
  };

  return (
    <div className="space-y-4">
      {sinCliente > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-muted-foreground">
            <strong className="text-foreground">
              {sinCliente} {sinCliente === 1 ? "actividad" : "actividades"} sin cliente vinculado
            </strong>{" "}
            {sinCliente === 1 ? "no aparece" : "no aparecen"} en el tablero. Se siguen viendo en la
            vista Lista: editalas y vinculales un cliente para que armen su tarjeta.
          </p>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="overflow-x-auto pb-4">
          <div className="inline-flex gap-3 min-h-[500px]">
            {PIPELINE_STAGES.map((stage) => (
              <PipelineColumnView
                key={stage.id}
                stage={stage}
                cards={visibles.filter((c) => c.stage === stage.id)}
                onOpenCard={setOpenCard}
                onMoveCard={resolverMovimiento}
                showAgent={isDirector}
              />
            ))}
          </div>
        </div>

        {typeof document !== "undefined" &&
          createPortal(
            <DragOverlay>
              {activeCard ? (
                <div className="w-[280px]">
                  <PipelineCardItem card={activeCard} onOpen={() => {}} onMoveTo={() => {}} />
                </div>
              ) : null}
            </DragOverlay>,
            document.body
          )}
      </DndContext>

      <PipelineStageDialog
        open={!!pending}
        onOpenChange={(open) => { if (!open) setPending(null); }}
        card={pending?.card ?? null}
        targetStage={pending?.stage ?? null}
        isDirector={isDirector}
        onSaved={() => { setPending(null); onRefresh(); }}
      />

      <PipelineClientSheet
        open={!!openCard}
        onOpenChange={(open) => { if (!open) setOpenCard(null); }}
        card={openCard}
        moves={moves}
        onEditLog={(log) => { setOpenCard(null); onEditLog(log); }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verificar que compila**

```bash
npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 3: Commit**

```bash
git add components/tracking/pipeline/PipelineBoard.tsx
git commit -m "feat(tracking): tablero del pipeline con la regla de movimiento"
```

---

### Task 10: Integrar la vista en Tracking Performance

**Files:**
- Modify: `components/tracking/TrackingPerformanceView.tsx`

**Interfaces:**
- Consumes: `PipelineBoard`, `getPipelineMoves`.
- Produces: la solapa *Actividad* con switch Lista | Pipeline.

- [ ] **Step 1: Agregar imports y estado**

En `components/tracking/TrackingPerformanceView.tsx`, agregar a los imports:

```tsx
import { PipelineBoard } from "@/components/tracking/pipeline/PipelineBoard";
import { getPerformanceLogs, getPipelineMoves } from "@/lib/tracking/queries";
import { PipelineMove } from "@/lib/tracking/types";
import { LayoutGrid, List } from "lucide-react";
import type { PipelineCard } from "@/lib/tracking/pipeline";
```

(y quitar el import viejo `import { getPerformanceLogs } from "@/lib/tracking/queries";`, que queda reemplazado por el nuevo).

Junto a los estados existentes, justo después de `const [agencyConfig, setAgencyConfig] = useState<AgencyPerformanceConfig | null>(null);`, agregar:

```tsx
  const [viewMode, setViewMode] = useState<"lista" | "pipeline">("lista");
  const [moves, setMoves] = useState<PipelineMove[]>([]);
```

- [ ] **Step 2: Traer los movimientos junto con los logs**

Reemplazar el `const fetchLogs = useCallback(...)` completo por:

```tsx
  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const [data, movesData] = await Promise.all([getPerformanceLogs(), getPipelineMoves()]);
      setLogs(data);
      setMoves(movesData);
    } catch (error) {
      console.error("Error fetching logs:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);
```

- [ ] **Step 3: Preparar los datos del tablero**

Justo después del cierre del `const filteredLogs = logs.filter(...)`, agregar:

```tsx
  // El tablero recibe los logs filtrados SOLO por asesor: la etapa de cada
  // tarjeta se calcula siempre con todo el historial del cliente. Si el rango
  // de fechas recortara el historial, un cliente que cerró en mayo aparecería
  // parado en prospección al filtrar julio.
  const pipelineLogs = useMemo(
    () => logs.filter((log) => advisorFilter === "all" || log.agent_id === advisorFilter),
    [logs, advisorFilter]
  );

  // El filtro decide QUÉ TARJETAS ves, nunca en qué columna caen.
  const cardFilter = useCallback(
    (card: PipelineCard) => {
      const matchesDate =
        (!fromParam && !toParam) ||
        card.activityDates.some((d) => {
          const day = String(d).slice(0, 10);
          return (!fromParam || day >= fromParam) && (!toParam || day <= toParam);
        });

      const term = search.toLowerCase();
      const matchesSearch =
        !search ||
        card.clientName.toLowerCase().includes(term) ||
        (card.clientPhone ?? "").includes(term) ||
        (card.propertyLabel ?? "").toLowerCase().includes(term);

      return matchesDate && matchesSearch;
    },
    [fromParam, toParam, search]
  );
```

- [ ] **Step 4: Ocultar en el tablero los filtros que no aplican**

El filtro de tipo de actividad no puede aplicarse en el tablero (las columnas *son* los tipos: filtrar dejaría el tablero con una sola columna), y el de estado tampoco (la etapa siempre se calcula sobre las no eliminadas).

Envolver la fila 1 de filtros en una condición. Es el `div` que sigue al comentario `{/* Row 1: Activity type tabs + Status tabs */}` y contiene los botones de tipo y el bloque `{isDirector && (...)}` de estado. Reemplazar su línea de apertura por:

```tsx
              {viewMode === "lista" && (
              <div className="flex flex-col lg:flex-row lg:items-center gap-2 overflow-x-auto">
```

y cerrar ese mismo `div` (el que está justo antes del comentario `{/* Row 2: Advisor filter + Search */}`) con:

```tsx
              </div>
              )}
```

- [ ] **Step 5: Agregar el switch Lista | Pipeline**

Dentro del `<div className="flex items-center gap-2 sm:ml-auto">`, **antes** del `<DatePeriodFilter />`, insertar:

```tsx
                  <div className="flex bg-muted/30 p-1 rounded-xl border border-white/5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setViewMode("lista")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${viewMode === "lista" ? "bg-accent text-white shadow-lg shadow-accent/20" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      <List className="w-3.5 h-3.5" />
                      Lista
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("pipeline")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${viewMode === "pipeline" ? "bg-accent text-white shadow-lg shadow-accent/20" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      Pipeline
                    </button>
                  </div>
```

- [ ] **Step 6: Renderizar el tablero o la lista**

Reemplazar el bloque de render de resultados (el ternario `{isLoading ? (...) : (<PerformanceHistoryList ... />)}` que está dentro de `<TabsContent value="actividad">`, después del `</Card>`) por:

```tsx
          {isLoading ? (
            <div className="h-64 flex flex-col items-center justify-center gap-4 text-muted-foreground border-2 border-dashed border-accent/10 rounded-[2rem] bg-accent/5">
               <Loader2 className="w-10 h-10 animate-spin text-accent/50" />
               <p className="font-medium tracking-wide">Analizando historial de performance...</p>
            </div>
          ) : viewMode === "pipeline" ? (
            <PipelineBoard
              logs={pipelineLogs}
              moves={moves}
              isDirector={isDirector}
              cardFilter={cardFilter}
              onRefresh={fetchLogs}
              onEditLog={(log) => {
                setLogToEdit(log);
                setIsDrawerOpen(true);
              }}
            />
          ) : (
            <PerformanceHistoryList 
              logs={filteredLogs} 
              onRefresh={fetchLogs} 
              isDirector={isDirector}
              onEdit={(log) => {
                setLogToEdit(log);
                setIsDrawerOpen(true);
              }}
              onDelete={(log) => {
                setLogToDelete(log);
                setDeleteReason("");
              }}
            />
          )}
```

- [ ] **Step 7: Verificar que compila, lint y build**

```bash
npx tsc --noEmit && npm run lint && npm run build
```

Esperado: build exitoso.

- [ ] **Step 8: Commit**

```bash
git add components/tracking/TrackingPerformanceView.tsx
git commit -m "feat(tracking): switch Lista/Pipeline en la solapa Actividad"
```

---

### Task 11: Prueba en local y documentación

**Files:**
- Modify: `docs/interno/LOGICA-PRISMA.md`
- Modify: `docs/interno/TECNICO-PRISMA.md`
- Modify: `docs/compartible/estandarizada/FUNCIONAL-ASESOR-PRISMA.md`
- Modify: `docs/compartible/estandarizada/FUNCIONAL-DIRECTOR-PRISMA.md`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: la funcionalidad verificada a mano y documentada.

- [ ] **Step 1: Levantar la app**

```bash
npm run dev
```

Pasarle a Leonardo el link `http://localhost:3000/asesor/tracking-performance` (y el de `/director/...`). **No pedirle que la levante él.**

- [ ] **Step 2: Recorrer los 10 casos de prueba del spec**

Del spec, sección 6. Marcar cada uno:

- [ ] 1. Cliente con actividades en Tokko y en WhatsApp con el mismo celular → aparece **una** tarjeta.
- [ ] 2. Mover hacia adelante a una etapa nueva → pide los campos de esa etapa y el registro aparece en la vista Lista.
- [ ] 3. Mover hacia atrás → no pide nada, la tarjeta queda ahí, y el Dashboard **no cambia de números** (anotar los KPIs antes y después).
- [ ] 4. Volver a avanzar a una etapa ya recorrida → no pide nada.
- [ ] 5. Cambiar la propiedad al avanzar → queda reflejado en el panel de trazabilidad.
- [ ] 6. Mover desde el menú "Mover a…" en pantalla de celular (achicar la ventana del navegador).
- [ ] 7. Un asesor no ve ni mueve clientes de otro asesor.
- [ ] 8. Cortar la red (DevTools → Network → Offline) al mover → aparece el error y la tarjeta no queda movida.
- [ ] 9. Filtrar por fechas un rango corto → las tarjetas que quedan siguen en su columna correcta, no retroceden.
- [ ] 10. Alta manual con un celular que ya es de otro asesor → se guarda igual, con el aviso, sin romperse.

Además, confirmar que **nada se rompió**: la vista Lista, sus filtros, *Nueva Actividad*, editar y eliminar con motivo, y las solapas *Objetivos* y *Configuración IA* siguen funcionando igual.

- [ ] **Step 3: Actualizar los 4 documentos**

- `docs/interno/LOGICA-PRISMA.md` → en la sección de Tracking Performance (cerca de la línea 2038), agregar la vista Pipeline: la regla de movimiento, la agrupación por celular, y por qué mover hacia atrás no crea actividad.
- `docs/interno/TECNICO-PRISMA.md` → en la lista de tablas (cerca de la línea 140), agregar `tracking_pipeline_moves` con su propósito y su RLS.
- `docs/compartible/estandarizada/FUNCIONAL-ASESOR-PRISMA.md` → cómo usar el tablero, en lenguaje simple y sin tecnicismos: arrastrar o usar "Mover a…", cuándo pide datos y cuándo no, y por qué ahora hay que vincular siempre un cliente.
- `docs/compartible/estandarizada/FUNCIONAL-DIRECTOR-PRISMA.md` → lo mismo, más el filtro por asesor y la lectura del tablero como foto del equipo.

- [ ] **Step 4: Commit**

```bash
git add docs/
git commit -m "docs(tracking): documentar la vista Pipeline en los 4 documentos"
```

- [ ] **Step 5: Merge solo con OK de Leonardo**

No mergear a `main` sin su OK explícito.

---

## Auto-revisión del plan

**Cobertura del spec:**

| Sección del spec | Task |
|---|---|
| 4.1 Ubicación (switch Lista \| Pipeline) | 10 |
| 4.1.1 Comportamiento de los filtros | 10 (steps 3-5) |
| 4.2 Identidad por celular normalizado | 2 |
| 4.3 En qué columna cae (evento más reciente, eliminadas fuera) | 2 |
| 4.4 La regla de movimiento | 9 (step 1) |
| 4.5 Arrastrar + menú "Mover a…" | 6 y 9 |
| 4.6 Persistencia del movimiento | 1 y 3 |
| 4.7 Panel de trazabilidad | 8 |
| 4.8 Permisos | 1 (RLS) y 10 (filtro por asesor) |
| 4.9 Cliente obligatorio + caso borde del alta manual | 4 |
| 4.10 Manejo de errores | 9 (step 1) y 11 (caso 8) |
| 5 Qué no cambia | verificado en 11 (step 2) |
| 6 Verificación | 11 |
| 7 Documentación | 11 (step 3) |

Sin huecos.

**Consistencia de nombres verificada:** `buildPipeline` devuelve `{ cards, sinCliente }` y así se consume en la Task 9. `PipelineCardItem` es el componente y `PipelineCard` el tipo (aclarado en la Task 6). `stagesConActividad` se define en la Task 2 y se usa en la Task 9. `movePipelineCard` devuelve `{ success, error }` en la Task 3 y así se lee en la Task 9. `getPipelineMoves` se define en la Task 3 y se importa en la Task 10.

**Escaneo previo (2026-07-28, antes de ejecutar):** se corrigieron tres cosas en este plan.

1. Se eliminó `stageIndex()`: no lo consumía ninguna task. La regla de movimiento no compara posiciones (pregunta si la etapa destino ya tiene actividad), así que el orden de `PIPELINE_STAGES` solo se usa para ordenar las columnas. Código muerto, fuera por YAGNI.
2. El bloque *Interfaces* de la Task 9 no listaba `cardFilter`, que sí está en las props del componente. Corregido.
3. Las Tasks 4 y 5 modifican el mismo archivo (`PerformanceLogForm.tsx`) y la 4 inserta líneas antes de los puntos que la 5 referencia: los números de línea se corrían. Se reemplazaron por anclas de texto exactas.

**Sobre los tests:** este plan no agrega tests automatizados porque el repo no tiene framework (ver Global Constraints). Es una decisión explícita y consentida, no un descuido. Los revisores reciben esa restricción textual: la verificación de este plan es typecheck + lint + build + comprobación contra datos reales + prueba manual.
