import { describe, it, expect } from "vitest"
import { puedeEjecutar, sigueElegible } from "./guardrails"
import type { Candidato, ConfigAgencia, Decision } from "./tipos"

const config: ConfigAgencia = {
  agency_id: "a1",
  modo: "activo",
  silencio_minimo_horas: 20,
  max_intentos: 3,
  max_mensajes_dia: 50,
  escalamiento_horas: 2,
  max_escalamientos_dia: 3,
}
const base: Candidato = {
  id: "c1",
  agency_id: "a1",
  contact_phone: "+5491100000000",
  contact_name: "Test",
  funnel_status: "open",
  visit_status: "none",
  visit_scheduled_at: null,
  visit_address: null,
  follow_ups_sent: 1,
  next_follow_up_at: null,
  last_message_at: "2026-08-15T10:00:00Z",
  metricas: { nombre: "Test" },
  follow_ups_history: [],
  requires_follow_up: true,
  bot_active: true,
  opt_out: false,
}
const decision: Decision = {
  accion: "contactar",
  plantilla: "seg_f1_seguimiento",
  frase_cierre: "¿Seguís buscando en la zona?",
  proximo_intento_horas: 72,
  razon: "Lead tibio con búsqueda definida, retomo con pregunta suave.",
  confianza: 0.8,
}

describe("puedeEjecutar", () => {
  it("bloquea confianza < 0.5", () => {
    const r = puedeEjecutar({ ...decision, confianza: 0.4 }, base, config, 0)
    expect(r).toEqual({ ok: false, motivo: "confianza_baja" })
  })
  it("bloquea si la agencia agotó el presupuesto diario", () => {
    const r = puedeEjecutar(decision, base, config, 50)
    expect(r).toEqual({ ok: false, motivo: "presupuesto_diario_agotado" })
  })
  it("bloquea si ya se le mandó un seguimiento hoy (1 por día)", () => {
    const hoy = new Date().toISOString()
    const c = { ...base, follow_ups_history: [{ at: hoy, type: "seg_f1_seguimiento" }] }
    const r = puedeEjecutar(decision, c, config, 0)
    expect(r).toEqual({ ok: false, motivo: "ya_contactado_hoy" })
  })
  it("compara el día en hora argentina, no UTC", () => {
    // 22:30 AR de ayer: NO debe contar como "contactado hoy"
    const ayer2230AR = new Date()
    ayer2230AR.setDate(ayer2230AR.getDate() - 1)
    ayer2230AR.setHours(22, 30, 0, 0)
    const c = {
      ...base,
      follow_ups_history: [{ at: ayer2230AR.toISOString(), type: "seg_f1_seguimiento" }],
    }
    expect(puedeEjecutar(decision, c, config, 0).ok).toBe(true)
  })
  it("bloquea intentos agotados", () => {
    const r = puedeEjecutar(decision, { ...base, follow_ups_sent: 3 }, config, 0)
    expect(r).toEqual({ ok: false, motivo: "max_intentos" })
  })
  it("deja pasar el caso sano", () => {
    expect(puedeEjecutar(decision, base, config, 5).ok).toBe(true)
  })
})

describe("sigueElegible (releída justo antes de enviar)", () => {
  it("aborta si entró un mensaje nuevo desde la decisión", () => {
    const ahora = { ...base, last_message_at: "2026-08-18T09:00:00Z" }
    expect(sigueElegible(base, ahora)).toBe(false)
  })
  it("aborta si un humano tomó el chat (bot_active pasó a false)", () => {
    expect(sigueElegible(base, { ...base, bot_active: false })).toBe(false)
  })
  it("aborta si el lead hizo opt-out en el medio", () => {
    expect(sigueElegible(base, { ...base, opt_out: true })).toBe(false)
  })
  it("pasa si nada cambió", () => {
    expect(sigueElegible(base, { ...base })).toBe(true)
  })
})
