import { describe, it, expect } from "vitest"
import { phoneKey } from "./phone"

describe("phoneKey", () => {
  it("los formatos reales del mismo número caen en la misma clave", () => {
    const esperado = "1151175948"
    expect(phoneKey("+5491151175948")).toBe(esperado)
    expect(phoneKey("5491151175948")).toBe(esperado)
    expect(phoneKey("+54 9 11 5117-5948")).toBe(esperado)
    expect(phoneKey("541151175948")).toBe(esperado)
  })

  it("acepta números ya cortos, sin código de país", () => {
    expect(phoneKey("1140290585")).toBe("1140290585")
  })

  it("tolera espacios y separadores", () => {
    expect(phoneKey("+54 1150458476")).toBe("1150458476")
  })

  it("devuelve null cuando no hay dígitos suficientes", () => {
    expect(phoneKey("")).toBeNull()
    expect(phoneKey(null)).toBeNull()
    expect(phoneKey(undefined)).toBeNull()
    expect(phoneKey("sin teléfono")).toBeNull()
    expect(phoneKey("12345")).toBeNull()
  })

  it("un número extranjero también se reduce a sus últimos 10 dígitos", () => {
    expect(phoneKey(" 19195996777")).toBe("9195996777")
  })
})
