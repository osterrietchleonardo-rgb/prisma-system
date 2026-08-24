import { describe, it, expect, vi } from "vitest"
import { decidirConAgente, MAX_ITERACIONES, PROMPT_AGENTE } from "./agente"
import type { Herramientas } from "./herramientas"

const decisionValida = {
  accion: "contactar",
  plantilla: "seg_f1_seguimiento",
  frase_cierre: "¿Pudiste ver lo de la cochera que te preocupaba?",
  proximo_intento_horas: 72,
  razon: "Preguntó por cochera y no siguió; retomo esa duda.",
  evidencia: "Mensaje [lead] del 16/8: «¿Tiene cochera el PH?» — sin respuesta posterior.",
  confianza: 0.85,
}

const toolUse = (name: string, input: unknown, id = `t_${name}`) => ({
  type: "tool_use",
  id,
  name,
  input,
})

/** Respuesta guionada de la API: content + usage mínimos. */
const respuesta = (content: unknown[], stop = "tool_use") =>
  ({
    stop_reason: stop,
    content,
    usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 400 },
  }) as never

/** llamar() que devuelve el guion en orden. */
const guion = (...respuestas: unknown[]) => {
  let i = 0
  return vi.fn(async () => respuestas[i++] as never)
}

const herramientasMock = (): Herramientas & { llamadas: string[] } => {
  const llamadas: string[] = []
  const tool = (nombre: string, salida: string) => async () => {
    llamadas.push(nombre)
    return salida
  }
  return {
    llamadas,
    leer_mensajes: tool("leer_mensajes", "[16/8] [lead] ¿Tiene cochera el PH?"),
    leer_intentos_previos: tool("leer_intentos_previos", "(ningún intento previo)"),
    leer_compromisos: tool("leer_compromisos", "(sin compromisos activos)"),
    leer_propiedad: tool("leer_propiedad", "• PH La Plata (Venta) precio: 120000 USD"),
  }
}

describe("decidirConAgente", () => {
  it("flujo feliz: investiga y emite la decisión con su trace", async () => {
    const h = herramientasMock()
    const llamar = guion(
      respuesta([toolUse("leer_mensajes", { cantidad: 10 })]),
      respuesta([toolUse("leer_intentos_previos", {})]),
      respuesta([toolUse("emitir_decision", decisionValida)])
    )
    const r = await decidirConAgente("semilla", h, llamar)
    expect(r.decision.accion).toBe("contactar")
    expect(r.pasos.map((p) => p.herramienta)).toEqual(["leer_mensajes", "leer_intentos_previos"])
    expect(r.tokens.entrada).toBe(300) // 3 llamadas × 100
    expect(h.llamadas).toContain("leer_mensajes")
  })

  it("rechaza contactar sin haber leído los mensajes y el modelo se corrige", async () => {
    const h = herramientasMock()
    const llamar = guion(
      respuesta([toolUse("emitir_decision", decisionValida)]), // apurado: sin investigar
      respuesta([toolUse("leer_mensajes", {}), toolUse("leer_intentos_previos", {})]),
      respuesta([toolUse("emitir_decision", decisionValida, "t2")])
    )
    const r = await decidirConAgente("semilla", h, llamar)
    expect(r.decision.accion).toBe("contactar")
    // la primera emisión volvió como tool_result con error explicando qué falta
    const conversacion = llamar.mock.calls[0][0] as Array<{ role: string; content: unknown }>
    const erroresDevueltos = conversacion
      .filter((m) => m.role === "user" && Array.isArray(m.content))
      .flatMap((m) => m.content as Array<Record<string, unknown>>)
      .filter((b) => b.type === "tool_result" && b.is_error)
    expect(erroresDevueltos.length).toBeGreaterThan(0)
    expect(String(erroresDevueltos[0].content)).toContain("leer_mensajes")
  })

  it("decisión inválida (Zod) vuelve como error y no corta el loop", async () => {
    const h = herramientasMock()
    const invalida = { ...decisionValida, plantilla: null } // contactar sin plantilla
    const llamar = guion(
      respuesta([toolUse("leer_mensajes", {}), toolUse("leer_intentos_previos", {})]),
      respuesta([toolUse("emitir_decision", invalida)]),
      respuesta([toolUse("emitir_decision", decisionValida, "t3")])
    )
    const r = await decidirConAgente("semilla", h, llamar)
    expect(r.decision.plantilla).toBe("seg_f1_seguimiento")
  })

  it("agotar las iteraciones sin decisión válida tira error (no se manda nada)", async () => {
    const h = herramientasMock()
    const llamar = vi.fn(async () => respuesta([toolUse("leer_compromisos", {})]))
    await expect(decidirConAgente("semilla", h, llamar)).rejects.toThrow(/iteraciones/)
    expect(llamar).toHaveBeenCalledTimes(MAX_ITERACIONES)
  })

  it("respuesta truncada por max_tokens = fallo de la llamada", async () => {
    const h = herramientasMock()
    const llamar = guion(respuesta([], "max_tokens"))
    await expect(decidirConAgente("semilla", h, llamar)).rejects.toThrow(/max_tokens/)
  })

  it("terminar sin tool call es fallo (el agente DEBE decidir por herramienta)", async () => {
    const h = herramientasMock()
    const llamar = guion(
      respuesta([{ type: "text", text: "creo que hay que contactar" }], "end_turn")
    )
    await expect(decidirConAgente("semilla", h, llamar)).rejects.toThrow(/sin emitir/)
  })

  it("el prompt prohíbe lo que el negocio prohíbe y exige verificar", () => {
    expect(PROMPT_AGENTE).toContain("expensas")
    expect(PROMPT_AGENTE).toContain("PROHIBIDO")
    expect(PROMPT_AGENTE).toContain("leer_propiedad")
  })
})
