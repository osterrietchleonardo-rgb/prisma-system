import { NextRequest, NextResponse } from "next/server"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { crearIdeaManual } from "@/lib/admin-vakdor/marketing/store"
import type { FuenteIdea, FormatoIdea } from "@/lib/admin-vakdor/marketing/types"

export const dynamic = "force-dynamic"

const FUENTES: FuenteIdea[] = ["linkedin", "instagram", "blog"]
const FORMATOS: FormatoIdea[] = ["post_texto","carrusel","imagen","encuesta","articulo_linkedin","reel","lead_magnet","articulo_blog"]

export async function POST(request: NextRequest) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const body = await request.json().catch(() => null)
  const titulo = (body?.titulo as string | undefined)?.trim()
  const fuente = body?.fuente as FuenteIdea | undefined
  const formato = body?.formato as FormatoIdea | undefined
  if (!titulo || !fuente || !FUENTES.includes(fuente) || !formato || !FORMATOS.includes(formato)) {
    return NextResponse.json({ error: "faltan campos válidos (titulo, fuente, formato)" }, { status: 400 })
  }
  try {
    const idea = await crearIdeaManual({
      titulo, fuente, formato,
      angulo: (body?.angulo as string | undefined)?.trim() || null,
      motivo: (body?.motivo as string | undefined)?.trim() || null,
      origen: "manual",
    })
    return NextResponse.json({ idea })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
