import { describe, it, expect } from "vitest"
import { calcularScore } from "./prioridad"
import type { Candidato } from "./tipos"

const base: Candidato = {
  id: "c1",
  agency_id: "a1",
  contact_phone: "+549110000",
  contact_name: "T",
  funnel_status: "open",
  visit_status: "none",
  visit_scheduled_at: null,
  visit_address: null,
  follow_ups_sent: 0,
  next_follow_up_at: null,
  last_message_at: null,
  metricas: { nombre: "T" },
  follow_ups_history: [],
  requires_follow_up: true,
  bot_active: true,
  opt_out: false,
}

describe("calcularScore", () => {
  it("un compromiso por vencer pesa más que cualquier señal", () => {
    const conCompromiso = calcularScore(base, [
      {
        tipo: "respuesta_pendiente",
        descripcion: "x",
        asumido_por: "asesor",
        vence_en: new Date(Date.now() + 3 * 3600e3).toISOString(),
      },
    ])
    const conPresupuesto = calcularScore(
      { ...base, metricas: { nombre: "T", presupuesto_max: "150000" } },
      []
    )
    expect(conCompromiso).toBeGreaterThan(conPresupuesto)
  })
  it("cada intento previo sin respuesta resta", () => {
    // con una señal positiva de base, para que la resta no quede clavada en el piso 0
    const tibio = { ...base, metricas: { nombre: "T", zona: "Caseros" } }
    expect(calcularScore({ ...tibio, follow_ups_sent: 2 }, [])).toBeLessThan(
      calcularScore(tibio, [])
    )
  })
  it("nunca devuelve negativo", () => {
    expect(calcularScore({ ...base, follow_ups_sent: 3 }, [])).toBeGreaterThanOrEqual(0)
  })
})
