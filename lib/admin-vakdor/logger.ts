/**
 * Admin Vakdor — Activity Logger & Admin Client
 */
import { createAdminClient } from "@/lib/supabase/admin"

export function getAdminDb() {
  return createAdminClient()
}

export async function logAdminActivity(params: {
  adminId: string
  accion: string
  entidadTipo?: string
  entidadId?: string
  detalleJson?: Record<string, unknown>
  ipAddress?: string
}) {
  const db = getAdminDb()
  await db.from("admin_vakdor_activity_log").insert({
    admin_id: params.adminId,
    accion: params.accion,
    entidad_tipo: params.entidadTipo ?? null,
    entidad_id: params.entidadId ?? null,
    detalle_json: params.detalleJson ?? {},
    ip_address: params.ipAddress ?? null,
    timestamp: new Date().toISOString(),
  })
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0].trim()
  return "unknown"
}
