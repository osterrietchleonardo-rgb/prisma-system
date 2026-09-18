// app/api/farming/direcciones/[id]/route.ts
//
// Farming · editar y borrar UNA tarjeta de la caminata. `direccionAccesible` (lib/farming/
// servidor.ts) es el único candado: se resuelve por la zona de la tarjeta, no por una regla
// propia, y corre ANTES de cada escritura y de cada borrado, sin excepción.
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireTenant } from "@/lib/auth/tenant-validation"
import {
  calculaFueraDeZona,
  direccionAccesible,
  rechazoDeDireccion,
  responderError,
} from "@/lib/farming/servidor"
import { normalizarDireccion, tieneAlturaComparable, valoresImposibles } from "@/lib/farming/direcciones"

export const dynamic = "force-dynamic"

/**
 * Lista blanca EXPLÍCITA de lo que un PATCH puede tocar: cualquier subconjunto de
 * `EntradaDireccion` más `orden`. Se arma campo por campo (nunca `...body` ni un `delete` de
 * las prohibidas), así que ninguna clave fuera de esta lista llega al UPDATE por esta vía — ni
 * `zona_id`, `agency_id`, `creada_por`, `created_at`, `id`, `aviso_id`,
 * `aviso_es_dueno_directo`, `origen`, y sobre todo nunca `unidades_totales`: es GENERADA, y
 * mandarla hace fallar el UPDATE con 428C9.
 *
 * `etapa` TAMPOCO está acá, a propósito, desde la revisión final de la 3-B: cambiar de columna
 * es trabajo de `/mover` y SOLO de `/mover`, porque es el único endpoint que firma el
 * movimiento con su fila de historial. Si este PATCH todavía pudiera tocar `etapa`, una tarjeta
 * podía saltar de columna sin dejar rastro de qué se hizo, cuál es el próximo paso ni para
 * cuándo — exactamente lo que el tablero existe para impedir. Un PATCH que manda `etapa` no
 * revienta ni avisa: el campo se ignora, igual que cualquier otra clave fuera de esta lista
 * (`zona_id`, `id`, etc.).
 *
 * `fuera_de_zona` y `fuera_de_zona_desde` tampoco están acá — el body nunca las decide — pero
 * SÍ pueden terminar en el payload: el bloque de más abajo las recalcula a mano, con el mismo
 * criterio que el alta, cuando el PATCH trae `lat` o `lng`.
 */
const COLUMNAS_EDITABLES = [
  "tramo",
  "calle",
  "altura",
  "tipo",
  "pisos",
  "unidades_por_piso",
  "unidades_manual",
  "encargado_nombre",
  "encargado_turno",
  "encargado_notas",
  "lat",
  "lng",
  "orden",
  "a_la_venta",
  "cartel",
  "inmobiliaria_cartel",
  "precio_pedido",
  "moneda",
  "observaciones",
  "relevada_en",
  // «Qué sigue» y para cuándo SÍ se editan desde acá, aunque `etapa` no: corregir el texto o la
  // fecha del próximo paso es arreglar un error de tipeo, no anotar un movimiento nuevo — obligar
  // a mover la tarjeta (con su carta, su fecha y su historial) solo para corregir una fecha mal
  // tipeada ensuciaría el historial con un movimiento que nunca pasó. El costo, dicho en voz
  // alta: en una zona compartida, un colega puede corregir el próximo paso de una tarjeta sin
  // que quede su firma en ningún lado — a diferencia de un movimiento real, que siempre queda
  // firmado en farming_contactos con el `user_id` de quien lo hizo.
  "proxima_accion",
  "proxima_accion_en",
] as const

/** Las DOS operaciones de este archivo escriben, así que las dos piden acceso de "escribir":
 *  una tarjeta de zona archivada se lee (por el GET de la lista) pero no se cambia ni se borra. */
async function candado(admin: ReturnType<typeof createAdminClient>, id: string, agencyId: string, userId: string) {
  const acceso = await direccionAccesible(admin, id, agencyId, userId, "escribir")
  const no = rechazoDeDireccion(acceso)
  if (no) return { ok: false as const, resp: no }
  return { ok: true as const, direccion: acceso.direccion }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId, agencyId } = await requireTenant()
    const admin = createAdminClient()

    const c = await candado(admin, params.id, agencyId, userId)
    if (!c.ok) return c.resp

    const body = await req.json().catch(() => ({}))

    // La MISMA conversión que hace el alta, y por el mismo motivo: si `calle` o `altura` llegan
    // como número JSON (un cliente que no castea el formulario), `.trim()` revienta más abajo
    // con un TypeError, y lo que se compara contra los duplicados tiene que ser el MISMO string
    // que se guarda. Las dos puertas de la tarjeta tienen que tratar el body igual.
    if (body && typeof body === "object") {
      if (body.calle != null) body.calle = String(body.calle)
      if (body.altura != null) body.altura = String(body.altura)
    }

    // Antes de tocar la base: un valor imposible (tipo, cartel, moneda, pisos,
    // unidades_por_piso, unidades_manual fuera de lo que la migración acepta), es un error del
    // que se avisa (400), no un 500 crudo de Postgres con un 23514/22P02 sin traducir.
    // `valoresImposibles` —y no `validarDireccion`— porque el PATCH manda datos PARCIALES: un
    // cuerpo sin calle ni tipo es legítimo acá (se está corrigiendo un solo campo), cosa que
    // `validarDireccion` rechazaría.
    const errores: string[] = []
    // `etapa` no se valida más acá: no está en `COLUMNAS_EDITABLES`, así que cualquier valor que
    // el body traiga en esa clave —válido, inválido, lo que sea— se ignora antes de llegar al
    // payload. Validarla sería fingir que este endpoint todavía decide algo sobre ella.
    // `orden` es `integer not null` y solo se puede tocar desde acá (el alta lo fija en 0): un
    // `orden: "x"` no rompe ninguna regla de negocio, rompe el cast de Postgres y vuelve como
    // un 500 en inglés. Mismo criterio que lat/lng/precio en valoresImposibles.
    if (
      Object.prototype.hasOwnProperty.call(body, "orden") &&
      (typeof body.orden !== "number" || !Number.isInteger(body.orden))
    ) {
      errores.push("El orden tiene que ser un número entero.")
    }
    // `calle` y `tipo` son `not null` en la base. Omitirlas es un PATCH parcial legítimo (por
    // eso `valoresImposibles`, y no `validarDireccion`, es lo que corre acá) — pero mandarlas
    // EXPLÍCITAMENTE en `null` no lo es: sin este candado, ese `null` llega crudo al UPDATE y
    // Postgres lo revienta con un 23502 en inglés. Mismo mensaje que ya usa el alta
    // (`validarDireccion`), no uno nuevo. Ojo: es el `null` explícito, no cualquier valor
    // falsy — una `calle: ""` es otro caso, y no lo tapa este chequeo.
    if (Object.prototype.hasOwnProperty.call(body, "calle") && body.calle === null) {
      errores.push("Falta la calle.")
    }
    if (Object.prototype.hasOwnProperty.call(body, "tipo") && body.tipo === null) {
      errores.push("Elegí qué tipo de propiedad es.")
    }
    errores.push(...valoresImposibles(body))
    if (errores.length > 0) {
      return NextResponse.json({ error: errores.join(" ") }, { status: 400 })
    }

    // La misma puerta dos veces en la misma zona: el alta ya lo frena, y corregir una tarjeta
    // TAMBIÉN puede crear el duplicado (calle y altura se editan). Sin esto, el asesor que está
    // arreglando algo se llevaba el texto crudo de Postgres —«duplicate key value violates
    // unique constraint farming_direcciones_sin_repetir_idx»— adentro del diálogo.
    const tocaLaPuerta =
      Object.prototype.hasOwnProperty.call(body, "calle") || Object.prototype.hasOwnProperty.call(body, "altura")
    if (tocaLaPuerta) {
      const calle = Object.prototype.hasOwnProperty.call(body, "calle") ? body.calle : c.direccion.calle
      const altura = Object.prototype.hasOwnProperty.call(body, "altura") ? body.altura : c.direccion.altura
      // Sin altura comparable ("", "s/n") no hay puerta que pueda chocar: la misma condición
      // que el índice parcial de la migración.
      if (tieneAlturaComparable(altura)) {
        const { data: existentes, error: eDup } = await admin
          .from("farming_direcciones")
          .select("id, calle, altura")
          .eq("zona_id", c.direccion.zona_id)
          .eq("agency_id", agencyId)
          .neq("id", params.id) // ella misma no es su propio duplicado
        if (eDup) throw eDup

        const normalizadaNueva = normalizarDireccion(String(calle ?? ""), altura)
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
    }

    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const col of COLUMNAS_EDITABLES) {
      if (Object.prototype.hasOwnProperty.call(body, col)) payload[col] = (body as any)[col]
    }

    // TRAMPA 1 de la 3-A: si el PATCH corrige `lat` o `lng`, el cartel "fuera de zona" puede
    // quedar mintiendo para cualquiera de los dos lados si no se recalcula. `calculaFueraDeZona`
    // (lib/farming/servidor.ts) es el ÚNICO criterio de adentro/afuera de todo Farming: el
    // mismo que usa el alta. Nunca una segunda cuenta inventada acá.
    const tocaUbicacion =
      Object.prototype.hasOwnProperty.call(body, "lat") || Object.prototype.hasOwnProperty.call(body, "lng")
    if (tocaUbicacion) {
      const nuevoLat = Object.prototype.hasOwnProperty.call(body, "lat") ? (payload.lat as unknown) : c.direccion.lat
      const nuevoLng = Object.prototype.hasOwnProperty.call(body, "lng") ? (payload.lng as unknown) : c.direccion.lng

      // La zona ya se validó en `candado` (arriba): esto es una simple lectura de su geojson,
      // no un segundo candado de acceso.
      const { data: zonaFila, error: eZona } = await admin
        .from("farming_zonas")
        .select("geojson")
        .eq("id", c.direccion.zona_id)
        .maybeSingle()
      if (eZona) throw eZona

      // NO ES LO MISMO «no hay punto» que «no pudimos evaluar». Si la zona no se puede leer
      // (geojson faltante o roto), la cuenta no se puede hacer: se deja lo último que se sabía
      // en vez de estampar un "adentro" que nadie calculó, que además borraría la fecha de
      // cuándo se cayó. Un dato viejo y verdadero es mejor que uno nuevo e inventado.
      if (!zonaFila?.geojson) {
        console.error("Farming (PATCH ubicación): no se pudo leer el geojson de la zona", c.direccion.zona_id)
      } else {
        // Sin punto, no hay adentro ni afuera: la pantalla borra `lat`/`lng` a propósito cuando
        // el asesor reescribe la calle después de haber elegido una sugerencia
        // (components/farming/direccion-dialog.tsx). Una tarjeta sin punto no lleva cartel, y
        // tampoco tiene una historia de "se cayó afuera": las dos cosas se limpian juntas.
        const nuevaFueraDeZona =
          typeof nuevoLat === "number" && typeof nuevoLng === "number"
            ? calculaFueraDeZona(nuevoLat, nuevoLng, zonaFila.geojson)
            : false

        payload.fuera_de_zona = nuevaFueraDeZona
        // El comentario del alta lo dice y acá se sostiene: `fuera_de_zona_desde` CON FECHA =
        // la tarjeta estaba adentro y se cayó afuera al corregir la ubicación (o al redibujar
        // el trazo, en la 3-B). En NULL = nació afuera. Por eso:
        //  - entra a la zona (o se queda sin punto) → se limpia a `null`;
        //  - sigue afuera (ya tenía fecha) → NO se toca: pisarla con la de HOY borraría el
        //    historial real de cuándo se cayó;
        //  - estaba adentro y recién ahora se cae → se estampa la fecha de HOY, la primera vez.
        if (!nuevaFueraDeZona) {
          payload.fuera_de_zona_desde = null
        } else if (!c.direccion.fuera_de_zona_desde) {
          payload.fuera_de_zona_desde = new Date().toISOString()
        }
      }
    }

    const { data, error } = await admin
      .from("farming_direcciones")
      .update(payload)
      .eq("id", params.id)
      .select("*")
      .single()
    // El chequeo de arriba da el mensaje lindo; el índice parcial es el candado de verdad: dos
    // ediciones concurrentes contra la misma puerta pueden pasar las dos el chequeo en JS. Un
    // 23505 acá es el MISMO duplicado, con el mismo 409 — nunca el texto crudo de Postgres.
    if ((error as any)?.code === "23505") {
      return NextResponse.json({ error: "Esa puerta ya está cargada en esta zona." }, { status: 409 })
    }
    if (error) throw error

    return NextResponse.json({ direccion: data })
  } catch (e) {
    return responderError(e, "editar tarjeta")
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId, agencyId } = await requireTenant()
    const admin = createAdminClient()

    const c = await candado(admin, params.id, agencyId, userId)
    if (!c.ok) return c.resp

    // Si esta tarjeta nació de un aviso, su marca en farming_avisos_marca quedó "convertido".
    // Sin borrarla, quedaría apuntando para siempre a una tarjeta que ya no existe, y con el
    // fix de app/api/farming/avisos/route.ts (task 6, 16-sep-2026: "convertido" también
    // excluye) ese aviso desaparecería de «A la venta en mi zona» PARA SIEMPRE, sin ninguna
    // forma de volver a verlo — la desaparición silenciosa que este proyecto rechaza.
    // zona_id + aviso_id es la PK de esa tabla: no hace falta más candado que ese.
    //
    // LA MARCA VA PRIMERO, y el orden es la regla: no hay transacción acá, así que los dos
    // borrados pueden partirse al medio. Al revés —tarjeta primero— si el segundo fallara, la
    // tarjeta ya no existe, el reintento del asesor da 404 y esa marca se queda en "convertido"
    // apuntando a la nada: el aviso queda escondido de «A la venta en mi zona» para siempre y
    // sin ningún camino para recuperarlo. En este orden, la misma falla deja el aviso VISIBLE
    // otra vez con su tarjeta todavía en el tablero: incómodo por un rato, visible, y se
    // arregla solo cuando el asesor vuelve a tocar «borrar». Entre perder algo en silencio y
    // que quede feo un momento, este proyecto elige lo feo.
    if (c.direccion.aviso_id !== null && c.direccion.aviso_id !== undefined) {
      const { error: eMarca } = await admin
        .from("farming_avisos_marca")
        .delete()
        .eq("zona_id", c.direccion.zona_id)
        .eq("aviso_id", c.direccion.aviso_id)
      if (eMarca) throw eMarca
    }

    // De verdad: propietarios y contactos se van por cascada desde la propia tabla
    // (`on delete cascade` en la migración). El aviso de lo que se pierde lo da la pantalla
    // con su diálogo de confirmación, no este endpoint.
    const { error } = await admin.from("farming_direcciones").delete().eq("id", params.id)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (e) {
    return responderError(e, "borrar tarjeta")
  }
}
