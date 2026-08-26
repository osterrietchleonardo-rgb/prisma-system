import { describe, it, expect } from "vitest"
import { armarAvisoEscalar, elegirDestinatario, linkAlChat, nombreCliente, unaLinea, type PerfilEquipo } from "./avisos"

const asesor: PerfilEquipo = { id: "p-asesor", full_name: "Martín Pérez", role: "asesor", email: "m@x.com", phone: "5491100000001" }
const director: PerfilEquipo = { id: "p-dir", full_name: "Víctor López", role: "director", email: "v@x.com", phone: null }
const conv = { id: "conv-1", contact_phone: "5491155550000", metricas: { nombre: "Belen" } }
const decision = {
  razon: "Pidió coordinar una visita el 1/8 y hace 3 semanas que nadie le escribe",
  evidencia: "mensaje del 1/8 10:12: '¿puedo ir a verlo el sábado?' sin respuesta humana",
  frase_cierre: "estoy hablando con el asesor responsable para que te contacte a la brevedad",
  plantilla: "seg_pendiente" as const,
}
const APP = "https://prisma.vakdor.com"

describe("elegirDestinatario", () => {
  it("el asesor asignado gana siempre", () => {
    expect(elegirDestinatario(asesor, [director])).toEqual({ perfil: asesor, esAsignado: true })
  })
  it("sin asesor asignado va al director", () => {
    expect(elegirDestinatario(null, [director])).toEqual({ perfil: director, esAsignado: false })
  })
  it("sin nadie ⇒ null (y el runner lo registra, no lo inventa)", () => {
    expect(elegirDestinatario(null, [])).toBeNull()
  })
})

describe("linkAlChat: al chat concreto y con la URL del rol de quien lo abre", () => {
  it("asesor", () => expect(linkAlChat(asesor, "conv-1", APP)).toBe("https://prisma.vakdor.com/asesor/leads-whatsapp/conv-1"))
  it("director", () => expect(linkAlChat(director, "conv-1", APP + "/")).toBe("https://prisma.vakdor.com/director/leads-whatsapp/conv-1"))
})

describe("nombreCliente: solo el de metricas, nunca el de WhatsApp", () => {
  it("usa metricas.nombre", () => expect(nombreCliente({ metricas: { nombre: " Belen " } })).toBe("Belen"))
  it("sin nombre válido ⇒ 'Un cliente' aunque haya contact_name", () => {
    expect(nombreCliente({ metricas: {}, contact_name: "Belu 🌸" } as never)).toBe("Un cliente")
    expect(nombreCliente({ metricas: { nombre: "Jo" } })).toBe("Un cliente")
  })
})

describe("unaLinea: apto para parámetro de plantilla de Meta", () => {
  it("sin saltos de línea ni espacios múltiples", () => {
    expect(unaLinea("hola\n\n  mundo\t  ")).toBe("hola mundo")
  })
  it("recorta con puntos suspensivos", () => {
    const largo = "a".repeat(300)
    const r = unaLinea(largo, 50)
    expect(r.length).toBeLessThanOrEqual(50)
    expect(r.endsWith("…")).toBe(true)
  })
})

describe("armarAvisoEscalar", () => {
  it("WhatsApp: nombre de pila, resumen de una línea con cliente + teléfono + razón, y el link", () => {
    const a = armarAvisoEscalar(asesor, true, conv, decision, APP, "Central Real Estate")
    expect(a.variables[0]).toBe("Martín")
    expect(a.variables[1]).toContain("Belen (+5491155550000)")
    expect(a.variables[1]).toContain("Pidió coordinar una visita")
    expect(a.variables[1]).not.toMatch(/\n/)
    expect(a.variables[2]).toBe("https://prisma.vakdor.com/asesor/leads-whatsapp/conv-1")
    expect(a.plantilla).toBe("asesor_cliente_esperando")
  })
  it("email: asunto con el cliente y la agencia; cuerpo con la razón, el dato y el link", () => {
    const a = armarAvisoEscalar(asesor, true, conv, decision, APP, "Central Real Estate")
    expect(a.asunto).toBe("Belen está esperando tu respuesta — Central Real Estate")
    expect(a.html).toContain("Hola Martín")
    expect(a.html).toContain(decision.razon)
    expect(a.html).toContain("sin respuesta humana")
    expect(a.html).toContain(a.link)
    expect(a.html).toContain("asignado a vos")
    expect(a.html).toContain("estamos hablando con el asesor responsable")
  })
  it("al director le explica por qué le llega a él, y el link es el del director", () => {
    const a = armarAvisoEscalar(director, false, conv, { ...decision, plantilla: "seg_valor" as const }, APP, "Central")
    expect(a.html).toContain("no tiene asesor asignado")
    expect(a.link).toBe("https://prisma.vakdor.com/director/leads-whatsapp/conv-1")
    expect(a.html).not.toContain("estamos hablando con el asesor responsable")
  })
  it("escapa HTML que venga en la razón o la evidencia", () => {
    const a = armarAvisoEscalar(asesor, true, conv, { ...decision, razon: "<script>x</script>" }, APP, "C")
    expect(a.html).not.toContain("<script>")
    expect(a.html).toContain("&lt;script&gt;")
  })
})
