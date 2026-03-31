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

  // 2. Leads Data Processing (Sources, Operations, Types)
  const { data: allLeads } = await supabase
    .from("leads")
    .select("source, tokko_origin, tokko_raw, tokko_property_operation, tokko_property_type")
    .eq("agency_id", agencyId)

  const sourceCounts: Record<string, number> = {}
  const operationCounts: Record<string, number> = {}
  const typeCounts: Record<string, number> = {}

  allLeads?.forEach(lead => {
    // 1. FUENTE (Logic matching Leads page)
    const sourceTag = lead.tokko_raw?.tags?.find((t: any) => t.group_name === "Origen de contacto")?.name 
      || lead.tokko_origin 
      || lead.source 
      || "Sin fuente";
    sourceCounts[sourceTag] = (sourceCounts[sourceTag] || 0) + 1;

    // 2. OPERACIÓN
    const operation = lead.tokko_property_operation 
      || lead.tokko_raw?.tags?.find((t: any) => t.name === "Alquiler" || t.name === "Venta")?.name
      || "Búsqueda";
    operationCounts[operation] = (operationCounts[operation] || 0) + 1;

    // 3. TIPO (Logic matching Leads page regex-like)
    const tags = lead.tokko_raw?.tags || [];
    let propertyType = lead.tokko_property_type;
    
    if (!propertyType || propertyType === "No espec." || propertyType === "Consulta") {
      const typeTag = tags.find((t: any) => 
        /departamento|casa|ph|oficina|local|terreno|lote|cochera|quinta/i.test(t.name)
      );
      if (typeTag) {
        const name = typeTag.name.toLowerCase();
        if (name.includes("departamento")) propertyType = "Departamento";
        else if (name.includes("casa")) propertyType = "Casa";
        else if (name.includes("ph")) propertyType = "PH";
        else propertyType = typeTag.name;
      }
    }
    if (propertyType === "Apartment") propertyType = "Departamento";
    if (propertyType === "House") propertyType = "Casa";
    
    const finalType = propertyType || "Consulta";
    typeCounts[finalType] = (typeCounts[finalType] || 0) + 1;
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
    const stage = lead.pipeline_stage || "Nuevo"
    stageCounts[stage] = (stageCounts[stage] || 0) + 1
  })

  const standardStages = ["Nuevo", "Contacto", "Visita", "Oferta", "Cierre"]
  const chartDataPipeline = standardStages.map(stage => ({
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

  // Get distributions sorted by count
  const sourceDistribution = Object.entries(sourceCounts)
    .map(([label, count]) => ({ label, count }))
    .sort((a,b) => b.count - a.count)

  const operationDistribution = Object.entries(operationCounts)
    .map(([label, count]) => ({ label, count }))
    .sort((a,b) => b.count - a.count)

  const typeDistribution = Object.entries(typeCounts)
    .map(([label, count]) => ({ label, count }))
    .sort((a,b) => b.count - a.count)

  return {
    kpis: {
      newLeads: newLeadsCount || 0,
      pendingVisits: pendingVisitsCount || 0,
      valuations: valuationsCount || 0,
      salesVolume: totalSalesVolume || 0,
      sourceDistribution,
      operationDistribution,
      typeDistribution
    },
    charts: {
      channels: chartDataChannels,
      pipeline: chartDataPipeline || []
    },
    activity: recentActivity || []
  }
}

