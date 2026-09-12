// lib/farming/tipos.ts
// Solo tipos: lo que viaja entre la API de Farming y la pantalla. Nada ejecutable.
import type { Choque, Dibujo } from "./geometria"

export type { Choque, Dibujo }

export interface Colega {
  id: string
  nombre: string
}

export interface ZonaFarming {
  id: string
  nombre: string
  geojson: Dibujo
  area_km2: number
  pedazos: number
  estado: "activa" | "liberada" | "archivada"
  owner_user_id: string
  owner_nombre: string
  origen_mapa_zona_id: string | null
  trazo_editado_en: string | null
  created_at: string
  compartida_con: Colega[]
}

/** Lo mínimo de una zona ajena: la forma y de quién es. Para no dibujar a ciegas. */
export interface ContornoAjeno {
  id: string
  nombre: string
  owner_nombre: string
  geojson: Dibujo
}

export interface RespuestaZonas {
  mias: ZonaFarming[]
  compartidas_conmigo: ZonaFarming[]
  ajenas: ContornoAjeno[]
  /** Solo para el director: todas las activas de la agencia, completas. Vacío para el asesor. */
  equipo: ZonaFarming[]
  /** Asesores activos de la agencia (sin uno mismo), para el desplegable de compartir. */
  colegas: Colega[]
  topes: { max_zonas: number; max_km2: number }
  /** El id de quien pide: para que la tarjeta diga "vos" en vez de su propio nombre. */
  mi_id: string
}

export interface RespuestaChoque {
  error: string
  choques: Choque[]
}
