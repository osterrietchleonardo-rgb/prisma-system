// Farming · la geometría del territorio: validar un dibujo, medirlo, sumarle un pedazo y
// detectar si pisa el de otro asesor.
//
// Corre en el servidor con Turf y no en la base A PROPÓSITO (spec, "La exclusividad"): esta
// cuenta corre UNA vez cuando alguien guarda una zona, no en cada búsqueda. Acá se prueba
// con polígonos reales sin tocar producción, y el mensaje del choque se arma donde se
// muestra.
//
// GeoJSON escribe [lng, lat], al revés de como se dice una coordenada.
import { area, booleanValid, featureCollection, intersect, kinks, union } from "@turf/turf"
import type { Feature, MultiPolygon, Polygon, Position } from "geojson"
import type { BBox } from "@/lib/mapa/tipos"

export type Dibujo = Polygon | MultiPolygon

/** Un trazo a mano trae ~300 vértices; más que esto es basura o un ataque. */
export const MAX_VERTICES = 5000
/** Menos de esto no es una zona, es un click sin querer (misma regla que el lápiz). */
export const MIN_VERTICES_ANILLO = 4
/** Los topes del spec ("Tres topes que se implementan así, salvo que Leonardo diga otra cosa"). */
export const MAX_KM2 = 5
export const MAX_ZONAS_ACTIVAS = 3
/** Dos zonas que comparten una calle se tocan sin pisarse: el choque exige superposición REAL. */
export const MIN_M2_CHOQUE = 100
export const PCT_CHOQUE = 0.01

export type Validacion = { ok: true; dibujo: Dibujo } | { ok: false; motivo: string }

export interface ZonaParaChoque {
  id: string
  nombre: string
  owner_nombre: string
  geojson: Dibujo
}

export interface Choque {
  zona_id: string
  nombre: string
  owner_nombre: string
  /** Qué porcentaje del dibujo NUEVO cae sobre esa zona. */
  pct: number
  /** El pedazo que se pisa, para dibujarlo rayado. */
  recorte: Dibujo
}

const feature = (d: Dibujo): Feature<Polygon | MultiPolygon> => ({ type: "Feature", properties: {}, geometry: d })

function anillos(d: Dibujo): Position[][] {
  return d.type === "Polygon" ? d.coordinates : d.coordinates.flat()
}

/** Igual al anillo de entrada pero sin dos puntos seguidos iguales. No lo muta. */
function sinRepetidosConsecutivos(anillo: Position[]): Position[] {
  const limpio: Position[] = []
  for (const p of anillo) {
    const anterior = limpio[limpio.length - 1]
    if (!anterior || anterior[0] !== p[0] || anterior[1] !== p[1]) limpio.push(p)
  }
  return limpio
}

/**
 * Aplica `sinRepetidosConsecutivos` a cada anillo del dibujo, sin tocar el original: el lápiz
 * cierra el anillo repitiendo el primer punto, y si el último punto muestreado YA era ese
 * punto quedan dos puntos idénticos seguidos, que kinks() confunde con un cruce consigo mismo.
 */
function sinRepetidosEnDibujo(d: Dibujo): Dibujo {
  return d.type === "Polygon"
    ? { type: "Polygon", coordinates: d.coordinates.map(sinRepetidosConsecutivos) }
    : { type: "MultiPolygon", coordinates: d.coordinates.map((poligono) => poligono.map(sinRepetidosConsecutivos)) }
}

/**
 * Devuelve el dibujo listo para guardar, o el motivo —en criollo— por el que no sirve. Los
 * motivos se muestran tal cual al asesor: dicen qué hacer, no qué falló técnicamente.
 */
export function validarDibujo(g: unknown): Validacion {
  const bruto = g as Dibujo
  if (!bruto || typeof bruto !== "object" || (bruto.type !== "Polygon" && bruto.type !== "MultiPolygon")) {
    return { ok: false, motivo: "Eso no es una zona dibujada" }
  }
  if (!Array.isArray(bruto.coordinates) || bruto.coordinates.length === 0) {
    return { ok: false, motivo: "El dibujo está vacío" }
  }

  // Normaliza ANTES de mirar los vértices: ver el comentario de sinRepetidosEnDibujo.
  const d = sinRepetidosEnDibujo(bruto)

  let vertices = 0
  for (const anillo of anillos(d)) {
    if (!Array.isArray(anillo) || anillo.length < MIN_VERTICES_ANILLO) {
      return { ok: false, motivo: "El trazo es demasiado chico: dibujá la zona sin soltar" }
    }
    for (const p of anillo) {
      if (!Array.isArray(p) || p.length < 2) return { ok: false, motivo: "El dibujo tiene un punto roto" }
      const lng = Number(p[0])
      const lat = Number(p[1])
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return { ok: false, motivo: "El dibujo tiene un punto roto" }
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return { ok: false, motivo: "El dibujo se sale del mapa" }
      vertices++
    }
    const primero = anillo[0]
    const ultimo = anillo[anillo.length - 1]
    if (primero[0] !== ultimo[0] || primero[1] !== ultimo[1]) {
      return { ok: false, motivo: "El trazo no cierra: volvé a dibujarlo" }
    }
  }
  if (vertices > MAX_VERTICES) return { ok: false, motivo: "El dibujo tiene demasiados puntos: hacelo más simple" }

  // kinks devuelve los puntos donde el trazo se corta a sí mismo (un 8). booleanValid NO lo
  // detecta: mira la forma general (anillos que cierran, sin pinchazos, agujeros adentro).
  // Van en este orden a propósito: el cruce tiene su propio mensaje, y un 8 rompe el cálculo
  // de solapamiento, así que se pide redibujar y nunca se guarda.
  if (kinks(d).features.length > 0) {
    return { ok: false, motivo: "El trazo se cruza consigo mismo: redibujalo sin que las líneas se pisen" }
  }
  if (!booleanValid(d)) return { ok: false, motivo: "El trazo tiene una forma rara: volvé a dibujarlo" }

  return { ok: true, dibujo: d }
}

/** Área geodésica en km² de todos los pedazos juntos. */
export function areaKm2(d: Dibujo): number {
  return area(feature(d)) / 1_000_000
}

export function contarPedazos(d: Dibujo): number {
  return d.type === "Polygon" ? 1 : d.coordinates.length
}

/**
 * Suma un pedazo a un dibujo. Dos pedazos que se tocan se funden en uno; sueltos quedan
 * como MultiPolygon. Devuelve null si Turf no pudo unirlos (dibujo roto).
 */
export function sumarPedazo(base: Dibujo, nuevo: Dibujo): Dibujo | null {
  try {
    const r = union(featureCollection([feature(base), feature(nuevo)]))
    return r ? r.geometry : null
  } catch {
    return null
  }
}

/**
 * Contra qué zonas se pisa un dibujo, y cuánto. El umbral evita que dos zonas que comparten
 * una calle cuenten como choque: se exige más de MIN_M2_CHOQUE o más de PCT_CHOQUE de la
 * zona más chica, lo que sea MAYOR.
 *
 * Una zona ajena con dibujo roto se saltea (se registra en consola): no puede bloquear a
 * todos los demás por estar mal guardada.
 */
export function choquesContra(nuevo: Dibujo, otras: ZonaParaChoque[]): Choque[] {
  const areaNuevo = area(feature(nuevo))
  const choques: Choque[] = []

  for (const z of otras) {
    let recorte: Feature<Polygon | MultiPolygon> | null
    let areaOtra: number
    try {
      areaOtra = area(feature(z.geojson))
      recorte = intersect(featureCollection([feature(nuevo), feature(z.geojson)]))
    } catch (e) {
      console.warn(`Farming: la zona ${z.id} (${z.nombre}) tiene un dibujo roto y se salteó en el control de choque`, e)
      continue
    }
    if (!recorte) continue

    const areaRecorte = area(recorte)
    const umbral = Math.max(MIN_M2_CHOQUE, PCT_CHOQUE * Math.min(areaNuevo, areaOtra))
    if (areaRecorte <= umbral) continue

    choques.push({
      zona_id: z.id,
      nombre: z.nombre,
      owner_nombre: z.owner_nombre,
      pct: Math.min(100, Math.round((areaRecorte / areaNuevo) * 100)),
      recorte: recorte.geometry,
    })
  }
  return choques
}

/** Rectángulo que encierra TODOS los pedazos (bboxDePoligono de lib/mapa mira solo el primero). */
export function bboxDeDibujo(d: Dibujo): BBox | null {
  let sur = Infinity, norte = -Infinity, oeste = Infinity, este = -Infinity
  for (const anillo of anillos(d)) {
    for (const p of anillo) {
      const lng = Number(p[0]), lat = Number(p[1])
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
      if (lat < sur) sur = lat
      if (lat > norte) norte = lat
      if (lng < oeste) oeste = lng
      if (lng > este) este = lng
    }
  }
  if (!Number.isFinite(sur) || !Number.isFinite(oeste)) return null
  return { sur, oeste, norte, este }
}
