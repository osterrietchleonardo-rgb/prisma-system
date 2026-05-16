import { NextRequest, NextResponse } from "next/server"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { getAdminDb, logAdminActivity, getClientIp } from "@/lib/admin-vakdor/logger"

type Params = { params: { id: string } }

// GET — lee créditos actuales + calcula crédito por asesor
export async function GET(request: NextRequest, { params }: Params) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const db = getAdminDb()
  const { id } = params

  const [creditosRes, asesorCountRes] = await Promise.all([
    db.from("agency_ai_credits").select("*").eq("agency_id", id).maybeSingle(),
    db.from("profiles").select("id", { count: "exact", head: true })
      .eq("agency_id", id).eq("role", "asesor").eq("estado", "activo"),
  ])

  if (creditosRes.error) return NextResponse.json({ error: creditosRes.error.message }, { status: 500 })

  const numAsesores = asesorCountRes.count ?? 0
  const cred = creditosRes.data
  const creditsPorAsesor = numAsesores > 0 && cred
    ? Math.floor((cred.credits_asesores ?? 0) / numAsesores)
    : 0

  return NextResponse.json({ creditos: cred, numAsesores, creditsPorAsesor })
}

// PATCH — establece total + distribución director / asesores
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const db = getAdminDb()
  const { id } = params
  const body = await request.json()
  const { credits_total, credits_director, credits_asesores, motivo } = body

  // ── Validaciones ─────────────────────────────────────────────────────────
  if (
    typeof credits_total !== "number" ||
    typeof credits_director !== "number" ||
    typeof credits_asesores !== "number"
  ) return NextResponse.json({ error: "Valores inválidos" }, { status: 400 })

  if (credits_total < 0 || credits_director < 0 || credits_asesores < 0)
    return NextResponse.json({ error: "Los créditos no pueden ser negativos" }, { status: 400 })

  if (credits_director + credits_asesores > credits_total)
    return NextResponse.json(
      { error: `Director (${credits_director}) + Asesores (${credits_asesores}) = ${credits_director + credits_asesores} supera el total (${credits_total})` },
      { status: 400 }
    )

  // ── Estado anterior para log ──────────────────────────────────────────────
  const { data: anterior } = await db
    .from("agency_ai_credits")
    .select("credits_total, credits_director, credits_asesores")
    .eq("agency_id", id)
    .maybeSingle()

  // ── Upsert ────────────────────────────────────────────────────────────────
  const now = new Date().toISOString()
  const { data, error } = await db
    .from("agency_ai_credits")
    .upsert(
      {
        agency_id:        id,
        credits_total,
        credits_director,
        credits_asesores,
        updated_at:       now,
      },
      { onConflict: "agency_id" }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── Log auditoría ─────────────────────────────────────────────────────────
  await db.from("log_creditos_admin").insert({
    agencia_id:        id,
    admin_id:          auth.payload.sub,
    accion:            "establecer_distribucion",
    cantidad_anterior: anterior?.credits_total ?? 0,
    cantidad_nueva:    credits_total,
    motivo:            motivo || "Distribución actualizada desde panel admin",
    timestamp:         now,
  })

  await logAdminActivity({
    adminId:      auth.payload.sub,
    accion:       "CREDITOS_DISTRIBUCION",
    entidadTipo:  "agencia",
    entidadId:    id,
    detalleJson: {
      anterior: { total: anterior?.credits_total, director: anterior?.credits_director, asesores: anterior?.credits_asesores },
      nuevo:    { total: credits_total, director: credits_director, asesores: credits_asesores },
    },
    ipAddress: getClientIp(request),
  })

  // ── Respuesta con crédito por asesor ──────────────────────────────────────
  const { count: numAsesores } = await db
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("agency_id", id).eq("role", "asesor").eq("estado", "activo")

  const creditsPorAsesor = numAsesores && numAsesores > 0
    ? Math.floor(credits_asesores / numAsesores)
    : 0

  return NextResponse.json({ creditos: data, numAsesores: numAsesores ?? 0, creditsPorAsesor })
}
