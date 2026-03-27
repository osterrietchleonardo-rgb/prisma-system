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
