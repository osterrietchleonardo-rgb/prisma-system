// lib/farming/armar.ts
// De filas de la base a lo que ve la pantalla. Puro, sin Supabase: se prueba solo.
import { contarPedazos, MAX_KM2, MAX_ZONAS_ACTIVAS, type Dibujo, type ZonaParaChoque } from "./geometria"
import type { Colega, ContornoAjeno, RespuestaZonas, ZonaFarming } from "./tipos"

export interface FilaZona {
  id: string
  agency_id: string
  owner_user_id: string
  nombre: string
  geojson: Dibujo
  area_km2: number | string
  origen_mapa_zona_id: string | null
  estado: "activa" | "liberada" | "archivada"
  trazo_editado_en: string | null
  created_at: string
}

export interface FilaCompartida {
  zona_id: string
  user_id: string
  agregado_por: string
  created_at: string
}

export interface FilaPerfil {
  id: string
  full_name: string | null
  role: string | null
  estado: string | null
}

export function nombreDe(perfiles: FilaPerfil[], id: string): string {
  const nombre = perfiles.find((p) => p.id === id)?.full_name?.trim()
  return nombre || "otro asesor"
}

/** Asesores con los que se puede compartir: activos, de la agencia, sin uno mismo. */
export function colegasActivos(perfiles: FilaPerfil[], userId: string): Colega[] {
  return perfiles
    .filter((p) => p.id !== userId && p.role === "asesor" && p.estado !== "pausado" && p.estado !== "eliminado")
    .map((p) => ({ id: p.id, nombre: nombreDe(perfiles, p.id) }))
}

export function armarZona(fila: FilaZona, compartidas: FilaCompartida[], perfiles: FilaPerfil[]): ZonaFarming {
  return {
    id: fila.id,
    nombre: fila.nombre,
    geojson: fila.geojson,
    area_km2: Number(fila.area_km2) || 0,
    pedazos: contarPedazos(fila.geojson),
    estado: fila.estado,
    owner_user_id: fila.owner_user_id,
    owner_nombre: nombreDe(perfiles, fila.owner_user_id),
    origen_mapa_zona_id: fila.origen_mapa_zona_id,
    trazo_editado_en: fila.trazo_editado_en,
    created_at: fila.created_at,
    compartida_con: compartidas
      .filter((c) => c.zona_id === fila.id)
      .map((c) => ({ id: c.user_id, nombre: nombreDe(perfiles, c.user_id) })),
  }
}

/** Las zonas contra las que se controla el choque: las activas de la agencia, sin la que se está editando. Las propias se llaman "vos". */
export function candidatasParaChoque(
  filas: FilaZona[],
  perfiles: FilaPerfil[],
  userId: string,
  excluirId?: string,
): ZonaParaChoque[] {
  return filas
    .filter((z) => z.id !== excluirId)
    .map((z) => ({ id: z.id, nombre: z.nombre, owner_nombre: z.owner_user_id === userId ? "vos" : nombreDe(perfiles, z.owner_user_id), geojson: z.geojson }))
}

export function armarRespuesta(args: {
  filas: FilaZona[]
  compartidas: FilaCompartida[]
  perfiles: FilaPerfil[]
  userId: string
  role: string
}): RespuestaZonas {
  const { filas, compartidas, perfiles, userId, role } = args
  const todas = filas.map((f) => armarZona(f, compartidas, perfiles))
  const esDirector = role === "director"

  const mias = todas.filter((z) => z.owner_user_id === userId)
  const compartidasConmigo = todas.filter((z) => z.owner_user_id !== userId && z.compartida_con.some((c) => c.id === userId))
  // El contorno ajeno es SOLO forma + de quién: la zona completa de otro no viaja al asesor.
  const ajenas: ContornoAjeno[] = todas
    .filter((z) => esDirector || (z.owner_user_id !== userId && !compartidasConmigo.some((c) => c.id === z.id)))
    .map((z) => ({ id: z.id, nombre: z.nombre, owner_nombre: z.owner_nombre, geojson: z.geojson }))

  return {
    mias,
    compartidas_conmigo: compartidasConmigo,
    ajenas,
    equipo: esDirector ? todas : [],
    colegas: colegasActivos(perfiles, userId),
    topes: { max_zonas: MAX_ZONAS_ACTIVAS, max_km2: MAX_KM2 },
  }
}

/** Todo lo que se dibuja como contorno mientras el asesor traza: las ajenas, las compartidas
 *  conmigo y las propias (menos la que está editando). Las propias se llaman "vos". Sin esto
 *  el asesor dibuja a ciegas contra zonas que el servidor sí controla, y se lleva un 409. */
export function contornosParaDibujar(datos: RespuestaZonas, excluirId?: string): ContornoAjeno[] {
  const vistos = new Set<string>()
  const contornos: ContornoAjeno[] = []
  const agregar = (c: ContornoAjeno) => {
    if (vistos.has(c.id)) return
    vistos.add(c.id)
    contornos.push(c)
  }

  for (const z of datos.ajenas) agregar(z)
  for (const z of datos.compartidas_conmigo) agregar({ id: z.id, nombre: z.nombre, owner_nombre: z.owner_nombre, geojson: z.geojson })
  for (const z of datos.mias) {
    if (z.id === excluirId) continue
    agregar({ id: z.id, nombre: z.nombre, owner_nombre: "vos", geojson: z.geojson })
  }

  return contornos
}
