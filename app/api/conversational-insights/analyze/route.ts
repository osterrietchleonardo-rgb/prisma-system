export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

// ─── Types ────────────────────────────────────────────────────────────────────
interface ConvMetricas {
  // Ubicación
  zona?: string | null
  barrio_consultado?: string | null
  lugares_cercanos_buscados?: string[]
  // Propiedad buscada
  tipo_operacion?: string | null
  tipo_propiedad?: string | null
  ambientes_buscados?: number | null
  superficie_min_m2?: number | null
  superficie_max_m2?: number | null
  propiedad_consultada?: string | null
  caracteristicas_propiedad?: string[]
  amenities_consultados?: string[]
  servicios_consultados?: string[]
  // Presupuesto
  presupuesto_min?: number | null
  presupuesto_max?: number | null
  moneda_presupuesto?: string | null
  // Perfil del lead
  composicion_familiar?: string | null
  experiencia_compradora?: string | null
  motivo_busqueda?: string | null
  urgencia?: string | null
  es_inversor?: boolean | null
  tiene_preaprobacion_credito?: boolean | null
  apto_credito?: boolean | null
  necesita_vender_primero?: boolean | null
  // Intereses y necesidades
  intereses?: string[]
  necesidades?: string[]
  // Estado de avance
  visita_agendada?: boolean | null
  reserva_confirmada?: boolean | null
  solicito_hablar_con_humano?: boolean | null
  fue_derivado_a_humano?: boolean | null
  motivo_no_avance?: string | null
  // Seguimientos IA (conteo dentro de n8n para esta conversación)
  cantidad_seguimientos_ia?: number | null
}

interface ConvRow {
  id: string
  created_at: string
  last_message_at: string | null
  bot_active: boolean | null
  pipeline_stage: string | null
  follow_ups_sent: number | null
  funnel_status: string | null
  visit_status: string | null
  metricas: ConvMetricas | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function countItems(arr: (string | null | undefined)[]) {
  const counts: Record<string, number> = {}
  for (const item of arr) {
    if (item) counts[item] = (counts[item] || 0) + 1
  }
  const total = arr.filter(Boolean).length || 1
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ label, count, pct: Math.round((count / total) * 100) }))
}

function countTrue(arr: (boolean | null | undefined)[]) {
  return arr.filter(v => v === true).length
}

function avgNum(arr: (number | null | undefined)[]) {
  const vals = arr.filter(v => v !== null && v !== undefined) as number[]
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null
}

function safeMin(vals: number[]) { return vals.length > 0 ? Math.min(...vals) : null }
function safeMax(vals: number[]) { return vals.length > 0 ? Math.max(...vals) : null }

// ─── Temporal analysis (from wa_messages timestamps — no AI needed) ───────────
interface MsgRow { conversation_id: string; role: string; created_at: string }

function buildTemporalAnalysis(messages: MsgRow[], convRows: ConvRow[]) {
  const hourDist = Array(24).fill(0) as number[]
  const dayDist  = Array(7).fill(0) as number[]
  const leadMsgs = messages.filter(m => m.role === "lead")

  for (const m of leadMsgs) {
    const d = new Date(m.created_at)
    hourDist[d.getHours()]++
    dayDist[d.getDay()]++
  }

  const peakHour = hourDist.indexOf(Math.max(...hourDist))
  const peakDay  = dayDist.indexOf(Math.max(...dayDist))
  const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]

  // Avg conversation duration
  const convMsgMap: Record<string, Date[]> = {}
  for (const m of messages) {
    if (!convMsgMap[m.conversation_id]) convMsgMap[m.conversation_id] = []
    convMsgMap[m.conversation_id].push(new Date(m.created_at))
  }
  const durations: number[] = []
  for (const dates of Object.values(convMsgMap)) {
    if (dates.length >= 2) {
      dates.sort((a, b) => a.getTime() - b.getTime())
      const dur = (dates[dates.length - 1].getTime() - dates[0].getTime()) / 60000
      if (dur > 0 && dur < 10080) durations.push(dur)
    }
  }

  return {
    hour_distribution: hourDist.map((count, hour) => ({ hour, count })),
    day_distribution: dayDist.map((count, day) => ({ day, day_name: dayNames[day], count })),
    peak_hour: peakHour,
    peak_day: peakDay,
    peak_day_name: dayNames[peakDay],
    total_lead_messages: leadMsgs.length,
    bot_active_count: convRows.filter(c => c.bot_active).length,
    human_attended_count: convRows.filter(c => !c.bot_active).length,
    avg_duration_min: durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null,
    heatmap: Array.from({ length: 7 }, (_, day) => ({
      day,
      day_name: dayNames[day],
      hours: Array.from({ length: 24 }, (__, hour) => ({
        hour,
        count: messages.filter(m => {
          const d = new Date(m.created_at)
          return m.role === "lead" && d.getDay() === day && d.getHours() === hour
        }).length,
      })),
    })),
  }
}

// ─── Derive nivel_compromiso from available metricas fields ──────────────────
// metricas doesn't include this field directly, so we derive it:
// alto  → reservó O agendó visita
// medio → calificado (tiene tipo/presupuesto) + urgencia activa + sin motivo_no_avance
// bajo  → explorador puro o con motivo de no avance claro
function derivarCompromiso(m: ConvMetricas): "alto" | "medio" | "bajo" {
  if (m.reserva_confirmada || m.visita_agendada) return "alto"
  const urgenciaActiva = ["inmediata", "corto_plazo", "medio_plazo"].includes(m.urgencia || "")
  const calificado = !!(m.tipo_operacion || m.tipo_propiedad || m.presupuesto_min)
  if (calificado && urgenciaActiva && !m.motivo_no_avance) return "medio"
  return "bajo"
}

// ─── Core aggregation — reads metricas, does all math, returns 6 blocks ───────
function aggregateFromMetricas(
  convRows: ConvRow[],
  temporalData: ReturnType<typeof buildTemporalAnalysis>
) {
  const total = convRows.length
  const ms = convRows.map(c => c.metricas).filter(Boolean) as ConvMetricas[]
  const pctOf = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0

  // ── Base counts ──
  const visitas        = countTrue(ms.map(m => m.visita_agendada))
  const reservas       = countTrue(ms.map(m => m.reserva_confirmada))
  const pidioHumano    = countTrue(ms.map(m => m.solicito_hablar_con_humano))
  const derivados      = countTrue(ms.map(m => m.fue_derivado_a_humano))
  const aptoCr         = countTrue(ms.map(m => m.apto_credito))
  const necesitaVender = countTrue(ms.map(m => m.necesita_vender_primero))
  const calificados    = ms.filter(m => m.tipo_operacion || m.tipo_propiedad || m.presupuesto_min).length

  // follow_ups_sent (columna nativa) = plantillas de seguimiento enviadas realmente
  const seguimientos_plantillas = convRows.reduce((acc, c) => acc + (c.follow_ups_sent || 0), 0)
  // cantidad_seguimientos_ia (en metricas) = seguimientos que n8n registró en esa conversación
  const avg_seguimientos_ia_por_conv = avgNum(ms.map(m => m.cantidad_seguimientos_ia))

  // ── Compromiso derivado (nivel_compromiso no existe en metricas) ──
  const compromisos = ms.reduce(
    (acc, m) => { acc[derivarCompromiso(m)]++; return acc },
    { alto: 0, medio: 0, bajo: 0 }
  )

  // ── Block 1: KPIs generales ──
  const kpis = {
    chats_unicos:             total,
    leads_calificados:        calificados,
    visitas_agendadas:        visitas,
    reservas_confirmadas:     reservas,
    solicitudes_humano:       pidioHumano,
    derivados_a_humano:       derivados,
    apto_credito:             aptoCr,
    necesitan_vender_antes:   necesitaVender,
    seguimientos_ia:          seguimientos_plantillas,   // plantillas enviadas (columna nativa)
    tasa_consulta_visita:     pctOf(visitas),
    tasa_visita_reserva:      visitas > 0 ? Math.round((reservas / visitas) * 100) : 0,
    tasa_calificacion:        pctOf(calificados),
    tasa_derivacion_efectiva: pidioHumano > 0 ? Math.round((derivados / pidioHumano) * 100) : null,
    compromisos_alto:         compromisos.alto,
    compromisos_medio:        compromisos.medio,
    compromisos_bajo:         compromisos.bajo,
    inversores:               countTrue(ms.map(m => m.es_inversor)),
    con_preaprobacion:        countTrue(ms.map(m => m.tiene_preaprobacion_credito)),
    chats_bot_activo:         convRows.filter(c => c.bot_active).length,
    visitas_confirmadas:      convRows.filter(c =>
      c.visit_status === "confirmed" || c.visit_status === "attended"
    ).length,
  }

  // ── Block 2: Funnel de conversión ──
  const funnel = {
    chats_recibidos:    { count: total,       pct: 100 },
    leads_calificados:  { count: calificados,  pct: pctOf(calificados) },
    visita_agendada:    { count: visitas,      pct: pctOf(visitas) },
    reserva_confirmada: { count: reservas,     pct: pctOf(reservas) },
  }

  // ── Block 3: Perfil del lead buscador ──
  const lead_profile = {
    tipo_operacion:       countItems(ms.map(m => m.tipo_operacion)).slice(0, 5),
    tipo_propiedad:       countItems(ms.map(m => m.tipo_propiedad)).slice(0, 8),
    ambientes:            countItems(ms.map(m => m.ambientes_buscados?.toString() ?? null)).slice(0, 6),
    composicion_familiar: countItems(ms.map(m => m.composicion_familiar)).slice(0, 6),
    urgencia:             countItems(ms.map(m => m.urgencia)).slice(0, 5),
    experiencia:          countItems(ms.map(m => m.experiencia_compradora)).slice(0, 3),
    inversores:           countTrue(ms.map(m => m.es_inversor)),
    con_preaprobacion:    countTrue(ms.map(m => m.tiene_preaprobacion_credito)),
    primera_vez:          ms.filter(m => m.experiencia_compradora === "primera_vez").length,
    top_intereses:        countItems(ms.flatMap(m => m.intereses || [])).slice(0, 10),
    top_necesidades:      countItems(ms.flatMap(m => m.necesidades || [])).slice(0, 10),
    top_amenities:        countItems(ms.flatMap(m => m.amenities_consultados || [])).slice(0, 8),
    top_servicios:        countItems(ms.flatMap(m => m.servicios_consultados || [])).slice(0, 8),
    top_caracteristicas:  countItems(ms.flatMap(m => m.caracteristicas_propiedad || [])).slice(0, 8),
    top_lugares_cercanos: countItems(ms.flatMap(m => m.lugares_cercanos_buscados || [])).slice(0, 8),
    top_motivos:          countItems(ms.map(m => m.motivo_busqueda)).slice(0, 8),
    top_barrios:          countItems(ms.map(m => m.barrio_consultado)).slice(0, 10),
    causas_no_avance:     countItems(ms.map(m => m.motivo_no_avance)).slice(0, 8),
    presupuesto_compra_avg_usd: avgNum(
      ms.filter(m => m.tipo_operacion === "compra" && m.moneda_presupuesto === "USD")
        .map(m => m.presupuesto_max || m.presupuesto_min)
    ),
    presupuesto_alquiler_avg_ars: avgNum(
      ms.filter(m => m.tipo_operacion === "alquiler" && m.moneda_presupuesto === "ARS")
        .map(m => m.presupuesto_max || m.presupuesto_min)
    ),
  }

  // ── Block 4: Análisis de demanda ──
  const propTypes = ["departamento", "casa", "ph", "duplex", "local_comercial", "terreno", "oficina", "country"]
  const tasa_visita_por_tipo = propTypes.map(tp => {
    const g = ms.filter(m => m.tipo_propiedad === tp)
    const v = g.filter(m => m.visita_agendada).length
    return { label: tp, total: g.length, visitas: v, tasa: g.length > 0 ? Math.round((v / g.length) * 100) : 0 }
  }).filter(x => x.total > 0)

  const tasa_visita_por_operacion = ["compra", "alquiler", "inversion"].map(op => {
    const g = ms.filter(m => m.tipo_operacion === op)
    const v = g.filter(m => m.visita_agendada).length
    return { label: op, total: g.length, visitas: v, tasa: g.length > 0 ? Math.round((v / g.length) * 100) : 0 }
  }).filter(x => x.total > 0)

  const usdRows = ms.filter(m => m.moneda_presupuesto === "USD")
  const arsRows = ms.filter(m => m.moneda_presupuesto === "ARS")

  // Superficie promedio buscada
  const superficieMin = avgNum(ms.filter(m => m.superficie_min_m2).map(m => m.superficie_min_m2))
  const superficieMax = avgNum(ms.filter(m => m.superficie_max_m2).map(m => m.superficie_max_m2))

  const demand_analysis = {
    top_zonas:              countItems(ms.map(m => m.zona)).slice(0, 10),
    top_barrios:            countItems(ms.map(m => m.barrio_consultado)).slice(0, 10),
    tipo_propiedad_demanda: countItems(ms.map(m => m.tipo_propiedad)).slice(0, 8),
    tipo_operacion_demanda: countItems(ms.map(m => m.tipo_operacion)).slice(0, 5),
    ambientes_demanda:      countItems(ms.map(m => m.ambientes_buscados?.toString() ?? null)).slice(0, 6),
    superficie_avg_m2:      { min: superficieMin, max: superficieMax },
    tasa_visita_por_tipo_propiedad: tasa_visita_por_tipo,
    tasa_visita_por_operacion,
    presupuesto_compra_usd: {
      avg: avgNum(usdRows.map(m => m.presupuesto_max || m.presupuesto_min)),
      min: safeMin(usdRows.filter(m => m.presupuesto_min).map(m => m.presupuesto_min!)),
      max: safeMax(usdRows.filter(m => m.presupuesto_max).map(m => m.presupuesto_max!)),
    },
    presupuesto_alquiler_ars: {
      avg: avgNum(arsRows.map(m => m.presupuesto_max || m.presupuesto_min)),
      min: safeMin(arsRows.filter(m => m.presupuesto_min).map(m => m.presupuesto_min!)),
      max: safeMax(arsRows.filter(m => m.presupuesto_max).map(m => m.presupuesto_max!)),
    },
  }

  // ── Block 5: Comportamiento temporal ──
  const temporal = {
    ...temporalData,
    urgencia_breakdown: countItems(ms.map(m => m.urgencia)),
    nivel_compromiso:   [
      { label: "alto",  count: compromisos.alto,  pct: pctOf(compromisos.alto) },
      { label: "medio", count: compromisos.medio, pct: pctOf(compromisos.medio) },
      { label: "bajo",  count: compromisos.bajo,  pct: pctOf(compromisos.bajo) },
    ].filter(x => x.count > 0),
  }

  // ── Block 6: Calidad de atención ──
  // Objeciones: detectamos desde motivo_no_avance (texto libre) + campos de metricas
  // Complementamos con apto_credito, necesita_vender_primero para mayor precisión
  const motivosText   = ms.map(m => (m.motivo_no_avance || "").toLowerCase())
  const objPrecio     = motivosText.filter(t => /precio|presupuesto|caro|costoso|valor|rango/.test(t)).length
  const objUbicacion  = motivosText.filter(t => /ubicaci|zona|lejos|barrio|distancia|sector/.test(t)).length
  const objTamanio    = motivosText.filter(t => /ambiente|m2|peque|grande|tama|superficie|espacio/.test(t)).length
  const objCredito    = countTrue(ms.map(m =>
    // tiene_preaprobacion_credito=false con motivo que menciona crédito = objeción de crédito
    m.apto_credito && m.tiene_preaprobacion_credito === false
  ))
  const objPareja     = motivosText.filter(t => /pareja|esposa|esposo|familiar|decisi|convers/.test(t)).length
  const objTiempo     = motivosText.filter(t => /esperar|tiempo|recién|todav|despu[eé]s|no est[aá] list/.test(t)).length

  const objeciones_frecuencia = [
    { label: "Precio / presupuesto",        count: objPrecio,    pct: pctOf(objPrecio) },
    { label: "Ubicación / zona",            count: objUbicacion, pct: pctOf(objUbicacion) },
    { label: "Tamaño / ambientes",          count: objTamanio,   pct: pctOf(objTamanio) },
    { label: "Crédito pendiente",           count: objCredito,   pct: pctOf(objCredito) },
    { label: "Decisión en pareja/familia",  count: objPareja,    pct: pctOf(objPareja) },
    { label: "No está listo aún",           count: objTiempo,    pct: pctOf(objTiempo) },
  ].filter(x => x.count > 0).sort((a, b) => b.count - a.count)

  const attention = {
    tasa_resolucion_bot:        pctOf(total - pidioHumano),
    tasa_solicitud_humano:      pctOf(pidioHumano),
    tasa_derivacion_efectiva:   pidioHumano > 0 ? Math.round((derivados / pidioHumano) * 100) : null,
    objeciones_frecuencia,
    total_objeciones_detectadas: objeciones_frecuencia.reduce((a, b) => a + b.count, 0),
    causas_no_avance:           countItems(ms.map(m => m.motivo_no_avance)).slice(0, 8),
    // avg de seguimientos IA por conversación (desde metricas de n8n)
    avg_mensajes_lead:          avg_seguimientos_ia_por_conv,
    compromisos,
    bot_handled:                total - pidioHumano,
    human_escalated:            pidioHumano,
    avg_duration_min:           temporalData.avg_duration_min,
  }

  return { kpis, funnel, lead_profile, demand_analysis, temporal, attention }
}

// ─── Route handler ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await supabase
      .from("profiles").select("agency_id, role").eq("id", user.id).single()

    if (!profile?.agency_id || profile.role !== "director")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const body = await req.json()
    const { period, from: fromRaw, to: toRaw, force } = body as {
      period: string; from?: string; to?: string; force?: boolean
    }

    // ── Compute date range ──
    const now = new Date()
    let periodStart: Date
    let periodEnd = new Date(now)

    if (period === "7d")        periodStart = new Date(now.getTime() - 7 * 86400000)
    else if (period === "90d")  periodStart = new Date(now.getTime() - 90 * 86400000)
    else if (period === "custom" && fromRaw && toRaw) {
      periodStart = new Date(fromRaw); periodEnd = new Date(toRaw)
    } else {
      periodStart = new Date(now.getTime() - 30 * 86400000) // default: 30d
    }

    const agencyId = profile.agency_id
    const admin    = createAdminClient()

    // ── Cache freshness check (skip if force=true) ──
    const { data: existing } = await admin
      .from("dashboard_conversational_insights")
      .select("id, status, analyzed_at")
      .eq("agency_id", agencyId)
      .eq("period_start", periodStart.toISOString())
      .eq("period_end", periodEnd.toISOString())
      .maybeSingle()

    if (existing?.status === "processing")
      return NextResponse.json({ message: "already_processing", id: existing.id })

    if (!force && existing?.status === "complete" && existing.analyzed_at) {
      const ageH = (Date.now() - new Date(existing.analyzed_at).getTime()) / 3600000
      if (ageH < 6) return NextResponse.json({ message: "cache_fresh", id: existing.id, analyzed_at: existing.analyzed_at })
    }

    // ── Fetch wa_conversations in range (all native columns + metricas) ──
    const { data: convRows, error: convErr } = await admin
      .from("wa_conversations")
      .select("id, created_at, last_message_at, bot_active, pipeline_stage, follow_ups_sent, funnel_status, visit_status, metricas")
      .eq("agency_id", agencyId)
      .gte("last_message_at", periodStart.toISOString())
      .lte("last_message_at", periodEnd.toISOString())
      .order("last_message_at", { ascending: false })
      .limit(2000) // safe upper bound — pure SQL, no AI

    if (convErr) {
      console.error("[insights] convRows error:", convErr)
      return NextResponse.json({ error: "Database error" }, { status: 500 })
    }

    const rows = (convRows || []) as ConvRow[]
    const totalSessions = rows.length

    // ── Fetch wa_messages timestamps for temporal analysis (no content needed) ──
    const convIds = rows.map(c => c.id)
    let msgRows: MsgRow[] = []
    if (convIds.length > 0) {
      const { data } = await admin
        .from("wa_messages")
        .select("conversation_id, role, created_at")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: true })
      msgRows = (data || []) as MsgRow[]
    }

    // ── Build temporal data (timestamps only, no AI) ──
    const temporalData = buildTemporalAnalysis(msgRows, rows)

    // ── Aggregate all 6 blocks from metricas ──
    const { kpis, funnel, lead_profile, demand_analysis, temporal, attention } =
      aggregateFromMetricas(rows, temporalData)

    // ── Save / upsert result ──
    const { data: record } = await admin
      .from("dashboard_conversational_insights")
      .upsert({
        agency_id:          agencyId,
        period_start:       periodStart.toISOString(),
        period_end:         periodEnd.toISOString(),
        analyzed_at:        new Date().toISOString(),
        conversations_count: totalSessions,
        total_sessions:     totalSessions,
        processed_sessions: totalSessions, // all processed instantly
        failed_sessions:    0,
        status:             "complete",
        kpis, funnel, lead_profile, demand_analysis, temporal, attention,
      }, { onConflict: "agency_id,period_start,period_end" })
      .select("id")
      .single()

    // ── Return complete data directly ──
    return NextResponse.json({
      message:            "complete",
      id:                 record?.id,
      status:             "complete",
      conversations_count: totalSessions,
      total_sessions:     totalSessions,
      processed_sessions: totalSessions,
      analyzed_at:        new Date().toISOString(),
      kpis, funnel, lead_profile, demand_analysis, temporal, attention,
    })

  } catch (err) {
    console.error("[insights] error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
