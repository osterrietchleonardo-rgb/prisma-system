// app/api/farming/direcciones/[id]/route.ts
//
// Farming · editar y borrar UNA tarjeta de la caminata. `direccionAccesible` (lib/farming/
// servidor.ts) es el único candado: se resuelve por la zona de la tarjeta, no por una regla
// propia, y corre ANTES de cada escritura y de cada borrado, sin excepción.
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireTenant } from "@/lib/auth/tenant-validation"
import { direccionAccesible, responderError } from "@/lib/farming/servidor"
import { ETAPAS, valoresImposibles } from "@/lib/farming/direcciones"

export const dynamic = "force-dynamic"

const CLAVES_ETAPA = ETAPAS.map((e) => e.clave) as string[]

/**
 * Lista blanca EXPLÍCITA de lo que un PATCH puede tocar: cualquier subconjunto de
 * `EntradaDireccion` más `etapa` y `orden`. Se arma campo por campo (nunca `...body` ni un
 * `delete` de las prohibidas), así que ninguna clave fuera de esta lista llega al UPDATE —
 * ni `zona_id`, `agency_id`, `creada_por`, `created_at`, `id`, `aviso_id`,
 * `aviso_es_dueno_directo`, `origen`, `fuera_de_zona`, `fuera_de_zona_desde`, y sobre todo
 * nunca `unidades_totales`: es GENERADA, y mandarla hace fallar el UPDATE con 428C9.
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
  "etapa",
  "orden",
  "a_la_venta",
  "cartel",
  "inmobiliaria_cartel",
  "precio_pedido",
  "moneda",
  "observaciones",
  "relevada_en",
] as const

async function candado(admin: ReturnType<typeof createAdminClient>, id: string, agencyId: string, userId: string) {
  const { direccion, puede } = await direccionAccesible(admin, id, agencyId, userId)
  if (!direccion) return { ok: false as const, resp: NextResponse.json({ error: "No encontramos esa tarjeta" }, { status: 404 }) }
  if (!puede) return { ok: false as const, resp: NextResponse.json({ error: "Esa tarjeta es de la zona de un colega" }, { status: 403 }) }
  return { ok: true as const, direccion }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId, agencyId } = await requireTenant()
    const admin = createAdminClient()

    const c = await candado(admin, params.id, agencyId, userId)
    if (!c.ok) return c.resp

    const body = await req.json().catch(() => ({}))

    // Antes de tocar la base: una etapa fuera de las siete del check de la migración, o
    // cualquier otro valor imposible (tipo, cartel, moneda, pisos, unidades_por_piso,
    // unidades_manual fuera de lo que la migración acepta), es un error del que se avisa (400),
    // no un 500 crudo de Postgres con un 23514/22P02 sin traducir. `valoresImposibles` —y no
    // `validarDireccion`— porque el PATCH manda datos PARCIALES: un cuerpo sin calle ni tipo es
    // legítimo acá (se está corrigiendo un solo campo), cosa que `validarDireccion` rechazaría.
    const errores: string[] = []
    if (Object.prototype.hasOwnProperty.call(body, "etapa") && !CLAVES_ETAPA.includes(body.etapa)) {
      errores.push("Esa etapa no existe.")
    }
    errores.push(...valoresImposibles(body))
    if (errores.length > 0) {
      return NextResponse.json({ error: errores.join(" ") }, { status: 400 })
    }

    // ETAPA 3-B: cuando el PATCH cambia `etapa`, acá va el insert en farming_contactos que
    // deja el historial firmado del movimiento (etapa_desde/etapa_hasta). Todavía no se escribe.

    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const col of COLUMNAS_EDITABLES) {
      if (Object.prototype.hasOwnProperty.call(body, col)) payload[col] = (body as any)[col]
    }

    const { data, error } = await admin
      .from("farming_direcciones")
      .update(payload)
      .eq("id", params.id)
      .select("*")
      .single()
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

    // De verdad: propietarios y contactos se van por cascada desde la propia tabla
    // (`on delete cascade` en la migración). El aviso de lo que se pierde lo da la pantalla
    // con su diálogo de confirmación, no este endpoint.
    const { error } = await admin.from("farming_direcciones").delete().eq("id", params.id)
    if (error) throw error

    // Si esta tarjeta nació de un aviso, su marca en farming_avisos_marca quedó "convertido".
    // Sin borrarla acá, quedaría apuntando para siempre a una tarjeta que ya no existe, y con
    // el fix de app/api/farming/avisos/route.ts (task 6, 16-sep-2026: "convertido" también
    // excluye) ese aviso desaparecería de «A la venta en mi zona» PARA SIEMPRE, sin ninguna
    // forma de volver a verlo — la desaparición silenciosa que este proyecto rechaza.
    // zona_id + aviso_id es la PK de esa tabla: no hace falta más candado que ese.
    if (c.direccion.aviso_id !== null && c.direccion.aviso_id !== undefined) {
      const { error: eMarca } = await admin
        .from("farming_avisos_marca")
        .delete()
        .eq("zona_id", c.direccion.zona_id)
        .eq("aviso_id", c.direccion.aviso_id)
      if (eMarca) throw eMarca
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return responderError(e, "borrar tarjeta")
  }
}
