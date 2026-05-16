import { NextRequest, NextResponse } from "next/server"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { getAdminDb, logAdminActivity, getClientIp } from "@/lib/admin-vakdor/logger"

type Params = { params: { id: string } }

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const db = getAdminDb()
  const { id } = params
  const body = await request.json()
  const { accion, cantidad, motivo } = body

  if (!["agregar", "restar", "establecer"].includes(accion)) {
    return NextResponse.json({ error: "Acción inválida" }, { status: 400 })
  }
  if (!motivo?.trim()) {
    return NextResponse.json({ error: "El motivo es obligatorio" }, { status: 400 })
  }
  if (typeof cantidad !== "number" || cantidad < 0) {
    return NextResponse.json({ error: "Cantidad inválida" }, { status: 400 })
  }

  // Obtener saldo actual
  const { data: creditosActuales, error: fetchError } = await db
    .from("agency_ai_credits")
    .select("credits_total, credits_used")
    .eq("agency_id", id)
    .maybeSingle()

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })

  const creditosDisponibles = creditosActuales
    ? creditosActuales.credits_total - creditosActuales.credits_used
    : 0
  const totalActual = creditosActuales?.credits_total || 0

  let nuevoTotal: number
  switch (accion) {
    case "agregar":
      nuevoTotal = totalActual + cantidad
      break
    case "restar":
      nuevoTotal = Math.max(0, totalActual - cantidad)
      break
    case "establecer":
      nuevoTotal = cantidad
      break
    default:
      nuevoTotal = totalActual
  }

  // Actualizar o crear registro de créditos
  let updateError
  if (creditosActuales) {
    const { error } = await db
      .from("agency_ai_credits")
      .update({ credits_total: nuevoTotal, updated_at: new Date().toISOString() })
      .eq("agency_id", id)
    updateError = error
  } else {
    const { error } = await db.from("agency_ai_credits").insert({
      agency_id: id,
      credits_total: nuevoTotal,
      credits_used: 0,
    })
    updateError = error
  }

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  // Registrar en log de créditos
  await db.from("log_creditos_admin").insert({
    agencia_id: id,
    admin_id: auth.payload.sub,
    accion,
    cantidad_anterior: totalActual,
    cantidad_nueva: nuevoTotal,
    motivo,
    timestamp: new Date().toISOString(),
  })

  await logAdminActivity({
    adminId: auth.payload.sub,
    accion: `CREDITOS_${accion.toUpperCase()}`,
    entidadTipo: "agencia",
    entidadId: id,
    detalleJson: { accion, cantidad, motivo, anterior: totalActual, nuevo: nuevoTotal },
    ipAddress: getClientIp(request),
  })

  return NextResponse.json({
    success: true,
    creditos: { total: nuevoTotal, disponible: nuevoTotal - (creditosActuales?.credits_used || 0) },
  })
}
