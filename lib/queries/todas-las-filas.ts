/**
 * Trae TODAS las filas de una consulta, de a tandas.
 *
 * La base (Supabase/PostgREST) entrega como máximo 1.000 filas por consulta y corta en
 * silencio: sin paginar, el pipeline de Central contaba 1.000 de 2.340 conversaciones y nadie
 * se enteraba (auditoría del dashboard, 15/9/2026). La consulta tiene que venir con un orden
 * estable —por ejemplo `.order("id")`—; si no, las tandas pueden repetir o saltear filas.
 */
export const FILAS_POR_TANDA = 1000

export async function todasLasFilas<T>(
  tanda: (desde: number, hasta: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const filas: T[] = []
  for (let desde = 0; ; desde += FILAS_POR_TANDA) {
    const { data, error } = await tanda(desde, desde + FILAS_POR_TANDA - 1)
    if (error) {
      console.error("todasLasFilas:", error.message)
      break
    }
    if (!data?.length) break
    filas.push(...(data as T[]))
    if (data.length < FILAS_POR_TANDA) break
  }
  return filas
}
