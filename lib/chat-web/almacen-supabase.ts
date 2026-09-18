/**
 * Chat web · El puente entre guardar.ts y la base.
 *
 * Es fino a propósito: toda la decisión está en guardar.ts, que se prueba sin base. Acá solo
 * están las cuatro consultas. Escribe con createAdminClient (service_role), que se saltea la
 * RLS, así que CADA consulta filtra a mano por widget: es la única red que queda.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import type { AlmacenPaginas, FilaPagina, MarcaDeRastreo } from "./guardar"
import { mejoresPorPagina, type FilaParecida, type ResultadoBusqueda } from "./buscar"

/** Cuántas filas se mandan por viaje. Con 8.000 caracteres y 768 números por fila, de a 20. */
const POR_TANDA = 20

/**
 * Las páginas del sitio que más se parecen a lo que preguntó el visitante.
 *
 * La comparación la hace Postgres (función `buscar_web_paginas`): traerse las 60 páginas con
 * sus 768 números en cada mensaje serían ~400 KB por pregunta. Acá vuelven solo las que sirven,
 * y el filtro fino (parecido mínimo, una fila por página) queda en `mejoresPorPagina`.
 *
 * Devuelve POR QUÉ vuelve vacía cuando vuelve vacía (Leonardo, 17/9): "busqué y no hay nada
 * parecido", "el sitio todavía no se leyó" y "la búsqueda se rompió" son tres respuestas
 * distintas para el visitante, y el agente solo puede razonar sobre lo que la herramienta le
 * cuenta. Nunca tira: el chat sigue andando con el documento de la agencia y las secciones.
 */
export async function buscarPaginas(
  widgetId: string,
  vectorDeLaPregunta: number[],
  cantidad = 6
): Promise<ResultadoBusqueda> {
  const db = createAdminClient()
  const { data, error } = await db.rpc("buscar_web_paginas", {
    p_widget_id: widgetId,
    p_vector: vectorDeLaPregunta,
    p_cantidad: cantidad,
  })
  if (error) {
    console.error("[chat-web] buscar_web_paginas:", error.message)
    return { estado: "error", paginas: [], motivo: error.message }
  }
  const filas = (data ?? []) as FilaParecida[]
  // Sin filas no es lo mismo que "no encontré": el sitio puede no estar leído todavía.
  if (!filas.length) return { estado: "sin_sitio", paginas: [] }

  const paginas = mejoresPorPagina(filas, cantidad)
  const mejorParecido = Math.max(...filas.map((f) => f.parecido))
  return paginas.length
    ? { estado: "encontrado", paginas, mejorParecido }
    : { estado: "nada_parecido", paginas: [], mejorParecido }
}

export function almacenSupabase(): AlmacenPaginas {
  const db = createAdminClient()

  return {
    async existentes(widgetId) {
      const { data, error } = await db
        .from("web_paginas")
        .select("url, orden, excluida")
        .eq("widget_id", widgetId)
      if (error) throw new Error(`No se pudo leer lo que ya estaba guardado: ${error.message}`)
      return (data ?? []) as Array<{ url: string; orden: number; excluida: boolean }>
    },

    async guardar(filas: FilaPagina[]) {
      for (let i = 0; i < filas.length; i += POR_TANDA) {
        const tanda = filas.slice(i, i + POR_TANDA)
        // La misma página no se duplica: si ya estaba, se pisa (índice widget_id+url+orden).
        const { error } = await db.from("web_paginas").upsert(tanda, { onConflict: "widget_id,url,orden" })
        if (error) throw new Error(`No se pudieron guardar las páginas: ${error.message}`)
      }
    },

    async borrarSobrantes(widgetId, claves) {
      // Se borra por URL: si una dirección ya no está en el sitio, se van todos sus pedazos.
      // Una página que quedó más corta (menos pedazos) se limpia con el filtro de orden.
      const urls = [...new Set(claves.map((c) => c.url))]
      const maximoOrden = new Map<string, number>()
      for (const c of claves) maximoOrden.set(c.url, Math.max(maximoOrden.get(c.url) ?? 0, c.orden))

      let borradas = 0
      const { data: fuera, error } = await db
        .from("web_paginas")
        .delete()
        .eq("widget_id", widgetId)
        .not("url", "in", `(${urls.map((u) => `"${u.replace(/"/g, '""')}"`).join(",")})`)
        .select("id")
      if (error) throw new Error(`No se pudieron borrar las páginas viejas: ${error.message}`)
      borradas += (fuera ?? []).length

      for (const [url, tope] of maximoOrden) {
        const { data, error: e2 } = await db
          .from("web_paginas")
          .delete()
          .eq("widget_id", widgetId)
          .eq("url", url)
          .gt("orden", tope)
          .select("id")
        if (e2) throw new Error(`No se pudieron limpiar los pedazos sobrantes: ${e2.message}`)
        borradas += (data ?? []).length
      }
      return borradas
    },

    async marcarWidget(widgetId: string, estado: MarcaDeRastreo) {
      const { error } = await db
        .from("web_widgets")
        .update({ ...estado, updated_at: new Date().toISOString() })
        .eq("id", widgetId)
      if (error) throw new Error(`No se pudo anotar cómo salió el rastreo: ${error.message}`)
    },
  }
}
