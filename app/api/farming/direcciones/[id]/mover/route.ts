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

    // Se guarda ANTES de tocar nada: es adónde se vuelve si el historial no se puede anotar.
    const etapa_desde = direccion.etapa as string

    // Lista blanca explícita, campo por campo: nunca `...body`. `orden` siempre vuelve a 0 (no
    // se arrastra entre tarjetas: al caer en una columna, la tarjeta va al principio). Nunca
    // `unidades_totales` (es GENERADA: mandarla es un 428C9), ni `zona_id`, ni `agency_id`.
    const { data: movida, error: eUpdate } = await admin
      .from("farming_direcciones")
      .update({
        etapa: m.etapa_hasta,
        orden: 0,
        proxima_accion: m.proxima_accion,
        proxima_accion_en: m.proxima_accion_en,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.id)
      .select("*")
      .single()
    if (eUpdate) throw eUpdate

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
      // adonde estaba. Mover sin dejar rastro es peor que no mover.
      const { error: eRevertir } = await admin
        .from("farming_direcciones")
        .update({ etapa: etapa_desde })
        .eq("id", params.id)
      if (eRevertir) console.error("Farming (revertir mover, tras insert fallido):", eRevertir)

      console.error("Farming (mover tarjeta, insert de historial):", eInsert)
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
