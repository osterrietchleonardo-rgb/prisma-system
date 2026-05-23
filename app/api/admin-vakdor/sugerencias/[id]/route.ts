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
    .select(`
      *,
      profiles!system_feedback_user_id_fkey(full_name, email, role, agency_id),
      agencies!system_feedback_agency_id_fkey(name)
    `)
    .eq("id", params.id)
    .single()

  if (error || !data) return NextResponse.json({ error: "No encontrado" }, { status: 404 })
  return NextResponse.json(data)
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const db = getAdminDb()
  const { error } = await db
    .from("system_feedback")
    .delete()
    .eq("id", params.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
