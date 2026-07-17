import { NextRequest, NextResponse } from "next/server"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { programarIdea } from "@/lib/admin-vakdor/marketing/store"

export const dynamic = "force-dynamic"

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const body = await request.json().catch(() => null)
  const fecha = body?.fecha as string | null | undefined
  if (fecha !== null && fecha !== undefined && isNaN(Date.parse(fecha))) {
    return NextResponse.json({ error: "fecha inválida" }, { status: 400 })
  }
  try {
    await programarIdea(params.id, fecha ? new Date(fecha).toISOString() : null)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
