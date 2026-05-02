export const dynamic = 'force-dynamic'

import { createClient } from "@/lib/supabase/server"

import { fetchDolares } from "@/lib/mercado/fetchDolares"
import { fetchBarrios } from "@/lib/mercado/fetchBarrios"
import { fetchICC } from "@/lib/mercado/fetchICC"
import { fetchEscrituras } from "@/lib/mercado/fetchEscrituras"
import { ZonaResult } from "@/app/api/mercado/zonaprop/route"
import { PulsoMercadoContent } from "@/components/mercado/PulsoMercadoContent"

export const metadata = {
  title: "Pulso de Mercado | PRISMA IA",
  description: "Datos en tiempo real del mercado inmobiliario argentino",
}

async function fetchZonaprop(): Promise<{ zonas: ZonaResult[]; error: boolean }> {
  try {
    const supabase = await createClient()
    const { data: zonasData, error: zonasError } = await supabase
      .from('mercado_zonas')
      .select('*')
      .order('zona', { ascending: true })

    if (zonasError) throw zonasError

    const zonas = (zonasData || []).map(z => ({
      zona: z.zona,
      mes_reporte: z.mes_reporte,
      url_pdf: z.url_pdf,
      precio_m2_venta_usd: z.precio_m2_venta_usd ? Number(z.precio_m2_venta_usd) : null,
      variacion_mensual_pct: z.variacion_mensual_pct ? Number(z.variacion_mensual_pct) : null,
      variacion_anual_pct: z.variacion_anual_pct ? Number(z.variacion_anual_pct) : null,
      precio_alquiler_2amb_ars: z.precio_alquiler_2amb_ars ? Number(z.precio_alquiler_2amb_ars) : null,
      precio_alquiler_3amb_ars: z.precio_alquiler_3amb_ars ? Number(z.precio_alquiler_3amb_ars) : null,
      barrios: [], 
      fuente: 'zonaprop' as const,
      parseado_ok: true
    }))

    return { zonas, error: false }
  } catch (error) {
    console.error('[Market Page] Error loading Zonaprop:', error)
    return { zonas: [], error: true }
  }
}

export default async function DirectorMercadoPage() {
  const [dolaresResult, barriosResult, iccResult, zonapropResult, escriturasResult] = await Promise.allSettled([
    fetchDolares(),
    fetchBarrios(),
    fetchICC(),
    fetchZonaprop(),
    fetchEscrituras(),
  ])

  const dolares = dolaresResult.status === "fulfilled" ? dolaresResult.value : { oficial: null, mep: null, blue: null, ccl: null, error: "Error al cargar" }
  const barriosRaw = barriosResult.status === "fulfilled" ? barriosResult.value : { barrios: [], promedio_caba_usd: null, escrituras_count: null, period: null, historical: [], error: "Error al cargar" }
  const escrituras = escriturasResult.status === "fulfilled" ? escriturasResult.value : { cantidad_anual: null, year: null, var_anual_pct: null }
  // Merge escrituras into barrios result
  const barrios = { ...barriosRaw, escrituras_count: escrituras.cantidad_anual, escrituras_year: escrituras.year, escrituras_var: escrituras.var_anual_pct }
  const icc = iccResult.status === "fulfilled" ? iccResult.value : { data: null, error: "Error al cargar" }
  const zonapropData = zonapropResult.status === "fulfilled" ? zonapropResult.value : { zonas: [], error: true }

  return (
    <PulsoMercadoContent
      dolares={dolares}
      barrios={barrios}
      icc={icc}
      zonas={zonapropData.zonas}
      zonapropError={zonapropData.error}
      lastUpdated={new Date().toISOString()}
    />
  )
}
