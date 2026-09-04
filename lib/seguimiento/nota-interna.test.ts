import { describe, it, expect } from "vitest"
import { MARCADOR_HANDOFF, notaPosterior, coincideTelefono, contextoRegistro } from "./nota-interna"

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

describe("coincideTelefono: últimos 8 dígitos, sin importar el formato", () => {
  it("matchea +54 1150458476 con 5491150458476", () => {
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
