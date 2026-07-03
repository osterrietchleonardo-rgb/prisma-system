export const dynamic = 'force-dynamic'

import { createClient } from "@/lib/supabase/server"

import { fetchDolares } from "@/lib/mercado/fetchDolares"
import { fetchBarrios, BarriosResult } from "@/lib/mercado/fetchBarrios"
import { fetchCierre, CierreResult } from "@/lib/mercado/fetchCierre"
import { fetchICC } from "@/lib/mercado/fetchICC"
import { fetchEscrituras, EscriturasResult } from "@/lib/mercado/fetchEscrituras"
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
      variacion_mensual_pct: z.variacion_mensual_pct != null ? Number(z.variacion_mensual_pct) : null,
      variacion_anual_pct: z.variacion_anual_pct != null ? Number(z.variacion_anual_pct) : null,
      precio_alquiler_2amb_ars: z.precio_alquiler_2amb_ars ? Number(z.precio_alquiler_2amb_ars) : null,
      precio_alquiler_3amb_ars: z.precio_alquiler_3amb_ars ? Number(z.precio_alquiler_3amb_ars) : null,
      fuente: 'zonaprop' as const,
      parseado_ok: true
    }))

    return { zonas, error: false }
  } catch (error) {
    console.error('[Advisor Page] Error loading Zonaprop:', error)
    return { zonas: [], error: true }
  }
}

const BARRIOS_EMPTY: BarriosResult = { barrios: [], fuente: null, fecha_actualizacion: null, historical: [], error: "Error al cargar" }
const CIERRE_EMPTY: CierreResult = { serie: [], ultimo: null, periodoLabel: null, fuente: null, url_pdf: null, fecha_actualizacion: null, general: null, amb1: null, amb2: null, amb3: null, error: "Error al cargar" }
const ESCRITURAS_EMPTY: EscriturasResult = { cantidad_mensual: null, periodo: null, label: null, var_mensual_pct: null, var_anual_pct: null, monto_millones_ars: null, ytd_count: null, ytd_year: null }

export default async function AsesorMercadoPage() {
  const [dolaresResult, barriosResult, cierreResult, iccResult, zonapropResult, escriturasResult, lastUpdatedResult] = await Promise.allSettled([
    fetchDolares(),
    fetchBarrios(),
    fetchCierre(),
    fetchICC(),
    fetchZonaprop(),
    fetchEscrituras(),
    fetchLastUpdated(),
  ])

  const dolares = dolaresResult.status === "fulfilled" ? dolaresResult.value : { oficial: null, mep: null, blue: null, ccl: null, error: "Error al cargar" }
  const barrios = barriosResult.status === "fulfilled" ? barriosResult.value : BARRIOS_EMPTY
  const cierre = cierreResult.status === "fulfilled" ? cierreResult.value : CIERRE_EMPTY
  const escrituras = escriturasResult.status === "fulfilled" ? escriturasResult.value : ESCRITURAS_EMPTY
  const icc = iccResult.status === "fulfilled" ? iccResult.value : { data: null, error: "Error al cargar" }
  const zonapropData = zonapropResult.status === "fulfilled" ? zonapropResult.value : { zonas: [], error: true }
  const lastUpdated = lastUpdatedResult.status === "fulfilled" ? lastUpdatedResult.value : null

  return (
    <PulsoMercadoContent
      dolares={dolares}
      barrios={barrios}
      cierre={cierre}
      icc={icc}
      escrituras={escrituras}
      zonas={zonapropData.zonas}
      zonapropError={zonapropData.error}
      lastUpdated={lastUpdated}
    />
  )
}
