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

  const { data: rawLogs } = await logsQuery;
  const perfLogs = rawLogs?.filter(l => l.status !== 'eliminada') || [];

  // 3. Profiles — only asesores (directors are excluded from the leaderboard)
  const { data: agencyProfiles } = await supabase
    .from("profiles")
    .select("id, email, full_name, avatar_url")
    .eq("agency_id", agencyId)
    .eq("role", "asesor");

  // 4. Inventory (Tokko Properties)
  const { data: properties } = await supabase
    .from("properties")
    .select("assigned_agent, price, created_at, status")
    .eq("agency_id", agencyId)
    .eq("is_active", true);

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

  // 5. Response Time Analytics (New)
  let msgQuery = supabase
    .from("wa_messages")
    .select("conversation_id, role, created_at, wa_conversations!inner(agent_id)")
    .eq("agency_id", agencyId)
    .order("created_at", { ascending: true });

  if (agentId) msgQuery = msgQuery.eq("wa_conversations.agent_id", agentId);
  if (startDate) msgQuery = msgQuery.gte("created_at", startDate);
  if (endDate) msgQuery = msgQuery.lte("created_at", endDate);

  const { data: messages } = await msgQuery;

  const respTimes = {
    bot: { first: [] as number[], between: [] as number[] },
    human: { first: [] as number[], between: [] as number[] }
  };

  const convThreads: Record<string, any[]> = {};
  messages?.forEach((m: any) => {
    if (!convThreads[m.conversation_id]) convThreads[m.conversation_id] = [];
    convThreads[m.conversation_id].push(m);
  });

  Object.values(convThreads).forEach(thread => {
    let firstLeadMsgInConv: any = null;
    let pendingLeadMsg: any = null;
    let hasBotResponded = false;
    let hasHumanResponded = false;

    thread.forEach(m => {
      if (m.role === 'lead') {
        if (!firstLeadMsgInConv) firstLeadMsgInConv = m;
        if (!pendingLeadMsg) pendingLeadMsg = m;
      } else if (m.role === 'bot') {
        if (pendingLeadMsg) {
          const diff = new Date(m.created_at).getTime() - new Date(pendingLeadMsg.created_at).getTime();
          if (!hasBotResponded && pendingLeadMsg === firstLeadMsgInConv) {
            respTimes.bot.first.push(diff);
            hasBotResponded = true;
          } else {
            respTimes.bot.between.push(diff);
          }
          pendingLeadMsg = null;
        }
      } else if (m.role === 'human') {
        if (pendingLeadMsg) {
          const diff = new Date(m.created_at).getTime() - new Date(pendingLeadMsg.created_at).getTime();
          if (!hasHumanResponded && pendingLeadMsg === firstLeadMsgInConv) {
            respTimes.human.first.push(diff);
            hasHumanResponded = true;
          } else {
            respTimes.human.between.push(diff);
          }
          pendingLeadMsg = null;
        }
      }
    });
  });

  const calculateAvg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const formatDuration = (ms: number) => {
    if (ms <= 0) return "---";
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ${sec % 60}s`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ${min % 60}m`;
    return `${Math.floor(hr/24)}d ${hr%24}h`;
  };

  kpis.responseTime = {
    botFirst: formatDuration(calculateAvg(respTimes.bot.first)),
    botBetween: formatDuration(calculateAvg(respTimes.bot.between)),
    humanFirst: formatDuration(calculateAvg(respTimes.human.first)),
    humanBetween: formatDuration(calculateAvg(respTimes.human.between))
  };

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

// ------------------------------------ Pipeline Dashboard Data ------------------------------------
// Lee pipeline_stage de AMBAS tablas (leads + wa_conversations) por agency_id
// Solo agencia del director logueado. Nunca mezcla agencias.
export async function getPipelineDashboardData(agencyId: string) {
  const supabase = createClient()

  const [leadsRes, waRes] = await Promise.all([
    supabase
      .from("leads")
      .select("pipeline_stage, source")
      .eq("agency_id", agencyId),
    supabase
      .from("wa_conversations")
      .select("pipeline_stage, funnel_status")
      .eq("agency_id", agencyId),
  ])

  const STAGES = [
    "nuevo", "contacto", "calificado", "visita_agendada",
    "visita_realizada", "propuesta", "negociacion", "cerrado", "perdido",
  ] as const

  type Stage = typeof STAGES[number]

  // Contar leads (Tokko + manual)
  const leadsByStage: Record<string, { total: number; bySource: Record<string, number> }> = {}
  for (const row of (leadsRes.data || [])) {
    const stage = (row.pipeline_stage || "nuevo") as string
    if (!leadsByStage[stage]) leadsByStage[stage] = { total: 0, bySource: {} }
    leadsByStage[stage].total++
    const src = row.source || "Manual"
    leadsByStage[stage].bySource[src] = (leadsByStage[stage].bySource[src] || 0) + 1
  }

  // Contar wa_conversations
  // Importante: si funnel_status = closed_lost → efectivamente están en "perdido"
  const waByStage: Record<string, number> = {}
  for (const row of (waRes.data || [])) {
    const stage = row.funnel_status === "closed_lost"
      ? "perdido"
      : row.funnel_status === "closed_won"
        ? "cerrado"
        : (row.pipeline_stage || "nuevo")
    waByStage[stage] = (waByStage[stage] || 0) + 1
  }

  // Unificar por etapa
  const allStages = new Set([...Object.keys(leadsByStage), ...Object.keys(waByStage)])
  const stages = STAGES.filter(s => allStages.has(s)).map(s => {
    const leads = leadsByStage[s]?.total || 0
    const whatsapp = waByStage[s] || 0
    return {
      id: s,
      leads_total: leads,
      leads_whatsapp: whatsapp,
      leads_tokko: leadsByStage[s]?.bySource?.["Tokko Broker"] || 0,
      leads_manual: (leads) - (leadsByStage[s]?.bySource?.["Tokko Broker"] || 0),
      total: leads + whatsapp,
    }
  })

  // Totales generales
  const total = stages.reduce((acc, s) => acc + s.total, 0)
  const totalCerrado = (leadsByStage["cerrado"]?.total || 0) + (waByStage["cerrado"] || 0)
  const totalPerdido = (leadsByStage["perdido"]?.total || 0) + (waByStage["perdido"] || 0)
  const totalCerradosMasPerdidos = totalCerrado + totalPerdido
  const tasaCierreReal = totalCerradosMasPerdidos > 0
    ? Math.round((totalCerrado / totalCerradosMasPerdidos) * 100)
    : null

  // Leads activos (excluye cerrado y perdido)
  const totalActivos = stages
    .filter(s => s.id !== "cerrado" && s.id !== "perdido")
    .reduce((acc, s) => acc + s.total, 0)

  return {
    stages,
    summary: {
      total,
      total_activos: totalActivos,
      total_cerrado: totalCerrado,
      total_perdido: totalPerdido,
      tasa_cierre_real: tasaCierreReal,
      // Por origen
      total_whatsapp: stages.reduce((acc, s) => acc + s.leads_whatsapp, 0),
      total_tokko: stages.reduce((acc, s) => acc + s.leads_tokko, 0),
      total_manual: stages.reduce((acc, s) => acc + s.leads_manual, 0),
    }
  }
}
