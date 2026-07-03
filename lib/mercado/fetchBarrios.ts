import { createClient } from '@/lib/supabase/server'

export interface BarrioData {
  barrio: string
  precio_m2_usd: number
}

export interface HistoricalMonthData {
  label: string
  periodo: string
  promedio_caba_usd: number
}

export interface BarriosResult {
  barrios: BarrioData[]
  fuente: string | null              // ej. 'Mudafy'
  fecha_actualizacion: string | null // ISO real de la DB (no hardcodeado)
  historical?: HistoricalMonthData[] // precio LISTA m² CABA por mes (Zonaprop Index)
  error?: string
}

const MESES_ABREV = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

/** '2026-01' → 'Ene 26'. */
function labelMes(periodo: string): string {
  const m = periodo.match(/(\d{4})-(\d{2})/)
  if (!m) return periodo
  return `${MESES_ABREV[Number(m[2]) - 1] ?? m[2]} ${m[1].slice(2)}`
}

/**
 * Precios de LISTA (publicación) por barrio de CABA + serie histórica del
 * precio m² venta CABA (Zonaprop Index). Todo sale de la DB, que se actualiza
 * por el sync — nada de valores fijos en código.
 */
export async function fetchBarrios(): Promise<BarriosResult> {
  try {
    const supabase = createClient()

    const { data: barriosData, error: barriosError } = await supabase
      .from('mercado_barrios')
      .select('barrio, precio_m2_usd, fuente, fecha_actualizacion')
      .order('barrio', { ascending: true })

    if (barriosError) {
      console.error('[fetchBarrios] Supabase Error:', barriosError.message, barriosError.details)
      throw barriosError
    }

    const barrios: BarrioData[] = (barriosData ?? []).map((item) => ({
      barrio: item.barrio,
      precio_m2_usd: Number(item.precio_m2_usd),
    }))

    // Fuente y fecha reales de los datos (la más reciente de la tabla).
    const fuente = barriosData?.[0]?.fuente ?? null
    const fecha_actualizacion =
      (barriosData ?? [])
        .map((b) => b.fecha_actualizacion as string | null)
        .filter((f): f is string => !!f)
        .sort()
        .pop() ?? null

    // Serie histórica real: precio m² venta CABA por mes desde mercado_zonas
    // (Zonaprop Index). Crece a medida que el sync ingesta nuevos meses.
    const { data: serieCaba } = await supabase
      .from('mercado_zonas')
      .select('mes_reporte, precio_m2_venta_usd')
      .eq('zona', 'CABA')
      .not('mes_reporte', 'is', null)
      .order('mes_reporte', { ascending: true })

    const historical: HistoricalMonthData[] = (serieCaba ?? [])
      .filter((r) => r.precio_m2_venta_usd != null)
      .map((r) => ({
        label: labelMes(r.mes_reporte),
        periodo: r.mes_reporte,
        promedio_caba_usd: Number(r.precio_m2_venta_usd),
      }))

    return { barrios, fuente, fecha_actualizacion, historical }
  } catch (error) {
    console.error('Critical failure in fetchBarrios:', error)
    return {
      barrios: [],
      fuente: null,
      fecha_actualizacion: null,
      error: 'Database error',
    }
  }
}
