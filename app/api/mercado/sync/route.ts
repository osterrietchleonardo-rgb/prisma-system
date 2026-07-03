export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncUcema } from '@/lib/mercado/ucemaSync'
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
    // Timeout corto: las carpetas de meses inexistentes cuelgan; el archivo válido
    // responde en ~200ms. 5s mantiene la función < 10s (Vercel Hobby).
    const buffers = await Promise.all(urls.map((u) => tryFetch(u, 5000)))

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

  // Precio m² — ancla fuerte. Algunos PDFs usan "m²" (superíndice) en vez de
  // "m2". Preferir la oración del precio medio de departamentos: el match
  // genérico puede caer en el heat map ("máximo en Puerto Madero con USD 6.152").
  const precioMatch =
    text.match(/precio\s+medio\s+de\s+los\s+departamentos[\s\S]{0,80}?USD\s*([\d.,]+)\s*por\s*m[2²]/i) ??
    text.match(/USD\s*([\d.,]+)\s*por\s*m[2²]/i)
  const precio = parseEntero(precioMatch?.[1])
  if (precio === null) return null // sin precio confiable, no vale la pena grabar

  // Variación interanual — anclada a "últimos 12/doce meses", con detección de
  // signo. Se descartan los "incrementos nominales" (van en pesos, no USD).
  let varAnual: number | null = null
  const anualMatch = text.match(
    /[úu]ltimos\s+(?:12|doce)\s+meses[^%]{0,40}?\b(sube|aumenta|registra|crece|cae|baja|disminuye|ca[íi]da)\b[^%\d+-]*([+-]?[\d.,]+)\s*%/i
  )
  if (anualMatch && !/nominal/i.test(anualMatch[0])) {
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
    const seg = text.slice(idx, idx + 250)
    // redacción nueva: "con una suba/baja mensual de 0.2%"
    const mensualDe = seg.match(/\b(suba|baja|ca[íi]da)\s+mensual\s+de\s+([+-]?[\d.,]+)\s*%/i)
    if (mensualDe) {
      const base = parsePct(mensualDe[2])
      if (base !== null) varMensual = /baja|ca[íi]da/i.test(mensualDe[1]) ? -Math.abs(base) : base
    } else if (/estable/i.test(seg)) {
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

/** Sincroniza UNA zona (para el endpoint por-fuente, que mantiene cada función <10s). */
async function syncZonaByKey(
  supabase: ReturnType<typeof createAdminClient>,
  key: string,
  periodo?: string | null
): Promise<SourceStatus> {
  if (key === 'GBA_SUR') {
    return upsertZona(supabase, 'GBA_SUR', 'GBA Sur', await fetchGBASur(periodo))
  }
  const z = ZONAS_STANDARD.find((z) => z.key === key)
  if (!z) return { status: 'error', message: `zona desconocida: ${key}` }
  return upsertZona(supabase, z.key, z.zona, await fetchZonaStandard(z.slug))
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

// ════════════════════════════════ 4. ESCRITURAS ═══════════════════════════════
// Fuente: Colegio de Escribanos CABA. Un post por mes con los actos de compraventa.
// Esquema mensual en `mercado_escrituras` (requiere migración). Histórico acumulado.

const MESES_NUM: Record<string, string> = {
  enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06',
  julio: '07', agosto: '08', septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12',
}

function limpiarHTML(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#8211;/g, '–')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

interface EscrituraMes {
  periodo: string
  label: string
  cantidad_mensual: number
  monto_millones_ars: number | null
  var_mensual_pct: number | null
  var_anual_pct: number | null
}

function parsearArticuloEscrituras(url: string, html: string): EscrituraMes | null {
  const mesU = url.match(/realizadas-en-([a-z]+)-(\d{4})/i)
  if (!mesU || !MESES_NUM[mesU[1].toLowerCase()]) return null
  const periodo = `${mesU[2]}-${MESES_NUM[mesU[1].toLowerCase()]}`
  const label = `${mesU[1][0].toUpperCase()}${mesU[1].slice(1).toLowerCase()} ${mesU[2]}`

  const txt = limpiarHTML(html)
  const actos = parseEntero((txt.match(/Actos de escrituras de compraventa\s+([\d.]+)/i) || [])[1])
  if (actos === null) return null // sin el dato central, no se graba

  const monto = parseEntero((txt.match(/\$\s*([\d.]+)\s*millones/i) || [])[1])

  // Var mensual: "los actos bajaron/subieron un 2,1%"
  let varMensual: number | null = null
  const vm = txt.match(/actos\s+(bajaron|subieron|cayeron|aumentaron|crecieron)\s+(?:un\s+)?([\d,]+)\s*%/i)
  if (vm) varMensual = (/bajaron|cayeron/i.test(vm[1]) ? -1 : 1) * (parsePct(vm[2]) ?? 0)

  // Var interanual: "empate" → 0 ; o explícito junto a "interanual".
  let varAnual: number | null = null
  const ia = txt.match(/interanual[^%\d]{0,40}(suba|baja|aument\w+|ca[ií]da|cay\w+)?\s*(?:de\s+)?([\d,]+)\s*%/i)
  if (ia) {
    const b = parsePct(ia[2]) ?? 0
    varAnual = /baja|ca[ií]da|cay/i.test(ia[1] || '') ? -b : b
  } else if (/empate|empatad/i.test(txt)) {
    varAnual = 0
  }

  return { periodo, label, cantidad_mensual: actos, monto_millones_ars: monto, var_mensual_pct: varMensual, var_anual_pct: varAnual }
}

async function syncEscrituras(supabase: ReturnType<typeof createAdminClient>): Promise<SourceStatus> {
  try {
    const catRes = await fetch(
      'https://www.colegio-escribanos.org.ar/category/estadisticas-de-escrituras/',
      { headers: BROWSER_HEADERS, cache: 'no-store', signal: AbortSignal.timeout(8000) }
    )
    if (!catRes.ok) return { status: 'fallback', message: `categoría HTTP ${catRes.status}; se conserva la DB` }
    const catHtml = await catRes.text()

    const links = Array.from(
      new Set(
        Array.from(
          catHtml.matchAll(/href="([^"]+cantidad-de-escrituras-de-compraventa[^"]+)"/gi)
        ).map((m) => m[1])
      )
    ).slice(0, 8) // últimos ~8 meses; idempotente, acumula histórico

    if (links.length === 0) return { status: 'fallback', message: 'sin artículos; se conserva la DB' }

    const meses: EscrituraMes[] = []
    for (let i = 0; i < links.length; i += 6) {
      const chunk = links.slice(i, i + 6)
      const htmls = await Promise.all(
        chunk.map(async (u) => {
          const r = await fetch(u, { headers: BROWSER_HEADERS, cache: 'no-store', signal: AbortSignal.timeout(8000) })
          return r.ok ? { u, html: await r.text() } : null
        })
      )
      for (const h of htmls) {
        if (!h) continue
        const parsed = parsearArticuloEscrituras(h.u, h.html)
        if (parsed) meses.push(parsed)
      }
    }

    if (meses.length === 0) return { status: 'fallback', message: 'no se pudo parsear ningún mes; se conserva la DB' }

    const stamp = new Date().toISOString()
    const { error } = await supabase.from('mercado_escrituras').upsert(
      meses.map((m) => ({ ...m, fuente: 'Colegio de Escribanos CABA', fecha_actualizacion: stamp })),
      { onConflict: 'periodo' }
    )
    if (error) return { status: 'error', message: error.message }

    const latest = meses.reduce((a, b) => (b.periodo > a.periodo ? b : a))
    return { status: 'ok', periodo: latest.label, message: `${meses.length} meses · ${latest.label}: ${latest.cantidad_mensual}` }
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) }
  }
}

// ════════════════════════════════ ENDPOINT ════════════════════════════════════
// Modo por-fuente (?source=) para que cada función quede < 10s (límite Vercel Hobby).
// El botón "Actualizar" dispara las fuentes en paralelo desde el cliente.

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const secret = searchParams.get('secret')
  if (process.env.NODE_ENV === 'production' && secret && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const source = searchParams.get('source')
  const timestamp = new Date().toISOString()

  switch (source) {
    case 'icc':
      return NextResponse.json({ timestamp, results: { icc: await syncICC(supabase) } })
    case 'mudafy':
      return NextResponse.json({ timestamp, results: { mudafy: await syncMudafy(supabase) } })
    case 'escrituras':
      return NextResponse.json({ timestamp, results: { escrituras: await syncEscrituras(supabase) } })
    case 'ucema':
      return NextResponse.json({ timestamp, results: { ucema: await syncUcema(supabase) } })
    case 'zonaprop': {
      const zona = searchParams.get('zona') ?? 'CABA'
      const periodo = searchParams.get('periodo')
      const status = await syncZonaByKey(supabase, zona, periodo)
      return NextResponse.json({ timestamp, results: { zonaprop: { [zona]: status } } })
    }
    default: {
      // Modo "todo" (cron). Lento; no usado por el botón en Hobby.
      const [icc, zonaprop, mudafy, escrituras, ucema] = await Promise.all([
        syncICC(supabase),
        syncZonaprop(supabase),
        syncMudafy(supabase),
        syncEscrituras(supabase),
        syncUcema(supabase),
      ])
      return NextResponse.json({ timestamp, results: { icc, zonaprop, mudafy, escrituras, ucema } })
    }
  }
}
