import { NextRequest, NextResponse } from "next/server"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { moverEstado } from "@/lib/admin-vakdor/marketing/store"
import type { EstadoIdea } from "@/lib/admin-vakdor/marketing/types"

export const dynamic = "force-dynamic"

const VALID: EstadoIdea[] = ["idea","en_proceso","en_revision","aprobada","publicada","rechazada"]

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const body = await request.json().catch(() => null)
  const estado = body?.estado as EstadoIdea | undefined
  if (!estado || !VALID.includes(estado)) {
    return NextResponse.json({ error: "estado inválido" }, { status: 400 })
  }
  try {
    await moverEstado(params.id, estado)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
