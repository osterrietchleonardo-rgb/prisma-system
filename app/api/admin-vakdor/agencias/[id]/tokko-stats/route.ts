import { NextRequest, NextResponse } from "next/server"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { getAdminDb } from "@/lib/admin-vakdor/logger"

type Params = { params: { id: string } }

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const db = getAdminDb()
  const { data: agency } = await db
    .from("agencies")
    .select("tokko_api_key, last_sync_at")
    .eq("id", params.id)
    .single()

  const { data: props } = await db
    .from("properties")
    .select("id")
    .eq("agency_id", params.id)

  return NextResponse.json({
    total_propiedades: props?.length || 0,
    ultima_sync: agency?.last_sync_at || null,
    estado_conexion: agency?.tokko_api_key ? "activa" : "sin_credenciales",
  })
}
