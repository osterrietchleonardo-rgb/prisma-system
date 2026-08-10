import { createClient } from "@supabase/supabase-js"

function vakdorAppDb() {
  const url = process.env.PROJECT_URL
  const key = process.env.SERVICE_ROLE_SECRET
  if (!url || !key) throw new Error("Faltan PROJECT_URL / SERVICE_ROLE_SECRET (Supabase vakdor-app)")
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export interface PublicarBlogInput {
  title: string
  slug: string
  meta_description?: string
  category: string
  content: string
  seo_keywords?: string[]
  read_time_minutes?: number
  featured_image_url?: string | null
}

/** Inserta el artículo en blog_posts de vakdor-app (is_published=true). Devuelve {id, slug, url}. */
export async function publicarBlog(input: PublicarBlogInput): Promise<{ id: string; slug: string; url: string }> {
  const db = vakdorAppDb()
  const row = {
    title: input.title,
    slug: input.slug,
    meta_description: input.meta_description ?? null,
    category: input.category,
    author: "Equipo Vakdor",
    content: input.content,
    featured_image_url: input.featured_image_url ?? null,
    seo_keywords: input.seo_keywords ?? [],
    read_time_minutes: input.read_time_minutes ?? null,
    is_published: true,
    published_at: new Date().toISOString(),
  }
  const { data, error } = await db.from("blog_posts").insert(row).select("id, slug").single()
  if (error) throw new Error(`publicarBlog: ${error.message}`)
  return {
    id: (data as { id: string }).id,
    slug: (data as { slug: string }).slug,
    url: `https://www.vakdor.com/blog/${(data as { slug: string }).slug}`,
  }
}
