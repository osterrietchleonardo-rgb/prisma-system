import { describe, it, expect } from "vitest"
import type Anthropic from "@anthropic-ai/sdk"
import {
  MAX_ITERACIONES,
  MAX_CARACTERES_RESPUESTA,
  OBJETIVOS,
  PROMPT_WEB,
  RespuestaWebSchema,
  conversar,
  linksDelTexto,
  revisarRespuesta,
  type Herramientas,
} from "./agente"

/** Arma la respuesta de la API: una tanda de bloques tool_use. */
function api(...tandas: Array<Array<{ name: string; input: unknown }>>) {
  let i = 0
  return async () => {
    const tanda = tandas[Math.min(i++, tandas.length - 1)]
    return {
      stop_reason: "tool_use",
      usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0 },
      content: tanda.map((t, j) => ({ type: "tool_use", id: `t${i}-${j}`, name: t.name, input: t.input })),
    } as unknown as Anthropic.Message
  }
}

const herramientasVacias: Herramientas = {
  buscar_en_el_sitio: async () => ({ texto: "Busqué en todo el sitio y NO hay nada de esto.", links: [] }),
  buscar_propiedades: async () => ({ texto: "Sin propiedades que coincidan.", links: [] }),
  guardar_datos: async () => ({ texto: "Datos guardados.", links: [] }),
  derivar_a_whatsapp: async () => ({ texto: "Derivado.", links: [] }),
}

const contexto = {
  nombreAgencia: "Central",
  nombreBot: "Sofía",
  secciones: [{ nombre: "Tasaciones", url: "https://central.com/tasaciones", resumen: "Valuamos" }],
  conocimiento: "",
  paginaActual: "https://central.com/",
}

const responder = (texto: string, extra: Record<string, unknown> = {}) => ({
  name: "responder",
  input: { texto, objetivo: "consulta_empresa", ...extra },
})

describe("linksDelTexto", () => {
  it("encuentra los links escritos de cualquier forma", () => {
    expect(linksDelTexto("mirá https://c.com/a y también http://c.com/b.")).toEqual([
      "https://c.com/a",
      "http://c.com/b",
    ])
  })
  it("no se lleva puesto el punto final de la oración", () => {
    expect(linksDelTexto("está en https://c.com/tasaciones.")).toEqual(["https://c.com/tasaciones"])
  })
  it("sin links, lista vacía", () => {
    expect(linksDelTexto("Hola, ¿en qué te puedo ayudar?")).toEqual([])
  })
})

describe("revisarRespuesta: el asistente no inventa links ni escribe una parrafada", () => {
  const permitidos = ["https://central.com/tasaciones"]

  it("un link que vino de una herramienta pasa", () => {
    expect(revisarRespuesta("Está en https://central.com/tasaciones", permitidos).ok).toBe(true)
  })

  it("un link inventado NO pasa, y el motivo dice cuál", () => {
    const r = revisarRespuesta("Mirá https://central.com/promociones-2026", permitidos)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.motivo).toContain("https://central.com/promociones-2026")
  })

  it("una respuesta enorme se rechaza: esto es un chat, no un informe", () => {
    const r = revisarRespuesta("x".repeat(MAX_CARACTERES_RESPUESTA + 1), permitidos)
    expect(r.ok).toBe(false)
  })

  it("una respuesta vacía no se manda", () => {
    expect(revisarRespuesta("   ", permitidos).ok).toBe(false)
  })
})

describe("RespuestaWebSchema", () => {
  it("el objetivo tiene que ser uno de los cinco caminos", () => {
    expect(RespuestaWebSchema.safeParse({ texto: "hola", objetivo: "vender_propiedad" }).success).toBe(true)
    expect(RespuestaWebSchema.safeParse({ texto: "hola", objetivo: "cualquier_cosa" }).success).toBe(false)
    expect(OBJETIVOS).toContain("sumarse_equipo")
  })
})

describe("el tono: es una operación de mucho dinero, no un chat informal (Leonardo, 17/9)", () => {
  it("las muletillas que quedaron mal en la prueba real están prohibidas por nombre", () => {
    for (const muletilla of ["che", "uy", "je", "jaja", "posta"])
      expect(PROMPT_WEB.toLowerCase(), muletilla).toContain(`"${muletilla}"`)
  })
  it("pide una idea por mensaje, que es lo que hace que parezca una persona", () => {
    expect(PROMPT_WEB).toContain("Una idea por mensaje")
    expect(PROMPT_WEB).toContain("punto y aparte")
  })
})

describe("conversar: el bucle", () => {
  it("responde derecho cuando no necesita herramientas", async () => {
    const r = await conversar({
      mensajes: [{ rol: "visitante", texto: "hola" }],
      contexto,
      herramientas: herramientasVacias,
      llamar: api([responder("¡Hola! Soy Sofía, de Central. ¿Qué estás buscando?")]),
    })
    expect(r.respuesta.texto).toContain("Sofía")
    expect(r.pasos).toHaveLength(0)
  })

  it("usa una herramienta y después responde con el link que ESA herramienta le dio", async () => {
    const herramientas: Herramientas = {
      ...herramientasVacias,
      buscar_en_el_sitio: async () => ({
        texto: "Tasaciones: valuamos en 48 horas.",
        links: ["https://central.com/tasaciones"],
      }),
    }
    const r = await conversar({
      mensajes: [{ rol: "visitante", texto: "¿hacen tasaciones?" }],
      contexto,
      herramientas,
      llamar: api(
        [{ name: "buscar_en_el_sitio", input: { consulta: "tasaciones" } }],
        [responder("Sí, mirá: https://central.com/tasaciones")]
      ),
    })
    expect(r.respuesta.texto).toContain("https://central.com/tasaciones")
    expect(r.pasos.map((p) => p.herramienta)).toEqual(["buscar_en_el_sitio"])
  })

  it("si inventa un link, se lo rechaza y tiene que corregir", async () => {
    const r = await conversar({
      mensajes: [{ rol: "visitante", texto: "¿tienen promos?" }],
      contexto,
      herramientas: herramientasVacias,
      llamar: api(
        [responder("Mirá https://central.com/promo-inventada")],
        [responder("No tenemos promociones publicadas. ¿Querés que te contacte alguien del equipo?")]
      ),
    })
    expect(r.respuesta.texto).not.toContain("promo-inventada")
    expect(r.correcciones).toBe(1)
  })

  it("los links de las secciones cargadas por el director SÍ se pueden usar", async () => {
    const r = await conversar({
      mensajes: [{ rol: "visitante", texto: "quiero tasar" }],
      contexto,
      herramientas: herramientasVacias,
      llamar: api([responder("Entrá acá: https://central.com/tasaciones")]),
    })
    expect(r.respuesta.texto).toContain("https://central.com/tasaciones")
    expect(r.correcciones).toBe(0)
  })

  it("no deriva a WhatsApp sin un dato de contacto: la derivación quedaría en la nada", async () => {
    const r = await conversar({
      mensajes: [{ rol: "visitante", texto: "quiero que me llamen" }],
      contexto,
      herramientas: herramientasVacias,
      llamar: api(
        [{ name: "derivar_a_whatsapp", input: { resumen: "quiere que lo llamen" } }],
        [responder("Dejame tu teléfono o tu email y te contacta alguien del equipo.")]
      ),
    })
    expect(r.pasos.some((p) => p.herramienta === "derivar_a_whatsapp")).toBe(false)
    expect(r.respuesta.texto).toMatch(/tel[ée]fono|email/i)
  })

  it("con teléfono guardado, la derivación sí sale", async () => {
    const r = await conversar({
      mensajes: [{ rol: "visitante", texto: "mi tel es 11 5060 4928" }],
      contexto,
      herramientas: herramientasVacias,
      llamar: api(
        [{ name: "guardar_datos", input: { telefono: "1150604928" } }],
        [{ name: "derivar_a_whatsapp", input: { resumen: "quiere que lo llamen" } }],
        [responder("Listo, ya le pasé tus datos al equipo.")]
      ),
    })
    expect(r.pasos.map((p) => p.herramienta)).toContain("derivar_a_whatsapp")
  })

  it("si da vueltas sin responder, no se cuelga: contesta algo útil y deriva", async () => {
    const r = await conversar({
      mensajes: [{ rol: "visitante", texto: "hola" }],
      contexto,
      herramientas: herramientasVacias,
      llamar: api([{ name: "buscar_en_el_sitio", input: { consulta: "algo" } }]),
    })
    expect(r.agotado).toBe(true)
    expect(r.respuesta.texto.length).toBeGreaterThan(0)
    expect(r.pasos.length).toBeLessThanOrEqual(MAX_ITERACIONES)
  })

  it("cuenta lo que gastó, para poder frenarlo", async () => {
    const r = await conversar({
      mensajes: [{ rol: "visitante", texto: "hola" }],
      contexto,
      herramientas: herramientasVacias,
      llamar: api([responder("¡Hola!")]),
    })
    expect(r.tokens.entrada).toBe(100)
    expect(r.costoUSD).toBeGreaterThan(0)
  })
})
