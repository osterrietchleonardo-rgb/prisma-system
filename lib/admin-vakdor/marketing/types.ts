export type EstadoIdea =
  | "idea" | "en_proceso" | "en_revision" | "aprobada" | "publicada" | "rechazada"

export type FuenteIdea = "linkedin" | "instagram" | "blog"

/** Etapa del embudo. tofu=descubrimiento (dolor amplio), mofu=nutrición (mecanismo), bofu=empujón a la reunión. */
export type FunnelStage = "tofu" | "mofu" | "bofu"

export const FUNNEL_LABELS: Record<FunnelStage, string> = {
  tofu: "TOFU · Descubrimiento",
  mofu: "MOFU · Nutrición",
  bofu: "BOFU · Reunión",
}

export type FormatoIdea =
  | "post_texto" | "carrusel" | "imagen" | "encuesta"
  | "articulo_linkedin" | "reel" | "lead_magnet" | "articulo_blog"

/** Columnas del tablero, en orden. `rechazada` va al costado (terminal). */
export const ESTADOS: { key: EstadoIdea; label: string }[] = [
  { key: "idea", label: "Idea" },
  { key: "en_proceso", label: "En proceso" },
  { key: "en_revision", label: "En revisión" },
  { key: "aprobada", label: "Aprobada" },
  { key: "publicada", label: "Publicada" },
  { key: "rechazada", label: "Rechazada" },
]

export interface HistorialEvento {
  fecha: string
  tipo: string
  detalle?: string
}

export interface AssetRef {
  tipo: "pdf" | "png"
  path: string
  /** URL pública (la setea el worker al subir a un bucket público); usada p.ej. como imagen de LinkedIn. */
  url?: string
  orden?: number
}

export interface MarketingIdea {
  id: string
  estado: EstadoIdea
  fuente: FuenteIdea
  formato: FormatoIdea
  funnel: FunnelStage | null
  /** Territorio temático. Sirve a blog (SEO) y a LinkedIn (de qué venís hablando). */
  cluster: string | null
  /** El para qué de la pieza. Restringe qué estructuras puede sortear el worker. */
  proposito: string | null
  /** Búsqueda real (Search Console) que este artículo tiene que responder. Solo blog. */
  keyword_objetivo: string | null
  titulo: string
  angulo: string | null
  estructura: string | null
  gancho: string | null
  contenido: string | null
  primer_comentario: string | null
  hashtags: string[]
  motivo: string | null
  comentario: string | null
  brief: Record<string, unknown>
  blog: Record<string, unknown>
  assets: AssetRef[]
  programada_para: string | null
  publicado_en: Record<string, unknown> | null
  origen: "motor" | "manual"
  historial: HistorialEvento[]
  created_at: string
  updated_at: string
}

export interface NuevaIdeaInput {
  titulo: string
  fuente: FuenteIdea
  formato: FormatoIdea
  funnel?: FunnelStage | null
  cluster?: string | null
  proposito?: string | null
  keyword_objetivo?: string | null
  angulo?: string | null
  estructura?: string | null
  gancho?: string | null
  contenido?: string | null
  primer_comentario?: string | null
  hashtags?: string[]
  motivo?: string | null
  brief?: Record<string, unknown>
  origen?: "motor" | "manual"
}

import type { ClaveEstructura, ClaveComentario } from "./voz"

/** Qué receta produjo una pieza: sirve para rotar, para no repetir y para auditar después. */
export interface Receta {
  estructura: ClaveEstructura | null
  /** El propósito que se usó. La rotación lo lee de acá para no repetirlo. */
  proposito: string | null
  /** El territorio de la pieza, copiado de la idea para poder auditar el cruce completo. */
  cluster: string | null
  escenas: string[]
  comentario_tipo: ClaveComentario | null
  modelo: string
  revision: { aprobado: boolean; reintentos: number; fallos?: string[] }
}
