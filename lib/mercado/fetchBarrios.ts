export interface BarrioData {
  barrio: string
  precio_m2_usd_2amb: number | null
  precio_m2_usd_3amb: number | null
  anio: number
  trimestre: number
}

export interface HistoricalMonthData {
  /** "YYYY-QN" */
  period: string
  /** Short label for chart axis, e.g. "T1 '24" */
  label: string
  /** Average USD/m² across all CABA barrios for that quarter */
  promedio_caba_usd: number
}

export interface BarriosResult {
  barrios: BarrioData[]
  promedio_caba_usd: number | null
  escrituras_count: number | null
  period: string | null
  /** Last 16 quarters of real CABA averages, sorted oldest → newest */
  historical: HistoricalMonthData[]
  error?: string
}

// Verified CDN URL — direct CSV from BA Data CDN (no redirect needed)
// Resource: "Precio de venta de departamentos" — dataset mercado-inmobiliario
const BARRIOS_CSV_URL =
  'https://cdn.buenosaires.gob.ar/datosabiertos/datasets/instituto-de-vivienda/mercado-inmobiliario/precio-venta-deptos.csv'

// NOTE: No public CSV exists for escrituras CABA (Colegio de Escribanos).
// The BA Data "actividad inmobiliaria" CSV is actually DDJJ de funcionarios (wrong resource).
// Escrituras count will be null until a valid public endpoint is available.

function tryParseFloat(val: string): number | null {
  if (!val || val.trim() === '' || val.trim() === '-') return null
  const n = parseFloat(val.replace(',', '.').trim())
  return isNaN(n) ? null : n
}

function decodeText(buffer: ArrayBuffer): string {
  // Try UTF-8 first, fall back to latin-1
  let text: string
  try {
    text = new TextDecoder('utf-8').decode(buffer)
  } catch {
    text = new TextDecoder('iso-8859-1').decode(buffer)
  }
  // Fix common double-encoding artifacts (Windows-1252 through latin1)
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

function buildLabel(anio: number, trimestre: number): string {
  return `T${trimestre} '${String(anio).slice(-2)}`
}

async function fetchCSV(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      // Cache 24 hours, revalidate on-demand
      next: { revalidate: 86400, tags: ['mercado'] },
      headers: {
        Accept: 'text/csv,application/csv,text/plain,*/*',
        'User-Agent': 'Mozilla/5.0 (compatible; PRISMA-System/1.0)',
      },
      redirect: 'follow',
    })
    if (!res.ok) {
      console.error(`[fetchCSV] HTTP ${res.status} for ${url}`)
      return null
    }
    const ct = res.headers.get('content-type') ?? ''
    // If we accidentally got HTML, bail out
    if (ct.includes('text/html')) {
      console.error(`[fetchCSV] Received HTML instead of CSV from ${url}`)
      return null
    }
    const buffer = await res.arrayBuffer()
    return decodeText(buffer)
  } catch (err) {
    console.error(`[fetchCSV] Network error for ${url}:`, err)
    return null
  }
}

export async function fetchBarrios(): Promise<BarriosResult> {
  // Only fetch the barrios CSV — escrituras has no valid public CSV endpoint
  const barriosCsv = await fetchCSV(BARRIOS_CSV_URL)
  const escriturasCsv: string | null = null

  // ── Aggregators ──────────────────────────────────────────────────────────
  // Per barrio for the LAST quarter
  const barriosMap: Record<string, { sum2: number; count2: number; sum3: number; count3: number }> = {}
  // Per quarter across ALL history: "YYYY-QN" → { sum, count }
  const quarterlyMap: Record<string, { sum: number; count: number }> = {}

  let lastAnio = 0
  let lastTrimestre = 0
  let parseError: string | undefined

  if (!barriosCsv) {
    parseError = 'No se pudo obtener el CSV de barrios de BA Data'
  } else {
    const lines = barriosCsv
      .trim()
      .split('\n')
      .filter((l) => l.trim() && !l.startsWith('#'))

    if (lines.length < 2) {
      parseError = 'CSV de barrios vacío o con formato incorrecto'
    } else {
      // BA Data uses semicolons as separator
      const sep = lines[0].includes(';') ? ';' : ','
      const rawHeaders = lines[0].split(sep).map((h) =>
        h.trim().toLowerCase().replace(/"/g, '').replace(/^\uFEFF/, '')
      )

      // Expected columns: barrio;año;trimestre;precio_prom;ambientes;estado;comuna
      const iBarrio    = rawHeaders.findIndex((h) => h.includes('barrio'))
      // "año" may arrive with encoding artifacts — match any 2-4 char header starting with 'a', ending with 'o'
      const iAnio      = rawHeaders.findIndex((h) =>
        /^a.{0,2}o$/.test(h) || h === 'anio' || h.startsWith('a\xf1o') || h.startsWith('a\ufffd')
      )
      const iTrimestre = rawHeaders.findIndex((h) => h.includes('trimestre'))
      const iPrecio    = rawHeaders.findIndex((h) => h.includes('precio'))
      const iAmbientes = rawHeaders.findIndex((h) => h.includes('ambiente'))

      if (iBarrio < 0 || iAnio < 0 || iTrimestre < 0 || iPrecio < 0) {
        parseError = `Columnas no encontradas en CSV de barrios. Headers: ${rawHeaders.join(',')}`
        console.error('[fetchBarrios]', parseError)
      } else {
        const dataRows = lines.slice(1).map((l) =>
          l.split(sep).map((v) => v.trim().replace(/"/g, ''))
        )

        // First pass: find the most recent quarter
        dataRows.forEach((row) => {
          const a = parseInt(row[iAnio] ?? '0')
          const t = parseInt(row[iTrimestre] ?? '0')
          if (!a || !t) return
          if (a > lastAnio || (a === lastAnio && t > lastTrimestre)) {
            lastAnio = a
            lastTrimestre = t
          }
        })

        // Second pass: aggregate both quarterly history and per-barrio snapshot
        dataRows.forEach((row) => {
          const a = parseInt(row[iAnio] ?? '0')
          const t = parseInt(row[iTrimestre] ?? '0')
          if (!a || !t) return

          const precio = tryParseFloat(row[iPrecio] ?? '')
          if (precio === null || precio <= 0) return

          // ── Quarterly historical aggregate ──
          const key = `${a}-Q${t}`
          if (!quarterlyMap[key]) quarterlyMap[key] = { sum: 0, count: 0 }
          quarterlyMap[key].sum += precio
          quarterlyMap[key].count++

          // ── Per-barrio aggregate (only last quarter) ──
          if (a !== lastAnio || t !== lastTrimestre) return
          const barrio = (row[iBarrio] ?? '').trim()
          if (!barrio) return

          const ambStr = (row[iAmbientes] ?? '').toLowerCase()
          const is2amb = ambStr.includes('2')
          const is3amb = ambStr.includes('3')

          if (!barriosMap[barrio]) barriosMap[barrio] = { sum2: 0, count2: 0, sum3: 0, count3: 0 }
          if (is2amb) { barriosMap[barrio].sum2 += precio; barriosMap[barrio].count2++ }
          else if (is3amb) { barriosMap[barrio].sum3 += precio; barriosMap[barrio].count3++ }
        })
      }
    }
  }

  // ── Build barrios array (last quarter) ────────────────────────────────────
  const barrios: BarrioData[] = Object.entries(barriosMap).map(([barrio, v]) => ({
    barrio,
    precio_m2_usd_2amb: v.count2 > 0 ? Math.round(v.sum2 / v.count2) : null,
    precio_m2_usd_3amb: v.count3 > 0 ? Math.round(v.sum3 / v.count3) : null,
    anio: lastAnio,
    trimestre: lastTrimestre,
  }))

  // CABA average (last quarter)
  const validPrices = barrios
    .map((b) => b.precio_m2_usd_2amb ?? b.precio_m2_usd_3amb)
    .filter((p): p is number => p !== null)
  const promedio_caba_usd =
    validPrices.length > 0
      ? Math.round(validPrices.reduce((a, b) => a + b, 0) / validPrices.length)
      : null

  // ── Build historical array ───────────────────────────────────────────────
  // Sort quarters: "2023-Q1", "2023-Q2", ... then take last 16 (= 4 years)
  const sortedQuarters = Object.keys(quarterlyMap).sort((a, b) => {
    const [ay, aq] = a.split('-Q').map(Number)
    const [by, bq] = b.split('-Q').map(Number)
    return ay !== by ? ay - by : aq - bq
  })
  const last16 = sortedQuarters.slice(-16)

  const historical: HistoricalMonthData[] = last16
    .filter((key) => quarterlyMap[key].count > 0)
    .map((key) => {
      const [yyyy, qStr] = key.split('-Q')
      const anio = parseInt(yyyy)
      const trimestre = parseInt(qStr)
      return {
        period: key,
        label: buildLabel(anio, trimestre),
        promedio_caba_usd: Math.round(quarterlyMap[key].sum / quarterlyMap[key].count),
      }
    })

  // ── Parse escrituras CSV ─────────────────────────────────────────────────
  let escrituras_count: number | null = null
  if (escriturasCsv) {
    try {
      const lines = escriturasCsv.trim().split('\n').filter((l) => l.trim())
      if (lines.length >= 2) {
        const sep = lines[0].includes(';') ? ';' : ','
        const headers = lines[0].split(sep).map((h) =>
          h.trim().toLowerCase().replace(/"/g, '').replace(/^\uFEFF/, '')
        )
        const colCantidad = headers.findIndex(
          (h) => h.includes('cantidad') || h.includes('actos') || h.includes('escrituras') || h.includes('total')
        )
        // Try the last non-empty line
        for (let i = lines.length - 1; i >= 1; i--) {
          const parts = lines[i].split(sep)
          if (colCantidad >= 0 && parts[colCantidad]) {
            const val = tryParseFloat(parts[colCantidad])
            if (val !== null && val > 0) {
              escrituras_count = Math.round(val)
              break
            }
          }
        }
      }
    } catch (err) {
      console.error('[fetchBarrios] Escrituras parse error:', err)
    }
  }

  const period =
    lastAnio > 0
      ? `T${lastTrimestre} ${lastAnio}`
      : null

  return {
    barrios: barrios.sort((a, b) => a.barrio.localeCompare(b.barrio)),
    promedio_caba_usd,
    escrituras_count,
    period,
    historical,
    error: parseError,
  }
}
