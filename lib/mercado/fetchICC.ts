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

// INDEC — Índice Costo de Construcción (base 1993)
// Real column names: icc_1993_nivel_general, icc_1993_materiales, etc.
const ICC_URL =
  'https://infra.datos.gob.ar/catalog/sspm/dataset/109/distribution/109.3/download/indice-costo-construccion-base-1993-mensual.csv'

function parseNum(val: string | undefined): number {
  if (!val) return 0
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
    const lines = text
      .trim()
      .split('\n')
      .filter((l) => l.trim().length > 0)

    if (lines.length < 3) {
      throw new Error('ICC CSV has too few rows')
    }

    // Header row — actual columns from datos.gob.ar:
    // indice_tiempo,icc_1993_nivel_general,icc_1993_materiales,icc_1993_mano_obra,
    // icc_1993_gastos_generales,icc_1993_mano_obra_materiales,
    // icc_1993_nivel_general_variacion_mensual,icc_1993_nivel_general_variacion_anual
    const headers = lines[0].split(',').map((h) =>
      h.trim().toLowerCase().replace(/"/g, '').replace(/^\uFEFF/, '')
    )

    const parseRow = (line: string): Record<string, string> => {
      const vals = line.split(',').map((v) => v.trim().replace(/"/g, ''))
      const row: Record<string, string> = {}
      headers.forEach((h, i) => { row[h] = vals[i] ?? '' })
      return row
    }

    // Skip empty lines to get last two valid data rows
    const dataLines = lines.slice(1).filter((l) => l.trim() && !l.match(/^,+$/))
    if (dataLines.length < 2) throw new Error('Not enough ICC data rows')

    const lastRow = parseRow(dataLines[dataLines.length - 1])
    const prevRow = parseRow(dataLines[dataLines.length - 2])

    // Column lookup helpers — try both prefixed and short names
    const getCol = (row: Record<string, string>, ...candidates: string[]): string => {
      for (const c of candidates) {
        if (row[c] !== undefined && row[c] !== '') return row[c]
      }
      return ''
    }

    const ng  = parseNum(getCol(lastRow, 'icc_1993_nivel_general', 'icc_nivel_general'))
    const mat = parseNum(getCol(lastRow, 'icc_1993_materiales', 'icc_materiales'))
    const mo  = parseNum(getCol(lastRow, 'icc_1993_mano_obra', 'icc_mano_obra'))
    const gg  = parseNum(getCol(lastRow, 'icc_1993_gastos_generales', 'icc_gastos_generales'))

    const ng_p  = parseNum(getCol(prevRow, 'icc_1993_nivel_general', 'icc_nivel_general'))
    const mat_p = parseNum(getCol(prevRow, 'icc_1993_materiales', 'icc_materiales'))
    const mo_p  = parseNum(getCol(prevRow, 'icc_1993_mano_obra', 'icc_mano_obra'))
    const gg_p  = parseNum(getCol(prevRow, 'icc_1993_gastos_generales', 'icc_gastos_generales'))

    // Validate: we should have real non-zero values
    if (ng === 0) {
      console.error('[fetchICC] nivel_general is 0. Headers found:', headers.join(','))
      throw new Error('ICC nivel_general parsed as 0 — column mismatch')
    }

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
    return { data: null, error: 'No se pudo obtener el índice ICC de INDEC' }
  }
}
