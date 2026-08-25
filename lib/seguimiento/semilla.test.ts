import { describe, it, expect } from "vitest"
import { renderizarSemilla } from "./semilla"
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
  last_message_at: "2026-08-16T14:00:00Z",
  metricas: { nombre: "Laura", zona: "La Plata", presupuesto_max: "120000" },
  follow_ups_history: [],
  requires_follow_up: true,
  bot_active: true,
  opt_out: false,
} as Candidato

describe("renderizarSemilla", () => {
  it("incluye identidad, origen, etapa, métricas y la consigna de investigar", () => {
    const t = renderizarSemilla(base, 55, 1, "2026-08-24T15:00:00-03:00", "Whatsapp-Consulta")
    expect(t).toContain("Laura")
    expect(t).toContain("La Plata")
    expect(t).toContain("Whatsapp-Consulta")
    expect(t).toContain("Intentos de seguimiento ya enviados: 1")
    expect(t).toContain("Compromisos activos: 1")
    expect(t).toMatch(/investig/i)
  })
  it("el nombre sale de metricas, jamás del perfil de WhatsApp", () => {
    const t = renderizarSemilla(
      { ...base, contact_name: "🔥Lau🔥", metricas: {} },
      0,
      0,
      "2026-08-24T15:00:00-03:00"
    )
    expect(t).not.toContain("🔥")
    expect(t).toContain("sin nombre")
  })
  it("un nombre de menos de 3 letras cuenta como sin nombre (decisión 25/8)", () => {
    const t = renderizarSemilla({ ...base, metricas: { nombre: "K" } }, 0, 0, "2026-08-25T15:00:00-03:00")
    expect(t).not.toMatch(/Lead: K ·/)
    expect(t).toContain("sin nombre")
  })
  it("no incluye los mensajes de la conversación (eso es de leer_mensajes)", () => {
    const t = renderizarSemilla(base, 55, 0, "2026-08-24T15:00:00-03:00")
    expect(t).not.toContain("cochera")
  })
  it("no explota con métricas vacías", () => {
    const t = renderizarSemilla({ ...base, metricas: {} }, 0, 0, "2026-08-24T15:00:00-03:00")
    expect(t).toContain("(sin datos capturados)")
  })
})
