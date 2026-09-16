import { createClient } from "@/lib/supabase/server"
import { todasLasFilas } from "@/lib/queries/todas-las-filas"
import { estabaEnCartera } from "@/lib/queries/cartera"
import { finDelDiaAR } from "@/lib/dashboard/periodo"

/** Tokko guarda la situación en inglés; la pantalla la muestra en castellano. */
const SITUACION: Record<string, string> = {
  "Empty": "Vacía",
  "In use": "En uso",
  "Tenant": "Con inquilino",
  "Owner": "Habitada por el dueño",
  "Construction company": "Constructora",
  "---": "Sin dato",
}

/**
 * La cartera responde al filtro del dashboard: la del asesor elegido (Tokko guarda el asesor por
 * email) y la que había al cierre del período (`endDate`, 'yyyy-MM-dd'; hoy si no viene).
 */
export async function getPropertiesDashboardData(agencyId: string, agentId?: string, endDate?: string) {
  const supabase = createClient()

  let emailAsesor: string | null = null
  if (agentId) {
    const { data } = await supabase.from("profiles").select("email").eq("id", agentId).maybeSingle()
    emailAsesor = data?.email ?? null
  }
  const instante = endDate ? Date.parse(finDelDiaAR(endDate)) : Date.now()

  // Todas (también las dadas de baja): con alta y baja se sabe cuáles estaban al cierre del
  // período. De a tandas: la base corta en 1.000 filas.
  const todas = await todasLasFilas<any>((desde, hasta) =>
    supabase
      .from("properties")
      .select("*")
      .eq("agency_id", agencyId)
      .order("id", { ascending: true })
      .range(desde, hasta)
  )
  const properties = todas.filter((p) => {
    if (agentId && (!emailAsesor || p.assigned_agent?.email !== emailAsesor)) return false
    const raw = p.tokko_data || {}
    return estabaEnCartera({ is_active: p.is_active, alta: raw.created_at, baja: raw.deleted_at }, instante)
  })

  if (properties.length === 0) {
    return null
  }

  // KPIs
  const totalEnCartera = properties.length
  
  let sumUSD = 0
  let validPricesUSD = 0
  let sumPricePerSqm = 0
  let validM2 = 0
  let aptoCreditoCount = 0
  let conInquilinoCount = 0
  let conVideoCount = 0
  let conFotosCount = 0

  const typeCounts: Record<string, number> = {}
  const typeValueUSD: Record<string, number> = {}
  
  const rangeCounts = {
    "< 25k": 0,
    "25k - 75k": 0,
    "75k - 150k": 0,
    "150k - 300k": 0,
    "300k - 750k": 0,
    "> 750k": 0
  }

  const typeAvgPrices: Record<string, { sum: number; count: number }> = {}

  const conditionCounts: Record<string, number> = {}
  const situationCounts: Record<string, number> = {}
  const producerStats: Record<string, { total: number; valueUSD: number }> = {}
  const tag3Counts: Record<string, number> = {}
  const ageRanges = {
    "Sin dato": 0,
    "A estrenar (0)": 0,
    "1 - 10 años": 0,
    "11 - 20 años": 0,
    "21 - 50 años": 0,
    "+ 50 años": 0
  }

  for (const prop of properties) {
    const raw = prop.tokko_data || {}
    const operations = raw.operations || []
    
    // Precio de VENTA en dólares. Los alquileres no entran en valor, promedio, rangos ni m²:
    // un alquiler de US$800 mezclado con ventas de US$300.000 bajaba todos los promedios
    // (15/9/2026, Central: promedio 317.283 con alquileres, 331.213 sólo ventas).
    let priceUSD = 0
    for (const op of operations) {
      if (op.operation_type !== "Sale" || !op.prices) continue
      const pUSD = op.prices.find((p: any) => p.currency === "USD")
      if (pUSD?.price) {
        priceUSD = pUSD.price
        break
      }
    }

    if (!priceUSD && prop.status === "Venta" && prop.currency === "USD" && prop.price > 0) {
      priceUSD = prop.price
    }

    if (priceUSD > 0) {
      sumUSD += priceUSD
      validPricesUSD++

      // El m² se promedia sólo entre las que tienen superficie: dividir por todas las que
      // tienen precio lo subestimaba (Central: 2.953 en vez de 3.198).
      const roofed_surface = Number(raw.roofed_surface || prop.covered_area)
      if (roofed_surface > 0) {
        sumPricePerSqm += (priceUSD / roofed_surface)
        validM2++
      }

      // Range
      if (priceUSD < 25000) rangeCounts["< 25k"]++
      else if (priceUSD <= 75000) rangeCounts["25k - 75k"]++
      else if (priceUSD <= 150000) rangeCounts["75k - 150k"]++
      else if (priceUSD <= 300000) rangeCounts["150k - 300k"]++
      else if (priceUSD <= 750000) rangeCounts["300k - 750k"]++
      else rangeCounts["> 750k"]++
    }

    // Type
    const pType = prop.property_type || "Desconocido"
    typeCounts[pType] = (typeCounts[pType] || 0) + 1
    typeValueUSD[pType] = (typeValueUSD[pType] || 0) + priceUSD

    if (priceUSD > 0) {
      if (!typeAvgPrices[pType]) typeAvgPrices[pType] = { sum: 0, count: 0 }
      typeAvgPrices[pType].sum += priceUSD
      typeAvgPrices[pType].count++
    }

    // Apto crédito. Tokko lo guarda en inglés: "Eligible" / "Not eligible" / "Not specified".
    // Se buscaba en castellano y daba 0 (Central tiene 52 aptas).
    const credito = String(raw.credit_eligible || "").toLowerCase()
    if (credito === "eligible" || credito.includes("apto crédito") || credito === "sí" || credito === "yes") {
      aptoCreditoCount++
    }

    // Situation & Condition. "Tenant" = con inquilino (se buscaba "inquilino" y daba 0).
    const sitRaw = raw.situation || "---"
    const sit = SITUACION[sitRaw] || sitRaw
    situationCounts[sit] = (situationCounts[sit] || 0) + 1
    if (sitRaw === "Tenant" || sitRaw.toLowerCase().includes("inquilino")) conInquilinoCount++

    const cond = raw.property_condition || "Sin dato"
    conditionCounts[cond] = (conditionCounts[cond] || 0) + 1

    // Video/Virtual 
    if ((raw.videos && raw.videos.length > 0) || raw.virtual_tour) {
      conVideoCount++
    }

    // Fotos
    if (prop.images && prop.images.length > 0) {
      conFotosCount++
    }

    // Producer
    if (raw.producer) {
      const prodName = raw.producer.name || "Sin asignar"
      if (!producerStats[prodName]) producerStats[prodName] = { total: 0, valueUSD: 0 }
      producerStats[prodName].total++
      producerStats[prodName].valueUSD += priceUSD
    }

    // Tags type 3 (amenidades)
    if (raw.tags) {
      raw.tags.filter((t: any) => t.type === 3).forEach((t: any) => {
        tag3Counts[t.name] = (tag3Counts[t.name] || 0) + 1
      })
    }

    // Age
    // Tokko usa -1 para "sin dato": antes caía en "1 - 10 años".
    const age = raw.age !== undefined && raw.age !== null ? Number(raw.age) : null
    if (age === null || Number.isNaN(age) || age < 0) ageRanges["Sin dato"]++
    else {
      if (age === 0) ageRanges["A estrenar (0)"]++
      else if (age <= 10) ageRanges["1 - 10 años"]++
      else if (age <= 20) ageRanges["11 - 20 años"]++
      else if (age <= 50) ageRanges["21 - 50 años"]++
      else ageRanges["+ 50 años"]++
    }
  }

  const precioPromedio = validPricesUSD > 0 ? Math.round(sumUSD / validPricesUSD) : 0
  const m2Promedio = validM2 > 0 ? Math.round(sumPricePerSqm / validM2) : 0

  return {
    kpis: {
      total: totalEnCartera,
      valorCarteraUSD: sumUSD,
      precioPromedioUSD: precioPromedio,
      precioPromedioM2USD: m2Promedio,
      aptoCredito: { count: aptoCreditoCount, pct: Math.round((aptoCreditoCount / totalEnCartera) * 100) },
      conInquilino: { count: conInquilinoCount, pct: Math.round((conInquilinoCount / totalEnCartera) * 100) },
      conVideo: { count: conVideoCount, pct: Math.round((conVideoCount / totalEnCartera) * 100) },
      conFotos: { count: conFotosCount, pct: Math.round((conFotosCount / totalEnCartera) * 100) }
    },
    composition: {
      byType: Object.entries(typeCounts).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value),
      valueByType: Object.entries(typeValueUSD).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value)
    },
    pricing: {
      ranges: Object.entries(rangeCounts).map(([name, value]) => ({ name, value })),
      typeAverages: Object.entries(typeAvgPrices).map(([name, stats]) => ({
        name,
        value: Math.round(stats.sum / stats.count)
      })).sort((a,b) => b.value - a.value)
    },
    state: {
      condition: Object.entries(conditionCounts).map(([name, value]) => ({ name, value })),
      situation: Object.entries(situationCounts).map(([name, value]) => ({ name, value }))
    },
    producers: Object.entries(producerStats).map(([name, stats]) => ({
      name,
      total: stats.total,
      valueUSD: stats.valueUSD
    })).sort((a,b) => b.valueUSD - a.valueUSD).slice(0, 10),
    amenities: Object.entries(tag3Counts).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value).slice(0, 8),
    ages: Object.entries(ageRanges).map(([name, value]) => ({ name, value }))
  }
}
