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
  count: number
  conversionFromStartPct: number
  dropoffPct: number
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
 * Consulta en tiempo real a Microsoft Clarity Live Insights API
 */
export async function fetchClarityMetrics(): Promise<ClarityMetricsPayload> {
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

  try {
    const token = process.env.CLARITY_API_KEY
    if (!token) return defaultRes

    const res = await fetchWithTimeout("https://www.clarity.ms/export-data/api/v1/project-live-insights", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      cache: "no-store",
    }, 3500)

    if (res.ok) {
      const data = await res.json()
      let rageClicksPct = 0
      let deadClicksPct = 0
      let quickBacksPct = 0
      let avgScrollDepthPct = 0
      let totalSessions = 0
      let distinctUsers = 0
      let pagesPerSession = 0
      let scriptErrorsPct = 0
      let popularPages: Array<{ url: string; visitsCount: number }> = []

      for (const item of data) {
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

      return {
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
    }
  } catch (err) {
    console.error("Clarity fetch error:", err)
  }

  return defaultRes
}

/**
 * Consulta en tiempo real a Google Analytics 4 (Property 526455345).
 */
export async function fetchGa4Metrics(periodo: "7d" | "30d" | "90d"): Promise<{
  funnel: FunnelStageData[]
  overallStats: OverallGa4Stats
  trafficSources: TrafficSource[]
  deviceBreakdown: DeviceBreakdown
  topPagesPerformance: TopPagePerformance[]
}> {
  const days = getPeriodDays(periodo)
  const startDate = `${days}daysAgo`

  let funnelRows: any[] = []
  let overallRows: any[] = []
  let trafficRows: any[] = []
  let deviceRows: any[] = []
  let topPageRows: any[] = []

  try {
    const token = await getGoogleAccessToken("https://www.googleapis.com/auth/analytics.readonly")

    // Run parallel reports for GA4
    const [resFunnel, resOverall, resTraffic, resDevices, resPages] = await Promise.all([
      fetchWithTimeout(`https://analyticsdata.googleapis.com/v1beta/properties/${GA_PROPERTY_ID}:runReport`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          dateRanges: [{ startDate, endDate: "today" }],
          dimensions: [{ name: "eventName" }, { name: "pagePath" }],
          metrics: [{ name: "eventCount" }, { name: "activeUsers" }],
          limit: 300,
        }),
        cache: "no-store",
      }, 3500),

      fetchWithTimeout(`https://analyticsdata.googleapis.com/v1beta/properties/${GA_PROPERTY_ID}:runReport`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          dateRanges: [{ startDate, endDate: "today" }],
          metrics: [{ name: "activeUsers" }, { name: "newUsers" }, { name: "sessions" }, { name: "screenPageViews" }, { name: "bounceRate" }],
        }),
        cache: "no-store",
      }, 3500),

      fetchWithTimeout(`https://analyticsdata.googleapis.com/v1beta/properties/${GA_PROPERTY_ID}:runReport`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          dateRanges: [{ startDate, endDate: "today" }],
          dimensions: [{ name: "sessionDefaultChannelGroup" }],
          metrics: [{ name: "sessions" }, { name: "activeUsers" }],
          limit: 10,
        }),
        cache: "no-store",
      }, 3500),

      fetchWithTimeout(`https://analyticsdata.googleapis.com/v1beta/properties/${GA_PROPERTY_ID}:runReport`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          dateRanges: [{ startDate, endDate: "today" }],
          dimensions: [{ name: "deviceCategory" }],
          metrics: [{ name: "activeUsers" }, { name: "sessions" }],
        }),
        cache: "no-store",
      }, 3500),

      fetchWithTimeout(`https://analyticsdata.googleapis.com/v1beta/properties/${GA_PROPERTY_ID}:runReport`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          dateRanges: [{ startDate, endDate: "today" }],
          dimensions: [{ name: "pagePath" }],
          metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }, { name: "newUsers" }, { name: "bounceRate" }, { name: "userEngagementDuration" }],
          limit: 8,
        }),
        cache: "no-store",
      }, 3500),
    ])

    if (resFunnel.ok) funnelRows = (await resFunnel.json()).rows ?? []
    if (resOverall.ok) overallRows = (await resOverall.json()).rows ?? []
    if (resTraffic.ok) trafficRows = (await resTraffic.json()).rows ?? []
    if (resDevices.ok) deviceRows = (await resDevices.json()).rows ?? []
    if (resPages.ok) topPageRows = (await resPages.json()).rows ?? []
  } catch (err) {
    console.error("GA4 fetch error:", err)
  }

  // 1. Funnel Processing
  let homeCount = 0
  let demoCount = 0
  let video100Count = 0
  let callPageCount = 0
  let formCount = 0
  let meetingCount = 0

  for (const r of funnelRows) {
    const eventName = r.dimensionValues?.[0]?.value ?? ""
    const pagePath = r.dimensionValues?.[1]?.value ?? ""
    const count = Number(r.metricValues?.[0]?.value ?? 0)

    if (pagePath === "/" || pagePath === "/home" || pagePath === "") {
      if (eventName === "page_view" || eventName === "session_start") homeCount += count
    }
    if (pagePath.includes("/demostracion") || pagePath.includes("/demo")) {
      if (eventName === "page_view" || eventName === "session_start") demoCount += count
    }
    if (eventName === "video_complete") {
      video100Count += count
    }
    if (pagePath.includes("/call") || pagePath.includes("/contact") || pagePath.includes("/agendar")) {
      if (eventName === "page_view" || eventName === "session_start") callPageCount += count
    }
    if (eventName === "form_submit" || eventName === "clic_agendar_demo") {
      formCount += count
    }
    if (eventName === "schedule_call" || eventName === "generate_lead") {
      meetingCount += count
    }
  }

  const rawStages = [
    { key: "home", label: "Home", sublabel: "vakdor.com/", count: homeCount },
    { key: "demo", label: "Demostración", sublabel: "/demostracion", count: demoCount },
    { key: "video_100", label: "Video 100%", sublabel: "Reproducción completa (video_complete)", count: video100Count },
    { key: "call", label: "Página /call", sublabel: "/call (Agendar)", count: callPageCount },
    { key: "form", label: "Formulario", sublabel: "Formulario completado", count: formCount },
    { key: "meeting", label: "Reunión Solicitada", sublabel: "Lead cualificado CAPI", count: meetingCount },
  ]

  const topCount = rawStages[0].count
  const funnel = rawStages.map((stage, idx) => {
    const prevCount = idx === 0 ? stage.count : rawStages[idx - 1].count
    const conversionFromStartPct = topCount > 0 ? Math.min(100, Math.round((stage.count / topCount) * 1000) / 10) : 0
    const dropoffPct = idx === 0 ? 0 : (prevCount > 0 ? Math.max(0, Math.round((1 - stage.count / prevCount) * 1000) / 10) : 0)

    return { ...stage, conversionFromStartPct, dropoffPct }
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

  return { funnel, overallStats, trafficSources, deviceBreakdown, topPagesPerformance }
}

/**
 * Consulta a Google Search Console.
 */
export async function fetchGscQueries(periodo: "7d" | "30d" | "90d"): Promise<GscQuery[]> {
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
      return rows.map((r: any) => ({
        query: r.keys?.[0] ?? "",
        clicks: Number(r.clicks ?? 0),
        impressions: Number(r.impressions ?? 0),
        position: r.position != null ? Math.round(r.position * 10) / 10 : 0,
      }))
    }
  } catch (err) {
    console.error("GSC fetch error:", err)
  }

  return []
}

/**
 * Consulta a Buffer (GraphQL API)
 */
export async function fetchBufferRanking(periodo: "7d" | "30d" | "90d"): Promise<{
  totalPosts: number
  totalImpressions: number
  reach: number
  totalReactions: number
  totalComments: number
  avgEngagementRate: number
  publicaciones: BufferPublishedPost[]
}> {
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
        const body = await res.json()
        const metrics = body?.data?.aggregatedPostMetrics?.metrics ?? []
        postCount = metrics.find((m: any) => m.type === "postCount")?.value ?? 0
        totalImpressions = metrics.find((m: any) => m.type === "impressions")?.value ?? 0
        reach = metrics.find((m: any) => m.type === "reach")?.value ?? 0
        totalReactions = metrics.find((m: any) => m.type === "reactions")?.value ?? 0
        totalComments = metrics.find((m: any) => m.type === "comments")?.value ?? 0
        avgEngagementRate = metrics.find((m: any) => m.type === "engagementRate")?.value ?? 0
      }
    }
  } catch (err) {
    console.error("Buffer fetch error:", err)
  }

  return {
    totalPosts: postCount,
    totalImpressions,
    reach,
    totalReactions,
    totalComments,
    avgEngagementRate,
    publicaciones: [],
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
  const [ga4, gscQueries, bufferStats, contentDistribution, clarityStats] = await Promise.all([
    fetchGa4Metrics(periodo),
    fetchGscQueries(periodo),
    fetchBufferRanking(periodo),
    fetchMarketingContentStats(),
    fetchClarityMetrics(),
  ])

  return {
    funnel: ga4.funnel,
    periodo,
    gscQueries,
    bufferStats,
    contentDistribution,
    overallStats: ga4.overallStats,
    trafficSources: ga4.trafficSources,
    deviceBreakdown: ga4.deviceBreakdown,
    topPagesPerformance: ga4.topPagesPerformance,
    clarityStats,
    updatedAt: new Date().toISOString(),
  }
}
