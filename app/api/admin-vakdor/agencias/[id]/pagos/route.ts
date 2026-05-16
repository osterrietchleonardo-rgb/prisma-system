import { NextRequest, NextResponse } from "next/server"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { getAdminDb, logAdminActivity, getClientIp } from "@/lib/admin-vakdor/logger"

type Params = { params: { id: string } }

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const db = getAdminDb()
  const { data, error } = await db
    .from("pagos_agencia")
    .select("*")
    .eq("agencia_id", params.id)
    .order("periodo_mes", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const db = getAdminDb()
  const { id } = params
  const body = await request.json()
  const { monto, moneda = "ARS", periodo_mes, notas, forzar = false } = body

  if (!monto || !periodo_mes) {
    return NextResponse.json({ error: "Monto y período son obligatorios" }, { status: 400 })
  }

  // Verificar si ya existe para ese período
  const { data: existing } = await db
    .from("pagos_agencia")
    .select("id")
    .eq("agencia_id", id)
    .eq("periodo_mes", periodo_mes)
    .maybeSingle()

  if (existing && !forzar) {
    return NextResponse.json(
      { error: "PAGO_EXISTENTE", mensaje: "Ya existe un pago para este período. Usa forzar: true para reemplazar." },
      { status: 409 }
    )
  }

  let pagoId: string
  if (existing && forzar) {
    const { data, error } = await db
      .from("pagos_agencia")
      .update({ monto, moneda, notas, registrado_por: auth.payload.sub, fecha_registro: new Date().toISOString() })
      .eq("id", existing.id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    pagoId = data.id
  } else {
    const { data, error } = await db
      .from("pagos_agencia")
      .insert({ agencia_id: id, monto, moneda, periodo_mes, notas, registrado_por: auth.payload.sub })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    pagoId = data.id
  }

  await logAdminActivity({
    adminId: auth.payload.sub,
    accion: "PAGO_REGISTRADO",
    entidadTipo: "agencia",
    entidadId: id,
    detalleJson: { pagoId, monto, moneda, periodo_mes },
    ipAddress: getClientIp(request),
  })

  return NextResponse.json({ success: true, pagoId })
}
