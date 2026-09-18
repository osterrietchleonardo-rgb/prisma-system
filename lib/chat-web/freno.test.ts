import { describe, it, expect } from "vitest"
import { LIMITES_IP, huellaDeIp, ipDelPedido, pasaElFreno } from "./freno"

describe("ipDelPedido: de dónde viene, detrás del proxy", () => {
  const con = (h: Record<string, string>) => ipDelPedido(new Headers(h))

  it("toma la primera de x-forwarded-for, que es la del visitante", () => {
    expect(con({ "x-forwarded-for": "190.2.3.4, 10.0.0.1, 172.16.0.2" })).toBe("190.2.3.4")
  })
  it("acepta las otras cabeceras habituales", () => {
    expect(con({ "x-real-ip": "190.2.3.4" })).toBe("190.2.3.4")
    expect(con({ "cf-connecting-ip": "190.2.3.4" })).toBe("190.2.3.4")
  })
  it("sin cabeceras, null: no se inventa una IP", () => {
    expect(con({})).toBeNull()
    expect(con({ "x-forwarded-for": "  " })).toBeNull()
  })
  it("una cabecera con basura no pasa como IP", () => {
    expect(con({ "x-forwarded-for": "no soy una ip" })).toBeNull()
  })
})

describe("huellaDeIp: se guarda la huella, nunca la IP", () => {
  it("la misma IP da la misma huella y otra da otra", () => {
    const a = huellaDeIp("190.2.3.4", "sal")
    expect(huellaDeIp("190.2.3.4", "sal")).toBe(a)
    expect(huellaDeIp("190.2.3.5", "sal")).not.toBe(a)
  })
  it("con otra sal, otra huella: la de una agencia no sirve en otra", () => {
    expect(huellaDeIp("190.2.3.4", "sal-1")).not.toBe(huellaDeIp("190.2.3.4", "sal-2"))
  })
  it("la IP NO se puede leer de la huella", () => {
    const h = huellaDeIp("190.2.3.4", "sal")
    expect(h).not.toContain("190")
    expect(h).toMatch(/^[0-9a-f]{32}$/)
  })
  it("sin IP no hay huella", () => {
    expect(huellaDeIp(null, "sal")).toBeNull()
  })
})

describe("pasaElFreno: cuántos mensajes puede mandar una misma conexión", () => {
  it("un uso normal pasa", () => {
    expect(pasaElFreno(5)).toBe(true)
  })
  it("pasado el tope, no", () => {
    expect(pasaElFreno(LIMITES_IP.mensajesPorVentana)).toBe(false)
    expect(pasaElFreno(LIMITES_IP.mensajesPorVentana + 10)).toBe(false)
  })
  it("el tope deja lugar para una familia detrás del mismo wifi, pero no para un bucle", () => {
    // Una conversación de venta normal son 10-20 mensajes; el tope es varias veces eso,
    // porque en una oficina o un edificio muchas personas comparten la misma conexión.
    expect(LIMITES_IP.mensajesPorVentana).toBeGreaterThanOrEqual(40)
    expect(LIMITES_IP.mensajesPorVentana).toBeLessThanOrEqual(120)
    expect(LIMITES_IP.minutosDeVentana).toBeLessThanOrEqual(15)
  })
})
