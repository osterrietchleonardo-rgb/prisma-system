// app/api/farming/direcciones/[id]/propietarios/[pid]/route.ts
//
// Farming · editar y borrar UN propietario de UNA tarjeta. `direccionAccesible` (lib/farming/
// servidor.ts) es el candado de la tarjeta padre y corre ANTES de cada escritura y de cada
// borrado. Además, el `pid` tiene que pertenecer a la `<id>` de la ruta: un propietario de
// OTRA dirección da 404 aunque quien llama tenga acceso a las dos — es la clase de cosa que
// se cuela si solo se filtra por `id` del propietario.
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireTenant } from "@/lib/auth/tenant-validation"
import { direccionAccesible, responderError, FORMA_UUID } from "@/lib/farming/servidor"
import { VINCULOS } from "@/lib/farming/direcciones"
import { normalizePhoneE164 } from "@/lib/whatsapp/phone"

export const dynamic = "force-dynamic"

const CLAVES_VINCULO = VINCULOS.map((v) => v.clave) as string[]

/**
 * Lista blanca EXPLÍCITA de lo que un PATCH puede tocar. Se arma campo por campo (nunca
 * `...body`), así que ninguna clave fuera de esta lista llega al UPDATE — ni `direccion_id`,
 * `agency_id`, `creado_por`, `created_at`, `id`, y sobre todo nunca `tracking_log_id`:
 * ETAPA 3-B, el botón «→ pasarlo a mi pipeline» lo llena, este endpoint no lo toca.
 */
const COLUMNAS_EDITABLES = ["piso", "unidad", "nombre", "vinculo", "telefono", "email", "notas"] as const

/** Mismo comentario que en el alta: no rechazar, guardar tal como se anotó. */
function telefonoAGuardar(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null
  const s = String(raw).trim()
  if (!s) return null
  return normalizePhoneE164(s) ?? s
}

async function candado(admin: ReturnType<typeof createAdminClient>, direccionId: string, pid: string, agencyId: string, userId: string) {
  // `farming_propietarios.id` es `uuid`: un `pid` con otra forma ("abc") no da "no existe", le
  // rompe el cast a Postgres (22P02) — un 500 crudo donde la semántica pide 404. Se corta ACÁ,
  // antes de tocar la base (ni siquiera se llega a mirar la dirección): mismo criterio que
  // `direccionAccesible`/`zonaAccesible`, que hacen lo mismo con su propio id.
  if (!FORMA_UUID.test(pid)) {
    return { ok: false as const, resp: NextResponse.json({ error: "No encontramos ese propietario en esta tarjeta" }, { status: 404 }) }
  }

  const { direccion, puede } = await direccionAccesible(admin, direccionId, agencyId, userId)
  if (!direccion) return { ok: false as const, resp: NextResponse.json({ error: "No encontramos esa tarjeta" }, { status: 404 }) }
  if (!puede) return { ok: false as const, resp: NextResponse.json({ error: "Esa tarjeta es de la zona de un colega" }, { status: 403 }) }

  const { data: propietario, error } = await admin
    .from("farming_propietarios")
    .select("*")
    .eq("id", pid)
    .maybeSingle()
  if (error) throw error

  // El pid tiene que ser de ESTA dirección: uno de otra da 404, aunque exista de verdad y
  // aunque quien llama tenga acceso también a la dirección dueña.
  if (!propietario || propietario.direccion_id !== direccionId) {
    return { ok: false as const, resp: NextResponse.json({ error: "No encontramos ese propietario en esta tarjeta" }, { status: 404 }) }
  }

  return { ok: true as const, propietario }
}

export async function PATCH(req: Request, { params }: { params: { id: string; pid: string } }) {
  try {
    const { userId, agencyId } = await requireTenant()
    const admin = createAdminClient()

    const c = await candado(admin, params.id, params.pid, agencyId, userId)
    if (!c.ok) return c.resp

    const body = await req.json().catch(() => ({}))

    // Si el PATCH manda nombre, no puede vaciarlo: es la única columna `not null`.
    if (Object.prototype.hasOwnProperty.call(body, "nombre")) {
      const nombre = typeof body.nombre === "string" ? body.nombre.trim() : ""
      if (!nombre) return NextResponse.json({ error: "El nombre no puede quedar vacío." }, { status: 400 })
      body.nombre = nombre
    }

    // Un vínculo fuera de las cinco del check de la migración: 400, no un 500 de Postgres.
    if (Object.prototype.hasOwnProperty.call(body, "vinculo") && !CLAVES_VINCULO.includes(body.vinculo)) {
      return NextResponse.json({ error: "Ese vínculo no existe." }, { status: 400 })
    }

    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const col of COLUMNAS_EDITABLES) {
      if (Object.prototype.hasOwnProperty.call(body, col)) payload[col] = (body as any)[col]
    }
    if (Object.prototype.hasOwnProperty.call(body, "telefono")) payload.telefono = telefonoAGuardar(body.telefono)

    const { data, error } = await admin
      .from("farming_propietarios")
      .update(payload)
      .eq("id", params.pid)
      .eq("direccion_id", params.id)
      .select("*")
      .single()
    if (error) throw error

    return NextResponse.json({ propietario: data })
  } catch (e) {
    return responderError(e, "editar propietario")
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string; pid: string } }) {
  try {
    const { userId, agencyId } = await requireTenant()
    const admin = createAdminClient()

    const c = await candado(admin, params.id, params.pid, agencyId, userId)
    if (!c.ok) return c.resp

    const { error } = await admin
      .from("farming_propietarios")
      .delete()
      .eq("id", params.pid)
      .eq("direccion_id", params.id)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (e) {
    return responderError(e, "borrar propietario")
  }
}
