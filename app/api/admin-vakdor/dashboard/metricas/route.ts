import { NextRequest, NextResponse } from "next/server"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { getAdminDb } from "@/lib/admin-vakdor/logger"

export async function GET(request: NextRequest) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const db = getAdminDb()
  const now = new Date()
  const hoy = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const hace7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
  const hace24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const hace30d = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
  const mesActual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

  const [
    agenciasRes,
    profilesRes,
    creditosRes,
    propiedadesRes,
    pagosRes,
    feedbackRes,
    creditTransRes,
    actividadRes,
  ] = await Promise.all([
    // Agencias por estado
    db.from("agencies").select("id, estado, created_at"),
    // Profiles por rol y estado
    db.from("profiles").select("id, role, estado, created_at, agency_id"),
    // Créditos disponibles por agencia
    db.from("agency_ai_credits").select("agency_id, credits_total, credits_used"),
    // Propiedades totales
    db.from("properties").select("id, agency_id, created_at"),
    // Pagos
    db.from("pagos_agencia").select("id, agencia_id, monto, moneda, periodo_mes, fecha_registro"),
    // Sugerencias
    db.from("system_feedback").select("id, estado, created_at, type"),
    // Transacciones de créditos (consumo)
    db.from("ai_credit_transactions").select("id, agency_id, credits_consumed, created_at"),
    // Actividad reciente (últimos 50)
    db.from("admin_vakdor_activity_log")
      .select("*")
      .order("timestamp", { ascending: false })
      .limit(50),
  ])

  const agencias = agenciasRes.data || []
  const profiles = profilesRes.data || []
  const creditos = creditosRes.data || []
  const propiedades = propiedadesRes.data || []
  const pagos = pagosRes.data || []
  const feedback = feedbackRes.data || []
  const creditTrans = creditTransRes.data || []

  // Computar métricas
  const agenciasActivas = agencias.filter((a) => a.estado === "activo" || !a.estado).length
  const agenciasPausadas = agencias.filter((a) => a.estado === "pausado").length
  const agenciasEliminadas = agencias.filter((a) => a.estado === "eliminado").length

  const directores = profiles.filter((p) => p.role === "director")
  const asesores = profiles.filter((p) => p.role === "asesor")

  const creditosDisponibles = creditos.reduce(
    (sum, c) => sum + (c.credits_total - c.credits_used),
    0
  )
  const creditosConsumidosHoy = creditTrans
    .filter((t) => t.created_at >= hoy)
    .reduce((sum, t) => sum + t.credits_consumed, 0)
  const creditosConsumidosMes = creditTrans
    .filter((t) => t.created_at >= new Date(now.getFullYear(), now.getMonth(), 1).toISOString())
    .reduce((sum, t) => sum + t.credits_consumed, 0)
  const creditosHistorico = creditTrans.reduce((sum, t) => sum + t.credits_consumed, 0)

  const totalPropiedades = propiedades.length

  // Pagos del mes actual
  const pagosMesActual = pagos.filter((p) => p.periodo_mes === mesActual)
  const totalFacturadoMes = pagosMesActual.reduce((sum, p) => sum + Number(p.monto), 0)
  const totalFacturadoHistorico = pagos.reduce((sum, p) => sum + Number(p.monto), 0)
  const agenciasIdsConPagoMes = new Set(pagosMesActual.map((p) => p.agencia_id))
  const agenciasSinPagoMes = agencias
    .filter((a) => (a.estado === "activo" || !a.estado) && !agenciasIdsConPagoMes.has(a.id))
    .length

  // Sugerencias
  const sugerenciasPendientes = feedback.filter((f) => !f.estado || f.estado === "pendiente").length
  const sugerenciasMes = feedback.filter(
    (f) => f.created_at >= new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  ).length

  // Categoría más repetida del mes
  const categoriasMes = feedback
    .filter((f) => f.created_at >= new Date(now.getFullYear(), now.getMonth(), 1).toISOString())
    .reduce((acc, f) => {
      const cat = f.type || "otro"
      acc[cat] = (acc[cat] || 0) + 1
      return acc
    }, {} as Record<string, number>)
  const categoriaMasRepetida = Object.entries(categoriasMes).sort(([, a], [, b]) => b - a)[0]

  // Consumo por agencia último mes (para gráfico)
  const consumoPorAgencia = creditTrans
    .filter((t) => t.created_at >= hace30d)
    .reduce((acc, t) => {
      acc[t.agency_id] = (acc[t.agency_id] || 0) + t.credits_consumed
      return acc
    }, {} as Record<string, number>)

  // Propiedades por agencia
  const propsPorAgencia = propiedades.reduce((acc, p) => {
    if (p.agency_id) acc[p.agency_id] = (acc[p.agency_id] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // Evolución facturación mensual (últimos 12 meses)
  const evolucionFacturacion: Record<string, number> = {}
  pagos.forEach((p) => {
    evolucionFacturacion[p.periodo_mes] = (evolucionFacturacion[p.periodo_mes] || 0) + Number(p.monto)
  })

  return NextResponse.json({
    resumen: {
      agencias: { total: agencias.length, activas: agenciasActivas, pausadas: agenciasPausadas, eliminadas: agenciasEliminadas },
      directores: { total: directores.length, activos: directores.filter((p) => !p.estado || p.estado === "activo").length, pausados: directores.filter((p) => p.estado === "pausado").length },
      asesores: { total: asesores.length, activos: asesores.filter((p) => !p.estado || p.estado === "activo").length, pausados: asesores.filter((p) => p.estado === "pausado").length },
      creditos: { disponibles: creditosDisponibles, consumidosHoy: creditosConsumidosHoy, consumidosMes: creditosConsumidosMes, consumidosHistorico: creditosHistorico },
      propiedades: totalPropiedades,
      facturacion: { mes: totalFacturadoMes, historico: totalFacturadoHistorico, agenciasSinPagoMes },
      sugerencias: { pendientes: sugerenciasPendientes, esteMes: sugerenciasMes, categoriaMasRepetida: categoriaMasRepetida ? { categoria: categoriaMasRepetida[0], cantidad: categoriaMasRepetida[1] } : null },
    },
    graficos: {
      consumoPorAgencia,
      propsPorAgencia,
      evolucionFacturacion,
    },
    actividadReciente: actividadRes.data || [],
  })
}
