/**
 * Chat web · Guardar lo que se leyó del sitio (diseño 2026-09-16 §3-bis).
 *
 * La regla de fondo: **una lectura que falla no puede dejar al asistente sin nada**. Si el sitio
 * no contesta, lo viejo se queda donde está; es mejor una página de hace un mes que ninguna.
 * Por eso acá no hay "borrar todo y volver a escribir": se escriben las nuevas, se sacan solo
 * las que ya no están, y si no vino ninguna no se toca nada.
 *
 * Lo mismo con el director: si sacó una página de la lista, esa decisión sobrevive a releer el
 * sitio. Nada más molesto que volver a sacar lo mismo todos los meses.
 *
 * No sabe nada de Supabase a propósito: recibe un `almacen`. Así se prueba entero sin base.
 */
import type { ResultadoRastreo } from "./rastreo"

export interface FilaPagina {
  widget_id: string
  agency_id: string
  url: string
  titulo: string
  texto: string
  orden: number
  embedding: number[] | null
  excluida: boolean
}

export type EstadoRastreo = "ok" | "error"

export interface MarcaDeRastreo {
  rastreo_estado: EstadoRastreo
  rastreo_motivo: string | null
  rastreo_paginas: number
  rastreo_truncado: boolean
  rastreo_en: string
}

/** El puente con la base. La implementación de verdad está en almacen-supabase.ts. */
export interface AlmacenPaginas {
  existentes(widgetId: string): Promise<Array<{ url: string; orden: number; excluida: boolean }>>
  guardar(filas: FilaPagina[]): Promise<void>
  borrarSobrantes(widgetId: string, claves: Array<{ url: string; orden: number }>): Promise<number>
  marcarWidget(widgetId: string, estado: MarcaDeRastreo): Promise<void>
}

export interface OpcionesGuardar {
  almacen: AlmacenPaginas
  widgetId: string
  agencyId: string
  resultado: ResultadoRastreo
  /** Convierte un texto en su vector. En producción, generateEmbedding de lib/gemini.ts. */
  embeder: (texto: string) => Promise<number[]>
  ahora?: () => Date
}

export interface ResumenGuardado {
  guardadas: number
  /** Páginas que quedaron sin vector: se pueden mostrar, pero no se encuentran por significado. */
  sinVector: number
  borradas: number
  estado: EstadoRastreo
  motivo: string | null
}

export async function guardarRastreo(opts: OpcionesGuardar): Promise<ResumenGuardado> {
  const { almacen, widgetId, agencyId, resultado, embeder } = opts
  const ahora = opts.ahora ?? (() => new Date())

  const marcar = async (m: MarcaDeRastreo) => {
    await almacen.marcarWidget(widgetId, m)
  }

  // ── El sitio no se dejó leer: lo viejo se queda. ──
  if (resultado.paginas.length === 0) {
    const motivo = resultado.motivo ?? "sin_paginas"
    await marcar({
      rastreo_estado: "error",
      rastreo_motivo: motivo,
      rastreo_paginas: 0,
      rastreo_truncado: resultado.truncado,
      rastreo_en: ahora().toISOString(),
    })
    return { guardadas: 0, sinVector: 0, borradas: 0, estado: "error", motivo }
  }

  // Lo que el director había sacado de la lista, para no pisarlo.
  const excluidas = new Set(
    (await almacen.existentes(widgetId)).filter((e) => e.excluida).map((e) => `${e.url}|${e.orden}`)
  )

  const filas: FilaPagina[] = []
  let sinVector = 0
  for (const p of resultado.paginas) {
    // El título va adelante del texto: en "Tasaciones" está la mitad del significado de la
    // página, y si no entra al vector, la búsqueda no la encuentra por su nombre.
    const paraElVector = `${p.titulo}\n\n${p.texto}`.trim()
    let embedding: number[] | null = null
    try {
      embedding = await embeder(paraElVector)
    } catch {
      // Una página sin vector se guarda igual: el texto sirve, y no se pierde el rastreo entero
      // por un error de la API de turno.
      sinVector++
    }
    filas.push({
      widget_id: widgetId,
      agency_id: agencyId,
      url: p.url,
      titulo: p.titulo,
      texto: p.texto,
      orden: p.orden,
      embedding,
      excluida: excluidas.has(`${p.url}|${p.orden}`),
    })
  }

  await almacen.guardar(filas)
  const borradas = await almacen.borrarSobrantes(
    widgetId,
    filas.map((f) => ({ url: f.url, orden: f.orden }))
  )

  // Si no salió NINGÚN vector, el texto está pero el asistente no va a poder buscar por
  // significado: eso es un problema que el director tiene que ver, no un "ok".
  const todosSinVector = sinVector === filas.length
  const motivo = todosSinVector ? "sin_vectores" : null
  const estado: EstadoRastreo = todosSinVector ? "error" : "ok"

  await marcar({
    rastreo_estado: estado,
    rastreo_motivo: motivo,
    // Páginas distintas, no pedazos: es lo que el director entiende por "páginas".
    rastreo_paginas: new Set(filas.map((f) => f.url)).size,
    rastreo_truncado: resultado.truncado,
    rastreo_en: ahora().toISOString(),
  })

  return { guardadas: filas.length, sinVector, borradas, estado, motivo }
}
