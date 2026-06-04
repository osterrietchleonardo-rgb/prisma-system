import { createClient } from '@/lib/supabase/server'

export interface BarrioData {
  barrio: string
  precio_m2_usd: number
  precio_cierre_m2_usd?: number
  fuente: string
  fecha: string
}

export interface HistoricalMonthData {
  label: string
  promedio_caba_usd: number
}

export interface BarriosResult {
  barrios: BarrioData[]
  promedio_caba_usd: number | null
  promedio_cierre_usd: number | null
  escrituras_count: number | null
  escrituras_var: number | null
  escrituras_year: string | null
  period: string | null
  historical?: HistoricalMonthData[]
  error?: string
}

/**
 * Fetches neighborhood price data and global market stats from Supabase.
 */
export async function fetchBarrios(): Promise<BarriosResult> {
  try {
    const supabase = createClient()
    
    // 1. Fetch Neighborhoods
    const { data: barriosData, error: barriosError } = await supabase
      .from('mercado_barrios')
      .select('*')
      .order('barrio', { ascending: true })

    if (barriosError) {
      console.error('[fetchBarrios] Supabase Error:', barriosError.message, barriosError.details)
      throw barriosError
    }
    
    if (!barriosData || barriosData.length === 0) {
      console.warn('[fetchBarrios] No data found in mercado_barrios table')
    }

    // 2. Fetch Global Stats
    const { data: statsData, error: statsError } = await supabase
      .from('mercado_stats')
      .select('*')

    if (statsError) throw statsError

    // 3. Process data
    const barrios: BarrioData[] = barriosData.map(item => ({
      barrio: item.barrio,
      precio_m2_usd: Number(item.precio_m2_usd),
      precio_cierre_m2_usd: item.precio_cierre_m2_usd ? Number(item.precio_cierre_m2_usd) : undefined,
      fuente: item.fuente || 'Fuentes Varias 2026',
      fecha: new Date(item.fecha_actualizacion).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
    }))

    // Get specific stats
    const getStat = (id: string) => statsData.find(s => s.id === id)
    const promCaba = getStat('promedio_caba_cierre')

    // Serie histórica: no hay tabla real de histórico todavía (requiere
    // `mercado_historico`). Sin datos inventados → vacío hasta tener fuente real.
    const historical: HistoricalMonthData[] = []

    return {
      barrios,
      promedio_caba_usd: barrios.length > 0 ? Math.round(barrios.reduce((acc, b) => acc + b.precio_m2_usd, 0) / barrios.length) : null,
      promedio_cierre_usd: promCaba ? Number(promCaba.valor) : null,
      // escrituras_* las resuelve la page con fetchEscrituras() (dato real de DB).
      escrituras_count: null,
      escrituras_var: null,
      escrituras_year: null,
      period: null,
      historical,
    }
  } catch (error) {
    console.error('Critical failure in fetchBarrios:', error)
    return {
      barrios: [],
      promedio_caba_usd: null,
      promedio_cierre_usd: null,
      escrituras_count: null,
      escrituras_var: null,
      escrituras_year: null,
      period: null,
      error: 'Database error'
    }
  }
}
