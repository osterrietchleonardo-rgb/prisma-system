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
