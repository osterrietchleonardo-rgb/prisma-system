import { describe, it, expect } from "vitest"
import {
  LIMITES_CHAT,
  decidirAtencion,
  revisarOrigen,
  type EstadoConversacion,
  type WidgetPublico,
} from "./puerta"

const widget: WidgetPublico = {
  id: "w-1",
  agency_id: "ag-1",
  activo: true,
  dominios: ["central.com", "www.central.com"],
  whatsapp_destino: "5491150604928",
}

const conversacion: EstadoConversacion = { mensajes: 4, costoUSD: 0.02 }

describe("revisarOrigen: solo desde la web de la agencia", () => {
  it("el dominio declarado y su www, sí", () => {
    expect(revisarOrigen("https://central.com", widget.dominios)).toBe(true)
    expect(revisarOrigen("https://www.central.com", widget.dominios)).toBe(true)
    expect(revisarOrigen("https://central.com:443", widget.dominios)).toBe(true)
  })
  it("cualquier otro, no: si no, cualquiera usa el asistente de la agencia y le gasta la cuenta", () => {
    for (const o of ["https://otro.com", "https://central.com.ar", "https://malcentral.com", "http://localhost:3000"])
      expect(revisarOrigen(o, widget.dominios), o).toBe(false)
  })
  it("sin Origin, no: falla CERRADO", () => {
    expect(revisarOrigen(null, widget.dominios)).toBe(false)
    expect(revisarOrigen("", widget.dominios)).toBe(false)
    expect(revisarOrigen("no es una url", widget.dominios)).toBe(false)
  })
  it("sin dominios configurados, no atiende a nadie", () => {
    expect(revisarOrigen("https://central.com", [])).toBe(false)
  })
})

describe("decidirAtencion: hasta dónde se conversa", () => {
  it("con todo en orden, atiende", () => {
    expect(decidirAtencion({ widget, conversacion, gastoDelDiaUSD: 0.5 }).ok).toBe(true)
  })

  it("un widget apagado no atiende, aunque lo llamen bien", () => {
    const r = decidirAtencion({ widget: { ...widget, activo: false }, conversacion, gastoDelDiaUSD: 0 })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.motivo).toBe("apagado")
  })

  it("pasado el tope de mensajes, NO corta seco: pasa a WhatsApp", () => {
    const r = decidirAtencion({
      widget,
      conversacion: { mensajes: LIMITES_CHAT.mensajesPorConversacion, costoUSD: 0.01 },
      gastoDelDiaUSD: 0,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.motivo).toBe("muchos_mensajes")
    expect(r.paraElVisitante).toMatch(/whatsapp/i)
  })

  it("pasado el tope de costo de la conversación, también pasa a WhatsApp", () => {
    const r = decidirAtencion({
      widget,
      conversacion: { mensajes: 5, costoUSD: LIMITES_CHAT.costoPorConversacionUSD },
      gastoDelDiaUSD: 0,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.motivo).toBe("costo_conversacion")
  })

  it("pasado el tope del día de la agencia, el chat deja de atender: un error nuestro no puede vaciar la cuenta", () => {
    const r = decidirAtencion({
      widget,
      conversacion,
      gastoDelDiaUSD: LIMITES_CHAT.costoPorAgenciaPorDiaUSD,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.motivo).toBe("costo_dia")
    expect(r.paraElVisitante.length).toBeGreaterThan(0)
  })

  it("cuando no atiende, el visitante SIEMPRE recibe una salida, nunca un silencio", () => {
    for (const caso of [
      { widget: { ...widget, activo: false }, conversacion, gastoDelDiaUSD: 0 },
      { widget, conversacion: { mensajes: 99, costoUSD: 0 }, gastoDelDiaUSD: 0 },
      { widget, conversacion, gastoDelDiaUSD: 99 },
    ]) {
      const r = decidirAtencion(caso)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.paraElVisitante.trim().length).toBeGreaterThan(10)
    }
  })

  it("si la agencia no cargó WhatsApp, la salida no promete un WhatsApp que no existe", () => {
    const r = decidirAtencion({
      widget: { ...widget, whatsapp_destino: null },
      conversacion: { mensajes: 99, costoUSD: 0 },
      gastoDelDiaUSD: 0,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.paraElVisitante.toLowerCase()).not.toContain("whatsapp")
  })
})
