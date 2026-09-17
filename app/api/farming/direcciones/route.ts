// Farming · la tarjeta de la caminata (hoja 1 del Excel). La mayoría de lo que el asesor
// releva NO está publicado en ningún portal: por eso la tarjeta se crea desde cero y lo único
// obligatorio es la calle y el tipo — está parado en la vereda con el teléfono en la mano.
//
// createAdminClient se saltea la RLS: el acceso a la zona se valida a mano, SIEMPRE, antes de
// tocar farming_direcciones (en las dos operaciones).
import { NextResponse } from "next/server"
import { booleanPointInPolygon, point } from "@turf/turf"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireTenant } from "@/lib/auth/tenant-validation"
import { rechazoDeZona, responderError, zonaAccesible } from "@/lib/farming/servidor"
import { normalizarDireccion, tieneAlturaComparable, validarDireccion } from "@/lib/farming/direcciones"

export const dynamic = "force-dynamic"

/** `Number(null)` es 0 y `Number("")` también: sobre el valor crudo, no sobre un cast directo,
 *  para que un aviso_id ausente sea `null` (caminata) y no "el aviso 0" (aviso). */
function avisoIdDe(v: unknown): number | null {
  if (v === null || v === undefined || String(v).trim() === "") return null
  const n = Number(v)
  return Number.isInteger(n) ? n : null
}

/** true si el punto cae afuera del polígono de la zona. Un geojson roto no bloquea el alta —el
 *  candado real ya pasó en zonaAccesible— así que se guarda como si no hubiera coordenadas. */
function calculaFueraDeZona(lat: number, lng: number, geojson: unknown): boolean {
  try {
    return !booleanPointInPolygon(point([lng, lat]), geojson as any)
  } catch {
    return false
  }
}

export async function GET(req: Request) {
  try {
    const { userId, agencyId } = await requireTenant()
    const zonaId = new URL(req.url).searchParams.get("zona_id")?.trim()
    if (!zonaId) return NextResponse.json({ error: "Falta la zona" }, { status: 400 })

    const admin = createAdminClient()
    // "leer": una zona ARCHIVADA sí contesta acá. Sus tarjetas están en la base y el asesor
    // tiene que poder verlas — es exactamente lo que le promete el cartel al archivarla.
    const acceso = await zonaAccesible(admin, zonaId, agencyId, userId, "leer")
    const no = rechazoDeZona(acceso)
    if (no) return no
    const zona = acceso.zona!

    // `agency_id` es una columna denormalizada (ver el comentario de la migración): filtrar por
    // ella también acá, y no solo confiar en `zona_id`, hace que una fila mal escrita falle
    // cerrada en vez de filtrarse — la misma defensa que ya tiene `direccionAccesible`.
    //
    // Tres claves de orden: etapa y orden, como pide el tablero, y `created_at` de desempate —
    // toda tarjeta nace con `orden: 0`, así que sin esto el tablero se reordenaría solo en cada
    // recarga. El doble de prueba (lib/farming/base-falsa.ts) solo respeta el ÚLTIMO .order() de
    // la cadena: contra Postgres real las tres valen.
    const { data, error } = await admin
      .from("farming_direcciones")
      .select("*")
      .eq("zona_id", zonaId)
      .eq("agency_id", agencyId)
      .order("etapa", { ascending: true })
      .order("orden", { ascending: true })
      .order("created_at", { ascending: true })
    if (error) throw error

    // `estado` viaja: la pantalla tiene que poder decir «esta zona está archivada» con el dato
    // del servidor y no solo con lo que le pasaron por props.
    return NextResponse.json({
      zona: { id: zona.id, nombre: zona.nombre, estado: zona.estado },
      direcciones: data || [],
    })
  } catch (e) {
    return responderError(e, "direcciones de la zona")
  }
}

export async function POST(req: Request) {
  try {
    const { userId, agencyId } = await requireTenant()
    const body = await req.json().catch(() => ({}))

    // Se convierten una sola vez, ACÁ arriba, antes de validar: si `calle` o `altura` llegan
    // como número JSON (lo que manda cualquier cliente que no castea el formulario),
    // `.trim()` revienta más abajo con un TypeError. Lo que se valida, lo que se compara contra
    // los duplicados y lo que se guarda tienen que ser el MISMO string.
    if (body && typeof body === "object") {
      if (body.calle != null) body.calle = String(body.calle)
      if (body.altura != null) body.altura = String(body.altura)
    }

    const zonaId = String(body?.zona_id || "").trim()
    if (!zonaId) return NextResponse.json({ error: "Falta la zona" }, { status: 400 })

    const admin = createAdminClient()
    // "escribir": en una zona ARCHIVADA no nace ninguna tarjeta nueva. Se mira, no se trabaja.
    const acceso = await zonaAccesible(admin, zonaId, agencyId, userId, "escribir")
    const no = rechazoDeZona(acceso)
    if (no) return no
    const zona = acceso.zona!

    // La última puerta antes de la base: la pantalla ya validó, pero el body puede venir de
    // cualquier lado. `errores` bloquea (400, no se escribe nada); `avisos` NO bloquea: la
    // tarjeta se guarda igual y viaja en la respuesta para que la pantalla los muestre.
    const { errores, avisos } = validarDireccion(body)
    if (errores.length > 0) {
      return NextResponse.json({ error: errores.join(" ") }, { status: 400 })
    }

    // Un aviso_id que se mandó pero no se puede leer (ej.: "abc") no puede tragarse en
    // silencio y quedar como "caminata": es un pedido roto, 400.
    const avisoIdCrudo = body?.aviso_id
    const sePidioAviso = avisoIdCrudo !== null && avisoIdCrudo !== undefined && String(avisoIdCrudo).trim() !== ""
    const avisoId = sePidioAviso ? avisoIdDe(avisoIdCrudo) : null
    if (sePidioAviso && avisoId === null) {
      return NextResponse.json({ error: "El aviso no es válido" }, { status: 400 })
    }
    // El origen lo decide el servidor, nunca el body.
    const origen: "aviso" | "caminata" = avisoId !== null ? "aviso" : "caminata"

    // El duplicado se busca con la MISMA condición que el índice parcial: sin altura
    // comparable (vacía, o "s/n"/"sn"/"s.n."), no hay puerta que pueda chocar.
    if (tieneAlturaComparable(body?.altura)) {
      const { data: existentes, error: eDup } = await admin
        .from("farming_direcciones")
        .select("calle, altura")
        .eq("zona_id", zonaId)
        .eq("agency_id", agencyId)
      if (eDup) throw eDup

      const normalizadaNueva = normalizarDireccion(body.calle, body.altura)
      const choque = (existentes || []).find(
        (d: any) => tieneAlturaComparable(d.altura) && normalizarDireccion(d.calle, d.altura) === normalizadaNueva,
      )
      if (choque) {
        return NextResponse.json(
          { error: `Esa puerta ya está cargada en esta zona: ${choque.calle} ${choque.altura}` },
          { status: 409 },
        )
      }
    }

    const lat = typeof body?.lat === "number" && Number.isFinite(body.lat) ? body.lat : null
    const lng = typeof body?.lng === "number" && Number.isFinite(body.lng) ? body.lng : null
    // No se rechaza la tarjeta por caer afuera del polígono: se guarda igual y la pantalla avisa.
    const fueraDeZona = lat !== null && lng !== null ? calculaFueraDeZona(lat, lng, zona.geojson) : false

    // Blanqueada a mano, campo por campo (nunca `...body`): así ninguna clave del body —
    // incluida `unidades_totales`, que es GENERADA y hace fallar el insert— llega a la base.
    // `etapa` y `orden` se fijan acá EXPLÍCITAMENTE (no se omiten confiando en el default de la
    // columna): toda tarjeta nueva nace en "relevado", primera en su columna, sin importar qué
    // mande el body.
    const payload: Record<string, unknown> = {
      zona_id: zonaId,
      agency_id: agencyId,
      creada_por: userId,
      etapa: "relevado",
      orden: 0,
      tramo: body?.tramo ?? null,
      calle: body.calle,
      altura: body?.altura ?? null,
      tipo: body.tipo,
      pisos: body?.pisos ?? null,
      unidades_por_piso: body?.unidades_por_piso ?? null,
      unidades_manual: body?.unidades_manual ?? null,
      encargado_nombre: body?.encargado_nombre ?? null,
      encargado_turno: body?.encargado_turno ?? null,
      encargado_notas: body?.encargado_notas ?? null,
      lat,
      lng,
      a_la_venta: !!body?.a_la_venta,
      cartel: body?.cartel ?? null,
      inmobiliaria_cartel: body?.inmobiliaria_cartel ?? null,
      precio_pedido: body?.precio_pedido ?? null,
      moneda: body?.moneda ?? null,
      observaciones: body?.observaciones ?? null,
      relevada_en: body?.relevada_en ?? null,
      // «Qué sigue» y para cuándo: las dos columnas existen desde la migración y la tarjeta las
      // muestra como línea visible. Sin esto el campo del formulario se guardaba en silencio en
      // ningún lado, que es peor que no tenerlo.
      proxima_accion: body?.proxima_accion ?? null,
      proxima_accion_en: body?.proxima_accion_en ?? null,
      aviso_id: avisoId,
      aviso_es_dueno_directo: avisoId !== null ? !!body?.aviso_es_dueno_directo : null,
      origen,
      // `fuera_de_zona` es un dato cierto y se guarda. `fuera_de_zona_desde` es «cuándo SE
      // CAYÓ» (el comentario de la migración), y una tarjeta recién creada nunca se cayó: nació
      // así. Queda en null acá SIEMPRE; solo el redibujado del trazo, en la etapa 3-B, la
      // estampa. Es la diferencia que esa etapa va a usar para separar las dos poblaciones:
      // `fuera_de_zona_desde is not null` = se cayó al mover el trazo; `null` = nació afuera.
      fuera_de_zona: fueraDeZona,
      fuera_de_zona_desde: null,
    }

    let direccion: any
    try {
      const { data, error } = await admin.from("farming_direcciones").insert(payload).select("*").single()
      if (error) throw error
      direccion = data
    } catch (e: any) {
      // El chequeo de arriba da el mensaje lindo; el índice parcial es el candado de verdad:
      // dos pedidos genuinamente concurrentes pueden pasar el chequeo los dos. Un 23505 acá es
      // la MISMA puerta duplicada, con el mismo 409.
      if (e?.code === "23505") {
        return NextResponse.json({ error: "Esa puerta ya está cargada en esta zona." }, { status: 409 })
      }
      throw e
    }

    // El aviso que dio origen a la tarjeta queda "convertido" con la dirección nueva. UPDATE y
    // no upsert: si la marca ya estaba "descartado", un ON CONFLICT DO NOTHING no haría nada en
    // silencio. Si todavía no existe (el asesor nunca la descartó), se inserta.
    if (avisoId !== null) {
      const { data: tocadas, error: eUpd } = await admin
        .from("farming_avisos_marca")
        .update({ estado: "convertido", direccion_id: direccion.id })
        .eq("zona_id", zonaId)
        .eq("aviso_id", avisoId)
        .select("*")
      if (eUpd) throw eUpd

      if (!tocadas || tocadas.length === 0) {
        const { error: eIns } = await admin.from("farming_avisos_marca").insert({
          zona_id: zonaId,
          aviso_id: avisoId,
          aviso_es_dueno_directo: !!body?.aviso_es_dueno_directo,
          user_id: userId,
          estado: "convertido",
          direccion_id: direccion.id,
        })
        if (eIns) throw eIns
      }
    }

    return NextResponse.json(
      { direccion, avisos, ...(fueraDeZona ? { fuera_de_zona: true } : {}) },
      { status: 201 },
    )
  } catch (e) {
    return responderError(e, "alta de dirección")
  }
}
