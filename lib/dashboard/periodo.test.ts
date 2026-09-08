import { describe, it, expect } from "vitest"
import { periodoDelDashboard } from "./periodo"

describe("periodoDelDashboard: el panel cuenta lo que la pantalla dice (Kevin, 7/9)", () => {
  // 7/9/2026 13:30 AR = 16:30 UTC
  const ahora = new Date("2026-09-07T16:30:00Z")

  it("sin período en la URL: últimos 30 días, en fecha argentina, formato del filtro", () => {
    expect(periodoDelDashboard({}, ahora)).toEqual({ from: "2026-08-08", to: "2026-09-07", porDefecto: true })
    expect(periodoDelDashboard(undefined, ahora).porDefecto).toBe(true)
  })

  it("a las 22:30 AR (ya es mañana en UTC) el 'hoy' sigue siendo el argentino", () => {
    const nocheAR = new Date("2026-09-08T01:30:00Z") // 7/9 22:30 AR
    expect(periodoDelDashboard({}, nocheAR).to).toBe("2026-09-07")
  })

  it("con período elegido en el filtro se respeta tal cual", () => {
    expect(periodoDelDashboard({ from: "2026-07-01", to: "2026-07-31" }, ahora))
      .toEqual({ from: "2026-07-01", to: "2026-07-31", porDefecto: false })
  })

  it("con un solo extremo, o un formato raro, o al revés: vuelve al defecto", () => {
    expect(periodoDelDashboard({ from: "2026-07-01" }, ahora).porDefecto).toBe(true)
    expect(periodoDelDashboard({ from: "01/07/2026", to: "31/07/2026" }, ahora).porDefecto).toBe(true)
    expect(periodoDelDashboard({ from: "2026-07-31", to: "2026-07-01" }, ahora).porDefecto).toBe(true)
  })
})
