import { NextRequest, NextResponse } from "next/server"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { getAdminDb, logAdminActivity, getClientIp } from "@/lib/admin-vakdor/logger"

export const dynamic = "force-dynamic"

const TIPOS = ["por_cobrar", "por_pagar", "anticipo_cliente", "prepago"]
const MONEDAS = ["USD", "ARS"]

// GET ?mes=YYYY-MM → saldos de capital de trabajo del mes
export async function GET(request: NextRequest) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const { searchParams } = new URL(request.url)
  const mes = searchParams.get("mes")
  const db = getAdminDb()
  let q = db.from("finance_working_capital").select("*").order("tipo", { ascending: true })
  if (mes) q = q.eq("periodo_mes", mes)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data || [] })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  let b: Record<string, unknown>
  try { b = await request.json() } catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }) }

  const periodo_mes = String(b.periodo_mes || "")
  const tipo = String(b.tipo || "")
  const monto = Number(b.monto)
  if (!/^\d{4}-\d{2}$/.test(periodo_mes)) return NextResponse.json({ error: "Período inválido (YYYY-MM)" }, { status: 400 })
  if (!TIPOS.includes(tipo)) return NextResponse.json({ error: "Clasificación inválida" }, { status: 400 })
  if (!Number.isFinite(monto) || monto < 0) return NextResponse.json({ error: "Monto inválido" }, { status: 400 })
  const moneda = MONEDAS.includes(String(b.moneda)) ? String(b.moneda) : "USD"

  const db = getAdminDb()
  const { data, error } = await db.from("finance_working_capital").insert({
    periodo_mes, tipo, monto, moneda,
    concepto: b.concepto ? String(b.concepto) : null,
    notas: b.notas ? String(b.notas) : null,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminActivity({
    adminId: auth.payload.sub, accion: "WC_CREADO", entidadTipo: "finance_working_capital",
    entidadId: data.id, detalleJson: { periodo_mes, tipo, monto, moneda }, ipAddress: getClientIp(request),
  })
  return NextResponse.json({ item: data })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  let b: Record<string, unknown>
  try { b = await request.json() } catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }) }
  const id = String(b.id || "")
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ("tipo" in b) {
    if (!TIPOS.includes(String(b.tipo))) return NextResponse.json({ error: "Clasificación inválida" }, { status: 400 })
    patch.tipo = String(b.tipo)
  }
  if ("monto" in b) {
    const m = Number(b.monto)
    if (!Number.isFinite(m) || m < 0) return NextResponse.json({ error: "Monto inválido" }, { status: 400 })
    patch.monto = m
  }
  if ("moneda" in b && MONEDAS.includes(String(b.moneda))) patch.moneda = String(b.moneda)
  if ("concepto" in b) patch.concepto = b.concepto ? String(b.concepto) : null
  if ("notas" in b) patch.notas = b.notas ? String(b.notas) : null

  const db = getAdminDb()
  const { data, error } = await db.from("finance_working_capital").update(patch).eq("id", id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminActivity({
    adminId: auth.payload.sub, accion: "WC_EDITADO", entidadTipo: "finance_working_capital",
    entidadId: id, ipAddress: getClientIp(request),
  })
  return NextResponse.json({ item: data })
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth
  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 })

  const db = getAdminDb()
  const { error } = await db.from("finance_working_capital").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminActivity({
    adminId: auth.payload.sub, accion: "WC_ELIMINADO", entidadTipo: "finance_working_capital",
    entidadId: id, ipAddress: getClientIp(request),
  })
  return NextResponse.json({ ok: true })
}
