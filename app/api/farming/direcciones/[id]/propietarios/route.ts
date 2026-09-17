// app/api/farming/direcciones/[id]/propietarios/route.ts
//
// Farming · las personas de una tarjeta (hoja 1 del Excel, pestaña de contactos). Un edificio
// de 32 unidades puede tener muchos propietarios conocidos, cada uno con su piso, su unidad y
// su teléfono: por eso son filas propias en `farming_propietarios`, nunca un texto suelto en
// la tarjeta. `direccionAccesible` (lib/farming/servidor.ts) es el único candado: se resuelve
// por la zona de la tarjeta padre, y corre ANTES de cada alta.
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireTenant } from "@/lib/auth/tenant-validation"
import { direccionAccesible, rechazoDeDireccion, responderError } from "@/lib/farming/servidor"
import { VINCULOS } from "@/lib/farming/direcciones"
import { normalizePhoneE164 } from "@/lib/whatsapp/phone"

export const dynamic = "force-dynamic"

const CLAVES_VINCULO = VINCULOS.map((v) => v.clave) as string[]

/**
 * El teléfono se guarda normalizado con `normalizePhoneE164` (la misma función que usa
 * WhatsApp). Si el asesor lo anotó de una forma que no se puede normalizar —incompleto, con
 * una referencia en vez de un número ("preguntar en el kiosco")— NO se rechaza el alta: se
 * guarda tal como lo escribió. Un teléfono mal anotado es mejor que perderlo.
 */
function telefonoAGuardar(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null
  const s = String(raw).trim()
  if (!s) return null
  return normalizePhoneE164(s) ?? s
}

/**
 * Las personas de UNA tarjeta. Sin esto la pantalla podía sumar un propietario y no volver a
 * verlo nunca: al reabrir la tarjeta la lista salía vacía aunque la fila estuviera guardada.
 * Mismo candado que el alta, y primero la más vieja: el orden en que se fueron conociendo.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId, agencyId } = await requireTenant()
    const admin = createAdminClient()

    // "leer": la gente de una tarjeta de zona archivada se puede mirar. Es lo que promete el
    // cartel al archivar («tus propietarios y su historial quedan guardados»).
    const no = rechazoDeDireccion(await direccionAccesible(admin, params.id, agencyId, userId, "leer"))
    if (no) return no

    // `agency_id` además del `direccion_id`, igual que el GET de direcciones: una fila mal
    // escrita en la columna denormalizada falla cerrada en vez de filtrarse.
    const { data, error } = await admin
      .from("farming_propietarios")
      .select("*")
      .eq("direccion_id", params.id)
      .eq("agency_id", agencyId)
      .order("created_at", { ascending: true })
    if (error) throw error

    return NextResponse.json({ propietarios: data || [] })
  } catch (e) {
    return responderError(e, "propietarios de la tarjeta")
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId, agencyId } = await requireTenant()
    const admin = createAdminClient()

    // "escribir": en una zona archivada no se suma gente nueva.
    const no = rechazoDeDireccion(await direccionAccesible(admin, params.id, agencyId, userId, "escribir"))
    if (no) return no

    const body = await req.json().catch(() => ({}))

    // Lo único obligatorio: el nombre. El asesor está parado en la puerta, el resto se
    // completa después.
    const nombre = typeof body?.nombre === "string" ? body.nombre.trim() : ""
    if (!nombre) return NextResponse.json({ error: "Falta el nombre." }, { status: 400 })

    // Antes de tocar la base: un vínculo fuera de las cinco del check de la migración es un
    // error del que se avisa (400), no un 500 crudo de Postgres.
    let vinculo = "propietario"
    if (Object.prototype.hasOwnProperty.call(body, "vinculo") && body.vinculo != null && body.vinculo !== "") {
      if (!CLAVES_VINCULO.includes(body.vinculo)) {
        return NextResponse.json({ error: "Ese vínculo no existe." }, { status: 400 })
      }
      vinculo = body.vinculo
    }

    // Blanqueado a mano, campo por campo (nunca `...body`): `direccion_id`, `agency_id` y
    // `creado_por` salen de la ruta y de la sesión, nunca del body.
    const payload = {
      direccion_id: params.id,
      agency_id: agencyId,
      creado_por: userId,
      piso: body?.piso ?? null,
      unidad: body?.unidad ?? null,
      nombre,
      vinculo,
      telefono: telefonoAGuardar(body?.telefono),
      email: body?.email ?? null,
      notas: body?.notas ?? null,
    }

    const { data, error } = await admin.from("farming_propietarios").insert(payload).select("*").single()
    if (error) throw error

    return NextResponse.json({ propietario: data }, { status: 201 })
  } catch (e) {
    return responderError(e, "alta de propietario")
  }
}
