// lib/farming/tipos.ts
// Solo tipos: lo que viaja entre la API de Farming y la pantalla. Nada ejecutable.
import type { Choque, Dibujo } from "./geometria"
import type { EtapaDireccion, TipoDireccion, Vinculo } from "./direcciones"

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

/**
 * Una tarjeta de la caminata, tal como la devuelve `/api/farming/direcciones` (la fila entera
 * de `farming_direcciones`).
 *
 * `unidades_totales` es una columna GENERADA: llega calculada y NO se manda nunca de vuelta —
 * la regla de las slides es que las unidades no se cargan a mano.
 *
 * `fuera_de_zona_desde` separa dos historias que NO son la misma: en `null` la tarjeta NACIÓ
 * afuera de la línea (el asesor cargó a propósito la puerta de enfrente); con fecha, se CAYÓ
 * afuera al redibujar el trazo (etapa 3-B). La pantalla las dice distinto.
 */
export interface FilaDireccion {
  id: string
  zona_id: string
  tramo: string | null
  calle: string
  altura: string | null
  tipo: TipoDireccion
  pisos: number | null
  unidades_por_piso: number | null
  unidades_manual: number | null
  unidades_totales: number | null
  encargado_nombre: string | null
  encargado_turno: string | null
  encargado_notas: string | null
  lat: number | null
  lng: number | null
  etapa: EtapaDireccion
  orden: number
  proxima_accion: string | null
  proxima_accion_en: string | null
  relevada_en: string | null
  a_la_venta: boolean
  cartel: "dueno" | "inmobiliaria" | "sin_cartel" | null
  inmobiliaria_cartel: string | null
  precio_pedido: number | null
  moneda: "USD" | "ARS" | null
  aviso_id: number | null
  aviso_es_dueno_directo: boolean | null
  origen: "caminata" | "aviso"
  fuera_de_zona: boolean
  fuera_de_zona_desde: string | null
  observaciones: string | null
  created_at: string
}

export interface RespuestaDirecciones {
  zona: { id: string; nombre: string }
  direcciones: FilaDireccion[]
}

/** Una persona de una tarjeta, tal como la devuelve la API. `tracking_log_id` es de la etapa
 *  3-B: se lee, pero ningún PATCH de esta pantalla lo toca. */
export interface PropietarioFarming {
  id: string
  direccion_id: string
  piso: string | null
  unidad: string | null
  nombre: string
  vinculo: Vinculo
  telefono: string | null
  email: string | null
  notas: string | null
  tracking_log_id: string | null
  created_at: string
}

export interface RespuestaChoque {
  error: string
  choques: Choque[]
}
