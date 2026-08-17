import { describe, it, expect } from "vitest"
import { parsearIdeas, type ClavesValidas } from "./generar-validacion"

const CLAVES: ClavesValidas = {
  clusters: ["leads_inmobiliarios"],
  propositos: ["ensenar"],
  estructuras: ["framework_pasos"],
}

const base = { titulo: "T", fuente: "blog", formato: "articulo_blog" }

describe("parsearIdeas", () => {
  it("acepta una idea completa y válida", () => {
    const [idea] = parsearIdeas([{
      ...base, funnel: "mofu",
      cluster: "leads_inmobiliarios", proposito: "ensenar", estructura: "framework_pasos",
      keyword_objetivo: "seguimiento leads inmobiliaria",
    }], CLAVES)
    expect(idea.cluster).toBe("leads_inmobiliarios")
    expect(idea.proposito).toBe("ensenar")
    expect(idea.estructura).toBe("framework_pasos")
    expect(idea.funnel).toBe("mofu")
    expect(idea.keyword_objetivo).toBe("seguimiento leads inmobiliaria")
  })

  it("deja en null lo que no valida, sin descartar la idea", () => {
    // Una clave inventada no puede costar la idea entera: se pierde el eje, no la pieza.
    const [idea] = parsearIdeas([{
      ...base, cluster: "inventado", proposito: "inventado", estructura: "inventada", funnel: "zofu",
    }], CLAVES)
    expect(idea.titulo).toBe("T")
    expect(idea.cluster).toBeNull()
    expect(idea.proposito).toBeNull()
    expect(idea.estructura).toBeNull()
    expect(idea.funnel).toBeNull()
  })

  it("descarta la idea si falta título, fuente o formato", () => {
    expect(parsearIdeas([{ ...base, titulo: "" }], CLAVES)).toEqual([])
    expect(parsearIdeas([{ ...base, titulo: "   " }], CLAVES)).toEqual([])
    expect(parsearIdeas([{ ...base, fuente: "tiktok" }], CLAVES)).toEqual([])
    expect(parsearIdeas([{ ...base, formato: "podcast" }], CLAVES)).toEqual([])
  })

  it("acepta una estructura que solo existe en la base", () => {
    // La prueba de que se dejó de validar contra la lista cerrada del código:
    // agregar una estructura por SQL tiene que alcanzar.
    const [idea] = parsearIdeas(
      [{ titulo: "T", fuente: "linkedin", formato: "post_texto", estructura: "estructura_nueva_de_hoy" }],
      { ...CLAVES, estructuras: ["estructura_nueva_de_hoy"] })
    expect(idea.estructura).toBe("estructura_nueva_de_hoy")
  })

  it("ignora entradas que no son objetos y no explota", () => {
    expect(parsearIdeas([null, 42, "texto", undefined] as unknown[], CLAVES)).toEqual([])
    expect(parsearIdeas([], CLAVES)).toEqual([])
  })

  it("limpia espacios del título y marca el origen como motor", () => {
    const [idea] = parsearIdeas([{ ...base, titulo: "  Con espacios  " }], CLAVES)
    expect(idea.titulo).toBe("Con espacios")
    expect(idea.origen).toBe("motor")
  })

  it("la keyword objetivo solo se guarda si es un string con contenido", () => {
    expect(parsearIdeas([{ ...base, keyword_objetivo: "   " }], CLAVES)[0].keyword_objetivo).toBeNull()
    expect(parsearIdeas([{ ...base, keyword_objetivo: 42 }], CLAVES)[0].keyword_objetivo).toBeNull()
  })
})
