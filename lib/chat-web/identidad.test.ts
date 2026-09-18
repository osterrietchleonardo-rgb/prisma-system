import { describe, it, expect } from "vitest"
import { cookieDeVisitante, esIdDeVisitante, leerVisitante, nombreDeCookie } from "./identidad"

const W = "c6e10db1-dc95-4a64-95ba-62406bbf7fc4"

describe("leerVisitante: quién es, según el navegador y no según lo que diga el pedido", () => {
  it("lee el id de la cookie de ESE widget", () => {
    const id = "a".repeat(32)
    expect(leerVisitante(`${nombreDeCookie(W)}=${id}`, W)).toBe(id)
  })

  it("la cookie de otro widget no sirve: cada chat es aparte", () => {
    const otro = "b0000000-0000-4000-8000-000000000000"
    expect(leerVisitante(`${nombreDeCookie(otro)}=${"a".repeat(32)}`, W)).toBeNull()
  })

  it("sin cookie, null: el que llama NO puede decir quién es", () => {
    expect(leerVisitante(null, W)).toBeNull()
    expect(leerVisitante("", W)).toBeNull()
    expect(leerVisitante("otra=cosa; mas=cosas", W)).toBeNull()
  })

  it("una cookie con basura no se acepta", () => {
    for (const malo of ["", "corto", "a".repeat(200), "no-hex-!!"])
      expect(leerVisitante(`${nombreDeCookie(W)}=${malo}`, W), malo).toBeNull()
  })

  it("convive con otras cookies del navegador", () => {
    const id = "c".repeat(32)
    expect(leerVisitante(`_ga=123; ${nombreDeCookie(W)}=${id}; otra=x`, W)).toBe(id)
  })
})

describe("esIdDeVisitante", () => {
  it("32 caracteres hexadecimales y nada más", () => {
    expect(esIdDeVisitante("a".repeat(32))).toBe(true)
    expect(esIdDeVisitante("a".repeat(31))).toBe(false)
    expect(esIdDeVisitante("../../etc/passwd")).toBe(false)
  })
})

describe("cookieDeVisitante: cómo se guarda", () => {
  const id = "d".repeat(32)

  it("no la puede leer el JavaScript de nadie, ni la web del cliente", () => {
    expect(cookieDeVisitante(W, id, true)).toContain("HttpOnly")
  })

  it("en https va particionada por sitio: la de una inmobiliaria no se cruza con otra", () => {
    const c = cookieDeVisitante(W, id, true)
    expect(c).toContain("Secure")
    expect(c).toContain("SameSite=None")
    expect(c).toContain("Partitioned")
  })

  it("en la máquina (http) igual funciona, para poder probar", () => {
    const c = cookieDeVisitante(W, id, false)
    expect(c).not.toContain("Secure")
    expect(c).toContain("SameSite=Lax")
  })

  it("dura, para que si vuelve mañana siga su conversación", () => {
    expect(cookieDeVisitante(W, id, true)).toMatch(/Max-Age=\d{6,}/)
  })
})
