export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { GoogleGenerativeAI } from "@google/generative-ai"

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY || "")

// ─── LLM Prompt ────────────────────────────────────────────────────────────
const ANALYSIS_PROMPT = `Analiza esta conversación de WhatsApp de una inmobiliaria. Extrae la información en JSON estricto. Si no hay dato suficiente, usa null o [] según corresponda.

CONVERSACIÓN:
{CONVERSATION_TEXT}

Responde ÚNICAMENTE con JSON válido (sin markdown):
{
  "barrio_consultado": null,
  "zona": null,
  "tipo_operacion": null,
  "tipo_propiedad": null,
  "ambientes_buscados": null,
  "presupuesto_min": null,
  "presupuesto_max": null,
  "moneda_presupuesto": null,
  "composicion_familiar": null,
  "experiencia_compradora": null,
  "motivo_busqueda": null,
  "intereses": [],
  "necesidades": [],
  "apto_credito": null,
  "necesita_vender_primero": null,
  "visita_agendada": false,
  "reserva_confirmada": false,
  "urgencia": null,
  "es_inversor": null,
  "tiene_preaprobacion_credito": null,
  "motivo_no_avance": null,
  "solicito_hablar_con_humano": false,
  "fue_derivado_a_humano": false,
  "cantidad_mensajes_lead": 0,
  "expreso_objecion_precio": false,
  "expreso_objecion_ubicacion": false,
  "expreso_objecion_tamanio": false,
  "expreso_objecion_documentacion": false,
  "nivel_compromiso": null
}

Reglas:
- tipo_operacion: "compra"|"alquiler"|"inversion"|null
- tipo_propiedad: "departamento"|"casa"|"ph"|"duplex"|"local_comercial"|"terreno"|"oficina"|"country"|null
- moneda_presupuesto: "USD"|"ARS"|null
- composicion_familiar: "pareja_sin_hijos"|"familia_con_hijos"|"soltero"|"adulto_mayor_solo"|"adultos_mayores_pareja"|null
- experiencia_compradora: "primera_vez"|"con_experiencia"|null
- urgencia: "inmediata"|"corto_plazo"|"medio_plazo"|"explorando"|null
- nivel_compromiso: "alto"|"medio"|"bajo"|null (alto=preguntó muchos detalles/quiere visita, bajo=preguntó 1 cosa y no siguió)`

interface ConvAnalysis {
  barrio_consultado: string | null
  zona: string | null
  tipo_operacion: string | null
  tipo_propiedad: string | null
  ambientes_buscados: number | null
  presupuesto_min: number | null
  presupuesto_max: number | null
  moneda_presupuesto: string | null
  composicion_familiar: string | null
  experiencia_compradora: string | null
  motivo_busqueda: string | null
  intereses: string[]
  necesidades: string[]
  apto_credito: boolean | null
  necesita_vender_primero: boolean | null
  visita_agendada: boolean
  reserva_confirmada: boolean
  urgencia: string | null
  es_inversor: boolean | null
  tiene_preaprobacion_credito: boolean | null
  motivo_no_avance: string | null
  solicito_hablar_con_humano: boolean
  fue_derivado_a_humano: boolean
  cantidad_mensajes_lead: number
  expreso_objecion_precio: boolean
  expreso_objecion_ubicacion: boolean
  expreso_objecion_tamanio: boolean
  expreso_objecion_documentacion: boolean
  nivel_compromiso: string | null
}

// ─── Helpers ───────────────────────────────────────────────────────────────
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

function countBoolean(arr: (boolean | null)[]) {
  return arr.filter(v => v === true).length
}

function avgNumber(arr: (number | null)[]) {
  const vals = arr.filter(v => v !== null) as number[]
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null
}

// ─── Temporal analysis from raw timestamps (no LLM needed) ──────────────
interface MsgTimestamp { conversation_id: string; role: string; created_at: string }

function buildTemporalAnalysis(messages: MsgTimestamp[], conversations: Array<{ id: string; created_at: string; last_message_at: string | null; bot_active: boolean | null }>) {
  // Hour distribution (0–23), day distribution (0=Sun…6=Sat)
  const hourDist = Array(24).fill(0) as number[]
  const dayDist = Array(7).fill(0) as number[]
  const leadMsgs = messages.filter(m => m.role === "lead")

  for (const m of leadMsgs) {
    const d = new Date(m.created_at)
    hourDist[d.getHours()]++
    dayDist[d.getDay()]++
  }

  const peakHour = hourDist.indexOf(Math.max(...hourDist))
  const peakDay = dayDist.indexOf(Math.max(...dayDist))
  const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]

  // Bot-active vs human-attended
  const botActive = conversations.filter(c => c.bot_active).length
  const humanAttended = conversations.filter(c => !c.bot_active).length

  // Avg conversation duration (first msg → last msg per conv)
  const convDurations: number[] = []
  const convMsgMap: Record<string, Date[]> = {}
  for (const m of messages) {
    if (!convMsgMap[m.conversation_id]) convMsgMap[m.conversation_id] = []
    convMsgMap[m.conversation_id].push(new Date(m.created_at))
  }
  for (const dates of Object.values(convMsgMap)) {
    if (dates.length >= 2) {
      dates.sort((a, b) => a.getTime() - b.getTime())
      const durMin = (dates[dates.length - 1].getTime() - dates[0].getTime()) / 60000
      if (durMin > 0 && durMin < 10080) convDurations.push(durMin) // < 1 week
    }
  }
  const avgDurationMin = convDurations.length
    ? Math.round(convDurations.reduce((a, b) => a + b, 0) / convDurations.length)
    : null

  return {
    hour_distribution: hourDist.map((count, hour) => ({ hour, count })),
    day_distribution: dayDist.map((count, day) => ({ day, day_name: dayNames[day], count })),
    peak_hour: peakHour,
    peak_day: peakDay,
    peak_day_name: dayNames[peakDay],
    total_lead_messages: leadMsgs.length,
    bot_active_count: botActive,
    human_attended_count: humanAttended,
    avg_duration_min: avgDurationMin,
    // Heatmap: day × hour matrix [day][hour] = count
    heatmap: Array.from({ length: 7 }, (_, day) => ({
      day,
      day_name: dayNames[day],
      hours: Array.from({ length: 24 }, (__, hour) => {
        const c = messages.filter(m => {
          const d = new Date(m.created_at)
          return m.role === "lead" && d.getDay() === day && d.getHours() === hour
        }).length
        return { hour, count: c }
      }),
    })),
  }
}

// ─── Aggregate all LLM results into 6 blocks ────────────────────────────
function aggregateAll(results: ConvAnalysis[], total: number, temporalData: ReturnType<typeof buildTemporalAnalysis>, convRows: any[]) {
  const pctOf = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0

  // ── Block 1: KPIs ──
  const visitas = countBoolean(results.map(r => r.visita_agendada))
  const reservas = countBoolean(results.map(r => r.reserva_confirmada))
  const pidioHumano = countBoolean(results.map(r => r.solicito_hablar_con_humano))
  const derivados = countBoolean(results.map(r => r.fue_derivado_a_humano))
  const aptoCr = countBoolean(results.map(r => r.apto_credito))
  const necesitaVender = countBoolean(results.map(r => r.necesita_vender_primero))
  const calificados = results.filter(r => r.tipo_operacion || r.tipo_propiedad || r.presupuesto_min).length

  const kpis = {
    chats_unicos: total,
    leads_calificados: calificados,
    visitas_agendadas: visitas,
    reservas_confirmadas: reservas,
    solicitudes_humano: pidioHumano,
    derivados_a_humano: derivados,
    apto_credito: aptoCr,
    necesitan_vender_antes: necesitaVender,
    tasa_consulta_visita: pctOf(visitas),
    tasa_visita_reserva: visitas > 0 ? Math.round((reservas / visitas) * 100) : 0,
    tasa_calificacion: pctOf(calificados),
    tasa_derivacion_efectiva: pidioHumano > 0 ? Math.round((derivados / pidioHumano) * 100) : null,
    compromisos_alto: results.filter(r => r.nivel_compromiso === "alto").length,
    compromisos_medio: results.filter(r => r.nivel_compromiso === "medio").length,
    compromisos_bajo: results.filter(r => r.nivel_compromiso === "bajo").length,
    inversores: countBoolean(results.map(r => r.es_inversor)),
    con_preaprobacion: countBoolean(results.map(r => r.tiene_preaprobacion_credito)),
    seguimientos_ia: convRows.reduce((acc, c) => acc + (c.follow_ups_sent || 0), 0),
  }

  // ── Block 2: Funnel ──
  const funnel = {
    chats_recibidos: { count: total, pct: 100 },
    leads_calificados: { count: calificados, pct: pctOf(calificados) },
    visita_agendada: { count: visitas, pct: pctOf(visitas) },
    reserva_confirmada: { count: reservas, pct: pctOf(reservas) },
  }

  // ── Block 3: Lead Profile ──
  const lead_profile = {
    tipo_operacion: countItems(results.map(r => r.tipo_operacion)).slice(0, 5),
    tipo_propiedad: countItems(results.map(r => r.tipo_propiedad)).slice(0, 8),
    ambientes: countItems(results.map(r => r.ambientes_buscados?.toString() ?? null)).slice(0, 6),
    composicion_familiar: countItems(results.map(r => r.composicion_familiar)).slice(0, 6),
    urgencia: countItems(results.map(r => r.urgencia)).slice(0, 5),
    experiencia: countItems(results.map(r => r.experiencia_compradora)).slice(0, 3),
    presupuesto_compra_avg_usd: avgNumber(
      results.filter(r => r.tipo_operacion === "compra" && r.moneda_presupuesto === "USD")
        .map(r => r.presupuesto_max || r.presupuesto_min)
    ),
    presupuesto_alquiler_avg_ars: avgNumber(
      results.filter(r => r.tipo_operacion === "alquiler" && r.moneda_presupuesto === "ARS")
        .map(r => r.presupuesto_max || r.presupuesto_min)
    ),
    inversores: countBoolean(results.map(r => r.es_inversor)),
    con_preaprobacion: countBoolean(results.map(r => r.tiene_preaprobacion_credito)),
    primera_vez: results.filter(r => r.experiencia_compradora === "primera_vez").length,
    top_intereses: countItems(results.flatMap(r => r.intereses || [])).slice(0, 10),
    top_necesidades: countItems(results.flatMap(r => r.necesidades || [])).slice(0, 10),
    top_motivos: countItems(results.map(r => r.motivo_busqueda)).slice(0, 8),
    top_barrios: countItems(results.map(r => r.barrio_consultado)).slice(0, 10),
    causas_no_avance: countItems(results.map(r => r.motivo_no_avance)).slice(0, 8),
  }

  // ── Block 4: Demand Analysis ──
  // Tasa de visita por tipo de propiedad
  const propTypes = ["departamento", "casa", "ph", "duplex", "local_comercial", "terreno", "oficina", "country"]
  const tasa_visita_por_tipo = propTypes.map(tp => {
    const group = results.filter(r => r.tipo_propiedad === tp)
    const visitasGroup = group.filter(r => r.visita_agendada).length
    return {
      label: tp,
      total: group.length,
      visitas: visitasGroup,
      tasa: group.length > 0 ? Math.round((visitasGroup / group.length) * 100) : 0,
    }
  }).filter(x => x.total > 0)

  const tasa_visita_por_operacion = ["compra", "alquiler", "inversion"].map(op => {
    const group = results.filter(r => r.tipo_operacion === op)
    const visitasGroup = group.filter(r => r.visita_agendada).length
    return {
      label: op,
      total: group.length,
      visitas: visitasGroup,
      tasa: group.length > 0 ? Math.round((visitasGroup / group.length) * 100) : 0,
    }
  }).filter(x => x.total > 0)

  const demand_analysis = {
    top_zonas: countItems(results.map(r => r.zona)).slice(0, 10),
    top_barrios: countItems(results.map(r => r.barrio_consultado)).slice(0, 10),
    tipo_propiedad_demanda: countItems(results.map(r => r.tipo_propiedad)).slice(0, 8),
    tipo_operacion_demanda: countItems(results.map(r => r.tipo_operacion)).slice(0, 5),
    ambientes_demanda: countItems(results.map(r => r.ambientes_buscados?.toString() ?? null)).slice(0, 6),
    tasa_visita_por_tipo_propiedad: tasa_visita_por_tipo,
    tasa_visita_por_operacion,
    presupuesto_compra_usd: {
      avg: avgNumber(results.filter(r => r.moneda_presupuesto === "USD").map(r => r.presupuesto_max || r.presupuesto_min)),
      min: (() => {
        const vals = results.filter(r => r.moneda_presupuesto === "USD" && r.presupuesto_min).map(r => r.presupuesto_min!)
        return vals.length > 0 ? Math.min(...vals) : null
      })(),
      max: (() => {
        const vals = results.filter(r => r.moneda_presupuesto === "USD" && r.presupuesto_max).map(r => r.presupuesto_max!)
        return vals.length > 0 ? Math.max(...vals) : null
      })(),
    },
    presupuesto_alquiler_ars: {
      avg: avgNumber(results.filter(r => r.moneda_presupuesto === "ARS").map(r => r.presupuesto_max || r.presupuesto_min)),
    },
  }

  // ── Block 5: Temporal Behavior ──
  const temporal = {
    ...temporalData,
    urgencia_breakdown: countItems(results.map(r => r.urgencia)),
    nivel_compromiso: countItems(results.map(r => r.nivel_compromiso)),
  }

  // ── Block 6: Attention Quality ──
  const objeciones = {
    precio: countBoolean(results.map(r => r.expreso_objecion_precio)),
    ubicacion: countBoolean(results.map(r => r.expreso_objecion_ubicacion)),
    tamanio: countBoolean(results.map(r => r.expreso_objecion_tamanio)),
    documentacion: countBoolean(results.map(r => r.expreso_objecion_documentacion)),
  }
  const totalObjeciones = Object.values(objeciones).reduce((a, b) => a + b, 0)

  const attention = {
    tasa_resolucion_bot: pctOf(total - pidioHumano), // nunca pidieron humano = bot lo resolvió
    tasa_solicitud_humano: pctOf(pidioHumano),
    tasa_derivacion_efectiva: pidioHumano > 0 ? Math.round((derivados / pidioHumano) * 100) : null,
    objeciones_frecuencia: [
      { label: "Precio / presupuesto", count: objeciones.precio, pct: pctOf(objeciones.precio) },
      { label: "Ubicación / zona", count: objeciones.ubicacion, pct: pctOf(objeciones.ubicacion) },
      { label: "Tamaño / ambientes", count: objeciones.tamanio, pct: pctOf(objeciones.tamanio) },
      { label: "Documentación / trámites", count: objeciones.documentacion, pct: pctOf(objeciones.documentacion) },
    ].filter(x => x.count > 0).sort((a, b) => b.count - a.count),
    total_objeciones_detectadas: totalObjeciones,
    causas_no_avance: countItems(results.map(r => r.motivo_no_avance)).slice(0, 8),
    avg_mensajes_lead: avgNumber(results.map(r => r.cantidad_mensajes_lead || null)),
    compromisos: {
      alto: results.filter(r => r.nivel_compromiso === "alto").length,
      medio: results.filter(r => r.nivel_compromiso === "medio").length,
      bajo: results.filter(r => r.nivel_compromiso === "bajo").length,
    },
    bot_handled: total - pidioHumano,
    human_escalated: pidioHumano,
    avg_duration_min: temporalData.avg_duration_min,
  }

  return { kpis, funnel, lead_profile, demand_analysis, temporal, attention }
}

// ─── LLM call per conversation ────────────────────────────────────────────
async function analyzeConversation(text: string): Promise<ConvAnalysis | null> {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" })
    const raw = (await model.generateContent(
      ANALYSIS_PROMPT.replace("{CONVERSATION_TEXT}", text.slice(0, 6000))
    )).response.text().trim()
    const clean = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()
    return JSON.parse(clean) as ConvAnalysis
  } catch {
    return null
  }
}

// ─── Route handler ────────────────────────────────────────────────────────
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
    const { period, from: fromRaw, to: toRaw, force } = body as { period: string; from?: string; to?: string; force?: boolean }

    const now = new Date()
    let periodStart: Date
    let periodEnd = new Date(now)

    if (period === "7d") periodStart = new Date(now.getTime() - 7 * 86400000)
    else if (period === "90d") periodStart = new Date(now.getTime() - 90 * 86400000)
    else if (period === "custom" && fromRaw && toRaw) {
      periodStart = new Date(fromRaw); periodEnd = new Date(toRaw)
    } else {
      periodStart = new Date(now.getTime() - 30 * 86400000)
    }

    const agencyId = profile.agency_id
    const admin = createAdminClient()

    // Cache freshness check (6h)
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

    // Fetch wa_conversations scoped to agency + period
    // Use last_message_at to capture ANY conversation active during this period, even if created months ago
    const { data: convRows } = await admin
      .from("wa_conversations")
      .select("id, created_at, last_message_at, bot_active, pipeline_stage, follow_ups_sent, metricas")
      .eq("agency_id", agencyId)
      .gte("last_message_at", periodStart.toISOString())
      .lte("last_message_at", periodEnd.toISOString())
      .limit(500)

    const convIds = (convRows || []).map(c => c.id)

    let msgRows: Array<{ conversation_id: string; role: string; content: string; created_at: string }> = []
    if (convIds.length > 0) {
      const { data } = await admin
        .from("wa_messages")
        .select("conversation_id, role, content, created_at")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: true })
      msgRows = data || []
    }

    // Group messages by conversation
    const convTextMap: Record<string, string[]> = {}
    for (const m of msgRows) {
      if (!convTextMap[m.conversation_id]) convTextMap[m.conversation_id] = []
      const label = m.role === "lead" ? "[Lead]" : m.role === "bot" ? "[Bot]" : "[Asesor]"
      convTextMap[m.conversation_id].push(`${label}: ${m.content}`)
    }

    const allConvs = Object.entries(convTextMap)
      .filter(([, lines]) => lines.length >= 2)
      .map(([id, lines]) => ({ id, text: lines.join("\n") }))

    const totalSessions = allConvs.length

    // Upsert processing record
    const { data: record } = await admin
      .from("dashboard_conversational_insights")
      .upsert({
        agency_id: agencyId,
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        analyzed_at: new Date().toISOString(),
        conversations_count: totalSessions,
        total_sessions: totalSessions,
        status: "processing",
        processed_sessions: 0,
        failed_sessions: 0,
        kpis: {}, funnel: {}, lead_profile: {},
        demand_analysis: {}, temporal: {}, attention: {},
      }, { onConflict: "agency_id,period_start,period_end" })
      .select("id").single()

    const recordId = record?.id

    // Build temporal data from raw timestamps (no LLM)
    const temporalData = buildTemporalAnalysis(msgRows, convRows || [])

    // Background batch processing
    const processPromise = (async () => {
      const results: ConvAnalysis[] = []
      let processed = 0, failed = 0
      const BATCH = 5

      for (let i = 0; i < allConvs.length; i += BATCH) {
        const batch = allConvs.slice(i, i + BATCH)
        const batchResults = await Promise.all(batch.map(c => analyzeConversation(c.text)))
        for (const r of batchResults) {
          if (r) { results.push(r); processed++ } else failed++
        }
        await admin.from("dashboard_conversational_insights")
          .update({ processed_sessions: processed, failed_sessions: failed })
          .eq("id", recordId)
      }

      const { kpis, funnel, lead_profile, demand_analysis, temporal, attention } =
        aggregateAll(results, totalSessions, temporalData, convRows || [])

      await admin.from("dashboard_conversational_insights").update({
        kpis, funnel, lead_profile, demand_analysis, temporal, attention,
        status: "complete",
        analyzed_at: new Date().toISOString(),
        processed_sessions: processed,
        failed_sessions: failed,
      }).eq("id", recordId)
    })()

    processPromise.catch(async err => {
      console.error("[insights] batch error:", err)
      if (recordId) await admin.from("dashboard_conversational_insights")
        .update({ status: "error", error_message: String(err) }).eq("id", recordId)
    })

    return NextResponse.json({ message: "processing_started", id: recordId, total_sessions: totalSessions }, { status: 202 })

  } catch (err) {
    console.error("[insights] error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
