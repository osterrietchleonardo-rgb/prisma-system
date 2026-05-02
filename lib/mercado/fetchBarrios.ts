// ──────────────────────────────────────────────────────────────────────────────
// fetchBarrios.ts
// Source: IDECBA / GCBA — Precio promedio de publicación del m² (USD)
//         Departamentos en venta 2 ambientes a estrenar, por barrio CABA
// URL: https://www.estadisticaciudad.gob.ar/eyc/wp-content/uploads/2025/12/MI_DVP_AX01.xlsx
// Coverage: Q4 2006 → Q1 2026  (updated ~quarterly)
// ──────────────────────────────────────────────────────────────────────────────
import * as XLSX from 'xlsx'

export interface BarrioData {
  barrio: string
  precio_m2_usd: number | null
  /** e.g. "Q1 2026" */
  period: string
}

export interface HistoricalMonthData {
  period: string   // "YYYY-QN"
  label: string    // "T1 '26"
  promedio_caba_usd: number
}

export interface BarriosResult {
  barrios: BarrioData[]
  promedio_caba_usd: number | null
  escrituras_count: number | null
  escrituras_year?: number | null
  escrituras_var?: number | null
  period: string | null
  historical: HistoricalMonthData[]
  error?: string
}

const XLSX_URL =
  'https://www.estadisticaciudad.gob.ar/eyc/wp-content/uploads/2025/12/MI_DVP_AX01.xlsx'

// How many of the most-recent quarters to include in the chart
const HISTORY_QUARTERS = 16

async function fetchBuffer(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url, {
      next: { revalidate: 86400, tags: ['mercado'] },
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PRISMA-System/1.0)' },
      redirect: 'follow',
    })
    if (!res.ok) {
      console.error(`[fetchBarrios] HTTP ${res.status} for ${url}`)
      return null
    }
    return res.arrayBuffer()
  } catch (err) {
    console.error('[fetchBarrios] Network error:', err)
    return null
  }
}

function trimLabel(q: number, y: number): string {
  return `T${q} '${String(y).slice(-2)}`
}

export async function fetchBarrios(): Promise<BarriosResult> {
  const buffer = await fetchBuffer(XLSX_URL)
  if (!buffer) {
    return {
      barrios: [],
      promedio_caba_usd: null,
      escrituras_count: null,
      period: null,
      historical: [],
      error: 'No se pudo descargar el archivo XLSX de IDECBA',
    }
  }

  try {
    const wb = XLSX.read(Buffer.from(buffer), { type: 'buffer' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const rows: (string | number)[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
    })

    // ── Scanning for Header Row ──────────────────────────────────────────────
    // We look for the row that contains "1er. trim." or "2do. trim."
    let headerRowIdx = -1
    for (let i = 0; i < Math.min(20, rows.length); i++) {
      if (rows[i]?.some(cell => String(cell).includes("trim."))) {
        headerRowIdx = i
        break
      }
    }

    if (headerRowIdx === -1) {
      throw new Error('No se pudo encontrar la fila de encabezados (trimestres) en el XLSX')
    }

    const qRow = rows[headerRowIdx]
    const yearRow = rows[headerRowIdx - 1] || []

    // Build ordered list of { colIndex, year, quarter, label, periodKey }
    interface ColDef { col: number; year: number; q: number; label: string; key: string }
    const colDefs: ColDef[] = []

    let currentYear = 0
    for (let c = 1; c < qRow.length; c++) {
      // If the cell above has a year, update currentYear
      const y = yearRow[c]
      if (typeof y === 'number' && y > 2000) currentYear = y
      // If we don't have a year yet, try to find the nearest one to the left
      if (currentYear === 0) {
        for (let prevC = c - 1; prevC >= 1; prevC--) {
          const py = yearRow[prevC]
          if (typeof py === 'number' && py > 2000) {
            currentYear = py
            break
          }
        }
      }

      const qStr = String(qRow[c] ?? '')
      let q = 0
      if (qStr.includes('1er')) q = 1
      else if (qStr.includes('2do')) q = 2
      else if (qStr.includes('3er')) q = 3
      else if (qStr.includes('4to')) q = 4

      if (currentYear > 0 && q > 0) {
        colDefs.push({
          col: c,
          year: currentYear,
          q,
          label: trimLabel(q, currentYear),
          key: `${currentYear}-Q${q}`,
        })
      }
    }

    if (colDefs.length === 0) {
      throw new Error('No se pudieron identificar columnas de trimestres válidas')
    }

    const latestCol = colDefs[colDefs.length - 1]
    const latestPeriod = `T${latestCol.q} ${latestCol.year}`

    // ── Parse Data Rows ──────────────────────────────────────────────────────
    // Find the "Total" row to get CABA average
    const totalRowIdx = rows.findIndex(r => String(r[0] ?? '').trim().toLowerCase() === 'total')
    const totalRow = totalRowIdx !== -1 ? rows[totalRowIdx] : null
    const totalVal = totalRow ? totalRow[latestCol.col] : null
    const promedio_caba_usd = typeof totalVal === 'number' && totalVal > 0 ? Math.round(totalVal) : null

    // Barrios are usually after the header and "Total" rows
    // We start from headerRowIdx + 1 and look for rows that have a name in Col 0 and a number in latestCol.col
    const SKIP = ['', 'Barrio', 'Total', 'Fuente', '*', 'Nota', 'Ciudad de Buenos Aires']
    const barrios: BarrioData[] = []

    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const row = rows[i]
      const name = String(row[0] ?? '').trim()
      
      // Basic validation: name exists, isn't in SKIP, and isn't just metadata
      if (name.length > 1 && !SKIP.some(s => name.startsWith(s))) {
        const rawVal = row[latestCol.col]
        const precio = typeof rawVal === 'number' && rawVal > 0 ? Math.round(rawVal) : null
        
        // If we found a numeric value, it's definitely a barrio data row
        if (precio !== null) {
          barrios.push({
            barrio: name,
            precio_m2_usd: precio,
            period: latestPeriod
          })
        }
      }
    }

    // ── Build historical series (last N quarters, from "Total" row) ──────────
    const recentCols = colDefs.slice(-HISTORY_QUARTERS)
    const historical: HistoricalMonthData[] = recentCols
      .filter((c) => {
        const v = totalRow ? totalRow[c.col] : null
        return typeof v === 'number' && v > 0
      })
      .map((c) => ({
        period: c.key,
        label: c.label,
        promedio_caba_usd: Math.round((totalRow![c.col] as number)),
      }))

    return {
      barrios: barrios
        .filter((b) => b.precio_m2_usd !== null)
        .sort((a, b) => a.barrio.localeCompare(b.barrio)),
      promedio_caba_usd,
      escrituras_count: null, // fetched separately via fetchEscrituras
      period: latestPeriod,
      historical,
    }
  } catch (err) {
    console.error('[fetchBarrios] Parse error:', err)
    return {
      barrios: [],
      promedio_caba_usd: null,
      escrituras_count: null,
      period: null,
      historical: [],
      error: `Error al procesar datos de IDECBA: ${err}`,
    }
  }
}
