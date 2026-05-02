import { createClient } from '@/lib/supabase/server'

export interface EscriturasResult {
  cantidad_anual: number | null
  year: number | null
  var_anual_pct: number | null
  error?: string
}

/**
 * Fetches Annual Deeds (Escrituras) from Supabase.
 */
export async function fetchEscrituras(): Promise<EscriturasResult> {
  try {
    const supabase = createClient()
    
    const { data, error } = await supabase
      .from('mercado_escrituras')
      .select('*')
      .order('year', { ascending: false })
      .limit(1)
      .single()

    if (error) throw error

    return {
      cantidad_anual: data.cantidad_anual,
      year: data.year,
      var_anual_pct: data.var_anual_pct ? Number(data.var_anual_pct) : null
    }
  } catch (error) {
    console.error('[fetchEscrituras] Database error:', error)
    return { 
      cantidad_anual: null, 
      year: null, 
      var_anual_pct: null,
      error: 'Error recuperando escrituras' 
    }
  }
}
