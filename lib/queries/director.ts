import { createClient } from "@/lib/supabase"

export interface AgencyLeadsOptions {
  agencyId: string;
  page?: number;
  pageSize?: number;
  orderBy?: string;
  orderAsc?: boolean;
  stage?: string;
  source?: string;
}

export async function getAgencyLeads(options: AgencyLeadsOptions) {
  const { 
    agencyId, 
    page = 0, 
    pageSize = 20, 
    orderBy = "tokko_created_date",
    orderAsc = false,
    stage,
    source
  } = options;
  const supabase = createClient()
  const from = page * pageSize
  const to = from + pageSize - 1
  
  let query = supabase
    .from("leads")
    .select(`
      id,
      full_name,
      email,
      phone,
      pipeline_stage,
      notes,
      status,
      source,
      created_at,
      updated_at,
      tokko_created_date,
      tokko_property_title,
      tokko_property_price,
      tokko_tags,
      tokko_origin,
      tokko_agent_name,
      tokko_agent_picture,
      tokko_agent_phone,
      tokko_lead_status,
      tokko_property_operation,
      tokko_property_location,
      tokko_property_type,
      tokko_raw,
      assigned_agent_id,
      assigned_agent:profiles(id, full_name, avatar_url)
    `, { count: "exact" })
    .eq("agency_id", agencyId)

  if (stage && stage !== "all") {
    query = query.eq("pipeline_stage", stage)
  }
  
  if (source && source !== "all") {
    // Si es una fuente de Tokko, buscamos en tokko_origin o source
    query = query.or(`source.eq."${source}",tokko_origin.eq."${source}"`)
  }

  const { data, error, count } = await query
    .order(orderBy, { ascending: orderAsc })
    .range(from, to)

  if (error) throw error
  return { data, count }
}

export async function updateLeadStage(leadId: string, stage: string) {
  const supabase = createClient()
  
  const { error } = await supabase
    .from("leads")
    .update({ 
      pipeline_stage: stage,
      updated_at: new Date().toISOString()
    })
    .eq("id", leadId)

  if (error) throw error
  
  // Registrar actividad
  await supabase.from("lead_activities").insert({
    lead_id: leadId,
    activity_type: "stage_change",
    description: `Cambio de etapa a: ${stage}`
  })
}

export async function getAgencyAgents(options: { agencyId: string }) {
  const { agencyId } = options;
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, role")
    .eq("agency_id", agencyId)
    .order("full_name")

  if (error) throw error
  return data
}

export async function createLead(leadData: any) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("leads")
    .insert([leadData])
    .select()

  if (error) throw error
  return data[0]
}

export async function getLeadById(leadId: string) {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from("leads")
    .select(`
      *,
      assigned_agent:profiles(id, full_name, avatar_url, email, phone)
    `)
    .eq("id", leadId)
    .single()

  if (error) throw error
  return data
}

export async function getLeadActivities(leadId: string) {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from("lead_activities")
    .select(`
      *,
      agent:profiles(full_name, avatar_url)
    `)
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })

  if (error) throw error
  return data
}

export async function getAgencySettings(agencyId: string) {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from("agencies")
    .select("*")
    .eq("id", agencyId)
    .single()

  if (error) throw error
  return data
}

export async function updateAgencySettings(agencyId: string, settings: any) {
  const supabase = createClient()
  
  const { error } = await supabase
    .from("agencies")
    .update(settings)
    .eq("id", agencyId)

  if (error) throw error
}

export async function getAgencyInvites(agencyId: string) {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from("agency_invites")
    .select(`
      id,
      code,
      is_used,
      used_at,
      used_by_profile:profiles(full_name)
    `)
    .eq("agency_id", agencyId)
    .order("created_at", { ascending: false })

  if (error) throw error
  return data
}

export async function generateAgencyInvite(agencyId: string) {
  const supabase = createClient()
  
  // Get agency name prefix for the code
  const { data: agency } = await supabase
    .from("agencies")
    .select("name")
    .eq("id", agencyId)
    .single()
    
  const prefix = (agency?.name?.substring(0, 6).toUpperCase() || "PRISMA").replace(/\s/g, "")
  const random = Math.random().toString(36).substring(2, 5).toUpperCase()
  const year = new Date().getFullYear()
  const code = `${prefix}-${year}-${random}`

  const { data, error } = await supabase
    .from("agency_invites")
    .insert({
      agency_id: agencyId,
      code
    })
    .select()

  if (error) throw error
  return data[0]
}
