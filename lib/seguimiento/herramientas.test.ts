import { describe, it, expect, vi } from "vitest"
import { crearHerramientas } from "./herramientas"
import type { Candidato } from "./tipos"

const base = {
  id: "c1",
  agency_id: "a1",
  contact_phone: "+549110000",
  contact_name: "Laura",
  funnel_status: "open",
  visit_status: "none",
  visit_scheduled_at: null,
  visit_address: null,
  follow_ups_sent: 1,
  next_follow_up_at: null,
  last_message_at: null,
  metricas: { nombre: "Laura" },
  follow_ups_history: [],
  requires_follow_up: true,
  bot_active: true,
  opt_out: false,
} as Candidato

/** Mock encadenable: cada from() devuelve un builder cuyo await resuelve `respuesta`. */
function dbMock(respuesta: { data: unknown; error: null | { message: string } }) {
  const builder: Record<string, unknown> = {}
  for (const m of ["select", "eq", "or", "order", "limit", "in", "gte"])
    builder[m] = vi.fn().mockReturnValue(builder)
  builder.then = (resolve: (v: unknown) => void) => resolve(respuesta)
  return { from: vi.fn().mockReturnValue(builder) } as never
}

describe("leer_mensajes", () => {
  it("devuelve los mensajes viejo→nuevo con autor y fecha", async () => {
    const h = crearHerramientas(
      dbMock({
        data: [
          { role: "bot", content: "Sí, cochera pasante.", created_at: "2026-08-16T14:00:00Z" },
          { role: "lead", content: "¿Tiene cochera el PH?", created_at: "2026-08-16T13:58:00Z" },
        ],
        error: null,
      }),
      base
    )
    const t = await h.leer_mensajes({ cantidad: 10 })
    expect(t.indexOf("¿Tiene cochera")).toBeLessThan(t.indexOf("cochera pasante"))
    expect(t).toContain("[lead]")
  })
  it("sin mensajes lo dice en texto, no explota", async () => {
    const h = crearHerramientas(dbMock({ data: [], error: null }), base)
    expect(await h.leer_mensajes({})).toContain("no hay mensajes")
  })
  it("un error de DB vuelve como texto, no como excepción", async () => {
    const h = crearHerramientas(dbMock({ data: null, error: { message: "timeout" } }), base)
    expect(await h.leer_mensajes({})).toContain("timeout")
  })
})

describe("leer_intentos_previos", () => {
  it("las decisiones en sombra NO cuentan como intentos enviados", async () => {
    const h = crearHerramientas(
      dbMock({
        data: [
          { plantilla: "seg_f3_breakup", razon: "ya van dos sin respuesta", creado_en: "2026-08-24T17:00:00Z", resultado: null, ejecutada: false },
        ],
        error: null,
      }),
      base
    )
    const t = await h.leer_intentos_previos({})
    expect(t).toContain("INTENTOS ENVIADOS por el agente: ninguno")
    expect(t).toContain("NO se enviaron")
    expect(t).toContain("seg_f3_breakup")
  })
  it("un intento ejecutado sí figura como enviado", async () => {
    const h = crearHerramientas(
      dbMock({
        data: [
          { plantilla: "seg_f1_seguimiento", razon: "retomo la cochera", creado_en: "2026-08-24T17:00:00Z", resultado: "enviada", ejecutada: true },
        ],
        error: null,
      }),
      base
    )
    const t = await h.leer_intentos_previos({})
    expect(t).toMatch(/INTENTOS ENVIADOS por el agente:\n- 2026-08-24: seg_f1_seguimiento/)
    expect(t).not.toContain("NO se enviaron")
  })
})

describe("leer_mensajes muestra hora argentina", () => {
  it("convierte el timestamp UTC a hora AR", async () => {
    const h = crearHerramientas(
      dbMock({ data: [{ role: "lead", content: "hola", created_at: "2026-07-31T01:34:00Z" }], error: null }),
      base
    )
    const t = await h.leer_mensajes({})
    expect(t).toContain("[2026-07-30 22:34]") // 01:34 UTC = 22:34 del día anterior en AR
    expect(t).toContain("horas en Argentina")
  })
})

describe("leer_propiedad", () => {
  it("cuando no hay coincidencias lo dice explícitamente y prohíbe nombrarla", async () => {
    const h = crearHerramientas(dbMock({ data: [], error: null }), base)
    const t = await h.leer_propiedad({ busqueda: "castillo en la luna" })
    expect(t).toMatch(/NO se encontró/i)
    expect(t).toMatch(/no la menciones/i)
  })
  it("marca una propiedad inactiva como NO DISPONIBLE", async () => {
    const h = crearHerramientas(
      dbMock({
        data: [
          {
            title: "Depto en La Plata",
            address: "133 entre 45 y 46",
            city: "La Plata",
            status: "Alquiler",
            is_active: false,
            price: 850000,
            currency: "ARS",
            notas_ia: null,
          },
        ],
        error: null,
      }),
      base
    )
    const t = await h.leer_propiedad({ busqueda: "la plata" })
    expect(t).toContain("NO DISPONIBLE")
  })
  it("sanitiza la búsqueda para el filtro .or de PostgREST", async () => {
    const db = dbMock({ data: [], error: null })
    const h = crearHerramientas(db, base)
    await h.leer_propiedad({ busqueda: "PH, (Caseros) 50%" })
    const builder = (db as { from: ReturnType<typeof vi.fn> }).from.mock.results[0].value
    const patron = builder.or.mock.calls[0][0] as string
    // la coma y los paréntesis del INPUT se sanean (la coma que separa las
    // condiciones del .or es propia del patrón y sí tiene que estar)
    expect(patron).toContain("PH Caseros 50")
    expect(patron).not.toContain("(Caseros)")
  })
})
