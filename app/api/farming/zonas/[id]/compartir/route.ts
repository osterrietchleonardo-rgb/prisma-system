// app/api/farming/zonas/[id]/compartir/route.ts
//
// Farming · con quién comparte su zona el dueño. Los dos trabajan el mismo tablero; el
// dueño sigue siendo el único que puede borrarla o sacar a alguien (spec, "Compartir zona").
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireTenant } from "@/lib/auth/tenant-validation"
import { responderError } from "@/lib/farming/servidor"

export const dynamic = "force-dynamic"

async function zonaPropia(admin: ReturnType<typeof createAdminClient>, id: string, agencyId: string, userId: string) {
  const { data, error } = await admin
    .from("farming_zonas")
    .select("id, owner_user_id")
    .eq("id", id)
    .eq("agency_id", agencyId)
    .maybeSingle()
  if (error) throw error
  if (!data) return { status: 404 as const, error: "No encontramos esa zona" }
  if ((data as any).owner_user_id !== userId) return { status: 403 as const, error: "Solo quien dibujó la zona puede compartirla" }
  return { status: 200 as const, error: null }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId, agencyId } = await requireTenant()
    const admin = createAdminClient()
    const chequeo = await zonaPropia(admin, params.id, agencyId, userId)
    if (chequeo.error) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

    const body = await req.json().catch(() => ({}))
    const destinatario = String(body?.user_id || "")
    if (!destinatario || destinatario === userId) {
      return NextResponse.json({ error: "Elegí un colega del desplegable" }, { status: 400 })
    }

    // Solo asesores ACTIVOS de la MISMA agencia. Un pausado o el director no entran.
    const { data: perfil, error: e1 } = await admin
      .from("profiles")
      .select("id, role, estado")
      .eq("id", destinatario)
      .eq("agency_id", agencyId)
      .maybeSingle()
    if (e1) throw e1
    const p = perfil as { role: string | null; estado: string | null } | null
    if (!p || p.role !== "asesor" || p.estado === "pausado" || p.estado === "eliminado") {
      return NextResponse.json({ error: "Solo se puede compartir con un asesor activo de tu inmobiliaria" }, { status: 400 })
    }

    const { data: ya, error: e2 } = await admin
      .from("farming_zonas_compartidas")
      .select("zona_id")
      .eq("zona_id", params.id)
      .eq("user_id", destinatario)
      .maybeSingle()
    if (e2) throw e2
    if (!ya) {
      const { error: e3 } = await admin
        .from("farming_zonas_compartidas")
        .insert({ zona_id: params.id, user_id: destinatario, agregado_por: userId })
      if (e3) throw e3
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return responderError(e, "compartir")
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId, agencyId } = await requireTenant()
    const admin = createAdminClient()
    const chequeo = await zonaPropia(admin, params.id, agencyId, userId)
    if (chequeo.error) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

    const destinatario = new URL(req.url).searchParams.get("user_id")?.trim()
    if (!destinatario) return NextResponse.json({ error: "Falta a quién sacar" }, { status: 400 })

    const { error } = await admin
      .from("farming_zonas_compartidas")
      .delete()
      .eq("zona_id", params.id)
      .eq("user_id", destinatario)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (e) {
    return responderError(e, "dejar de compartir")
  }
}
