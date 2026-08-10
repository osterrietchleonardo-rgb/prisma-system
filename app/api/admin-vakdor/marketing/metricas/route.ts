import { NextRequest, NextResponse } from "next/server"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { getAdminDb } from "@/lib/admin-vakdor/logger"
import { loadMarketingMetricsPayload } from "@/lib/admin-vakdor/marketing/metricas"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

export async function GET(request: NextRequest) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const url = new URL(request.url)
  const p = url.searchParams.get("periodo")
  const periodo = (p === "7d" || p === "90d" ? p : "30d") as "7d" | "30d" | "90d"

  const payload = await loadMarketingMetricsPayload(periodo)

  // Consultar si hay un análisis IA ya guardado para este período
  const db = getAdminDb()
  const { data: aiData } = await db
    .from("marketing_ai_analysis")
    .select("contenido, modelo, generated_at")
    .eq("periodo", periodo)
    .single()

  return NextResponse.json({
    metrics: payload,
    aiAnalysis: aiData ? { contenido: aiData.contenido, modelo: aiData.modelo, generated_at: aiData.generated_at } : null,
  })
}
