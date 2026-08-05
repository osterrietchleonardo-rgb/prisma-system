# Informe semanal al director fundador — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mandar todos los lunes, por Resend, un informe de la performance de la semana anterior al director fundador de cada inmobiliaria activa: consultas ingresadas, handoffs, derivaciones por visita y por link, con intervención del asesor por rango de tiempo, global y por asesor, más el estado en el pipeline de Tracking Performance.

**Architecture:** GitHub Action (cron lunes 11:00 UTC) → `GET /api/cron/weekly-report` protegida con `CRON_SECRET`. El endpoint lee de Supabase con el cliente admin y de la API de Resend, calcula el informe con funciones puras y manda el HTML por Resend. Toda la lógica numérica vive en módulos sin red (`window.ts`, `phone.ts`, `data.ts`) para poder testearla con datos fijos.

**Tech Stack:** Next.js 14.2.35 (App Router), TypeScript, `@supabase/supabase-js` (cliente admin, sin RLS), API HTTP de Resend, vitest (nuevo, solo para estos módulos).

**Spec:** `docs/superpowers/specs/2026-08-03-informe-semanal-director-design.md`

## Global Constraints

- **Zona horaria:** Argentina = UTC-3 fijo, sin horario de verano. Toda la ventana semanal se calcula así.
- **Semana:** lunes 00:00:00.000 AR → domingo 23:59:59.999 AR, la **anterior** a la corrida.
- **Rangos de tiempo (exactos, no negociables):** `<1h` / `1-4h` / `4-24h` / `+24h` / `sin atender`. Bordes cerrados por abajo: 1.0h cae en `1-4h`, 4.0h en `4-24h`, 24.0h en `+24h`.
- **Marcador del handoff:** mensaje de `wa_messages` con `role='internal'` y `content` que contiene `Handoff activado`. `bot_active` NO es marcador.
- **Respuesta de la agencia:** primer mensaje con `role='human'`, o `role='internal'` cuyo `content` NO contenga `Handoff activado`.
- **Asuntos de Resend (contrato con n8n):** `Quiere visitar:` = derivación por visita. `Nuevo interesado en tu propiedad:` = derivación por link. `Un cliente pide atención` = email del handoff (no se usa para contar, el handoff sale de la base).
- **Clave de teléfono:** solo dígitos, últimos 10. Es la única forma que matchea los formatos reales convivientes (`+54 1150458476`, `5491154054949`, `1140290585`).
- **Destinatario:** `agencies.estado='activo'` → `agencies.owner_id` → `profiles.email`.
- **Colores de marca:** azul `#131A2D`, cobre `#B57E3B`, fondo `#f4f7f9`, borde `#e1e8ed`.
- **Nunca `git add -A`:** el working tree tiene cambios de otras ramas. Siempre `git add` de los archivos nombrados en cada tarea.

---

### Task 1: Ventana semanal y setup de tests

**Files:**
- Modify: `package.json` (agregar `vitest` a devDependencies y el script `test`)
- Create: `vitest.config.ts`
- Create: `lib/reports/weekly/types.ts`
- Create: `lib/reports/weekly/window.ts`
- Test: `lib/reports/weekly/window.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `WeekWindow`, `Bucket`, `DerivationEvent`, `AgentRow`, `SignalRow`, `PipelineRow`, `WeeklyReport` (desde `types.ts`); `previousWeek(now?: Date): WeekWindow` (desde `window.ts`).

- [ ] **Step 1: Instalar vitest**

```bash
npm install -D vitest@^2
```

- [ ] **Step 2: Crear `vitest.config.ts`**

Acotado a los tests de este módulo, para no barrer el resto del repo (que no tiene tests).

```ts
import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  test: {
    include: ["lib/reports/weekly/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
})
```

- [ ] **Step 3: Agregar el script de test a `package.json`**

En `"scripts"`, junto a `lint`:

```json
"test": "vitest run"
```

- [ ] **Step 4: Crear `lib/reports/weekly/types.ts`**

```ts
/** Rangos de tiempo del informe. El orden de este array es el orden de las columnas. */
export const BUCKETS = ["<1h", "1-4h", "4-24h", "+24h", "sin atender"] as const
export type Bucket = (typeof BUCKETS)[number]

/** Ventana semanal, ya convertida a UTC para consultar la base. */
export interface WeekWindow {
  /** ISO UTC del lunes 00:00 AR. */
  startUtc: string
  /** ISO UTC del domingo 23:59:59.999 AR. */
  endUtc: string
  /** Texto para el email, ej. "27 de julio al 2 de agosto de 2026". */
  label: string
}

/**
 * Un evento de derivación ya resuelto: quién lo recibió, cuándo, y qué rastro dejó.
 * Sirve para los tres tipos (handoff, visita, link); los que no aplican quedan en false.
 */
export interface DerivationEvent {
  /** Nombre del asesor, o "(sin asesor)" si no se pudo resolver. */
  agentName: string
  /** ISO UTC del momento de la derivación. */
  at: string
  /** Horas hasta el primer mensaje de la agencia en el chat. null = nunca escribió. */
  replyHours: number | null
  /** Quedó una visita cargada en scheduled_visits después de la derivación. */
  visitScheduled: boolean
  /** El asesor clickeó un link del email (last_event = "clicked" en Resend). */
  emailClicked: boolean
}

/** Fila de la tabla de handoffs: intervención medida por rango de tiempo. */
export interface AgentRow {
  agent: string
  total: number
  /** Cuántos tuvieron respuesta en el chat. */
  attended: number
  /** Porcentaje entero, o null si total = 0. */
  pct: number | null
  buckets: Record<Bucket, number>
}

/** Fila de las tablas de visita y link: las tres señales por separado. */
export interface SignalRow {
  agent: string
  total: number
  /** Escribió en la conversación de PRISMA. */
  chat: number
  /** Quedó la visita cargada en scheduled_visits. */
  visita: number
  /** Clickeó el email. */
  email: number
  /** Ninguna de las tres. */
  sinRastro: number
}

/** Una etapa del pipeline de Tracking Performance con cuántos leads derivados hay en ella. */
export interface PipelineRow {
  stage: string
  count: number
}

/** El informe completo de una inmobiliaria, listo para renderizar. */
export interface WeeklyReport {
  agencyName: string
  window: WeekWindow
  /** Conversaciones creadas en la semana CON al menos un mensaje del cliente. */
  consultas: number
  handoffs: { total: number; rows: AgentRow[] }
  visitas: { total: number; rows: SignalRow[] }
  links: { total: number; rows: SignalRow[] }
  pipeline: { derivados: number; cargados: number; rows: PipelineRow[] }
  /** false = no se pudo leer Resend; las secciones de visita y link salen "no disponible". */
  resendOk: boolean
}
```

- [ ] **Step 5: Escribir el test de la ventana (que falla)**

```ts
import { describe, it, expect } from "vitest"
import { previousWeek } from "./window"

describe("previousWeek", () => {
  it("un lunes devuelve la semana lunes-domingo anterior en hora AR", () => {
    // Lunes 3-ago-2026, 11:00 UTC = 8:00 AR (la hora a la que corre el cron).
    const w = previousWeek(new Date("2026-08-03T11:00:00.000Z"))
    // Lunes 27-jul 00:00 AR = 27-jul 03:00 UTC
    expect(w.startUtc).toBe("2026-07-27T03:00:00.000Z")
    // Domingo 2-ago 23:59:59.999 AR = 3-ago 02:59:59.999 UTC
    expect(w.endUtc).toBe("2026-08-03T02:59:59.999Z")
  })

  it("un domingo devuelve la última semana COMPLETA, no la que está corriendo", () => {
    // Domingo 2-ago-2026, 15:00 UTC = 12:00 AR
    const w = previousWeek(new Date("2026-08-02T15:00:00.000Z"))
    expect(w.startUtc).toBe("2026-07-20T03:00:00.000Z")
    expect(w.endUtc).toBe("2026-07-27T02:59:59.999Z")
  })

  it("de madrugada en AR (que ya es el día siguiente en UTC) no se corre una semana", () => {
    // Lunes 3-ago 01:00 AR = lunes 3-ago 04:00 UTC. Sigue siendo lunes en AR.
    const w = previousWeek(new Date("2026-08-03T04:00:00.000Z"))
    expect(w.startUtc).toBe("2026-07-27T03:00:00.000Z")
  })

  it("domingo 22:00 AR = lunes 01:00 UTC: manda la hora AR, no la UTC", () => {
    // En UTC ya es lunes 3-ago, pero en AR todavía es domingo 2-ago.
    const w = previousWeek(new Date("2026-08-03T01:00:00.000Z"))
    expect(w.startUtc).toBe("2026-07-20T03:00:00.000Z")
    expect(w.endUtc).toBe("2026-07-27T02:59:59.999Z")
  })

  it("arma la etiqueta legible del rango", () => {
    const w = previousWeek(new Date("2026-08-03T11:00:00.000Z"))
    expect(w.label).toBe("27 de julio al 2 de agosto de 2026")
  })
})
```

- [ ] **Step 6: Correr el test y ver que falla**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./window"`

- [ ] **Step 7: Implementar `lib/reports/weekly/window.ts`**

```ts
import type { WeekWindow } from "./types"

/** Argentina es UTC-3 fijo: no tiene horario de verano desde 2009. */
const AR_OFFSET_MS = 3 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]

/**
 * Ventana de la semana ANTERIOR (lunes 00:00 a domingo 23:59:59.999), en hora argentina,
 * devuelta como ISO UTC para consultar la base.
 *
 * El truco: restarle el offset a "ahora" da un Date cuyos getters UTC leen la hora
 * argentina. Así toda la aritmética de días se hace con getUTC*, que no depende de la
 * zona horaria del servidor (Vercel corre en UTC, la máquina de Leonardo en AR).
 */
export function previousWeek(now: Date = new Date()): WeekWindow {
  const ar = new Date(now.getTime() - AR_OFFSET_MS)

  // getUTCDay(): 0 = domingo. Lo giramos para que el lunes sea 0.
  const diasDesdeElLunes = (ar.getUTCDay() + 6) % 7
  const lunesDeEstaSemana =
    Date.UTC(ar.getUTCFullYear(), ar.getUTCMonth(), ar.getUTCDate()) - diasDesdeElLunes * DAY_MS

  const inicioAr = lunesDeEstaSemana - 7 * DAY_MS
  const finAr = lunesDeEstaSemana - 1 // 23:59:59.999 del domingo

  const inicio = new Date(inicioAr + AR_OFFSET_MS)
  const fin = new Date(finAr + AR_OFFSET_MS)

  return {
    startUtc: inicio.toISOString(),
    endUtc: fin.toISOString(),
    label: etiqueta(new Date(inicioAr), new Date(finAr)),
  }
}

/** "27 de julio al 2 de agosto de 2026". Recibe fechas ya en hora AR leídas con getUTC*. */
function etiqueta(desde: Date, hasta: Date): string {
  const d = `${desde.getUTCDate()} de ${MESES[desde.getUTCMonth()]}`
  const h = `${hasta.getUTCDate()} de ${MESES[hasta.getUTCMonth()]} de ${hasta.getUTCFullYear()}`
  return `${d} al ${h}`
}
```

- [ ] **Step 8: Correr el test y ver que pasa**

Run: `npm test`
Expected: PASS — 5 tests

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json vitest.config.ts lib/reports/weekly/types.ts lib/reports/weekly/window.ts lib/reports/weekly/window.test.ts
git commit -m "feat(informe-semanal): ventana semanal en hora AR + setup de vitest"
```

---

### Task 2: Clave de teléfono y bucketeo

**Files:**
- Create: `lib/reports/weekly/phone.ts`
- Create: `lib/reports/weekly/buckets.ts`
- Test: `lib/reports/weekly/phone.test.ts`
- Test: `lib/reports/weekly/buckets.test.ts`

**Interfaces:**
- Consumes: `Bucket`, `BUCKETS` de `./types`.
- Produces: `phoneKey(raw: string | null | undefined): string | null` (desde `phone.ts`); `bucketOf(hours: number | null): Bucket` (desde `buckets.ts`).

- [ ] **Step 1: Escribir los tests de `phoneKey` (que fallan)**

Los formatos son los que existen de verdad en la base y en los emails.

```ts
import { describe, it, expect } from "vitest"
import { phoneKey } from "./phone"

describe("phoneKey", () => {
  it("los formatos reales del mismo número caen en la misma clave", () => {
    const esperado = "1151175948"
    expect(phoneKey("+5491151175948")).toBe(esperado)
    expect(phoneKey("5491151175948")).toBe(esperado)
    expect(phoneKey("+54 9 11 5117-5948")).toBe(esperado)
    expect(phoneKey("541151175948")).toBe(esperado)
  })

  it("acepta números ya cortos, sin código de país", () => {
    expect(phoneKey("1140290585")).toBe("1140290585")
  })

  it("tolera espacios y separadores", () => {
    expect(phoneKey("+54 1150458476")).toBe("1150458476")
  })

  it("devuelve null cuando no hay dígitos suficientes", () => {
    expect(phoneKey("")).toBeNull()
    expect(phoneKey(null)).toBeNull()
    expect(phoneKey(undefined)).toBeNull()
    expect(phoneKey("sin teléfono")).toBeNull()
    expect(phoneKey("12345")).toBeNull()
  })

  it("un número extranjero también se reduce a sus últimos 10 dígitos", () => {
    expect(phoneKey(" 19195996777")).toBe("9195996777")
  })
})
```

- [ ] **Step 2: Escribir los tests de `bucketOf` (que fallan)**

Los bordes exactos son lo único que puede romperse en silencio.

```ts
import { describe, it, expect } from "vitest"
import { bucketOf } from "./buckets"

describe("bucketOf", () => {
  it("null es 'sin atender'", () => {
    expect(bucketOf(null)).toBe("sin atender")
  })

  it("los bordes caen para arriba", () => {
    expect(bucketOf(0)).toBe("<1h")
    expect(bucketOf(0.99)).toBe("<1h")
    expect(bucketOf(1)).toBe("1-4h")
    expect(bucketOf(3.99)).toBe("1-4h")
    expect(bucketOf(4)).toBe("4-24h")
    expect(bucketOf(23.99)).toBe("4-24h")
    expect(bucketOf(24)).toBe("+24h")
    expect(bucketOf(500)).toBe("+24h")
  })
})
```

- [ ] **Step 3: Correr los tests y ver que fallan**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./phone"` y `"./buckets"`

- [ ] **Step 4: Implementar `lib/reports/weekly/phone.ts`**

```ts
/**
 * Clave para cruzar el mismo teléfono entre fuentes distintas.
 *
 * En la base conviven formatos incompatibles para el mismo número: "+54 1150458476",
 * "5491154054949", "1140290585". Los últimos 10 dígitos son la única parte estable
 * (código de área + número), así que esa es la clave.
 *
 * No se usa normalizePhoneE164 de lib/whatsapp/phone: esa función valida y devuelve
 * null para los números guardados sin código de país, que acá igual hay que matchear.
 */
export function phoneKey(raw: string | null | undefined): string | null {
  const digitos = String(raw ?? "").replace(/\D/g, "")
  if (digitos.length < 10) return null
  return digitos.slice(-10)
}
```

- [ ] **Step 5: Implementar `lib/reports/weekly/buckets.ts`**

```ts
import type { Bucket } from "./types"

/**
 * Rango de tiempo de una respuesta. Los umbrales son los mismos que usa el panel de
 * handoffs sin atender (demorado a las 2h, crítico a las 24h), abiertos a 1h y 4h para
 * que el director vea dónde se traba.
 *
 * Los bordes caen para arriba: exactamente 1h ya es "1-4h".
 */
export function bucketOf(hours: number | null): Bucket {
  if (hours === null) return "sin atender"
  if (hours < 1) return "<1h"
  if (hours < 4) return "1-4h"
  if (hours < 24) return "4-24h"
  return "+24h"
}
```

- [ ] **Step 6: Correr los tests y ver que pasan**

Run: `npm test`
Expected: PASS — 12 tests en total (5 de window + 5 de phone + 2 de buckets)

- [ ] **Step 7: Commit**

```bash
git add lib/reports/weekly/phone.ts lib/reports/weekly/phone.test.ts lib/reports/weekly/buckets.ts lib/reports/weekly/buckets.test.ts
git commit -m "feat(informe-semanal): clave de telefono y rangos de tiempo"
```

---

### Task 3: Agregación pura del informe

**Files:**
- Create: `lib/reports/weekly/data.ts`
- Test: `lib/reports/weekly/data.test.ts`

**Interfaces:**
- Consumes: `DerivationEvent`, `AgentRow`, `SignalRow`, `BUCKETS`, `Bucket` de `./types`; `bucketOf` de `./buckets`.
- Produces: `buildAgentRows(events: DerivationEvent[]): AgentRow[]` y `buildSignalRows(events: DerivationEvent[]): SignalRow[]`. Ambas devuelven las filas por asesor ordenadas por `total` descendente y **una última fila con `agent: "TOTAL"`** — incluso si no hay eventos, en cuyo caso devuelven solo la fila TOTAL en cero.

- [ ] **Step 1: Escribir los tests (que fallan)**

```ts
import { describe, it, expect } from "vitest"
import { buildAgentRows, buildSignalRows } from "./data"
import type { DerivationEvent } from "./types"

/** Helper: un evento con todo apagado salvo lo que se pase. */
function ev(over: Partial<DerivationEvent> = {}): DerivationEvent {
  return {
    agentName: "Ana",
    at: "2026-07-28T12:00:00.000Z",
    replyHours: null,
    visitScheduled: false,
    emailClicked: false,
    ...over,
  }
}

describe("buildAgentRows", () => {
  it("agrupa por asesor y cuenta cada rango", () => {
    const rows = buildAgentRows([
      ev({ agentName: "Ana", replyHours: 0.5 }),
      ev({ agentName: "Ana", replyHours: 30 }),
      ev({ agentName: "Ana", replyHours: null }),
      ev({ agentName: "Beto", replyHours: 2 }),
    ])
    const ana = rows.find((r) => r.agent === "Ana")!
    expect(ana.total).toBe(3)
    expect(ana.attended).toBe(2)
    expect(ana.pct).toBe(67)
    expect(ana.buckets["<1h"]).toBe(1)
    expect(ana.buckets["+24h"]).toBe(1)
    expect(ana.buckets["sin atender"]).toBe(1)

    const beto = rows.find((r) => r.agent === "Beto")!
    expect(beto.total).toBe(1)
    expect(beto.buckets["1-4h"]).toBe(1)
  })

  it("ordena por volumen descendente y deja TOTAL al final", () => {
    const rows = buildAgentRows([
      ev({ agentName: "Beto" }),
      ev({ agentName: "Ana" }),
      ev({ agentName: "Ana" }),
    ])
    expect(rows.map((r) => r.agent)).toEqual(["Ana", "Beto", "TOTAL"])
  })

  it("la fila TOTAL suma todo", () => {
    const rows = buildAgentRows([
      ev({ agentName: "Ana", replyHours: 0.5 }),
      ev({ agentName: "Beto", replyHours: null }),
    ])
    const total = rows.at(-1)!
    expect(total.agent).toBe("TOTAL")
    expect(total.total).toBe(2)
    expect(total.attended).toBe(1)
    expect(total.pct).toBe(50)
    expect(total.buckets["<1h"]).toBe(1)
    expect(total.buckets["sin atender"]).toBe(1)
  })

  it("sin eventos devuelve solo TOTAL en cero, con pct null", () => {
    const rows = buildAgentRows([])
    expect(rows).toHaveLength(1)
    expect(rows[0].agent).toBe("TOTAL")
    expect(rows[0].total).toBe(0)
    expect(rows[0].pct).toBeNull()
  })

  it("los eventos sin asesor se agrupan juntos, no se pierden", () => {
    const rows = buildAgentRows([ev({ agentName: "(sin asesor)" }), ev({ agentName: "Ana" })])
    expect(rows.find((r) => r.agent === "(sin asesor)")!.total).toBe(1)
    expect(rows.at(-1)!.total).toBe(2)
  })
})

describe("buildSignalRows", () => {
  it("cuenta las tres señales por separado; un evento puede tener varias", () => {
    const rows = buildSignalRows([
      ev({ agentName: "Ana", replyHours: 3, visitScheduled: true, emailClicked: true }),
      ev({ agentName: "Ana", visitScheduled: true }),
      ev({ agentName: "Ana" }),
    ])
    const ana = rows.find((r) => r.agent === "Ana")!
    expect(ana.total).toBe(3)
    expect(ana.chat).toBe(1)
    expect(ana.visita).toBe(2)
    expect(ana.email).toBe(1)
    expect(ana.sinRastro).toBe(1)
  })

  it("'sin rastro' es no tener NINGUNA de las tres", () => {
    const rows = buildSignalRows([
      ev({ emailClicked: true }),
      ev(),
      ev(),
    ])
    expect(rows.at(-1)!.sinRastro).toBe(2)
  })

  it("el caso real: 27 derivaciones, 0 en el chat", () => {
    const eventos = Array.from({ length: 27 }, () => ev({ agentName: "Carolina" }))
    const total = buildSignalRows(eventos).at(-1)!
    expect(total.total).toBe(27)
    expect(total.chat).toBe(0)
    expect(total.sinRastro).toBe(27)
  })

  it("sin eventos devuelve solo TOTAL en cero", () => {
    const rows = buildSignalRows([])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({ agent: "TOTAL", total: 0, chat: 0, visita: 0, email: 0, sinRastro: 0 })
  })
})
```

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./data"`

- [ ] **Step 3: Implementar `lib/reports/weekly/data.ts`**

```ts
import { BUCKETS, type AgentRow, type Bucket, type DerivationEvent, type SignalRow } from "./types"
import { bucketOf } from "./buckets"

function bucketsVacios(): Record<Bucket, number> {
  return Object.fromEntries(BUCKETS.map((b) => [b, 0])) as Record<Bucket, number>
}

function porcentaje(parte: number, total: number): number | null {
  return total ? Math.round((parte / total) * 100) : null
}

/**
 * Agrupa los eventos por asesor en el mismo orden en que se leen y devuelve las filas
 * ordenadas por volumen, con TOTAL al final.
 *
 * El genérico es para no repetir el agrupar/ordenar/totalizar en las dos tablas.
 */
function agrupar<T extends { agent: string; total: number }>(
  events: DerivationEvent[],
  filaVacia: (agent: string) => T,
  acumular: (fila: T, ev: DerivationEvent) => void,
  cerrar: (fila: T) => T,
): T[] {
  const porAsesor = new Map<string, T>()
  const total = filaVacia("TOTAL")

  for (const ev of events) {
    let fila = porAsesor.get(ev.agentName)
    if (!fila) {
      fila = filaVacia(ev.agentName)
      porAsesor.set(ev.agentName, fila)
    }
    acumular(fila, ev)
    acumular(total, ev)
  }

  const filas = [...porAsesor.values()]
  // Más derivaciones primero; a igual volumen, alfabético, para que el orden sea estable
  // semana a semana y el director pueda comparar.
  filas.sort((a, b) => b.total - a.total || a.agent.localeCompare(b.agent, "es"))

  return [...filas.map(cerrar), cerrar(total)]
}

/** Tabla de handoffs: intervención en el chat, repartida por rango de tiempo. */
export function buildAgentRows(events: DerivationEvent[]): AgentRow[] {
  return agrupar<AgentRow>(
    events,
    (agent) => ({ agent, total: 0, attended: 0, pct: null, buckets: bucketsVacios() }),
    (fila, ev) => {
      fila.total++
      if (ev.replyHours !== null) fila.attended++
      fila.buckets[bucketOf(ev.replyHours)]++
    },
    (fila) => ({ ...fila, pct: porcentaje(fila.attended, fila.total) }),
  )
}

/** Tabla de visita y link: las tres señales por separado, sin mezclarlas en un %. */
export function buildSignalRows(events: DerivationEvent[]): SignalRow[] {
  return agrupar<SignalRow>(
    events,
    (agent) => ({ agent, total: 0, chat: 0, visita: 0, email: 0, sinRastro: 0 }),
    (fila, ev) => {
      fila.total++
      if (ev.replyHours !== null) fila.chat++
      if (ev.visitScheduled) fila.visita++
      if (ev.emailClicked) fila.email++
      if (ev.replyHours === null && !ev.visitScheduled && !ev.emailClicked) fila.sinRastro++
    },
    (fila) => fila,
  )
}
```

- [ ] **Step 4: Correr los tests y ver que pasan**

Run: `npm test`
Expected: PASS — 21 tests en total

- [ ] **Step 5: Commit**

```bash
git add lib/reports/weekly/data.ts lib/reports/weekly/data.test.ts
git commit -m "feat(informe-semanal): agregacion por asesor con rangos y las tres senales"
```

---

### Task 4: Lecturas de Supabase y de Resend

**Files:**
- Create: `lib/reports/weekly/sources.ts`

**Interfaces:**
- Consumes: `getAdminDb` de `@/lib/admin-vakdor/logger`; `WeekWindow` de `./types`; `phoneKey` de `./phone`.
- Produces:
  - `type Agencia = { id: string; name: string; ownerEmail: string | null; ownerName: string | null }`
  - `type ResendEmail = { id: string; to: string; subject: string; createdAt: string; clicked: boolean; phoneKey: string | null }`
  - `fetchAgencias(): Promise<Agencia[]>`
  - `fetchConsultas(agencyId: string, w: WeekWindow): Promise<number>`
  - `fetchHandoffs(agencyId: string, w: WeekWindow): Promise<{ conversationId: string; at: string }[]>`
  - `fetchConversaciones(agencyId: string): Promise<{ id: string; phone: string | null; agentId: string | null }[]>`
  - `fetchAsesores(agencyId: string): Promise<Map<string, string>>` — devuelve **dos** claves por asesor: su `id` y su `email` en minúsculas, ambas apuntando al `full_name`
  - `fetchMensajesDesde(agencyId: string, conversationIds: string[], sinceUtc: string): Promise<{ conversationId: string; role: string; content: string | null; at: string }[]>`
  - `fetchVisitasDesde(agencyId: string, sinceUtc: string): Promise<{ phoneKey: string | null; at: string }[]>`
  - `fetchEtapasPipeline(agencyId: string): Promise<Map<string, string>>` — clave = `phoneKey`, valor = etapa
  - `fetchResendEmails(w: WeekWindow): Promise<ResendEmail[] | null>` — `null` si Resend falló

- [ ] **Step 1: Implementar `lib/reports/weekly/sources.ts`**

Este módulo es el único que toca la red. No calcula nada: devuelve filas.

```ts
import { getAdminDb } from "@/lib/admin-vakdor/logger"
import { phoneKey } from "./phone"
import type { WeekWindow } from "./types"

export interface Agencia {
  id: string
  name: string
  ownerEmail: string | null
  ownerName: string | null
}

export interface ResendEmail {
  id: string
  to: string
  subject: string
  createdAt: string
  clicked: boolean
  /** Teléfono del lead, sacado del HTML del email. null si no se pudo leer. */
  phoneKey: string | null
}

/** Inmobiliarias activas con su director fundador (agencies.owner_id). */
export async function fetchAgencias(): Promise<Agencia[]> {
  const db = getAdminDb()
  const { data: agencias, error } = await db
    .from("agencies")
    .select("id, name, owner_id")
    .eq("estado", "activo")
  if (error) throw new Error(`fetchAgencias: ${error.message}`)

  const ownerIds = (agencias ?? []).map((a) => a.owner_id).filter(Boolean) as string[]
  const { data: owners } = ownerIds.length
    ? await db.from("profiles").select("id, email, full_name").in("id", ownerIds)
    : { data: [] as { id: string; email: string | null; full_name: string | null }[] }

  const porId = new Map((owners ?? []).map((o) => [o.id, o]))
  return (agencias ?? []).map((a) => {
    const owner = a.owner_id ? porId.get(a.owner_id) : undefined
    return {
      id: a.id,
      name: a.name ?? "Inmobiliaria",
      ownerEmail: owner?.email ?? null,
      ownerName: owner?.full_name ?? null,
    }
  })
}

/**
 * Consultas ingresadas: conversaciones creadas en la semana CON al menos un mensaje
 * del cliente. Sin ese filtro, una campaña masiva infla el número (1.397 vs 232 reales
 * la semana del 20-jul).
 *
 * Se resuelve en dos pasos porque supabase-js no expone EXISTS: se traen los ids de las
 * conversaciones nuevas y después los ids que tienen algún mensaje 'lead'.
 */
export async function fetchConsultas(agencyId: string, w: WeekWindow): Promise<number> {
  const db = getAdminDb()
  const { data: nuevas, error } = await db
    .from("wa_conversations")
    .select("id")
    .eq("agency_id", agencyId)
    .gte("created_at", w.startUtc)
    .lte("created_at", w.endUtc)
  if (error) throw new Error(`fetchConsultas: ${error.message}`)

  const ids = (nuevas ?? []).map((c) => c.id)
  if (!ids.length) return 0

  const conMensaje = new Set<string>()
  // La lista puede ser grande (1.397 en la semana de la campaña): se pagina de a 500
  // para no pasarse del largo máximo de URL de PostgREST.
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await db
      .from("wa_messages")
      .select("conversation_id")
      .eq("agency_id", agencyId)
      .eq("role", "lead")
      .in("conversation_id", ids.slice(i, i + 500))
    for (const m of data ?? []) conMensaje.add(m.conversation_id)
  }
  return conMensaje.size
}

/**
 * Handoffs de la semana: el mensaje interno con la marca. Si una conversación se derivó
 * más de una vez, vale la última (se ordena descendente y se queda con la primera vista).
 */
export async function fetchHandoffs(
  agencyId: string,
  w: WeekWindow,
): Promise<{ conversationId: string; at: string }[]> {
  const db = getAdminDb()
  const { data, error } = await db
    .from("wa_messages")
    .select("conversation_id, created_at")
    .eq("agency_id", agencyId)
    .eq("role", "internal")
    .ilike("content", "%Handoff activado%")
    .gte("created_at", w.startUtc)
    .lte("created_at", w.endUtc)
    .order("created_at", { ascending: false })
  if (error) throw new Error(`fetchHandoffs: ${error.message}`)

  const vistas = new Map<string, string>()
  for (const m of data ?? []) {
    if (!vistas.has(m.conversation_id)) vistas.set(m.conversation_id, m.created_at)
  }
  return [...vistas].map(([conversationId, at]) => ({ conversationId, at }))
}

export async function fetchConversaciones(
  agencyId: string,
): Promise<{ id: string; phone: string | null; agentId: string | null }[]> {
  const db = getAdminDb()
  const filas: { id: string; phone: string | null; agentId: string | null }[] = []
  // Central tiene ~1.700 conversaciones: PostgREST corta en 1.000 por defecto, así que
  // se pagina explícitamente.
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await db
      .from("wa_conversations")
      .select("id, contact_phone, agent_id")
      .eq("agency_id", agencyId)
      .range(desde, desde + 999)
    if (error) throw new Error(`fetchConversaciones: ${error.message}`)
    for (const c of data ?? []) filas.push({ id: c.id, phone: c.contact_phone, agentId: c.agent_id })
    if (!data || data.length < 1000) break
  }
  return filas
}

/** Nombres de asesores buscables por id Y por email (el email es la clave en Resend). */
export async function fetchAsesores(agencyId: string): Promise<Map<string, string>> {
  const db = getAdminDb()
  const { data, error } = await db
    .from("profiles")
    .select("id, email, full_name")
    .eq("agency_id", agencyId)
  if (error) throw new Error(`fetchAsesores: ${error.message}`)

  const mapa = new Map<string, string>()
  for (const p of data ?? []) {
    const nombre = p.full_name ?? p.email ?? "(sin nombre)"
    mapa.set(p.id, nombre)
    if (p.email) mapa.set(p.email.toLowerCase(), nombre)
  }
  return mapa
}

export async function fetchMensajesDesde(
  agencyId: string,
  conversationIds: string[],
  sinceUtc: string,
): Promise<{ conversationId: string; role: string; content: string | null; at: string }[]> {
  if (!conversationIds.length) return []
  const db = getAdminDb()
  const filas: { conversationId: string; role: string; content: string | null; at: string }[] = []
  for (let i = 0; i < conversationIds.length; i += 200) {
    const { data, error } = await db
      .from("wa_messages")
      .select("conversation_id, role, content, created_at")
      .eq("agency_id", agencyId)
      .in("conversation_id", conversationIds.slice(i, i + 200))
      .gte("created_at", sinceUtc)
      .order("created_at", { ascending: true })
    if (error) throw new Error(`fetchMensajesDesde: ${error.message}`)
    for (const m of data ?? []) {
      filas.push({ conversationId: m.conversation_id, role: m.role, content: m.content, at: m.created_at })
    }
  }
  return filas
}

/** Visitas cargadas desde el inicio de la ventana, para la señal "quedó la visita". */
export async function fetchVisitasDesde(
  agencyId: string,
  sinceUtc: string,
): Promise<{ phoneKey: string | null; at: string }[]> {
  const db = getAdminDb()
  const { data, error } = await db
    .from("scheduled_visits")
    .select("telefono, created_at")
    .eq("agency_id", agencyId)
    .gte("created_at", sinceUtc)
  if (error) throw new Error(`fetchVisitasDesde: ${error.message}`)
  return (data ?? []).map((v) => ({ phoneKey: phoneKey(v.telefono), at: v.created_at }))
}

/**
 * Etapa de cada cliente en el pipeline de Tracking Performance.
 *
 * Misma regla que lib/tracking/pipeline.ts: manda el evento más reciente por created_at
 * entre las actividades vivas y los movimientos manuales del tablero. Las tablas son
 * chicas (28 actividades, 4 movimientos), así que se traen enteras y se cruza en JS.
 */
export async function fetchEtapasPipeline(agencyId: string): Promise<Map<string, string>> {
  const db = getAdminDb()

  const { data: logs, error: errLogs } = await db
    .from("performance_logs")
    .select("type, created_at, wa_contact_id, lead_id, status")
    .eq("agency_id", agencyId)
    .neq("status", "eliminada")
  if (errLogs) throw new Error(`fetchEtapasPipeline logs: ${errLogs.message}`)

  const waIds = [...new Set((logs ?? []).map((l) => l.wa_contact_id).filter(Boolean))] as string[]
  const leadIds = [...new Set((logs ?? []).map((l) => l.lead_id).filter(Boolean))] as string[]

  const { data: contactos } = waIds.length
    ? await db.from("wa_contacts").select("id, phone").in("id", waIds)
    : { data: [] as { id: string; phone: string | null }[] }
  const { data: leads } = leadIds.length
    ? await db.from("leads").select("id, phone").in("id", leadIds)
    : { data: [] as { id: string; phone: string | null }[] }

  const telWa = new Map((contactos ?? []).map((c) => [c.id, c.phone]))
  const telLead = new Map((leads ?? []).map((l) => [l.id, l.phone]))

  // Se queda con el evento más nuevo por cliente.
  const ultimo = new Map<string, { at: string; stage: string }>()
  const anotar = (key: string | null, at: string, stage: string) => {
    if (!key || !stage) return
    const previo = ultimo.get(key)
    if (!previo || at > previo.at) ultimo.set(key, { at, stage })
  }

  for (const l of logs ?? []) {
    const tel = l.wa_contact_id ? telWa.get(l.wa_contact_id) : l.lead_id ? telLead.get(l.lead_id) : null
    anotar(phoneKey(tel), l.created_at, l.type)
  }

  const { data: moves, error: errMoves } = await db
    .from("tracking_pipeline_moves")
    .select("client_key, to_stage, created_at")
    .eq("agency_id", agencyId)
  if (errMoves) throw new Error(`fetchEtapasPipeline moves: ${errMoves.message}`)
  for (const m of moves ?? []) anotar(phoneKey(m.client_key), m.created_at, m.to_stage)

  return new Map([...ultimo].map(([key, v]) => [key, v.stage]))
}

/**
 * Emails mandados en la ventana. Es la ÚNICA evidencia de las derivaciones por visita y
 * por link: Avisar_Asesor manda el email y no escribe nada en wa_messages.
 *
 * Devuelve null si Resend falla, para que el informe salga igual con esas secciones
 * marcadas como no disponibles.
 */
export async function fetchResendEmails(w: WeekWindow): Promise<ResendEmail[] | null> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return null
  const auth = { Authorization: `Bearer ${apiKey}` }

  try {
    const crudos: { id: string; to: string[]; subject: string; created_at: string; last_event: string }[] = []
    let after: string | null = null

    // Techo de 10 páginas (1.000 emails): en 5 meses se mandaron 482, así que sobra.
    for (let pagina = 0; pagina < 10; pagina++) {
      const url = new URL("https://api.resend.com/emails")
      url.searchParams.set("limit", "100")
      if (after) url.searchParams.set("after", after)

      const res = await fetch(url, { headers: auth })
      if (!res.ok) return null
      const json = await res.json()
      const lote = json.data ?? []
      if (!lote.length) break

      crudos.push(...lote)
      after = lote[lote.length - 1].id
      // La lista viene de más nuevo a más viejo: si ya pasamos el inicio de la ventana,
      // no hace falta seguir paginando.
      const masViejo = lote[lote.length - 1].created_at
      if (aIso(masViejo) < w.startUtc) break
      if (!json.has_more) break
    }

    const enVentana = crudos.filter((e) => {
      const at = aIso(e.created_at)
      return at >= w.startUtc && at <= w.endUtc && esDerivacion(e.subject)
    })

    // El teléfono del lead solo está en el detalle. De a 5 en paralelo para no
    // castigar el rate limit ni el tiempo del endpoint.
    const salida: ResendEmail[] = []
    for (let i = 0; i < enVentana.length; i += 5) {
      const lote = await Promise.all(
        enVentana.slice(i, i + 5).map(async (e) => ({
          id: e.id,
          to: (e.to?.[0] ?? "").toLowerCase(),
          subject: e.subject,
          createdAt: aIso(e.created_at),
          clicked: e.last_event === "clicked",
          phoneKey: await telefonoDelEmail(e.id, auth),
        })),
      )
      salida.push(...lote)
    }
    return salida
  } catch {
    return null
  }
}

/** Resend devuelve "2026-08-02 13:52:20.042000+00", que no es ISO válido para comparar. */
function aIso(fecha: string): string {
  return new Date(fecha.replace(" ", "T")).toISOString()
}

/** Los dos asuntos que genera Avisar_Asesor. El del handoff sale de la base, no de acá. */
export function esDerivacion(subject: string): boolean {
  return /^Quiere visitar/i.test(subject) || /^Nuevo interesado en tu propiedad/i.test(subject)
}

export function esVisita(subject: string): boolean {
  return /^Quiere visitar/i.test(subject)
}

async function telefonoDelEmail(id: string, auth: Record<string, string>): Promise<string | null> {
  try {
    const res = await fetch(`https://api.resend.com/emails/${id}`, { headers: auth })
    if (!res.ok) return null
    const json = await res.json()
    const texto = String(json.html ?? "").replace(/<[^>]+>/g, " ")
    return phoneKey(texto.match(/\b\d{10,14}\b/)?.[0] ?? null)
  } catch {
    return null
  }
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores en `lib/reports/weekly/sources.ts` (el resto del repo puede tener errores preexistentes; solo importa que no aparezca ninguno de este archivo)

- [ ] **Step 3: Commit**

```bash
git add lib/reports/weekly/sources.ts
git commit -m "feat(informe-semanal): lecturas de supabase y de la api de resend"
```

---

### Task 5: Armado del informe de una inmobiliaria

**Files:**
- Create: `lib/reports/weekly/report.ts`
- Test: `lib/reports/weekly/report.test.ts`

**Interfaces:**
- Consumes: todo lo de `./sources`, `./data`, `./phone`, `./types`.
- Produces: `buildReport(agencia: Agencia, w: WeekWindow, emails: ResendEmail[] | null): Promise<WeeklyReport>` y la función pura `primeraRespuesta(mensajes, conversationId, desde): number | null`.

- [ ] **Step 1: Escribir el test de `primeraRespuesta` (que falla)**

Es la regla que decide si un asesor intervino: el único cálculo delicado del módulo.

```ts
import { describe, it, expect } from "vitest"
import { primeraRespuesta } from "./report"

const M = (role: string, at: string, content = "hola") => ({
  conversationId: "c1",
  role,
  content,
  at,
})

describe("primeraRespuesta", () => {
  const desde = "2026-07-28T12:00:00.000Z"

  it("un mensaje 'human' posterior cuenta, en horas", () => {
    const h = primeraRespuesta([M("human", "2026-07-28T14:30:00.000Z")], "c1", desde)
    expect(h).toBeCloseTo(2.5, 5)
  })

  it("un 'internal' que no es la marca también cuenta: los asesores quedan así a veces", () => {
    const h = primeraRespuesta([M("internal", "2026-07-28T13:00:00.000Z", "Hola, soy Carolina")], "c1", desde)
    expect(h).toBeCloseTo(1, 5)
  })

  it("la marca del handoff NO cuenta como respuesta", () => {
    const h = primeraRespuesta(
      [M("internal", "2026-07-28T13:00:00.000Z", "⚠️ Handoff activado: El bot se ha desactivado.")],
      "c1",
      desde,
    )
    expect(h).toBeNull()
  })

  it("el bot y el cliente no cuentan", () => {
    const h = primeraRespuesta(
      [M("bot", "2026-07-28T13:00:00.000Z"), M("lead", "2026-07-28T14:00:00.000Z")],
      "c1",
      desde,
    )
    expect(h).toBeNull()
  })

  it("lo anterior a la derivación no cuenta", () => {
    const h = primeraRespuesta([M("human", "2026-07-28T11:00:00.000Z")], "c1", desde)
    expect(h).toBeNull()
  })

  it("mensajes de otra conversación no cuentan", () => {
    const otro = { ...M("human", "2026-07-28T13:00:00.000Z"), conversationId: "c2" }
    expect(primeraRespuesta([otro], "c1", desde)).toBeNull()
  })

  it("con varias respuestas gana la primera", () => {
    const h = primeraRespuesta(
      [M("human", "2026-07-28T18:00:00.000Z"), M("human", "2026-07-28T13:00:00.000Z")],
      "c1",
      desde,
    )
    expect(h).toBeCloseTo(1, 5)
  })
})
```

- [ ] **Step 2: Correr el test y ver que falla**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./report"`

- [ ] **Step 3: Implementar `lib/reports/weekly/report.ts`**

```ts
import { buildAgentRows, buildSignalRows } from "./data"
import { phoneKey } from "./phone"
import {
  esVisita,
  fetchAsesores,
  fetchConsultas,
  fetchConversaciones,
  fetchEtapasPipeline,
  fetchHandoffs,
  fetchMensajesDesde,
  fetchVisitasDesde,
  type Agencia,
  type ResendEmail,
} from "./sources"
import type { DerivationEvent, PipelineRow, WeeklyReport, WeekWindow } from "./types"

const MARCA_HANDOFF = "Handoff activado"
const SIN_ASESOR = "(sin asesor)"

interface Mensaje {
  conversationId: string
  role: string
  content: string | null
  at: string
}

/**
 * Horas hasta el primer mensaje de la agencia después de `desde`, o null si nadie escribió.
 *
 * Cuenta 'human' y también 'internal' que no sea la marca del handoff: algunos mensajes de
 * asesor quedan guardados como internal. Misma regla que lib/queries/handoffs.ts.
 */
export function primeraRespuesta(
  mensajes: Mensaje[],
  conversationId: string,
  desde: string,
): number | null {
  const respuesta = mensajes.find(
    (m) =>
      m.conversationId === conversationId &&
      m.at > desde &&
      (m.role === "human" || (m.role === "internal" && !m.content?.includes(MARCA_HANDOFF))),
  )
  if (!respuesta) return null
  return (new Date(respuesta.at).getTime() - new Date(desde).getTime()) / 3_600_000
}

/** Etiquetas lindas de las etapas del pipeline (mismo orden que lib/tracking/pipeline.ts). */
const ETAPAS: Record<string, string> = {
  prospeccion: "Prospección",
  prelisting: "Prelisting",
  prebuying: "Prebuying",
  captacion: "Captación",
  reserva: "Reserva",
  cierre: "Cierre",
}
const ORDEN_ETAPAS = Object.keys(ETAPAS)

export async function buildReport(
  agencia: Agencia,
  w: WeekWindow,
  emails: ResendEmail[] | null,
): Promise<WeeklyReport> {
  const [consultas, handoffs, conversaciones, asesores, etapas, visitas] = await Promise.all([
    fetchConsultas(agencia.id, w),
    fetchHandoffs(agencia.id, w),
    fetchConversaciones(agencia.id),
    fetchAsesores(agencia.id),
    fetchEtapasPipeline(agencia.id),
    fetchVisitasDesde(agencia.id, w.startUtc),
  ])

  const convPorId = new Map(conversaciones.map((c) => [c.id, c]))
  const convPorTel = new Map<string, (typeof conversaciones)[number]>()
  for (const c of conversaciones) {
    const key = phoneKey(c.phone)
    if (key && !convPorTel.has(key)) convPorTel.set(key, c)
  }

  // Los emails de esta inmobiliaria: los que fueron a un asesor con perfil acá.
  const mios = (emails ?? []).filter((e) => asesores.has(e.to))
  const deVisita = mios.filter((e) => esVisita(e.subject))
  const deLink = mios.filter((e) => !esVisita(e.subject))

  // Todas las conversaciones tocadas esta semana, para pedir sus mensajes de una vez.
  const idsEmail = mios
    .map((e) => (e.phoneKey ? convPorTel.get(e.phoneKey)?.id : undefined))
    .filter(Boolean) as string[]
  const ids = [...new Set([...handoffs.map((h) => h.conversationId), ...idsEmail])]
  const mensajes = await fetchMensajesDesde(agencia.id, ids, w.startUtc)

  const huboVisitaDespues = (key: string | null, desde: string): boolean =>
    !!key && visitas.some((v) => v.phoneKey === key && v.at > desde)

  const eventosHandoff: DerivationEvent[] = handoffs.map((h) => {
    const conv = convPorId.get(h.conversationId)
    return {
      agentName: (conv?.agentId && asesores.get(conv.agentId)) || SIN_ASESOR,
      at: h.at,
      replyHours: primeraRespuesta(mensajes, h.conversationId, h.at),
      visitScheduled: huboVisitaDespues(phoneKey(conv?.phone), h.at),
      emailClicked: false, // el email del handoff no se cruza: el handoff ya sale de la base
    }
  })

  const eventoDeEmail = (e: ResendEmail): DerivationEvent => {
    const conv = e.phoneKey ? convPorTel.get(e.phoneKey) : undefined
    return {
      agentName: asesores.get(e.to) ?? SIN_ASESOR,
      at: e.createdAt,
      replyHours: conv ? primeraRespuesta(mensajes, conv.id, e.createdAt) : null,
      visitScheduled: huboVisitaDespues(e.phoneKey, e.createdAt),
      emailClicked: e.clicked,
    }
  }

  // Pipeline: de los leads derivados esta semana, cuáles tienen actividad cargada.
  const telsDerivados = new Set<string>()
  for (const h of handoffs) {
    const key = phoneKey(convPorId.get(h.conversationId)?.phone)
    if (key) telsDerivados.add(key)
  }
  for (const e of mios) if (e.phoneKey) telsDerivados.add(e.phoneKey)

  const conteoEtapas = new Map<string, number>()
  let cargados = 0
  for (const tel of telsDerivados) {
    const etapa = etapas.get(tel)
    if (!etapa) continue
    cargados++
    conteoEtapas.set(etapa, (conteoEtapas.get(etapa) ?? 0) + 1)
  }
  // Ojo: se ordena por la CLAVE cruda ("prospeccion"), no por la etiqueta ("Prospección"),
  // que es lo que está en ORDEN_ETAPAS. Recién después se traduce a etiqueta.
  const filasPipeline: PipelineRow[] = [...conteoEtapas]
    .sort((a, b) => ORDEN_ETAPAS.indexOf(a[0]) - ORDEN_ETAPAS.indexOf(b[0]))
    .map(([stage, count]) => ({ stage: ETAPAS[stage] ?? stage, count }))

  return {
    agencyName: agencia.name,
    window: w,
    consultas,
    handoffs: { total: handoffs.length, rows: buildAgentRows(eventosHandoff) },
    visitas: { total: deVisita.length, rows: buildSignalRows(deVisita.map(eventoDeEmail)) },
    links: { total: deLink.length, rows: buildSignalRows(deLink.map(eventoDeEmail)) },
    pipeline: { derivados: telsDerivados.size, cargados, rows: filasPipeline },
    resendOk: emails !== null,
  }
}
```

- [ ] **Step 4: Correr los tests y ver que pasan**

Run: `npm test`
Expected: PASS — 28 tests en total

- [ ] **Step 5: Commit**

```bash
git add lib/reports/weekly/report.ts lib/reports/weekly/report.test.ts
git commit -m "feat(informe-semanal): armado del informe por inmobiliaria"
```

---

### Task 6: HTML de marca del email

**Files:**
- Create: `lib/reports/weekly/email.ts`

**Interfaces:**
- Consumes: `WeeklyReport`, `AgentRow`, `SignalRow`, `BUCKETS` de `./types`.
- Produces: `renderReport(r: WeeklyReport): { subject: string; html: string }`.

- [ ] **Step 1: Implementar `lib/reports/weekly/email.ts`**

Mismos colores que los emails de `Avisar_Asesor`. Todo con estilos inline y tablas: es lo único que renderiza igual en Gmail, Outlook y celular.

```ts
import { BUCKETS, type AgentRow, type SignalRow, type WeeklyReport } from "./types"

const AZUL = "#131A2D"
const COBRE = "#B57E3B"
const BORDE = "#e1e8ed"
const GRIS = "#888"

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)
}

/** Un número grande con su etiqueta, para la fila de resumen. */
function kpi(valor: string, etiqueta: string): string {
  return `<td style="padding:14px 8px;text-align:center;border:1px solid ${BORDE};background:#fafbfc">
    <div style="font-size:26px;font-weight:700;color:${AZUL};line-height:1">${valor}</div>
    <div style="font-size:11px;color:${GRIS};text-transform:uppercase;letter-spacing:.05em;margin-top:6px">${etiqueta}</div>
  </td>`
}

function seccion(titulo: string, bajada: string, cuerpo: string): string {
  return `<div style="margin:28px 0 0">
    <div style="font-size:12px;color:${COBRE};font-weight:700;text-transform:uppercase;letter-spacing:.08em">${titulo}</div>
    <div style="font-size:13px;color:${GRIS};margin:4px 0 12px;line-height:1.5">${bajada}</div>
    ${cuerpo}
  </div>`
}

function tabla(encabezados: string[], filas: string[][]): string {
  const th = encabezados
    .map(
      (h, i) =>
        `<th style="padding:8px 6px;font-size:11px;color:${GRIS};text-transform:uppercase;letter-spacing:.04em;border-bottom:2px solid ${BORDE};text-align:${i === 0 ? "left" : "center"}">${h}</th>`,
    )
    .join("")

  const tr = filas
    .map((f, idx) => {
      const esTotal = idx === filas.length - 1
      const fondo = esTotal ? "#fafbfc" : "#fff"
      const peso = esTotal ? "700" : "400"
      const tds = f
        .map(
          (v, i) =>
            `<td style="padding:8px 6px;font-size:13px;color:${AZUL};font-weight:${peso};border-bottom:1px solid ${BORDE};text-align:${i === 0 ? "left" : "center"}">${v}</td>`,
        )
        .join("")
      return `<tr style="background:${fondo}">${tds}</tr>`
    })
    .join("")

  return `<table style="width:100%;border-collapse:collapse"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`
}

function filasAgente(rows: AgentRow[]): string[][] {
  return rows.map((r) => [
    esc(r.agent),
    String(r.total),
    r.pct === null ? "—" : `${r.pct}%`,
    ...BUCKETS.map((b) => String(r.buckets[b])),
  ])
}

function filasSenal(rows: SignalRow[]): string[][] {
  return rows.map((r) => [
    esc(r.agent),
    String(r.total),
    String(r.chat),
    String(r.visita),
    String(r.email),
    String(r.sinRastro),
  ])
}

const NO_DISPONIBLE = `<div style="padding:14px;border:1px dashed ${BORDE};border-radius:8px;font-size:13px;color:${GRIS}">
  No se pudo leer el registro de emails esta semana. Los handoffs de arriba no dependen de esto y son correctos.
</div>`

export function renderReport(r: WeeklyReport): { subject: string; html: string } {
  const totalHandoffs = r.handoffs.rows.at(-1)
  const pct = totalHandoffs?.pct
  const sinAtender = totalHandoffs?.buckets["sin atender"] ?? 0

  // Si Resend respondió bien pero no trajo ni un aviso habiendo handoffs, lo más probable
  // es que hayan cambiado el asunto en n8n y las secciones B y C se hayan ido a cero en
  // silencio. Se avisa en vez de mostrar ceros como si fueran reales.
  const sospechaDeAsuntos = r.resendOk && r.handoffs.total > 0 && r.visitas.total === 0 && r.links.total === 0

  const resumen = `<table style="width:100%;border-collapse:collapse;margin-top:18px"><tr>
    ${kpi(String(r.consultas), "Consultas")}
    ${kpi(String(r.handoffs.total), "Handoffs")}
    ${kpi(r.resendOk ? String(r.visitas.total) : "—", "Visitas")}
    ${kpi(pct === null || pct === undefined ? "—" : `${pct}%`, "Atendidos")}
    ${kpi(`${r.pipeline.cargados}/${r.pipeline.derivados}`, "En pipeline")}
  </tr></table>`

  const secHandoffs = seccion(
    "A · Handoffs",
    `El bot derivó ${r.handoffs.total} conversación(es) a un asesor. La tabla muestra en cuánto tiempo alguien de la inmobiliaria escribió en el chat.`,
    tabla(["Asesor", "Derivados", "% atendido", ...BUCKETS], filasAgente(r.handoffs.rows)),
  )

  const bajadaSenales =
    "Después de este aviso el bot sigue conversando, así que el asesor puede haber respondido por su celular. Por eso se muestran las tres señales por separado: escribió en el chat, quedó la visita cargada, o abrió el email."

  const secVisitas = seccion(
    "B · Coordinación de visita",
    r.resendOk
      ? `${r.visitas.total} cliente(s) dieron su disponibilidad y se avisó por email al asesor. ${bajadaSenales}`
      : "Derivaciones por coordinación de visita.",
    r.resendOk
      ? tabla(["Asesor", "Avisos", "Chat", "Visita", "Email", "Sin rastro"], filasSenal(r.visitas.rows))
      : NO_DISPONIBLE,
  )

  const secLinks = seccion(
    "C · Consultas por link",
    r.resendOk
      ? `${r.links.total} consulta(s) por una propiedad puntual, avisadas por email al asesor.`
      : "Consultas por link de propiedad.",
    r.resendOk
      ? tabla(["Asesor", "Avisos", "Chat", "Visita", "Email", "Sin rastro"], filasSenal(r.links.rows))
      : NO_DISPONIBLE,
  )

  const cuerpoPipeline = r.pipeline.rows.length
    ? tabla(
        ["Etapa", "Leads"],
        [
          ...r.pipeline.rows.map((f) => [esc(f.stage), String(f.count)]),
          ["TOTAL CARGADOS", String(r.pipeline.cargados)],
        ],
      )
    : `<div style="padding:14px;border-left:4px solid ${COBRE};background:#fafbfc;border-radius:8px;font-size:14px;color:${AZUL}">
        Ninguno de los ${r.pipeline.derivados} leads derivados esta semana tiene una actividad cargada en Tracking Performance.
      </div>`

  const secPipeline = seccion(
    "D · Pipeline de Tracking Performance",
    `De los ${r.pipeline.derivados} lead(s) que el sistema derivó esta semana, ${r.pipeline.cargados} tienen una actividad cargada en el tablero.`,
    cuerpoPipeline,
  )

  const html = `<div style="background:#f4f7f9;padding:24px 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">
  <div style="max-width:680px;margin:0 auto;background:#fff;border:1px solid ${BORDE};border-radius:16px;overflow:hidden">
    <div style="background:${AZUL};padding:26px 28px">
      <div style="color:#fff;font-size:20px;font-weight:700;letter-spacing:2px">PRISMA<span style="color:${COBRE}"> IA</span></div>
      <div style="color:#fff;font-size:15px;margin-top:10px">${esc(r.agencyName)}</div>
      <div style="color:${COBRE};font-size:13px;margin-top:2px">Semana del ${r.window.label}</div>
    </div>
    <div style="padding:24px 28px">
      ${resumen}
      ${secHandoffs}
      ${secVisitas}
      ${secLinks}
      ${secPipeline}
      <div style="margin-top:28px;padding-top:14px;border-top:1px solid ${BORDE};font-size:11px;color:${GRIS};line-height:1.6">
        Consultas = conversaciones nuevas en las que el cliente escribió al menos una vez.
        "Atendido" = alguien de la inmobiliaria escribió en el chat después de la derivación.
        ${sinAtender ? `<br><strong style="color:${AZUL}">${sinAtender} handoff(s) siguen sin respuesta.</strong>` : ""}
        ${sospechaDeAsuntos ? `<br><strong style="color:#c62828">Revisar: hubo ${r.handoffs.total} handoff(s) pero no se leyó ningún aviso de visita ni de consulta por link. Puede que haya cambiado el asunto de esos emails.</strong>` : ""}
      </div>
    </div>
  </div>
</div>`

  const subject = `PRISMA · ${r.agencyName} — semana del ${r.window.label}${sinAtender ? ` · ${sinAtender} sin atender` : ""}`
  return { subject, html }
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores de `lib/reports/weekly/email.ts`

- [ ] **Step 3: Commit**

```bash
git add lib/reports/weekly/email.ts
git commit -m "feat(informe-semanal): html de marca del email"
```

---

### Task 7: Endpoint del cron

**Files:**
- Create: `app/api/cron/weekly-report/route.ts`

**Interfaces:**
- Consumes: `assertCron` de `@/lib/admin-vakdor/cron-auth`; `previousWeek`, `fetchAgencias`, `fetchResendEmails`, `buildReport`, `renderReport`.
- Produces: `GET /api/cron/weekly-report`, con `?dry=1` (devuelve el HTML sin mandar) y `?agency=<uuid>` (acota a una inmobiliaria).

- [ ] **Step 1: Implementar `app/api/cron/weekly-report/route.ts`**

```ts
import { NextResponse } from "next/server"
import { assertCron } from "@/lib/admin-vakdor/cron-auth"
import { renderReport } from "@/lib/reports/weekly/email"
import { buildReport } from "@/lib/reports/weekly/report"
import { fetchAgencias, fetchResendEmails } from "@/lib/reports/weekly/sources"
import { previousWeek } from "@/lib/reports/weekly/window"

export const dynamic = "force-dynamic"
export const maxDuration = 60

interface Resultado {
  agencia: string
  enviado: boolean
  motivo?: string
}

export async function GET(req: Request) {
  const denied = assertCron(req)
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const dry = searchParams.get("dry") === "1"
  const soloAgencia = searchParams.get("agency")

  const w = previousWeek()
  let agencias = await fetchAgencias()
  if (soloAgencia) agencias = agencias.filter((a) => a.id === soloAgencia)

  // Resend es una sola cuenta para todas: se lee una vez y se reparte por destinatario.
  const emails = await fetchResendEmails(w)

  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM ?? "PRISMA <no-reply@vakbot.vakdor.com>"
  const resultados: Resultado[] = []
  const previews: { agencia: string; subject: string; html: string }[] = []

  for (const agencia of agencias) {
    try {
      const informe = await buildReport(agencia, w, emails)
      const { subject, html } = renderReport(informe)

      if (dry) {
        previews.push({ agencia: agencia.name, subject, html })
        resultados.push({ agencia: agencia.name, enviado: false, motivo: "dry run" })
        continue
      }
      if (!agencia.ownerEmail) {
        resultados.push({ agencia: agencia.name, enviado: false, motivo: "la inmobiliaria no tiene director fundador con email" })
        continue
      }
      if (!apiKey) {
        resultados.push({ agencia: agencia.name, enviado: false, motivo: "falta RESEND_API_KEY" })
        continue
      }

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [agencia.ownerEmail], subject, html }),
      })
      resultados.push(
        res.ok
          ? { agencia: agencia.name, enviado: true }
          : { agencia: agencia.name, enviado: false, motivo: `Resend ${res.status}: ${(await res.text()).slice(0, 200)}` },
      )
    } catch (e) {
      // Una inmobiliaria rota no puede impedir que las demás reciban el suyo.
      resultados.push({ agencia: agencia.name, enviado: false, motivo: String(e).slice(0, 300) })
    }
  }

  // En dry run se devuelve el HTML de la primera para poder mirarlo en el navegador.
  if (dry && previews.length === 1) {
    return new NextResponse(previews[0].html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    })
  }

  const alguno = resultados.some((r) => r.enviado)
  return NextResponse.json(
    { ok: dry || alguno, semana: w.label, resendOk: emails !== null, resultados, previews: dry ? previews : undefined },
    { status: dry || alguno || !resultados.length ? 200 : 500 },
  )
}
```

- [ ] **Step 2: Verificar que compila y que el build pasa**

Run: `npx tsc --noEmit && npm run build`
Expected: build exitoso, con `/api/cron/weekly-report` en la lista de rutas

- [ ] **Step 3: Commit**

```bash
git add app/api/cron/weekly-report/route.ts
git commit -m "feat(informe-semanal): endpoint del cron con modo dry-run"
```

---

### Task 8: GitHub Action, verificación contra los números reales y docs

**Files:**
- Create: `.github/workflows/weekly-report.yml`
- Modify: `docs/interno/TECNICO-PRISMA.md`
- Modify: `docs/interno/LOGICA-PRISMA.md`
- Modify: `docs/compartible/estandarizada/FUNCIONAL-DIRECTOR-PRISMA.md`

`FUNCIONAL-ASESOR-PRISMA.md` **no** se toca: el informe va solo al director fundador, el
asesor no recibe nada ni cambia nada de lo que él hace.

**Interfaces:**
- Consumes: el endpoint de la Task 7.
- Produces: nada que consuma otra tarea.

- [ ] **Step 1: Crear `.github/workflows/weekly-report.yml`**

Mismo patrón que `campaigns-drip.yml`, que ya funciona.

```yaml
name: PRISMA Informe Semanal

on:
  schedule:
    # Lunes 11:00 UTC = 8:00 de la mañana en Argentina.
    # El endpoint calcula solo la semana anterior (lunes a domingo), así que no hay
    # riesgo de mandar el informe equivocado si GitHub demora la corrida.
    - cron: '0 11 * * 1'
  workflow_dispatch:
    # Permite dispararlo a mano desde la pestaña Actions.

jobs:
  informe:
    runs-on: ubuntu-latest
    steps:
      - name: Enviar informe semanal a los directores
        run: |
          curl -sS --fail-with-body -X GET \
            "https://${{ secrets.SITE_DOMAIN }}/api/cron/weekly-report" \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```

- [ ] **Step 2: Levantar el server local**

Run: `npm run dev`
Expected: arranca en `http://localhost:3000`

- [ ] **Step 3: Verificar el dry run contra los números medidos a mano**

Con el `CRON_SECRET` del `.env` local:

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/cron/weekly-report?dry=1&agency=4962bf85-a92c-4c33-ba07-380686bbab76" \
  -o informe.html
```

Abrir `informe.html` en el navegador y comparar contra los números medidos a mano
para la semana del 27-jul al 2-ago (solo si el lunes de la corrida es el 3-ago; si no,
la ventana es otra y hay que comparar con lo que devuelva la propia consulta):

| Dato | Esperado |
|---|---|
| Consultas | 131 |
| Handoffs | 29 |
| Handoffs atendidos | 7 (24%) |
| Handoffs sin atender | 22 |
| Derivaciones por visita | 27 |
| Visitas con "chat" | 0 |
| Leads en pipeline | 0 de ~56 |
| Asesores en la tabla de handoffs | Carolina Grossi (10), Ailen Arnay (7), Eric Zambrana (5), Yanil Torres (4), Maximiliano Filoreto (1), Mónica Romero (1), Johanna Feldman (1) |

Si algún número no coincide, **parar y diagnosticar antes de seguir**: el informe va a un
cliente real y un número mal es peor que no mandarlo.

- [ ] **Step 4: Verificar que sin el header devuelve 401**

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/cron/weekly-report"
```
Expected: `401`

- [ ] **Step 5: Documentar en `docs/interno/TECNICO-PRISMA.md`**

Agregar una sección "Informe semanal al director" con, como mínimo, estos puntos:

- Corre por GitHub Action (`.github/workflows/weekly-report.yml`), lunes 11:00 UTC, contra
  `GET /api/cron/weekly-report` con `Authorization: Bearer CRON_SECRET`. No usa Vercel Cron
  porque el plan es free.
- Destinatario: `agencies.owner_id` de cada agencia con `estado='activo'`. Los directores que
  se sumaron después con un código de invitación **no** reciben el informe.
- La ventana es siempre la semana anterior completa (lunes a domingo, hora AR), calculada en
  `lib/reports/weekly/window.ts`. Volver a disparar el workflow el mismo lunes manda el mismo
  informe, no uno distinto.
- `?dry=1` devuelve el HTML sin mandar nada; `&agency=<uuid>` lo acota a una inmobiliaria.
- Origen de cada métrica: consultas y handoffs salen de la base; **las derivaciones por
  visita y por link salen de la API de Resend**, porque `Avisar_Asesor` no escribe nada en
  `wa_messages`.
- **Riesgo del contrato de asuntos:** el informe reconoce los emails por el asunto
  (`Quiere visitar:` y `Nuevo interesado en tu propiedad:`). Si alguien los cambia en n8n,
  esas secciones se van a cero. Por eso el pie del email avisa cuando hay handoffs pero
  cero avisos leídos.
- Si en algún momento se le agrega a `Avisar_Asesor` un mensaje interno como el que deja
  `Gestion_Handoff`, conviene migrar esas dos secciones a la base y dejar de depender de Resend.

- [ ] **Step 6: Documentar en `docs/interno/LOGICA-PRISMA.md`**

En la parte donde ya está explicado el handoff, agregar que ahora existe una lectura semanal
de esos mismos eventos, y dejar asentada la diferencia de fondo entre los dos tipos de
derivación, que es lo que explica los números:

- **Handoff** (`Gestion_Handoff`): apaga el bot y deja el mensaje interno. El asesor **tiene
  que** entrar al chat, así que "no respondió" significa que el cliente quedó sin nadie.
- **Aviso de visita / de link** (`Avisar_Asesor`): manda el email y **deja el bot encendido**.
  El asesor no está obligado a entrar al chat, así que su falta de mensajes no prueba que no
  haya hecho nada. Por eso el informe muestra tres señales separadas y no un único porcentaje.

- [ ] **Step 7: Documentar en `docs/compartible/estandarizada/FUNCIONAL-DIRECTOR-PRISMA.md`**

En lenguaje simple, sin tecnicismos y sin nombrar tablas ni flujos (regla de las guías
funcionales). Texto sugerido, ajustable al tono del documento:

> ### Tu informe de los lunes
>
> Todos los lunes a la mañana te llega un email con lo que pasó la semana anterior. No hay
> que entrar a ningún lado ni pedirlo: llega solo, y lo recibís únicamente vos.
>
> Arriba de todo vas a ver cinco números: cuántas consultas nuevas entraron, cuántas
> conversaciones le pasó el sistema a un asesor, cuántos clientes pidieron coordinar una
> visita, qué porcentaje de esas derivaciones fue atendido, y cuántos de esos clientes
> quedaron cargados en el tablero de seguimiento.
>
> Después viene el detalle por asesor. En **Handoffs** figura cuánto tardó cada uno en
> contestarle al cliente: menos de una hora, entre una y cuatro, entre cuatro y un día, más
> de un día, o directamente sin atender. Acá el bot ya se apagó, así que si nadie contestó,
> el cliente se quedó esperando.
>
> En **Coordinación de visita** vas a ver tres columnas en vez de un solo número. Es a
> propósito: cuando un cliente pide visitar una propiedad, el asistente le avisa por email al
> asesor pero sigue conversando con el cliente. Entonces el asesor puede haberlo llamado por
> teléfono sin escribir nada en el sistema. Las tres columnas te dicen qué rastro dejó:
> si escribió en el chat, si quedó la visita cargada, o si al menos abrió el email. La
> columna **"Sin rastro"** son los casos donde no hay ninguna señal de que alguien haya
> hecho algo: son los que conviene preguntar.
>
> La última sección te muestra cuántos de los clientes que el sistema entregó esa semana
> terminaron cargados como actividad en el tablero de seguimiento. Si ese número es bajo,
> significa que los clientes están llegando pero no se están registrando.

- [ ] **Step 8: Commit**

```bash
git add .github/workflows/weekly-report.yml docs/interno/TECNICO-PRISMA.md docs/interno/LOGICA-PRISMA.md docs/compartible/estandarizada/FUNCIONAL-DIRECTOR-PRISMA.md
git commit -m "feat(informe-semanal): github action de los lunes + documentacion"
```

---

## Desvío respecto del spec

El spec listaba un archivo `send.ts` para el POST a Resend. Se descartó: son 10 líneas usadas
en un solo lugar, y separarlas obligaría a pasarle la API key y el `from` por parámetro sin
ganar nada. El envío vive en el `route.ts`. El resto de la estructura es la del spec, más
`types.ts`, `phone.ts`, `buckets.ts` y `report.ts`, que salieron de separar lo puro (testeable)
de lo que toca la red.

## Verificación final antes del merge

- [ ] `npm test` — 28 tests en verde
- [ ] `npm run build` — sin errores
- [ ] El dry run local coincide con los números medidos a mano (Task 8, Step 3)
- [ ] Sin el header, el endpoint devuelve 401
- [ ] Los 3 documentos afectados están actualizados (TECNICO, LOGICA, FUNCIONAL-DIRECTOR)
- [ ] **Pedirle el OK a Leonardo antes de mergear a main** (y antes de que el primer email real le llegue a Kevin)
