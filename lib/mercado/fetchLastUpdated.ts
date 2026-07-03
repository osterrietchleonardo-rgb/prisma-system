import { createClient } from '@/lib/supabase/server'

/**
 * Devuelve el timestamp real más reciente de actualización entre las tablas de
 * mercado (no la hora de render). null si no hay datos.
 */
export async function fetchLastUpdated(): Promise<string | null> {
  try {
    const supabase = createClient()
    const tablas = ['mercado_icc', 'mercado_zonas', 'mercado_barrios', 'mercado_cierre_mensual', 'mercado_escrituras'] as const

    const results = await Promise.all(
      tablas.map((t) =>
        supabase
          .from(t)
          .select('fecha_actualizacion')
          .order('fecha_actualizacion', { ascending: false })
          .limit(1)
          .maybeSingle()
      )
    )

    const fechas = results
      .map((r) => r.data?.fecha_actualizacion as string | undefined)
      .filter((f): f is string => !!f)

    if (fechas.length === 0) return null
    return fechas.reduce((max, f) => (f > max ? f : max))
  } catch {
    return null
  }
}
