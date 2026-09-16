// lib/farming/servidor.ts
//
// Lo que comparten los endpoints de Farming. NO va en un route.ts: Next.js rechaza en el
// build cualquier export de un route.ts que no sea un método HTTP o una config.
//
// createAdminClient se saltea la RLS: por eso cargarContexto filtra SIEMPRE por agency_id.
import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { FilaCompartida, FilaPerfil, FilaZona } from "./armar"

export const COLUMNAS_ZONA =
  "id, agency_id, owner_user_id, nombre, geojson, area_km2, origen_mapa_zona_id, estado, trazo_editado_en, created_at"

/** `farming_zonas.id` es `uuid` en Postgres: un valor con otra forma no da "no existe", da un
 *  error crudo (22P02, "invalid input syntax for type uuid"). zonaAccesible lo corta antes. */
const FORMA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function responderError(e: unknown, contexto: string) {
  console.error(`Farming (${contexto}):`, e)
  const msg = (e as any)?.message || "Algo salió mal"
  return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 })
}

/** Las zonas activas de la agencia, quién las comparte y los perfiles para ponerles nombre. */
export async function cargarContexto(admin: SupabaseClient<any, any, any>, agencyId: string) {
  const { data: filas, error: e1 } = await admin
    .from("farming_zonas")
    .select(COLUMNAS_ZONA)
    .eq("agency_id", agencyId)
    .eq("estado", "activa")
    .order("created_at", { ascending: false })
  if (e1) throw e1

  const ids = (filas || []).map((z: any) => z.id)
  const { data: compartidas, error: e2 } = ids.length
    ? await admin.from("farming_zonas_compartidas").select("zona_id, user_id, agregado_por, created_at").in("zona_id", ids)
    : { data: [], error: null }
  if (e2) throw e2

  const { data: perfiles, error: e3 } = await admin
    .from("profiles")
    .select("id, full_name, role, estado")
    .eq("agency_id", agencyId)
  if (e3) throw e3

  return {
    filas: (filas || []) as FilaZona[],
    compartidas: (compartidas || []) as FilaCompartida[],
    perfiles: (perfiles || []) as FilaPerfil[],
  }
}

/**
 * ¿Puede esta persona ver esta zona? Dueño o compartido, de su agencia y activa.
 * Devuelve la zona aunque no pueda, para distinguir 403 (es de un colega) de 404 (no existe,
 * es de otra agencia, o ya no está activa): son dos cosas distintas para quien mira la pantalla.
 */
export async function zonaAccesible(
  admin: SupabaseClient<any, any, any>,
  zonaId: string,
  agencyId: string,
  userId: string,
): Promise<{ zona: { id: string; nombre: string; geojson: unknown } | null; puede: boolean }> {
  // Un id sin forma de uuid no existe, así de simple: ni vale la pena mandarlo a Postgres.
  if (!FORMA_UUID.test(zonaId)) return { zona: null, puede: false }

  const { data, error } = await admin
    .from("farming_zonas")
    .select("id, nombre, geojson, owner_user_id")
    .eq("id", zonaId)
    .eq("agency_id", agencyId)
    .eq("estado", "activa")
    .maybeSingle()
  if (error) throw error
  if (!data) return { zona: null, puede: false }

  const fila = data as any
  if (fila.owner_user_id === userId) {
    return { zona: { id: fila.id, nombre: fila.nombre, geojson: fila.geojson }, puede: true }
  }

  const { data: compartida, error: e2 } = await admin
    .from("farming_zonas_compartidas")
    .select("zona_id")
    .eq("zona_id", zonaId)
    .eq("user_id", userId)
    .maybeSingle()
  if (e2) throw e2

  return { zona: { id: fila.id, nombre: fila.nombre, geojson: fila.geojson }, puede: !!compartida }
}

/**
 * ¿Puede esta persona tocar esta tarjeta? Se resuelve por su zona: la tarjeta no tiene una
 * regla propia. Devuelve la tarjeta aunque no pueda, para distinguir 403 (es de la zona de un
 * colega) de 404 (no existe).
 */
export async function direccionAccesible(
  admin: SupabaseClient<any, any, any>,
  direccionId: string,
  agencyId: string,
  userId: string,
): Promise<{ direccion: any | null; puede: boolean }> {
  if (!FORMA_UUID.test(direccionId)) return { direccion: null, puede: false }

  const { data, error } = await admin
    .from("farming_direcciones")
    .select("*")
    .eq("id", direccionId)
    .eq("agency_id", agencyId)
    .maybeSingle()
  if (error) throw error
  if (!data) return { direccion: null, puede: false }

  const { puede } = await zonaAccesible(admin, (data as any).zona_id, agencyId, userId)
  return { direccion: data, puede }
}
