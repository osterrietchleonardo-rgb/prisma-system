import { createClient } from '@/lib/supabase/server'

export interface EscriturasResult {
  cantidad_mensual: number | null
  periodo: string | null          // 'YYYY-MM'
  label: string | null            // 'Abril 2026'
  var_mensual_pct: number | null
  var_anual_pct: number | null
  monto_millones_ars: number | null
  ytd_count: number | null        // acumulado del año del último período
  ytd_year: string | null
  error?: string
}

const EMPTY: EscriturasResult = {
  cantidad_mensual: null, periodo: null, label: null, var_mensual_pct: null,
  var_anual_pct: null, monto_millones_ars: null, ytd_count: null, ytd_year: null,
}

/**
 * Escrituras CABA (esquema mensual). Devuelve el último mes disponible y el
 * acumulado del año (calculado, no almacenado).
 */
export async function fetchEscrituras(): Promise<EscriturasResult> {
  try {
    const supabase = createClient()

    const { data: latest, error } = await supabase
      .from('mercado_escrituras')
      .select('*')
      .order('periodo', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    if (!latest) return EMPTY

    const year = String(latest.periodo).slice(0, 4)

    // Acumulado YTD del año del último período.
    const { data: delAnio } = await supabase
      .from('mercado_escrituras')
      .select('cantidad_mensual')
      .gte('periodo', `${year}-01`)
      .lte('periodo', `${year}-12`)

    const ytd = (delAnio ?? []).reduce((acc, r) => acc + (Number(r.cantidad_mensual) || 0), 0)

    return {
      cantidad_mensual: Number(latest.cantidad_mensual),
      periodo: latest.periodo,
      label: latest.label,
      var_mensual_pct: latest.var_mensual_pct != null ? Number(latest.var_mensual_pct) : null,
      var_anual_pct: latest.var_anual_pct != null ? Number(latest.var_anual_pct) : null,
      monto_millones_ars: latest.monto_millones_ars != null ? Number(latest.monto_millones_ars) : null,
      ytd_count: ytd || null,
      ytd_year: year,
    }
  } catch (error) {
    console.error('[fetchEscrituras] Database error:', error)
    return { ...EMPTY, error: 'Error recuperando escrituras' }
  }
}
