import { getAdminDb } from "@/lib/admin-vakdor/logger"
import type {
  MarketingIdea, EstadoIdea, NuevaIdeaInput, HistorialEvento,
} from "./types"

const COLS =
  "id, estado, fuente, formato, titulo, angulo, estructura, gancho, contenido, " +
  "primer_comentario, hashtags, motivo, comentario, brief, blog, assets, " +
  "programada_para, publicado_en, origen, historial, created_at, updated_at"

export async function listarIdeas(): Promise<MarketingIdea[]> {
  const db = getAdminDb()
  const { data, error } = await db
    .from("marketing_ideas")
    .select(COLS)
    .order("created_at", { ascending: false })
    .limit(500)
  if (error) throw new Error(`listarIdeas: ${error.message}`)
  return (data ?? []) as unknown as MarketingIdea[]
}

export async function crearIdeaManual(input: NuevaIdeaInput): Promise<MarketingIdea> {
  const db = getAdminDb()
  const { data, error } = await db
    .from("marketing_ideas")
    .insert({
      titulo: input.titulo,
      fuente: input.fuente,
      formato: input.formato,
      angulo: input.angulo ?? null,
      estructura: input.estructura ?? null,
      gancho: input.gancho ?? null,
      contenido: input.contenido ?? null,
      primer_comentario: input.primer_comentario ?? null,
      hashtags: input.hashtags ?? [],
      motivo: input.motivo ?? null,
      brief: input.brief ?? {},
      origen: input.origen ?? "manual",
      estado: "idea",
      historial: [{ fecha: new Date().toISOString(), tipo: "creada", detalle: input.origen ?? "manual" }],
    })
    .select(COLS)
    .single()
  if (error) throw new Error(`crearIdeaManual: ${error.message}`)
  return data as unknown as MarketingIdea
}

export async function insertarIdeasMotor(ideas: NuevaIdeaInput[]): Promise<number> {
  if (ideas.length === 0) return 0
  const db = getAdminDb()
  const rows = ideas.map((i) => ({
    titulo: i.titulo,
    fuente: i.fuente,
    formato: i.formato,
    angulo: i.angulo ?? null,
    estructura: i.estructura ?? null,
    gancho: i.gancho ?? null,
    contenido: i.contenido ?? null,
    primer_comentario: i.primer_comentario ?? null,
    hashtags: i.hashtags ?? [],
    motivo: i.motivo ?? null,
    brief: i.brief ?? {},
    origen: "motor" as const,
    estado: "idea" as const,
    historial: [{ fecha: new Date().toISOString(), tipo: "creada", detalle: "motor" }],
  }))
  const { error, count } = await db
    .from("marketing_ideas")
    .insert(rows, { count: "exact" })
  if (error) throw new Error(`insertarIdeasMotor: ${error.message}`)
  return count ?? rows.length
}

async function leerIdea(id: string): Promise<MarketingIdea> {
  const db = getAdminDb()
  const { data, error } = await db
    .from("marketing_ideas").select(COLS).eq("id", id).single()
  if (error) throw new Error(`leerIdea: ${error.message}`)
  return data as unknown as MarketingIdea
}

export async function moverEstado(id: string, estado: EstadoIdea): Promise<void> {
  const db = getAdminDb()
  const actual = await leerIdea(id)
  const evento: HistorialEvento = {
    fecha: new Date().toISOString(), tipo: "movida", detalle: `${actual.estado} → ${estado}`,
  }
  const { error } = await db
    .from("marketing_ideas")
    .update({ estado, historial: [...(actual.historial ?? []), evento] })
    .eq("id", id)
  if (error) throw new Error(`moverEstado: ${error.message}`)
}

export async function actualizarContenido(
  id: string,
  patch: { contenido?: string; primer_comentario?: string; comentario?: string; evento: HistorialEvento },
): Promise<void> {
  const db = getAdminDb()
  const actual = await leerIdea(id)
  const update: Record<string, unknown> = {
    historial: [...(actual.historial ?? []), patch.evento],
  }
  if (patch.contenido !== undefined) update.contenido = patch.contenido
  if (patch.primer_comentario !== undefined) update.primer_comentario = patch.primer_comentario
  if (patch.comentario !== undefined) update.comentario = patch.comentario
  const { error } = await db.from("marketing_ideas").update(update).eq("id", id)
  if (error) throw new Error(`actualizarContenido: ${error.message}`)
}

/** Guarda el desarrollo completo de la pieza (contenido final generado por IA al pasar a "En proceso"). */
export async function guardarDesarrollo(
  id: string,
  patch: { contenido?: string; primer_comentario?: string; hashtags?: string[]; blog?: Record<string, unknown>; evento: HistorialEvento },
): Promise<void> {
  const db = getAdminDb()
  const actual = await (async () => {
    const { data, error } = await db.from("marketing_ideas").select("historial, blog").eq("id", id).single()
    if (error) throw new Error(`guardarDesarrollo(leer): ${error.message}`)
    return data as { historial: HistorialEvento[]; blog: Record<string, unknown> }
  })()
  const update: Record<string, unknown> = { historial: [...(actual.historial ?? []), patch.evento] }
  if (patch.contenido !== undefined) update.contenido = patch.contenido
  if (patch.primer_comentario !== undefined) update.primer_comentario = patch.primer_comentario
  if (patch.hashtags !== undefined) update.hashtags = patch.hashtags
  if (patch.blog !== undefined) update.blog = { ...(actual.blog ?? {}), ...patch.blog }
  const { error } = await db.from("marketing_ideas").update(update).eq("id", id)
  if (error) throw new Error(`guardarDesarrollo: ${error.message}`)
}

/**
 * Marca una idea (carrusel/lead_magnet) para que el worker REGENERE la pieza completa:
 * limpia `contenido` + `assets`, guarda el `comentario` de reformular y la manda a `en_proceso`.
 * El worker rehace la descripción del posteo Y los visuales (slides/PDF) alineados al comentario,
 * y la devuelve a `en_revision`.
 */
export async function regenerarVisuales(id: string, comentario: string): Promise<void> {
  const db = getAdminDb()
  const { data, error: e1 } = await db.from("marketing_ideas").select("historial").eq("id", id).single()
  if (e1) throw new Error(`regenerarVisuales(leer): ${e1.message}`)
  const historial = (data as { historial: HistorialEvento[] }).historial ?? []
  const evento: HistorialEvento = { fecha: new Date().toISOString(), tipo: "regenerar_visuales", detalle: comentario.slice(0, 120) }
  const { error } = await db
    .from("marketing_ideas")
    .update({ contenido: null, assets: [], comentario, estado: "en_proceso", historial: [...historial, evento] })
    .eq("id", id)
  if (error) throw new Error(`regenerarVisuales: ${error.message}`)
}

/** Títulos + ángulos recientes, para que el motor NO repita (memoria anti-repetición). */
export async function resumenParaMemoria(): Promise<{ titulo: string; angulo: string | null }[]> {
  const db = getAdminDb()
  const { data, error } = await db
    .from("marketing_ideas")
    .select("titulo, angulo")
    .order("created_at", { ascending: false })
    .limit(60)
  if (error) throw new Error(`resumenParaMemoria: ${error.message}`)
  return (data ?? []) as { titulo: string; angulo: string | null }[]
}

/** Programa (o desprograma, con fechaISO=null) la fecha de publicación de una idea. */
export async function programarIdea(id: string, fechaISO: string | null): Promise<void> {
  const db = getAdminDb()
  const { data: actual, error: e1 } = await db.from("marketing_ideas").select("historial").eq("id", id).single()
  if (e1) throw new Error(`programarIdea(leer): ${e1.message}`)
  const evento = { fecha: new Date().toISOString(), tipo: "programada", detalle: fechaISO ?? "sin fecha" }
  const { error } = await db.from("marketing_ideas")
    .update({ programada_para: fechaISO, historial: [...(((actual as {historial: HistorialEvento[]}).historial) ?? []), evento] })
    .eq("id", id)
  if (error) throw new Error(`programarIdea: ${error.message}`)
}

/** Marca la idea como publicada (blog o LinkedIn) y guarda el detalle de dónde quedó publicada. */
export async function marcarPublicada(id: string, publicado_en: Record<string, unknown>): Promise<void> {
  const db = getAdminDb()
  const { data, error: e1 } = await db.from("marketing_ideas").select("historial").eq("id", id).single()
  if (e1) throw new Error(`marcarPublicada(leer): ${e1.message}`)
  const historial = (data as { historial: HistorialEvento[] }).historial ?? []
  const evento: HistorialEvento = {
    fecha: new Date().toISOString(), tipo: "publicada", detalle: String(publicado_en.canal ?? ""),
  }
  const { error } = await db
    .from("marketing_ideas")
    .update({ estado: "publicada", publicado_en, historial: [...historial, evento] })
    .eq("id", id)
  if (error) throw new Error(`marcarPublicada: ${error.message}`)
}

/** Ideas aprobadas cuya fecha de programación ya venció (listas para el cron de auto-publicación). */
export async function listarProgramadasVencidas(): Promise<MarketingIdea[]> {
  const db = getAdminDb()
  const { data, error } = await db
    .from("marketing_ideas")
    .select(COLS)
    .eq("estado", "aprobada")
    .not("programada_para", "is", null)
    .lte("programada_para", new Date().toISOString())
    .order("programada_para", { ascending: true })
    .limit(50)
  if (error) throw new Error(`listarProgramadasVencidas: ${error.message}`)
  return (data ?? []) as unknown as MarketingIdea[]
}

/** URL firmada temporal para ver/descargar un asset del bucket privado. */
export async function firmarAsset(path: string): Promise<string | null> {
  const db = getAdminDb()
  const { data, error } = await db.storage
    .from("marketing-assets")
    .createSignedUrl(path, 60 * 30) // 30 min
  if (error) return null
  return data?.signedUrl ?? null
}
