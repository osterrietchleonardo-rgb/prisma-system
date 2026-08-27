import { describe, it, expect } from "vitest"
import type { Deteccion, Hueco } from "@/lib/plantillas/deteccion"
import {
  armarPropuesta,
  limitesConocidos,
  MAX_HUECOS_A_LA_IA,
  nombreGenerico,
  nombresParaHuecos,
  promptDeNombres,
  sanearNombre,
  separarPorEstado,
} from "./propuesta"

// ── Ayudas ─────────────────────────────────────────────────────────────────

const hueco = (indice: number, valores: Record<string, string>, contexto = "contexto"): Hueco => ({
  indice,
  contexto,
  valores,
})

const deteccion = (partes: Partial<Deteccion> = {}): Deteccion => ({
  huecos: [],
  textoBase: "",
  documentosUsados: [],
  advertencias: [],
  ...partes,
})

// ── Quién entra en la detección ────────────────────────────────────────────

describe("separarPorEstado", () => {
  it("deja afuera al pausado y al desvinculado, y adentro al activo", () => {
    const { dentro } = separarPorEstado([
      { advisorId: "a", estado: "activo" },
      { advisorId: "b", estado: "pausado" },
      { advisorId: "c", estado: "eliminado" },
    ])
    expect(dentro.map((f) => f.advisorId)).toEqual(["a"])
  })

  it("no excluye a nadie en silencio: cada exclusión sale por escrito, con el nombre", () => {
    const { advertencias } = separarPorEstado([
      { advisorId: "a", estado: "activo", nombre: "Ana" },
      { advisorId: "b", estado: "pausado", nombre: "Bruno" },
      { advisorId: "c", estado: "eliminado", nombre: "Carla" },
    ])
    expect(advertencias).toHaveLength(2)
    expect(advertencias.some((a) => a.includes("Bruno") && a.includes("pausado"))).toBe(true)
    expect(advertencias.some((a) => a.includes("Carla") && a.includes("desvinculado"))).toBe(true)
  })

  it("sin nombre cargado, la advertencia cae al id para que se pueda buscar a la persona", () => {
    const { advertencias } = separarPorEstado([{ advisorId: "id-42", estado: "pausado", nombre: "   " }])
    expect(advertencias[0]).toContain("id-42")
  })

  it("un estado nulo (perfil viejo) entra y no genera ruido", () => {
    const { dentro, advertencias } = separarPorEstado([{ advisorId: "a", estado: null }])
    expect(dentro.map((f) => f.advisorId)).toEqual(["a"])
    expect(advertencias).toEqual([])
  })

  it("un estado con mayúsculas o espacios se reconoce igual", () => {
    const { dentro, advertencias } = separarPorEstado([{ advisorId: "a", estado: "  Pausado " }])
    expect(dentro).toEqual([])
    expect(advertencias[0]).toContain("pausado")
  })

  it("un estado desconocido entra, pero avisando: no se inventa una regla nueva en silencio", () => {
    const { dentro, advertencias } = separarPorEstado([{ advisorId: "a", estado: "suspendido", nombre: "Ana" }])
    expect(dentro.map((f) => f.advisorId)).toEqual(["a"])
    expect(advertencias).toHaveLength(1)
    expect(advertencias[0]).toContain("suspendido")
  })
})

// ── Los nombres ────────────────────────────────────────────────────────────

describe("sanearNombre", () => {
  it("deja el nombre como se escribe adentro del .docx", () => {
    expect(sanearNombre("comisión porcentaje")).toBe("COMISION_PORCENTAJE")
  })

  it("saca llaves, puntos y todo lo que docxtemplater no encontraría después", () => {
    expect(sanearNombre("{{ Nombre.Completo }}")).toBe("NOMBRE_COMPLETO")
  })

  it("no deja guiones bajos colgando de los bordes", () => {
    expect(sanearNombre("__CUIT__")).toBe("CUIT")
  })

  it("un nombre que arranca con número se vuelve nombre de campo", () => {
    expect(sanearNombre("1_domicilio")).toBe("CAMPO_1_DOMICILIO")
  })

  it("corta el nombre largo sin dejar el guión bajo del corte", () => {
    const salida = sanearNombre("A".repeat(39) + " " + "B".repeat(10))
    expect(salida).toBe("A".repeat(39))
  })

  it("devuelve null cuando no queda nada usable", () => {
    expect(sanearNombre("   ")).toBeNull()
    expect(sanearNombre("¿¿??")).toBeNull()
    expect(sanearNombre(42)).toBeNull()
    expect(sanearNombre(null)).toBeNull()
    expect(sanearNombre(undefined)).toBeNull()
  })
})

describe("nombresParaHuecos", () => {
  it("usa los nombres de la IA cuando vienen completos y limpios", () => {
    const r = nombresParaHuecos('{"nombres": ["nombre completo", "CUIT"]}', 2)
    expect(r.nombres).toEqual(["NOMBRE_COMPLETO", "CUIT"])
    expect(r.laIaRespondio).toBe(true)
    expect(r.advertencias).toEqual([])
  })

  it("acepta el arreglo pelado, que es lo que el modelo devuelve a veces", () => {
    const r = nombresParaHuecos('["CUIT", "MATRICULA"]', 2)
    expect(r.nombres).toEqual(["CUIT", "MATRICULA"])
    expect(r.laIaRespondio).toBe(true)
  })

  it("le saca los backticks con los que el modelo envuelve el JSON", () => {
    const r = nombresParaHuecos('```json\n{"nombres": ["CUIT"]}\n```', 1)
    expect(r.nombres).toEqual(["CUIT"])
    expect(r.laIaRespondio).toBe(true)
  })

  // ── El camino de fallo de la IA: la detección NO se cae (spec §7.1) ──
  it("sin respuesta de la IA salen CAMPO_N y laIaRespondio es false", () => {
    const r = nombresParaHuecos(null, 3)
    expect(r.nombres).toEqual(["CAMPO_1", "CAMPO_2", "CAMPO_3"])
    expect(r.laIaRespondio).toBe(false)
    expect(r.advertencias).toHaveLength(1)
  })

  it("con una respuesta vacía pasa lo mismo", () => {
    const r = nombresParaHuecos("   ", 2)
    expect(r.nombres).toEqual(["CAMPO_1", "CAMPO_2"])
    expect(r.laIaRespondio).toBe(false)
  })

  it("con una respuesta que no es JSON salen CAMPO_N en vez de romperse", () => {
    const r = nombresParaHuecos("Claro, acá van los nombres de los campos:", 2)
    expect(r.nombres).toEqual(["CAMPO_1", "CAMPO_2"])
    expect(r.laIaRespondio).toBe(false)
    expect(r.advertencias[0]).toContain("no se pudo leer")
  })

  it("con un JSON de otra forma salen CAMPO_N", () => {
    const r = nombresParaHuecos('{"campos": {"uno": "CUIT"}}', 1)
    expect(r.nombres).toEqual(["CAMPO_1"])
    expect(r.laIaRespondio).toBe(false)
  })

  it("si la IA devuelve de menos, completa con CAMPO_N y no dice que respondió", () => {
    const r = nombresParaHuecos('{"nombres": ["CUIT"]}', 3)
    expect(r.nombres).toEqual(["CUIT", "CAMPO_2", "CAMPO_3"])
    expect(r.laIaRespondio).toBe(false)
    expect(r.advertencias[0]).toContain("1 nombre(s) para 3 campo(s)")
  })

  it("si la IA devuelve de más, se queda con los primeros y avisa", () => {
    const r = nombresParaHuecos('{"nombres": ["CUIT", "MATRICULA", "DE_MAS"]}', 2)
    expect(r.nombres).toEqual(["CUIT", "MATRICULA"])
    expect(r.laIaRespondio).toBe(false)
    expect(r.advertencias[0]).toContain("3 nombre(s) para 2 campo(s)")
  })

  it("un nombre suelto ilegible no tira los demás, pero sí baja laIaRespondio", () => {
    const r = nombresParaHuecos('{"nombres": ["CUIT", "", "MATRICULA"]}', 3)
    expect(r.nombres).toEqual(["CUIT", "CAMPO_2", "MATRICULA"])
    expect(r.laIaRespondio).toBe(false)
    expect(r.advertencias).toHaveLength(1)
  })

  // ── Los repetidos: dos huecos con el mismo nombre son un campo solo ──
  it("desambigua los nombres repetidos, que si no colapsarían dos huecos en uno", () => {
    const r = nombresParaHuecos('{"nombres": ["DOMICILIO", "DOMICILIO", "DOMICILIO"]}', 3)
    expect(r.nombres).toEqual(["DOMICILIO", "DOMICILIO_2", "DOMICILIO_3"])
    expect(new Set(r.nombres).size).toBe(3)
  })

  it("desambigua aunque la IA use el nombre de descarte", () => {
    const r = nombresParaHuecos('{"nombres": ["CAMPO_2", null]}', 2)
    expect(new Set(r.nombres).size).toBe(2)
    expect(r.nombres).toEqual(["CAMPO_2", "CAMPO_2_2"])
  })

  it("sin huecos no hay nombres ni advertencias", () => {
    expect(nombresParaHuecos(null, 0)).toEqual({ nombres: [], laIaRespondio: false, advertencias: [] })
  })
})

describe("nombreGenerico", () => {
  it("empieza en 1, como dice el spec", () => {
    expect(nombreGenerico(0)).toBe("CAMPO_1")
    expect(nombreGenerico(9)).toBe("CAMPO_10")
  })
})

// ── El prompt: qué se le manda a la IA y qué NO ────────────────────────────

describe("promptDeNombres", () => {
  it("manda el contexto y los valores, y NADA del documento entero", () => {
    const prompt = promptDeNombres([hueco(0, { "asesor-a": "Juan Pérez" }, "El asesor Juan Pérez, DNI")])
    expect(prompt).toContain("Juan Pérez")
    expect(prompt).toContain("El asesor Juan Pérez, DNI")
  })

  it("no manda los ids de los asesores: para nombrar un campo no sirven", () => {
    const prompt = promptDeNombres([hueco(0, { "0e1c-uuid-del-asesor": "Juan" })])
    expect(prompt).not.toContain("0e1c-uuid-del-asesor")
    expect(prompt).toContain("Persona 1")
  })

  it("corta los valores largos: alcanza con ver de qué se trata", () => {
    const prompt = promptDeNombres([hueco(0, { a: "X".repeat(500) })])
    expect(prompt).not.toContain("X".repeat(200))
    expect(prompt).toContain("…")
  })

  it("no manda más de MAX_HUECOS_A_LA_IA huecos", () => {
    const muchos = Array.from({ length: MAX_HUECOS_A_LA_IA + 25 }, (_, i) => hueco(i, { a: `v${i}` }))
    const prompt = promptDeNombres(muchos)
    expect(prompt).toContain(`Huecos a nombrar: ${MAX_HUECOS_A_LA_IA}`)
    expect(prompt).toContain(`Hueco ${MAX_HUECOS_A_LA_IA}:`)
    expect(prompt).not.toContain(`Hueco ${MAX_HUECOS_A_LA_IA + 1}:`)
  })
})

// ── Los límites conocidos ──────────────────────────────────────────────────

describe("limitesConocidos", () => {
  it("siempre avisa por lo que no se puede ver: cuadros de texto y notas", () => {
    const avisos = limitesConocidos(deteccion())
    expect(avisos.some((a) => a.includes("cuadro de texto"))).toBe(true)
    expect(avisos.some((a) => a.includes("nota al pie"))).toBe(true)
  })

  it("avisa por los campos fusionados solo si hay algún hueco", () => {
    const sin = limitesConocidos(deteccion())
    const con = limitesConocidos(deteccion({ huecos: [hueco(0, { a: "x" })] }))
    expect(sin.some((a) => a.includes("Dos datos pegados"))).toBe(false)
    expect(con.some((a) => a.includes("Dos datos pegados"))).toBe(true)
  })

  it("avisa por el prefijo común justo cuando son 3 documentos, que es donde es frágil", () => {
    const tres = limitesConocidos(deteccion({ documentosUsados: ["a", "b", "c"] }))
    const cuatro = limitesConocidos(deteccion({ documentosUsados: ["a", "b", "c", "d"] }))
    expect(tres.some((a) => a.includes("20-"))).toBe(true)
    expect(cuatro.some((a) => a.includes("20-"))).toBe(false)
  })
})

// ── Armar la propuesta ─────────────────────────────────────────────────────

describe("armarPropuesta", () => {
  const base = () =>
    deteccion({
      huecos: [hueco(0, { a: "Ana", b: "Bruno", c: "Carla" }, "El asesor Ana vive"), hueco(1, { a: "1", b: "2", c: "3" })],
      documentosUsados: ["a", "b", "c"],
    })

  it("le pone a cada hueco su id estable, su nombre, su contexto y sus valores", () => {
    const p = armarPropuesta({
      templateId: "t1",
      deteccion: base(),
      nombres: ["NOMBRE", "MATRICULA"],
      laIaRespondio: true,
    })
    expect(p.templateId).toBe("t1")
    expect(p.huecos).toHaveLength(2)
    expect(p.huecos[0]).toMatchObject({
      id: "hueco-0",
      nombre: "NOMBRE",
      contexto: "El asesor Ana vive",
      valores: { a: "Ana", b: "Bruno", c: "Carla" },
    })
    expect(p.huecos[1].id).toBe("hueco-1")
    expect(p.laIaRespondio).toBe(true)
  })

  it("el molde es el primer documento que entró de verdad en la comparación", () => {
    const p = armarPropuesta({ templateId: "t1", deteccion: base(), nombres: [], laIaRespondio: false })
    expect(p.moldeAdvisorId).toBe("a")
  })

  /**
   * El fallo que esta etapa vino a cerrar: si `documentosUsados` se dedujera
   * de las llaves de `valores`, un asesor caído aparecería como comparado.
   */
  it("documentosUsados sale de la detección, no de las llaves de valores", () => {
    const conCaido = deteccion({
      // El hueco tiene valores de tres, pero solo dos entraron en la comparación.
      huecos: [hueco(0, { a: "Ana", b: "Bruno", c: "Carla" })],
      documentosUsados: ["a", "b"],
      advertencias: ["No se pudo comparar el documento del asesor c."],
    })
    const p = armarPropuesta({ templateId: "t1", deteccion: conCaido, nombres: ["N"], laIaRespondio: true })
    expect(p.documentosUsados).toEqual(["a", "b"])
    expect(Object.keys(p.huecos[0].valores)).toHaveLength(3)
  })

  it("sin ningún documento usable, el molde queda vacío y se ve en documentosUsados", () => {
    const p = armarPropuesta({
      templateId: "t1",
      deteccion: deteccion({ advertencias: ["Todos ilegibles"] }),
      nombres: [],
      laIaRespondio: false,
    })
    expect(p.moldeAdvisorId).toBe("")
    expect(p.documentosUsados).toEqual([])
    expect(p.huecos).toEqual([])
  })

  it("arrastra las advertencias previas y las de la detección, en ese orden", () => {
    const d = base()
    d.advertencias = ["de la detección"]
    const p = armarPropuesta({
      templateId: "t1",
      deteccion: d,
      nombres: ["N", "M"],
      laIaRespondio: true,
      advertenciasPrevias: ["previa"],
    })
    expect(p.advertencias[0]).toBe("previa")
    expect(p.advertencias[1]).toBe("de la detección")
  })

  it("suma los límites conocidos en vez de taparlos", () => {
    const p = armarPropuesta({ templateId: "t1", deteccion: base(), nombres: ["N", "M"], laIaRespondio: true })
    expect(p.advertencias.some((a) => a.includes("cuadro de texto"))).toBe(true)
  })

  it("avisa cuando a un asesor comparado le falta el valor de un hueco", () => {
    const roto = deteccion({
      huecos: [hueco(0, { a: "Ana", b: "Bruno" })],
      documentosUsados: ["a", "b", "c"],
    })
    const p = armarPropuesta({ templateId: "t1", deteccion: roto, nombres: ["NOMBRE"], laIaRespondio: true })
    expect(p.advertencias.some((a) => a.includes("NOMBRE") && a.includes("1 de los 3"))).toBe(true)
  })

  it("avisa cuando los documentos salieron idénticos: es el síntoma de subir el mismo archivo", () => {
    const iguales = deteccion({ documentosUsados: ["a", "b", "c"] })
    const p = armarPropuesta({ templateId: "t1", deteccion: iguales, nombres: [], laIaRespondio: false })
    expect(p.advertencias.some((a) => a.includes("idénticos"))).toBe(true)
  })

  it("no avisa de documentos idénticos cuando no entró ninguno", () => {
    const p = armarPropuesta({ templateId: "t1", deteccion: deteccion(), nombres: [], laIaRespondio: false })
    expect(p.advertencias.some((a) => a.includes("idénticos"))).toBe(false)
  })

  it("un nombre que falta cae a CAMPO_N en vez de quedar undefined en la pantalla", () => {
    const p = armarPropuesta({ templateId: "t1", deteccion: base(), nombres: ["NOMBRE"], laIaRespondio: false })
    expect(p.huecos[1].nombre).toBe("CAMPO_2")
  })
})
