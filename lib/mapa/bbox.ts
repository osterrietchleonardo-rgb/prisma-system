// Serializa y valida el rectangulo visible del mapa para viajar por la URL.
// Si algo no cierra devuelve null y el endpoint responde 400: nunca se le pasa
// basura a la consulta SQL.
import type { BBox } from "./tipos.ts"

export function serializarBBox(b: BBox): string {
  return `${b.sur},${b.oeste},${b.norte},${b.este}`
}

export function parsearBBox(s: string | null | undefined): BBox | null {
  if (!s) return null

  const partes = s.split(",")
  if (partes.length !== 4) return null

  const nums = partes.map((p) => Number(p.trim()))
  if (nums.some((n) => !Number.isFinite(n))) return null

  const [sur, oeste, norte, este] = nums

  const latOk = (v: number) => v >= -90 && v <= 90
  const lngOk = (v: number) => v >= -180 && v <= 180
  if (!latOk(sur) || !latOk(norte) || !lngOk(oeste) || !lngOk(este)) return null

  // El rectangulo dado vuelta no filtraria nada: es un error, no un caso valido.
  if (sur >= norte) return null

  return { sur, oeste, norte, este }
}

/**
 * Rectangulo que encierra un trazo. Se usa para acomodar el mapa cuando el usuario
 * aplica una zona guardada. Devuelve null si el trazo no tiene puntos usables.
 */
export function bboxDePoligono(poligono: unknown): BBox | null {
  const anillo = (poligono as { coordinates?: unknown[][][] })?.coordinates?.[0]
  if (!Array.isArray(anillo) || anillo.length === 0) return null

  let sur = Infinity, norte = -Infinity, oeste = Infinity, este = -Infinity

  for (const par of anillo) {
    if (!Array.isArray(par) || par.length < 2) continue
    const [lng, lat] = par as number[]
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    if (lat < sur) sur = lat
    if (lat > norte) norte = lat
    if (lng < oeste) oeste = lng
    if (lng > este) este = lng
  }

  if (!Number.isFinite(sur) || !Number.isFinite(oeste)) return null
  return { sur, oeste, norte, este }
}
