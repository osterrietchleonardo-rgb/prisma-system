// app/api/farming/direcciones/[id]/mover/route.ts
//
// Farming · mover una tarjeta a otra columna del tablero, con su historial en el MISMO pedido.
//
// Es el corazón de la etapa: el tablero solo es un método porque cada movimiento queda
// anotado —qué se hizo, qué sigue, para cuándo—. Si una tarjeta pudiera cambiar de columna sin
// dejar una fila en farming_contactos, el tablero dejaría de ser un registro de lo caminado y
// pasaría a ser una pared de colores; y en una zona compartida, el colega no tendría forma de
// saber quién movió qué.
//
// PostgREST no da transacciones: por eso esto es dos escrituras y una compensación explícita,
// no una función SQL. Si el INSERT del historial falla después de mover la tarjeta, ESTA
// RUTA LA VUELVE A SU LUGAR y lo dice: una tarjeta movida sin su historial estaría mintiendo
// sobre lo que pasó.
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireTenant } from "@/lib/auth/tenant-validation"
import { direccionAccesible, rechazoDeDireccion, responderError } from "@/lib/farming/servidor"
import { validarMovimiento, type Movimiento } from "@/lib/farming/tablero"

export const dynamic = "force-dynamic"

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId, agencyId } = await requireTenant()
    const admin = createAdminClient()

    // El candado corre ANTES que cualquier otra cosa, sin excepción: 404 si no existe o es de
    // otra agencia, 403 si es de la zona de un colega, 409 si la zona está archivada (se mira,
    // no se trabaja).
    const acceso = await direccionAccesible(admin, params.id, agencyId, userId, "escribir")
    const no = rechazoDeDireccion(acceso)
    if (no) return no
    const direccion = acceso.direccion

    const body = await req.json().catch(() => ({}))

    // Si `validarMovimiento` encuentra algo, 400 y NADA se escribe todavía — ni la etapa ni el
    // historial.
    const errores = validarMovimiento(body as Partial<Movimiento>)
    if (errores.length > 0) {
      return NextResponse.json({ error: errores.join(" ") }, { status: 400 })
    }
    const m = body as Movimiento

    // Se guardan ANTES de tocar nada los CINCO campos que el UPDATE de abajo va a pisar, no
    // solo la etapa: si el insert del historial falla y la compensación solo devolviera
    // `etapa`, la tarjeta quedaría en su columna vieja pero con la próxima acción, la fecha de
    // esa próxima acción, el orden y el `updated_at` de un movimiento que nunca quedó
    // anotado — mintiendo tan bien como si no hubiera vuelto.
    const antes = {
      etapa: direccion.etapa as string,
      orden: direccion.orden as number,
      proxima_accion: direccion.proxima_accion ?? null,
      proxima_accion_en: direccion.proxima_accion_en ?? null,
      updated_at: direccion.updated_at as string,
    }
    const etapa_desde = antes.etapa

    // Lista blanca explícita, campo por campo: nunca `...body`. `orden` siempre vuelve a 0 (no
    // se arrastra entre tarjetas: al caer en una columna, la tarjeta va al principio). Nunca
    // `unidades_totales` (es GENERADA: mandarla es un 428C9), ni `zona_id`, ni `agency_id`.
    // Mover a la MISMA etapa en la que ya está también pasa por acá y también escribe
    // historial: es como anotar «pasé otra carta» sin cambiar de columna, y no hay ninguna
    // rama que lo bloquee.
    //
    // `.eq("etapa", antes.etapa)` es la carrera perdida, resuelta: en una zona compartida dos
    // asesores pueden abrir la MISMA tarjeta al mismo tiempo, los dos leyendo la misma etapa de
    // partida. Sin esta condición, el segundo en escribir pisaría el movimiento del primero
    // (etapa, próxima acción y fecha incluidas) y encima anotaría en su historial un
    // `etapa_desde` que en la base nunca fue cierto — el primer movimiento habría quedado
    // adentro de la etapa de partida del segundo. `{ count: "exact" }` es la única forma de
    // saber si el UPDATE tocó la fila de verdad o si otro pedido ya la había movido: `count ===
    // 0` estricto, nunca un chequeo falsy, porque un `count` nulo (que el cliente no supo
    // contar) no puede hacerse pasar por una carrera perdida.
    const { data: movidas, count, error: eUpdate } = await admin
      .from("farming_direcciones")
      .update(
        {
          etapa: m.etapa_hasta,
          orden: 0,
          proxima_accion: m.proxima_accion,
          proxima_accion_en: m.proxima_accion_en,
          updated_at: new Date().toISOString(),
        },
        { count: "exact" },
      )
      .eq("id", params.id)
      .eq("etapa", antes.etapa)
      .select("*")
    if (eUpdate) throw eUpdate

    // Cero filas tocadas = alguien más ya movió esta tarjeta desde que este pedido la leyó.
    // Nada se escribió (ni la etapa ni el historial): el trabajo del otro asesor está intacto,
    // y este pedido se corta ANTES del insert de farming_contactos.
    if (count === 0) {
      return NextResponse.json(
        { error: "Alguien movió esta tarjeta antes que vos: volvé a mirarla." },
        { status: 409 },
      )
    }
    const movida = movidas![0]

    // Hoy en horario de Buenos Aires, no `current_date` de Postgres (UTC): una visita cargada a
    // las 21:30 locales caería en la fila de mañana. En un cuaderno de caminata la fecha ES el
    // dato.
    const fecha = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })

    // `direccion_id`, `agency_id` y `user_id` salen de la SESIÓN y de la tarjeta ya validada,
    // nunca del body: nadie firma un movimiento a nombre de otro ni en la agencia de otro.
    const { data: contacto, error: eInsert } = await admin
      .from("farming_contactos")
      .insert({
        direccion_id: params.id,
        agency_id: agencyId,
        user_id: userId,
        fecha,
        tipo: m.tipo,
        cartas_entregadas: m.cartas_entregadas ?? null,
        etapa_desde,
        etapa_hasta: m.etapa_hasta,
        nota: m.nota ?? null,
      })
      .select("*")
      .single()

    if (eInsert) {
      // El historial es la otra mitad de "mover": si no se pudo anotar, la tarjeta vuelve
      // adonde estaba — los cinco campos, no solo la etapa (ver el comentario de `antes`).
      //
      // `.eq("etapa", m.etapa_hasta)` es la otra mitad de la carrera: esta reversión solo puede
      // devolver la tarjeta si TODAVÍA está en la etapa que este mismo pedido acaba de escribir.
      // Si en el instante entre el UPDATE de arriba y este, otro asesor ya la volvió a mover
      // (un movimiento válido, con su propio historial ya guardado), pisarla acá borraría ESE
      // movimiento sin dejar ningún rastro: el colega vería su tarjeta saltar sola a una etapa
      // vieja, contradiciendo su propio historial. `{ count: "exact" }` + `count === 0` estricto
      // dicen si la reversión encontró la fila tal como la dejamos o si alguien ya la tocó de
      // nuevo.
      const { count: revertidas, error: eRevertir } = await admin
        .from("farming_direcciones")
        .update(antes, { count: "exact" })
        .eq("id", params.id)
        .eq("etapa", m.etapa_hasta)

      console.error("Farming (mover tarjeta, insert de historial):", eInsert)

      if (eRevertir) {
        // La doble falla es la que este endpoint existe para evitar: si se contestara el
        // mensaje de siempre, el asesor leería «la dejamos donde estaba» sobre una tarjeta que
        // en realidad SÍ se movió, sin historial que lo respalde. Un texto distinto para un
        // problema distinto.
        console.error("Farming (revertir mover, tras insert fallido):", eRevertir)
        return NextResponse.json(
          {
            error:
              "No pudimos anotar el movimiento y tampoco devolver la tarjeta a su columna: revisá esa tarjeta antes de seguir.",
          },
          { status: 500 },
        )
      }

      if (revertidas === 0) {
        // No hubo error de SQL, pero la reversión no tocó nada: alguien más movió esta tarjeta
        // de nuevo mientras este pedido fallaba. NO se revierte por encima de ese movimiento
        // más nuevo — el trabajo del colega queda como está, con su propio historial intacto.
        // Mensaje distinto del de la doble falla de arriba: acá no hubo ningún error de
        // escritura, hubo una carrera que este pedido perdió dos veces seguidas.
        console.error("Farming (revertir mover): otro movimiento más nuevo ya pisó esta tarjeta, no se revierte")
        return NextResponse.json(
          {
            error:
              "No pudimos anotar tu movimiento, y mientras tanto alguien volvió a mover esta tarjeta: no la tocamos para no perder ESE movimiento. Revisala antes de seguir.",
          },
          { status: 500 },
        )
      }

      return NextResponse.json(
        { error: "No pudimos anotar el movimiento, así que dejamos la tarjeta donde estaba." },
        { status: 500 },
      )
    }

    return NextResponse.json({ direccion: movida, contacto })
  } catch (e) {
    return responderError(e, "mover tarjeta")
  }
}
