import { NextRequest, NextResponse } from "next/server"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { getAdminDb, logAdminActivity, getClientIp } from "@/lib/admin-vakdor/logger"

type Params = { params: { pago_id: string } }

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const db = getAdminDb()
  const body = await request.json()
  const { monto, moneda, notas, periodo_mes } = body

  // Traer el pago actual para conocer su agencia y período vigente.
  const { data: actual, error: findErr } = await db
    .from("pagos_agencia")
    .select("id, agencia_id, periodo_mes")
    .eq("id", params.pago_id)
    .single()
  if (findErr || !actual) {
    return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 })
  }

  // Armar el patch solo con los campos provistos (no pisar con null lo que no vino).
  const patch: Record<string, unknown> = {}
  if (monto !== undefined) patch.monto = monto
  if (moneda !== undefined) patch.moneda = moneda
  if (notas !== undefined) patch.notas = notas

  // Si cambia el período, verificar que no choque con otro pago de la misma agencia.
  if (periodo_mes !== undefined && periodo_mes !== actual.periodo_mes) {
    const { data: choque } = await db
      .from("pagos_agencia")
      .select("id")
      .eq("agencia_id", actual.agencia_id)
      .eq("periodo_mes", periodo_mes)
      .neq("id", params.pago_id)
      .maybeSingle()
    if (choque) {
      return NextResponse.json(
        { error: "PERIODO_OCUPADO", mensaje: "Ya hay un pago para ese mes en esta agencia." },
        { status: 409 }
      )
    }
    patch.periodo_mes = periodo_mes
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ success: true, data: actual })
  }

  const { data, error } = await db
    .from("pagos_agencia")
    .update(patch)
    .eq("id", params.pago_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminActivity({
    adminId: auth.payload.sub,
    accion: "PAGO_EDITADO",
    entidadTipo: "pago",
    entidadId: params.pago_id,
    detalleJson: { ...patch },
    ipAddress: getClientIp(request),
  })

  return NextResponse.json({ success: true, data })
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const db = getAdminDb()
  const { error } = await db
    .from("pagos_agencia")
    .delete()
    .eq("id", params.pago_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminActivity({
    adminId: auth.payload.sub,
    accion: "PAGO_ELIMINADO",
    entidadTipo: "pago",
    entidadId: params.pago_id,
    ipAddress: getClientIp(request),
  })

  return NextResponse.json({ ok: true })
}
