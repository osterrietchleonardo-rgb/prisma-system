import { describe, it, expect } from "vitest"
import { primeraRespuesta } from "./report"

const M = (role: string, at: string, content = "hola") => ({
  conversationId: "c1",
  role,
  content,
  at,
})

describe("primeraRespuesta", () => {
  const desde = "2026-07-28T12:00:00.000Z"

  it("un mensaje 'human' posterior cuenta, en horas", () => {
    const h = primeraRespuesta([M("human", "2026-07-28T14:30:00.000Z")], "c1", desde)
    expect(h).toBeCloseTo(2.5, 5)
  })

  it("un 'internal' que no es la marca también cuenta: los asesores quedan así a veces", () => {
    const h = primeraRespuesta([M("internal", "2026-07-28T13:00:00.000Z", "Hola, soy Carolina")], "c1", desde)
    expect(h).toBeCloseTo(1, 5)
  })

  it("la marca del handoff NO cuenta como respuesta", () => {
    const h = primeraRespuesta(
      [M("internal", "2026-07-28T13:00:00.000Z", "⚠️ Handoff activado: El bot se ha desactivado.")],
      "c1",
      desde,
    )
    expect(h).toBeNull()
  })

  it("el bot y el cliente no cuentan", () => {
    const h = primeraRespuesta(
      [M("bot", "2026-07-28T13:00:00.000Z"), M("lead", "2026-07-28T14:00:00.000Z")],
      "c1",
      desde,
    )
    expect(h).toBeNull()
  })

  it("lo anterior a la derivación no cuenta", () => {
    const h = primeraRespuesta([M("human", "2026-07-28T11:00:00.000Z")], "c1", desde)
    expect(h).toBeNull()
  })

  it("mensajes de otra conversación no cuentan", () => {
    const otro = { ...M("human", "2026-07-28T13:00:00.000Z"), conversationId: "c2" }
    expect(primeraRespuesta([otro], "c1", desde)).toBeNull()
  })

  it("con varias respuestas gana la primera", () => {
    const h = primeraRespuesta(
      [M("human", "2026-07-28T18:00:00.000Z"), M("human", "2026-07-28T13:00:00.000Z")],
      "c1",
      desde,
    )
    expect(h).toBeCloseTo(1, 5)
  })
})
