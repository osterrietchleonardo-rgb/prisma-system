import { describe, it, expect } from "vitest"
import { queRecordatorioToca, variablesRecordatorio, horaVisitaAR } from "./visitas"
import type { Candidato } from "./tipos"

const base = {
  id: "c1", agency_id: "a1", contact_phone: "+549110000", contact_name: "Laura",
  funnel_status: "open", visit_status: "scheduled",
  visit_scheduled_at: "2026-08-27T15:00:00-03:00", visit_address: "Av. Mitre 1200, Caseros",
  follow_ups_sent: 0, next_follow_up_at: null, last_message_at: null,
  metricas: { nombre: "Laura" }, follow_ups_history: [], requires_follow_up: true, bot_active: true, opt_out: false,
} as Candidato

const AHORA = Date.parse("2026-08-22T12:00:00-03:00")
const visita = (horas: number, history: Array<Record<string, unknown>> = []) => ({
  ...base,
  visit_scheduled_at: new Date(AHORA + horas * 3600e3).toISOString(),
  follow_ups_history: history,
})

describe("queRecordatorioToca", () => {
  it("a 20h de la visita toca el de 24h", () => {
    expect(queRecordatorioToca(visita(20), AHORA)).toBe("visita24")
  })
  it("si el de 24h ya salió, a 2.5h toca el de 3h", () => {
    const h = [{ type: "visita_recordatorio_24h", at: new Date(AHORA - 3600e3).toISOString() }]
    expect(queRecordatorioToca(visita(2.5, h), AHORA)).toBe("visita3")
  })
  it("a 1h toca el de 1h", () => {
    expect(queRecordatorioToca(visita(1), AHORA)).toBe("visita1")
  })
  it("no repite un recordatorio ya enviado", () => {
    const h = [{ type: "visita_recordatorio_3h", at: new Date(AHORA - 600e3).toISOString() }]
    expect(queRecordatorioToca(visita(2.5, h), AHORA)).toBeNull()
  })
  it("visita pasada sin confirmar ⇒ noShow (una sola vez)", () => {
    expect(queRecordatorioToca(visita(-1), AHORA)).toBe("noShow")
    expect(queRecordatorioToca(visita(-1, [{ type: "visita_post_noshow", at: "x" }]), AHORA)).toBeNull()
  })
  it("visita pasada hace más de 48h ⇒ nada (ya no tiene sentido)", () => {
    expect(queRecordatorioToca(visita(-60), AHORA)).toBeNull()
  })
  it("visita confirmada y pasada ⇒ nada (no es no-show)", () => {
    expect(queRecordatorioToca({ ...visita(-1), visit_status: "confirmed" }, AHORA)).toBeNull()
  })
  it("faltan 3 días ⇒ nada", () => {
    expect(queRecordatorioToca(visita(72), AHORA)).toBeNull()
  })
  it("sin fecha ⇒ nada", () => {
    expect(queRecordatorioToca({ ...base, visit_scheduled_at: null }, AHORA)).toBeNull()
  })
})

describe("variablesRecordatorio: las variables reales de cada plantilla", () => {
  it("24h y 3h = [nombre, hora, dirección]", () => {
    expect(variablesRecordatorio("visita24", "Laura", "15:00", "Av. Mitre 1200")).toEqual(["Laura", "15:00", "Av. Mitre 1200"])
    expect(variablesRecordatorio("visita3", "Laura", "15:00", "Av. Mitre 1200")).toEqual(["Laura", "15:00", "Av. Mitre 1200"])
  })
  it("1h = [nombre, hora]; no-show = [nombre]", () => {
    expect(variablesRecordatorio("visita1", "Laura", "15:00", "x")).toEqual(["Laura", "15:00"])
    expect(variablesRecordatorio("noShow", "Laura", "15:00", "x")).toEqual(["Laura"])
  })
})

describe("horaVisitaAR", () => {
  it("convierte a hora argentina", () => {
    expect(horaVisitaAR("2026-08-27T18:00:00Z")).toBe("15:00")
  })
})
