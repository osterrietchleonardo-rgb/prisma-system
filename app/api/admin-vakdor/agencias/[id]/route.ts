import { NextRequest, NextResponse } from "next/server"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { getAdminDb, logAdminActivity, getClientIp } from "@/lib/admin-vakdor/logger"

type Params = { params: { id: string } }

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const db = getAdminDb()
  const { id } = params

  const [agenciaRes, profilesRes, creditosRes, creditLogRes, propsRes, pagosRes, feedbackRes, deletedUsersRes] = await Promise.all([
    db.from("agencies").select("*").eq("id", id).single(),
    db.from("profiles").select("id, full_name, email, role, estado, created_at, deleted_at").eq("agency_id", id),
    db.from("agency_ai_credits").select("*").eq("agency_id", id).maybeSingle(),
    db.from("log_creditos_admin").select("*").eq("agencia_id", id).order("timestamp", { ascending: false }).limit(20),
    db.from("properties").select("id, tokko_id, created_at").eq("agency_id", id),
    db.from("pagos_agencia").select("*").eq("agencia_id", id).order("periodo_mes", { ascending: false }),
    db.from("system_feedback").select("id, type, estado, created_at, content, titulo").eq("agency_id", id).order("created_at", { ascending: false }).limit(10),
    db.from("profiles").select("id, full_name, email, role, deleted_at").eq("agency_id", id).eq("estado", "eliminado"),
  ])

  if (agenciaRes.error || !agenciaRes.data) {
    return NextResponse.json({ error: "Agencia no encontrada" }, { status: 404 })
  }

  const now = new Date()
  const mesActual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const pagosData = pagosRes.data || []
  const totalAcumulado = pagosData.reduce((sum, p) => sum + Number(p.monto), 0)
  const tienePagoMesActual = pagosData.some((p) => p.periodo_mes === mesActual)

  return NextResponse.json({
    agencia: agenciaRes.data,
    directores: (profilesRes.data || []).filter((p) => p.role === "director" && p.estado !== "eliminado"),
    asesores: (profilesRes.data || []).filter((p) => p.role === "asesor" && p.estado !== "eliminado"),
    usuariosEliminados: deletedUsersRes.data || [],
    creditos: creditosRes.data || null,
    historialCreditos: creditLogRes.data || [],
    tokko: {
      totalPropiedades: (propsRes.data || []).length,
      estadoConexion: agenciaRes.data.tokko_api_key ? "activa" : "sin_credenciales",
    },
    pagos: {
      historial: pagosData,
      tienePagoMesActual,
      totalAcumulado,
      mesActual,
    },
    sugerencias: {
      recientes: feedbackRes.data || [],
      total: feedbackRes.data?.length || 0,
    },
  })
}
