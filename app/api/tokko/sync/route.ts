import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { syncPropertiesFromTokko, syncAgentsFromTokko } from "@/lib/tokko"

export const dynamic = "force-dynamic";
import { rateLimit, LIMITS } from "@/lib/rate-limiter"

interface TokkoProperty {
  id: number | string
  publication_title: string
  description: string
  operations: Array<{
    prices: Array<{ price: number; currency: string }>
    operation_type: string
  }>
  type: { name: string }
  address: string
  location: { name: string }
  suite_amount: number
  bathroom_amount: number
  total_surface: number
  surface: number
  photos: Array<{ image: string }>
}

export async function POST() {
  const supabase = createClient()
  
  try {
    // 1. Verificar sesión y rol
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, agency_id")
      .eq("id", session.user.id)
      .single()

    if (profile?.role !== "director" || !profile.agency_id) {
      return NextResponse.json({ error: "No tienes permisos para realizar esta acción" }, { status: 403 })
    }

    // 2. Rate Limiting (1 req/5min por agencyId)
    const rl = await rateLimit(profile.agency_id, LIMITS.TOKKO_SYNC)
    if (!rl.success) {
      return NextResponse.json({ error: rl.errorMessage }, { status: 429 })
    }

    // 3. Obtener API Key de Tokko
    const { data: agency } = await supabase
      .from("agencies")
      .select("tokko_api_key")
      .eq("id", profile.agency_id)
      .single()

    if (!agency?.tokko_api_key) {
      return NextResponse.json({ error: "API Key de Tokko no configurada" }, { status: 400 })
    }

    // 4. Sync from Tokko
    const [tokkoProperties, tokkoAgents] = await Promise.all([
      syncPropertiesFromTokko(agency.tokko_api_key),
      syncAgentsFromTokko(agency.tokko_api_key)
    ])
    
    // 5. Mapear y Upsert en Supabase
    const typeMapping: Record<string, string> = {
      "Apartment": "Departamento",
      "House": "Casa",
      "Land": "Lote",
      "Office": "Oficina",
      "Local": "Local Comercial",
      "Store": "Local Comercial",
      "Ph": "PH",
    }

    const statusMapping: Record<string, string> = {
      "Sale": "Venta",
      "Rent": "Alquiler",
      "Temporary Rent": "Alquiler Temporario",
    }

    // Obtener perfiles de la agencia para matcheo por email
    const { data: agencyProfiles } = await supabase
      .from("profiles")
      .select("id, email")
      .eq("agency_id", profile.agency_id)

    const propertiesToUpsert = tokkoProperties.map((p: any) => {
      const rawType = p.type?.name || "Desconocido"
      const rawStatus = p.operations?.[0]?.operation_type || "Venta"
      const producerEmail = p.producer?.email?.toLowerCase()
      
      const matchedProfile = agencyProfiles?.find(ap => 
        ap.email?.toLowerCase() === producerEmail
      )

      // Buscar el primer precio que sea mayor a 0
      const activeOperation = p.operations?.[0];
      const validPrice = activeOperation?.prices?.find((pr: any) => pr.price > 0) || activeOperation?.prices?.[0];

      return {
        tokko_id: p.id.toString(),
        agency_id: profile.agency_id,
        assigned_agent: {
          name: p.producer?.name || "Sin asignar",
          email: p.producer?.email || "",
          cellphone: p.producer?.cellphone || p.producer?.phone || ""
        },
        title: p.publication_title,
        description: p.description,
        price: validPrice?.price || 0,
        currency: validPrice?.currency || "USD",
        property_type: typeMapping[rawType] || rawType,
        status: statusMapping[rawStatus] || rawStatus,
        address: p.address,
        city: p.location?.name,
        bedrooms: p.suite_amount || 0,
        bathrooms: p.bathroom_amount || 0,
        total_area: p.total_surface || 0,
        covered_area: p.surface || 0,
        images: p.photos?.map((f: { image: string }) => f.image) || [],
        tokko_data: p,
        updated_at: new Date().toISOString()
      }
    })

    const { error: upsertError } = await supabase
      .from("properties")
      .upsert(propertiesToUpsert, { onConflict: "tokko_id" })

    if (upsertError) throw upsertError

    // 5.5 Mapear y Upsert Agents
    const agentsToUpsert = tokkoAgents.map((a: any) => ({
      tokko_id: a.id.toString(),
      agency_id: profile.agency_id,
      full_name: a.name,
      email: a.email,
      phone: a.cellphone || a.phone,
      avatar_url: a.image,
      updated_at: new Date().toISOString()
    }))

    if (agentsToUpsert.length > 0) {
      const { error: agentsUpsertError } = await supabase
        .from("tokko_agents")
        .upsert(agentsToUpsert, { onConflict: "tokko_id" })
      
      if (agentsUpsertError) throw agentsUpsertError
    }

    // 6. Actualizar última sync
    await supabase
      .from("agencies")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("id", profile.agency_id)

    return NextResponse.json({ 
      success: true, 
      count: propertiesToUpsert.length 
    })

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Tokko Sync Error:", message)
    return NextResponse.json({ 
      error: "Error interno durante la sincronización con Tokko" 
    }, { status: 500 })
  }
}
