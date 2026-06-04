export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import * as XLSX from 'xlsx'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse-fork')

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
}

// ───────────────────────── helpers de parseo numérico ─────────────────────────

/** Entero con separador de miles tipo "2.460" / "834.178" → 2460 / 834178. */
function parseEntero(raw: string | null | undefined): number | null {
  if (!raw) return null
  const n = parseFloat(raw.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Porcentaje con decimal "2.4" o "2,4" → 2.4. No quita puntos (son decimales). */
function parsePct(raw: string | null | undefined): number | null {
  if (!raw) return null
  const n = parseFloat(raw.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

// Timeout por fetch: algunas URLs inexistentes (estadisticaciudad) cuelgan la
// conexión ~30s en vez de devolver 404. Cortamos rápido para no agotar maxDuration.
async function tryFetch(url: string, timeoutMs = 8000): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) return null
    return await res.arrayBuffer()
  } catch {
    return null
  }
}

/**
 * Devuelve el buffer de la PRIMERA url (en orden) que responde, procesando en
 * chunks paralelos para acotar tiempo y concurrencia. null si ninguna responde.
 */
async function firstHit(
  urls: string[],
  concurrency = 10,
  timeoutMs = 8000
): Promise<{ url: string; buffer: ArrayBuffer } | null> {
  for (let i = 0; i < urls.length; i += concurrency) {
    const chunk = urls.slice(i, i + concurrency)
    const settled = await Promise.all(
      chunk.map(async (url) => ({ url, buffer: await tryFetch(url, timeoutMs) }))
    )
    const hit = settled.find((r) => r.buffer) // respeta el orden dentro del chunk
    if (hit && hit.buffer) return { url: hit.url, buffer: hit.buffer }
  }
  return null
}

// ════════════════════════════════ 1. ICC ══════════════════════════════════════
// Fuente: estadisticaciudad.gob.ar (XLSX mensual). La carpeta de WordPress NO
// coincide con el mes del reporte, por eso se lee el período del propio archivo.

interface SourceStatus {
  status: 'ok' | 'fallback' | 'error'
  periodo?: string
  message?: string
  [k: string]: unknown
}

const MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** "Abril de 2026" → ordinal comparable (2026*12+3). -1 si no parsea. */
function periodoOrdinal(periodo: string): number {
  const m = periodo.toLowerCase().match(/(\w+)\s+de\s+(\d{4})/)
  if (!m) return -1
  const mes = MESES_ES.indexOf(m[1])
  if (mes < 0) return -1
  return Number(m[2]) * 12 + mes
}

async function syncICC(supabase: ReturnType<typeof createAdminClient>): Promise<SourceStatus> {
  const now = new Date()
  try {
    // Probar 6 carpetas en paralelo (las URLs inexistentes cuelgan ~8s c/u).
    const urls: string[] = []
    for (let i = 0; i <= 5; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      urls.push(`https://www.estadisticaciudad.gob.ar/eyc/wp-content/uploads/${d.getFullYear()}/${mm}/EE_ICC_01-16.xlsx`)
    }
    const buffers = await Promise.all(urls.map((u) => tryFetch(u)))

    // Parsear cada archivo encontrado y quedarnos con el período más reciente.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mejor: { indiceTiempo: string; rows: any[][]; ord: number } | null = null
    for (const buf of buffers) {
      if (!buf) continue
      const wb = XLSX.read(Buffer.from(buf), { type: 'buffer' })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })
      const periodoMatch = String(rows[0]?.[0] ?? '').match(/(\w+ de \d{4})\s*$/)
      const indiceTiempo = periodoMatch?.[1]
      if (!indiceTiempo || !Number.isFinite(Number(rows[3]?.[1]))) continue
      const ord = periodoOrdinal(indiceTiempo)
      if (!mejor || ord > mejor.ord) mejor = { indiceTiempo, rows, ord }
    }

    if (!mejor) return { status: 'fallback', message: 'No se encontró XLSX reciente; se conserva el dato en DB' }

    // Layout verificado: fila 3 nivel general, 4 materiales, 5 mano de obra, 6 gastos.
    // Columnas: [1]=índice, [2]=var mensual, [4]=interanual.
    const r = mejor.rows
    const { error } = await supabase
      .from('mercado_icc')
      .update({
        indice_tiempo: mejor.indiceTiempo,
        icc_nivel_general: Number(r[3]?.[1]),
        icc_materiales: Number(r[4]?.[1]) || null,
        icc_mano_obra: Number(r[5]?.[1]) || null,
        icc_gastos_generales: Number(r[6]?.[1]) || null,
        var_nivel_general_pct: Number(r[3]?.[2]) ?? null,
        var_materiales_pct: Number(r[4]?.[2]) ?? null,
        var_mano_obra_pct: Number(r[5]?.[2]) ?? null,
        var_gastos_generales_pct: Number(r[6]?.[2]) ?? null,
        var_anual_pct: Number(r[3]?.[4]) ?? null,
        fecha_actualizacion: new Date().toISOString(),
      })
      .eq('id', 1)

    if (error) throw error
    return { status: 'ok', periodo: mejor.indiceTiempo }
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) }
  }
}

// ════════════════════════════════ 2. ZONAPROP ═════════════════════════════════
// Fuente: PDFs zpindex. Regla de URL verificada: los datos del mes N se publican
// en la carpeta del mes N+1.

// `key` = prefijo del id (PK de texto). `zona` = nombre display que ya usa la DB.
const ZONAS_STANDARD = [
  { key: 'CABA', zona: 'CABA', slug: 'INDEX_CABA_REPORTE' },
  { key: 'GBA_NORTE', zona: 'GBA Norte', slug: 'INDEX_GBA_NORTE_REPORTE' },
  { key: 'GBA_OESTE', zona: 'GBA Oeste', slug: 'INDEX_GBA_OESTE_REPORTE' },
]

interface ZonaParsed {
  precio_m2_venta_usd: number | null
  variacion_mensual_pct: number | null
  variacion_anual_pct: number | null
  precio_alquiler_2amb_ars: number | null
  precio_alquiler_3amb_ars: number | null
}

/**
 * Parser conservador: solo extrae lo que está anclado de forma inequívoca.
 * Lo que no se puede determinar con certeza queda en null (regla: cero inventado).
 */
async function parsearZonaPDF(buffer: Buffer): Promise<ZonaParsed | null> {
  const { text } = await pdfParse(buffer)
  if (!text) return null

  // Precio m² — ancla fuerte: "USD 2.460 por m2"
  const precioMatch = text.match(/USD\s*([\d.,]+)\s*por\s*m2/i)
  const precio = parseEntero(precioMatch?.[1])
  if (precio === null) return null // sin precio confiable, no vale la pena grabar

  // Variación interanual — anclada a "últimos 12/doce meses", con detección de signo.
  let varAnual: number | null = null
  const anualMatch = text.match(
    /[úu]ltimos\s+(?:12|doce)\s+meses[^%]{0,40}?\b(sube|aumenta|registra|crece|cae|baja|disminuye|ca[íi]da)\b[^%\d+-]*([+-]?[\d.,]+)\s*%/i
  )
  if (anualMatch) {
    const base = parsePct(anualMatch[2])
    if (base !== null) {
      const negativo = /cae|baja|disminuye|ca[íi]da/i.test(anualMatch[1])
      varAnual = negativo ? -Math.abs(base) : base
    }
  }

  // Variación mensual — solo desde la oración del precio. "estable" = 0 (dato real).
  let varMensual: number | null = null
  if (precioMatch) {
    const idx = text.indexOf(precioMatch[0])
    const seg = text.slice(idx, idx + 200)
    if (/estable/i.test(seg)) {
      varMensual = 0
    } else {
      const mm = seg.match(/\b(sube|aumenta|cae|baja|disminuye)\b[^%\d+-]*([+-]?[\d.,]+)\s*%\s+en\s+(?:el\s+mes|[a-zé]+)/i)
      if (mm) {
        const base = parsePct(mm[2])
        if (base !== null) varMensual = /cae|baja|disminuye/i.test(mm[1]) ? -Math.abs(base) : base
      }
    }
  }

  // Alquiler 2 y 3 ambientes — anclado a "ambientes ... $ X por mes".
  const alq2 = text.match(/(?:2|dos)\s+ambientes[^$]{0,60}\$\s*([\d.,]+)\s*por\s*mes/i)
  const alq3 = text.match(/(?:3|tres)\s+ambientes[^$]{0,60}\$\s*([\d.,]+)\s*por\s*mes/i)

  return {
    precio_m2_venta_usd: precio,
    variacion_mensual_pct: varMensual,
    variacion_anual_pct: varAnual,
    precio_alquiler_2amb_ars: parseEntero(alq2?.[1]),
    precio_alquiler_3amb_ars: parseEntero(alq3?.[1]),
  }
}

function periodoURLs(slug: string, monthsBack: number) {
  const now = new Date()
  const out: { periodo: string; url: string }[] = []
  for (let i = 0; i <= monthsBack; i++) {
    const dato = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const pub = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
    const dYYYY = dato.getFullYear()
    const dMM = String(dato.getMonth() + 1).padStart(2, '0')
    const pYYYY = pub.getFullYear()
    const pMM = String(pub.getMonth() + 1).padStart(2, '0')
    out.push({
      periodo: `${dYYYY}-${dMM}`,
      url: `https://www.zonaprop.com.ar/blog/wp-content/uploads/${pYYYY}/${pMM}/${slug}_${dYYYY}-${dMM}.pdf`,
    })
  }
  return out
}

async function fetchZonaStandard(slug: string) {
  // Una URL por mes (más reciente primero). Paralelo: meses no publicados fallan rápido.
  const periodos = periodoURLs(slug, 3)
  const hit = await firstHit(periodos.map((p) => p.url))
  if (!hit) return null
  const parsed = await parsearZonaPDF(Buffer.from(hit.buffer))
  if (!parsed) return null
  const periodo = periodos.find((p) => p.url === hit.url)!.periodo
  return { ...parsed, periodo, url: hit.url }
}

// GBA Sur: el nombre del archivo incluye el día de creación (ej. ..._2026-04-2.pdf).
// Barre día 1–28 EN PARALELO. Si se conoce el período publicado (de las zonas
// estándar), barre SOLO ese mes; evita sondear meses no publicados (costoso).
async function fetchGBASur(targetPeriodo?: string | null) {
  const slug = 'INDEX_GBA_SUR_REPORTE'
  const candidatosMes = targetPeriodo
    ? periodoURLs(slug, 6).filter((p) => p.periodo === targetPeriodo)
    : periodoURLs(slug, 3)

  for (const { periodo, url } of candidatosMes) {
    const base = url.replace(/\.pdf$/, '')
    const candidates = [url, ...Array.from({ length: 28 }, (_, k) => `${base}-${k + 1}.pdf`)]
    const hit = await firstHit(candidates)
    if (!hit) continue
    const parsed = await parsearZonaPDF(Buffer.from(hit.buffer))
    if (parsed) return { ...parsed, periodo, url: hit.url }
  }
  return null
}

async function upsertZona(
  supabase: ReturnType<typeof createAdminClient>,
  key: string,
  zona: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
): Promise<SourceStatus> {
  if (!data) return { status: 'fallback', message: 'PDF no disponible; se conserva el dato en DB' }
  // `id` es PK de texto; una fila por (zona, mes) → histórico. Mantener consistente.
  const { error } = await supabase.from('mercado_zonas').upsert(
    {
      id: `${key}_${data.periodo}`,
      zona,
      precio_m2_venta_usd: data.precio_m2_venta_usd,
      variacion_mensual_pct: data.variacion_mensual_pct,
      variacion_anual_pct: data.variacion_anual_pct,
      precio_alquiler_2amb_ars: data.precio_alquiler_2amb_ars,
      precio_alquiler_3amb_ars: data.precio_alquiler_3amb_ars,
      mes_reporte: data.periodo,
      url_pdf: data.url,
      fecha_actualizacion: new Date().toISOString(),
    },
    { onConflict: 'zona,mes_reporte' }
  )
  if (error) return { status: 'error', message: error.message }
  return { status: 'ok', periodo: data.periodo }
}

async function syncZonaprop(
  supabase: ReturnType<typeof createAdminClient>
): Promise<Record<string, SourceStatus>> {
  // 1) Zonas estándar en paralelo (1 fetch por mes, rápido).
  const estandar = await Promise.all(
    ZONAS_STANDARD.map(async ({ key, zona, slug }) => {
      const data = await fetchZonaStandard(slug)
      return { key, status: await upsertZona(supabase, key, zona, data), periodo: data?.periodo }
    })
  )

  // 2) GBA Sur: barre días solo del período ya confirmado por las estándar.
  const targetPeriodo = estandar.find((e) => e.periodo)?.periodo ?? null
  const surData = await fetchGBASur(targetPeriodo)
  const sur = await upsertZona(supabase, 'GBA_SUR', 'GBA Sur', surData)

  const out: Record<string, SourceStatus> = { GBA_SUR: sur }
  for (const e of estandar) out[e.key] = e.status
  return out
}

// ════════════════════════════════ 3. MUDAFY ═══════════════════════════════════
// Fuente: tabla HTML estática "Barrio | Comuna | Valor m2 (USD)". Solo actualiza
// precio_m2_usd (precio de oferta). No toca precio_cierre_m2_usd (otra fuente).

async function syncMudafy(
  supabase: ReturnType<typeof createAdminClient>
): Promise<SourceStatus> {
  try {
    const res = await fetch('https://mudafy.com.ar/d/valor-metro-cuadrado-en-caba-por-barrio', {
      headers: BROWSER_HEADERS,
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return { status: 'fallback', message: `HTTP ${res.status}; se conserva la DB` }
    const html = await res.text()

    const filas = Array.from(html.matchAll(/<tr[\s\S]*?<\/tr>/gi))
      .map((m) => m[0].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim())
      .filter((t) => /Comuna\s+\d+/.test(t)) // descarta header

    // "Palermo Comuna 14 $2,631"  |  "Villa Crespo Comuna 15 $1,952"
    const parsed = filas
      .map((fila) => fila.match(/^(.+?)\s+Comuna\s+\d+\s+\$\s*([\d.,]+)/i))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => ({ barrio: m[1].trim(), precio: parseEntero(m[2].replace(/,/g, '.')) }))
      .filter((b) => b.barrio && b.precio !== null)

    // UPDATE por barrio (no crea filas; no requiere constraint), en chunks paralelos.
    let actualizados = 0
    const stamp = new Date().toISOString()
    for (let i = 0; i < parsed.length; i += 10) {
      const chunk = parsed.slice(i, i + 10)
      const res = await Promise.all(
        chunk.map(({ barrio, precio }) =>
          supabase
            .from('mercado_barrios')
            .update({ precio_m2_usd: precio, fuente: 'Mudafy', fecha_actualizacion: stamp }, { count: 'exact' })
            .eq('barrio', barrio)
        )
      )
      actualizados += res.reduce((acc, r) => acc + (!r.error && r.count ? r.count : 0), 0)
    }

    if (actualizados === 0) {
      return { status: 'fallback', message: 'No se pudo mapear ningún barrio; se conserva la DB' }
    }
    return { status: 'ok', message: `${actualizados} barrios actualizados`, barrios_actualizados: actualizados }
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) }
  }
}

// ════════════════════════════════ ENDPOINT ════════════════════════════════════

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const secret = searchParams.get('secret')
  if (process.env.NODE_ENV === 'production' && secret && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Cada fuente es independiente: el fallo de una no afecta a las demás.
  const [icc, zonaprop, mudafy] = await Promise.all([
    syncICC(supabase),
    syncZonaprop(supabase),
    syncMudafy(supabase),
  ])

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    results: { icc, zonaprop, mudafy },
  })
}
