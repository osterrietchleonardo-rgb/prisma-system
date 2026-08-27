import { describe, it, expect } from "vitest"
import { armarAvisoDirectorSinRespuesta, horasTexto } from "./escalamiento"
import type { PerfilEquipo } from "./avisos"

const director: PerfilEquipo = { id: "p-dir", full_name: "Víctor López", role: "director", email: "v@x.com", phone: "5491100000009" }
const conv = { id: "conv-1", contact_phone: "5491155550000", metricas: { nombre: "Laura Gómez" } }
const APP = "https://prisma.vakdor.com"
const contexto = { busca: "venta, casa en La Plata", ultimoMensaje: { texto: "¿Se puede visitar el sábado?", fechaAR: "26/8 12:37" } }

describe("armarAvisoDirectorSinRespuesta", () => {
  it("trae el dato, el tiempo, el contexto y la acción sugerida (nunca solo el problema)", () => {
    const a = armarAvisoDirectorSinRespuesta(director, conv, { asesorNombre: "Martín", horas: 4.2, contexto }, APP, "Central")
    expect(a.asunto).toBe("Laura Gómez lleva 4 horas sin respuesta — Central")
    expect(a.html).toContain("Martín lleva 4 horas sin responderle a Laura Gómez")
    expect(a.html).toContain("Qué busca:")
    expect(a.html).toMatch(/reasignarlo, tomarlo vos o darle más tiempo/)
    expect(a.link).toBe("https://prisma.vakdor.com/director/leads-whatsapp/conv-1")
    expect(a.plantilla).toBe("director_asesor_sin_respuesta")
    expect(a.variables[0]).toBe("Víctor")
    expect(a.variables[1]).toBe("Martín lleva 4 horas sin responderle a Laura Gómez (+5491155550000), que quedó esperando a un humano. Busca: venta, casa en La Plata. Último mensaje del cliente (26/8 12:37): «¿Se puede visitar el sábado?»")
    expect(a.variables[2]).toBe(a.link)
  })
  it("sin asesor asignado lo dice", () => {
    const a = armarAvisoDirectorSinRespuesta(director, conv, { asesorNombre: null, horas: 30 }, APP, "C")
    expect(a.variables[1]).toBe("Laura Gómez (+5491155550000) lleva 30 horas esperando a un humano y no tiene asesor asignado")
  })
  it("sin nombre registrado dice 'Un cliente', nunca el de WhatsApp", () => {
    const a = armarAvisoDirectorSinRespuesta(director, { ...conv, metricas: {} }, { asesorNombre: null, horas: 3 }, APP, "C")
    expect(a.variables[1]).toContain("Un cliente (+5491155550000)")
  })
})

describe("horasTexto", () => {
  it("horas hasta 47, después días", () => {
    expect(horasTexto(1)).toBe("1 hora")
    expect(horasTexto(5.4)).toBe("5 horas")
    expect(horasTexto(72)).toBe("3 días")
  })
})
