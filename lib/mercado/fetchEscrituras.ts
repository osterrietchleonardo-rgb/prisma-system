// ──────────────────────────────────────────────────────────────────────────────
// fetchEscrituras.ts
// Source: IDECBA / GCBA — Actos notariales de compraventa e hipotecas
//         Colegio de Escribanos. Ciudad de Buenos Aires.
// URL: https://www.estadisticaciudad.gob.ar/eyc/wp-content/uploads/2026/01/EE_IS_MI_AN_M07.xlsx
// Coverage: 2002 → Feb 2026 (annual totals, monthly breakdown inside each year)
// ──────────────────────────────────────────────────────────────────────────────
import * as XLSX from 'xlsx'

export interface EscriturasResult {
  /** Total annual actos de compraventa for the most recent FULL year */
  cantidad_anual: number | null
  /** Year the total corresponds to */
  year: number | null
  /** YoY variation % vs previous year */
  var_anual_pct: number | null
  error?: string
}

const XLSX_URL =
  'https://www.estadisticaciudad.gob.ar/eyc/wp-content/uploads/2026/01/EE_IS_MI_AN_M07.xlsx'

async function fetchBuffer(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url, {
      next: { revalidate: 86400, tags: ['mercado'] },
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PRISMA-System/1.0)' },
    })
    if (!res.ok) {
      console.error(`[fetchEscrituras] HTTP ${res.status}`)
      return null
    }
    return res.arrayBuffer()
  } catch (err) {
    console.error('[fetchEscrituras] Network error:', err)
    return null
  }
}

export async function fetchEscrituras(): Promise<EscriturasResult> {
  const buffer = await fetchBuffer(XLSX_URL)
  if (!buffer) {
    return { cantidad_anual: null, year: null, var_anual_pct: null, error: 'No se pudo descargar escrituras de IDECBA' }
  }

  try {
    const wb = XLSX.read(Buffer.from(buffer), { type: 'buffer' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const rows: (string | number)[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
    })

    // Rows where col[0] is a 4-digit year number (annual summary rows)
    // Structure: [year, cantidad_compraventa, monto_compraventa, cantidad_hipotecas, monto_hipotecas]
    const annualRows = rows.filter(
      (r) => typeof r[0] === 'number' && r[0] >= 2002 && r[0] <= 2100
    )

    if (annualRows.length < 2) {
      throw new Error('No se encontraron filas anuales en el XLSX de escrituras')
    }

    // The current year row (e.g. 2026) might be partial — skip it
    // Take the last COMPLETE year = second-to-last annual row
    const lastComplete = annualRows[annualRows.length - 2]
    const prevYear     = annualRows[annualRows.length - 3]

    const year    = lastComplete[0] as number
    const current = lastComplete[1] as number
    const prev    = typeof prevYear?.[1] === 'number' ? (prevYear[1] as number) : null

    const var_anual_pct =
      prev && prev > 0
        ? Math.round(((current - prev) / prev) * 10000) / 100
        : null

    return {
      cantidad_anual: Math.round(current),
      year,
      var_anual_pct,
    }
  } catch (err) {
    console.error('[fetchEscrituras] Parse error:', err)
    return { cantidad_anual: null, year: null, var_anual_pct: null, error: `Error al procesar escrituras: ${err}` }
  }
}
