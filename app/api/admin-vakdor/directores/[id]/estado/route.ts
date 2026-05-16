import { NextRequest, NextResponse } from "next/server"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { getAdminDb, logAdminActivity, getClientIp } from "@/lib/admin-vakdor/logger"

type Params = { params: { id: string } }

async function handleEstadoChange(
  request: NextRequest,
  { params }: Params,
  rolEsperado: "director" | "asesor"
) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const db = getAdminDb()
  const { id } = params
  const body = await request.json()
  const { accion, motivo } = body

  if (!["pausar", "activar", "eliminar"].includes(accion)) {
    return NextResponse.json({ error: "Acción inválida" }, { status: 400 })
  }

  // Verificar que el perfil existe y tiene el rol correcto
  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("id, email, role, estado, agency_id")
    .eq("id", id)
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 })
  }

  const nuevoEstado = accion === "pausar" ? "pausado" : accion === "activar" ? "activo" : "eliminado"
  const updatePayload: Record<string, unknown> = { estado: nuevoEstado }

  if (accion === "pausar" || accion === "eliminar") {
    // Invalidar todas las sesiones activas inmediatamente
    updatePayload.tokens_invalidos_desde = new Date().toISOString()
  }

  if (accion === "eliminar") {
    updatePayload.deleted_at = new Date().toISOString()
    updatePayload.deleted_by = auth.payload.sub
  } else if (accion === "activar") {
    updatePayload.deleted_at = null
    updatePayload.deleted_by = null
    updatePayload.tokens_invalidos_desde = null
  }

  const { error: updateError } = await db.from("profiles").update(updatePayload).eq("id", id)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  // Si se elimina: bloquear email
  if (accion === "eliminar") {
    await db.from("emails_bloqueados").insert({
      email: profile.email,
      tipo_entidad: profile.role,
      entidad_id: id,
      razon: motivo || "Eliminado por administrador",
      bloqueado_por: auth.payload.sub,
      bloqueado_at: new Date().toISOString(),
    })
  }

  await logAdminActivity({
    adminId: auth.payload.sub,
    accion: `${rolEsperado.toUpperCase()}_${accion.toUpperCase()}`,
    entidadTipo: rolEsperado,
    entidadId: id,
    detalleJson: { motivo, email: profile.email },
    ipAddress: getClientIp(request),
  })

  return NextResponse.json({ success: true, estado: nuevoEstado })
}

export async function PATCH(request: NextRequest, context: Params) {
  return handleEstadoChange(request, context, "director")
}
