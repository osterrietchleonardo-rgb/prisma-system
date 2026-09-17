// Farming · «ya miré este aviso». Descartar saca el aviso de la lista de la zona; deshacer lo
// devuelve. La marca queda firmada por quien la hizo: la zona puede ser compartida.
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireTenant } from "@/lib/auth/tenant-validation"
import { rechazoDeZona, responderError, zonaAccesible } from "@/lib/farming/servidor"

export const dynamic = "force-dynamic"

/** El acceso a la zona se valida igual en las dos operaciones, y las dos ESCRIBEN: descartar y
 *  deshacer tocan farming_avisos_marca, así que una zona archivada las rechaza. */
async function permiso(admin: ReturnType<typeof createAdminClient>, zonaId: string, agencyId: string, userId: string) {
  return rechazoDeZona(await zonaAccesible(admin, zonaId, agencyId, userId, "escribir"))
}

/** `Number(null)` es 0 y `Number("")` también: sobre el string crudo, no sobre el resultado,
 *  para que un aviso_id ausente o vacío sea 400 y no "el aviso 0". */
function idEntero(crudo: string | null): number | null {
  if (crudo === null || crudo.trim() === "") return null
  const n = Number(crudo)
  return Number.isInteger(n) ? n : null
}

export async function POST(req: Request) {
  try {
    const { userId, agencyId } = await requireTenant()
    const body = await req.json().catch(() => ({}))

    const zonaId = String(body?.zona_id || "").trim()
    // Mismo `idEntero` que usa el DELETE: sobre el string crudo, no `Number(body?.aviso_id)`
    // directo, porque `Number(null)` es 0, `Number([])` es 0 y `Number(false)` es 0 (y
    // `Number(true)` es 1) — un body corrupto o mal armado terminaría marcando el aviso 0 o 1
    // en vez de rechazarse con un 400.
    const avisoId = idEntero(body?.aviso_id === null || body?.aviso_id === undefined ? null : String(body.aviso_id))
    if (!zonaId || avisoId === null) {
      return NextResponse.json({ error: "Falta la zona o el aviso" }, { status: 400 })
    }

    const admin = createAdminClient()
    const no = await permiso(admin, zonaId, agencyId, userId)
    if (no) return no

    // Descartar dos veces el mismo aviso no puede fallar ni duplicar. Un check-then-insert deja
    // una ventana: dos pedidos genuinamente concurrentes (doble tap, reintento de una red que
    // falla) pasan los dos el chequeo y el segundo choca contra la PK (zona_id, aviso_id) con un
    // 23505. El upsert con ignoreDuplicates es ON CONFLICT DO NOTHING: lo resuelve la base, sin
    // ventana. user_id sale de la sesión, nunca del body: la zona puede ser compartida.
    const { error } = await admin.from("farming_avisos_marca").upsert(
      {
        zona_id: zonaId,
        aviso_id: avisoId,
        aviso_es_dueno_directo: !!body?.es_dueno_directo,
        user_id: userId,
        estado: "descartado",
      },
      { onConflict: "zona_id,aviso_id", ignoreDuplicates: true },
    )
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (e) {
    return responderError(e, "descartar aviso")
  }
}

export async function DELETE(req: Request) {
  try {
    const { userId, agencyId } = await requireTenant()
    const q = new URL(req.url).searchParams

    const zonaId = q.get("zona_id")?.trim() || ""
    const avisoId = idEntero(q.get("aviso_id"))
    if (!zonaId || avisoId === null) {
      return NextResponse.json({ error: "Falta la zona o el aviso" }, { status: 400 })
    }

    const admin = createAdminClient()
    const no = await permiso(admin, zonaId, agencyId, userId)
    if (no) return no

    const { error } = await admin.from("farming_avisos_marca").delete().eq("zona_id", zonaId).eq("aviso_id", avisoId)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (e) {
    return responderError(e, "deshacer descarte")
  }
}
