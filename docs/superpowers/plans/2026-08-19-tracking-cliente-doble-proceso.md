# Tracking Performance: un cliente, dos procesos — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un mismo cliente pueda tener dos procesos en paralelo en el tablero de Tracking Performance —Compra y Venta— con una tarjeta independiente cada uno, de modo que cargarle un Prelisting a un comprador no le saque la tarjeta de Prebuying.

**Architecture:** Se agrega una columna `proceso` (`compra` | `venta`, nullable) a `performance_logs` y a `tracking_pipeline_moves`. La unidad del tablero deja de ser el cliente y pasa a ser el par (cliente, proceso): `buildPipeline` agrupa por `cardKey = clientKey::proceso`. Un vocabulario nuevo y puro en `lib/tracking/proceso.ts` (sin dependencias de UI) concentra las tres reglas: qué etapas fijan el proceso, qué etapas admite cada proceso, y cómo se arma la clave de tarjeta. Todo lo demás —métricas, objetivos, informe semanal— queda intacto porque calcula por `type`, nunca por cliente.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Supabase (Postgres + RLS), react-hook-form + zod v3, @dnd-kit, Tailwind, shadcn/ui, vitest.

**Spec:** `docs/superpowers/specs/2026-08-19-tracking-cliente-doble-proceso-design.md`

## Global Constraints

- **Worktree:** todo el trabajo va en `C:\Users\LENOVO\Desktop\CODE\Antigravity - Apps\wt-tracking-doble-actividad`, rama `feat/tracking-cliente-doble-proceso` (creada desde `main`).
- **Nunca `git add -A`.** Se agregan sólo los archivos que nombra cada tarea.
- **Valores del proceso:** exactamente `'compra'` y `'venta'` en minúscula, en base y en TypeScript. `NULL` / `null` significa "sin definir".
- **Etapas (`ActivityType`), sin cambios:** `'prospeccion' | 'prelisting' | 'prebuying' | 'captacion' | 'reserva' | 'cierre'`.
- **Regla fija:** `prelisting` y `captacion` ⇒ `venta`; `prebuying` ⇒ `compra`. `prospeccion`, `reserva` y `cierre` los elige el asesor.
- **Orden de despliegue:** primero la migración, después el código. La columna es aditiva y el código viejo la ignora; al revés rompe (`savePerformanceLog` escribiría una columna inexistente).
- **Base de datos:** única, compartida con producción. La migración se aplica por Management API con `SUPABASE_API_KEY_MANAGEMENT` y `SUPABASE_PROJECT_REF` del `.env` del repo principal. **Requiere OK explícito de Leonardo antes de ejecutarse.**
- **Cuenta de prueba:** PRISMAIA - VAKDOR. **Nunca** Central Real Estate Argentina (es del cliente real), **nunca** entrar como un asesor real.
- **Tests:** `npm test` corre `vitest run` sobre `lib/**/*.test.ts`. Antes de correrlo por primera vez en el worktree hace falta `npm install`.
- **Idioma:** todo el texto de interfaz y los comentarios de código, en español rioplatense. Los comentarios explican *por qué*, no *qué*.

---

### Task 1: La columna `proceso` en base, con su backfill

**Files:**
- Create: `supabase/migrations/20260819140000_add_proceso_a_tracking.sql`

**Interfaces:**
- Consumes: nada.
- Produces: `public.performance_logs.proceso text NULL`, `public.tracking_pipeline_moves.proceso text NULL`, constraint `performance_logs_proceso_coherente`, constraint `tracking_pipeline_moves_proceso_check`, índice `performance_logs_proceso_idx`.

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/20260819140000_add_proceso_a_tracking.sql` con exactamente esto:

```sql
-- ============================================================================
-- Un cliente puede estar en dos procesos a la vez: comprarnos y vendernos.
--
-- Hasta acá el tablero armaba UNA tarjeta por cliente y la ubicaba en la etapa
-- del último evento, así que cargarle un Prelisting a un comprador le sacaba la
-- tarjeta de Prebuying. `proceso` es lo que permite partir esa tarjeta en dos.
--
-- NULLABLE a propósito: las filas históricas ambiguas (una prospección suelta,
-- un cierre sin contexto) no tienen forma honesta de resolverse por regla, y
-- obligar en base sería inventarles un lado. NULL = "sin definir", y el asesor
-- lo resuelve desde la app. Toda alta nueva sí lo trae: lo exige el formulario
-- y lo valida savePerformanceLog.
-- ============================================================================

ALTER TABLE public.performance_logs
  ADD COLUMN IF NOT EXISTS proceso text;

ALTER TABLE public.tracking_pipeline_moves
  ADD COLUMN IF NOT EXISTS proceso text;

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Escribe SÓLO la columna nueva: ningún `type` cambia, ningún monto se mueve,
-- ningún `status` se toca. Alcanza también a las filas 'eliminada', para que el
-- director que filtra por Eliminadas las siga viendo coherentes.

-- 1 y 2. Las etapas que por definición ya dicen de qué lado del negocio están.
UPDATE public.performance_logs
   SET proceso = 'venta'
 WHERE proceso IS NULL
   AND type IN ('prelisting', 'captacion');

UPDATE public.performance_logs
   SET proceso = 'compra'
 WHERE proceso IS NULL
   AND type = 'prebuying';

-- 3. Las ambiguas (prospeccion/reserva/cierre) heredan el lado de su cliente,
--    pero SÓLO si ese cliente quedó con un único lado tras los pasos 1 y 2.
--    Si tiene los dos, o no tiene ninguno, queda NULL y lo define una persona.
--
--    Ojo: acá el cliente se agrupa por uuid (wa_contact_id / lead_id), mientras
--    que el tablero lo agrupa por teléfono normalizado. Son criterios distintos,
--    y el de acá es más fino: a lo sumo resuelve de menos y deja algo en NULL,
--    nunca de más. Ese es el lado seguro para equivocarse.
WITH lado_unico AS (
  SELECT coalesce(wa_contact_id::text, lead_id::text) AS ck,
         min(proceso)                                 AS proceso
    FROM public.performance_logs
   WHERE proceso IS NOT NULL
     AND coalesce(wa_contact_id::text, lead_id::text) IS NOT NULL
   GROUP BY 1
  HAVING count(DISTINCT proceso) = 1
)
UPDATE public.performance_logs pl
   SET proceso = lado_unico.proceso
  FROM lado_unico
 WHERE pl.proceso IS NULL
   AND coalesce(pl.wa_contact_id::text, pl.lead_id::text) = lado_unico.ck;

-- 4. Los movimientos manuales del tablero heredan con el mismo criterio. Si no
--    se resuelven quedan en NULL y siguen aplicando a la tarjeta "Sin definir",
--    que es exactamente donde van a estar sus actividades.
WITH lado_unico AS (
  SELECT coalesce(wa_contact_id::text, lead_id::text) AS ck,
         min(proceso)                                 AS proceso
    FROM public.performance_logs
   WHERE proceso IS NOT NULL
     AND coalesce(wa_contact_id::text, lead_id::text) IS NOT NULL
   GROUP BY 1
  HAVING count(DISTINCT proceso) = 1
)
UPDATE public.tracking_pipeline_moves m
   SET proceso = lado_unico.proceso
  FROM lado_unico
 WHERE m.proceso IS NULL
   AND coalesce(m.wa_contact_id::text, m.lead_id::text) = lado_unico.ck;

-- ── Coherencia garantizada en base ──────────────────────────────────────────
-- Un "Prelisting de compra" no es un caso de uso raro: es un registro que se
-- contradice a sí mismo. Que no pueda existir ni entrando por SQL directo.
ALTER TABLE public.performance_logs
  DROP CONSTRAINT IF EXISTS performance_logs_proceso_coherente;

ALTER TABLE public.performance_logs
  ADD CONSTRAINT performance_logs_proceso_coherente CHECK (
    (proceso IS NULL OR proceso IN ('compra', 'venta'))
    AND (
      proceso IS NULL
      OR (type IN ('prelisting', 'captacion') AND proceso = 'venta')
      OR (type = 'prebuying'                  AND proceso = 'compra')
      OR type IN ('prospeccion', 'reserva', 'cierre')
    )
  );

ALTER TABLE public.tracking_pipeline_moves
  DROP CONSTRAINT IF EXISTS tracking_pipeline_moves_proceso_check;

ALTER TABLE public.tracking_pipeline_moves
  ADD CONSTRAINT tracking_pipeline_moves_proceso_check
  CHECK (proceso IS NULL OR proceso IN ('compra', 'venta'));

-- ── Índice ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS performance_logs_proceso_idx
  ON public.performance_logs (agency_id, proceso);

-- RLS: sin cambios. Ninguna política de estas dos tablas nombra columnas, así
-- que agregar una no las toca.
```

- [ ] **Step 2: Pedirle el OK a Leonardo antes de aplicarla**

La base es una sola y es la de producción. Mostrarle la migración y esperar su OK explícito. No aplicar nada hasta tenerlo.

- [ ] **Step 3: Aplicar la migración por Management API**

Crear el runner fuera del repo, en `C:/Users/LENOVO/AppData/Local/Temp/claude/.../scratchpad/q.mjs` (cualquier carpeta temporal sirve; lo importante es que no quede versionado):

```js
import fs from 'node:fs';
const env = Object.fromEntries(
  fs.readFileSync('.env','utf8').split(/\r?\n/)
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,'')]; })
);
const sql = fs.readFileSync(process.argv[2],'utf8');
const r = await fetch(`https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/database/query`, {
  method:'POST',
  headers:{ Authorization:`Bearer ${env.SUPABASE_API_KEY_MANAGEMENT}`, 'Content-Type':'application/json' },
  body: JSON.stringify({ query: sql })
});
const txt = await r.text();
if(!r.ok){ console.error('HTTP', r.status, txt); process.exit(1); }
console.log(JSON.stringify(JSON.parse(txt), null, 2));
```

El `.env` con las claves vive en el repo principal (`PRISMA-SYSTEM`), no en el worktree, así que el runner se ejecuta parado ahí:

Run: `cd "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/PRISMA-SYSTEM" && node "<scratchpad>/q.mjs" "C:/Users/LENOVO/Desktop/CODE/Antigravity - Apps/wt-tracking-doble-actividad/supabase/migrations/20260819140000_add_proceso_a_tracking.sql"`  
(reemplazando `<scratchpad>` por la carpeta temporal donde quedó el runner)

Expected: `[]` (los DDL no devuelven filas). Si devuelve HTTP 4xx, leer el mensaje y corregir la migración antes de seguir.

- [ ] **Step 4: Verificar el resultado del backfill contra los números esperados**

Correr esta consulta con el mismo runner:

```sql
select coalesce(proceso,'SIN DEFINIR') as proceso,
       type,
       count(*) filter (where coalesce(status,'original') <> 'eliminada') as vivas,
       count(*) as total
  from public.performance_logs
 group by 1,2
 order by 1,2;
```

Expected (medido 19-ago-2026, 33 filas totales / 26 vivas):
- `compra` / `prebuying`: 3 vivas.
- `venta` / `prelisting` + `captacion`: 3 vivas (más las eliminadas).
- Alguna fila ambigua resuelta a `compra` o `venta` por herencia.
- El resto en `SIN DEFINIR`, todas de tipo `prospeccion` / `reserva` / `cierre`.
- **Cero** filas donde `proceso = 'compra'` con `type IN ('prelisting','captacion')` o `proceso = 'venta'` con `type = 'prebuying'` — si el CHECK se creó, esto es imposible.

Y que el CHECK muerde de verdad:

```sql
-- Debe FALLAR con "violates check constraint performance_logs_proceso_coherente".
update public.performance_logs set proceso = 'compra'
 where type = 'prelisting' and id = (select id from public.performance_logs where type='prelisting' limit 1);
```

Expected: error de constraint. Si pasa sin error, el CHECK no quedó creado: revisar.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260819140000_add_proceso_a_tracking.sql
git commit -m "feat(tracking): agrega la columna proceso (compra/venta) y su backfill"
```

---

### Task 2: El vocabulario del proceso (`lib/tracking/proceso.ts`)

Un archivo nuevo, puro y sin dependencias de UI, con las tres reglas del proceso. Va aparte de `pipeline.ts` a propósito: `pipeline.ts` importa iconos de `lucide-react`, y estas constantes las necesitan también los server actions, que no tienen por qué arrastrar la librería de iconos.

**Files:**
- Create: `lib/tracking/proceso.ts`
- Create: `lib/tracking/proceso.test.ts`
- Modify: `lib/tracking/types.ts`

**Interfaces:**
- Consumes: `ActivityType` de `lib/tracking/types.ts`.
- Produces:
  - `type ProcesoNegocio = 'compra' | 'venta'`
  - `PROCESO_FIJO: Partial<Record<ActivityType, ProcesoNegocio>>`
  - `ETAPAS_POR_PROCESO: Record<ProcesoNegocio, ActivityType[]>`
  - `etapasPermitidas(proceso: ProcesoNegocio | null): ActivityType[]`
  - `cardKeyDe(clientKey: string, proceso: ProcesoNegocio | null): string`
  - `badgeDeProceso(proceso: ProcesoNegocio | null): { label: string; className: string }`
  - `labelDeProceso(proceso: ProcesoNegocio | null): string`
  - `PerformanceLog.proceso: ProcesoNegocio | null` y `PipelineMove.proceso: ProcesoNegocio | null`
  - `performanceLogSchema` con el campo `proceso` obligatorio

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/tracking/proceso.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  PROCESO_FIJO,
  etapasPermitidas,
  cardKeyDe,
  badgeDeProceso,
} from "./proceso";

describe("PROCESO_FIJO", () => {
  it("fija el lado en las tres etapas que ya lo definen", () => {
    expect(PROCESO_FIJO.prelisting).toBe("venta");
    expect(PROCESO_FIJO.captacion).toBe("venta");
    expect(PROCESO_FIJO.prebuying).toBe("compra");
  });

  it("deja libres las etapas donde el asesor tiene que elegir", () => {
    expect(PROCESO_FIJO.prospeccion).toBeUndefined();
    expect(PROCESO_FIJO.reserva).toBeUndefined();
    expect(PROCESO_FIJO.cierre).toBeUndefined();
  });
});

describe("etapasPermitidas", () => {
  it("una tarjeta de compra no entra en las columnas del vendedor", () => {
    const etapas = etapasPermitidas("compra");
    expect(etapas).toContain("prebuying");
    expect(etapas).not.toContain("prelisting");
    expect(etapas).not.toContain("captacion");
  });

  it("una tarjeta de venta no entra en la columna del comprador", () => {
    const etapas = etapasPermitidas("venta");
    expect(etapas).toContain("prelisting");
    expect(etapas).toContain("captacion");
    expect(etapas).not.toContain("prebuying");
  });

  it("prospeccion, reserva y cierre son de los dos lados", () => {
    for (const proceso of ["compra", "venta"] as const) {
      const etapas = etapasPermitidas(proceso);
      expect(etapas).toContain("prospeccion");
      expect(etapas).toContain("reserva");
      expect(etapas).toContain("cierre");
    }
  });

  it("sin proceso definido no bloquea nada, como el tablero de hoy", () => {
    expect(etapasPermitidas(null)).toHaveLength(6);
  });
});

describe("cardKeyDe", () => {
  it("separa los dos procesos del mismo cliente", () => {
    expect(cardKeyDe("5491155555555", "compra")).not.toBe(
      cardKeyDe("5491155555555", "venta")
    );
  });

  it("agrupa lo que no tiene proceso en una clave propia y estable", () => {
    expect(cardKeyDe("5491155555555", null)).toBe("5491155555555::sin-definir");
  });
});

describe("badgeDeProceso", () => {
  it("le pone nombre a los tres estados posibles", () => {
    expect(badgeDeProceso("compra").label).toBe("COMPRA");
    expect(badgeDeProceso("venta").label).toBe("VENTA");
    expect(badgeDeProceso(null).label).toBe("SIN DEFINIR");
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run lib/tracking/proceso.test.ts`
Expected: FAIL — `Failed to resolve import "./proceso"`.

(Si es la primera vez que se corre algo en el worktree, antes: `npm install`.)

- [ ] **Step 3: Escribir `lib/tracking/proceso.ts`**

```ts
import type { ActivityType } from "./types";

/**
 * De qué lado del negocio está el cliente en una actividad determinada.
 *
 * Existe porque una misma persona puede estar comprándonos y vendiéndonos a la
 * vez, y el tablero necesita poder seguirle los dos procesos por separado sin
 * que uno le tape al otro.
 */
export type ProcesoNegocio = "compra" | "venta";

/**
 * Las tres etapas donde el proceso NO se elige: ya lo dice la etapa.
 * Un prelisting o una captación son del lado del vendedor por definición, y un
 * prebuying del comprador. Dejarlas elegibles sólo habilitaría cargar un
 * registro que se contradice a sí mismo.
 */
export const PROCESO_FIJO: Partial<Record<ActivityType, ProcesoNegocio>> = {
  prelisting: "venta",
  captacion: "venta",
  prebuying: "compra",
};

/**
 * Las columnas del tablero que admite cada proceso. Prospección, reserva y
 * cierre son de los dos lados; el resto es de uno solo.
 */
export const ETAPAS_POR_PROCESO: Record<ProcesoNegocio, ActivityType[]> = {
  venta: ["prospeccion", "prelisting", "captacion", "reserva", "cierre"],
  compra: ["prospeccion", "prebuying", "reserva", "cierre"],
};

const TODAS_LAS_ETAPAS: ActivityType[] = [
  "prospeccion",
  "prelisting",
  "prebuying",
  "captacion",
  "reserva",
  "cierre",
];

/**
 * A dónde puede moverse una tarjeta. Las tarjetas sin proceso definido (las
 * históricas) no se bloquean: siguen comportándose como el tablero de antes.
 */
export function etapasPermitidas(proceso: ProcesoNegocio | null): ActivityType[] {
  return proceso ? ETAPAS_POR_PROCESO[proceso] : TODAS_LAS_ETAPAS;
}

/**
 * La clave de una tarjeta del tablero. La unidad ya no es el cliente sino el
 * par (cliente, proceso): por eso Matías comprador y Matías vendedor son dos
 * tarjetas distintas aunque sean la misma persona.
 */
export function cardKeyDe(clientKey: string, proceso: ProcesoNegocio | null): string {
  return `${clientKey}::${proceso ?? "sin-definir"}`;
}

export function labelDeProceso(proceso: ProcesoNegocio | null): string {
  if (proceso === "compra") return "Compra";
  if (proceso === "venta") return "Venta";
  return "Sin definir";
}

const BADGES = {
  compra: {
    label: "COMPRA",
    // Violeta: el mismo color con el que la columna Prebuying se identifica.
    className: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  },
  venta: {
    label: "VENTA",
    // Índigo: el color de la columna Prelisting.
    className: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  },
  "sin-definir": {
    label: "SIN DEFINIR",
    className: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
} as const;

export function badgeDeProceso(
  proceso: ProcesoNegocio | null
): { label: string; className: string } {
  return BADGES[proceso ?? "sin-definir"];
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run lib/tracking/proceso.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Sumar el campo a los tipos y al schema**

En `lib/tracking/types.ts`:

a) Después de la línea `export type ActivityType = ...`, agregar el re-export para que quien ya importa de `types` no tenga que cambiar de archivo:

```ts
export type { ProcesoNegocio } from "./proceso";
```

b) Agregar el import al principio del archivo, junto al de zod:

```ts
import type { ProcesoNegocio } from "./proceso";
```

c) Dentro de `interface PerformanceLog`, justo debajo de `type: ActivityType;`:

```ts
  /** De qué lado del negocio es esta actividad. null = histórica sin definir. */
  proceso: ProcesoNegocio | null;
```

d) En `performanceLogSchema`, justo debajo de la línea `type: z.enum([...])`:

```ts
  proceso: z.enum(['compra', 'venta'], {
    required_error: "Elegí si la actividad es de Compra o de Venta",
    invalid_type_error: "Elegí si la actividad es de Compra o de Venta",
  }),
```

e) Dentro de `interface PipelineMove`, debajo de `to_stage: ActivityType;`:

```ts
  proceso: ProcesoNegocio | null;
```

- [ ] **Step 6: Verificar que TypeScript compila**

Run: `npx tsc --noEmit`
Expected: los únicos errores nuevos son en los lugares que construyen un `PerformanceLog` o un `PipelineMove` literal sin `proceso`. Si aparece un error en `lib/queries/dashboard.ts` o en `lib/reports/`, es señal de que algo construye estos objetos a mano: anotarlo y resolverlo en la tarea que corresponda. **No** se espera ninguno: esos módulos leen de Supabase con `select("*")` y castean.

- [ ] **Step 7: Commit**

```bash
git add lib/tracking/proceso.ts lib/tracking/proceso.test.ts lib/tracking/types.ts
git commit -m "feat(tracking): define el proceso compra/venta y sus reglas"
```

---

### Task 3: `buildPipeline` arma una tarjeta por (cliente, proceso)

El corazón del cambio. Todo lo demás es plomería alrededor de esto.

**Files:**
- Modify: `lib/tracking/pipeline.ts`
- Create: `lib/tracking/pipeline.test.ts`

**Interfaces:**
- Consumes: `cardKeyDe`, `ProcesoNegocio` de `lib/tracking/proceso.ts`.
- Produces: `PipelineCard` con dos campos nuevos, `cardKey: string` y `proceso: ProcesoNegocio | null`. `clientKey` se mantiene con el mismo significado de hoy.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `lib/tracking/pipeline.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildPipeline } from "./pipeline";
import type { ActivityType, PerformanceLog, PipelineMove } from "./types";

/** Un log mínimo pero completo, vinculado por defecto al contacto de WhatsApp "wa-1". */
function unLog(over: Partial<PerformanceLog> & { id: string }): PerformanceLog {
  return {
    created_at: "2026-08-01T10:00:00.000Z",
    updated_at: "2026-08-01T10:00:00.000Z",
    agent_id: "agente-1",
    agency_id: "agencia-1",
    type: "prospeccion" as ActivityType,
    proceso: null,
    propiedad_ref: null,
    monto_operacion: null,
    comision_generada: null,
    fecha_actividad: "2026-08-01",
    fecha_cierre: null,
    metadata: {},
    ai_rating: null,
    ai_feedback: null,
    wa_contact_id: "wa-1",
    wa_contacts: { id: "wa-1", name: "Matías Gómez", phone: "+54 9 11 5555-5555" },
    ...over,
  } as PerformanceLog;
}

function unMovimiento(over: Partial<PipelineMove> & { id: string }): PipelineMove {
  return {
    agency_id: "agencia-1",
    agent_id: "agente-1",
    client_key: "5491155555555",
    lead_id: null,
    wa_contact_id: "wa-1",
    from_stage: null,
    to_stage: "reserva" as ActivityType,
    proceso: null,
    created_at: "2026-08-02T10:00:00.000Z",
    ...over,
  } as PipelineMove;
}

describe("buildPipeline: el cliente que compra y además vende", () => {
  it("le arma DOS tarjetas, una por proceso", () => {
    const { cards } = buildPipeline(
      [
        unLog({ id: "1", type: "prebuying", proceso: "compra", created_at: "2026-08-01T10:00:00.000Z" }),
        unLog({ id: "2", type: "prelisting", proceso: "venta", created_at: "2026-08-05T10:00:00.000Z" }),
      ],
      []
    );

    expect(cards).toHaveLength(2);
    expect(cards.map((c) => c.proceso).sort()).toEqual(["compra", "venta"]);
    expect(new Set(cards.map((c) => c.clientKey)).size).toBe(1);
  });

  it("cargar el prelisting NO le saca la tarjeta de compra de Prebuying", () => {
    const { cards } = buildPipeline(
      [
        unLog({ id: "1", type: "prebuying", proceso: "compra", created_at: "2026-08-01T10:00:00.000Z" }),
        unLog({ id: "2", type: "prelisting", proceso: "venta", created_at: "2026-08-05T10:00:00.000Z" }),
      ],
      []
    );

    const compra = cards.find((c) => c.proceso === "compra");
    const venta = cards.find((c) => c.proceso === "venta");
    expect(compra?.stage).toBe("prebuying");
    expect(venta?.stage).toBe("prelisting");
  });

  it("cada tarjeta cuenta sólo sus propias actividades", () => {
    const { cards } = buildPipeline(
      [
        unLog({ id: "1", type: "prebuying", proceso: "compra" }),
        unLog({ id: "2", type: "prebuying", proceso: "compra", created_at: "2026-08-03T10:00:00.000Z" }),
        unLog({ id: "3", type: "prelisting", proceso: "venta" }),
      ],
      []
    );

    expect(cards.find((c) => c.proceso === "compra")?.activityCount).toBe(2);
    expect(cards.find((c) => c.proceso === "venta")?.activityCount).toBe(1);
  });
});

describe("buildPipeline: movimientos manuales", () => {
  it("mover la tarjeta de compra no mueve la de venta", () => {
    const { cards } = buildPipeline(
      [
        unLog({ id: "1", type: "prebuying", proceso: "compra", created_at: "2026-08-01T10:00:00.000Z" }),
        unLog({ id: "2", type: "prelisting", proceso: "venta", created_at: "2026-08-01T11:00:00.000Z" }),
      ],
      [
        unMovimiento({
          id: "m1",
          proceso: "compra",
          from_stage: "prebuying",
          to_stage: "reserva",
          created_at: "2026-08-10T10:00:00.000Z",
        }),
      ]
    );

    expect(cards.find((c) => c.proceso === "compra")?.stage).toBe("reserva");
    expect(cards.find((c) => c.proceso === "venta")?.stage).toBe("prelisting");
  });
});

describe("buildPipeline: lo de siempre no se rompe", () => {
  it("un cliente con un solo proceso sigue siendo UNA tarjeta", () => {
    const { cards } = buildPipeline(
      [
        unLog({ id: "1", type: "prospeccion", proceso: "compra" }),
        unLog({ id: "2", type: "prebuying", proceso: "compra", created_at: "2026-08-04T10:00:00.000Z" }),
      ],
      []
    );

    expect(cards).toHaveLength(1);
    expect(cards[0].stage).toBe("prebuying");
    expect(cards[0].activityCount).toBe(2);
  });

  it("las actividades sin proceso forman su propia tarjeta 'sin definir'", () => {
    const { cards } = buildPipeline(
      [
        unLog({ id: "1", type: "prospeccion", proceso: null }),
        unLog({ id: "2", type: "prebuying", proceso: "compra", created_at: "2026-08-04T10:00:00.000Z" }),
      ],
      []
    );

    expect(cards).toHaveLength(2);
    expect(cards.filter((c) => c.proceso === null)).toHaveLength(1);
    expect(cards.filter((c) => c.proceso === "compra")).toHaveLength(1);
  });

  it("las eliminadas no cuentan para nadie", () => {
    const { cards } = buildPipeline(
      [unLog({ id: "1", type: "prebuying", proceso: "compra", status: "eliminada" })],
      []
    );
    expect(cards).toHaveLength(0);
  });

  it("las actividades sin cliente vinculado no arman tarjeta y se cuentan aparte", () => {
    const { cards, sinCliente } = buildPipeline(
      [unLog({ id: "1", proceso: "compra", wa_contact_id: null, wa_contacts: null, lead_id: null })],
      []
    );
    expect(cards).toHaveLength(0);
    expect(sinCliente).toBe(1);
  });

  it("la tarjeta lleva su propia cardKey, distinta de la clave del cliente", () => {
    const { cards } = buildPipeline(
      [unLog({ id: "1", type: "prebuying", proceso: "compra" })],
      []
    );
    expect(cards[0].cardKey).toBe(`${cards[0].clientKey}::compra`);
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run lib/tracking/pipeline.test.ts`
Expected: FAIL. Los de "dos tarjetas" fallan con `expected 1 to be 2`, y el de `cardKey` con `expected undefined to be "...::compra"`.

- [ ] **Step 3: Reescribir el agrupamiento de `buildPipeline`**

En `lib/tracking/pipeline.ts`:

a) Agregar al import de `./types` el tipo `ProcesoNegocio`, y un import nuevo:

```ts
import { cardKeyDe, type ProcesoNegocio } from "./proceso";
```

b) En `interface PipelineCard`, arriba de `clientKey`, agregar:

```ts
  /**
   * Identidad de la tarjeta en el tablero: cliente + proceso. Un mismo cliente
   * que nos compra y además nos vende tiene dos tarjetas, y esta es la clave
   * que las distingue (la de dnd-kit, la del map de movimientos, la de React).
   */
  cardKey: string;
  /** De qué lado del negocio es esta tarjeta. null = histórica sin definir. */
  proceso: ProcesoNegocio | null;
```

c) Reemplazar el bloque de agrupamiento. El código actual:

```ts
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
```

pasa a ser:

```ts
  let sinCliente = 0;

  // La unidad del tablero es (cliente, proceso), no el cliente: por eso la
  // clave del map es la cardKey y no la clientKey.
  const porTarjeta = new Map<
    string,
    { clientKey: string; proceso: ProcesoNegocio | null; logs: PerformanceLog[] }
  >();

  for (const log of vivos) {
    const clientKey = clientKeyFromLog(log);
    if (!clientKey) {
      sinCliente++;
      continue;
    }
    const proceso = log.proceso ?? null;
    const key = cardKeyDe(clientKey, proceso);
    const actual = porTarjeta.get(key);
    if (actual) actual.logs.push(log);
    else porTarjeta.set(key, { clientKey, proceso, logs: [log] });
  }

  // Último movimiento manual POR TARJETA. Si se indexara sólo por cliente,
  // arrastrar la tarjeta de compra movería también la de venta.
  const ultimoMovimiento = new Map<string, PipelineMove>();
  for (const move of moves) {
    const key = cardKeyDe(move.client_key, move.proceso ?? null);
    const previo = ultimoMovimiento.get(key);
    if (!previo || move.created_at > previo.created_at) {
      ultimoMovimiento.set(key, move);
    }
  }

  const cards: PipelineCard[] = [];

  for (const [cardKey, { clientKey, proceso, logs: delCliente }] of porTarjeta) {
```

d) Dentro de ese `for`, cambiar la línea que busca el movimiento:

```ts
    const move = ultimoMovimiento.get(clientKey);
```

por:

```ts
    const move = ultimoMovimiento.get(cardKey);
```

e) En el objeto que se hace `cards.push({...})`, agregar como primeras dos propiedades:

```ts
      cardKey,
      proceso,
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run lib/tracking/pipeline.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Correr toda la batería, para no haber roto nada más**

Run: `npm test`
Expected: PASS. Si algún test de otro módulo falla, es un problema real: arreglarlo antes de seguir.

- [ ] **Step 6: Commit**

```bash
git add lib/tracking/pipeline.ts lib/tracking/pipeline.test.ts
git commit -m "feat(tracking): el tablero arma una tarjeta por cliente y proceso"
```

---

### Task 4: Los server actions guardan y mueven con proceso

**Files:**
- Modify: `actions/tracking/savePerformanceLog.ts`
- Modify: `actions/tracking/movePipelineCard.ts`

**Interfaces:**
- Consumes: `PROCESO_FIJO`, `ProcesoNegocio` de `lib/tracking/proceso.ts`.
- Produces: `MovePipelineCardInput` gana el campo obligatorio `proceso: ProcesoNegocio | null`.

- [ ] **Step 1: Validar el proceso en `savePerformanceLog`**

En `actions/tracking/savePerformanceLog.ts`, agregar el import:

```ts
import { PROCESO_FIJO } from "@/lib/tracking/proceso";
```

y reemplazar la línea:

```ts
  const { waMetrics, waAnalysis, ...baseData } = payload;
```

por:

```ts
  const { waMetrics, waAnalysis, ...baseData } = payload;

  // El proceso es obligatorio para toda alta nueva. En las tres etapas que ya
  // lo definen se deriva acá también, y no sólo en el formulario: el action es
  // la última puerta antes de la base, y no puede confiar en que quien llama
  // haya hecho los deberes.
  const proceso = PROCESO_FIJO[baseData.type as keyof typeof PROCESO_FIJO] ?? baseData.proceso ?? null;
  if (proceso !== "compra" && proceso !== "venta") {
    throw new Error("Falta indicar si la actividad es de Compra o de Venta");
  }
  baseData.proceso = proceso;
```

- [ ] **Step 2: Que `movePipelineCard` guarde el proceso de la tarjeta movida**

En `actions/tracking/movePipelineCard.ts`:

a) Cambiar el import de tipos:

```ts
import type { ActivityType } from "@/lib/tracking/types";
```

por:

```ts
import type { ActivityType } from "@/lib/tracking/types";
import type { ProcesoNegocio } from "@/lib/tracking/proceso";
```

b) En `interface MovePipelineCardInput`, agregar debajo de `clientKey`:

```ts
  /** Qué tarjeta del cliente se movió. Sin esto, mover la de compra movería también la de venta. */
  proceso: ProcesoNegocio | null;
```

c) En el `insert`, agregar debajo de `client_key: input.clientKey,`:

```ts
    proceso: input.proceso,
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: un error esperado en `components/tracking/pipeline/PipelineBoard.tsx`, porque la llamada a `movePipelineCard` todavía no pasa `proceso`. Se resuelve en la Task 6.

- [ ] **Step 4: Commit**

```bash
git add actions/tracking/savePerformanceLog.ts actions/tracking/movePipelineCard.ts
git commit -m "feat(tracking): los actions guardan el proceso de cada actividad y movimiento"
```

---

### Task 5: El campo Proceso en el formulario de actividad

**Files:**
- Modify: `components/tracking/PerformanceLogForm.tsx`

**Interfaces:**
- Consumes: `PROCESO_FIJO`, `etapasPermitidas`, `labelDeProceso`, `ProcesoNegocio` de `lib/tracking/proceso.ts`; `PIPELINE_STAGES` de `lib/tracking/pipeline.ts`.
- Produces: `PerformanceLogForm` gana la prop opcional `forcedProceso?: ProcesoNegocio | null`.

- [ ] **Step 1: Sumar imports y la prop nueva**

a) Agregar a los imports:

```ts
import { cn } from "@/lib/utils";
import { PROCESO_FIJO, etapasPermitidas, labelDeProceso, type ProcesoNegocio } from "@/lib/tracking/proceso";
import { PIPELINE_STAGES } from "@/lib/tracking/pipeline";
```

b) En `interface Props`, debajo de `forcedType`:

```ts
  /** Fija el proceso y lo muestra bloqueado. Lo usa el popup del tablero. */
  forcedProceso?: ProcesoNegocio | null;
```

c) En la firma de la función, agregar `forcedProceso,` a la desestructuración, entre `forcedType` y `lockedClient`.

- [ ] **Step 2: Sumar `proceso` a los defaultValues**

En el objeto de `logToEdit ? {...}`, debajo de `type: logToEdit.type,`:

```ts
      proceso: logToEdit.proceso ?? undefined,
```

En la rama del `: {...}` (alta nueva), debajo de `type: forcedType ?? "prospeccion",`:

```ts
      proceso: forcedProceso ?? PROCESO_FIJO[forcedType ?? "prospeccion"] ?? undefined,
```

- [ ] **Step 3: Derivar el proceso cuando la etapa ya lo define**

Debajo de la línea `const activityType = watch("type");`, agregar:

```ts
  const proceso = watch("proceso");

  // En prelisting, captación y prebuying el proceso no se elige: lo dice la
  // etapa. Se muestra igual, pero bloqueado, para que quede explícito qué se
  // está guardando y no parezca que el sistema lo decidió a escondidas.
  const procesoFijoPorEtapa = PROCESO_FIJO[activityType];
  const procesoBloqueado = !!procesoFijoPorEtapa || !!forcedProceso;
  const motivoBloqueo = procesoFijoPorEtapa
    ? `Un ${PIPELINE_STAGES.find((s) => s.id === activityType)?.title} es siempre del lado de la ${labelDeProceso(procesoFijoPorEtapa).toLowerCase()}`
    : "Lo define la tarjeta del tablero";

  useEffect(() => {
    const fijo = procesoFijoPorEtapa ?? forcedProceso ?? null;
    if (fijo) setValue("proceso", fijo);
  }, [procesoFijoPorEtapa, forcedProceso, setValue]);

  // Cuando el proceso viene impuesto (por ejemplo desde "Abrir proceso de
  // Venta"), el desplegable de etapas no puede ofrecer las del otro lado.
  const etapasElegibles = etapasPermitidas(forcedProceso ?? null);
```

- [ ] **Step 4: Reemplazar la lista fija de etapas por una filtrada**

En el JSX, reemplazar el bloque:

```tsx
                <SelectContent>
                  <SelectItem value="prospeccion">Prospección</SelectItem>
                  <SelectItem value="prelisting">Prelisting</SelectItem>
                  <SelectItem value="prebuying">Prebuying</SelectItem>
                  <SelectItem value="captacion">Captación</SelectItem>
                  <SelectItem value="reserva">Reserva</SelectItem>
                  <SelectItem value="cierre">Cierre</SelectItem>
                </SelectContent>
```

por:

```tsx
                <SelectContent>
                  {PIPELINE_STAGES.filter((s) => etapasElegibles.includes(s.id)).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                  ))}
                </SelectContent>
```

(Los títulos de `PIPELINE_STAGES` son exactamente los mismos que estaban escritos a mano: Prospección, Prelisting, Prebuying, Captación, Reserva, Cierre.)

- [ ] **Step 5: Agregar el campo Proceso al formulario**

Justo después del `</div>` que cierra el bloque `<div className="space-y-2">` del Tipo de Actividad, y antes del `</div>` que cierra el `grid`, agregar:

```tsx
          {/* Proceso: de qué lado del negocio está el cliente en esta actividad. */}
          <div className="space-y-2">
            <Label htmlFor="proceso">Proceso *</Label>
            {procesoBloqueado ? (
              <div className="h-12 px-3 flex items-center gap-2 rounded-md border border-accent/20 bg-accent/5">
                <span className="text-base font-semibold">{labelDeProceso(proceso ?? null)}</span>
                <span className="text-[11px] text-muted-foreground">{motivoBloqueo}</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {(["compra", "venta"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setValue("proceso", p, { shouldValidate: true })}
                    className={cn(
                      "h-12 rounded-md border text-base font-semibold transition-all active:scale-95",
                      proceso === p
                        ? "border-accent bg-accent/15 text-foreground"
                        : "border-white/10 bg-background/30 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {labelDeProceso(p)}
                  </button>
                ))}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Una misma persona puede comprarte y venderte a la vez: cada proceso lleva su propia
              tarjeta en el tablero.
            </p>
            {errors.proceso && (
              <p className="text-xs text-red-400">{errors.proceso.message as string}</p>
            )}
          </div>
```

- [ ] **Step 6: Verificar que compila y que el build pasa**

Run: `npx tsc --noEmit`
Expected: sigue el error esperado de `PipelineBoard.tsx` (Task 6). Ningún error nuevo en `PerformanceLogForm.tsx`.

- [ ] **Step 7: Commit**

```bash
git add components/tracking/PerformanceLogForm.tsx
git commit -m "feat(tracking): el formulario pide de qué proceso es la actividad"
```

---

### Task 6: El tablero — cartelito, cardKey y bloqueo al arrastrar

**Files:**
- Modify: `components/tracking/pipeline/PipelineCard.tsx`
- Modify: `components/tracking/pipeline/PipelineColumn.tsx`
- Modify: `components/tracking/pipeline/PipelineBoard.tsx`
- Modify: `components/tracking/pipeline/PipelineStageDialog.tsx`

**Interfaces:**
- Consumes: `PipelineCard.cardKey` y `PipelineCard.proceso` (Task 3), `etapasPermitidas` y `badgeDeProceso` (Task 2), `MovePipelineCardInput.proceso` (Task 4), `PerformanceLogForm.forcedProceso` (Task 5).
- Produces: `PipelineStageDialog` gana las props `proceso: ProcesoNegocio | null` y `esProcesoNuevo: boolean`; `PipelineBoard` gana el handler `abrirProceso(card, proceso)` que le pasa a la ficha del cliente en la Task 7.

- [ ] **Step 1: El cartelito en la tarjeta y el menú "Mover a…" filtrado**

En `components/tracking/pipeline/PipelineCard.tsx`:

a) Agregar a los imports:

```ts
import { badgeDeProceso, etapasPermitidas } from "@/lib/tracking/proceso";
```

b) Dentro del componente, antes del `return`:

```tsx
  const badge = badgeDeProceso(card.proceso);
  const permitidas = etapasPermitidas(card.proceso);
```

c) Justo después de la apertura del `<div ref={setNodeRef} ...>`, como primer hijo, agregar el cartelito:

```tsx
      <span
        className={cn(
          "inline-block rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider border",
          badge.className
        )}
      >
        {badge.label}
      </span>
```

d) En el `DropdownMenuItem` de "Mover a…", cambiar:

```tsx
                disabled={stage.id === card.stage}
```

por:

```tsx
                disabled={stage.id === card.stage || !permitidas.includes(stage.id)}
```

- [ ] **Step 2: La columna usa `cardKey` como identidad**

En `components/tracking/pipeline/PipelineColumn.tsx`, reemplazar:

```tsx
        <SortableContext items={cards.map((c) => c.clientKey)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <PipelineCardItem
              key={card.clientKey}
```

por:

```tsx
        <SortableContext items={cards.map((c) => c.cardKey)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <PipelineCardItem
              key={card.cardKey}
```

Y en `components/tracking/pipeline/PipelineCard.tsx`, en el `useSortable`:

```tsx
    useSortable({ id: card.clientKey, data: { type: "PipelineCard", card } });
```

pasa a:

```tsx
    useSortable({ id: card.cardKey, data: { type: "PipelineCard", card } });
```

- [ ] **Step 3: El bloqueo y el proceso en el board**

En `components/tracking/pipeline/PipelineBoard.tsx`:

a) Agregar a los imports:

```ts
import { etapasPermitidas, labelDeProceso, type ProcesoNegocio } from "@/lib/tracking/proceso";
```

b) Cambiar el estado `pending` para que lleve el proceso y si es un proceso nuevo:

```tsx
  const [pending, setPending] = useState<{
    card: PipelineCard;
    stage: ActivityType;
    proceso: ProcesoNegocio | null;
    esProcesoNuevo: boolean;
  } | null>(null);
```

c) Reemplazar el cuerpo de `resolverMovimiento` por:

```tsx
  const resolverMovimiento = async (card: PipelineCard, destino: ActivityType) => {
    if (destino === card.stage) return;

    // Una tarjeta de compra no tiene nada que hacer en Prelisting ni Captación,
    // y una de venta no lo tiene en Prebuying: son columnas del otro lado del
    // negocio. La tarjeta vuelve sola porque su posición se recalcula desde los
    // datos, así que alcanza con explicar por qué y no refrescar.
    if (!etapasPermitidas(card.proceso).includes(destino)) {
      toast.error(
        `${PIPELINE_STAGES.find((s) => s.id === destino)?.title} es del otro lado del negocio: ` +
          `esta tarjeta es de ${labelDeProceso(card.proceso)}.`
      );
      return;
    }

    if (!card.stagesConActividad.includes(destino)) {
      setPending({ card, stage: destino, proceso: card.proceso, esProcesoNuevo: false });
      return;
    }

    const res = await movePipelineCard({
      clientKey: card.clientKey,
      proceso: card.proceso,
      leadId: card.leadId,
      waContactId: card.waContactId,
      fromStage: card.stage,
      toStage: destino,
    });

    if (!res.success) {
      toast.error(res.error || "No se pudo mover la tarjeta");
      return;
    }

    toast.success(`${card.clientName} pasó a ${PIPELINE_STAGES.find((s) => s.id === destino)?.title}`);
    onRefresh();
  };
```

d) Agregar, debajo de `resolverMovimiento`, el handler para abrir el otro proceso:

```tsx
  /**
   * Abrir el segundo proceso de un cliente = cargarle la primera actividad del
   * otro lado. La etapa de arranque de cada lado es su etapa exclusiva.
   */
  const abrirProceso = (card: PipelineCard, proceso: ProcesoNegocio) => {
    setPending({
      card,
      stage: proceso === "venta" ? "prelisting" : "prebuying",
      proceso,
      esProcesoNuevo: true,
    });
  };
```

e) En `onDragEnd`, cambiar la búsqueda de la tarjeta destino:

```tsx
      : cards.find((c) => c.clientKey === overId)?.stage;
```

por:

```tsx
      : cards.find((c) => c.cardKey === overId)?.stage;
```

f) En el JSX de `<PipelineStageDialog>`, agregar las dos props nuevas:

```tsx
        proceso={pending?.proceso ?? null}
        esProcesoNuevo={pending?.esProcesoNuevo ?? false}
```

- [ ] **Step 4: El popup pasa el proceso al formulario**

En `components/tracking/pipeline/PipelineStageDialog.tsx`:

a) Agregar al import de tipos:

```ts
import { labelDeProceso, type ProcesoNegocio } from "@/lib/tracking/proceso";
```

b) En `interface Props`, debajo de `targetStage`:

```ts
  proceso: ProcesoNegocio | null;
  /** true cuando se está abriendo el segundo proceso del cliente, no moviendo la tarjeta. */
  esProcesoNuevo: boolean;
```

c) Agregar `proceso, esProcesoNuevo,` a la desestructuración de la firma.

d) Reemplazar el `<SheetTitle>` y el `<SheetDescription>` por:

```tsx
            <SheetTitle className="text-2xl font-bold tracking-tight">
              {esProcesoNuevo ? `Abrir proceso de ${labelDeProceso(proceso)}` : `Pasar a ${stage?.title}`}
            </SheetTitle>
            <SheetDescription className="text-sm text-muted-foreground mt-1">
              {esProcesoNuevo
                ? `${card.clientName} pasa a tener dos procesos en paralelo. La tarjeta que ya tenías no se mueve de donde está.`
                : `${card.clientName} todavía no tiene actividad en esta etapa. Completá los datos y queda registrada como cualquier otra actividad.`}
            </SheetDescription>
```

e) En `<PerformanceLogForm>`, agregar debajo de `forcedType={targetStage}`:

```tsx
              forcedProceso={proceso}
```

- [ ] **Step 5: Verificar que compila y que el build pasa**

Run: `npx tsc --noEmit`
Expected: sin errores. El de la Task 4 queda resuelto acá.

Run: `npm run build`
Expected: build exitoso.

- [ ] **Step 6: Commit**

```bash
git add components/tracking/pipeline/PipelineCard.tsx components/tracking/pipeline/PipelineColumn.tsx components/tracking/pipeline/PipelineBoard.tsx components/tracking/pipeline/PipelineStageDialog.tsx
git commit -m "feat(tracking): el tablero distingue las tarjetas de compra y de venta"
```

---

### Task 7: La ficha del cliente y la vista Lista

**Files:**
- Modify: `components/tracking/pipeline/PipelineClientSheet.tsx`
- Modify: `components/tracking/pipeline/PipelineBoard.tsx`
- Modify: `components/tracking/PerformanceHistoryList.tsx`

**Interfaces:**
- Consumes: `abrirProceso(card, proceso)` de la Task 6, `badgeDeProceso` y `labelDeProceso` de la Task 2.
- Produces: `PipelineClientSheet` gana las props `procesosDelCliente: ProcesoNegocio[]` y `onAbrirProceso: (card: PipelineCard, proceso: ProcesoNegocio) => void`.

- [ ] **Step 1: La ficha muestra su proceso y ofrece abrir el otro**

En `components/tracking/pipeline/PipelineClientSheet.tsx`:

a) Agregar a los imports:

```ts
import { badgeDeProceso, labelDeProceso, type ProcesoNegocio } from "@/lib/tracking/proceso";
import { cn } from "@/lib/utils";
```

b) En `interface Props`, debajo de `card`:

```ts
  /** Todos los procesos que ese cliente tiene abiertos, para ofrecer el que falta. */
  procesosDelCliente: ProcesoNegocio[];
  onAbrirProceso: (card: PipelineCard, proceso: ProcesoNegocio) => void;
```

c) Agregar `procesosDelCliente, onAbrirProceso,` a la desestructuración de la firma.

d) Cambiar el filtro de movimientos, para que la ficha muestre sólo los de su tarjeta:

```tsx
      .filter((m) => m.client_key === card.clientKey)
```

por:

```tsx
      // Sólo los movimientos de ESTA tarjeta: los del otro proceso del mismo
      // cliente son otra historia y se ven abriendo la otra tarjeta.
      .filter((m) => m.client_key === card.clientKey && (m.proceso ?? null) === card.proceso)
```

e) Debajo de `<SheetDescription>...</SheetDescription>`, dentro del `<SheetHeader>`, agregar:

```tsx
            <div className="flex flex-wrap items-center gap-2 pt-3">
              <span
                className={cn(
                  "inline-block rounded px-2 py-0.5 text-[10px] font-bold tracking-wider border",
                  badgeDeProceso(card.proceso).className
                )}
              >
                {badgeDeProceso(card.proceso).label}
              </span>

              {(["compra", "venta"] as const)
                .filter((p) => p !== card.proceso && !procesosDelCliente.includes(p))
                .map((p) => (
                  <Button
                    key={p}
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px]"
                    onClick={() => onAbrirProceso(card, p)}
                  >
                    Abrir proceso de {labelDeProceso(p)}
                  </Button>
                ))}

              {(["compra", "venta"] as const)
                .filter((p) => p !== card.proceso && procesosDelCliente.includes(p))
                .map((p) => (
                  <span key={p} className="text-[11px] text-muted-foreground">
                    También tiene un proceso de {labelDeProceso(p)} abierto.
                  </span>
                ))}
            </div>
```

- [ ] **Step 2: El board le pasa a la ficha los procesos del cliente**

En `components/tracking/pipeline/PipelineBoard.tsx`, en el JSX de `<PipelineClientSheet>`, agregar debajo de `card={openCard}`:

```tsx
        procesosDelCliente={
          openCard
            ? (cards
                .filter((c) => c.clientKey === openCard.clientKey && c.proceso)
                .map((c) => c.proceso) as ProcesoNegocio[])
            : []
        }
        onAbrirProceso={(card, proceso) => {
          setOpenCard(null);
          abrirProceso(card, proceso);
        }}
```

- [ ] **Step 3: El cartelito en la vista Lista**

En `components/tracking/PerformanceHistoryList.tsx`:

a) Agregar a los imports:

```ts
import { badgeDeProceso } from "@/lib/tracking/proceso";
```

b) Reemplazar la celda del tipo:

```tsx
                  <TableCell>{getTypeBadge(log.type)}</TableCell>
```

por:

```tsx
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      {getTypeBadge(log.type)}
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider border ${badgeDeProceso(log.proceso).className}`}
                      >
                        {badgeDeProceso(log.proceso).label}
                      </span>
                    </div>
                  </TableCell>
```

- [ ] **Step 4: Verificar que compila y que el build pasa**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores, build exitoso.

- [ ] **Step 5: Commit**

```bash
git add components/tracking/pipeline/PipelineClientSheet.tsx components/tracking/pipeline/PipelineBoard.tsx components/tracking/PerformanceHistoryList.tsx
git commit -m "feat(tracking): la ficha del cliente abre el segundo proceso"
```

---

### Task 8: Verificación en el navegador y documentación

Nada se da por terminado hasta haberlo visto funcionar en pantalla. Esto no es opcional.

**Files:**
- Modify: `docs/interno/LOGICA-PRISMA.md`
- Modify: `docs/compartible/estandarizada/FUNCIONAL-ASESOR-PRISMA.md`
- Modify: `docs/compartible/estandarizada/FUNCIONAL-DIRECTOR-PRISMA.md`

- [ ] **Step 1: Correr toda la batería de tests**

Run: `npm test`
Expected: PASS, sin ningún fallo.

- [ ] **Step 2: Levantar el server**

Run: `npm run dev -- --port 3009`

El 3007 es de la terminal de ACM; usar 3009 para no pisarla. Entregarle a Leonardo el link `http://localhost:3009`.

- [ ] **Step 3: El recorrido completo, en escritorio**

Con la cuenta **PRISMAIA - VAKDOR** (nunca Central, nunca la de un asesor real), en `/director/tracking-performance`:

1. Cargar una actividad de **Prebuying** a un contacto de prueba → el campo Proceso aparece con "Compra" bloqueado y la leyenda del motivo.
2. Ver la tarjeta en la columna Prebuying, con el cartelito **COMPRA** violeta.
3. Abrir la ficha de esa tarjeta → botón "Abrir proceso de Venta".
4. Apretarlo → se abre "Abrir proceso de Venta" con la etapa Prelisting fijada; guardar.
5. **Verificación central:** ahora hay **dos** tarjetas del mismo cliente — una VENTA en Prelisting y una COMPRA **que sigue en Prebuying**.
6. Arrastrar la de COMPRA a Reserva → se mueve; la de VENTA no se movió.
7. Arrastrar la de COMPRA a Captación → vuelve sola, con el toast "Captación es del otro lado del negocio: esta tarjeta es de Compra."
8. Abrir el menú ⋮ de la tarjeta de COMPRA → Prelisting y Captación aparecen deshabilitadas.
9. Cargar una actividad de **Prospección** desde "Nueva Actividad" → el campo Proceso está vacío y es obligatorio; intentar guardar sin elegir muestra el error.
10. Ir a la vista **Lista** → cada fila muestra su cartelito de proceso.
11. Ir al **Dashboard** → anotar los KPIs antes de todo esto y comprobar que los que no dependen de las actividades nuevas no cambiaron.

Sacar captura de cada paso clave y guardarla en `docs/superpowers/specs/evidencia/`.

- [ ] **Step 4: El mismo recorrido en celular**

Con emulación de dispositivo real en DevTools (no achicando la ventana). Verificar que:
- Los dos botones Compra/Venta del formulario se tocan cómodo.
- El cartelito no rompe el ancho de la tarjeta.
- El tablero sigue scrolleando horizontal sin que la página scrollee.

- [ ] **Step 5: Actualizar la documentación**

En `docs/interno/LOGICA-PRISMA.md`, en la sección de Tracking Performance, documentar: la columna `proceso`, la tarjeta como par (cliente, proceso), la regla de etapas fijas y el bloqueo al arrastrar.

En los dos funcionales compartibles, agregar en lenguaje de usuario (sin tecnicismos, siguiendo el estilo del resto del documento) cómo se trabaja un cliente que compra y vende a la vez.

- [ ] **Step 6: Commit y entrega**

```bash
git add docs/
git commit -m "docs(tracking): documenta el cliente con dos procesos en paralelo"
```

Mostrarle a Leonardo el recorrido funcionando y esperar su OK antes de mergear a `main`.

---

## Notas para quien implemente

- **`lib/tracking/queries.ts` no se toca.** Usa `select("*")`, así que la columna nueva llega sola.
- **El Dashboard no se toca.** Todas sus métricas filtran por `type` (verificado en `lib/queries/dashboard.ts`), ninguna agrupa por cliente ni por tarjeta. Si en algún momento aparece la necesidad de partir los KPIs por proceso, es una feature nueva, no parte de esto.
- **`updatePerformanceLog` no se toca.** Hace un `update` con spread del payload, así que el `proceso` que mande el formulario se guarda solo. El CHECK de la base es lo que impide que una edición cree un registro incoherente.
- **Si `npx vitest` no arranca en el worktree**, falta `npm install`: el worktree nace sin `node_modules`.
- **El import cruzado entre `types.ts` y `proceso.ts` es a propósito y no es un ciclo real:** los dos lados usan `import type`, que TypeScript borra al compilar. No "arreglarlo" moviendo cosas de lugar.
- **Arrastrar una tarjeta "Sin definir" a Prelisting o Prebuying no la convierte: le crea una tarjeta nueva** con el proceso que esa etapa fija, y la vieja queda donde estaba con sus actividades sin definir. Es coherente (cada actividad conserva lo que se cargó) pero puede sorprender: si en la prueba del navegador se ve confuso, anotarlo y consultarlo, no improvisar una solución.
- **Al cambiar el tipo de actividad, el proceso ya elegido no se borra.** Si venía de una etapa que lo fijaba, queda ese valor seleccionado y editable. Es deliberado: en la enorme mayoría de los casos el lado del negocio no cambia por corregir la etapa.
