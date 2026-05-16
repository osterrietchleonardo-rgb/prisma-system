import { NextRequest, NextResponse } from "next/server"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { getAdminDb } from "@/lib/admin-vakdor/logger"

type Params = { params: { id: string } }

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const db = getAdminDb()
  const { data, error } = await db
    .from("system_feedback")
    .select("id, type, estado, created_at, content, titulo, user_id, profiles!system_feedback_user_id_fkey(full_name)")
    .eq("agency_id", params.id)
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const desglosePorCategoria = (data || []).reduce((acc, f) => {
    acc[f.type || "otro"] = (acc[f.type || "otro"] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return NextResponse.json({
    data: (data || []).slice(0, 10),
    total: data?.length || 0,
    desglosePorCategoria,
  })
}
