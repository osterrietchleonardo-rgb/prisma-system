import { describe, it, expect } from "vitest"
import { resumirConversaciones, type FilaParaMetricas } from "./metricas"

const conv = (extra: Partial<FilaParaMetricas> = {}): FilaParaMetricas => ({
  objetivo: null,
  datos: {},
  estado: "abierta",
  mensajes_count: 2,
  costo_usd: 0.01,
  created_at: "2026-09-17T12:00:00Z",
  ...extra,
})

describe("resumirConversaciones: las preguntas que se hace un director", () => {
  it("sin conversaciones, todo en cero y sin dividir por cero", () => {
    const r = resumirConversaciones([])
    expect(r).toMatchObject({ total: 0, conversaron: 0, dejaronContacto: 0, soloPreguntas: 0, derivadas: 0 })
    expect(r.costoTotalUSD).toBe(0)
    expect(r.costoPromedioUSD).toBe(0)
    expect(r.tasaContacto).toBe(0)
  })

  it("cuántos hablaron de verdad: un solo mensaje no es una conversación", () => {
    const r = resumirConversaciones([
      conv({ mensajes_count: 1 }),
      conv({ mensajes_count: 2 }),
      conv({ mensajes_count: 9 }),
    ])
    expect(r.total).toBe(3)
    expect(r.conversaron).toBe(2)
  })

  it("cuántos dejaron cómo contactarlos, con teléfono o con email", () => {
    const r = resumirConversaciones([
      conv({ datos: { telefono: "5491150604928" } }),
      conv({ datos: { email: "a@b.com" } }),
      conv({ datos: { nombre: "Solo el nombre" } }),
      conv({ datos: {} }),
    ])
    expect(r.dejaronContacto).toBe(2)
    // el nombre solo no sirve para volver a hablarle
    expect(r.soloPreguntas).toBe(2)
  })

  it("un teléfono que no puede ser un teléfono no cuenta como contacto", () => {
    const r = resumirConversaciones([conv({ datos: { telefono: "123" } })])
    expect(r.dejaronContacto).toBe(0)
  })

  it("cuántas se derivaron al equipo", () => {
    const r = resumirConversaciones([
      conv({ estado: "derivada", datos: { telefono: "5491150604928" } }),
      conv({ estado: "abierta" }),
    ])
    expect(r.derivadas).toBe(1)
  })

  it("por tipo de interés, y las que nunca se supo qué querían aparte", () => {
    const r = resumirConversaciones([
      conv({ objetivo: "busca_propiedad" }),
      conv({ objetivo: "busca_propiedad" }),
      conv({ objetivo: "sumarse_equipo" }),
      conv({ objetivo: null }),
    ])
    expect(r.porObjetivo.busca_propiedad).toBe(2)
    expect(r.porObjetivo.sumarse_equipo).toBe(1)
    expect(r.sinDefinir).toBe(1)
  })

  it("la tasa de contacto es sobre los que conversaron, no sobre los que pasaron de largo", () => {
    const r = resumirConversaciones([
      conv({ mensajes_count: 1 }), // entró y se fue: no cuenta para la tasa
      conv({ mensajes_count: 4, datos: { telefono: "5491150604928" } }),
      conv({ mensajes_count: 4 }),
    ])
    expect(r.conversaron).toBe(2)
    expect(r.tasaContacto).toBe(50)
  })

  it("lo que costó, total y por conversación", () => {
    const r = resumirConversaciones([conv({ costo_usd: 0.05 }), conv({ costo_usd: 0.01 })])
    expect(r.costoTotalUSD).toBeCloseTo(0.06, 5)
    expect(r.costoPromedioUSD).toBeCloseTo(0.03, 5)
  })

  it("aguanta datos rotos sin romperse: es un tablero, no puede tirar la página", () => {
    const rotas = [
      conv({ datos: null as never }),
      conv({ costo_usd: null as never, mensajes_count: null as never }),
      conv({ objetivo: "cualquier_cosa" }),
    ]
    const r = resumirConversaciones(rotas)
    expect(r.total).toBe(3)
    expect(Number.isFinite(r.costoTotalUSD)).toBe(true)
  })
})
