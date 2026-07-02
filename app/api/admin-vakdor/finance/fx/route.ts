import { NextRequest, NextResponse } from "next/server"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { getAdminDb, logAdminActivity, getClientIp } from "@/lib/admin-vakdor/logger"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth
  const db = getAdminDb()
  const { data, error } = await db.from("finance_fx").select("*").order("periodo_mes", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ fx: data || [] })
}

// Upsert de tipo de cambio USD→ARS para un mes.
export async function POST(request: NextRequest) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  let b: Record<string, unknown>
  try { b = await request.json() } catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }) }

  const periodo_mes = String(b.periodo_mes || "")
  const usd_ars = Number(b.usd_ars)
  if (!/^\d{4}-\d{2}$/.test(periodo_mes) || !Number.isFinite(usd_ars) || usd_ars <= 0) {
    return NextResponse.json({ error: "periodo_mes (YYYY-MM) y usd_ars > 0 requeridos" }, { status: 400 })
  }

  const db = getAdminDb()
  const { data, error } = await db.from("finance_fx").upsert({
    periodo_mes, usd_ars, fuente: b.fuente ? String(b.fuente) : "manual", updated_at: new Date().toISOString(),
  }, { onConflict: "periodo_mes" }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminActivity({
    adminId: auth.payload.sub, accion: "FX_ACTUALIZADO", entidadTipo: "finance_fx",
    entidadId: periodo_mes, detalleJson: { usd_ars }, ipAddress: getClientIp(request),
  })
  return NextResponse.json({ fx: data })
}
