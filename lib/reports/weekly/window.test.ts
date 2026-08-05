import { describe, it, expect } from "vitest"
import { previousWeek } from "./window"

describe("previousWeek", () => {
  it("un lunes devuelve la semana lunes-domingo anterior en hora AR", () => {
    // Lunes 3-ago-2026, 11:00 UTC = 8:00 AR (la hora a la que corre el cron).
    const w = previousWeek(new Date("2026-08-03T11:00:00.000Z"))
    // Lunes 27-jul 00:00 AR = 27-jul 03:00 UTC
    expect(w.startUtc).toBe("2026-07-27T03:00:00.000Z")
    // Domingo 2-ago 23:59:59.999 AR = 3-ago 02:59:59.999 UTC
    expect(w.endUtc).toBe("2026-08-03T02:59:59.999Z")
  })

  it("un domingo devuelve la última semana COMPLETA, no la que está corriendo", () => {
    // Domingo 2-ago-2026, 15:00 UTC = 12:00 AR
    const w = previousWeek(new Date("2026-08-02T15:00:00.000Z"))
    expect(w.startUtc).toBe("2026-07-20T03:00:00.000Z")
    expect(w.endUtc).toBe("2026-07-27T02:59:59.999Z")
  })

  it("de madrugada en AR (que ya es el día siguiente en UTC) no se corre una semana", () => {
    // Lunes 3-ago 01:00 AR = lunes 3-ago 04:00 UTC. Sigue siendo lunes en AR.
    const w = previousWeek(new Date("2026-08-03T04:00:00.000Z"))
    expect(w.startUtc).toBe("2026-07-27T03:00:00.000Z")
  })

  it("domingo 22:00 AR = lunes 01:00 UTC: manda la hora AR, no la UTC", () => {
    // En UTC ya es lunes 3-ago, pero en AR todavía es domingo 2-ago.
    const w = previousWeek(new Date("2026-08-03T01:00:00.000Z"))
    expect(w.startUtc).toBe("2026-07-20T03:00:00.000Z")
    expect(w.endUtc).toBe("2026-07-27T02:59:59.999Z")
  })

  it("arma la etiqueta legible del rango", () => {
    const w = previousWeek(new Date("2026-08-03T11:00:00.000Z"))
    expect(w.label).toBe("27 de julio al 2 de agosto de 2026")
  })
})
