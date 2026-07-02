/**
 * Finanzas — conectores a las cost APIs de los proveedores de IA.
 *
 * Verificado en vivo (2026-07-01) contra las cuentas reales:
 *  · OpenAI    GET /v1/organization/costs        → amount.value en DÓLARES (string decimal).
 *                group_by project_id + line_item; el line_item trae "modelo, input|output|cached input"
 *                y `quantity` trae los tokens.
 *  · Anthropic GET /v1/organizations/cost_report → amount en CENTAVOS (string) ⇒ /100 para USD.
 *                (confirmado por doc "lowest units (cents)" + saldo real de la consola).
 *                group_by workspace_id + description; description = "Claude X Usage - Input Tokens".
 *  · Google (Gemini/Vertex): se factura por Google Cloud → export a BigQuery (fase 2, pendiente).
 *
 * Todas las funciones normalizan a CostRow y devuelven costo SIEMPRE en USD.
 */

import { getGoogleAccessToken } from "./google-auth"

export interface CostRow {
  fecha: string // YYYY-MM-DD (día del bucket)
  proveedor: "openai" | "anthropic" | "google"
  proyecto: string // project_id (OpenAI) / workspace_id (Anthropic); "" = default/combinado
  proyecto_nombre: string
  modelo: string // line-item (OpenAI line_item / Anthropic description) — grano fino, evita colisiones
  costo_usd: number
  input_tokens: number | null
  output_tokens: number | null
  fuente: string
  raw: unknown
}

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10)

// ---------------------------- OpenAI ----------------------------
export async function fetchOpenAICosts(adminKey: string, from: Date, to: Date): Promise<CostRow[]> {
  const rows: CostRow[] = []
  const startTime = Math.floor(from.getTime() / 1000)
  const endTime = Math.floor(to.getTime() / 1000)
  let page: string | undefined

  for (let guard = 0; guard < 100; guard++) {
    const url = new URL("https://api.openai.com/v1/organization/costs")
    url.searchParams.set("start_time", String(startTime))
    url.searchParams.set("end_time", String(endTime))
    url.searchParams.set("bucket_width", "1d")
    url.searchParams.append("group_by[]", "project_id")
    url.searchParams.append("group_by[]", "line_item")
    url.searchParams.set("limit", "180")
    if (page) url.searchParams.set("page", page)

    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${adminKey}` } })
    if (!res.ok) throw new Error(`OpenAI costs ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const json = (await res.json()) as OpenAICostsResponse

    for (const b of json.data ?? []) {
      const fecha = ymd((b.start_time ?? 0) * 1000)
      for (const r of b.results ?? []) {
        const costo = Number(r.amount?.value ?? 0)
        if (!costo) continue
        const li = r.line_item ?? ""
        const qty = typeof r.quantity === "number" ? r.quantity : null
        const isInput = /input/i.test(li) && !/cached/i.test(li)
        const isOutput = /output/i.test(li)
        rows.push({
          fecha,
          proveedor: "openai",
          proyecto: r.project_id ?? "",
          proyecto_nombre: r.project_name ?? "",
          modelo: li,
          costo_usd: costo,
          input_tokens: isInput ? qty : null,
          output_tokens: isOutput ? qty : null,
          fuente: "openai_costs_api",
          raw: r,
        })
      }
    }
    if (json.has_more && json.next_page) page = json.next_page
    else break
  }
  return rows
}

// -------------------------- Anthropic --------------------------
export async function fetchAnthropicCosts(adminKey: string, from: Date, to: Date): Promise<CostRow[]> {
  const rows: CostRow[] = []
  const startIso = from.toISOString().slice(0, 19) + "Z"
  const endIso = to.toISOString().slice(0, 19) + "Z"
  let page: string | undefined

  for (let guard = 0; guard < 100; guard++) {
    const url = new URL("https://api.anthropic.com/v1/organizations/cost_report")
    url.searchParams.set("starting_at", startIso)
    url.searchParams.set("ending_at", endIso)
    url.searchParams.append("group_by[]", "workspace_id")
    url.searchParams.append("group_by[]", "description")
    url.searchParams.set("limit", "31") // el cost_report solo soporta 1d → máx 31 buckets/página
    if (page) url.searchParams.set("page", page)

    const res = await fetch(url.toString(), {
      headers: {
        "x-api-key": adminKey,
        "anthropic-version": "2023-06-01",
        "User-Agent": "PRISMA-Finance/1.0",
      },
    })
    if (!res.ok) throw new Error(`Anthropic cost_report ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const json = (await res.json()) as AnthropicCostResponse

    for (const b of json.data ?? []) {
      const fecha = (b.starting_at ?? "").slice(0, 10)
      for (const r of b.results ?? []) {
        const costo = Number(r.amount ?? 0) / 100 // centavos → USD
        if (!costo) continue
        rows.push({
          fecha,
          proveedor: "anthropic",
          proyecto: r.workspace_id ?? "",
          proyecto_nombre: r.workspace_id ? "" : "Default workspace",
          modelo: r.description ?? r.model ?? "",
          costo_usd: costo,
          input_tokens: null, // cost_report da costo, no token counts (eso está en usage_report)
          output_tokens: null,
          fuente: "anthropic_cost_report",
          raw: r,
        })
      }
    }
    if (json.has_more && json.next_page) page = json.next_page
    else break
  }
  return rows
}

// ---------------------------- Gemini (BigQuery FOCUS export) ----------------------------
// Verificado en vivo (2026-07-02): ServiceName = 'Gemini API', BilledCost en USD (BillingCurrency),
// fecha = DATE(ChargePeriodStart). El export tiene lag (puede tardar 1-2 días en aparecer).
const GCP_BILLING_TABLE =
  process.env.GCP_BILLING_TABLE ||
  "agenciaia-vakdor.gcp_billing_immutable_01C1A9_D657DE_356B00_us.gcp_billing_export_focus_01C1A9_D657DE_356B00"
const GCP_BILLING_LOCATION = process.env.GCP_BILLING_LOCATION || "US"

export async function fetchGeminiCosts(from: Date, to: Date): Promise<CostRow[]> {
  const projectId = process.env.PROJECT_ID
  if (!projectId) throw new Error("Falta PROJECT_ID de Google")
  const token = await getGoogleAccessToken()

  const sql = `
    SELECT DATE(ChargePeriodStart) AS fecha,
           ChargeDescription AS item,
           ANY_VALUE(BillingCurrency) AS currency,
           SUM(BilledCost) AS costo,
           SUM(ConsumedQuantity) AS cantidad,
           ANY_VALUE(ConsumedUnit) AS unidad
    FROM \`${GCP_BILLING_TABLE}\`
    WHERE ServiceName = 'Gemini API'
      AND ChargePeriodStart >= TIMESTAMP('${from.toISOString()}')
      AND ChargePeriodStart < TIMESTAMP('${to.toISOString()}')
    GROUP BY 1, 2
    ORDER BY 1`

  const res = await fetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql, useLegacySql: false, location: GCP_BILLING_LOCATION, timeoutMs: 30000, maxResults: 10000 }),
    cache: "no-store",
  })
  const j = (await res.json()) as BigQueryResponse
  if (!res.ok) throw new Error(`BigQuery ${res.status}: ${JSON.stringify(j).slice(0, 200)}`)

  const fields = (j.schema?.fields || []).map((f) => f.name)
  const idx = (n: string) => fields.indexOf(n)
  const rows: CostRow[] = []
  for (const row of j.rows || []) {
    const cell = (n: string) => row.f[idx(n)]?.v ?? null
    const costo = Number(cell("costo") || 0)
    if (!costo) continue
    const item = (cell("item") as string) || ""
    const unidad = ((cell("unidad") as string) || "").toLowerCase()
    const cantidad = cell("cantidad") != null ? Number(cell("cantidad")) : null
    const esTokens = unidad.includes("token")
    rows.push({
      fecha: cell("fecha") as string,
      proveedor: "google",
      proyecto: "",
      proyecto_nombre: "Gemini API",
      modelo: item,
      costo_usd: costo,
      input_tokens: esTokens && /input/i.test(item) ? cantidad : null,
      output_tokens: esTokens && /output/i.test(item) ? cantidad : null,
      fuente: "gcp_bigquery",
      raw: Object.fromEntries(fields.map((f, i) => [f, row.f[i]?.v])),
    })
  }
  return rows
}

// -------------------------- tipos crudos --------------------------
interface OpenAICostsResponse {
  data?: Array<{
    start_time?: number
    results?: Array<{
      amount?: { value?: string; currency?: string }
      quantity?: number
      line_item?: string
      project_id?: string
      project_name?: string
    }>
  }>
  has_more?: boolean
  next_page?: string
}

interface AnthropicCostResponse {
  data?: Array<{
    starting_at?: string
    results?: Array<{
      amount?: string
      currency?: string
      workspace_id?: string | null
      description?: string
      model?: string
      token_type?: string
    }>
  }>
  has_more?: boolean
  next_page?: string
}

interface BigQueryResponse {
  schema?: { fields?: Array<{ name: string }> }
  rows?: Array<{ f: Array<{ v: unknown }> }>
}
