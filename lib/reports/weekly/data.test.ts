import { describe, it, expect } from "vitest"
import { buildAgentRows, buildSignalRows } from "./data"
import type { DerivationEvent } from "./types"

/** Helper: un evento con todo apagado salvo lo que se pase. */
function ev(over: Partial<DerivationEvent> = {}): DerivationEvent {
  return {
    agentName: "Ana",
    at: "2026-07-28T12:00:00.000Z",
    replyHours: null,
    visitScheduled: false,
    emailClicked: false,
    ...over,
  }
}

describe("buildAgentRows", () => {
  it("agrupa por asesor y cuenta cada rango", () => {
    const rows = buildAgentRows([
      ev({ agentName: "Ana", replyHours: 0.5 }),
      ev({ agentName: "Ana", replyHours: 30 }),
      ev({ agentName: "Ana", replyHours: null }),
      ev({ agentName: "Beto", replyHours: 2 }),
    ])
    const ana = rows.find((r) => r.agent === "Ana")!
    expect(ana.total).toBe(3)
    expect(ana.attended).toBe(2)
    expect(ana.pct).toBe(67)
    expect(ana.buckets["<1h"]).toBe(1)
    expect(ana.buckets["+24h"]).toBe(1)
    expect(ana.buckets["sin atender"]).toBe(1)

    const beto = rows.find((r) => r.agent === "Beto")!
    expect(beto.total).toBe(1)
    expect(beto.buckets["1-4h"]).toBe(1)
  })

  it("ordena por volumen descendente y deja TOTAL al final", () => {
    const rows = buildAgentRows([
      ev({ agentName: "Beto" }),
      ev({ agentName: "Ana" }),
      ev({ agentName: "Ana" }),
    ])
    expect(rows.map((r) => r.agent)).toEqual(["Ana", "Beto", "TOTAL"])
  })

  it("la fila TOTAL suma todo", () => {
    const rows = buildAgentRows([
      ev({ agentName: "Ana", replyHours: 0.5 }),
      ev({ agentName: "Beto", replyHours: null }),
    ])
    const total = rows.at(-1)!
    expect(total.agent).toBe("TOTAL")
    expect(total.total).toBe(2)
    expect(total.attended).toBe(1)
    expect(total.pct).toBe(50)
    expect(total.buckets["<1h"]).toBe(1)
    expect(total.buckets["sin atender"]).toBe(1)
  })

  it("sin eventos devuelve solo TOTAL en cero, con pct null", () => {
    const rows = buildAgentRows([])
    expect(rows).toHaveLength(1)
    expect(rows[0].agent).toBe("TOTAL")
    expect(rows[0].total).toBe(0)
    expect(rows[0].pct).toBeNull()
  })

  it("los eventos sin asesor se agrupan juntos, no se pierden", () => {
    const rows = buildAgentRows([ev({ agentName: "(sin asesor)" }), ev({ agentName: "Ana" })])
    expect(rows.find((r) => r.agent === "(sin asesor)")!.total).toBe(1)
    expect(rows.at(-1)!.total).toBe(2)
  })
})

describe("buildSignalRows", () => {
  it("cuenta las tres señales por separado; un evento puede tener varias", () => {
    const rows = buildSignalRows([
      ev({ agentName: "Ana", replyHours: 3, visitScheduled: true, emailClicked: true }),
      ev({ agentName: "Ana", visitScheduled: true }),
      ev({ agentName: "Ana" }),
    ])
    const ana = rows.find((r) => r.agent === "Ana")!
    expect(ana.total).toBe(3)
    expect(ana.chat).toBe(1)
    expect(ana.visita).toBe(2)
    expect(ana.email).toBe(1)
    expect(ana.sinRastro).toBe(1)
  })

  it("'sin rastro' es no tener NINGUNA de las tres", () => {
    const rows = buildSignalRows([
      ev({ emailClicked: true }),
      ev(),
      ev(),
    ])
    expect(rows.at(-1)!.sinRastro).toBe(2)
  })

  it("el caso real: 27 derivaciones, 0 en el chat", () => {
    const eventos = Array.from({ length: 27 }, () => ev({ agentName: "Carolina" }))
    const total = buildSignalRows(eventos).at(-1)!
    expect(total.total).toBe(27)
    expect(total.chat).toBe(0)
    expect(total.sinRastro).toBe(27)
  })

  it("sin eventos devuelve solo TOTAL en cero", () => {
    const rows = buildSignalRows([])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({ agent: "TOTAL", total: 0, chat: 0, visita: 0, email: 0, sinRastro: 0 })
  })
})
