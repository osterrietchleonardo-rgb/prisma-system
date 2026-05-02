export interface ICCData {
  indice_tiempo: string
  icc_nivel_general: number
  icc_materiales: number
  icc_mano_obra: number
  icc_gastos_generales: number
  var_nivel_general_pct: number
  var_materiales_pct: number
  var_mano_obra_pct: number
  var_gastos_generales_pct: number
}

export interface ICCResult {
  data: ICCData | null
  error?: string
}

const ICC_URL =
  'https://infra.datos.gob.ar/catalog/sspm/dataset/109/distribution/109.3/download/indice-costo-construccion-base-1993-mensual.csv'

function parseNum(val: string): number {
  return parseFloat(val.replace(',', '.').trim()) || 0
}

function varPct(actual: number, anterior: number): number {
  if (anterior === 0) return 0
  return parseFloat(((actual - anterior) / anterior * 100).toFixed(2))
}

export async function fetchICC(): Promise<ICCResult> {
  try {
    const res = await fetch(ICC_URL, {
      next: { revalidate: 86400, tags: ['mercado'] },
    })

    if (!res.ok) {
      throw new Error(`INDEC CSV responded with ${res.status}`)
    }

    const text = await res.text()
    const lines = text.trim().split('\n').filter((l) => l.trim().length > 0)

    if (lines.length < 3) {
      throw new Error('CSV has too few rows')
    }

    // Header row
    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/"/g, ''))

    const parseRow = (line: string): Record<string, string> => {
      const vals = line.split(',').map((v) => v.trim().replace(/"/g, ''))
      const row: Record<string, string> = {}
      headers.forEach((h, i) => { row[h] = vals[i] ?? '' })
      return row
    }

    const lastRow = parseRow(lines[lines.length - 1])
    const prevRow = parseRow(lines[lines.length - 2])

    const ng = parseNum(lastRow['icc_nivel_general'] ?? '')
    const mat = parseNum(lastRow['icc_materiales'] ?? '')
    const mo = parseNum(lastRow['icc_mano_obra'] ?? '')
    const gg = parseNum(lastRow['icc_gastos_generales'] ?? '')

    const ng_p = parseNum(prevRow['icc_nivel_general'] ?? '')
    const mat_p = parseNum(prevRow['icc_materiales'] ?? '')
    const mo_p = parseNum(prevRow['icc_mano_obra'] ?? '')
    const gg_p = parseNum(prevRow['icc_gastos_generales'] ?? '')

    return {
      data: {
        indice_tiempo: lastRow['indice_tiempo'] ?? '',
        icc_nivel_general: ng,
        icc_materiales: mat,
        icc_mano_obra: mo,
        icc_gastos_generales: gg,
        var_nivel_general_pct: varPct(ng, ng_p),
        var_materiales_pct: varPct(mat, mat_p),
        var_mano_obra_pct: varPct(mo, mo_p),
        var_gastos_generales_pct: varPct(gg, gg_p),
      },
    }
  } catch (error) {
    console.error('[fetchICC] Error:', error)
    return { data: null, error: 'No se pudo obtener el índice ICC' }
  }
}
