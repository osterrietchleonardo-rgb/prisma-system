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
 *  error crudo (22P02, "invalid input syntax for type uuid"). zonaAccesible lo corta antes.
 *  Exportada: cualquier otro id de esta familia de tablas (por ejemplo, el `pid` de un
 *  propietario) tiene que guardarse contra la MISMA forma, no una copia del literal. */
export const FORMA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function responderError(e: unknown, contexto: string) {
  console.error(`Farming (${contexto}):`, e)
  const msg = (e as any)?.message || "Algo salió mal"
  return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 })
}

/**
 * QUÉ SE VIENE A HACER CON LA ZONA. **Una zona archivada se mira, no se trabaja.**
 *
 * Es un parámetro OBLIGATORIO de `zonaAccesible` y de `direccionAccesible`, y a propósito NO
 * tiene valor por default: si lo tuviera, un endpoint nuevo heredaría en silencio el permiso
 * del que se haya elegido como default y la distinción se perdería por descuido. Así, cada
 * endpoint tiene que declarar qué viene a hacer y TypeScript frena al que no lo declare.
 *
 * "leer"     → la zona archivada SÍ pasa: sus tarjetas, su gente y su historial se pueden ver.
 * "escribir" → la zona archivada NO pasa: nada se crea, se cambia ni se borra adentro de ella.
 */
export type Acceso = "leer" | "escribir"

/** Por qué NO se puede. `null` = se puede. Cada motivo tiene su propio status y su propia
 *  frase: "no existe", "es de un colega" y "está archivada" son tres cosas distintas para
 *  quien mira la pantalla, y contestarlas todas igual esconde la razón real. */
export type MotivoRechazo = "no_existe" | "ajena" | "archivada"

/** El rechazo ya armado para una ZONA. Devuelve `null` cuando se puede seguir. */
export function rechazoDeZona(r: { motivo: MotivoRechazo | null }) {
  switch (r.motivo) {
    case "no_existe":
      return NextResponse.json({ error: "No encontramos esa zona" }, { status: 404 })
    case "ajena":
      return NextResponse.json({ error: "Esa zona es de un colega" }, { status: 403 })
    case "archivada":
      return NextResponse.json(
        { error: "Esta zona está archivada: sus tarjetas se pueden mirar, pero no se pueden cambiar." },
        { status: 409 },
      )
    default:
      return null
  }
}

/** El mismo rechazo, dicho desde la TARJETA: quien está mirando una tarjeta no sabe (ni tiene
 *  por qué saber) que el candado se resuelve por su zona. */
export function rechazoDeDireccion(r: { motivo: MotivoRechazo | null }) {
  switch (r.motivo) {
    case "no_existe":
      return NextResponse.json({ error: "No encontramos esa tarjeta" }, { status: 404 })
    case "ajena":
      return NextResponse.json({ error: "Esa tarjeta es de la zona de un colega" }, { status: 403 })
    case "archivada":
      return NextResponse.json(
        { error: "Esta tarjeta es de una zona archivada: se puede mirar, pero no se puede cambiar." },
        { status: 409 },
      )
    default:
      return null
  }
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

export interface ZonaMinima {
  id: string
  nombre: string
  geojson: unknown
  estado: "activa" | "archivada"
}

/**
 * ¿Puede esta persona hacer ESTO con esta zona? Dueño o compartido, de su agencia, y viva:
 * activa siempre; **archivada solo para leer** (una zona archivada se mira, no se trabaja).
 * Una zona `liberada` no entra por ningún lado: el director la sacó de circulación.
 *
 * Devuelve la zona aunque no se pueda, y el `motivo` de por qué no, para que el endpoint
 * conteste 404 (no existe / es de otra agencia), 403 (es de un colega) o 409 (está archivada)
 * en vez de tapar los tres casos con la misma frase. `rechazoDeZona` los traduce.
 */
export async function zonaAccesible(
  admin: SupabaseClient<any, any, any>,
  zonaId: string,
  agencyId: string,
  userId: string,
  acceso: Acceso,
): Promise<{ zona: ZonaMinima | null; puede: boolean; motivo: MotivoRechazo | null }> {
  // Un id sin forma de uuid no existe, así de simple: ni vale la pena mandarlo a Postgres.
  if (!FORMA_UUID.test(zonaId)) return { zona: null, puede: false, motivo: "no_existe" }

  const { data, error } = await admin
    .from("farming_zonas")
    .select("id, nombre, geojson, owner_user_id, estado")
    .eq("id", zonaId)
    .eq("agency_id", agencyId)
    .in("estado", ["activa", "archivada"])
    .maybeSingle()
  if (error) throw error
  if (!data) return { zona: null, puede: false, motivo: "no_existe" }

  const fila = data as any
  const zona: ZonaMinima = { id: fila.id, nombre: fila.nombre, geojson: fila.geojson, estado: fila.estado }

  let suya = fila.owner_user_id === userId
  if (!suya) {
    const { data: compartida, error: e2 } = await admin
      .from("farming_zonas_compartidas")
      .select("zona_id")
      .eq("zona_id", zonaId)
      .eq("user_id", userId)
      .maybeSingle()
    if (e2) throw e2
    suya = !!compartida
  }

  // "Es de un colega" se contesta ANTES que "está archivada": a quien no tiene acceso no se le
  // cuenta en qué estado está la zona de otro.
  if (!suya) return { zona, puede: false, motivo: "ajena" }
  if (zona.estado === "archivada" && acceso === "escribir") return { zona, puede: false, motivo: "archivada" }

  return { zona, puede: true, motivo: null }
}

/**
 * Las zonas ARCHIVADAS que esta persona puede MIRAR: las suyas y las que le compartieron.
 *
 * Van aparte de `cargarContexto` a propósito: esa función es la que alimenta el control de
 * choque y el tope de zonas, y ahí solo pueden entrar las ACTIVAS — las cuadras de una zona
 * archivada están libres para que otro asesor las dibuje. Mezclarlas volvería a bloquear el
 * territorio que archivar acaba de liberar.
 */
export async function cargarArchivadas(admin: SupabaseClient<any, any, any>, agencyId: string, userId: string) {
  const { data: todas, error: e1 } = await admin
    .from("farming_zonas")
    .select(COLUMNAS_ZONA)
    .eq("agency_id", agencyId)
    .eq("estado", "archivada")
    .order("created_at", { ascending: false })
  if (e1) throw e1

  const ids = (todas || []).map((z: any) => z.id)
  const { data: compartidas, error: e2 } = ids.length
    ? await admin.from("farming_zonas_compartidas").select("zona_id, user_id, agregado_por, created_at").in("zona_id", ids)
    : { data: [], error: null }
  if (e2) throw e2

  const conmigo = new Set((compartidas || []).filter((c: any) => c.user_id === userId).map((c: any) => c.zona_id))
  const filas = (todas || []).filter((z: any) => z.owner_user_id === userId || conmigo.has(z.id))

  return {
    filas: filas as FilaZona[],
    // Solo las de las zonas que efectivamente viajan: la lista de compartidos de una zona
    // archivada ajena no tiene por qué llegarle a nadie.
    compartidas: (compartidas || []).filter((c: any) => filas.some((z: any) => z.id === c.zona_id)) as FilaCompartida[],
  }
}

/**
 * ¿Puede esta persona hacer ESTO con esta tarjeta? Se resuelve por su zona: la tarjeta no
 * tiene una regla propia — incluido el candado de archivada, que es de la zona y no de la
 * tarjeta. Devuelve la tarjeta aunque no se pueda, con el `motivo`, para distinguir 404 (no
 * existe), 403 (es de la zona de un colega) y 409 (la zona está archivada: se mira, no se
 * trabaja). `rechazoDeDireccion` los traduce.
 */
export async function direccionAccesible(
  admin: SupabaseClient<any, any, any>,
  direccionId: string,
  agencyId: string,
  userId: string,
  acceso: Acceso,
): Promise<{ direccion: any | null; puede: boolean; motivo: MotivoRechazo | null }> {
  if (!FORMA_UUID.test(direccionId)) return { direccion: null, puede: false, motivo: "no_existe" }

  const { data, error } = await admin
    .from("farming_direcciones")
    .select("*")
    .eq("id", direccionId)
    .eq("agency_id", agencyId)
    .maybeSingle()
  if (error) throw error
  if (!data) return { direccion: null, puede: false, motivo: "no_existe" }

  // El mismo `acceso` viaja hasta la zona: si la zona está archivada, esta tarjeta se lee pero
  // no se toca, sin que este endpoint tenga que saber nada del estado de la zona.
  const { puede, motivo } = await zonaAccesible(admin, (data as any).zona_id, agencyId, userId, acceso)
  return { direccion: data, puede, motivo }
}
