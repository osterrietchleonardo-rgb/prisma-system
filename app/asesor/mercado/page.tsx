export const dynamic = 'force-dynamic'

import { createClient } from "@/lib/supabase/server"

import { fetchDolares } from "@/lib/mercado/fetchDolares"
import { fetchBarrios } from "@/lib/mercado/fetchBarrios"
import { fetchICC } from "@/lib/mercado/fetchICC"
import { fetchEscrituras } from "@/lib/mercado/fetchEscrituras"
import { fetchLastUpdated } from "@/lib/mercado/fetchLastUpdated"
import { ZonaResult } from "@/app/api/mercado/zonaprop/route"
import { PulsoMercadoContent } from "@/components/mercado/PulsoMercadoContent"

export const metadata = {
  title: "Pulso de Mercado | PRISMA IA",
  description: "Datos en tiempo real del mercado inmobiliario argentino",
}

async function fetchZonaprop(): Promise<{ zonas: ZonaResult[]; error: boolean }> {
  try {
    const supabase = await createClient()
    // Histórico: puede haber varias filas por zona. Tomamos la más reciente de cada una.
    const { data: zonasRaw, error: zonasError } = await supabase
      .from('mercado_zonas')
      .select('*')
      .order('mes_reporte', { ascending: false })

    if (zonasError) throw zonasError

    const latestPorZona = new Map<string, (typeof zonasRaw)[number]>()
    for (const row of zonasRaw || []) {
      if (!latestPorZona.has(row.zona)) latestPorZona.set(row.zona, row)
    }
    const zonasData = Array.from(latestPorZona.values()).sort((a, b) => a.zona.localeCompare(b.zona))

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
    console.error('[Advisor Page] Error loading Zonaprop:', error)
    return { zonas: [], error: true }
  }
}

export default async function AsesorMercadoPage() {
  const [dolaresResult, barriosResult, iccResult, zonapropResult, escriturasResult, lastUpdatedResult] = await Promise.allSettled([
    fetchDolares(),
    fetchBarrios(),
    fetchICC(),
    fetchZonaprop(),
    fetchEscrituras(),
    fetchLastUpdated(),
  ])

  const dolares = dolaresResult.status === "fulfilled" ? dolaresResult.value : { oficial: null, mep: null, blue: null, ccl: null, error: "Error al cargar" }
  const barriosRaw = barriosResult.status === "fulfilled" ? barriosResult.value : { barrios: [], promedio_caba_usd: null, promedio_cierre_usd: null, escrituras_count: null, escrituras_var: null, escrituras_year: null, escrituras_ytd: null, period: null, historical: [], error: "Error al cargar" }
  const escrituras = escriturasResult.status === "fulfilled" ? escriturasResult.value : { cantidad_mensual: null, label: null, var_anual_pct: null, ytd_count: null }
  const barrios = { ...barriosRaw, escrituras_count: escrituras.cantidad_mensual, escrituras_year: escrituras.label, escrituras_var: escrituras.var_anual_pct, escrituras_ytd: escrituras.ytd_count }
  const icc = iccResult.status === "fulfilled" ? iccResult.value : { data: null, error: "Error al cargar" }
  const zonapropData = zonapropResult.status === "fulfilled" ? zonapropResult.value : { zonas: [], error: true }
  const lastUpdated = lastUpdatedResult.status === "fulfilled" ? lastUpdatedResult.value : null

  return (
    <PulsoMercadoContent
      dolares={dolares}
      barrios={barrios}
      icc={icc}
      zonas={zonapropData.zonas}
      zonapropError={zonapropData.error}
      lastUpdated={lastUpdated}
    />
  )
}
