export const dynamic = 'force-dynamic'

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
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
    const res = await fetch(`${baseUrl}/api/mercado/zonaprop`, {
      next: { revalidate: 86400, tags: ["mercado"] },
    })
    if (!res.ok) return { zonas: [], error: true }
    const zonas: ZonaResult[] = await res.json()
    return { zonas, error: false }
  } catch {
    return { zonas: [], error: true }
  }
}

export default async function AsesorMercadoPage() {
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
