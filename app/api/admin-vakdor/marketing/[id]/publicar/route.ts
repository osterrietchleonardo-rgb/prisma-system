import { NextRequest, NextResponse } from "next/server"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { getAdminDb } from "@/lib/admin-vakdor/logger"
import { marcarPublicada } from "@/lib/admin-vakdor/marketing/store"
import { publicarArticuloBlog } from "@/lib/admin-vakdor/marketing/publisher"
import { publicarLinkedIn, resolverImagenLinkedIn, resolverDocumentoLinkedIn } from "@/lib/admin-vakdor/marketing/buffer-client"
import type { AssetRef } from "@/lib/admin-vakdor/marketing/types"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const db = getAdminDb()
  const { data: idea, error } = await db
    .from("marketing_ideas")
    .select("fuente, formato, estado, titulo, contenido, blog, hashtags, assets, primer_comentario")
    .eq("id", params.id).single()
  if (error || !idea) return NextResponse.json({ error: "idea no encontrada" }, { status: 404 })

  if (idea.fuente === "linkedin") {
    const contenido = typeof idea.contenido === "string" ? idea.contenido : ""
    if (!contenido) {
      return NextResponse.json(
        { error: "Primero desarrollá el contenido del post." },
        { status: 400 },
      )
    }

    const blog = (idea.blog ?? {}) as Record<string, unknown>
    const assets = (idea.assets ?? []) as AssetRef[]
    // Carrusel → document post (PDF deslizable). Resto → imagen.
    const documento = idea.formato === "carrusel" ? resolverDocumentoLinkedIn(idea.titulo, assets) : null
    const imageUrl = documento ? null : resolverImagenLinkedIn(blog, assets)

    const hashtags = Array.isArray(idea.hashtags) ? (idea.hashtags as string[]) : []
    const hashtagsLine = hashtags.join(" ")
    const text = hashtags.length > 0 && !contenido.includes(hashtagsLine)
      ? `${contenido}\n\n${hashtagsLine}`
      : contenido

    try {
      const result = await publicarLinkedIn({ text, imageUrl, document: documento })
      await marcarPublicada(params.id, {
        canal: "linkedin", ref_id: result.id, url: "https://www.linkedin.com/feed/",
        fecha: new Date().toISOString(), status: result.status,
      })
      return NextResponse.json({ ok: true, status: result.status, primer_comentario: idea.primer_comentario ?? null })
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 })
    }
  }

  if (idea.fuente !== "blog") {
    return NextResponse.json(
      { error: "Publicación no soportada para esta fuente." },
      { status: 501 },
    )
  }

  // Artículo de blog → publica en la WEB (artículo + portada) y en LinkedIn (teaser + portada).
  try {
    const r = await publicarArticuloBlog({
      titulo: idea.titulo,
      contenido: typeof idea.contenido === "string" ? idea.contenido : null,
      blog: (idea.blog ?? {}) as Record<string, unknown>,
    })
    await marcarPublicada(params.id, {
      canal: r.linkedin ? "blog+linkedin" : "blog",
      blog: { ref_id: r.blogId, url: r.blogUrl },
      linkedin: r.linkedin,
      fecha: new Date().toISOString(),
    })
    return NextResponse.json({
      ok: true, url: r.blogUrl,
      linkedin: !!r.linkedin, linkedin_omitido: r.linkedinSkipped,
      primer_comentario: r.primer_comentario,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
