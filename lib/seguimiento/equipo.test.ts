import { describe, it, expect } from "vitest"
import {
  armarAvisoAsignacion, armarAvisoPedidoAlDirector, fraseReapertura, validarJustificacion,
  venceEn, ventanaCerrada,
} from "./equipo"
import type { PerfilEquipo } from "./avisos"

const asesor: PerfilEquipo = { id: "p-asesor", full_name: "Martín Pérez", role: "asesor", email: "m@x.com", phone: "5491100000001" }
const director: PerfilEquipo = { id: "p-dir", full_name: "Víctor López", role: "director", email: "v@x.com", phone: null }
const conv = { id: "conv-1", contact_phone: "5491155550000", metricas: { nombre: "Belen" } }
const APP = "https://prisma.vakdor.com"

describe("ventanaCerrada: Meta solo acepta texto libre 24 h después del último mensaje del cliente", () => {
  const ahora = new Date("2026-08-27T15:00:00Z")
  it("hace 2 h ⇒ abierta", () => expect(ventanaCerrada("2026-08-27T13:00:00Z", ahora)).toBe(false))
  it("hace 25 h ⇒ cerrada", () => expect(ventanaCerrada("2026-08-26T14:00:00Z", ahora)).toBe(true))
  it("sin mensaje del cliente ⇒ cerrada (no se asume nada)", () => expect(ventanaCerrada(null, ahora)).toBe(true))
})

describe("validarJustificacion: obligatoria y con contenido", () => {
  it("vacía o muy corta ⇒ error", () => {
    expect(validarJustificacion("")).toMatch(/detalle/)
    expect(validarJustificacion("   no  ")).toMatch(/detalle/)
  })
  it("con contenido ⇒ ok", () => expect(validarJustificacion("Estoy de vacaciones hasta el 5")).toBeNull())
  it("demasiado larga ⇒ error", () => expect(validarJustificacion("a".repeat(501))).toMatch(/largo/))
})

describe("armarAvisoAsignacion", () => {
  it("WhatsApp: nombre de pila, quién lo asignó, cliente con teléfono, motivo y link del rol", () => {
    const a = armarAvisoAsignacion(asesor, conv, { porQuien: "Víctor", motivo: "Es de tu zona" }, APP, "Central")
    expect(a.plantilla).toBe("asesor_cliente_esperando")
    expect(a.variables[0]).toBe("Martín")
    expect(a.variables[1]).toBe("Víctor te asignó el chat de Belen (+5491155550000): Es de tu zona")
    expect(a.variables[2]).toBe("https://prisma.vakdor.com/asesor/leads-whatsapp/conv-1")
  })
  it("sin motivo no inventa uno; el email explica los dos botones", () => {
    const a = armarAvisoAsignacion(asesor, conv, { porQuien: "Víctor", motivo: null }, APP, "Central")
    expect(a.variables[1]).toBe("Víctor te asignó el chat de Belen (+5491155550000)")
    expect(a.html).not.toContain("Motivo:")
    expect(a.html).toContain("«Lo tomo»")
    expect(a.html).toContain("«No lo puedo tomar»")
    expect(a.asunto).toBe("Te asignaron el chat de Belen — Central")
  })
  it("sin nombre registrado del cliente dice 'Un cliente', nunca el nombre de WhatsApp", () => {
    const a = armarAvisoAsignacion(asesor, { ...conv, metricas: {} }, { porQuien: "Víctor", motivo: null }, APP, "C")
    expect(a.variables[1]).toContain("Un cliente (+5491155550000)")
  })
})

describe("armarAvisoPedidoAlDirector", () => {
  it("plantilla de aprobación, con el pedido y el link a la pantalla de aprobaciones", () => {
    const a = armarAvisoPedidoAlDirector(director, conv, { asesorNombre: "Martín", justificacion: "  Estoy de licencia  " }, APP, "Central")
    expect(a.plantilla).toBe("director_aprobacion_pendiente")
    expect(a.variables[0]).toBe("Víctor")
    expect(a.variables[1]).toBe("reasignar el chat de Belen (+5491155550000): Martín no lo puede tomar («Estoy de licencia»)")
    expect(a.variables[2]).toBe("https://prisma.vakdor.com/director/aprobaciones")
    expect(a.html).toContain("Estoy de licencia")
    expect(a.html).toContain("/director/leads-whatsapp/conv-1")
  })
  it("escapa HTML en la justificación", () => {
    const a = armarAvisoPedidoAlDirector(director, conv, { asesorNombre: "M", justificacion: "<b>x</b> y más texto" }, APP, "C")
    expect(a.html).not.toContain("<b>x</b>")
  })
})

describe("fraseReapertura y venceEn", () => {
  it("usa el nombre de pila del asesor nuevo", () => {
    expect(fraseReapertura("Martín Pérez")).toBe("Tu consulta ahora la sigue Martín, que te escribe a la brevedad.")
    expect(fraseReapertura("")).toBe("Tu consulta ahora la sigue un asesor, que te escribe a la brevedad.")
  })
  it("venceEn suma 24 h por defecto", () => {
    expect(venceEn(new Date("2026-08-27T10:00:00Z"))).toBe("2026-08-28T10:00:00.000Z")
  })
})
