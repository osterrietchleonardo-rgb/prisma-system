import { NextRequest, NextResponse } from "next/server"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { getAdminDb } from "@/lib/admin-vakdor/logger"
import { marcarPublicada } from "@/lib/admin-vakdor/marketing/store"
import { publicarBlog, type PublicarBlogInput } from "@/lib/admin-vakdor/marketing/blog-client"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const db = getAdminDb()
  const { data: idea, error } = await db
    .from("marketing_ideas")
    .select("fuente, estado, titulo, contenido, blog")
    .eq("id", params.id).single()
  if (error || !idea) return NextResponse.json({ error: "idea no encontrada" }, { status: 404 })

  if (idea.fuente !== "blog") {
    return NextResponse.json(
      { error: "Publicación de LinkedIn en construcción; por ahora solo blog." },
      { status: 501 },
    )
  }

  const blog = (idea.blog ?? {}) as Record<string, unknown>
  const contenido = typeof idea.contenido === "string" ? idea.contenido : ""
  const title = typeof blog.title === "string" ? blog.title : ""
  const slug = typeof blog.slug === "string" ? blog.slug : ""
  const category = typeof blog.category === "string" ? blog.category : ""

  if (!contenido || !title || !slug || !category) {
    return NextResponse.json(
      { error: "Primero desarrollá el contenido del artículo (falta contenido o datos de blog)." },
      { status: 400 },
    )
  }

  const input: PublicarBlogInput = {
    title,
    slug,
    category: category || "General",
    content: contenido,
    meta_description: typeof blog.meta_description === "string" ? blog.meta_description : undefined,
    seo_keywords: Array.isArray(blog.seo_keywords) ? (blog.seo_keywords as string[]) : undefined,
    read_time_minutes: typeof blog.read_time_minutes === "number" ? blog.read_time_minutes : undefined,
  }

  try {
    const result = await publicarBlog(input)
    await marcarPublicada(params.id, {
      canal: "blog", ref_id: result.id, url: result.url, fecha: new Date().toISOString(),
    })
    return NextResponse.json({ ok: true, url: result.url })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
