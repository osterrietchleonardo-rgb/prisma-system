import { createClient } from '@/lib/supabase/server'

export interface BarrioData {
  barrio: string
  precio_m2_usd: number
  precio_cierre_m2_usd?: number
  fuente: string
  fecha: string
}

export interface BarriosResult {
  barrios: BarrioData[]
  promedio_caba_usd: number | null
  promedio_cierre_usd: number | null
  escrituras_count: number | null
  escrituras_var: number | null
  escrituras_year: string | null
  period: string | null
  historical?: any[]
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
      .order('precio_m2_usd', { ascending: false })

    if (barriosError) throw barriosError

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

    // Historical data placeholder (could be fetched from another table if needed)
    // For now, we'll return a minimal historical series to keep the chart alive
    const historical = [
      { date: '2025-01', value: 2150 },
      { date: '2025-04', value: 2180 },
      { date: '2025-07', value: 2210 },
      { date: '2025-10', value: 2250 },
      { date: '2026-01', value: 2309 },
      { date: '2026-03', value: 2116 } // March 2026 real closing
    ]

    return {
      barrios,
      promedio_caba_usd: barrios.length > 0 ? Math.round(barrios.reduce((acc, b) => acc + b.precio_m2_usd, 0) / barrios.length) : null,
      promedio_cierre_usd: promCaba ? Number(promCaba.valor) : null,
      escrituras_count: 69490, // Static for 2025 total as per latest report
      escrituras_var: 26.79,
      escrituras_year: '2025',
      period: 'Q1 2026',
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
