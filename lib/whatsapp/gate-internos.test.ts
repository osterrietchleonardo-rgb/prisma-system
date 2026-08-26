import { describe, it, expect, vi } from "vitest"
import { digitos, buscarInterno, textoConfirmacion, linkPrisma, procesarMensajeInterno } from "./gate-internos"

/** Mock encadenable de Supabase: cada from() devuelve un builder cuyo await resuelve `respuesta`. */
function dbMock(respuestas: Record<string, { data: unknown; error: null | { message: string } }>) {
  const llamadas: Array<{ tabla: string; op: string; args: unknown }> = []
  return {
    llamadas,
    from: vi.fn((tabla: string) => {
      const builder: Record<string, unknown> = {}
      for (const m of ["select", "eq", "is", "not", "maybeSingle", "single"])
        builder[m] = vi.fn((...args: unknown[]) => { llamadas.push({ tabla, op: m, args }); return builder })
      builder.insert = vi.fn((fila: unknown) => { llamadas.push({ tabla, op: "insert", args: fila }); return builder })
      builder.then = (resolve: (v: unknown) => void) => resolve(respuestas[tabla] ?? { data: null, error: null })
      return builder
    }),
  }
}

const perfil = { id: "p1", role: "asesor", full_name: "Martín Pérez", phone: "5491161328586" }

describe("digitos", () => {
  it("deja solo dígitos", () => {
    expect(digitos("+54 9 11 6132-8586")).toBe("5491161328586")
    expect(digitos(null)).toBe("")
  })
})

describe("buscarInterno", () => {
  it("encuentra al asesor de la agencia por dígitos, aunque el perfil tenga formato distinto", async () => {
    const db = dbMock({ profiles: { data: [{ ...perfil, phone: "+54 9 11 6132-8586" }], error: null } })
    const r = await buscarInterno(db as never, "a1", "5491161328586@s.whatsapp.net".split("@")[0])
    expect(r?.id).toBe("p1")
  })
  it("no matchea otro número ni teléfonos cortos/vacíos", async () => {
    const db = dbMock({ profiles: { data: [perfil, { ...perfil, id: "p2", phone: "" }], error: null } })
    expect(await buscarInterno(db as never, "a1", "5491100000000")).toBeNull()
    expect(await buscarInterno(db as never, "a1", "")).toBeNull()
  })
  it("FALLA ABIERTO: si la consulta falla, devuelve null (el lead sigue su camino)", async () => {
    const db = dbMock({ profiles: { data: null, error: { message: "timeout" } } })
    expect(await buscarInterno(db as never, "a1", "5491161328586")).toBeNull()
  })
})

describe("textoConfirmacion / linkPrisma", () => {
  it("el asesor va a su bandeja, el director a la suya, con el primer nombre", () => {
    expect(textoConfirmacion(perfil, "https://prisma.vakdor.com/")).toBe(
      "Martín, recibido, quedó anotado. Para responderle al cliente entrá a PRISMA: https://prisma.vakdor.com/asesor/leads-whatsapp"
    )
    expect(linkPrisma({ ...perfil, role: "director" }, "https://prisma.vakdor.com")).toBe("https://prisma.vakdor.com/director/leads-whatsapp")
  })
})

describe("procesarMensajeInterno", () => {
  const entrada = { agencyId: "a1", perfil, contactPhone: "5491161328586", contenido: "ya lo atiendo", wamid: "w1" }
  it("registra en interacciones_canal y manda la confirmación una vez", async () => {
    const db = dbMock({ interacciones_canal: { data: null, error: null } })
    const enviar = vi.fn(async () => {})
    const r = await procesarMensajeInterno(db as never, entrada, enviar, "https://prisma.vakdor.com")
    expect(r).toEqual({ registrado: true, duplicado: false, confirmacionEnviada: true })
    const insert = db.llamadas.find((l) => l.op === "insert")!.args as Record<string, unknown>
    expect(insert).toMatchObject({ agency_id: "a1", destinatario: "asesor", destinatario_ref: "p1", canal: "whatsapp", direccion: "entrada", wamid: "w1" })
    expect(enviar).toHaveBeenCalledWith("5491161328586", expect.stringContaining("asesor/leads-whatsapp"))
  })
  it("si el wamid ya está registrado, no duplica ni vuelve a confirmar", async () => {
    const db = dbMock({ interacciones_canal: { data: { id: "x" }, error: null } })
    const enviar = vi.fn(async () => {})
    const r = await procesarMensajeInterno(db as never, entrada, enviar, "https://prisma.vakdor.com")
    expect(r.duplicado).toBe(true)
    expect(enviar).not.toHaveBeenCalled()
  })
  it("si falla el envío de la confirmación, no lanza y el registro queda", async () => {
    const db = dbMock({ interacciones_canal: { data: null, error: null } })
    const enviar = vi.fn(async () => { throw new Error("Evolution caído") })
    const r = await procesarMensajeInterno(db as never, entrada, enviar, "https://prisma.vakdor.com")
    expect(r.registrado).toBe(true)
    expect(r.confirmacionEnviada).toBe(false)
  })
})
