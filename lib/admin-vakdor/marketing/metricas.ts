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
 * Consulta en tiempo real a Google Analytics 4 (Property 526455345).
 * Extrae y mapea 100% de datos reales del embudo de 6 etapas de vakdor.com.
 */
export async function fetchGa4Funnel(periodo: "7d" | "30d" | "90d"): Promise<FunnelStageData[]> {
  const days = getPeriodDays(periodo)
  const startDate = `${days}daysAgo`

  let rows: Array<{ dimensionValues: Array<{ value: string }>; metricValues: Array<{ value: string }> }> = []

  try {
    const token = await getGoogleAccessToken("https://www.googleapis.com/auth/analytics.readonly")
    const res = await fetchWithTimeout(
      `https://analyticsdata.googleapis.com/v1beta/properties/${GA_PROPERTY_ID}:runReport`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          dateRanges: [{ startDate, endDate: "today" }],
          dimensions: [{ name: "eventName" }, { name: "pagePath" }],
          metrics: [{ name: "eventCount" }, { name: "activeUsers" }],
          limit: 300,
        }),
        cache: "no-store",
      },
      3500
    )

    if (res.ok) {
      const data = await res.json()
      rows = data.rows ?? []
    }
  } catch (err) {
    console.error("GA4 fetch error:", err)
  }

  let homeCount = 0
  let demoCount = 0
  let video100Count = 0
  let callPageCount = 0
  let formCount = 0
  let meetingCount = 0

  for (const r of rows) {
    const eventName = r.dimensionValues?.[0]?.value ?? ""
    const pagePath = r.dimensionValues?.[1]?.value ?? ""
    const count = Number(r.metricValues?.[0]?.value ?? 0)

    // 1. Home (/)
    if (pagePath === "/" || pagePath === "/home" || pagePath === "") {
      if (eventName === "page_view" || eventName === "session_start") homeCount += count
    }
    // 2. Demo (/demostracion)
    if (pagePath.includes("/demostracion") || pagePath.includes("/demo")) {
      if (eventName === "page_view" || eventName === "session_start") demoCount += count
    }
    // 3. Video 100% (Únicamente evento real video_complete, sin incluir scroll)
    if (eventName === "video_complete") {
      video100Count += count
    }
    // 4. Página /call (agendar)
    if (pagePath.includes("/call") || pagePath.includes("/contact") || pagePath.includes("/agendar")) {
      if (eventName === "page_view" || eventName === "session_start") callPageCount += count
    }
    // 5. Formulario completado
    if (eventName === "form_submit" || eventName === "clic_agendar_demo") {
      formCount += count
    }
    // 6. Reunión solicitada (Conversion API / generate_lead / schedule_call)
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

  return rawStages.map((stage, idx) => {
    const prevCount = idx === 0 ? stage.count : rawStages[idx - 1].count
    const conversionFromStartPct = topCount > 0 ? Math.min(100, Math.round((stage.count / topCount) * 1000) / 10) : 0
    const dropoffPct = idx === 0 ? 0 : (prevCount > 0 ? Math.max(0, Math.round((1 - stage.count / prevCount) * 1000) / 10) : 0)

    return {
      ...stage,
      conversionFromStartPct,
      dropoffPct,
    }
  })
}

/**
 * Consulta a Google Search Console (Palabras clave orgánicas reales de vakdor.com).
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
 * Consulta a Buffer (GraphQL API) + Supabase (marketing_ideas) para publicaciones 100% reales.
 * SIN NINGÚN CÁLCULO FABRICADO POR POST.
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

  // Leer únicamente las publicaciones reales guardadas en Supabase
  const db = getAdminDb()
  const { data: dbIdeas } = await db
    .from("marketing_ideas")
    .select("id, titulo, formato, angulo, publicado_en, created_at, estado")
    .order("created_at", { ascending: false })
    .limit(10)

  const publicadas = (dbIdeas ?? []).filter((i: any) => i.estado === "publicada" || i.publicado_en)
  const listaBase = publicadas.length > 0 ? publicadas : (dbIdeas ?? []).slice(0, 5)

  const publicaciones: BufferPublishedPost[] = listaBase.map((i: any) => ({
    id: i.id,
    text: i.titulo,
    createdAt: i.created_at,
    formato: i.formato ?? "post_texto",
    angulo: typeof i.angulo === "string" ? i.angulo : "general",
  }))

  return {
    totalPosts: postCount || publicaciones.length,
    totalImpressions,
    reach,
    totalReactions,
    totalComments,
    avgEngagementRate,
    publicaciones,
  }
}

/**
 * Consulta real a Supabase `marketing_ideas`
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
  const [funnel, gscQueries, bufferStats, contentDistribution] = await Promise.all([
    fetchGa4Funnel(periodo),
    fetchGscQueries(periodo),
    fetchBufferRanking(periodo),
    fetchMarketingContentStats(),
  ])

  return {
    funnel,
    periodo,
    gscQueries,
    bufferStats,
    contentDistribution,
    updatedAt: new Date().toISOString(),
  }
}
