import { NextRequest, NextResponse } from "next/server"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { getAdminDb, logAdminActivity, getClientIp } from "@/lib/admin-vakdor/logger"

type Params = { params: { id: string } }

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const db = getAdminDb()
  const body = await request.json()
  const { estado, respuesta } = body

  const VALID_ESTADOS = ["pendiente", "en_revision", "resuelta", "descartada"]
  if (!VALID_ESTADOS.includes(estado)) {
    return NextResponse.json({ error: "Estado inválido" }, { status: 400 })
  }

  const STATUS_MAP: Record<string, string> = {
    pendiente: "new",
    en_revision: "reviewing",
    resuelta: "resolved",
    descartada: "rejected",
  }
  const status = STATUS_MAP[estado] || "new"

  const { data, error } = await db
    .from("system_feedback")
    .update({
      estado,
      status,
      respuesta: respuesta || null,
      respondida_por: auth.payload.sub,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminActivity({
    adminId: auth.payload.sub,
    accion: `SUGERENCIA_${estado.toUpperCase()}`,
    entidadTipo: "sugerencia",
    entidadId: params.id,
    detalleJson: { estado, tieneRespuesta: !!respuesta },
    ipAddress: getClientIp(request),
  })

  return NextResponse.json({ success: true, data })
}
