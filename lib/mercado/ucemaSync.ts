// Sync del "Índice Real m2 by REMAX y UCEMA" (con respaldo de Reporte
// Inmobiliario): precios de CIERRE reales de departamentos en CABA, general y
// por ambientes, con la brecha % entre precio publicado y precio de cierre.
//
// Fuente: PDF mensual en ucema.edu.ar. Regla de URL verificada:
//   /sites/default/files/{carpeta}/Informe_M2_Real_{Mes}_{YYYY}.pdf
// donde {carpeta} es el mes de PUBLICACIÓN (dato de mes M → carpeta M+1,
// a veces M+2; hay meses salteados, ej. abril 2026). Cada informe trae la
// serie completa desde 2020, así que alcanza con encontrar el más reciente.
//
// Parser GEOMÉTRICO (coordenadas de pdf.js): el texto plano del PDF sale en
// orden de dibujo arbitrario y las etiquetas de año tienen capas superpuestas
// (un "2025" debajo de un "2026"), así que no son confiables. En cambio:
//   - cada tabla ancla en su item "Mes" (xM, yM); meses/valores/% comparten fila;
//   - páginas de a pares: tabla IZQUIERDA = año más nuevo (verificado con datos);
//   - la tabla parcial (< 12 meses) es el año del informe (del nombre del PDF)
//     y debe tener exactamente tantos meses como el mes del informe.
// Validado 30/30 contra las ediciones de Mayo y Febrero 2026.

import { createAdminClient } from '@/lib/supabase/admin'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse-fork')

const MESES_NUM: Record<string, number> = {
  ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6,
  JULIO: 7, AGOSTO: 8, SEPTIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12,
}
const MESES_NOMBRE = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

const SECCIONES = [
  { key: 'amb1', re: /DE\s*1\s*AMBIENTE/i },
  { key: 'amb2', re: /DE\s*2\s*AMBIENTES/i },
  { key: 'amb3', re: /DE\s*3\s*AMBIENTES/i },
  { key: 'general', re: /GENERALIZADOS/i }, // al final: los otros headers también empiezan con "DATOS - PRECIOS"
] as const

type SeccionKey = (typeof SECCIONES)[number]['key']

interface PdfItem { s: string; x: number; y: number }
interface PuntoMes { valor: number; brecha: number | null }
type Serie = Record<string, PuntoMes> // 'YYYY-MM' → punto

export interface UcemaStatus {
  status: 'ok' | 'fallback' | 'error'
  periodo?: string
  message?: string
}

async function extractPages(buffer: Buffer): Promise<PdfItem[][]> {
  const pagesItems: PdfItem[][] = []
  await pdfParse(buffer, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pagerender: async (pageData: any) => {
      const tc = await pageData.getTextContent()
      pagesItems.push(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tc.items.map((i: any) => ({ s: String(i.str), x: i.transform[4], y: i.transform[5] }))
      )
      return ''
    },
  })
  return pagesItems
}

export function parseUcemaPages(
  pagesItems: PdfItem[][],
  reportYear: number,
  reportMonth: number
): Record<SeccionKey, Serie> {
  interface Tabla { seccion: SeccionKey; pageIdx: number; xM: number; meses: number[]; valores: (string | null)[]; brechas: (string | null)[] }
  const tablas: Tabla[] = []

  pagesItems.forEach((items, pageIdx) => {
    const norm = items
      .map((i) => ({ s: i.s.replace(/\s+/g, ' ').trim(), x: i.x, y: i.y }))
      .filter((i) => i.s)
    const headerItem = norm.find((i) => /DATOS - PRECIOS/i.test(i.s))
    if (!headerItem) return
    const seccion = SECCIONES.find((s) => s.re.test(headerItem.s))?.key
    if (!seccion) return

    const anchors = norm.filter((i) => i.s === 'Mes').sort((a, b) => a.x - b.x)
    anchors.forEach((anchor, ai) => {
      const xMax = ai + 1 < anchors.length ? anchors[ai + 1].x : Infinity
      const inRange = norm.filter((i) => i.x >= anchor.x - 10 && i.x < xMax - 10)

      // meses: misma columna que "Mes", debajo de él ("M AYO" viene partido)
      const meses = inRange
        .filter((i) => Math.abs(i.x - anchor.x) <= 10 && i.y < anchor.y && MESES_NUM[i.s.replace(/\s/g, '').toUpperCase()])
        .sort((a, b) => b.y - a.y)
        .map((i) => ({ n: MESES_NUM[i.s.replace(/\s/g, '').toUpperCase()], y: i.y }))
      if (meses.length < 1) return

      // por fila de mes: [valor USD, brecha %] a la derecha, misma y (±7)
      const valores: (string | null)[] = []
      const brechas: (string | null)[] = []
      for (const mes of meses) {
        const row = inRange
          .filter((i) => Math.abs(i.y - mes.y) <= 7 && i.x > anchor.x + 30)
          .sort((a, b) => a.x - b.x)
          // dedupe de capas superpuestas del PDF (items casi en el mismo punto)
          .filter((i, idx, arr) => idx === 0 || Math.abs(i.x - arr[idx - 1].x) > 15 || i.s !== arr[idx - 1].s)
        const val = row.find((i) => /^(N\/A|N \/A|\d{3,4})$/.test(i.s))
        const pct = row.find((i) => /^(N\/A|N \/A|-?\d{1,2},\d{1,2})$/.test(i.s) && i !== val)
        valores.push(val ? val.s.replace(/\s/g, '') : null)
        brechas.push(pct ? pct.s.replace(/\s/g, '') : null)
      }
      // regla "cero inventado": si alguna fila quedó sin token, se descarta la tabla
      if (valores.some((v) => v === null)) return
      tablas.push({ seccion, pageIdx, xM: anchor.x, meses: meses.map((m) => m.n), valores, brechas })
    })
  })

  // Asignar años: por sección, en orden (página asc, x asc). La parcial es el
  // año del informe; las completas son Y-1, Y-2, ... (izquierda = más nuevo).
  const out = {} as Record<SeccionKey, Serie>
  for (const { key } of SECCIONES) {
    const ts = tablas
      .filter((t) => t.seccion === key)
      .sort((a, b) => a.pageIdx - b.pageIdx || a.xM - b.xM)
    if (ts.length === 0) continue
    const serie: Serie = {}
    const addTable = (t: Tabla, year: number) => {
      for (let k = 0; k < t.meses.length; k++) {
        if (year === reportYear && t.meses[k] > reportMonth) continue
        const rawV = t.valores[k]
        if (!rawV || !/^\d+$/.test(rawV)) continue // N/A (abril 2020, pandemia)
        const rawB = t.brechas[k]
        serie[`${year}-${String(t.meses[k]).padStart(2, '0')}`] = {
          valor: Number(rawV),
          brecha: rawB && /,/.test(rawB) ? Number(rawB.replace(',', '.')) : null,
        }
      }
    }
    let nextYear = reportYear - 1
    for (const t of ts) {
      if (t.meses.length < 12) {
        if (t.meses.length === reportMonth) addTable(t, reportYear)
      } else {
        addTable(t, nextYear)
        nextYear -= 1
      }
    }
    out[key] = serie
  }
  return out
}

/** Busca el informe más reciente: dato del mes M puede publicarse en carpeta M+1 o M+2. */
async function descubrirInforme(): Promise<{ buffer: Buffer; url: string; year: number; month: number } | null> {
  const now = new Date()
  for (let i = 1; i <= 6; i++) {
    const dato = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const year = dato.getFullYear()
    const month = dato.getMonth() + 1
    const nombre = `Informe_M2_Real_${MESES_NOMBRE[month - 1]}_${year}.pdf`
    for (const pubOffset of [1, 2]) {
      const pub = new Date(year, month - 1 + pubOffset, 1)
      const carpeta = `${pub.getFullYear()}-${String(pub.getMonth() + 1).padStart(2, '0')}`
      const url = `https://ucema.edu.ar/sites/default/files/${carpeta}/${nombre}`
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          cache: 'no-store',
          signal: AbortSignal.timeout(8000),
        })
        if (res.ok) return { buffer: Buffer.from(await res.arrayBuffer()), url, year, month }
      } catch {
        // seguir probando
      }
    }
  }
  return null
}

const STAT_POR_SECCION: Record<SeccionKey, string> = {
  general: 'promedio_caba_cierre',
  amb1: 'monoambiente_cierre',
  amb2: 'dos_ambientes_cierre',
  amb3: 'tres_ambientes_cierre',
}

export async function syncUcema(supabase: ReturnType<typeof createAdminClient>): Promise<UcemaStatus> {
  try {
    const informe = await descubrirInforme()
    if (!informe) return { status: 'fallback', message: 'No se encontró PDF reciente; se conserva la DB' }

    const pages = await extractPages(informe.buffer)
    const series = parseUcemaPages(pages, informe.year, informe.month)
    const general = series.general ?? {}
    const periodos = Object.keys(general).sort()
    if (periodos.length === 0) return { status: 'fallback', message: 'PDF sin tablas parseables; se conserva la DB' }

    const ultimo = periodos[periodos.length - 1]
    const labelInforme = `${MESES_NOMBRE[informe.month - 1]} ${informe.year}`
    const fuente = 'Índice Real m2 by REMAX y UCEMA'
    const stamp = new Date().toISOString()

    // 1) Serie histórica completa → mercado_cierre_mensual (upsert por periodo)
    const todosPeriodos = new Set<string>()
    for (const sec of Object.values(series)) for (const p of Object.keys(sec)) todosPeriodos.add(p)
    const rows = Array.from(todosPeriodos).sort().map((periodo) => ({
      periodo,
      cierre_general_usd: series.general?.[periodo]?.valor ?? null,
      cierre_1amb_usd: series.amb1?.[periodo]?.valor ?? null,
      cierre_2amb_usd: series.amb2?.[periodo]?.valor ?? null,
      cierre_3amb_usd: series.amb3?.[periodo]?.valor ?? null,
      brecha_general_pct: series.general?.[periodo]?.brecha ?? null,
      brecha_1amb_pct: series.amb1?.[periodo]?.brecha ?? null,
      brecha_2amb_pct: series.amb2?.[periodo]?.brecha ?? null,
      brecha_3amb_pct: series.amb3?.[periodo]?.brecha ?? null,
      fuente: `${fuente} · Informe ${labelInforme}`,
      url_pdf: informe.url,
      fecha_actualizacion: stamp,
    }))
    const { error: histError } = await supabase
      .from('mercado_cierre_mensual')
      .upsert(rows, { onConflict: 'periodo' })
    if (histError) throw histError

    // 2) Último mes por segmento → mercado_stats (con variaciones reales)
    const [y, m] = ultimo.split('-').map(Number)
    const prevMes = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, '0')}`
    const prevAnio = `${y - 1}-${String(m).padStart(2, '0')}`
    const varPct = (actual?: number, base?: number) =>
      actual != null && base != null && base !== 0
        ? Math.round(((actual - base) / base) * 1000) / 10
        : null

    for (const { key } of SECCIONES) {
      const serie = series[key]
      const punto = serie?.[ultimo]
      if (!punto) continue
      const { error } = await supabase
        .from('mercado_stats')
        .update({
          valor: punto.valor,
          variacion_mensual: varPct(punto.valor, serie[prevMes]?.valor),
          variacion_interanual: varPct(punto.valor, serie[prevAnio]?.valor),
          fuente: `${fuente} · ${labelInforme}`,
          fecha_actualizacion: stamp,
        })
        .eq('id', STAT_POR_SECCION[key])
      if (error) throw error
    }

    return { status: 'ok', periodo: labelInforme, message: `${rows.length} meses de serie histórica` }
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) }
  }
}
