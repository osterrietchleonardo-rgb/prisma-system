import { NextRequest, NextResponse } from "next/server"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { getAdminDb, logAdminActivity, getClientIp } from "@/lib/admin-vakdor/logger"

export const dynamic = "force-dynamic"

const CATEGORIAS = ["suscripcion", "infraestructura", "proxy", "marketing", "sueldos", "impuestos", "financiero", "otro"]
const TIPOS = ["fijo", "variable"]
const RECURRENCIAS = ["mensual", "anual", "unico"]
const MONEDAS = ["USD", "ARS"]

export async function GET(request: NextRequest) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth
  const db = getAdminDb()
  const { data, error } = await db
    .from("finance_expenses")
    .select("*")
    .order("fecha_inicio", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ expenses: data || [] })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  let b: Record<string, unknown>
  try { b = await request.json() } catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }) }

  const concepto = String(b.concepto || "").trim()
  const monto = Number(b.monto)
  if (!concepto || !Number.isFinite(monto) || monto < 0) {
    return NextResponse.json({ error: "Concepto y monto válido son requeridos" }, { status: 400 })
  }
  const categoria = CATEGORIAS.includes(String(b.categoria)) ? String(b.categoria) : "otro"
  const tipo = TIPOS.includes(String(b.tipo)) ? String(b.tipo) : "fijo"
  const recurrencia = RECURRENCIAS.includes(String(b.recurrencia)) ? String(b.recurrencia) : "mensual"
  const moneda = MONEDAS.includes(String(b.moneda)) ? String(b.moneda) : "USD"
  const fecha_inicio = String(b.fecha_inicio || new Date().toISOString().slice(0, 10))

  const db = getAdminDb()
  const { data, error } = await db.from("finance_expenses").insert({
    concepto, categoria, tipo, monto, moneda, recurrencia, fecha_inicio,
    fecha_fin: b.fecha_fin ? String(b.fecha_fin) : null,
    proveedor: b.proveedor ? String(b.proveedor) : null,
    notas: b.notas ? String(b.notas) : null,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminActivity({
    adminId: auth.payload.sub, accion: "GASTO_CREADO", entidadTipo: "finance_expense",
    entidadId: data.id, detalleJson: { concepto, monto, moneda }, ipAddress: getClientIp(request),
  })
  return NextResponse.json({ expense: data })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  let b: Record<string, unknown>
  try { b = await request.json() } catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }) }
  const id = String(b.id || "")
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const campos = ["concepto", "categoria", "tipo", "monto", "moneda", "recurrencia", "fecha_inicio", "fecha_fin", "proveedor", "notas", "activo"]
  for (const c of campos) if (c in b) patch[c] = b[c]

  const db = getAdminDb()
  const { data, error } = await db.from("finance_expenses").update(patch).eq("id", id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminActivity({
    adminId: auth.payload.sub, accion: "GASTO_EDITADO", entidadTipo: "finance_expense",
    entidadId: id, ipAddress: getClientIp(request),
  })
  return NextResponse.json({ expense: data })
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth
  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 })

  const db = getAdminDb()
  const { error } = await db.from("finance_expenses").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminActivity({
    adminId: auth.payload.sub, accion: "GASTO_ELIMINADO", entidadTipo: "finance_expense",
    entidadId: id, ipAddress: getClientIp(request),
  })
  return NextResponse.json({ ok: true })
}
