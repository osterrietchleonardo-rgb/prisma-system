import { describe, it, expect } from "vitest"
import { derivarCompromisosDeVisita } from "./compromisos"
import type { Candidato } from "./tipos"

const base = {
  id: "c1", agency_id: "a1", contact_phone: "+549110000", contact_name: "Laura",
  funnel_status: "open", visit_status: "scheduled",
  visit_scheduled_at: "2026-08-27T15:00:00-03:00", visit_address: "Av. Mitre 1200, Caseros",
  follow_ups_sent: 0, next_follow_up_at: null, last_message_at: null,
  metricas: {}, follow_ups_history: [], requires_follow_up: true, bot_active: true, opt_out: false,
} as Candidato

describe("derivarCompromisosDeVisita", () => {
  it("visita agendada ⇒ compromiso del lead con vencimiento en la visita", () => {
    const k = derivarCompromisosDeVisita(base)
    expect(k).toMatchObject({ tipo: "visita_agendada", asumido_por: "lead" })
    expect(k!.descripcion).toContain("Av. Mitre 1200")
    expect(k!.vence_en).toBe("2026-08-27T15:00:00-03:00")
  })
  it("visita confirmada también cuenta", () => {
    expect(derivarCompromisosDeVisita({ ...base, visit_status: "confirmed" })).not.toBeNull()
  })
  it("sin visita ⇒ null", () => {
    expect(derivarCompromisosDeVisita({ ...base, visit_status: "none", visit_scheduled_at: null })).toBeNull()
  })
  it("visita marcada pero sin fecha ⇒ null (no se persigue lo que no tiene cuándo)", () => {
    expect(derivarCompromisosDeVisita({ ...base, visit_scheduled_at: null })).toBeNull()
  })
  it("sin dirección usa texto genérico, jamás inventa", () => {
    const k = derivarCompromisosDeVisita({ ...base, visit_address: null })
    expect(k!.descripcion).toContain("la propiedad acordada")
    expect(derivarCompromisosDeVisita({ ...base, visit_address: "   " })!.descripcion).toContain("la propiedad acordada")
  })
})
