import { getGoogleAccessToken } from "@/lib/admin-vakdor/finance/google-auth"
import { getAdminDb } from "@/lib/admin-vakdor/logger"

const GA_PROPERTY_ID = "526455345"
const GSC_SITE_URL = "https://www.vakdor.com/"
const BUFFER_ORG_ID = "6a4ac991dd4b5f5519aeb552"
const BUFFER_LINKEDIN_CHANNEL = "6a4aca1140483446287320b8"

export interface FunnelStageData {
  key: string
  label: string
  sublabel: string
  /** Personas distintas que llegaron a esta etapa (activeUsers de GA4, no eventos). */
  count: number
  /** Veces que ocurrió (eventCount). Una misma persona puede repetir. */
  eventCount: number
  conversionFromStartPct: number
  dropoffPct: number
}

/** Estado real de cada fuente de datos, para que el panel no muestre badges inventados. */
export interface SourceHealth {
  ga4: "ok" | "parcial" | "error"
  gsc: "ok" | "error"
  buffer: "ok" | "error" | "sin_token"
  clarity: "ok" | "cache" | "error" | "sin_token"
  /** Días que realmente cubre Clarity (su API solo admite 1, 2 o 3). */
  clarityDias: number
}

export interface GscQuery {
  query: string
  clicks: number
  impressions: number
  position: number
}

export interface BufferPublishedPost {
  id: string
  text: string
  createdAt: string
  formato: string
  angulo: string
}

export interface ContentDistribution {
  porFormato: Record<string, number>
  porAngulo: Record<string, number>
  totalPublicadas: number
  totalIdeas: number
}

export interface TrafficSource {
  channel: string
  sessions: number
  activeUsers: number
}

export interface DeviceBreakdown {
  desktopUsers: number
  mobileUsers: number
  desktopPct: number
  mobilePct: number
}

export interface TopPagePerformance {
  path: string
  views: number
  users: number
  newUsers: number
  bounceRatePct: number
  avgTimeSeconds: number
}

export interface OverallGa4Stats {
  activeUsers: number
  newUsers: number
  sessions: number
  screenPageViews: number
  avgBounceRatePct: number
}

export interface ClarityMetricsPayload {
  rageClicksPct: number
  deadClicksPct: number
  quickBacksPct: number
  avgScrollDepthPct: number
  totalSessions: number
  distinctUsers: number
  pagesPerSession: number
  scriptErrorsPct: number
  popularPages: Array<{ url: string; visitsCount: number }>
}

export interface MarketingMetricsPayload {
  funnel: FunnelStageData[]
  /** Personas que llenaron el formulario y el pre-filtro les negó el calendario. */
  noCalificados: number
  sources: SourceHealth
  periodo: "7d" | "30d" | "90d"
  gscQueries: GscQuery[]
  bufferStats: {
    totalPosts: number
    totalImpressions: number
    reach: number
    totalReactions: number
    totalComments: number
    avgEngagementRate: number
    publicaciones: BufferPublishedPost[]
  }
  contentDistribution: ContentDistribution
  overallStats: OverallGa4Stats
  trafficSources: TrafficSource[]
  deviceBreakdown: DeviceBreakdown
  topPagesPerformance: TopPagePerformance[]
  clarityStats: ClarityMetricsPayload
  updatedAt: string
}

function getPeriodDays(periodo: "7d" | "30d" | "90d"): number {
  if (periodo === "7d") return 7
  if (periodo === "90d") return 90
  return 30
}

/** Helper de fetch con timeout de 3.5s */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 3500) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    clearTimeout(id)
    return res
  } catch (err) {
    clearTimeout(id)
    throw err
  }
}

/**
 * Clarity solo devuelve 1, 2 o 3 días (no acepta 7/30/90) y su plan permite
 * apenas 10 llamadas por día. Por eso siempre se piden 3 días y se cachea:
 * abrir el panel varias veces no debe consumir la cuota.
 */
const CLARITY_DIAS = 3
const CLARITY_CACHE_MS = 6 * 60 * 60 * 1000
let clarityCache: { data: ClarityMetricsPayload; at: number } | null = null

/**
 * Consulta en tiempo real a Microsoft Clarity Live Insights API
 */
export async function fetchClarityMetrics(): Promise<{ data: ClarityMetricsPayload; estado: SourceHealth["clarity"] }> {
  const defaultRes: ClarityMetricsPayload = {
    rageClicksPct: 0,
    deadClicksPct: 0,
    quickBacksPct: 0,
    avgScrollDepthPct: 0,
    totalSessions: 0,
    distinctUsers: 0,
    pagesPerSession: 0,
    scriptErrorsPct: 0,
    popularPages: [],
  }

  const token = process.env.CLARITY_API_KEY
  if (!token) return { data: defaultRes, estado: "sin_token" }

  if (clarityCache && Date.now() - clarityCache.at < CLARITY_CACHE_MS) {
    return { data: clarityCache.data, estado: "cache" }
  }

  try {
    const res = await fetchWithTimeout(`https://www.clarity.ms/export-data/api/v1/project-live-insights?numOfDays=${CLARITY_DIAS}`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      cache: "no-store",
    }, 3500)

    if (res.ok) {
      const crudo = await res.json()
      let rageClicksPct = 0
      let deadClicksPct = 0
      let quickBacksPct = 0
      let avgScrollDepthPct = 0
      let totalSessions = 0
      let distinctUsers = 0
      let pagesPerSession = 0
      let scriptErrorsPct = 0
      let popularPages: Array<{ url: string; visitsCount: number }> = []

      for (const item of crudo) {
        if (item.metricName === "RageClickCount") {
          rageClicksPct = item.information?.[0]?.sessionsWithMetricPercentage ?? 0
        }
        if (item.metricName === "DeadClickCount") {
          deadClicksPct = item.information?.[0]?.sessionsWithMetricPercentage ?? 0
        }
        if (item.metricName === "QuickbackClick") {
          quickBacksPct = item.information?.[0]?.sessionsWithMetricPercentage ?? 0
        }
        if (item.metricName === "ScriptErrorCount") {
          scriptErrorsPct = item.information?.[0]?.sessionsWithMetricPercentage ?? 0
        }
        if (item.metricName === "ScrollDepth") {
          avgScrollDepthPct = Math.round((item.information?.[0]?.averageScrollDepth ?? 0) * 10) / 10
        }
        if (item.metricName === "Traffic") {
          totalSessions = Number(item.information?.[0]?.totalSessionCount ?? 0)
          distinctUsers = Number(item.information?.[0]?.distinctUserCount ?? 0)
          pagesPerSession = Number(item.information?.[0]?.pagesPerSessionPercentage ?? 0)
        }
        if (item.metricName === "PopularPages") {
          popularPages = (item.information ?? []).map((p: any) => ({
            url: p.url ?? "",
            visitsCount: Number(p.visitsCount ?? 0),
          }))
        }
      }

      const data: ClarityMetricsPayload = {
        rageClicksPct,
        deadClicksPct,
        quickBacksPct,
        avgScrollDepthPct,
        totalSessions,
        distinctUsers,
        pagesPerSession,
        scriptErrorsPct,
        popularPages,
      }
      clarityCache = { data, at: Date.now() }
      return { data, estado: "ok" }
    }
    console.error("Clarity respondió", res.status)
  } catch (err) {
    console.error("Clarity fetch error:", err)
  }

  // Si falló pero hay algo cacheado (aunque esté vencido), es mejor que ceros.
  if (clarityCache) return { data: clarityCache.data, estado: "cache" }
  return { data: defaultRes, estado: "error" }
}

/**
 * Consulta en tiempo real a Google Analytics 4 (Property 526455345).
 */
export async function fetchGa4Metrics(periodo: "7d" | "30d" | "90d"): Promise<{
  funnel: FunnelStageData[]
  noCalificados: number
  estado: SourceHealth["ga4"]
  overallStats: OverallGa4Stats
  trafficSources: TrafficSource[]
  deviceBreakdown: DeviceBreakdown
  topPagesPerformance: TopPagePerformance[]
}> {
  const days = getPeriodDays(periodo)
  const startDate = `${days}daysAgo`

  let eventRows: any[] = []
  let pageEventRows: any[] = []
  let overallRows: any[] = []
  let trafficRows: any[] = []
  let deviceRows: any[] = []
  let topPageRows: any[] = []
  let okReports = 0
  let totalReports = 0

  try {
    const token = await getGoogleAccessToken("https://www.googleapis.com/auth/analytics.readonly")

    const runReport = async (body: Record<string, unknown>): Promise<any[]> => {
      const res = await fetchWithTimeout(
        `https://analyticsdata.googleapis.com/v1beta/properties/${GA_PROPERTY_ID}:runReport`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ dateRanges: [{ startDate, endDate: "today" }], ...body }),
          cache: "no-store",
        },
        3500
      )
      if (!res.ok) throw new Error(`GA4 ${res.status}: ${await res.text()}`)
      return (await res.json()).rows ?? []
    }

    // allSettled: si un reporte se cae (timeout), los otros cuatro igual se muestran.
    const reports = await Promise.allSettled([
      // Eventos SIN pagePath: es la única forma de contar personas sin duplicarlas
      // (sumar activeUsers a través de varias rutas contaría dos veces al mismo).
      runReport({
        dimensions: [{ name: "eventName" }],
        metrics: [{ name: "activeUsers" }, { name: "eventCount" }],
        limit: 300,
      }),
      // Eventos POR ruta: se usa para el paso 1 (Home) y como respaldo histórico.
      runReport({
        dimensions: [{ name: "eventName" }, { name: "pagePath" }],
        metrics: [{ name: "activeUsers" }, { name: "eventCount" }],
        limit: 500,
      }),
      runReport({
        metrics: [{ name: "activeUsers" }, { name: "newUsers" }, { name: "sessions" }, { name: "screenPageViews" }, { name: "bounceRate" }],
      }),
      runReport({
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [{ name: "sessions" }, { name: "activeUsers" }],
        limit: 10,
      }),
      runReport({
        dimensions: [{ name: "deviceCategory" }],
        metrics: [{ name: "activeUsers" }, { name: "sessions" }],
      }),
      runReport({
        dimensions: [{ name: "pagePath" }],
        metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }, { name: "newUsers" }, { name: "bounceRate" }, { name: "userEngagementDuration" }],
        limit: 8,
      }),
    ])

    totalReports = reports.length
    const rowsOf = (i: number): any[] => {
      const r = reports[i]
      if (r.status === "fulfilled") {
        okReports++
        return r.value
      }
      console.error(`GA4 reporte ${i} falló:`, r.reason)
      return []
    }
    eventRows = rowsOf(0)
    pageEventRows = rowsOf(1)
    overallRows = rowsOf(2)
    trafficRows = rowsOf(3)
    deviceRows = rowsOf(4)
    topPageRows = rowsOf(5)
  } catch (err) {
    console.error("GA4 fetch error:", err)
  }

  const estado: SourceHealth["ga4"] =
    totalReports === 0 ? "error" : okReports === totalReports ? "ok" : okReports === 0 ? "error" : "parcial"

  // ---------------------------------------------------------------------------
  // EMBUDO REAL DE VAKDOR.COM (8 pasos), medido en PERSONAS (activeUsers).
  // Los nombres de evento son los que dispara el sitio (ver website/src/lib/analytics.ts).
  // ---------------------------------------------------------------------------

  /** Personas / veces de un evento, sin abrir por ruta (no duplica usuarios). */
  const byEvent = new Map<string, { users: number; events: number }>()
  for (const r of eventRows) {
    const name = r.dimensionValues?.[0]?.value ?? ""
    byEvent.set(name, {
      users: Number(r.metricValues?.[0]?.value ?? 0),
      events: Number(r.metricValues?.[1]?.value ?? 0),
    })
  }
  const ev = (name: string) => byEvent.get(name) ?? { users: 0, events: 0 }

  /** page_view de una ruta exacta (para el paso 1 y los respaldos históricos). */
  const pageView = (matches: (path: string) => boolean) => {
    let users = 0
    let events = 0
    for (const r of pageEventRows) {
      const name = r.dimensionValues?.[0]?.value ?? ""
      const path = r.dimensionValues?.[1]?.value ?? ""
      if (name !== "page_view" || !matches(path)) continue
      users += Number(r.metricValues?.[0]?.value ?? 0)
      events += Number(r.metricValues?.[1]?.value ?? 0)
    }
    return { users, events }
  }

  /**
   * Los eventos del embudo son nuevos. Para que los períodos de 30 y 90 días no
   * queden en cero, cada etapa toma el mayor entre el evento propio y su respaldo
   * histórico (la vista de página equivalente, que mide exactamente lo mismo).
   */
  const mejor = (...opciones: { users: number; events: number }[]) =>
    opciones.reduce((a, b) => (b.users > a.users ? b : a))

  const home = pageView((p) => p === "/" || p === "/home")
  const demo = mejor(ev("view_demostracion"), pageView((p) => p.startsWith("/demostracion")))
  const video100 = mejor(ev("vsl_watch_100"), ev("video_complete"))
  // clic_agendar_demo es el evento que ya venía disparando GTM en ese mismo botón.
  const clickAgendar = mejor(ev("click_agendar_cta"), ev("clic_agendar_demo"))
  const formulario = mejor(ev("view_prefilter_form"), pageView((p) => p.startsWith("/call")))
  const envioForm = mejor(ev("prefilter_submit"), ev("generate_lead"))
  const calendario = ev("view_calendar")
  const reserva = ev("schedule_call")

  const noCalificados = ev("prefilter_no_calificado").users

  const rawStages = [
    { key: "home", label: "Home", sublabel: "vakdor.com/", ...home },
    { key: "demo", label: "Ve la demostración", sublabel: "/demostracion", ...demo },
    { key: "video_100", label: "Termina el video", sublabel: "VSL completo al 100%", ...video100 },
    { key: "click_agendar", label: 'Aprieta "Agendar"', sublabel: "CTA hacia el formulario", ...clickAgendar },
    { key: "form_view", label: "Llega al formulario", sublabel: "Pre-filtro en pantalla (/call)", ...formulario },
    { key: "form_submit", label: "Envía el formulario", sublabel: "Pre-filtro completado", ...envioForm },
    { key: "calendar_view", label: "Llega al calendario", sublabel: "Solo leads calificados", ...calendario },
    { key: "schedule", label: "Confirma la reserva", sublabel: "Reunión agendada", ...reserva },
  ]

  const topCount = rawStages[0].users
  const funnel: FunnelStageData[] = rawStages.map((stage, idx) => {
    const prevCount = idx === 0 ? stage.users : rawStages[idx - 1].users
    // Sin tope al 100%: alguien puede entrar directo a /demostracion desde un
    // anuncio sin pasar por la home, y esconderlo falsearía el dato.
    const conversionFromStartPct = topCount > 0 ? Math.round((stage.users / topCount) * 1000) / 10 : 0
    const dropoffPct = idx === 0 ? 0 : prevCount > 0 ? Math.max(0, Math.round((1 - stage.users / prevCount) * 1000) / 10) : 0

    return {
      key: stage.key,
      label: stage.label,
      sublabel: stage.sublabel,
      count: stage.users,
      eventCount: stage.events,
      conversionFromStartPct,
      dropoffPct,
    }
  })

  // 2. Overall GA4 Stats
  const ovRow = overallRows[0]?.metricValues ?? []
  const overallStats: OverallGa4Stats = {
    activeUsers: Number(ovRow[0]?.value ?? 0),
    newUsers: Number(ovRow[1]?.value ?? 0),
    sessions: Number(ovRow[2]?.value ?? 0),
    screenPageViews: Number(ovRow[3]?.value ?? 0),
    avgBounceRatePct: Math.round(Number(ovRow[4]?.value ?? 0) * 100),
  }

  // 3. Traffic Sources
  const trafficSources: TrafficSource[] = trafficRows.map((r: any) => ({
    channel: r.dimensionValues?.[0]?.value ?? "Otro",
    sessions: Number(r.metricValues?.[0]?.value ?? 0),
    activeUsers: Number(r.metricValues?.[1]?.value ?? 0),
  }))

  // 4. Devices
  let desktopUsers = 0
  let mobileUsers = 0
  for (const r of deviceRows) {
    const cat = (r.dimensionValues?.[0]?.value ?? "").toLowerCase()
    const users = Number(r.metricValues?.[0]?.value ?? 0)
    if (cat === "desktop") desktopUsers += users
    else if (cat === "mobile" || cat === "tablet") mobileUsers += users
  }
  const totalDevUsers = Math.max(1, desktopUsers + mobileUsers)
  const deviceBreakdown: DeviceBreakdown = {
    desktopUsers,
    mobileUsers,
    desktopPct: Math.round((desktopUsers / totalDevUsers) * 100),
    mobilePct: Math.round((mobileUsers / totalDevUsers) * 100),
  }

  // 5. Top Pages Performance
  const topPagesPerformance: TopPagePerformance[] = topPageRows.map((r: any) => {
    const path = r.dimensionValues?.[0]?.value ?? "/"
    const views = Number(r.metricValues?.[0]?.value ?? 0)
    const users = Number(r.metricValues?.[1]?.value ?? 0)
    const newUsers = Number(r.metricValues?.[2]?.value ?? 0)
    const bounceRate = Number(r.metricValues?.[3]?.value ?? 0)
    const durationSeconds = Number(r.metricValues?.[4]?.value ?? 0)

    const avgTimeSeconds = users > 0 ? Math.round(durationSeconds / users) : 0
    const bounceRatePct = Math.round(bounceRate * 100)

    return { path, views, users, newUsers, bounceRatePct, avgTimeSeconds }
  })

  return { funnel, noCalificados, estado, overallStats, trafficSources, deviceBreakdown, topPagesPerformance }
}

/**
 * Consulta a Google Search Console.
 */
export async function fetchGscQueries(periodo: "7d" | "30d" | "90d"): Promise<{ data: GscQuery[]; estado: SourceHealth["gsc"] }> {
  try {
    const token = await getGoogleAccessToken("https://www.googleapis.com/auth/webmasters.readonly")
    const days = getPeriodDays(periodo)
    const end = new Date(Date.now() - 86400000)
    const start = new Date(Date.now() - days * 86400000)
    const iso = (d: Date) => d.toISOString().slice(0, 10)

    const res = await fetchWithTimeout(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GSC_SITE_URL)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: iso(start),
          endDate: iso(end),
          dimensions: ["query"],
          rowLimit: 12,
        }),
        cache: "no-store",
      },
      3500
    )

    if (res.ok) {
      const data = await res.json()
      const rows = data.rows ?? []
      return {
        data: rows.map((r: any) => ({
          query: r.keys?.[0] ?? "",
          clicks: Number(r.clicks ?? 0),
          impressions: Number(r.impressions ?? 0),
          position: r.position != null ? Math.round(r.position * 10) / 10 : 0,
        })),
        estado: "ok",
      }
    }
    console.error("GSC respondió", res.status)
  } catch (err) {
    console.error("GSC fetch error:", err)
  }

  return { data: [], estado: "error" }
}

/**
 * Consulta a Buffer (GraphQL API)
 */
export async function fetchBufferRanking(periodo: "7d" | "30d" | "90d"): Promise<{
  data: {
    totalPosts: number
    totalImpressions: number
    reach: number
    totalReactions: number
    totalComments: number
    avgEngagementRate: number
    publicaciones: BufferPublishedPost[]
  }
  estado: SourceHealth["buffer"]
}> {
  let estado: SourceHealth["buffer"] = "sin_token"
  let postCount = 0
  let totalImpressions = 0
  let reach = 0
  let totalReactions = 0
  let totalComments = 0
  let avgEngagementRate = 0

  try {
    const token = process.env.BUFFER_API_KEY
    if (token) {
      const days = getPeriodDays(periodo)
      const end = new Date()
      const start = new Date(end.getTime() - days * 86400000)
      const iso = (d: Date) => `${d.toISOString().slice(0, 10)}T00:00:00Z`

      const query = `query AggregatedPostMetrics($input: AggregatedPostMetricsInput!) {
        aggregatedPostMetrics(input: $input) {
          metrics { type name value unit }
        }
      }`

      const res = await fetchWithTimeout(
        "https://api.buffer.com/graphql",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            query,
            variables: {
              input: {
                organizationId: BUFFER_ORG_ID,
                startDateTime: iso(start),
                endDateTime: iso(end),
                channelIds: [BUFFER_LINKEDIN_CHANNEL],
              },
            },
          }),
          cache: "no-store",
        },
        3500
      )

      if (res.ok) {
        estado = "ok"
        const body = await res.json()
        const metrics = body?.data?.aggregatedPostMetrics?.metrics ?? []
        postCount = metrics.find((m: any) => m.type === "postCount")?.value ?? 0
        totalImpressions = metrics.find((m: any) => m.type === "impressions")?.value ?? 0
        reach = metrics.find((m: any) => m.type === "reach")?.value ?? 0
        totalReactions = metrics.find((m: any) => m.type === "reactions")?.value ?? 0
        totalComments = metrics.find((m: any) => m.type === "comments")?.value ?? 0
        avgEngagementRate = metrics.find((m: any) => m.type === "engagementRate")?.value ?? 0
      } else {
        estado = "error"
        console.error("Buffer respondió", res.status)
      }
    }
  } catch (err) {
    estado = "error"
    console.error("Buffer fetch error:", err)
  }

  return {
    data: {
      totalPosts: postCount,
      totalImpressions,
      reach,
      totalReactions,
      totalComments,
      avgEngagementRate,
      // Buffer solo devuelve totales agregados: no hay ranking por publicación.
      publicaciones: [],
    },
    estado,
  }
}

/**
 * Consulta a Supabase `marketing_ideas`
 */
export async function fetchMarketingContentStats(): Promise<ContentDistribution> {
  try {
    const db = getAdminDb()
    const { data, error } = await db
      .from("marketing_ideas")
      .select("estado, formato, angulo")

    if (error || !data) {
      return { porFormato: {}, porAngulo: {}, totalPublicadas: 0, totalIdeas: 0 }
    }

    const porFormato: Record<string, number> = {}
    const porAngulo: Record<string, number> = {}
    let totalPublicadas = 0

    for (const item of data) {
      const f = item.formato || "post_texto"
      const a = typeof item.angulo === "string" ? item.angulo.split("·")[0].trim() : "general"
      porFormato[f] = (porFormato[f] || 0) + 1
      porAngulo[a] = (porAngulo[a] || 0) + 1
      if (item.estado === "publicada") totalPublicadas++
    }

    return {
      porFormato,
      porAngulo,
      totalPublicadas,
      totalIdeas: data.length,
    }
  } catch {
    return { porFormato: {}, porAngulo: {}, totalPublicadas: 0, totalIdeas: 0 }
  }
}

/**
 * Orquestador de payload
 */
export async function loadMarketingMetricsPayload(periodo: "7d" | "30d" | "90d"): Promise<MarketingMetricsPayload> {
  const [ga4, gsc, buffer, contentDistribution, clarity] = await Promise.all([
    fetchGa4Metrics(periodo),
    fetchGscQueries(periodo),
    fetchBufferRanking(periodo),
    fetchMarketingContentStats(),
    fetchClarityMetrics(),
  ])

  return {
    funnel: ga4.funnel,
    noCalificados: ga4.noCalificados,
    sources: {
      ga4: ga4.estado,
      gsc: gsc.estado,
      buffer: buffer.estado,
      clarity: clarity.estado,
      clarityDias: CLARITY_DIAS,
    },
    periodo,
    gscQueries: gsc.data,
    bufferStats: buffer.data,
    contentDistribution,
    overallStats: ga4.overallStats,
    trafficSources: ga4.trafficSources,
    deviceBreakdown: ga4.deviceBreakdown,
    topPagesPerformance: ga4.topPagesPerformance,
    clarityStats: clarity.data,
    updatedAt: new Date().toISOString(),
  }
}
