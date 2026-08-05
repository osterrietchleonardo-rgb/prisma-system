import type { SupabaseClient } from '@supabase/supabase-js'

// Punto único para "buscar o crear el chat de este teléfono".
//
// El problema que resuelve: buscar-y-después-crear son dos viajes separados a la
// base. Si dos mensajes del mismo lead entran a la vez (Meta manda un POST por
// mensaje y Vercel los atiende en paralelo), los dos buscan, los dos no encuentran
// nada, y los dos crean. Resultado: el mismo lead partido en dos chats, con los
// mensajes y la memoria del bot repartidos.
//
// En condiciones normales esa ventana dura ~200ms y nunca chocan. El 4-ago-2026 el
// sistema se puso ~100x más lento (hasta 71s en atender un mensaje) y la ventana se
// abrió tanto que se duplicaron 3 leads, uno de ellos en 5 chats.
//
// La solución tiene dos mitades y las dos son necesarias:
//   1) El índice único (agency_id, contact_phone) en la base: es el árbitro real.
//      Sin él, ningún código puede garantizar unicidad entre procesos paralelos.
//   2) Esta función: cuando el índice rechaza el INSERT perdedor de la carrera
//      (error 23505), en vez de dar el mensaje por perdido vuelve a buscar y
//      devuelve el chat que ganó. Sin esto, el índice convertiría un duplicado en
//      un mensaje perdido, que es peor.
//
// Importante: NUNCA pisa una conversación que ya existe. Los campos de `nueva` se
// usan solo si hay que crearla; si ya estaba, cada llamador decide qué actualizar.

const VIOLACION_DE_UNICIDAD = '23505'

export type ResultadoConversacion<T> = {
  conv: T | null
  /** true solo si esta llamada fue la que la creó (sirve para no re-notificar). */
  creada: boolean
  error: unknown
}

export async function buscarOCrearConversacion<T extends { id: string }>(
  client: SupabaseClient,
  params: {
    agency_id: string
    contact_phone: string
    /** Columnas a devolver. Por defecto '*'. */
    columnas?: string
    /** Valores para el INSERT. Solo se usan si hay que crear el chat. */
    nueva: Record<string, unknown>
    /**
     * Cliente para las LECTURAS. Va cuando el llamador corre con la sesión del
     * asesor: la RLS le esconde los chats de otros asesores, así que buscando con
     * su sesión un chat existente parece inexistente y se intenta crear de nuevo.
     * Por defecto usa el mismo `client`.
     */
    readClient?: SupabaseClient
    /**
     * Solo para la prueba de concurrencia (scripts/prueba-carrera-chats.ts), que
     * corre contra una tabla clon para no escribir en la real. En la app siempre
     * es 'wa_conversations'.
     */
    tabla?: string
  }
): Promise<ResultadoConversacion<T>> {
  const { agency_id, contact_phone, columnas = '*', nueva, tabla = 'wa_conversations' } = params
  const lector = params.readClient ?? client

  const buscar = async () => {
    // order+limit(1) en vez de un maybeSingle pelado: si en el futuro volviera a
    // haber duplicados (índice caído, backfill a mano), esto devuelve el chat más
    // reciente en vez de reventar con "multiple rows returned".
    const { data, error } = await lector
      .from(tabla)
      .select(columnas)
      .eq('agency_id', agency_id)
      .eq('contact_phone', contact_phone)
      .order('created_at', { ascending: false })
      .limit(1)
    if (error) return { row: null, error }
    // `select(columnas)` con un string dinámico no le deja inferir el tipo a
    // supabase-js; el llamador lo declara al pasar <T>.
    return { row: ((data?.[0] as unknown) as T | undefined) ?? null, error: null }
  }

  const existente = await buscar()
  if (existente.error) return { conv: null, creada: false, error: existente.error }
  if (existente.row) return { conv: existente.row, creada: false, error: null }

  const { data: creada, error: errInsert } = await client
    .from(tabla)
    .insert({ agency_id, contact_phone, ...nueva })
    .select(columnas)
    .single()

  if (!errInsert) return { conv: (creada as unknown) as T, creada: true, error: null }

  // Perdimos la carrera: otro proceso creó el chat entre nuestro SELECT y nuestro
  // INSERT. No es un error a reportar, es el caso que veníamos a resolver.
  if ((errInsert as { code?: string }).code === VIOLACION_DE_UNICIDAD) {
    const segundoIntento = await buscar()
    if (segundoIntento.row) {
      return { conv: segundoIntento.row, creada: false, error: null }
    }
    // Chocó con el índice pero no aparece al buscarla: solo puede pasar si la RLS
    // del lector la esconde. Devolvemos el error real para que el llamador lo loguee.
    return { conv: null, creada: false, error: segundoIntento.error ?? errInsert }
  }

  return { conv: null, creada: false, error: errInsert }
}
