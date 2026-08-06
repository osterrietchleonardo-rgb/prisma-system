import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getHandoffsDashboardData } from "@/lib/queries/handoffs"

// Contador de handoffs sin atender para la burbuja flotante del celular.
// Reusa la MISMA consulta que el panel del dashboard a propósito: si algún día
// cambia qué cuenta como "sin atender", el número de la burbuja cambia con él.
export const dynamic = "force-dynamic"

export async function GET() {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ pendientes: 0 }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("agency_id, role")
    .eq("id", user.id)
    .single()

  if (!profile?.agency_id) {
    return NextResponse.json({ pendientes: 0 })
  }

  // Mismo alcance que el dashboard: el asesor ve solo sus derivaciones,
  // el director las de toda la inmobiliaria.
  const agentId = profile.role === "director" ? undefined : user.id

  try {
    const data = await getHandoffsDashboardData(profile.agency_id, agentId)
    return NextResponse.json({ pendientes: data.unattended.length })
  } catch (err) {
    console.error("[handoffs-pendientes] Error al contar handoffs:", err)
    return NextResponse.json({ pendientes: 0 }, { status: 500 })
  }
}
