import { createClient } from '@/lib/supabase/server'

export interface ICCData {
  indice_tiempo: string        // e.g. "Marzo de 2026"
  icc_nivel_general: number
  icc_materiales: number
  icc_mano_obra: number
  icc_gastos_generales: number
  var_nivel_general_pct: number   // vs mes anterior
  var_materiales_pct: number
  var_mano_obra_pct: number
  var_gastos_generales_pct: number
  var_anual_pct: number           // interanual nivel general
}

export interface ICCResult {
  data: ICCData | null
  error?: string
}

/**
 * Fetches Construction Cost Index (ICC) from Supabase.
 */
export async function fetchICC(): Promise<ICCResult> {
  try {
    const supabase = createClient()
    
    const { data, error } = await supabase
      .from('mercado_icc')
      .select('*')
      .order('fecha_actualizacion', { ascending: false })
      .limit(1)
      .single()

    if (error) throw error

    if (!data) return { data: null, error: 'No se encontraron datos de ICC' }

    return {
      data: {
        indice_tiempo: data.indice_tiempo,
        icc_nivel_general: Number(data.icc_nivel_general),
        icc_materiales: Number(data.icc_materiales),
        icc_mano_obra: Number(data.icc_mano_obra),
        icc_gastos_generales: Number(data.icc_gastos_generales),
        var_nivel_general_pct: Number(data.var_nivel_general_pct),
        var_materiales_pct: Number(data.var_materiales_pct),
        var_mano_obra_pct: Number(data.var_mano_obra_pct),
        var_gastos_generales_pct: Number(data.var_gastos_generales_pct),
        var_anual_pct: Number(data.var_anual_pct)
      }
    }
  } catch (error) {
    console.error('[fetchICC] Database error:', error)
    return { data: null, error: 'Error recuperando ICC desde base de datos' }
  }
}
