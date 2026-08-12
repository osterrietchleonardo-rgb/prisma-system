import { describe, it, expect } from "vitest"
import { construirParams, extraerTexto, MODELO } from "./claude"

describe("construirParams", () => {
  it("usa Sonnet 5 con thinking adaptativo", () => {
    const p = construirParams("SYS", "USER") as any
    expect(p.model).toBe("claude-sonnet-5")
    expect(MODELO).toBe("claude-sonnet-5")
    expect(p.thinking).toEqual({ type: "adaptive" })
  })

  it("NO manda parámetros que devuelven 400 en Sonnet 5", () => {
    const p = construirParams("SYS", "USER") as any
    expect(p.temperature).toBeUndefined()
    expect(p.top_p).toBeUndefined()
    expect(p.top_k).toBeUndefined()
    expect(p.budget_tokens).toBeUndefined()
    expect(p.thinking.budget_tokens).toBeUndefined()
  })

  it("nunca pide más de 8000 tokens de salida", () => {
    expect((construirParams("S", "U", { maxTokens: 99000 }) as any).max_tokens).toBe(8000)
    expect((construirParams("S", "U") as any).max_tokens).toBe(8000)
  })

  it("cachea el system cuando se pide (bloque grande de skills)", () => {
    const p = construirParams("SYS", "USER", { cachearSystem: true }) as any
    expect(p.system[0].cache_control).toEqual({ type: "ephemeral" })
    expect(p.system[0].text).toBe("SYS")
  })

  it("sin cacheo el system no lleva cache_control", () => {
    const p = construirParams("SYS", "USER") as any
    expect(p.system[0].cache_control).toBeUndefined()
  })

  it("pasa el effort dentro de output_config", () => {
    const p = construirParams("S", "U", { effort: "low" }) as any
    expect(p.output_config).toEqual({ effort: "low" })
  })

  it("omite output_config si no se pide effort", () => {
    expect((construirParams("S", "U") as any).output_config).toBeUndefined()
  })
})

describe("extraerTexto", () => {
  it("ignora los bloques thinking y concatena solo el texto", () => {
    const content = [
      { type: "thinking", thinking: "razonamiento interno" },
      { type: "text", text: "Hola" },
      { type: "text", text: " mundo" },
    ]
    expect(extraerTexto(content)).toBe("Hola mundo")
  })

  it("si solo hay thinking devuelve string vacío en vez de romper", () => {
    expect(extraerTexto([{ type: "thinking", thinking: "x" }])).toBe("")
  })
})
