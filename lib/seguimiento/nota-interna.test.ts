import { describe, it, expect } from "vitest"
import { MARCADOR_HANDOFF, notaPosterior, coincideTelefono, contextoRegistro, semillaVeredicto, VeredictoNotaSchema, armarAvisoRegistro } from "./nota-interna"
import type { PerfilEquipo } from "./avisos"

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
