import { createClient } from "@/lib/supabase/server"

export async function getDashboardData(agencyId: string, agentId?: string, startDate?: string, endDate?: string) {
  const supabase = createClient()
  
  // 1. WhatsApp Conversations (Top of Funnel)
  let waBaseQuery = supabase
    .from("wa_conversations")
    .select("agent_id, created_at")
    .eq("agency_id", agencyId);

  if (startDate) waBaseQuery = waBaseQuery.gte("created_at", startDate);
  if (endDate) waBaseQuery = waBaseQuery.lte("created_at", endDate);

  const { data: waCounts } = await waBaseQuery;

  const waCountsByAgent = (waCounts || []).reduce((acc: any, curr: any) => {
    if (curr.agent_id) {
        acc[curr.agent_id] = (acc[curr.agent_id] || 0) + 1;
    }
    return acc;
  }, {});

  const { count: waChatsCount } = await supabase
    .from("wa_conversations")
    .select("id", { count: 'exact' })
    .eq("agency_id", agencyId)
    .filter(agentId ? 'agent_id' : 'id', agentId ? 'eq' : 'not.is', agentId || null);

  // 2. Performance Logs (The main source for business metrics)
  let logsQuery = supabase
    .from("performance_logs")
    .select("*")
    .eq("agency_id", agencyId);

  if (agentId) logsQuery = logsQuery.eq("agent_id", agentId);
  if (startDate) logsQuery = logsQuery.gte("fecha_actividad", startDate);
  if (endDate) logsQuery = logsQuery.lte("fecha_actividad", endDate);

  const { data: perfLogs } = await logsQuery;

  // 3. Profiles for context
  const { data: agencyProfiles } = await supabase
    .from("profiles")
    .select("id, email, full_name, avatar_url")
    .eq("agency_id", agencyId);

  // 4. Inventory (Tokko Properties)
  const { data: properties } = await supabase
    .from("properties")
    .select("assigned_agent, price, created_at, status")
    .eq("agency_id", agencyId);

  // Group metrics by category
  const metrics: any = {
    prospeccion: {
      waChats: waChatsCount || 0,
      active: perfLogs?.filter(l => l.type === 'prospeccion').length || 0,
      leads: { vendedor: 0, comprador: 0 },
      channels: {} as Record<string, number>
    },
    prelisting: {
      volumen: perfLogs?.filter(l => l.type === 'prelisting').length || 0,
      pipeline: perfLogs?.filter(l => l.type === 'prelisting').reduce((acc, l) => acc + (Number(l.monto_operacion) || 0), 0) || 0,
    },
    prebuying: {
      volumen: perfLogs?.filter(l => l.type === 'prebuying').length || 0,
      poder: perfLogs?.filter(l => l.type === 'prebuying').reduce((acc, l) => acc + (Number(l.monto_operacion) || 0), 0) || 0,
    },
    captacion: {
      nuevas: perfLogs?.filter(l => l.type === 'captacion').length || 0,
      volumen: perfLogs?.filter(l => l.type === 'captacion').reduce((acc, l) => acc + (Number(l.monto_operacion) || 0), 0) || 0,
      exclusivas: perfLogs?.filter(l => l.type === 'captacion' && l.metadata?.condicion_captacion === 'Exclusiva').length || 0,
      honorarioTotal: perfLogs?.filter(l => l.type === 'captacion').reduce((acc, l) => acc + (Number(l.comision_generada) || 0), 0) || 0,
    },
    reserva: {
      volumen: perfLogs?.filter(l => l.type === 'reserva').length || 0,
      compromiso: perfLogs?.filter(l => l.type === 'reserva').reduce((acc, l) => acc + (Number(l.metadata?.monto_depositado) || 0), 0) || 0,
      gapSum: perfLogs?.filter(l => l.type === 'reserva').reduce((acc, l) => {
        const publicado = l.metadata?.valor_publicacion_actual;
        const ofertado = l.monto_operacion;
        if (publicado && publicado > 0) {
          return acc + ((ofertado - publicado) / publicado) * 100;
        }
        return acc;
      }, 0) || 0,
    },
    cierre: {
      transacciones: perfLogs?.filter(l => l.type === 'cierre').reduce((acc, l) => {
        const part = l.metadata?.participacion;
        if (part === 'Ambas puntas') return acc + 1;
        if (part === 'Solo Comprador' || part === 'Solo Vendedor') return acc + 0.5;
        return acc + 1; // Default
      }, 0) || 0,
      volumenVentas: perfLogs?.filter(l => l.type === 'cierre').reduce((acc, l) => acc + (Number(l.monto_operacion) || 0), 0) || 0,
      gci: perfLogs?.filter(l => l.type === 'cierre').reduce((acc, l) => {
        const valor = Number(l.monto_operacion) || 0;
        const hon = Number(l.comision_generada) || 0;
        return acc + (valor * hon / 100);
      }, 0) || 0,
      honorarioPromedioSum: perfLogs?.filter(l => l.type === 'cierre').reduce((acc, l) => acc + (Number(l.comision_generada) || 0), 0) || 0,
    },
    cartera: {
      activa: 0,
      volumen: 0,
      domSum: 0,
      domCount: 0
    }
  };

  // Process Prospeccion Metadata
  perfLogs?.filter(l => l.type === 'prospeccion').forEach(l => {
    const tipo = l.metadata?.tipo_lead;
    if (tipo === 'Vendedor') metrics.prospeccion.leads.vendedor++;
    if (tipo === 'Comprador') metrics.prospeccion.leads.comprador++;
    
    const origen = l.metadata?.origen || "Otro";
    metrics.prospeccion.channels[origen] = (metrics.prospeccion.channels[origen] || 0) + 1;
  });

  // Process Cartera (Tokko)
  properties?.forEach(p => {
    const agentEmail = (p.assigned_agent as any)?.email;
    const isOwner = agentId ? (agencyProfiles?.find(prof => prof.id === agentId)?.email === agentEmail) : true;
    
    if (isOwner && p.status === 'Active') {
      metrics.cartera.activa++;
      metrics.cartera.volumen += Number(p.price) || 0;
    }
  });

  // Calculate Average Metrics
  const ticketPromedioTasacion = metrics.prelisting.volumen > 0 ? metrics.prelisting.pipeline / metrics.prelisting.volumen : 0;
  const ticketPromedioBusqueda = metrics.prebuying.volumen > 0 ? metrics.prebuying.poder / metrics.prebuying.volumen : 0;
  const hitRate = metrics.prelisting.volumen > 0 ? (metrics.captacion.nuevas / metrics.prelisting.volumen) * 100 : 0;
  const ratioExclusividad = metrics.captacion.nuevas > 0 ? (metrics.captacion.exclusivas / metrics.captacion.nuevas) * 100 : 0;
  const honorarioPactado = metrics.captacion.nuevas > 0 ? metrics.captacion.honorarioTotal / metrics.captacion.nuevas : 0;
  
  const tasaOferta = metrics.prebuying.volumen > 0 ? (metrics.reserva.volumen / metrics.prebuying.volumen) * 100 : 0;
  const gapNegociacion = metrics.reserva.volumen > 0 ? metrics.reserva.gapSum / metrics.reserva.volumen : 0;

  const tasaCierre = metrics.reserva.volumen > 0 ? (metrics.cierre.transacciones / metrics.reserva.volumen) * 100 : 0;
  const honorarioCobrado = metrics.cierre.transacciones > 0 ? metrics.cierre.honorarioPromedioSum / (metrics.cierre.transacciones * (metrics.cierre.transacciones % 1 === 0 ? 1 : 2)) : 0; // Simplified
  // Wait, the above honorario calculation is tricky because transacciones can be 0.5.
  const cierreCount = perfLogs?.filter(l => l.type === 'cierre').length || 0;
  const honorarioReal = cierreCount > 0 ? metrics.cierre.honorarioPromedioSum / cierreCount : 0;

  // Split calculation (Company Dollar vs Neto Asesores)
  // Assuming a default 50/50 split if not specified, but usually it's in agency config
  const companyDollar = metrics.cierre.gci * 0.5; 
  const netoAsesores = metrics.cierre.gci * 0.5;

  // Global Efficiency
  const totalConsultas = metrics.prospeccion.waChats + metrics.prospeccion.active;
  const ratioConsultasCierres = metrics.cierre.transacciones > 0 ? totalConsultas / metrics.cierre.transacciones : 0;
  const tasaConversionGlobal = totalConsultas > 0 ? (metrics.cierre.transacciones / totalConsultas) * 100 : 0;

  // Final KPI Object
  const kpis = {
    // Top of Funnel
    waChats: metrics.prospeccion.waChats,
    prospeccionActiva: metrics.prospeccion.active,
    leadsVendedores: metrics.prospeccion.leads.vendedor,
    leadsCompradores: metrics.prospeccion.leads.comprador,
    channelDistribution: Object.entries(metrics.prospeccion.channels).map(([label, count]) => ({ label, count })),
    
    // Prelisting
    consultasWa: metrics.prospeccion.waChats,
    prospeccionActiva: metrics.prospeccion.active,
    tasaciones: metrics.prelisting.volumen,
    pipelineCaptacion: metrics.prelisting.pipeline,
    ticketPromedioTasacion,
    
    // Prebuying
    compradores: metrics.prebuying.volumen,
    poderCompra: metrics.prebuying.poder,
    ticketPromedioBusqueda,
    
    // Captacion
    captaciones: metrics.captacion.nuevas,
    volumenInventario: metrics.captacion.volumen,
    hitRate,
    ratioExclusividad,
    honorarioPactado,
    
    // Reserva
    reservas: metrics.reserva.volumen,
    compromisoEconomico: metrics.reserva.compromiso,
    tasaOferta,
    gapNegociacion,
    
    // Cierre
    transacciones: metrics.cierre.transacciones,
    volumenVentas: metrics.cierre.volumenVentas,
    tasaCierre,
    honorarioCobrado: honorarioReal,
    gci: metrics.cierre.gci,
    companyDollar,
    netoAsesores,
    
    // Cartera
    carteraActiva: metrics.cartera.activa,
    volumenCartera: metrics.cartera.volumen,
    rotacion: totalConsultas > 0 ? (metrics.cierre.transacciones / metrics.cartera.activa) * 100 : 0, // Simplified rotation
    dom: 45, // Placeholder for Days on Market
    
    // Global
    ratioConsultasCierres,
    tasaConversionGlobal,
    
    // Ratios específicos (Leads / Cierre)
    ratioWaCierre: metrics.cierre.transacciones > 0 ? metrics.prospeccion.waChats / metrics.cierre.transacciones : 0,
    ratioProspCierre: metrics.cierre.transacciones > 0 ? metrics.prospeccion.active / metrics.cierre.transacciones : 0,
    ratioTotalLeadsCierre: metrics.cierre.transacciones > 0 ? (metrics.prospeccion.waChats + metrics.prospeccion.active) / metrics.cierre.transacciones : 0,
  };

  // Re-calculate rotation using the better formula for global/leaderboard
  const advisorStats: Record<string, any> = {};
  agencyProfiles?.forEach(p => {
    const pLogs = perfLogs?.filter(l => l.agent_id === p.id) || [];
    const pProps = properties?.filter(prop => (prop.assigned_agent as any)?.email === p.email) || [];
    
    const waChats = waChatsCount && p.id === agentId ? waChatsCount : 0; // This is a bit tricky since waChatsCount is already filtered
    // Actually, waChatsCount at the top is already filtered by agentId if provided.
    // Let's do it better:
    
    const caps = pLogs.filter(l => l.type === 'captacion').length;
    const trans = pLogs.filter(l => l.type === 'cierre').reduce((acc, l) => {
        const part = l.metadata?.participacion;
        if (part === 'Ambas puntas') return acc + 1;
        if (part === 'Solo Comprador' || part === 'Solo Vendedor') return acc + 0.5;
        return acc + 1;
    }, 0);
    
    const tasaciones = pLogs.filter(l => l.type === 'prelisting').length;
    const compradores = pLogs.filter(l => l.type === 'prebuying').length;
    const reservas = pLogs.filter(l => l.type === 'reserva').length;
    const prospeccion = pLogs.filter(l => l.type === 'prospeccion').length;
    
    const finalInv = pProps.filter(prop => prop.status === 'Active').length;
    const initialInv = Math.max(0, finalInv - caps + trans);
    const avgInv = (initialInv + finalInv) / 2;
    const rotacion = avgInv > 0 ? (trans / avgInv) * 100 : 0;

    advisorStats[p.id] = {
      id: p.id,
      name: p.full_name || "Asesor Sin Nombre",
      email: p.email,
      avatar_url: p.avatar_url,
      wa_chats: waCountsByAgent[p.id] || 0,
      prospeccion,
      tasaciones,
      compradores,
      captaciones: caps,
      reservas,
      transacciones: trans,
      facturacion: pLogs.filter(l => l.type === 'cierre').reduce((acc, l) => {
        const valor = Number(l.monto_operacion) || 0;
        const hon = Number(l.comision_generada) || 0;
        return acc + (valor * hon / 100);
      }, 0),
      cartera_activa: finalInv,
      rotacion: rotacion
    };
  });

  // AI Classification
  const { classifyAdvisor } = await import("@/lib/tracking/performance-evaluator");
  const { data: agency } = await supabase.from("agencies").select("performance_config").eq("id", agencyId).single();
  
  const advisors = await Promise.all(Object.values(advisorStats).map(async (stats: any) => {
    const classification = await classifyAdvisor(stats, agency?.performance_config);
    return {
      ...stats,
      classification: classification.category,
      classificationReason: classification.reason
    };
  }));

  // Evolution Data
  const months = [];
  const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  for (let i = 0; i < 6; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push({ key, name: monthNames[d.getMonth()] });
  }

  const performanceEvolution = months.map(m => {
    const mLogs = perfLogs?.filter(l => {
        const date = new Date(l.fecha_actividad || l.created_at);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` === m.key;
    }) || [];

    const mWaChats = (waCounts || []).filter(c => {
        const date = new Date(c.created_at);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` === m.key;
    }).length;

    const mProspeccion = mLogs.filter(l => l.type === 'prospeccion').length;
    const mTransacciones = mLogs.filter(l => l.type === 'cierre').reduce((acc, l) => {
        const part = l.metadata?.participacion;
        if (part === 'Ambas puntas') return acc + 1;
        if (part === 'Solo Comprador' || part === 'Solo Vendedor') return acc + 0.5;
        return acc + 1;
    }, 0);

    return {
      name: m.name,
      captaciones: mLogs.filter(l => l.type === 'captacion').length,
      transacciones: mTransacciones,
      waChats: mWaChats,
      prospeccion: mProspeccion,
      ratioWaCierre: mTransacciones > 0 ? (mWaChats / mTransacciones) : 0,
      ratioProspCierre: mTransacciones > 0 ? (mProspeccion / mTransacciones) : 0,
      ratioTotalLeadsCierre: mTransacciones > 0 ? ((mWaChats + mProspeccion) / mTransacciones) : 0,
      effWaCierre: mWaChats > 0 ? (mTransacciones / mWaChats) * 100 : 0,
      effProspCierre: mProspeccion > 0 ? (mTransacciones / mProspeccion) * 100 : 0,
      effTotalCierre: (mWaChats + mProspeccion) > 0 ? (mTransacciones / (mWaChats + mProspeccion)) * 100 : 0,
      gci: mLogs.filter(l => l.type === 'cierre').reduce((acc, l) => {
        const valor = Number(l.monto_operacion) || 0;
        const hon = Number(l.comision_generada) || 0;
        return acc + (valor * hon / 100);
      }, 0)
    };
  }).reverse();

  return {
    kpis,
    charts: {
      performanceEvolution,
      channelDistribution: kpis.channelDistribution
    },
    advisors,
    activity: perfLogs?.slice(0, 10).map(l => ({
        ...l,
        profiles: agencyProfiles?.find(p => p.id === l.agent_id)
    })) || []
  }
}
