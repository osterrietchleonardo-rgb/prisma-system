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
  const { motivo } = body

  const { data: profile } = await db
    .from("profiles")
    .select("id, email, role, estado")
    .eq("id", id)
    .single()

  if (!profile) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 })
  if (profile.estado !== "eliminado") {
    return NextResponse.json({ error: "El usuario no está eliminado" }, { status: 400 })
  }

  // Reactivar perfil
  await db.from("profiles").update({
    estado: "activo",
    deleted_at: null,
    deleted_by: null,
    tokens_invalidos_desde: null,
  }).eq("id", id)

  // Desbloquear email
  await db.from("emails_bloqueados")
    .update({ desbloqueado_at: new Date().toISOString() })
    .eq("email", profile.email)
    .is("desbloqueado_at", null)

  await logAdminActivity({
    adminId: auth.payload.sub,
    accion: "USUARIO_DESBLOQUEADO",
    entidadTipo: profile.role,
    entidadId: id,
    detalleJson: { motivo, email: profile.email },
    ipAddress: getClientIp(request),
  })

  return NextResponse.json({ success: true })
}
