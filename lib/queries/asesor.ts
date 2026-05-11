import { createClient } from "@/lib/supabase"

export async function getAsesorLeads(agentId: string) {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from("leads")
    .select(`
      *,
      assigned_agent:profiles(id, full_name, avatar_url),
      property:properties(id, title, address)
    `)
    .eq("assigned_agent_id", agentId)
    .order("created_at", { ascending: false })

  if (error) throw error
  return data
}

/** Obtiene las conversaciones de WhatsApp asignadas al asesor, mapeadas al formato Lead del kanban */
export async function getAsesorWaLeads(agentId: string) {
  const supabase = createClient()

  // Necesitamos agency_id para la query
  const { data: profile } = await supabase
    .from("profiles")
    .select("agency_id")
    .eq("id", agentId)
    .single()

  if (!profile?.agency_id) return []

  const { data, error } = await supabase
    .from("wa_conversations")
    .select(`
      id,
      contact_name,
      contact_phone,
      pipeline_stage,
      status,
      score,
      etiquetas,
      created_at,
      last_message_at,
      agent_id,
      assigned_agent:profiles!wa_conversations_agent_id_fkey(id, full_name, avatar_url)
    `)
    .eq("agency_id", profile.agency_id)
    .eq("agent_id", agentId)
    .order("last_message_at", { ascending: false })

  if (error) throw error

  return (data || []).map(conv => ({
    id: conv.id,
    agency_id: profile.agency_id,
    full_name: conv.contact_name || conv.contact_phone || "Sin nombre",
    email: "",
    phone: conv.contact_phone,
    source: "WhatsApp" as const,
    pipeline_stage: conv.pipeline_stage || "nuevo",
    notes: undefined,
    assigned_agent_id: conv.agent_id || undefined,
    created_at: conv.created_at,
    updated_at: conv.last_message_at || conv.created_at,
    tokko_property_title: undefined,
    tokko_property_price: undefined,
    tokko_property_type: undefined,
    tokko_property_operation: undefined,
    tokko_property_location: undefined,
    tokko_lead_status: undefined,
    tokko_agent_name: undefined,
    tokko_agent_picture: undefined,
    assigned_agent: conv.assigned_agent as any ?? undefined,
  }))
}


export async function getAsesorProperties(agentId: string) {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .eq("assigned_agent_id", agentId)
    .order("created_at", { ascending: false })

  if (error) throw error
  return data
}

export async function getAsesorVisits(agentId: string) {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from("visits")
    .select(`
      *,
      property:properties(id, title, address),
      lead:leads(id, full_name)
    `)
    .eq("agent_id", agentId)
    .order("scheduled_at", { ascending: true })

  if (error) throw error
  return data
}


export async function getAsesorKPIs(agentId: string) {
  const supabase = createClient()
  
  // Get all info in parallel
  const [
    { count: totalLeads },
    { count: activeConsultations },
    { count: totalClosings },
    { count: totalValuations }
  ] = await Promise.all([
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("assigned_agent_id", agentId),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("assigned_agent_id", agentId).not("pipeline_stage", "in", "('cerrado','perdido')"),
    supabase.from("closings").select("id", { count: "exact", head: true }).eq("agent_id", agentId),
    supabase.from("valuations").select("id", { count: "exact", head: true }).eq("agent_id", agentId)
  ])

  return {
    totalLeads: totalLeads || 0,
    activeConsultations: activeConsultations || 0,
    totalClosings: totalClosings || 0,
    totalValuations: totalValuations || 0,
    conversionRate: totalLeads ? ((totalClosings || 0) / totalLeads) * 100 : 0
  }
}
