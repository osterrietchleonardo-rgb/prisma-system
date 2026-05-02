import { NextResponse } from 'next/server'

// pdf-parse-fork is already installed
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse-fork')

interface ZonapropZona {
  zona: string
  slug: string
}

const ZONAS: ZonapropZona[] = [
  { zona: 'CABA', slug: 'CABA' },
  { zona: 'GBA Norte', slug: 'GBA_NORTE' },
  { zona: 'GBA Oeste', slug: 'GBA_OESTE' },
  { zona: 'Córdoba', slug: 'CBA' },
  { zona: 'Rosario', slug: 'ROS' },
]

export interface ZonaResult {
  zona: string
  mes_reporte: string | null
  url_pdf: string | null
  precio_m2_venta_usd: number | null
  variacion_mensual_pct: number | null
  variacion_anual_pct: number | null
  precio_alquiler_2amb_ars: number | null
  precio_alquiler_3amb_ars: number | null
  barrios: { nombre: string; precio_m2_usd: number; variacion_pct: number | null }[]
  fuente: 'zonaprop'
  parseado_ok: boolean
  error?: string
}

function buildPdfUrl(slug: string, year: number, month: number): string {
  const mm = month.toString().padStart(2, '0')
  const yyyy = year.toString()
  return `https://zonaprop.com.ar/blog/wp-content/uploads/${yyyy}/${mm}/INDEX_${slug}_REPORTE_${yyyy}-${mm}.pdf`
}

function extractPrice(text: string, patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      const raw = match[1].replace(/\./g, '').replace(',', '.')
      const val = parseFloat(raw)
      if (!isNaN(val) && val > 0) return val
    }
  }
  return null
}

function extractVariacion(text: string): number | null {
  const patterns = [
    /([+-]?\d{1,2}[,.]?\d{0,2})\s*%/,
    /variaci[oó]n[^%\d]{0,30}([+-]?\d{1,2}[,.]?\d{0,2})\s*%/i,
  ]
  for (const p of patterns) {
    const m = text.match(p)
    if (m) {
      const val = parseFloat(m[1].replace(',', '.'))
      if (!isNaN(val)) return val
    }
  }
  return null
}

async function tryFetchPdf(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PRISMA-SYSTEM/1.0)' },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('pdf') && !ct.includes('octet')) return null
    return await res.arrayBuffer()
  } catch {
    return null
  }
}

async function parseZona(zona: ZonapropZona): Promise<ZonaResult> {
  const now = new Date()
  let year = now.getFullYear()
  let month = now.getMonth() + 1 // 1-based

  let pdfBuffer: ArrayBuffer | null = null
  let usedUrl = ''
  let mesReporte: string | null = null

  // Try current month, then previous month
  for (let attempt = 0; attempt < 2; attempt++) {
    const url = buildPdfUrl(zona.slug, year, month)
    pdfBuffer = await tryFetchPdf(url)
    if (pdfBuffer) {
      usedUrl = url
      mesReporte = `${year}-${month.toString().padStart(2, '0')}`
      break
    }
    // Go one month back
    month--
    if (month === 0) {
      month = 12
      year--
    }
  }

  if (!pdfBuffer) {
    return {
      zona: zona.zona,
      mes_reporte: null,
      url_pdf: buildPdfUrl(zona.slug, now.getFullYear(), now.getMonth() + 1),
      precio_m2_venta_usd: null,
      variacion_mensual_pct: null,
      variacion_anual_pct: null,
      precio_alquiler_2amb_ars: null,
      precio_alquiler_3amb_ars: null,
      barrios: [],
      fuente: 'zonaprop',
      parseado_ok: false,
      error: 'PDF no disponible este mes',
    }
  }

  try {
    const pdfData = await pdfParse(Buffer.from(pdfBuffer))
    const texto = pdfData.text ?? ''

    if (!texto || texto.trim().length < 50) {
      return {
        zona: zona.zona,
        mes_reporte: mesReporte,
        url_pdf: usedUrl,
        precio_m2_venta_usd: null,
        variacion_mensual_pct: null,
        variacion_anual_pct: null,
        precio_alquiler_2amb_ars: null,
        precio_alquiler_3amb_ars: null,
        barrios: [],
        fuente: 'zonaprop',
        parseado_ok: false,
        error: 'PDF sin texto extraíble (posiblemente escaneado)',
      }
    }

    // Extract precio m2 venta USD
    const precio_m2_venta_usd = extractPrice(texto, [
      /USD\s*([\d.,]+)/i,
      /U\$S\s*([\d.,]+)/i,
      /precio.{0,30}([\d.,]{3,7})\s*USD/i,
      /\$([\d.,]+)\s*USD/i,
    ])

    // Extract alquiler ARS
    const precio_alquiler_2amb_ars = extractPrice(texto, [
      /2\s*amb[^$\n]{0,20}\$([\d.,]+)/i,
      /\$([\d.,]+)\s*2\s*amb/i,
    ])
    const precio_alquiler_3amb_ars = extractPrice(texto, [
      /3\s*amb[^$\n]{0,20}\$([\d.,]+)/i,
      /\$([\d.,]+)\s*3\s*amb/i,
    ])

    // Extract variaciones
    const lines = texto.split('\n').map((l: string) => l.trim()).filter((l: string) => l)
    const varLine = lines.find((l: string) =>
      l.match(/variaci[oó]n/i) || l.match(/[+-]\d+[,.]?\d*\s*%/)
    )
    const variacion_mensual_pct = varLine ? extractVariacion(varLine) : null
    const variacion_anual_pct = null // Usually requires more complex extraction

    return {
      zona: zona.zona,
      mes_reporte: mesReporte,
      url_pdf: usedUrl,
      precio_m2_venta_usd,
      variacion_mensual_pct,
      variacion_anual_pct,
      precio_alquiler_2amb_ars,
      precio_alquiler_3amb_ars,
      barrios: [],
      fuente: 'zonaprop',
      parseado_ok: precio_m2_venta_usd !== null || variacion_mensual_pct !== null,
    }
  } catch (err) {
    console.error(`[zonaprop] Parse error for ${zona.zona}:`, err)
    return {
      zona: zona.zona,
      mes_reporte: mesReporte,
      url_pdf: usedUrl,
      precio_m2_venta_usd: null,
      variacion_mensual_pct: null,
      variacion_anual_pct: null,
      precio_alquiler_2amb_ars: null,
      precio_alquiler_3amb_ars: null,
      barrios: [],
      fuente: 'zonaprop',
      parseado_ok: false,
      error: 'Error al procesar el PDF',
    }
  }
}

export async function GET() {
  try {
    const results = await Promise.all(ZONAS.map(parseZona))
    return NextResponse.json(results, {
      headers: {
        'Cache-Control': 's-maxage=86400, stale-while-revalidate=3600',
      },
    })
  } catch (error) {
    console.error('[zonaprop route] Error:', error)
    return NextResponse.json(
      { error: 'Error procesando reportes Zonaprop' },
      { status: 500 }
    )
  }
}
