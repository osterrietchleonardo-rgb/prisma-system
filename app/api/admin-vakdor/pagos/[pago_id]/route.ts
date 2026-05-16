import { NextRequest, NextResponse } from "next/server"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { getAdminDb, logAdminActivity, getClientIp } from "@/lib/admin-vakdor/logger"

type Params = { params: { pago_id: string } }

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const db = getAdminDb()
  const body = await request.json()
  const { monto, moneda, notas } = body

  const { data, error } = await db
    .from("pagos_agencia")
    .update({ monto, moneda, notas })
    .eq("id", params.pago_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminActivity({
    adminId: auth.payload.sub,
    accion: "PAGO_EDITADO",
    entidadTipo: "pago",
    entidadId: params.pago_id,
    detalleJson: { monto, moneda, notas },
    ipAddress: getClientIp(request),
  })

  return NextResponse.json({ success: true, data })
}
