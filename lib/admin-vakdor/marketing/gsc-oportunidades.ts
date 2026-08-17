/**
 * Oportunidades SEO: lo que ya aparece en Google pero todavía no arriba.
 *
 * Se mantiene SEPARADO de `fetchGscQueries` a propósito. Esa alimenta el panel y no se
 * toca; ésta pide la dimensión `page` además de `query`, lo que multiplica las filas
 * (una por combinación búsqueda × URL) y rompería la lectura de la otra.
 *
 * La idea, del §32 del documento de estrategia: si una URL ya está en posición 6, conviene
 * mejorar esa página antes que escribir otra que compita con ella.
 */

export interface GscOportunidad {
  query: string
  /** URL que ya aparece por esa búsqueda. Vacía si la consulta no pidió la dimensión `page`. */
  url: string
  clicks: number
  impressions: number
  position: number
}

export interface OpcionesOportunidades {
  minPos?: number
  maxPos?: number
  minImpresiones?: number
  limite?: number
}

/**
 * Puro y sin red, para poder testear el criterio sin pegarle a Google.
 *
 * - Debajo de `minPos` ya estás arriba: no es una oportunidad, es un logro.
 * - Por encima de `maxPos` no alcanza con mejorar la página; es escribir de nuevo.
 * - `minImpresiones` evita que una búsqueda con una sola impresión suelta termine
 *   decidiendo el calendario editorial.
 */
export function filtrarOportunidades(
  rows: unknown[],
  { minPos = 4, maxPos = 20, minImpresiones = 5, limite = 15 }: OpcionesOportunidades = {},
): GscOportunidad[] {
  const out: GscOportunidad[] = []
  for (const r of rows ?? []) {
    const row = r as { keys?: unknown[]; clicks?: number; impressions?: number; position?: number } | null
    const query = typeof row?.keys?.[0] === "string" ? (row.keys[0] as string) : ""
    if (!query) continue
    const url = typeof row?.keys?.[1] === "string" ? (row.keys[1] as string) : ""
    const position = Number(row?.position ?? 0)
    const impressions = Number(row?.impressions ?? 0)
    if (position < minPos || position > maxPos || impressions < minImpresiones) continue
    out.push({
      query,
      url,
      clicks: Number(row?.clicks ?? 0),
      impressions,
      position: Math.round(position * 10) / 10,
    })
  }
  return out.sort((a, b) => b.impressions - a.impressions).slice(0, limite)
}
