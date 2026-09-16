// Farming · «ya miré este aviso». Descartar saca el aviso de la lista de la zona; deshacer lo
// devuelve. La marca queda firmada por quien la hizo: la zona puede ser compartida.
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireTenant } from "@/lib/auth/tenant-validation"
import { responderError, zonaAccesible } from "@/lib/farming/servidor"

export const dynamic = "force-dynamic"

/** El acceso a la zona se valida igual en las dos operaciones. */
async function permiso(admin: ReturnType<typeof createAdminClient>, zonaId: string, agencyId: string, userId: string) {
  const { zona, puede } = await zonaAccesible(admin, zonaId, agencyId, userId)
  if (!zona) return { error: "No encontramos esa zona activa", status: 404 as const }
  if (!puede) return { error: "Esa zona es de un colega", status: 403 as const }
  return null
}

export async function POST(req: Request) {
  try {
    const { userId, agencyId } = await requireTenant()
    const body = await req.json().catch(() => ({}))

    const zonaId = String(body?.zona_id || "").trim()
    const avisoId = Number(body?.aviso_id)
    if (!zonaId || !Number.isInteger(avisoId)) {
      return NextResponse.json({ error: "Falta la zona o el aviso" }, { status: 400 })
    }

    const admin = createAdminClient()
    const no = await permiso(admin, zonaId, agencyId, userId)
    if (no) return NextResponse.json({ error: no.error }, { status: no.status })

    // Descartar dos veces el mismo aviso no puede fallar: la PK es (zona_id, aviso_id).
    const { data: ya, error: e1 } = await admin
      .from("farming_avisos_marca")
      .select("aviso_id")
      .eq("zona_id", zonaId)
      .eq("aviso_id", avisoId)
      .maybeSingle()
    if (e1) throw e1

    if (!ya) {
      const { error: e2 } = await admin.from("farming_avisos_marca").insert({
        zona_id: zonaId,
        aviso_id: avisoId,
        aviso_es_dueno_directo: !!body?.es_dueno_directo,
        user_id: userId,
        estado: "descartado",
      })
      if (e2) throw e2
    }

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
    const avisoId = Number(q.get("aviso_id"))
    if (!zonaId || !Number.isInteger(avisoId)) {
      return NextResponse.json({ error: "Falta la zona o el aviso" }, { status: 400 })
    }

    const admin = createAdminClient()
    const no = await permiso(admin, zonaId, agencyId, userId)
    if (no) return NextResponse.json({ error: no.error }, { status: no.status })

    const { error } = await admin.from("farming_avisos_marca").delete().eq("zona_id", zonaId).eq("aviso_id", avisoId)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (e) {
    return responderError(e, "deshacer descarte")
  }
}
