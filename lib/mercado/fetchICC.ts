// ──────────────────────────────────────────────────────────────────────────────
// fetchICC.ts
// Source: IDECBA / GCBA — Índice del Costo de la Construcción
//         Nivel general y capítulos. Ciudad de Buenos Aires.
// URL: https://www.estadisticaciudad.gob.ar/eyc/wp-content/uploads/2026/02/EE_ICC_01-16.xlsx
// Coverage: Jan 2016 → March 2026  (base promedio 2012 = 100)
// ──────────────────────────────────────────────────────────────────────────────
import * as XLSX from 'xlsx'

export interface ICCData {
  indice_tiempo: string        // e.g. "Marzo de 2026"
  icc_nivel_general: number
  icc_materiales: number
  icc_mano_obra: number
  icc_gastos_generales: number
  var_nivel_general_pct: number   // vs mes anterior
  var_materiales_pct: number
  var_mano_obra_pct: number
  var_gastos_generales_pct: number
  var_anual_pct: number           // interanual nivel general
}

export interface ICCResult {
  data: ICCData | null
  error?: string
}

const ICC_XLSX_URL =
  'https://www.estadisticaciudad.gob.ar/eyc/wp-content/uploads/2026/02/EE_ICC_01-16.xlsx'

async function fetchBuffer(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url, {
      next: { revalidate: 86400, tags: ['mercado'] },
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PRISMA-System/1.0)' },
    })
    if (!res.ok) {
      console.error(`[fetchICC] HTTP ${res.status}`)
      return null
    }
    return res.arrayBuffer()
  } catch (err) {
    console.error('[fetchICC] Network error:', err)
    return null
  }
}

function safeNum(v: unknown): number {
  if (typeof v === 'number' && !isNaN(v)) return v
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(',', '.'))
    return isNaN(n) ? 0 : n
  }
  return 0
}

export async function fetchICC(): Promise<ICCResult> {
  const buffer = await fetchBuffer(ICC_XLSX_URL)
  if (!buffer) {
    return { data: null, error: 'No se pudo descargar el ICC de IDECBA' }
  }

  try {
    const wb = XLSX.read(Buffer.from(buffer), { type: 'buffer' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const rows: (string | number)[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
    })

    // Row 0: title with month/year e.g. "... Marzo de 2026"
    const title = String(rows[0]?.[0] ?? '')
    const monthMatch = title.match(/(\w+ de \d{4})\s*$/)
    const indice_tiempo = monthMatch ? monthMatch[1] : ''

    // Rows 3-6: Nivel general, Materiales, Mano de obra, Gastos generales
    // Columns: [0]=name, [1]=index, [2]=var_mensual, [3]=var_acumulada, [4]=var_interanual
    const ngRow  = rows[3]  // Nivel general
    const matRow = rows[4]  // Materiales
    const moRow  = rows[5]  // Mano de obra
    const ggRow  = rows[6]  // Gastos generales

    if (!ngRow || safeNum(ngRow[1]) === 0) {
      throw new Error('Datos ICC no encontrados en estructura esperada')
    }

    return {
      data: {
        indice_tiempo,
        icc_nivel_general:      Math.round(safeNum(ngRow[1])  * 100) / 100,
        icc_materiales:         Math.round(safeNum(matRow?.[1]) * 100) / 100,
        icc_mano_obra:          Math.round(safeNum(moRow?.[1])  * 100) / 100,
        icc_gastos_generales:   Math.round(safeNum(ggRow?.[1])  * 100) / 100,
        var_nivel_general_pct:  Math.round(safeNum(ngRow[2])  * 100) / 100,
        var_materiales_pct:     Math.round(safeNum(matRow?.[2]) * 100) / 100,
        var_mano_obra_pct:      Math.round(safeNum(moRow?.[2])  * 100) / 100,
        var_gastos_generales_pct: Math.round(safeNum(ggRow?.[2]) * 100) / 100,
        var_anual_pct:          Math.round(safeNum(ngRow[4])  * 100) / 100,
      },
    }
  } catch (err) {
    console.error('[fetchICC] Parse error:', err)
    return { data: null, error: `Error al procesar ICC de IDECBA: ${err}` }
  }
}
