import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { reconcileVisit } from "@/lib/google-calendar/sync"

export const runtime = "nodejs"

/**
 * Sincroniza una visita con Google Calendar (best-effort).
 * Se llama "fire-and-forget" desde el cliente tras crear/editar/cancelar.
 * NUNCA bloquea ni rompe el flujo: la fuente de verdad es Supabase.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ status: "skipped", reason: "no auth" }, { status: 401 })
    }

    const { visitId } = await req.json().catch(() => ({ visitId: null }))
    if (!visitId) {
      return NextResponse.json({ status: "skipped", reason: "sin visitId" }, { status: 400 })
    }

    // Autorización: el solicitante debe ser el asesor de la visita o de su misma agencia.
    const admin = createAdminClient()
    const { data: visit } = await admin
      .from("scheduled_visits")
      .select("agent_id, agency_id")
      .eq("id", visitId)
      .single()

    if (!visit) {
      return NextResponse.json({ status: "skipped", reason: "no existe" })
    }

    const { data: me } = await admin
      .from("profiles")
      .select("agency_id")
      .eq("id", session.user.id)
      .single()

    const allowed =
      visit.agent_id === session.user.id ||
      (me?.agency_id && me.agency_id === visit.agency_id)

    if (!allowed) {
      return NextResponse.json({ status: "skipped", reason: "no autorizado" }, { status: 403 })
    }

    const result = await reconcileVisit(visitId)
    return NextResponse.json(result)
  } catch (err: any) {
    // Best-effort: nunca propagamos error al cliente.
    return NextResponse.json({ status: "error", reason: err?.message || "error" })
  }
}
