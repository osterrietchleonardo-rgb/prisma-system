import { describe, expect, it } from "vitest"
import { dentroDeVentanaEnvio, horasHabiles } from "./sending-window"

// Helper: un instante en hora ARGENTINA (UTC-3 fijo, sin horario de verano).
const ar = (iso: string) => Date.parse(iso + "-03:00")

describe("dentroDeVentanaEnvio", () => {
  it("las 3 de la mañana AR está afuera", () => {
    expect(dentroDeVentanaEnvio(new Date(ar("2026-09-03T03:00:00")))).toBe(false)
  })
  it("las 6:00 ya está adentro y las 22:59 también", () => {
    expect(dentroDeVentanaEnvio(new Date(ar("2026-09-03T06:00:00")))).toBe(true)
    expect(dentroDeVentanaEnvio(new Date(ar("2026-09-03T22:59:00")))).toBe(true)
  })
  it("las 23:00 en punto ya está afuera", () => {
    expect(dentroDeVentanaEnvio(new Date(ar("2026-09-03T23:00:00")))).toBe(false)
  })
})

describe("horasHabiles: la noche no cuenta (Kevin, 2/9)", () => {
  it("el lead de las 3am recién empieza a esperar a las 6: a las 8 lleva 2 h", () => {
    expect(horasHabiles(ar("2026-09-03T03:00:00"), ar("2026-09-03T08:00:00"))).toBe(2)
  })
  it("a las 9am el asesor que arrancó su día lleva 3 h, no 6", () => {
    expect(horasHabiles(ar("2026-09-03T03:00:00"), ar("2026-09-03T09:00:00"))).toBe(3)
  })
  it("el lead de las 22:00 suma 1 h, congela a las 23 y retoma a las 6", () => {
    // 22→23 = 1 h; 23→6 = 0; 6→7 = 1 h → total 2 h a las 7:00 del día siguiente
    expect(horasHabiles(ar("2026-09-03T22:00:00"), ar("2026-09-04T07:00:00"))).toBe(2)
  })
  it("dentro del día es idéntico al reloj", () => {
    expect(horasHabiles(ar("2026-09-03T10:00:00"), ar("2026-09-03T15:30:00"))).toBe(5.5)
  })
  it("nunca supera las horas de reloj", () => {
    const t0 = ar("2026-09-01T14:00:00")
    const t1 = ar("2026-09-03T14:00:00")
    const reloj = (t1 - t0) / 3600e3
    expect(horasHabiles(t0, t1)).toBeLessThanOrEqual(reloj)
    // dos días completos = 2 × 17 h hábiles
    expect(horasHabiles(t0, t1)).toBe(34)
  })
  it("un rango enteramente nocturno da 0", () => {
    expect(horasHabiles(ar("2026-09-03T23:30:00"), ar("2026-09-04T05:45:00"))).toBe(0)
  })
  it("orden invertido o basura dan 0, no negativos", () => {
    expect(horasHabiles(ar("2026-09-03T10:00:00"), ar("2026-09-03T09:00:00"))).toBe(0)
    expect(horasHabiles(NaN, ar("2026-09-03T09:00:00"))).toBe(0)
  })
})
