import { describe, it, expect, vi, beforeEach } from "vitest"

const enviados: Array<Record<string, unknown>> = []
let respuesta = { resultado: "enviado", wamid: "w-1" as string | null, plantilla: "x" }

vi.mock("@/lib/whatsapp/enviar-plantilla", () => ({
  enviarPlantillaAlTelefono: async (_db: unknown, agencyId: string, envio: Record<string, unknown>) => {
    enviados.push({ agencyId, ...envio })
    return respuesta
  },
}))

const { avisarPorWhatsApp, resumenParaElAviso, PLANTILLA_AVISO } = await import("./avisar-a-quien-atiende")

const base = {
  agencyId: "ag-1",
  telefonoDestino: "+54 9 11 5060-4928",
  nombreDestino: "Juan Pérez",
  objetivo: "vender_propiedad" as const,
  datos: { nombre: "Alicia", telefono: "+54 9 11 5928-9642" },
  detalle: "PH en Belgrano, lo intentó 6 meses.",
  link: "https://prisma.vakdor.com/asesor/leads-whatsapp/8f2c",
}

beforeEach(() => {
  enviados.length = 0
  respuesta = { resultado: "enviado", wamid: "w-1", plantilla: "x" }
})

describe("resumenParaElAviso: lo que entra en un WhatsApp", () => {
  it("dice quién, qué necesita y cómo ubicarlo", () => {
    const r = resumenParaElAviso("vender_propiedad", base.datos, base.detalle)
    expect(r).toContain("Alicia")
    expect(r).toContain("quiere vender")
    expect(r).toContain("+5491159289642")
  })
  it("sin teléfono usa el email, y sin nada lo dice", () => {
    expect(resumenParaElAviso("reclamo", { nombre: "Ana", email: "a@b.com" }, "")).toContain("a@b.com")
    expect(resumenParaElAviso("reclamo", {}, "")).toContain("Sin datos de contacto")
  })
  it("no deja pasar HTML del visitante ni se estira de más", () => {
    const r = resumenParaElAviso("consulta_empresa", { nombre: "<b>Ana</b>" }, "x".repeat(900))
    expect(r).not.toContain("<b>")
    expect(r.length).toBeLessThanOrEqual(380)
  })
})

describe("avisarPorWhatsApp", () => {
  it("le suena el teléfono a quien atiende, con el link para seguir", async () => {
    const r = await avisarPorWhatsApp({} as never, base)
    expect(r.resultado).toBe("enviado")
    expect(enviados[0]).toMatchObject({ plantilla: PLANTILLA_AVISO, telefono: "5491150604928" })
    const variables = enviados[0].variables as string[]
    expect(variables[0]).toBe("Juan")
    expect(variables[2]).toBe(base.link)
  })

  it("sin link NO se manda: un aviso sin a dónde ir no sirve para nada", async () => {
    const r = await avisarPorWhatsApp({} as never, { ...base, link: null })
    expect(r.resultado).toBe("omitido_sin_link")
    expect(enviados).toHaveLength(0)
  })

  it("sin celular de quien atiende, tampoco: el email ya salió igual", async () => {
    const r = await avisarPorWhatsApp({} as never, { ...base, telefonoDestino: null })
    expect(r.resultado).toBe("omitido_sin_celular")
    expect(enviados).toHaveLength(0)
  })

  it("si la plantilla no está aprobada, devuelve el motivo y no miente", async () => {
    respuesta = { resultado: "omitido_plantilla_no_aprobada", wamid: null, plantilla: "x" }
    const r = await avisarPorWhatsApp({} as never, base)
    expect(r.resultado).toBe("omitido_plantilla_no_aprobada")
    expect(r.wamid).toBeNull()
  })
})
