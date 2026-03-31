import { createClient } from "@/lib/supabase/server"

export async function getPropertiesDashboardData(agencyId: string) {
  const supabase = createClient()
  
  const { data: properties } = await supabase
    .from("properties")
    .select("*")
    .eq("agency_id", agencyId)

  if (!properties || properties.length === 0) {
    return null
  }

  // KPIs
  const totalEnCartera = properties.length
  
  let sumUSD = 0
  let validPricesUSD = 0
  let sumPricePerSqm = 0
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
    "A estrenar (0)": 0,
    "1 - 10 años": 0,
    "11 - 20 años": 0,
    "21 - 50 años": 0,
    "+ 50 años": 0
  }

  for (const prop of properties) {
    const raw = prop.tokko_data || {}
    const operations = raw.operations || []
    
    // Encontrar precio USD si existe
    let priceUSD = 0
    for (const op of operations) {
      if (op.prices) {
        const pUSD = op.prices.find((p: any) => p.currency === "USD")
        if (pUSD?.price) {
          priceUSD = pUSD.price
          break
        }
      }
    }

    if (!priceUSD && prop.currency === "USD" && prop.price > 0) {
      priceUSD = prop.price
    }

    if (priceUSD > 0) {
      sumUSD += priceUSD
      validPricesUSD++
      
      const roofed_surface = raw.roofed_surface || prop.covered_area
      if (roofed_surface > 0) {
        sumPricePerSqm += (priceUSD / roofed_surface)
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

    // Apto crédito
    if (raw.credit_eligible && raw.credit_eligible !== "No especificado") {
        const creditLower = raw.credit_eligible.toLowerCase();
        if (creditLower.includes("apto crédito") || creditLower === "sí" || creditLower === "yes") {
             aptoCreditoCount++
        }
    }

    // Situation & Condition
    const sit = raw.situation || "Sin dato"
    situationCounts[sit] = (situationCounts[sit] || 0) + 1
    if (sit.toLowerCase().includes("inquilino")) conInquilinoCount++

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
    const age = raw.age !== undefined && raw.age !== null ? Number(raw.age) : null
    if (age !== null) {
      if (age === 0) ageRanges["A estrenar (0)"]++
      else if (age <= 10) ageRanges["1 - 10 años"]++
      else if (age <= 20) ageRanges["11 - 20 años"]++
      else if (age <= 50) ageRanges["21 - 50 años"]++
      else ageRanges["+ 50 años"]++
    }
  }

  const precioPromedio = validPricesUSD > 0 ? Math.round(sumUSD / validPricesUSD) : 0
  const m2Promedio = validPricesUSD > 0 && sumPricePerSqm > 0 ? Math.round(sumPricePerSqm / validPricesUSD) : 0

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
