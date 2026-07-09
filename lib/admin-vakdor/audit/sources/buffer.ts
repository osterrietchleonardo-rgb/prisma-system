// Fuente: Buffer (organic social, LinkedIn personal — el "motor" del contenido).
// Receta confirmada leyendo el código fuente del @bufferapp/cli instalado
// (aggregatedPostMetrics-*.mjs) y probada en vivo: POST https://api.buffer.com/graphql,
// body {query, variables}, query envuelve el input en $input: AggregatedPostMetricsInput!.
import { type Semaforo } from "@/lib/admin-vakdor/audit/types"

const ORG_ID = "6a4ac991dd4b5f5519aeb552"
const LINKEDIN_PERSONAL_CHANNEL = "6a4aca1140483446287320b8"

const QUERY = `query AggregatedPostMetrics($input: AggregatedPostMetricsInput!) {
  aggregatedPostMetrics(input: $input) {
    metrics { type name value unit }
    metricsUpdatedAt
  }
}`

interface BufferMetric {
  type: string
  name: string
  value: number
  unit: string
}

function fmt(metrics: BufferMetric[], type: string, suffix = ""): string {
  const m = metrics.find((x) => x.type === type)
  if (!m) return "no disponible"
  if (m.unit === "percentage") return `${m.value}%`
  return `${m.value}${suffix}`
}

export async function getBufferMetrics(): Promise<{ grupos: Record<string, Record<string, string>>; sub: Semaforo }> {
  try {
    const token = process.env.BUFFER_API_KEY
    if (!token) throw new Error("Falta BUFFER_API_KEY")

    const end = new Date()
    const start = new Date(end.getTime() - 30 * 86400000)
    const iso = (d: Date) => `${d.toISOString().slice(0, 10)}T00:00:00Z`

    const res = await fetch("https://api.buffer.com/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-buffer-client-id": "prisma-audit",
        "x-buffer-client-name": "prisma-audit",
      },
      body: JSON.stringify({
        query: QUERY,
        variables: {
          input: {
            organizationId: ORG_ID,
            startDateTime: iso(start),
            endDateTime: iso(end),
            channelIds: [LINKEDIN_PERSONAL_CHANNEL],
          },
        },
      }),
      cache: "no-store",
    })
    const body = await res.json()
    if (!res.ok || body.errors) {
      throw new Error(`buffer -> ${res.status}: ${JSON.stringify(body.errors ?? body).slice(0, 200)}`)
    }
    const metrics: BufferMetric[] = body?.data?.aggregatedPostMetrics?.metrics ?? []
    const postCount = metrics.find((m) => m.type === "postCount")?.value ?? 0

    const grupo = {
      Posts: fmt(metrics, "postCount"),
      Impresiones: fmt(metrics, "impressions"),
      Alcance: fmt(metrics, "reach"),
      Reacciones: fmt(metrics, "reactions"),
      Comentarios: fmt(metrics, "comments"),
      Engagement: fmt(metrics, "engagementRate"),
    }

    return {
      grupos: { "Orgánico · LinkedIn personal (30d)": grupo },
      sub: postCount > 0 ? "verde" : "gris",
    }
  } catch {
    return {
      grupos: { "Orgánico · LinkedIn personal (30d)": { Estado: "no disponible" } },
      sub: "gris",
    }
  }
}
