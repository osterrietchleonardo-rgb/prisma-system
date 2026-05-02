import { fetchDolares } from "@/lib/mercado/fetchDolares"
import { fetchBarrios } from "@/lib/mercado/fetchBarrios"
import { fetchICC } from "@/lib/mercado/fetchICC"
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
  const [dolaresResult, barriosResult, iccResult, zonapropResult] = await Promise.allSettled([
    fetchDolares(),
    fetchBarrios(),
    fetchICC(),
    fetchZonaprop(),
  ])

  const dolares = dolaresResult.status === "fulfilled" ? dolaresResult.value : { oficial: null, mep: null, blue: null, ccl: null, error: "Error al cargar" }
  const barrios = barriosResult.status === "fulfilled" ? barriosResult.value : { barrios: [], promedio_caba_usd: null, escrituras_count: null, period: null, historical: [], error: "Error al cargar" }
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
