import { describe, it, expect } from "vitest"
import { filtroDeBandeja, puedeVerBandejaWeb } from "./acceso"

const DIRECTOR = { id: "d-1", rol: "director" }
const ELEGIDO = { id: "a-1", rol: "asesor" }
const OTRO = { id: "a-2", rol: "asesor" }
const widget = { perfil_equipo_id: "a-1" }

describe("puedeVerBandejaWeb: quién entra a la bandeja del chat web", () => {
  it("el director, siempre", () => {
    expect(puedeVerBandejaWeb(DIRECTOR, widget)).toBe(true)
    expect(puedeVerBandejaWeb(DIRECTOR, { perfil_equipo_id: null })).toBe(true)
  })

  it("el asesor que el director eligió en el desplegable, sí", () => {
    expect(puedeVerBandejaWeb(ELEGIDO, widget)).toBe(true)
  })

  it("cualquier otro asesor, NO: son datos de gente que todavía no es cliente", () => {
    expect(puedeVerBandejaWeb(OTRO, widget)).toBe(false)
  })

  it("sin nadie elegido, ningún asesor entra", () => {
    expect(puedeVerBandejaWeb(ELEGIDO, { perfil_equipo_id: null })).toBe(false)
    expect(puedeVerBandejaWeb(OTRO, { perfil_equipo_id: null })).toBe(false)
  })

  it("sin widget todavía, solo el director", () => {
    expect(puedeVerBandejaWeb(DIRECTOR, null)).toBe(true)
    expect(puedeVerBandejaWeb(ELEGIDO, null)).toBe(false)
  })

  it("un rol que no existe no entra por descuido", () => {
    for (const rol of ["", "invitado", "admin", null as unknown as string])
      expect(puedeVerBandejaWeb({ id: "a-1", rol }, widget), String(rol)).toBe(false)
  })
})

describe("filtroDeBandeja: qué conversaciones ve cada uno", () => {
  it("el director ve todas las de su agencia", () => {
    expect(filtroDeBandeja(DIRECTOR, widget)).toEqual({ todas: true })
  })

  it("el asesor elegido ve SOLO las que le derivaron a él", () => {
    expect(filtroDeBandeja(ELEGIDO, widget)).toEqual({ todas: false, objetivo: "sumarse_equipo" })
  })

  it("el que no tiene acceso no ve nada, ni por error", () => {
    expect(filtroDeBandeja(OTRO, widget)).toBeNull()
    expect(filtroDeBandeja(ELEGIDO, { perfil_equipo_id: null })).toBeNull()
  })
})
