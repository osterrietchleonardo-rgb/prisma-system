// app/api/farming/zonas/[id]/liberar/route.ts
//
// Farming · el director libera una zona. NO borra nada: la fila queda en 'liberada' con
// fecha, motivo y quién; sus tarjetas (etapa 3) se conservan. Lo único que cambia es que
// esas cuadras vuelven a estar disponibles (spec, "La pantalla del director").
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireTenant } from "@/lib/auth/tenant-validation"
import { responderError } from "@/lib/farming/servidor"

export const dynamic = "force-dynamic"

const LARGO_MOTIVO = 300

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId, agencyId, role } = await requireTenant()
    if (role !== "director") {
      return NextResponse.json({ error: "Solo el director puede liberar una zona" }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const motivo = String(body?.motivo || "").trim().slice(0, LARGO_MOTIVO)
    if (!motivo) return NextResponse.json({ error: "Escribí por qué se libera: queda en el historial" }, { status: 400 })

    const admin = createAdminClient()
    const ahora = new Date().toISOString()
    const { data, error } = await admin
      .from("farming_zonas")
      .update({ estado: "liberada", liberada_en: ahora, liberada_por: userId, motivo_liberacion: motivo, updated_at: ahora })
      .eq("id", params.id)
      .eq("agency_id", agencyId)
      .eq("estado", "activa")
      .select("id")
    if (error) throw error
    if (!data || data.length === 0) return NextResponse.json({ error: "No encontramos esa zona activa" }, { status: 404 })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return responderError(e, "liberar")
  }
}
