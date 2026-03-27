import { createClient } from "@/lib/supabase/server"

export async function getDashboardData(agencyId: string) {
  const supabase = createClient()
  
  // 1. KPIs
  const { count: newLeadsCount } = await supabase
    .from("leads")
    .select("*", { count: 'exact', head: true })
    .eq("agency_id", agencyId)
    .eq("status", "nuevo")

  const { data: agencyLeads } = await supabase
    .from("leads")
    .select("id")
    .eq("agency_id", agencyId)
  
  const leadIds = agencyLeads?.map(l => l.id) || []
  
  const { count: pendingVisitsCount } = leadIds.length > 0 ? await supabase
    .from("visits")
    .select("*", { count: 'exact', head: true })
    .in("lead_id", leadIds)
    .eq("status", "pendiente")
    : { count: 0 }

  const { count: valuationsCount } = await supabase
    .from("valuations")
    .select("*", { count: 'exact', head: true })
    .eq("agency_id", agencyId)

  const { data: closings } = await supabase
    .from("closings")
    .select("closing_price")
    .eq("agency_id", agencyId)

  const totalSalesVolume = closings?.reduce((acc, c) => acc + (Number(c.closing_price) || 0), 0) || 0

  // 2. Leads por Canal (Chart Data)
  const { data: leadsBySource } = await supabase
    .from("leads")
    .select("source")
    .eq("agency_id", agencyId)

  const sourceCounts: Record<string, number> = {}
  leadsBySource?.forEach(lead => {
    const src = lead.source || "Desconocido"
    sourceCounts[src] = (sourceCounts[src] || 0) + 1
  })
  
  const chartDataChannels = Object.entries(sourceCounts).map(([name, total]) => ({
    name,
    total
  }))

  // 3. Pipeline Data
  const { data: leadsPipeline } = await supabase
    .from("leads")
    .select("pipeline_stage")
    .eq("agency_id", agencyId)

  const stageCounts: Record<string, number> = {}
  leadsPipeline?.forEach(lead => {
    const stage = lead.pipeline_stage || "Contacto"
    stageCounts[stage] = (stageCounts[stage] || 0) + 1
  })

  // Ensure standard stages are present even if 0
  const stages = ["Contacto", "Visita", "Oferta", "Cierre"]
  const chartDataPipeline = stages.map(stage => ({
    name: stage,
    value: stageCounts[stage] || 0
  }))

  // 4. Actividad Reciente
  const { data: recentActivity } = await supabase
    .from("lead_activities")
    .select(`
      id,
      activity_type,
      description,
      created_at,
      profiles:agent_id(full_name, avatar_url),
      leads:lead_id(full_name)
    `)
    .in("lead_id", leadIds)
    .order("created_at", { ascending: false })
    .limit(10)

  return {
    kpis: {
      newLeads: newLeadsCount || 0,
      pendingVisits: pendingVisitsCount || 0,
      valuations: valuationsCount || 0,
      salesVolume: totalSalesVolume,
    },
    charts: {
      channels: chartDataChannels,
      pipeline: chartDataPipeline
    },
    activity: recentActivity || []
  }
}

