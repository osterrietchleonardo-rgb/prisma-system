import { createClient } from "@/lib/supabase/server"

export async function getDashboardData(agencyId: string) {
  const supabase = createClient()
  
  // 1. KPIs Base (from leads/closings/valuations)
  const { count: newLeadsCount } = await supabase
    .from("leads")
    .select("*", { count: 'exact', head: true })
    .eq("agency_id", agencyId)
    .eq("status", "nuevo")

  // 1.1. Performance Metrics & Classification
  const { data: agency } = await supabase
    .from("agencies")
    .select("performance_config")
    .eq("id", agencyId)
    .single();

    .eq("agency_id", agencyId);

  // 1.2. Get all advisors/profiles for this agency to link properties
  const { data: agencyProfiles } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .eq("agency_id", agencyId);

  // 1.3. Get active properties count per advisor email
  const { data: properties } = await supabase
    .from("properties")
    .select("assigned_agent")
    .eq("agency_id", agencyId)
    .eq("status", "Active");

  const inventoryPerEmail: Record<string, number> = {};
  properties?.forEach(p => {
    const email = (p.assigned_agent as any)?.email;
    if (email) {
      inventoryPerEmail[email] = (inventoryPerEmail[email] || 0) + 1;
    }
  });

  // Group stats by agent
  const advisorStats: Record<string, any> = {};
  
  // Initialize with all agency profiles
  agencyProfiles?.forEach(p => {
    advisorStats[p.id] = {
      id: p.id,
      name: p.full_name || "Asesor Sin Nombre",
      email: p.email,
      captaciones: 0,
      transacciones: 0,
      facturacion: 0,
      cartera_activa: inventoryPerEmail[p.email || ""] || 0,
      rotacion: 0
    };
  });

  perfLogs?.forEach(l => {
    const agentId = l.agent_id;
    if (advisorStats[agentId]) {
      if (l.type === 'captacion') advisorStats[agentId].captaciones++;
      if (l.type === 'transaccion') advisorStats[agentId].transacciones++;
      advisorStats[agentId].facturacion += Number(l.comision_generada) || 0;
    }
  });

  // Calculate rotation per advisor using the formula:
  // Cartera Inicial = Cartera Final - Captaciones + Ventas
  // Inventario Promedio = (Inicial + Final) / 2
  // Rotación = (Ventas / Promedio) * 100
  Object.values(advisorStats).forEach((s: any) => {
    const finalInv = s.cartera_activa;
    const initialInv = Math.max(0, finalInv - s.captaciones + s.transacciones);
    const avgInv = (initialInv + finalInv) / 2;
    
    s.rotacion = avgInv > 0 ? (s.transacciones / avgInv) * 100 : 0;
  });

  // Calculate overall KPIs from logs
  const captacionesCount = perfLogs?.filter(l => l.type === 'captacion').length || 0;
  const transaccionesCount = perfLogs?.filter(l => l.type === 'transaccion').length || 0;
  const totalFacturacion = perfLogs?.reduce((acc, l) => acc + (Number(l.comision_generada) || 0), 0) || 0;

  // 1.2. Rotación de Cartera (Global)
  const totalCaptaciones = Object.values(advisorStats).reduce((acc: number, s: any) => acc + s.captaciones, 0);
  const totalTransacciones = Object.values(advisorStats).reduce((acc: number, s: any) => acc + s.transacciones, 0);
  const totalFinalInv = Object.values(advisorStats).reduce((acc: number, s: any) => acc + s.cartera_activa, 0);
  const totalInitialInv = Math.max(0, totalFinalInv - totalCaptaciones + totalTransacciones);
  const totalAvgInv = (totalInitialInv + totalFinalInv) / 2;
  
  const rotacionCartera = totalAvgInv > 0 ? (totalTransacciones / totalAvgInv) * 100 : 0;

  // AI Classification per Advisor
  const { classifyAdvisor } = await import("@/lib/tracking/performance-evaluator");
  const advisors = await Promise.all(Object.values(advisorStats).map(async (stats: any) => {
    const classification = await classifyAdvisor(stats, agency?.performance_config);
    return {
      ...stats,
      classification: classification.category,
      classificationReason: classification.reason
    };
  }));

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

  // 2. Leads Data Processing (Sources, Operations, Types)
  const { data: allLeads } = await supabase
    .from("leads")
    .select("source, tokko_origin, tokko_raw, tokko_property_operation, tokko_property_type")
    .eq("agency_id", agencyId)

  const sourceCounts: Record<string, number> = {}
  const operationCounts: Record<string, number> = {}
  const typeCounts: Record<string, number> = {}

  allLeads?.forEach(lead => {
    const sourceTag = lead.tokko_raw?.tags?.find((t: any) => t.group_name === "Origen de contacto")?.name 
      || lead.tokko_origin 
      || lead.source 
      || "Sin fuente";
    sourceCounts[sourceTag] = (sourceCounts[sourceTag] || 0) + 1;

    const operation = lead.tokko_property_operation 
      || lead.tokko_raw?.tags?.find((t: any) => t.name === "Alquiler" || t.name === "Venta")?.name
      || "Búsqueda";
    operationCounts[operation] = (operationCounts[operation] || 0) + 1;

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
      captaciones: captacionesCount,
      transacciones: transaccionesCount,
      facturacion: totalFacturacion,
      rotacion: rotacionCartera,
      sourceDistribution,
      operationDistribution,
      typeDistribution
    },
    charts: {
      channels: chartDataChannels,
      pipeline: chartDataPipeline || []
    },
    advisors,
    activity: recentActivity || []
  }
}
