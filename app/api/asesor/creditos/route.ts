import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * GET /api/asesor/creditos
 *
 * Retorna al asesor autenticado:
 *  - limiteMensual  → cuota que le corresponde (credits_asesores / num_asesores_activos)
 *  - consumidoMes   → créditos que él personalmente gastó en el mes actual
 *  - disponible     → limiteMensual - consumidoMes
 *  - porcentaje     → 0-100 para la barra de progreso
 *  - desglosePorFeature → array { feature, total } del mes
 */
export async function GET() {
  const supabase = createClient()

  // ── Autenticación ────────────────────────────────────────────────────────
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  // ── Perfil del asesor ────────────────────────────────────────────────────
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("agency_id, role")
    .eq("id", user.id)
    .single()

  if (profileError || !profile?.agency_id) {
    return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 })
  }

  // El director no tiene cuota personal de asesor: no es un error, simplemente no aplica.
  // Se responde 200 con `aplica: false` a propósito. Con 403 el navegador registraba un
  // error rojo en la consola en TODAS las pantallas de director que muestran el badge de
  // créditos (Tutor, Buscador, Marketing, Contratos), aunque el badge ya lo ignoraba.
  // No se filtra ningún dato: la respuesta va vacía.
  if (profile.role !== "asesor") {
    return NextResponse.json({ aplica: false })
  }

  const agencyId = profile.agency_id

  // ── Créditos de la agencia ────────────────────────────────────────────────
  const [creditosRes, countRes] = await Promise.all([
    supabase
      .from("agency_ai_credits")
      .select("credits_asesores, credits_used_asesores")
      .eq("agency_id", agencyId)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("agency_id", agencyId)
      .eq("role", "asesor")
      .eq("estado", "activo"),
  ])

  const creditos = creditosRes.data
  const numAsesores = countRes.count ?? 1

  const limiteMensual =
    creditos && creditos.credits_asesores > 0 && numAsesores > 0
      ? Math.floor(creditos.credits_asesores / numAsesores)
      : 0

  // ── Consumo personal del asesor en el mes actual ──────────────────────────
  const ahora = new Date()
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString()
  const finMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0, 23, 59, 59).toISOString()

  const { data: transacciones } = await supabase
    .from("ai_credit_transactions")
    .select("credits_consumed, feature")
    .eq("user_id", user.id)
    .eq("agency_id", agencyId)
    .gte("created_at", inicioMes)
    .lte("created_at", finMes)

  const consumidoMes = (transacciones ?? []).reduce(
    (acc, t) => acc + (t.credits_consumed ?? 0),
    0
  )

  // Desglose por feature
  const desglosePorFeature = Object.entries(
    (transacciones ?? []).reduce((acc: Record<string, number>, t) => {
      const key = t.feature || "general"
      acc[key] = (acc[key] ?? 0) + (t.credits_consumed ?? 0)
      return acc
    }, {})
  )
    .map(([feature, total]) => ({ feature, total }))
    .sort((a, b) => b.total - a.total)

  const disponible = Math.max(0, limiteMensual - consumidoMes)
  const porcentaje = limiteMensual > 0 ? Math.min(100, Math.round((consumidoMes / limiteMensual) * 100)) : 0

  return NextResponse.json({
    limiteMensual,
    consumidoMes,
    disponible,
    porcentaje,
    desglosePorFeature,
    mesActual: ahora.toLocaleDateString("es-AR", { month: "long", year: "numeric" }),
    numAsesoresAgencia: numAsesores,
    creditsAsesoresTotal: creditos?.credits_asesores ?? 0,
  })
}
