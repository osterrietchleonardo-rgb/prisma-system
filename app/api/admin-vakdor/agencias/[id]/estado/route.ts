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
  const { accion, motivo } = body

  if (!["pausar", "activar", "eliminar"].includes(accion)) {
    return NextResponse.json({ error: "Acción inválida" }, { status: 400 })
  }

  const nuevoEstado = accion === "pausar" ? "pausado" : accion === "activar" ? "activo" : "eliminado"

  const updatePayload: Record<string, unknown> = { estado: nuevoEstado }
  if (accion === "eliminar") {
    updatePayload.deleted_at = new Date().toISOString()
  } else if (accion === "activar") {
    updatePayload.deleted_at = null
  }

  const { error: agenciaError } = await db.from("agencies").update(updatePayload).eq("id", id)
  if (agenciaError) return NextResponse.json({ error: agenciaError.message }, { status: 500 })

  // Si pausa o elimina la agencia, también pausa/elimina todos sus usuarios
  if (accion === "pausar" || accion === "eliminar") {
    const profileUpdate: Record<string, unknown> = {
      estado: nuevoEstado,
      tokens_invalidos_desde: new Date().toISOString(),
    }
    if (accion === "eliminar") profileUpdate.deleted_at = new Date().toISOString()
    await db.from("profiles").update(profileUpdate).eq("agency_id", id)
  } else if (accion === "activar") {
    // Reactivar usuarios que no estén individualmente eliminados
    await db.from("profiles").update({ estado: "activo", tokens_invalidos_desde: null }).eq("agency_id", id).neq("estado", "eliminado")
  }

  await logAdminActivity({
    adminId: auth.payload.sub,
    accion: `AGENCIA_${accion.toUpperCase()}`,
    entidadTipo: "agencia",
    entidadId: id,
    detalleJson: { motivo },
    ipAddress: getClientIp(request),
  })

  return NextResponse.json({ success: true, estado: nuevoEstado })
}
