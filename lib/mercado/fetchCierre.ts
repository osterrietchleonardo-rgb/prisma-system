import { createClient } from '@/lib/supabase/server'

// Precios de CIERRE reales (operaciones concretadas) en CABA.
// Fuente: "Índice Real m2 by REMAX y UCEMA" → tabla mercado_cierre_mensual,
// poblada por el sync (source=ucema). Las variaciones se calculan acá desde
// la propia serie (no se almacenan derivados).

export interface CierreMes {
  periodo: string                    // 'YYYY-MM'
  cierre_general_usd: number | null
  cierre_1amb_usd: number | null
  cierre_2amb_usd: number | null
  cierre_3amb_usd: number | null
  brecha_general_pct: number | null  // % cierre vs publicado (negativo)
  brecha_1amb_pct: number | null
  brecha_2amb_pct: number | null
  brecha_3amb_pct: number | null
}

export interface SegmentoCierre {
  valor: number | null
  brecha_pct: number | null
  var_mensual_pct: number | null
  var_interanual_pct: number | null
}

export interface CierreResult {
  serie: CierreMes[]                 // ascendente por periodo
  ultimo: CierreMes | null
  periodoLabel: string | null        // 'Mayo 2026'
  fuente: string | null
  url_pdf: string | null
  fecha_actualizacion: string | null
  general: SegmentoCierre | null
  amb1: SegmentoCierre | null
  amb2: SegmentoCierre | null
  amb3: SegmentoCierre | null
  error?: string
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

const EMPTY: CierreResult = {
  serie: [], ultimo: null, periodoLabel: null, fuente: null, url_pdf: null,
  fecha_actualizacion: null, general: null, amb1: null, amb2: null, amb3: null,
}

function num(v: unknown): number | null {
  return v == null ? null : Number(v)
}

function periodoAnterior(periodo: string): string {
  const [y, m] = periodo.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

function periodoAnioAnterior(periodo: string): string {
  const [y, m] = periodo.split('-').map(Number)
  return `${y - 1}-${String(m).padStart(2, '0')}`
}

function varPct(actual: number | null, base: number | null): number | null {
  if (actual == null || base == null || base === 0) return null
  return Math.round(((actual - base) / base) * 1000) / 10
}

export async function fetchCierre(): Promise<CierreResult> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('mercado_cierre_mensual')
      .select('*')
      .order('periodo', { ascending: true })

    if (error) throw error
    if (!data || data.length === 0) return EMPTY

    const serie: CierreMes[] = data.map((r) => ({
      periodo: r.periodo,
      cierre_general_usd: num(r.cierre_general_usd),
      cierre_1amb_usd: num(r.cierre_1amb_usd),
      cierre_2amb_usd: num(r.cierre_2amb_usd),
      cierre_3amb_usd: num(r.cierre_3amb_usd),
      brecha_general_pct: num(r.brecha_general_pct),
      brecha_1amb_pct: num(r.brecha_1amb_pct),
      brecha_2amb_pct: num(r.brecha_2amb_pct),
      brecha_3amb_pct: num(r.brecha_3amb_pct),
    }))

    const ultimo = serie[serie.length - 1]
    const porPeriodo = new Map(serie.map((s) => [s.periodo, s]))
    const prev = porPeriodo.get(periodoAnterior(ultimo.periodo)) ?? null
    const prevAnio = porPeriodo.get(periodoAnioAnterior(ultimo.periodo)) ?? null

    const segmento = (
      campo: 'cierre_general_usd' | 'cierre_1amb_usd' | 'cierre_2amb_usd' | 'cierre_3amb_usd',
      brecha: 'brecha_general_pct' | 'brecha_1amb_pct' | 'brecha_2amb_pct' | 'brecha_3amb_pct'
    ): SegmentoCierre => ({
      valor: ultimo[campo],
      brecha_pct: ultimo[brecha],
      var_mensual_pct: varPct(ultimo[campo], prev?.[campo] ?? null),
      var_interanual_pct: varPct(ultimo[campo], prevAnio?.[campo] ?? null),
    })

    const [y, m] = ultimo.periodo.split('-').map(Number)
    const rawUltimo = data[data.length - 1]

    return {
      serie,
      ultimo,
      periodoLabel: `${MESES[m - 1]} ${y}`,
      fuente: rawUltimo.fuente ?? 'Índice Real m2 by REMAX y UCEMA',
      url_pdf: rawUltimo.url_pdf ?? null,
      fecha_actualizacion: rawUltimo.fecha_actualizacion ?? null,
      general: segmento('cierre_general_usd', 'brecha_general_pct'),
      amb1: segmento('cierre_1amb_usd', 'brecha_1amb_pct'),
      amb2: segmento('cierre_2amb_usd', 'brecha_2amb_pct'),
      amb3: segmento('cierre_3amb_usd', 'brecha_3amb_pct'),
    }
  } catch (error) {
    console.error('[fetchCierre] Database error:', error)
    return { ...EMPTY, error: 'Error recuperando cierre desde base de datos' }
  }
}
