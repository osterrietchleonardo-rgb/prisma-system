# Las notas internas hablan con Sofía — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la escalera y el agente de seguimiento lean las notas internas de los asesores: la IA interpreta la nota, frena los avisos si el cliente ya está atendido, y manda UN aviso de registro (chat / visita en calendario / actividad en tracking) cuando la gestión quedó fuera de PRISMA.

**Architecture:** Detección determinista (query: ¿hay nota interna posterior al último mensaje del cliente?) + interpretación por IA (una llamada a Claude con tool forzado, veredicto Zod). Un evento `nota_evaluada` por nota evita re-evaluar y re-avisar. El agente de decisiones recibe la última nota en la semilla. Nada cambia para casos sin nota.

**Tech Stack:** Next.js (App Router) + Supabase + Anthropic SDK (`MODELO` de `lib/admin-vakdor/marketing/claude`) + Zod + Vitest.

**Spec:** `docs/superpowers/specs/2026-09-04-notas-internas-ia-design.md`

## Global Constraints

- Rama nueva `feat/notas-internas-ia` desde `origin/main`, en el worktree `C:\Users\LENOVO\Desktop\CODE\Antigravity - Apps\PRISMA-SYSTEM-superagente`. Nunca `git add -A`: siempre archivos por nombre.
- A `main` solo por PR (`gh pr create` / `gh pr merge N --merge`) y solo con el OK explícito de Leonardo. El push directo a main está bloqueado.
- Tests con Vitest, mismo estilo del repo (`describe`/`it`, fakes inline o inyectados; ver `lib/seguimiento/escalamiento.test.ts`). Correr con `npx vitest run lib/seguimiento` desde el worktree.
- Todo texto visible por asesores/directores en español rioplatense, tono "el sistema te vio y te ayuda", jamás un reto. Las guías FUNCIONAL sin tecnicismos.
- El build de producción va detached (`Start-Process cmd /c ...`), jamás con `npm run dev` corriendo (comparten `.next`).
- La IA del veredicto: modelo `MODELO`, sin thinking (incompatible con `tool_choice` forzado), `max_tokens: 1000`.
- Queries de verificación contra producción: `node scratch/_sa-query.mjs "SQL"` (solo lectura).
- El marcador automático `"⚠️ Handoff activado"` comparte `role='internal'` con las notas reales: SIEMPRE excluirlo.

---

### Task 1: Detección — `notaPosterior` y el marcador de handoff

**Files:**
- Create: `lib/seguimiento/nota-interna.ts`
- Test: `lib/seguimiento/nota-interna.test.ts`

**Interfaces:**
- Consumes: nada nuevo (tipos de `@supabase/supabase-js`).
- Produces: `MARCADOR_HANDOFF: string`, `interface NotaInterna { id: string; content: string; created_at: string }`, `notaPosterior(db, conversationId: string, t0ISO: string): Promise<NotaInterna | null>`.

- [ ] **Step 1: Test que falla**

```ts
// lib/seguimiento/nota-interna.test.ts
import { describe, it, expect } from "vitest"
import { MARCADOR_HANDOFF, notaPosterior } from "./nota-interna"

/** Fake mínimo: cada from() devuelve una cadena donde todo método se encadena y
 *  maybeSingle() resuelve la primera fila que el test le dio para esa tabla. */
function dbDeUnaTabla(filaMaybeSingle: unknown) {
  const chain: Record<string, unknown> = {}
  for (const m of ["select", "eq", "not", "gt", "gte", "order", "limit", "contains", "in", "lt"])
    chain[m] = () => chain
  chain.maybeSingle = async () => ({ data: filaMaybeSingle })
  return { from: () => chain } as never
}

describe("notaPosterior", () => {
  it("devuelve la nota interna posterior a t0", async () => {
    const fila = { id: "n-1", content: "Ya lo llamé, visita el viernes", created_at: "2026-09-03T21:20:00Z" }
    const nota = await notaPosterior(dbDeUnaTabla(fila), "conv-1", "2026-09-03T20:09:00Z")
    expect(nota).toEqual(fila)
  })
  it("sin nota devuelve null", async () => {
    expect(await notaPosterior(dbDeUnaTabla(null), "conv-1", "2026-09-03T20:09:00Z")).toBeNull()
  })
  it("el marcador automático de handoff existe y arranca con el warning", () => {
    expect(MARCADOR_HANDOFF).toBe("⚠️ Handoff activado")
  })
})
```

- [ ] **Step 2: Correr y ver FAIL** — `npx vitest run lib/seguimiento/nota-interna.test.ts` → falla: el módulo no existe.

- [ ] **Step 3: Implementación mínima**

```ts
// lib/seguimiento/nota-interna.ts
import type { SupabaseClient } from "@supabase/supabase-js"

/** El sistema escribe este marcador con role='internal' al apagarse el bot: NO es una nota del asesor. */
export const MARCADOR_HANDOFF = "⚠️ Handoff activado"

export interface NotaInterna {
  id: string
  content: string
  created_at: string
}

/** La última nota interna REAL del asesor posterior a t0 (excluye el marcador automático). */
export async function notaPosterior(
  db: SupabaseClient,
  conversationId: string,
  t0ISO: string
): Promise<NotaInterna | null> {
  const { data } = await db
    .from("wa_messages")
    .select("id, content, created_at")
    .eq("conversation_id", conversationId)
    .eq("role", "internal")
    .not("content", "like", `${MARCADOR_HANDOFF}%`)
    .gt("created_at", t0ISO)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as NotaInterna | null) ?? null
}
```

- [ ] **Step 4: Correr y ver PASS** — `npx vitest run lib/seguimiento/nota-interna.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/seguimiento/nota-interna.ts lib/seguimiento/nota-interna.test.ts
git commit -m "feat(seguimiento): detectar la nota interna del asesor posterior al último mensaje del lead"
```

---

### Task 2: El estado de registro — visita en calendario y actividades del tracking

**Files:**
- Modify: `lib/seguimiento/nota-interna.ts`
- Test: `lib/seguimiento/nota-interna.test.ts`

**Interfaces:**
- Produces:
  - `coincideTelefono(a: string, b: string): boolean` — compara los últimos 8 dígitos (los formatos reales de `scheduled_visits.telefono` mezclan `+54 11...`, `+549...` y `549...`; verificado en producción el 4/9).
  - `interface ActividadTracking { type: string; fecha_actividad: string | null; propiedad_ref: string | null }`
  - `contextoRegistro(db, c: { agency_id: string; contact_phone: string; visit_scheduled_at: string | null }, ahoraMs: number): Promise<{ visitaRegistrada: boolean; actividades: ActividadTracking[] }>`

- [ ] **Step 1: Tests que fallan** (agregar al archivo de test)

```ts
import { coincideTelefono, contextoRegistro } from "./nota-interna"

describe("coincideTelefono: últimos 8 dígitos, sin importar el formato", () => {
  it("matchea +54 11 5045-8476 con 5491150458476", () => {
    expect(coincideTelefono("+54 1150458476", "5491150458476")).toBe(true)
  })
  it("no matchea números distintos ni vacíos", () => {
    expect(coincideTelefono("+5491151175948", "5491154054949")).toBe(false)
    expect(coincideTelefono("", "5491154054949")).toBe(false)
  })
})

describe("contextoRegistro", () => {
  // Fake por tabla: from(tabla) elige la respuesta que el test cargó.
  function dbPorTabla(tablas: Record<string, unknown>) {
    return {
      from(tabla: string) {
        const respuesta = tablas[tabla]
        const chain: Record<string, unknown> = {}
        for (const m of ["select", "eq", "not", "gt", "gte", "order", "limit", "in", "lt"])
          chain[m] = () => chain
        chain.maybeSingle = async () => ({ data: Array.isArray(respuesta) ? respuesta[0] ?? null : respuesta })
        chain.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: respuesta ?? [] }).then(res)
        return chain
      },
    } as never
  }
  const c = { agency_id: "ag-1", contact_phone: "5491136299626", visit_scheduled_at: null }
  const ahora = Date.parse("2026-09-04T12:00:00-03:00")

  it("sin visita en la conversación ni en scheduled_visits ⇒ no registrada; sin contacto ⇒ sin actividades", async () => {
    const r = await contextoRegistro(dbPorTabla({ scheduled_visits: [], wa_contacts: null }), c, ahora)
    expect(r).toEqual({ visitaRegistrada: false, actividades: [] })
  })
  it("una visita futura de scheduled_visits con el mismo teléfono (otro formato) cuenta como registrada", async () => {
    const r = await contextoRegistro(
      dbPorTabla({ scheduled_visits: [{ telefono: "+54 1136299626", fecha_visita: "2026-09-05" }], wa_contacts: null }),
      c, ahora
    )
    expect(r.visitaRegistrada).toBe(true)
  })
  it("visit_scheduled_at en la conversación alcanza solo", async () => {
    const r = await contextoRegistro(dbPorTabla({ scheduled_visits: [], wa_contacts: null }),
      { ...c, visit_scheduled_at: "2026-09-05T15:00:00Z" }, ahora)
    expect(r.visitaRegistrada).toBe(true)
  })
  it("con wa_contact las actividades de performance_logs vuelven", async () => {
    const acts = [{ type: "prospeccion", fecha_actividad: "2026-09-02", propiedad_ref: "Av San Martin 2300" }]
    const r = await contextoRegistro(
      dbPorTabla({ scheduled_visits: [], wa_contacts: { id: "wc-1" }, performance_logs: acts }), c, ahora)
    expect(r.actividades).toEqual(acts)
  })
})
```

- [ ] **Step 2: Correr y ver FAIL** — `npx vitest run lib/seguimiento/nota-interna.test.ts`

- [ ] **Step 3: Implementación** (agregar a `nota-interna.ts`)

```ts
/** Los formatos reales mezclan "+54 11...", "+549..." y "549...": comparamos los últimos 8 dígitos. */
export function coincideTelefono(a: string, b: string): boolean {
  const da = a.replace(/\D/g, "").slice(-8)
  const db_ = b.replace(/\D/g, "").slice(-8)
  return da.length === 8 && da === db_
}

export interface ActividadTracking {
  type: string
  fecha_actividad: string | null
  propiedad_ref: string | null
}

const DIAS_TRACKING = 14

/**
 * Lo que el veredicto necesita saber del registro en PRISMA:
 * - visita registrada = `visit_scheduled_at` en la conversación O una fila futura en
 *   `scheduled_visits` de la agencia cuyo teléfono coincida (últimos 8 dígitos).
 * - actividades del tracking = `performance_logs` del contacto (vía wa_contacts por
 *   teléfono exacto), últimos 14 días. Sin contacto que matchee: lista vacía.
 */
export async function contextoRegistro(
  db: SupabaseClient,
  c: { agency_id: string; contact_phone: string; visit_scheduled_at: string | null },
  ahoraMs: number
): Promise<{ visitaRegistrada: boolean; actividades: ActividadTracking[] }> {
  const hoy = new Date(ahoraMs).toISOString().slice(0, 10)
  const { data: visitas } = await db
    .from("scheduled_visits")
    .select("telefono, fecha_visita")
    .eq("agency_id", c.agency_id)
    .gte("fecha_visita", hoy)
    .limit(50)
  const enCalendario = (visitas ?? []).some((v: { telefono: string | null }) =>
    coincideTelefono(String(v.telefono ?? ""), c.contact_phone))
  const visitaRegistrada = Boolean(c.visit_scheduled_at) || enCalendario

  let actividades: ActividadTracking[] = []
  const { data: contacto } = await db
    .from("wa_contacts").select("id")
    .eq("agency_id", c.agency_id).eq("phone", c.contact_phone).maybeSingle()
  if (contacto?.id) {
    const desde = new Date(ahoraMs - DIAS_TRACKING * 24 * 3600e3).toISOString()
    const { data: acts } = await db
      .from("performance_logs")
      .select("type, fecha_actividad, propiedad_ref")
      .eq("wa_contact_id", contacto.id)
      .gte("created_at", desde)
      .limit(20)
    actividades = (acts ?? []) as ActividadTracking[]
  }
  return { visitaRegistrada, actividades }
}
```

- [ ] **Step 4: Correr y ver PASS**

- [ ] **Step 5: Commit**

```bash
git add lib/seguimiento/nota-interna.ts lib/seguimiento/nota-interna.test.ts
git commit -m "feat(seguimiento): estado de registro del caso (visita en calendario y actividades del tracking)"
```

---

### Task 3: El veredicto de la IA — schema, prompt y la llamada

**Files:**
- Modify: `lib/seguimiento/nota-interna.ts`
- Test: `lib/seguimiento/nota-interna.test.ts`

**Interfaces:**
- Consumes: `MODELO` de `@/lib/admin-vakdor/marketing/claude`; `Anthropic` de `@anthropic-ai/sdk`; `z` de `zod`.
- Produces:
  - `VeredictoNotaSchema` (Zod) y `type VeredictoNota = { atendido: boolean; pedir_registro_chat: boolean; pedir_registro_visita: boolean; pedir_registro_actividad: boolean; razon: string }`
  - `type LlamarVeredicto = (semilla: string) => Promise<VeredictoNota>`
  - `semillaVeredicto(input: { nota: NotaInterna; mensajes: string; visitaRegistrada: boolean; actividades: ActividadTracking[]; propiedadInteres: string | null; ahoraISO: string }): string`
  - `crearLlamadaVeredicto(): LlamarVeredicto` (la real; no se testea unit)

- [ ] **Step 1: Tests que fallan**

```ts
import { semillaVeredicto, VeredictoNotaSchema } from "./nota-interna"

describe("semillaVeredicto: todo lo que la IA necesita, nada inventado", () => {
  const base = {
    nota: { id: "n-1", content: "Ya estamos en contacto, visita el viernes", created_at: "2026-09-03T21:20:00Z" },
    mensajes: "[2026-09-03 17:09] [lead] dale. Le consulto y te aviso",
    visitaRegistrada: false,
    actividades: [],
    propiedadInteres: "Av San Martin al 2300",
    ahoraISO: "2026-09-04 12:00",
  }
  it("incluye la nota, la conversación, la propiedad y el estado del registro", () => {
    const s = semillaVeredicto(base)
    expect(s).toContain("«Ya estamos en contacto, visita el viernes»")
    expect(s).toContain("dale. Le consulto y te aviso")
    expect(s).toContain("Av San Martin al 2300")
    expect(s).toContain("Visita registrada en el calendario de PRISMA: NO")
    expect(s).toContain("(ninguna)")
  })
  it("con visita registrada y actividades lo dice", () => {
    const s = semillaVeredicto({
      ...base, visitaRegistrada: true,
      actividades: [{ type: "prospeccion", fecha_actividad: "2026-09-02", propiedad_ref: "San Martin 2300" }],
    })
    expect(s).toContain("Visita registrada en el calendario de PRISMA: SÍ")
    expect(s).toContain("prospeccion")
    expect(s).toContain("San Martin 2300")
  })
  it("sin propiedad de interés lo dice sin inventar", () => {
    expect(semillaVeredicto({ ...base, propiedadInteres: null })).toContain("sin dato")
  })
})

describe("VeredictoNotaSchema", () => {
  it("acepta el veredicto completo y rechaza el incompleto", () => {
    expect(VeredictoNotaSchema.safeParse({
      atendido: true, pedir_registro_chat: true, pedir_registro_visita: true,
      pedir_registro_actividad: false, razon: "La nota dice que ya lo llamó",
    }).success).toBe(true)
    expect(VeredictoNotaSchema.safeParse({ atendido: true }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Correr y ver FAIL**

- [ ] **Step 3: Implementación** (agregar a `nota-interna.ts`; imports arriba del archivo)

```ts
import Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"
import { MODELO } from "@/lib/admin-vakdor/marketing/claude"

export const VeredictoNotaSchema = z.object({
  atendido: z.boolean(),
  pedir_registro_chat: z.boolean(),
  pedir_registro_visita: z.boolean(),
  pedir_registro_actividad: z.boolean(),
  razon: z.string().min(1),
})
export type VeredictoNota = z.infer<typeof VeredictoNotaSchema>
export type LlamarVeredicto = (semilla: string) => Promise<VeredictoNota>

/** Decisión de Leonardo (4/9): la nota NO se interpreta con reglas — la lee la IA. */
const PROMPT_NOTA = `Sos el intérprete de notas internas del agente de seguimiento de una inmobiliaria argentina. El sistema escala avisos cuando un cliente queda esperando a un asesor; una nota interna del asesor puede indicar que en realidad ya lo está atendiendo por otro canal. Leé la nota y la conversación y emití un veredicto honesto:
- atendido: true SOLO si la nota indica que el asesor ya está gestionando a ESTE cliente (lo llamó, coordinó una visita, le está resolviendo algo, o pide explícitamente que no se le dé seguimiento). Un recordatorio o un detalle ("ojo que pregunta por cochera") NO es atención.
- pedir_registro_chat: true si la gestión ocurrió fuera de PRISMA (teléfono, presencial) y no quedó registrada en el chat.
- pedir_registro_visita: true SOLO si la nota menciona una visita coordinada Y el dato dice que NO está registrada en el calendario.
- pedir_registro_actividad: true SOLO si la gestión que cuenta la nota no aparece reflejada en las actividades del tracking (mirá tipo, fecha y propiedad de cada actividad contra lo que la nota cuenta y la propiedad consultada).
- razon: una o dos frases en castellano citando la nota; la puede leer el asesor.
Si la nota es ambigua, atendido=false: la escalera existe para que ningún cliente quede sin atender, y un aviso de más molesta menos que un cliente perdido.`

const HERRAMIENTA_VEREDICTO = {
  name: "emitir_veredicto",
  description: "Emití tu veredicto sobre la nota interna.",
  input_schema: {
    type: "object",
    properties: {
      atendido: { type: "boolean" },
      pedir_registro_chat: { type: "boolean" },
      pedir_registro_visita: { type: "boolean" },
      pedir_registro_actividad: { type: "boolean" },
      razon: { type: "string" },
    },
    required: ["atendido", "pedir_registro_chat", "pedir_registro_visita", "pedir_registro_actividad", "razon"],
    additionalProperties: false,
  },
} as const

export function semillaVeredicto(input: {
  nota: NotaInterna
  mensajes: string
  visitaRegistrada: boolean
  actividades: ActividadTracking[]
  propiedadInteres: string | null
  ahoraISO: string
}): string {
  const acts = input.actividades.length
    ? input.actividades.map((a) => `  - ${a.type} · ${a.fecha_actividad ?? "sin fecha"} · ${a.propiedad_ref ?? "sin propiedad"}`).join("\n")
    : "  (ninguna)"
  return [
    `Fecha y hora actual (Argentina): ${input.ahoraISO}`,
    `NOTA INTERNA del asesor (el cliente NO la ve): «${input.nota.content}»`,
    `Propiedad de interés del cliente según sus datos: ${input.propiedadInteres ?? "(sin dato)"}`,
    `Visita registrada en el calendario de PRISMA: ${input.visitaRegistrada ? "SÍ" : "NO"}`,
    `Actividades del asesor en el tracking para este cliente (últimos 14 días):\n${acts}`,
    `Conversación real ([internal] son notas del equipo; el cliente no las ve):\n${input.mensajes}`,
    `Emití tu veredicto con emitir_veredicto.`,
  ].join("\n\n")
}

/** Una sola llamada, tool forzado, sin thinking (incompatible con tool_choice forzado). */
export function crearLlamadaVeredicto(): LlamarVeredicto {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY")
  const client = new Anthropic({ apiKey })
  return async (semilla) => {
    const res = await client.messages.create({
      model: MODELO,
      max_tokens: 1000,
      system: PROMPT_NOTA,
      tools: [HERRAMIENTA_VEREDICTO as unknown as Anthropic.Messages.Tool],
      tool_choice: { type: "tool", name: "emitir_veredicto" },
      messages: [{ role: "user", content: semilla }],
    })
    const uso = res.content.find((b) => b.type === "tool_use")
    if (!uso || uso.type !== "tool_use") throw new Error("la IA no emitió veredicto")
    return VeredictoNotaSchema.parse(uso.input)
  }
}
```

- [ ] **Step 4: Correr y ver PASS**

- [ ] **Step 5: Commit**

```bash
git add lib/seguimiento/nota-interna.ts lib/seguimiento/nota-interna.test.ts
git commit -m "feat(seguimiento): el veredicto de la IA sobre la nota interna (schema, prompt y llamada)"
```

---

### Task 4: El aviso de registro — un solo mensaje, tono de ayuda

**Files:**
- Modify: `lib/seguimiento/avisos.ts:34-38` (union `PlantillaEquipo`)
- Modify: `lib/seguimiento/nota-interna.ts`
- Test: `lib/seguimiento/nota-interna.test.ts`

**Interfaces:**
- Consumes: `Aviso`, `PerfilEquipo`, `linkAlChat`, `nombreCliente`, `unaLinea` de `./avisos`.
- Produces: `armarAvisoRegistro(perfil: PerfilEquipo, c: { id: string; contact_phone: string; metricas: Record<string, unknown> }, nota: NotaInterna, v: VeredictoNota, appUrl: string, nombreAgencia: string): Aviso`. En `avisos.ts`, `PlantillaEquipo` suma `"asesor_registro_pendiente"` (hoy NO aprobada en Meta ⇒ `enviarAviso` la omite y sale solo el email; si Central la aprueba después, el WhatsApp arranca solo).

- [ ] **Step 1: Tests que fallan**

```ts
import { armarAvisoRegistro } from "./nota-interna"
import type { PerfilEquipo } from "./avisos"

describe("armarAvisoRegistro: un solo aviso, tono de ayuda, solo los pedidos que aplican", () => {
  const eric: PerfilEquipo = { id: "p-1", full_name: "Eric Zambrana", role: "asesor", email: "e@x.com", phone: "549115..." }
  const conv = { id: "conv-1", contact_phone: "5491136299626", metricas: { nombre: "Nicolás" } }
  const nota = { id: "n-1", content: "Ya estamos en contacto con el cliente, se coordinó una visita para el Viernes", created_at: "2026-09-03T21:20:00Z" }
  const APP = "https://prisma.vakdor.com"

  it("con los tres pedidos: reconoce la gestión, frena la escalera y lista chat + visita + tracking", () => {
    const a = armarAvisoRegistro(eric, conv, nota, {
      atendido: true, pedir_registro_chat: true, pedir_registro_visita: true,
      pedir_registro_actividad: true, razon: "La nota dice que ya lo llamó y coordinó visita",
    }, APP, "Central")
    expect(a.plantilla).toBe("asesor_registro_pendiente")
    expect(a.html).toContain("Perfecto que ya lo estés atendiendo")
    expect(a.html).toContain("se frenaron para este caso")
    expect(a.html).toContain("chat de PRISMA")
    expect(a.html).toContain("calendario")
    expect(a.html).toContain("tracking")
    expect(a.link).toBe("https://prisma.vakdor.com/asesor/leads-whatsapp/conv-1")
    expect(a.variables).toHaveLength(3)
    expect(a.variables[0]).toBe("Eric")
  })
  it("solo el pedido que aplica: sin visita ni tracking no los menciona", () => {
    const a = armarAvisoRegistro(eric, conv, nota, {
      atendido: true, pedir_registro_chat: true, pedir_registro_visita: false,
      pedir_registro_actividad: false, razon: "Gestión telefónica",
    }, APP, "Central")
    expect(a.html).toContain("chat de PRISMA")
    expect(a.html).not.toContain("calendario")
    expect(a.html).not.toContain("tracking")
  })
})
```

- [ ] **Step 2: Correr y ver FAIL**

- [ ] **Step 3: Implementación**

En `avisos.ts`, la union queda:

```ts
export type PlantillaEquipo =
  | "asesor_cliente_esperando"
  | "asesor_sigue_esperando"
  | "director_asesor_sin_respuesta"
  | "director_aprobacion_pendiente"
  | "asesor_registro_pendiente"
```

En `nota-interna.ts` (sumar imports: `import { linkAlChat, nombreCliente, unaLinea, type Aviso, type PerfilEquipo } from "./avisos"`):

```ts
function primerNombre(p: Pick<PerfilEquipo, "full_name">): string {
  return (p.full_name ?? "").trim().split(/\s+/)[0] || "Hola"
}
function esc(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] as string)
}

/**
 * UN solo aviso por nota (regla de Leonardo, 4/9): reconoce la gestión, avisa que la
 * escalera se frenó, y pide SOLO los registros que faltan. Tono de ayuda, jamás un reto.
 */
export function armarAvisoRegistro(
  perfil: PerfilEquipo,
  c: { id: string; contact_phone: string; metricas: Record<string, unknown> },
  nota: NotaInterna,
  v: VeredictoNota,
  appUrl: string,
  nombreAgencia: string
): Aviso {
  const cliente = nombreCliente(c as never)
  const tel = `+${c.contact_phone.replace(/\D/g, "")}`
  const link = linkAlChat(perfil, c.id, appUrl)
  const pedidos: string[] = []
  if (v.pedir_registro_chat)
    pedidos.push("Dejá una línea con lo gestionado en el <strong>chat de PRISMA</strong> del contacto: lo que queda ahí lo ve todo el equipo, y Sofía deja de avisarte por un cliente que ya estás atendiendo.")
  if (v.pedir_registro_visita)
    pedidos.push("La visita que mencionás no figura en el <strong>calendario</strong> de PRISMA: cargala así los recordatorios al cliente corren solos.")
  if (v.pedir_registro_actividad)
    pedidos.push("Registrá la gestión en el <strong>tracking</strong> (la actividad con este cliente y la propiedad): es lo que después cuenta como trabajo hecho.")
  const html = [
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;color:#1a1a1a">`,
    `<p>Hola ${esc(primerNombre(perfil))},</p>`,
    `<p>Vimos tu nota sobre <strong>${esc(cliente)}</strong> (${esc(tel)}): <em>«${esc(unaLinea(nota.content, 200))}»</em></p>`,
    `<p>Perfecto que ya lo estés atendiendo — los avisos de "cliente esperando" se frenaron para este caso.</p>`,
    pedidos.length ? `<p>Para que nada se pierda:</p><ul>${pedidos.map((p) => `<li>${p}</li>`).join("")}</ul>` : "",
    `<p><a href="${link}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Abrir el chat en PRISMA</a></p>`,
    `<p style="color:#888;font-size:13px">— Agente de seguimiento de PRISMA · ${esc(nombreAgencia)}</p>`,
    `</div>`,
  ].filter(Boolean).join("\n")
  const queRegistrar = [
    v.pedir_registro_chat ? "el chat" : null,
    v.pedir_registro_visita ? "la visita en el calendario" : null,
    v.pedir_registro_actividad ? "la actividad en el tracking" : null,
  ].filter(Boolean).join(", ")
  return {
    destinatario: perfil,
    esAsignado: true,
    link,
    asunto: `${cliente}: gestión anotada — falta el registro en PRISMA — ${nombreAgencia}`,
    html,
    plantilla: "asesor_registro_pendiente",
    variables: [primerNombre(perfil), unaLinea(`Vimos tu nota sobre ${cliente} (${tel}); los avisos se frenaron. Te pedimos registrar: ${queRegistrar || "nada, todo al día"}.`, 700), link],
  }
}
```

- [ ] **Step 4: Correr y ver PASS** — y `npx vitest run lib/seguimiento` completo (que `avisos.test.ts` y demás no se rompan por la union).

- [ ] **Step 5: Commit**

```bash
git add lib/seguimiento/avisos.ts lib/seguimiento/nota-interna.ts lib/seguimiento/nota-interna.test.ts
git commit -m "feat(seguimiento): el aviso de registro al asesor (un solo mensaje, email; plantilla Meta a futuro)"
```

---

### Task 5: La orquestación — `procesarNotaDelCaso`

**Files:**
- Modify: `lib/seguimiento/nota-interna.ts`
- Test: `lib/seguimiento/nota-interna.test.ts`

**Interfaces:**
- Consumes: todo lo de Tasks 1-4; `crearHerramientas` de `./herramientas`; `registrarEvento` de `./eventos`; `enviarAviso` de `./avisos`.
- Produces:
  - `type ResultadoNota = "sin_nota" | "escalera_sigue" | "atendido_sin_aviso" | "atendido_avisado" | "atendido_simulado" | "error_ia"`
  - `procesarNotaDelCaso(db, c: Pick<Candidato, "id" | "agency_id" | "contact_phone" | "metricas" | "visit_scheduled_at">, t0: string, opts: { modo: string; asesor: PerfilEquipo | null; appUrl: string; nombreAgencia: string; ahoraMs: number; fetchFn?: typeof fetch; llamar?: LlamarVeredicto; enviar?: typeof enviarAviso }): Promise<ResultadoNota>`
  - Evento nuevo en `lead_eventos`: tipo `nota_evaluada` con `datos = { nota_id, t0, atendido, pedir_registro_chat, pedir_registro_visita, pedir_registro_actividad, razon }`; tipo `nota_error` si la IA falla; tipo `aviso_registro_simulado` en sombra.

- [ ] **Step 1: Tests que fallan** (el fake por tabla del Task 2 se generaliza: registrar los inserts)

```ts
import { procesarNotaDelCaso } from "./nota-interna"

describe("procesarNotaDelCaso", () => {
  const nota = { id: "n-1", content: "Ya lo llamé, visita el viernes", created_at: "2026-09-03T21:20:00Z" }
  const c = { id: "conv-1", agency_id: "ag-1", contact_phone: "5491136299626",
    metricas: { nombre: "Nicolás", propiedad_interes: "San Martin 2300" }, visit_scheduled_at: null }
  const asesor: PerfilEquipo = { id: "p-1", full_name: "Eric Zambrana", role: "asesor", email: "e@x.com", phone: null }
  const t0 = "2026-09-03T20:09:43Z"
  const ahoraMs = Date.parse("2026-09-04T12:00:00-03:00")

  /** Fake con inserts observables. tablas[nombre] puede ser fila (maybeSingle) o lista (then). */
  function armarDb(tablas: Record<string, unknown>) {
    const inserts: Array<{ tabla: string; fila: Record<string, unknown> }> = []
    const db = {
      from(tabla: string) {
        const respuesta = tablas[tabla]
        const chain: Record<string, unknown> = {}
        for (const m of ["select", "eq", "not", "gt", "gte", "order", "limit", "contains", "in", "lt"])
          chain[m] = () => chain
        chain.maybeSingle = async () => ({ data: Array.isArray(respuesta) ? respuesta[0] ?? null : respuesta ?? null })
        chain.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: respuesta ?? [] }).then(res)
        chain.insert = (fila: Record<string, unknown>) => { inserts.push({ tabla, fila }); return { select: () => ({ single: async () => ({ data: { id: "x" } }) }), then: (r: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(r) } }
        return chain
      },
    }
    return { db: db as never, inserts }
  }
  const opciones = (extra: Record<string, unknown> = {}) => ({
    modo: "activo", asesor, appUrl: "https://prisma.vakdor.com", nombreAgencia: "Central", ahoraMs, ...extra,
  })

  it("sin nota: 'sin_nota' y NO llama a la IA", async () => {
    const { db } = armarDb({ wa_messages: null })
    const llamar = async () => { throw new Error("no debería llamar a la IA") }
    expect(await procesarNotaDelCaso(db, c, t0, opciones({ llamar }))).toBe("sin_nota")
  })

  it("nota ya evaluada como atendida: usa el veredicto guardado, sin IA y sin re-aviso", async () => {
    const { db, inserts } = armarDb({
      wa_messages: [nota],
      lead_eventos: [{ datos: { nota_id: "n-1", atendido: true } }],
    })
    const llamar = async () => { throw new Error("no debería re-evaluar") }
    expect(await procesarNotaDelCaso(db, c, t0, opciones({ llamar }))).toBe("atendido_sin_aviso")
    expect(inserts).toHaveLength(0)
  })

  it("veredicto atendido con pedidos: registra nota_evaluada y manda el aviso (enviar inyectado)", async () => {
    const { db, inserts } = armarDb({
      wa_messages: [nota], lead_eventos: [], scheduled_visits: [], wa_contacts: null,
    })
    const enviados: unknown[] = []
    const enviar = (async (..._args: unknown[]) => { enviados.push(_args[2]); return { email: "enviado", whatsapp: "omitido_plantilla_no_aprobada" } }) as never
    const llamar = async () => ({
      atendido: true, pedir_registro_chat: true, pedir_registro_visita: true,
      pedir_registro_actividad: true, razon: "Gestión telefónica con visita",
    })
    const r = await procesarNotaDelCaso(db, c, t0, opciones({ llamar, enviar }))
    expect(r).toBe("atendido_avisado")
    expect(enviados).toHaveLength(1)
    const evento = inserts.find((i) => i.tabla === "lead_eventos" && (i.fila.tipo as string) === "nota_evaluada")
    expect(evento?.fila.datos).toMatchObject({ nota_id: "n-1", t0, atendido: true })
  })

  it("veredicto NO atendido (nota-recordatorio): la escalera sigue", async () => {
    const { db } = armarDb({ wa_messages: [nota], lead_eventos: [], scheduled_visits: [], wa_contacts: null })
    const llamar = async () => ({
      atendido: false, pedir_registro_chat: false, pedir_registro_visita: false,
      pedir_registro_actividad: false, razon: "Es solo un recordatorio",
    })
    expect(await procesarNotaDelCaso(db, c, t0, opciones({ llamar }))).toBe("escalera_sigue")
  })

  it("en sombra no manda: registra el simulado", async () => {
    const { db, inserts } = armarDb({ wa_messages: [nota], lead_eventos: [], scheduled_visits: [], wa_contacts: null })
    const llamar = async () => ({
      atendido: true, pedir_registro_chat: true, pedir_registro_visita: false,
      pedir_registro_actividad: false, razon: "Ya atendido",
    })
    expect(await procesarNotaDelCaso(db, c, t0, opciones({ modo: "sombra", llamar }))).toBe("atendido_simulado")
    expect(inserts.some((i) => (i.fila.tipo as string) === "aviso_registro_simulado")).toBe(true)
  })

  it("si la IA falla: 'error_ia', evento nota_error, y la escalera sigue como hoy", async () => {
    const { db, inserts } = armarDb({ wa_messages: [nota], lead_eventos: [], scheduled_visits: [], wa_contacts: null })
    const llamar = async () => { throw new Error("API caída") }
    expect(await procesarNotaDelCaso(db, c, t0, opciones({ llamar }))).toBe("error_ia")
    expect(inserts.some((i) => (i.fila.tipo as string) === "nota_error")).toBe(true)
  })
})
```

- [ ] **Step 2: Correr y ver FAIL**

- [ ] **Step 3: Implementación** (agregar a `nota-interna.ts`; imports: `crearHerramientas` de `./herramientas`, `registrarEvento` de `./eventos`, `enviarAviso` de `./avisos`, `type Candidato` de `./tipos`)

```ts
export type ResultadoNota =
  | "sin_nota" | "escalera_sigue" | "atendido_sin_aviso"
  | "atendido_avisado" | "atendido_simulado" | "error_ia"

/**
 * El caso tiene nota → la IA decide. Una evaluación por nota (evento `nota_evaluada`
 * con nota_id); si la IA falla, la escalera sigue como hoy (evento `nota_error`):
 * un aviso de más molesta menos que un cliente perdido.
 */
export async function procesarNotaDelCaso(
  db: SupabaseClient,
  c: Pick<Candidato, "id" | "agency_id" | "contact_phone" | "metricas" | "visit_scheduled_at">,
  t0: string,
  opts: {
    modo: string
    asesor: PerfilEquipo | null
    appUrl: string
    nombreAgencia: string
    ahoraMs: number
    fetchFn?: typeof fetch
    llamar?: LlamarVeredicto
    enviar?: typeof enviarAviso
  }
): Promise<ResultadoNota> {
  const nota = await notaPosterior(db, c.id, t0)
  if (!nota) return "sin_nota"

  const { data: previa } = await db
    .from("lead_eventos").select("datos")
    .eq("conversation_id", c.id).eq("tipo", "nota_evaluada")
    .contains("datos", { nota_id: nota.id })
    .order("ts", { ascending: false }).limit(1).maybeSingle()
  if (previa?.datos) return (previa.datos as { atendido?: boolean }).atendido ? "atendido_sin_aviso" : "escalera_sigue"

  const registro = await contextoRegistro(db, c, opts.ahoraMs)
  const mensajes = await crearHerramientas(db, c as Candidato).leer_mensajes({ cantidad: 30 })
  const propiedadInteres =
    String(c.metricas?.propiedad_interes ?? c.metricas?.propiedad_consultada ?? "").trim() || null
  const ahoraISO = new Date(opts.ahoraMs).toLocaleString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }).slice(0, 16)

  let veredicto: VeredictoNota
  try {
    veredicto = await (opts.llamar ?? crearLlamadaVeredicto())(
      semillaVeredicto({ nota, mensajes, ...registro, propiedadInteres, ahoraISO })
    )
  } catch (e) {
    await registrarEvento(db, c.agency_id, c.id, "nota_error",
      `La IA no pudo evaluar la nota interna; la escalera sigue como siempre: ${String(e).slice(0, 150)}`,
      { nota_id: nota.id, t0 })
    return "error_ia"
  }

  await registrarEvento(db, c.agency_id, c.id, "nota_evaluada",
    veredicto.atendido
      ? `Nota del asesor leída: el cliente ya está atendido, la escalera se frena — ${veredicto.razon}`
      : `Nota del asesor leída: no indica atención, la escalera sigue — ${veredicto.razon}`,
    { nota_id: nota.id, t0, ...veredicto })

  if (!veredicto.atendido) return "escalera_sigue"
  const hayPedidos = veredicto.pedir_registro_chat || veredicto.pedir_registro_visita || veredicto.pedir_registro_actividad
  if (!hayPedidos || !opts.asesor) return "atendido_sin_aviso"

  const aviso = armarAvisoRegistro(opts.asesor, c, nota, veredicto, opts.appUrl, opts.nombreAgencia)
  if (opts.modo !== "activo") {
    await registrarEvento(db, c.agency_id, c.id, "aviso_registro_simulado",
      `[${opts.modo}] se le habría pedido al asesor ${opts.asesor.full_name ?? ""} registrar la gestión en PRISMA`,
      { nota_id: nota.id, asunto: aviso.asunto })
    return "atendido_simulado"
  }
  await (opts.enviar ?? enviarAviso)(db, c as never, aviso, opts.nombreAgencia, { fetchFn: opts.fetchFn })
  return "atendido_avisado"
}
```

- [ ] **Step 4: Correr y ver PASS** — `npx vitest run lib/seguimiento/nota-interna.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/seguimiento/nota-interna.ts lib/seguimiento/nota-interna.test.ts
git commit -m "feat(seguimiento): procesarNotaDelCaso — la IA decide qué hace la escalera cuando hay nota"
```

---

### Task 6: Cablear la escalera

**Files:**
- Modify: `lib/seguimiento/escalamiento.ts` (select de candidatos ~línea 213-222; loop del caso ~líneas 237-267; doc-comment de la cabecera; `correrEscalamiento` opts)
- Test: `lib/seguimiento/escalamiento.test.ts`

**Interfaces:**
- Consumes: `procesarNotaDelCaso`, `type LlamarVeredicto` de `./nota-interna`.
- Produces: `correrEscalamiento(db, opts)` acepta `opts.llamarNota?: LlamarVeredicto` (inyección para test; en producción usa la llamada real). El select de candidatos suma `visit_scheduled_at`. El `Conv` local suma `"visit_scheduled_at"` al Pick.

- [ ] **Step 1: Test que falla** (agregar a `escalamiento.test.ts` — fake db completo por tabla, mismo patrón del Task 5 pero con las tablas de la corrida)

```ts
describe("correrEscalamiento con nota interna: la IA frena la escalera", () => {
  const ar = (iso: string) => Date.parse(iso + "-03:00")

  function armarDbCorrida() {
    const inserts: Array<{ tabla: string; fila: Record<string, unknown> }> = []
    const tablas: Record<string, unknown> = {
      seguimiento_config: [{ agency_id: "ag-1", modo: "activo", activo_desde: "2026-08-31T00:00:00Z" }],
      agencies: [{ id: "ag-1", name: "Central" }],
      wa_conversations: [{
        id: "conv-1", agency_id: "ag-1", contact_phone: "5491136299626",
        metricas: { nombre: "Nicolás" }, agent_id: "p-1", bot_active: false,
        last_message_at: "2026-09-03T20:09:43Z", visit_scheduled_at: null,
      }],
      profiles: [{ id: "p-1", full_name: "Eric Zambrana", role: "asesor", email: "e@x.com", phone: null }],
      // wa_messages responde según los filtros: para simplificar, el último del lead y la nota
      wa_messages_ultimo_lead: { created_at: "2026-09-03T20:09:43Z" },
      wa_messages_humano: [],
      wa_messages_nota: { id: "n-1", content: "Ya lo llamé, visita el viernes", created_at: "2026-09-03T21:20:00Z" },
      lead_eventos: [],
      scheduled_visits: [], wa_contacts: null, performance_logs: [],
      interacciones_canal: [], wa_templates: null, whatsapp_instances: null,
    }
    let vecesWaMessages = 0
    const db = {
      from(tabla: string) {
        let respuesta = tablas[tabla]
        if (tabla === "wa_messages") {
          // orden real de las llamadas en la corrida: último del lead → humano → nota → leer_mensajes
          const orden = ["wa_messages_ultimo_lead", "wa_messages_humano", "wa_messages_nota", "wa_messages_humano"]
          respuesta = tablas[orden[Math.min(vecesWaMessages, orden.length - 1)]]
          vecesWaMessages++
        }
        const chain: Record<string, unknown> = {}
        for (const m of ["select", "eq", "not", "gt", "gte", "order", "limit", "contains", "in", "lt"])
          chain[m] = () => chain
        chain.maybeSingle = async () => ({ data: Array.isArray(respuesta) ? (respuesta as unknown[])[0] ?? null : respuesta ?? null })
        chain.is = () => chain
        chain.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: respuesta ?? [] }).then(res)
        chain.insert = (fila: Record<string, unknown>) => {
          inserts.push({ tabla, fila })
          return { select: () => ({ single: async () => ({ data: { id: "x" } }) }), then: (r: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(r) }
        }
        return chain
      },
    }
    return { db: db as never, inserts }
  }

  it("veredicto atendido ⇒ atendidos++, ni un nivel de escalera sale", async () => {
    const { db, inserts } = armarDbCorrida()
    const llamarNota = async () => ({
      atendido: true, pedir_registro_chat: true, pedir_registro_visita: false,
      pedir_registro_actividad: false, razon: "Gestión telefónica",
    })
    const fetchQueNoDebeSalir = (async () => { throw new Error("con email null no debería llamar a Resend") }) as never
    const r = await correrEscalamiento(db, { ahoraMs: ar("2026-09-04T12:00:00"), llamarNota, fetchFn: fetchQueNoDebeSalir, appUrl: "https://x" })
    expect(r.atendidos).toBe(1)
    expect(inserts.some((i) => i.tabla === "lead_eventos" && (i.fila.tipo as string) === "escalera")).toBe(false)
    expect(inserts.some((i) => i.tabla === "lead_eventos" && (i.fila.tipo as string) === "nota_evaluada")).toBe(true)
  })

  it("veredicto NO atendido ⇒ la escalera manda el nivel como siempre", async () => {
    const { db, inserts } = armarDbCorrida()
    const llamarNota = async () => ({
      atendido: false, pedir_registro_chat: false, pedir_registro_visita: false,
      pedir_registro_actividad: false, razon: "Solo un recordatorio",
    })
    const fetchOk = (async () => ({ ok: true, json: async () => ({ id: "r-1" }) })) as never
    const r = await correrEscalamiento(db, { ahoraMs: ar("2026-09-04T12:00:00"), llamarNota, fetchFn: fetchOk, appUrl: "https://x" })
    expect(r.avisos).toBe(1)
    expect(inserts.some((i) => i.tabla === "lead_eventos" && (i.fila.tipo as string) === "escalera")).toBe(true)
  })
})
```

Nota para el ejecutor: si el orden real de llamadas a `wa_messages` difiere (p.ej. `enviarAviso` también inserta ahí), ajustar el array `orden` MIRANDO el código, no el test. El test tiene que reflejar la secuencia real.

- [ ] **Step 2: Correr y ver FAIL**

- [ ] **Step 3: Implementación en `escalamiento.ts`**

1. Import: `import { procesarNotaDelCaso, type LlamarVeredicto } from "./nota-interna"`.
2. `correrEscalamiento` firma: `opts: { appUrl?: string; fetchFn?: typeof fetch; ahoraMs?: number; llamarNota?: LlamarVeredicto } = {}`.
3. Select de candidatos: agregar `visit_scheduled_at` →
   `.select("id, agency_id, contact_phone, metricas, agent_id, bot_active, last_message_at, visit_scheduled_at")`
   y el type local: `type Conv = Pick<Candidato, "id" | "agency_id" | "contact_phone" | "metricas" | "agent_id" | "bot_active" | "last_message_at" | "visit_scheduled_at">`.
4. En el loop del caso, después de `if (horas < 2) continue` y ANTES de `resumen.esperando++`, mover la búsqueda del asesor (hoy en la línea `const asesor = c.agent_id ? await perfil(c.agent_id) : null` más abajo — moverla acá, NO duplicarla) y agregar:

```ts
      // La nota interna del asesor habla (Leonardo, 4/9): si hay una posterior al último
      // mensaje del lead, la IA decide si el cliente ya está atendido. Determinista solo
      // la detección; la interpretación jamás (una nota puede ser cualquier cosa).
      const asesor = c.agent_id ? await perfil(c.agent_id) : null
      const rNota = await procesarNotaDelCaso(db, c, t0, {
        modo: config.modo, asesor, appUrl,
        nombreAgencia: nombreAgencia.get(c.agency_id) ?? "PRISMA",
        ahoraMs, fetchFn: opts.fetchFn, llamar: opts.llamarNota,
      })
      if (rNota.startsWith("atendido")) {
        resumen.atendidos++
        if (rNota === "atendido_avisado") resumen.avisos++
        continue
      }
```

5. Borrar la línea vieja `const asesor = c.agent_id ? await perfil(c.agent_id) : null` de más abajo (quedó movida).
6. Doc-comment de la cabecera del archivo: sumar un párrafo:

```
 * LA NOTA INTERNA HABLA (Leonardo, 4/9, tras la queja de Eric): si el asesor dejó una
 * nota interna después del último mensaje del lead, la IA la lee junto con la
 * conversación y decide. "Atendido" ⇒ la escalera se frena para ese caso y, si la
 * gestión quedó fuera de PRISMA, sale UN aviso pidiendo registrar (chat / visita en
 * calendario / actividad en tracking). Nota ambigua o solo-recordatorio ⇒ la escalera
 * sigue: un aviso de más molesta menos que un cliente perdido.
```

- [ ] **Step 4: Correr y ver PASS** — `npx vitest run lib/seguimiento` completo (los 2 tests nuevos + que los existentes de madrugada/niveles no se rompan).

- [ ] **Step 5: Commit**

```bash
git add lib/seguimiento/escalamiento.ts lib/seguimiento/escalamiento.test.ts
git commit -m "feat(seguimiento): la escalera consulta a la IA cuando el asesor dejó una nota interna"
```

---

### Task 7: El agente de decisiones también la lee (semilla + prompt + runner)

**Files:**
- Modify: `lib/seguimiento/semilla.ts` (firma de `renderizarSemilla`)
- Modify: `lib/seguimiento/agente.ts:16` (bloque nuevo en `PROMPT_AGENTE`, después de la REGLA DE ORO)
- Modify: `app/api/seguimiento/run/route.ts:124-138` (buscar la nota y pasarla a la semilla)
- Test: `lib/seguimiento/semilla.test.ts`

**Interfaces:**
- Produces: `renderizarSemilla(c, score, compromisosActivos, ahoraISO, clasificacion?, plantillasDisponibles?, notaInterna?: { texto: string; fechaAR: string } | null)` — parámetro NUEVO al final, default `null` (las llamadas existentes no cambian).

- [ ] **Step 1: Tests que fallan** (agregar a `semilla.test.ts`)

```ts
it("con nota interna la incluye y le dice que manda", () => {
  const t = renderizarSemilla(base, 55, 0, "2026-09-04T12:00:00-03:00", null, [],
    { texto: "Ya lo llamé, visita coordinada el viernes", fechaAR: "3/9 18:20" })
  expect(t).toContain("NOTA INTERNA del asesor (3/9 18:20")
  expect(t).toContain("«Ya lo llamé, visita coordinada el viernes»")
  expect(t).toContain("manda sobre tu criterio")
})
it("sin nota interna no aparece el bloque", () => {
  expect(renderizarSemilla(base, 55, 0, "2026-09-04T12:00:00-03:00")).not.toContain("NOTA INTERNA")
})
```

- [ ] **Step 2: Correr y ver FAIL** — `npx vitest run lib/seguimiento/semilla.test.ts`

- [ ] **Step 3: Implementación**

En `semilla.ts`, firma y bloque (va después del bloque ATENCIÓN de handoff, antes de "Datos capturados"):

```ts
export function renderizarSemilla(
  c: Candidato,
  score: number,
  compromisosActivos: number,
  ahoraISO: string,
  clasificacion: string | null = null,
  plantillasDisponibles: PlantillaDisponible[] = [],
  notaInterna: { texto: string; fechaAR: string } | null = null
): string {
```

```ts
    ...(notaInterna
      ? [`NOTA INTERNA del asesor (${notaInterna.fechaAR}; el cliente NO la ve): «${notaInterna.texto}». Es la voz del equipo y manda sobre tu criterio: si dice que el cliente ya fue atendido por otro canal, que no se le dé seguimiento o que ya hay una visita coordinada, NO lo contactes (posponé o abandoná citando la nota). Si es solo un recordatorio o un dato, usala como contexto.`]
      : []),
```

En `agente.ts`, después del párrafo "REGLA DE ORO" del `PROMPT_AGENTE` (línea 16), agregar:

```
NOTAS INTERNAS: los renglones [internal] de leer_mensajes y la "NOTA INTERNA del asesor" de la semilla son anotaciones internas del equipo (el cliente no las ve). Las que escribió un asesor son su voz y mandan sobre tu criterio. El renglón "⚠️ Handoff activado" es un marcador automático del sistema, no una nota.
```

En `route.ts` (imports: `import { fechaCortaAR, unaLineaCorta } from "@/lib/seguimiento/contexto"` y `import { MARCADOR_HANDOFF } from "@/lib/seguimiento/nota-interna"`), justo antes del `renderizarSemilla` (línea ~131):

```ts
    const { data: notaFila } = await db
      .from("wa_messages").select("content, created_at")
      .eq("conversation_id", c.id).eq("role", "internal")
      .not("content", "like", `${MARCADOR_HANDOFF}%`)
      .order("created_at", { ascending: false }).limit(1).maybeSingle()
    const notaInterna = notaFila?.content
      ? { texto: unaLineaCorta(String(notaFila.content), 400), fechaAR: fechaCortaAR(String(notaFila.created_at)) }
      : null
    const semilla = renderizarSemilla(
      c, score, compromisos.length, ahoraISO,
      contacto?.clasificacion ?? null, disponibles, notaInterna
    )
```

(Para la semilla va la ÚLTIMA nota sin importar t0: cualquier nota es contexto para el seguimiento al cliente.)

- [ ] **Step 4: Correr y ver PASS** — `npx vitest run lib/seguimiento` completo.

- [ ] **Step 5: Commit**

```bash
git add lib/seguimiento/semilla.ts lib/seguimiento/agente.ts app/api/seguimiento/run/route.ts lib/seguimiento/semilla.test.ts
git commit -m "feat(seguimiento): la última nota interna entra en la semilla y el prompt del agente sabe qué es"
```

---

### Task 8: Prueba en seco contra la nota real de Eric + docs

**Files:**
- Create: `scratch/_probar-veredicto-nota.mjs` (solo lectura + 1 llamada a la IA; CERO escrituras)
- Modify: `docs/interno/TECNICO-PRISMA.md` (sección 22, subsección nueva)
- Modify: `docs/compartible/estandarizada/FUNCIONAL-ASESOR-PRISMA.md` (§24, párrafo nuevo)
- Modify: `docs/compartible/estandarizada/FUNCIONAL-DIRECTOR-PRISMA.md` (§29, párrafo nuevo)

- [ ] **Step 1: El script de prueba en seco.** Llama a `crearLlamadaVeredicto()` con la semilla armada a mano con los datos REALES del caso Nicolás (la nota `93d75166` de la conversación `4bae807b-0b9f-4575-afda-d7c9896da9f2`, los mensajes del 3/9, visitaRegistrada=false, actividades=[]). Es un `.mjs` suelto que importa el prompt/semilla duplicados inline (no puede importar TS): copiar el `PROMPT_NOTA` y el texto de semilla del código al script y llamar a la API de Anthropic con `fetch` directo (model de `lib/admin-vakdor/marketing/claude`, header `x-api-key` del `.env`, `tool_choice` forzado). Correr: `node scratch/_probar-veredicto-nota.mjs`.

**Resultado esperado (criterio de aceptación del prompt):** `atendido: true`, `pedir_registro_chat: true`, `pedir_registro_visita: true` — si da otra cosa, ajustar `PROMPT_NOTA` en `nota-interna.ts` (y re-copiar al script) hasta que el caso real salga bien, y volver a correr los tests unit.

- [ ] **Step 2: Probar también una nota-recordatorio.** Mismo script con `--recordatorio`: nota inventada "ojo: pregunta siempre por cochera" → esperado `atendido: false`. Si da `true`, ajustar el prompt.

- [ ] **Step 3: Docs.**
  - `TECNICO-PRISMA.md` §22: subsección "Las notas internas hablan con Sofía" — el flujo (detección por query / veredicto IA / evento `nota_evaluada` por nota / aviso email con plantilla `asesor_registro_pendiente` no aprobada aún en Meta), los eventos nuevos (`nota_evaluada`, `nota_error`, `aviso_registro_simulado`), y el puntero al spec.
  - FUNCIONAL-ASESOR §24, sin tecnicismos: "Si atendiste a un cliente por teléfono, dejá una nota interna en el chat contando qué hiciste: Sofía la lee, deja de avisarte por ese cliente, y si falta cargar la visita o la actividad te lo pide en un solo correo."
  - FUNCIONAL-DIRECTOR §29, ídem: "Las notas internas de tu equipo ahora frenan los avisos de 'cliente esperando' cuando la gestión ya está hecha; lo que quedó sin registrar (visita, actividad) se le pide al asesor en el momento."

- [ ] **Step 4: Commit**

```bash
git add scratch/_probar-veredicto-nota.mjs docs/interno/TECNICO-PRISMA.md "docs/compartible/estandarizada/FUNCIONAL-ASESOR-PRISMA.md" "docs/compartible/estandarizada/FUNCIONAL-DIRECTOR-PRISMA.md"
git commit -m "docs(seguimiento): notas internas — prueba en seco del veredicto y guías actualizadas"
```

---

### Task 9: Verificación final y PR (merge SOLO con OK de Leonardo)

- [ ] **Step 1:** `npx vitest run` completo → todos verdes (base previa: 1595 tests).
- [ ] **Step 2:** `npx tsc --noEmit` → 0 errores.
- [ ] **Step 3:** Build detached (`Start-Process cmd /c "npm run build > build.log 2>&1 & echo EXIT_CODE=%ERRORLEVEL% >> build.log"`), verificar `EXIT_CODE=0`. Jamás con el dev server corriendo.
- [ ] **Step 4:** Mostrarle a Leonardo: el veredicto real del caso Nicolás (Step 1 del Task 8), el HTML del aviso de registro, y el resumen de qué cambia. **Esperar su OK.**
- [ ] **Step 5 (con OK):** `gh pr create` → `gh pr merge N --merge` → vigilar el deploy por la API de Vercel (v6, slug `leos-projects-a294f9ee`) hasta READY.
- [ ] **Step 6 (post-deploy):** verificación en producción con el primer caso real: cuando un asesor deje una nota en un caso esperando, chequear en `lead_eventos` el `nota_evaluada` y que NO haya `escalera` posterior para ese t0 (query por `node scratch/_sa-query.mjs`). Anotar en la bitácora.

---

## Self-review (hecho al escribir el plan)

- **Spec coverage:** regla 1 (detección/IA) → Tasks 1, 3, 5, 6 · regla 2 (un aviso: chat/visita/tracking) → Tasks 2, 4 · regla 3 (agente lee la nota) → Task 7 · degradación con `nota_error` → Task 5 · dedupe por nota → Task 5 · plantilla Meta futura → Task 4 · prueba contra el caso real → Task 8.
- **Consistencia de tipos:** `VeredictoNota` (4 booleans + razon) idéntico en Tasks 3, 4, 5, 6 · `procesarNotaDelCaso` consume el Pick con `visit_scheduled_at` que el select del Task 6 agrega · `LlamarVeredicto` viaja como `opts.llamarNota`.
- **Sin placeholders:** cada step tiene el código o el texto concreto; el único ajuste-por-resultado es el prompt en Task 8, con criterio de aceptación explícito.
