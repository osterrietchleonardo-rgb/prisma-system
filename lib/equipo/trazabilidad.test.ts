import { describe, expect, it } from "vitest"
import { categoriaDeEvento, construirTraza, fechaHoraAR, recortar } from "./trazabilidad"

describe("recortar", () => {
  it("deja pasar lo corto tal cual", () => {
    expect(recortar("hola, ¿está disponible?")).toBe("hola, ¿está disponible?")
  })
  it("corta en un espacio y agrega puntos suspensivos", () => {
    const largo = "quiero saber si el departamento de dos ambientes con cochera en Caballito sigue disponible para visitar esta semana"
    const r = recortar(largo)
    expect(r.length).toBeLessThanOrEqual(91)
    expect(r.endsWith("…")).toBe(true)
    expect(r.includes("  ")).toBe(false)
  })
  it("aplana saltos de línea y espacios repetidos", () => {
    expect(recortar("hola\n\n   mundo")).toBe("hola mundo")
  })
  it("con null devuelve vacío", () => {
    expect(recortar(null)).toBe("")
  })
})

describe("fechaHoraAR", () => {
  it("muestra la hora argentina, no la UTC", () => {
    // 01:00 UTC = 22:00 del día anterior en AR
    expect(fechaHoraAR("2026-09-02T01:00:00Z")).toBe("01/09 22:00")
  })
  it("con basura devuelve vacío en vez de romper", () => {
    expect(fechaHoraAR("no-es-fecha")).toBe("")
  })
})

describe("categoriaDeEvento", () => {
  it("clasifica los tipos conocidos", () => {
    expect(categoriaDeEvento("decision")).toBe("agente")
    expect(categoriaDeEvento("escalera")).toBe("aviso")
    expect(categoriaDeEvento("reasignacion")).toBe("equipo")
    expect(categoriaDeEvento("visita_agendada")).toBe("visita")
  })
  it("un tipo nuevo del equipo cae en equipo por prefijo", () => {
    expect(categoriaDeEvento("asesor_algo_nuevo")).toBe("equipo")
    expect(categoriaDeEvento("director_algo_nuevo")).toBe("equipo")
  })
  it("un tipo desconocido no rompe: entra como agente", () => {
    expect(categoriaDeEvento("tipo_inventado")).toBe("agente")
  })
})

describe("construirTraza: el guion completo de Kevin", () => {
  // La secuencia que Leonardo describió el 2/9: consulta → derivación → escalera 2 h →
  // escalera 5 h (director) → el asesor respondió → visita agendada.
  const mensajes = [
    { role: "lead", message_type: "text", content: "Hola! quiero saber por el depto de Arce al 400", created_at: "2026-09-01T12:00:00Z" },
    { role: "bot", message_type: "text", content: "¡Hola! Sí, te cuento…", created_at: "2026-09-01T12:00:40Z" },
    { role: "lead", message_type: "text", content: "prefiero hablar con una persona", created_at: "2026-09-01T12:05:00Z" },
    { role: "internal", message_type: "text", content: "Lead derivado a Ailén", created_at: "2026-09-01T12:05:30Z" },
    { role: "human", message_type: "text", content: "Hola, soy Ailén de la inmobiliaria, ¿cuándo podrías visitar?", created_at: "2026-09-01T17:40:00Z" },
  ]
  const eventos = [
    { tipo: "escalera", descripcion: "Nivel 2 h (2 horas esperando) → asesor: email enviado, whatsapp enviado", ts: "2026-09-01T14:05:30Z" },
    { tipo: "escalera", descripcion: "Nivel 5 h (5 horas esperando) → asesor y director: email enviado, whatsapp enviado", ts: "2026-09-01T17:05:30Z" },
    { tipo: "visita_agendada", descripcion: "Visita agendada para el 05/09 15:00 — Arce 400", ts: "2026-09-01T17:55:00Z" },
  ]

  const traza = construirTraza({ mensajes, eventos })

  it("queda en orden cronológico con las fuentes mezcladas", () => {
    expect(traza.map((e) => e.categoria)).toEqual([
      "cliente", "bot", "cliente", "interno", "aviso", "aviso", "asesor", "visita",
    ])
  })

  it("la respuesta del asesor es su propio renglón (la confirmación que busca Kevin)", () => {
    const asesor = traza.find((e) => e.categoria === "asesor")
    expect(asesor?.titulo).toBe("El asesor le respondió al cliente")
    expect(asesor?.detalle).toContain("soy Ailén")
  })

  it("los eventos usan la descripción legible que ya trae la base", () => {
    expect(traza.at(-1)?.titulo).toBe("Visita agendada para el 05/09 15:00 — Arce 400")
  })
})

describe("construirTraza: bordes", () => {
  it("un audio del cliente no muestra detalle (no hay texto que recortar)", () => {
    const traza = construirTraza({
      mensajes: [{ role: "lead", message_type: "audio", content: null, created_at: "2026-09-01T10:00:00Z" }],
      eventos: [],
    })
    expect(traza[0].titulo).toBe("El cliente mandó un audio")
    expect(traza[0].detalle).toBeUndefined()
  })

  it("una plantilla del bot se distingue de una respuesta común", () => {
    const traza = construirTraza({
      mensajes: [{ role: "bot", message_type: "template", content: "Hola Juan, retomo…", created_at: "2026-09-01T10:00:00Z" }],
      eventos: [],
    })
    expect(traza[0].titulo).toBe("Se le envió una plantilla de WhatsApp")
  })

  it("un rol desconocido se omite sin romper", () => {
    const traza = construirTraza({
      mensajes: [{ role: "marciano", message_type: "text", content: "x", created_at: "2026-09-01T10:00:00Z" }],
      eventos: [],
    })
    expect(traza).toEqual([])
  })

  it("con timestamps iguales el orden es estable: mensaje antes que evento", () => {
    const ts = "2026-09-01T10:00:00Z"
    const traza = construirTraza({
      mensajes: [{ role: "lead", message_type: "text", content: "hola", created_at: ts }],
      eventos: [{ tipo: "decision", descripcion: "[activo] contactar: …", ts }],
    })
    expect(traza.map((e) => e.categoria)).toEqual(["cliente", "agente"])
  })

  it("los internos del gate entran con su propio renglón", () => {
    const traza = construirTraza({
      mensajes: [],
      eventos: [],
      internos: [{ contenido: "OK lo llamo ahora", ts: "2026-09-01T10:00:00Z" }],
    })
    expect(traza[0].categoria).toBe("interno")
    expect(traza[0].detalle).toBe("OK lo llamo ahora")
  })
})
