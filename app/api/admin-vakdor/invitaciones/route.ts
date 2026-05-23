import { NextRequest, NextResponse } from "next/server"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { getAdminDb } from "@/lib/admin-vakdor/logger"

export async function GET(request: NextRequest) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const db = getAdminDb()
  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get("page") || "1")
  const perPage = Math.min(parseInt(searchParams.get("perPage") || "20"), 100)
  const offset = (page - 1) * perPage

  const query = db
    .from("director_invites")
    .select(`
      id, code, is_used, used_at, created_at, agency_id,
      profiles!director_invites_used_by_fkey(email)
    `, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + perPage - 1)

  const { data, count, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const enriched = (data || []).map((invite) => {
    // profiles might be a single object or array depending on the fk relationship in Postgrest
    // Usually a many-to-one is returned as an object.
    const profilesObj = invite.profiles as any
    const used_by_email = profilesObj?.email || null

    return {
      id: invite.id,
      code: invite.code,
      is_used: invite.is_used,
      used_at: invite.used_at,
      created_at: invite.created_at,
      agency_id: invite.agency_id,
      used_by_email
    }
  })

  return NextResponse.json({ data: enriched, total: count || 0, page, perPage })
}
