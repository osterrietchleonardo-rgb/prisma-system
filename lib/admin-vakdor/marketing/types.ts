export type EstadoIdea =
  | "idea" | "en_proceso" | "en_revision" | "aprobada" | "publicada" | "rechazada"

export type FuenteIdea = "linkedin" | "instagram" | "blog"

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
  orden?: number
}

export interface MarketingIdea {
  id: string
  estado: EstadoIdea
  fuente: FuenteIdea
  formato: FormatoIdea
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
