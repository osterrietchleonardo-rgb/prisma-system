export interface BarrioData {
  barrio: string
  precio_m2_usd_2amb: number | null
  precio_m2_usd_3amb: number | null
  anio: number
  mes: number
}

export interface HistoricalMonthData {
  /** "YYYY-MM" */
  period: string
  /** Short label for chart axis, e.g. "Abr '26" */
  label: string
  /** Average USD/m² across all CABA barrios for that month */
  promedio_caba_usd: number
}

export interface BarriosResult {
  barrios: BarrioData[]
  promedio_caba_usd: number | null
  escrituras_count: number | null
  period: string | null
  /** Last 24 months of real CABA averages, sorted oldest → newest */
  historical: HistoricalMonthData[]
  error?: string
}

const BARRIOS_CSV_URL =
  'https://data.buenosaires.gob.ar/dataset/mercado-inmobiliario/resource/c6d2a64a-f60b-4b6e-9829-919139a0c1d1'

const ESCRITURAS_CSV_URL =
  'https://data.buenosaires.gob.ar/dataset/mercado-inmobiliario/resource/1f0580e0-9e91-49c3-9ecc-f22217efa042'

function tryParseFloat(val: string): number | null {
  if (!val || val.trim() === '' || val.trim() === '-') return null
  const n = parseFloat(val.replace(',', '.').trim())
  return isNaN(n) ? null : n
}

function decodeText(text: string): string {
  return text
    .replace(/\uFFFD/g, '')
    .replace(/Ã³/g, 'ó')
    .replace(/Ã©/g, 'é')
    .replace(/Ã¡/g, 'á')
    .replace(/Ã­/g, 'í')
    .replace(/Ãº/g, 'ú')
    .replace(/Ã±/g, 'ñ')
    .replace(/Ã\x80/g, 'À')
}

const MESES_ES = [
  '', 'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
]

function buildLabel(anio: number, mes: number): string {
  return `${MESES_ES[mes] ?? mes} '${String(anio).slice(-2)}`
}

async function fetchCSV(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      next: { revalidate: 86400, tags: ['mercado'] },
      headers: { Accept: 'text/csv,application/csv,text/plain,*/*' },
    })
    if (!res.ok) return null
    const buffer = await res.arrayBuffer()
    try {
      return decodeText(new TextDecoder('utf-8').decode(buffer))
    } catch {
      return decodeText(new TextDecoder('latin1').decode(buffer))
    }
  } catch {
    return null
  }
}

export async function fetchBarrios(): Promise<BarriosResult> {
  const [barriosCsv, escriturasCsv] = await Promise.all([
    fetchCSV(BARRIOS_CSV_URL),
    fetchCSV(ESCRITURAS_CSV_URL),
  ])

  // ── Aggregators ──────────────────────────────────────────────────────────
  // Per barrio for the LAST month
  const barriosMap: Record<string, { sum2: number; count2: number; sum3: number; count3: number }> = {}
  // Per month across ALL history: "YYYY-MM" → { sum, count }
  const monthlyMap: Record<string, { sum: number; count: number }> = {}

  let lastAnio = 0
  let lastMes = 0
  let parseError: string | undefined

  if (!barriosCsv) {
    parseError = 'No se pudo obtener el CSV de barrios'
  } else {
    const lines = barriosCsv.trim().split('\n').filter((l) => l.trim())
    if (lines.length < 2) {
      parseError = 'CSV de barrios vacío'
    } else {
      const sep = lines[0].includes(';') ? ';' : ','
      const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase().replace(/"/g, ''))

      const colBarrio    = headers.findIndex((h) => h.includes('barrio'))
      const colAnio      = headers.findIndex((h) => /^a[ñn]o$|^anio$|^año$/.test(h))
      const colMes       = headers.findIndex((h) => h === 'mes')
      const colAmbientes = headers.findIndex((h) => h.includes('ambiente'))
      const colPrecio    = headers.findIndex((h) => h.includes('precio') && h.includes('m2'))

      // Safety: if critical columns not found, try positional fallbacks
      const iBarrio    = colBarrio    >= 0 ? colBarrio    : 0
      const iAnio      = colAnio      >= 0 ? colAnio      : 1
      const iMes       = colMes       >= 0 ? colMes       : 2
      const iAmbientes = colAmbientes >= 0 ? colAmbientes : 3
      const iPrecio    = colPrecio    >= 0 ? colPrecio    : 4

      const dataRows = lines.slice(1).map((l) =>
        l.split(sep).map((v) => v.trim().replace(/"/g, ''))
      )

      // First pass: find the last month
      dataRows.forEach((row) => {
        const a = parseInt(row[iAnio] ?? '0')
        const m = parseInt(row[iMes] ?? '0')
        if (!a || !m) return
        if (a > lastAnio || (a === lastAnio && m > lastMes)) {
          lastAnio = a
          lastMes = m
        }
      })

      // Second pass: build both aggregators in a single loop
      dataRows.forEach((row) => {
        const a = parseInt(row[iAnio] ?? '0')
        const m = parseInt(row[iMes] ?? '0')
        if (!a || !m) return

        const precio = tryParseFloat(row[iPrecio] ?? '')
        if (precio === null || precio <= 0) return

        // ── Monthly historical aggregate (all months, all barrios, all ambientes) ──
        const key = `${a}-${String(m).padStart(2, '0')}`
        if (!monthlyMap[key]) monthlyMap[key] = { sum: 0, count: 0 }
        monthlyMap[key].sum += precio
        monthlyMap[key].count++

        // ── Per-barrio aggregate (only last month) ──
        if (a !== lastAnio || m !== lastMes) return
        const barrio = (row[iBarrio] ?? '').trim()
        if (!barrio) return
        const ambientes = parseInt(row[iAmbientes] ?? '0')
        if (!barriosMap[barrio]) barriosMap[barrio] = { sum2: 0, count2: 0, sum3: 0, count3: 0 }
        if (ambientes === 2) { barriosMap[barrio].sum2 += precio; barriosMap[barrio].count2++ }
        else if (ambientes === 3) { barriosMap[barrio].sum3 += precio; barriosMap[barrio].count3++ }
      })
    }
  }

  // ── Build barrios array (last month) ────────────────────────────────────
  const barrios: BarrioData[] = Object.entries(barriosMap).map(([barrio, v]) => ({
    barrio,
    precio_m2_usd_2amb: v.count2 > 0 ? Math.round(v.sum2 / v.count2) : null,
    precio_m2_usd_3amb: v.count3 > 0 ? Math.round(v.sum3 / v.count3) : null,
    anio: lastAnio,
    mes: lastMes,
  }))

  // CABA average (last month)
  const validPrices = barrios
    .map((b) => b.precio_m2_usd_2amb ?? b.precio_m2_usd_3amb)
    .filter((p): p is number => p !== null)
  const promedio_caba_usd =
    validPrices.length > 0
      ? Math.round(validPrices.reduce((a, b) => a + b, 0) / validPrices.length)
      : null

  // ── Build historical array ───────────────────────────────────────────────
  // Sort all period keys, take the last 24 months
  const sortedPeriods = Object.keys(monthlyMap).sort()
  const last24 = sortedPeriods.slice(-24)

  const historical: HistoricalMonthData[] = last24
    .filter((key) => monthlyMap[key].count > 0)
    .map((key) => {
      const [yyyy, mm] = key.split('-')
      const anio = parseInt(yyyy)
      const mes  = parseInt(mm)
      return {
        period: key,
        label: buildLabel(anio, mes),
        promedio_caba_usd: Math.round(monthlyMap[key].sum / monthlyMap[key].count),
      }
    })

  // ── Parse escrituras CSV ─────────────────────────────────────────────────
  let escrituras_count: number | null = null
  if (escriturasCsv) {
    const lines = escriturasCsv.trim().split('\n').filter((l) => l.trim())
    if (lines.length >= 2) {
      const sep = lines[0].includes(';') ? ';' : ','
      const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase().replace(/"/g, ''))
      const colCantidad = headers.findIndex(
        (h) => h.includes('cantidad') || h.includes('actos') || h.includes('escrituras')
      )
      const lastLine = lines[lines.length - 1].split(sep)
      if (colCantidad >= 0) escrituras_count = tryParseFloat(lastLine[colCantidad] ?? '')
    }
  }

  const period = lastAnio > 0 ? `${lastMes.toString().padStart(2, '0')}/${lastAnio}` : null

  return {
    barrios: barrios.sort((a, b) => a.barrio.localeCompare(b.barrio)),
    promedio_caba_usd,
    escrituras_count,
    period,
    historical,
    error: parseError,
  }
}
