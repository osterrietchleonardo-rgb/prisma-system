import { publicarBlog } from "./blog-client"
import { publicarLinkedIn } from "./buffer-client"

interface IdeaBlog {
  titulo: string
  contenido: string | null
  blog: Record<string, unknown>
}

export interface CrossPostResult {
  blogId: string
  blogUrl: string
  linkedin: { ref_id: string; status: string } | null
  linkedinSkipped: string | null
  primer_comentario: string | null
}

/**
 * Publica un artículo de blog en AMBOS canales:
 *  - Web (vakdor-app `blog_posts`): artículo completo + portada (featured_image_url).
 *  - LinkedIn (Buffer): el post teaser standalone (`blog.linkedin_post`) + la misma portada,
 *    SIN links (el link vive en el perfil, no en el post/comentario).
 * La portada y el post de LinkedIn los genera el worker; si faltan, se publica igual en la web
 * y se omite LinkedIn con un motivo (para no publicar sin portada, como pidió la regla).
 */
export async function publicarArticuloBlog(idea: IdeaBlog): Promise<CrossPostResult> {
  const blog = idea.blog ?? {}
  const contenido = typeof idea.contenido === "string" ? idea.contenido : ""
  const title = typeof blog.title === "string" ? blog.title : ""
  const slug = typeof blog.slug === "string" ? blog.slug : ""
  if (!contenido || !title || !slug) {
    throw new Error("Falta desarrollar el artículo (contenido, title o slug).")
  }
  const featured = typeof blog.featured_image_url === "string" && /^https?:\/\//.test(blog.featured_image_url)
    ? blog.featured_image_url
    : null

  // 1) Web
  const web = await publicarBlog({
    title,
    slug,
    category: (typeof blog.category === "string" && blog.category) || "General",
    content: contenido,
    meta_description: typeof blog.meta_description === "string" ? blog.meta_description : undefined,
    seo_keywords: Array.isArray(blog.seo_keywords) ? (blog.seo_keywords as string[]) : undefined,
    read_time_minutes: typeof blog.read_time_minutes === "number" ? blog.read_time_minutes : undefined,
    featured_image_url: featured,
  })

  // 2) LinkedIn (teaser + portada). Requiere portada + post; si falta, se omite.
  const post = typeof blog.linkedin_post === "string" ? blog.linkedin_post.trim() : ""
  let linkedin: CrossPostResult["linkedin"] = null
  let linkedinSkipped: string | null = null
  let primer_comentario: string | null = null

  if (post && featured) {
    const tags = Array.isArray(blog.linkedin_hashtags) ? (blog.linkedin_hashtags as string[]) : []
    const tagsLine = tags.join(" ")
    const text = tags.length > 0 && !post.includes(tagsLine) ? `${post}\n\n${tagsLine}` : post
    const lr = await publicarLinkedIn({ text, imageUrl: featured })
    linkedin = { ref_id: lr.id, status: lr.status }
    primer_comentario = typeof blog.linkedin_primer_comentario === "string" ? blog.linkedin_primer_comentario : null
  } else {
    linkedinSkipped = !featured ? "sin portada (desarrollá la pieza con el worker)" : "sin post de LinkedIn (desarrollá la pieza con el worker)"
  }

  return { blogId: web.id, blogUrl: web.url, linkedin, linkedinSkipped, primer_comentario }
}
