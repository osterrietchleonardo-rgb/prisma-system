import { NextResponse } from "next/server"
import { assertCron } from "@/lib/admin-vakdor/cron-auth"
import { listarProgramadasVencidas, marcarPublicada } from "@/lib/admin-vakdor/marketing/store"
import { publicarBlog, type PublicarBlogInput } from "@/lib/admin-vakdor/marketing/blog-client"
import { publicarLinkedIn, resolverImagenLinkedIn, resolverDocumentoLinkedIn } from "@/lib/admin-vakdor/marketing/buffer-client"

export const dynamic = "force-dynamic"

/**
 * Cron: publica automáticamente todas las ideas "aprobada" cuya `programada_para` ya venció.
 * Recorre blog + LinkedIn; un fallo en una idea no interrumpe el resto.
 */
export async function POST(request: Request) {
  const denied = assertCron(request)
  if (denied) return denied

  const ideas = await listarProgramadasVencidas()
  const errores: { id: string; titulo: string; error: string }[] = []
  let publicadas = 0

  for (const idea of ideas) {
    try {
      if (idea.fuente === "blog") {
        const blog = idea.blog ?? {}
        const title = typeof blog.title === "string" ? blog.title : ""
        const slug = typeof blog.slug === "string" ? blog.slug : ""
        const category = typeof blog.category === "string" ? blog.category : ""
        const contenido = idea.contenido ?? ""

        if (!contenido || !title || !slug) {
          errores.push({ id: idea.id, titulo: idea.titulo, error: "Falta contenido o datos de blog (title/slug)." })
          continue
        }

        const input: PublicarBlogInput = {
          title,
          slug,
          category: category || "General",
          content: contenido,
          meta_description: typeof blog.meta_description === "string" ? blog.meta_description : undefined,
          seo_keywords: Array.isArray(blog.seo_keywords) ? (blog.seo_keywords as string[]) : undefined,
          read_time_minutes: typeof blog.read_time_minutes === "number" ? blog.read_time_minutes : undefined,
          featured_image_url: typeof blog.featured_image_url === "string" ? blog.featured_image_url : undefined,
        }

        const r = await publicarBlog(input)
        await marcarPublicada(idea.id, {
          canal: "blog", ref_id: r.id, url: r.url, fecha: new Date().toISOString(),
        })
        publicadas += 1
        continue
      }

      if (idea.fuente === "linkedin") {
        const contenido = idea.contenido ?? ""
        if (!contenido) {
          errores.push({ id: idea.id, titulo: idea.titulo, error: "Falta desarrollar el contenido del post." })
          continue
        }

        const text = contenido + (idea.hashtags?.length ? `\n\n${idea.hashtags.join(" ")}` : "")
        // Carrusel → document post (PDF deslizable). Resto → imagen.
        const documento = idea.formato === "carrusel" ? resolverDocumentoLinkedIn(idea.titulo, idea.assets) : null
        const imageUrl = documento ? null : resolverImagenLinkedIn(idea.blog, idea.assets)

        const r = await publicarLinkedIn({ text, imageUrl, document: documento })
        await marcarPublicada(idea.id, {
          canal: "linkedin", ref_id: r.id, url: "https://www.linkedin.com/feed/",
          fecha: new Date().toISOString(), status: r.status,
        })
        publicadas += 1
        continue
      }

      errores.push({ id: idea.id, titulo: idea.titulo, error: "fuente no soportada" })
    } catch (e) {
      errores.push({ id: idea.id, titulo: idea.titulo, error: (e as Error).message })
    }
  }

  return NextResponse.json({ revisadas: ideas.length, publicadas, errores })
}
