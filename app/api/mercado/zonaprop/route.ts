export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export interface ZonaResult {
  zona: string
  mes_reporte: string | null
  url_pdf: string | null
  precio_m2_venta_usd: number | null
  variacion_mensual_pct: number | null
  variacion_anual_pct: number | null
  precio_alquiler_2amb_ars: number | null
  precio_alquiler_3amb_ars: number | null
  barrios: { nombre: string; precio_m2_usd: number; variacion_pct: number | null }[]
  fuente: 'zonaprop'
  parseado_ok: boolean
  error?: string
}

export async function GET() {
  try {
    const supabase = createClient()
    
    const { data, error } = await supabase
      .from('mercado_zonas')
      .select('*')
      .order('id', { ascending: true })

    if (error) throw error

    const results: ZonaResult[] = (data || []).map(z => ({
      zona: z.zona,
      mes_reporte: z.mes_reporte,
      url_pdf: z.url_pdf,
      precio_m2_venta_usd: z.precio_m2_venta_usd ? Number(z.precio_m2_venta_usd) : null,
      variacion_mensual_pct: z.variacion_mensual_pct ? Number(z.variacion_mensual_pct) : null,
      variacion_anual_pct: z.variacion_anual_pct ? Number(z.variacion_anual_pct) : null,
      precio_alquiler_2amb_ars: z.precio_alquiler_2amb_ars ? Number(z.precio_alquiler_2amb_ars) : null,
      precio_alquiler_3amb_ars: z.precio_alquiler_3amb_ars ? Number(z.precio_alquiler_3amb_ars) : null,
      barrios: [], // Detailed neighborhood data is now in the main BarriosTable
      fuente: 'zonaprop' as const,
      parseado_ok: true
    }))

    return NextResponse.json(results, {
      headers: {
        'Cache-Control': 's-maxage=86400, stale-while-revalidate=3600',
      },
    })
  } catch (error) {
    console.error('[zonaprop route] Error:', error)
    return NextResponse.json(
      { error: 'Error recuperando reportes desde base de datos' },
      { status: 500 }
    )
  }
}
