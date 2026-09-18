import { describe, it, expect } from "vitest"
import { guardarRastreo, type AlmacenPaginas, type FilaPagina } from "./guardar"
import type { ResultadoRastreo } from "./rastreo"

/** Un almacén de mentira que anota todo lo que le piden, para poder revisarlo después. */
function almacenFalso(existentes: Array<{ url: string; orden: number; excluida: boolean }> = []) {
  const registro = {
    guardadas: [] as FilaPagina[],
    borradas: [] as Array<{ url: string; orden: number }>,
    widget: null as Record<string, unknown> | null,
    seBorroAlgo: false,
  }
  const almacen: AlmacenPaginas = {
    async existentes() {
      return existentes
    },
    async guardar(filas) {
      registro.guardadas.push(...filas)
    },
    async borrarSobrantes(_widgetId, claves) {
      registro.seBorroAlgo = true
      const quedan = new Set(claves.map((c) => `${c.url}|${c.orden}`))
      registro.borradas = existentes.filter((e) => !quedan.has(`${e.url}|${e.orden}`))
      return registro.borradas.length
    },
    async marcarWidget(_widgetId, estado) {
      registro.widget = estado as unknown as Record<string, unknown>
    },
  }
  return { almacen, registro }
}

const rastreo = (paginas: ResultadoRastreo["paginas"], extra: Partial<ResultadoRastreo> = {}): ResultadoRastreo => ({
  paginas,
  urlsLeidas: new Set(paginas.map((p) => p.url)).size,
  desdeSitemap: true,
  truncado: false,
  motivo: null,
  ...extra,
})

const pagina = (url: string, orden = 0) => ({ url, titulo: `Título de ${url}`, texto: `Texto de ${url}`, orden })

const vectorFalso = async () => Array.from({ length: 768 }, (_, i) => i / 768)

describe("guardarRastreo", () => {
  it("guarda cada página con su título, su link, su texto y su vector", async () => {
    const { almacen, registro } = almacenFalso()
    const r = await guardarRastreo({
      almacen,
      widgetId: "w1",
      agencyId: "a1",
      resultado: rastreo([pagina("https://c.com/"), pagina("https://c.com/tasaciones")]),
      embeder: vectorFalso,
    })

    expect(registro.guardadas).toHaveLength(2)
    expect(registro.guardadas[0]).toMatchObject({
      widget_id: "w1",
      agency_id: "a1",
      url: "https://c.com/",
      orden: 0,
      excluida: false,
    })
    expect(registro.guardadas[0].embedding).toHaveLength(768)
    expect(r).toMatchObject({ guardadas: 2, sinVector: 0, borradas: 0, estado: "ok" })
  })

  it("si el rastreo no pudo leer nada, NO borra lo que ya estaba", async () => {
    const { almacen, registro } = almacenFalso([{ url: "https://c.com/", orden: 0, excluida: false }])
    const r = await guardarRastreo({
      almacen,
      widgetId: "w1",
      agencyId: "a1",
      resultado: rastreo([], { motivo: "sin_respuesta" }),
      embeder: vectorFalso,
    })

    expect(registro.guardadas).toHaveLength(0)
    expect(registro.seBorroAlgo, "no se tocó lo viejo").toBe(false)
    expect(r.estado).toBe("error")
    expect(registro.widget).toMatchObject({ rastreo_estado: "error", rastreo_motivo: "sin_respuesta" })
  })

  it("una página que el director había sacado de la lista sigue sacada después de releer el sitio", async () => {
    const { almacen, registro } = almacenFalso([
      { url: "https://c.com/promo-vieja", orden: 0, excluida: true },
      { url: "https://c.com/", orden: 0, excluida: false },
    ])
    await guardarRastreo({
      almacen,
      widgetId: "w1",
      agencyId: "a1",
      resultado: rastreo([pagina("https://c.com/"), pagina("https://c.com/promo-vieja")]),
      embeder: vectorFalso,
    })

    const promo = registro.guardadas.find((f) => f.url === "https://c.com/promo-vieja")
    expect(promo?.excluida, "la decisión del director no se pisa").toBe(true)
    expect(registro.guardadas.find((f) => f.url === "https://c.com/")?.excluida).toBe(false)
  })

  it("las páginas que ya no están en el sitio se borran", async () => {
    const { almacen, registro } = almacenFalso([
      { url: "https://c.com/", orden: 0, excluida: false },
      { url: "https://c.com/seccion-borrada", orden: 0, excluida: false },
    ])
    const r = await guardarRastreo({
      almacen,
      widgetId: "w1",
      agencyId: "a1",
      resultado: rastreo([pagina("https://c.com/")]),
      embeder: vectorFalso,
    })

    expect(registro.borradas.map((b) => b.url)).toEqual(["https://c.com/seccion-borrada"])
    expect(r.borradas).toBe(1)
  })

  it("si falla el vector de una página, esa se guarda igual sin vector y las demás siguen", async () => {
    const { almacen, registro } = almacenFalso()
    let llamadas = 0
    const embederRoto = async () => {
      llamadas++
      if (llamadas === 2) throw new Error("Embedding failed: 429")
      return await vectorFalso()
    }
    const r = await guardarRastreo({
      almacen,
      widgetId: "w1",
      agencyId: "a1",
      resultado: rastreo([pagina("https://c.com/a"), pagina("https://c.com/b"), pagina("https://c.com/c")]),
      embeder: embederRoto,
    })

    expect(registro.guardadas).toHaveLength(3)
    expect(registro.guardadas.filter((f) => f.embedding === null)).toHaveLength(1)
    expect(r).toMatchObject({ guardadas: 3, sinVector: 1, estado: "ok" })
  })

  it("si NINGÚN vector sale, se guarda el texto igual pero el estado avisa", async () => {
    const { almacen, registro } = almacenFalso()
    const r = await guardarRastreo({
      almacen,
      widgetId: "w1",
      agencyId: "a1",
      resultado: rastreo([pagina("https://c.com/a")]),
      embeder: async () => {
        throw new Error("sin clave de Gemini")
      },
    })

    expect(registro.guardadas).toHaveLength(1)
    expect(r.estado).toBe("error")
    expect(registro.widget).toMatchObject({ rastreo_motivo: "sin_vectores" })
  })

  it("deja anotado en el widget qué pasó, para poder mostrarlo sin adivinar", async () => {
    const { almacen, registro } = almacenFalso()
    await guardarRastreo({
      almacen,
      widgetId: "w1",
      agencyId: "a1",
      resultado: rastreo([pagina("https://c.com/"), pagina("https://c.com/", 1)], { truncado: true }),
      embeder: vectorFalso,
      ahora: () => new Date("2026-09-17T12:00:00Z"),
    })

    expect(registro.widget).toMatchObject({
      rastreo_estado: "ok",
      rastreo_motivo: null,
      // páginas distintas, no pedazos: es lo que el director entiende por "páginas"
      rastreo_paginas: 1,
      rastreo_truncado: true,
      rastreo_en: "2026-09-17T12:00:00.000Z",
    })
  })

  it("el texto que va al vector lleva el título adelante: ahí está la mitad del significado", async () => {
    const { almacen } = almacenFalso()
    const vistos: string[] = []
    await guardarRastreo({
      almacen,
      widgetId: "w1",
      agencyId: "a1",
      resultado: rastreo([pagina("https://c.com/tasaciones")]),
      embeder: async (texto) => {
        vistos.push(texto)
        return await vectorFalso()
      },
    })
    expect(vistos[0].startsWith("Título de https://c.com/tasaciones")).toBe(true)
    expect(vistos[0]).toContain("Texto de https://c.com/tasaciones")
  })
})
