/**
 * Chat web · La bandeja: las conversaciones del sitio.
 *
 * La ven el director y el asesor que el director eligió en el desplegable (lib/chat-web/acceso.ts).
 * Ese asesor ve SOLO los "quiero sumarme al equipo", que es para lo que lo eligieron.
 *
 * Acá se escribe con el cliente que se saltea la RLS, así que el filtro por agencia va a mano en
 * cada consulta: es la única red que queda de este lado.
 */
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireTenant } from "@/lib/auth/tenant-validation"
import { filtroDeBandeja } from "@/lib/chat-web/acceso"
import { resumirConversaciones, type FilaParaMetricas } from "@/lib/chat-web/metricas"

export async function GET(req: Request) {
  try {
    const { agencyId, userId, role } = await requireTenant()
    const db = createAdminClient()

    const { data: widget } = await db
      .from("web_widgets")
      .select("id, perfil_equipo_id")
      .eq("agency_id", agencyId)
      .maybeSingle()

    const filtro = filtroDeBandeja({ id: userId, rol: role }, widget ?? null)
    if (!filtro) return NextResponse.json({ error: "No tenés acceso a esta bandeja." }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const conversacionId = searchParams.get("conversacion")

    // El detalle de una conversación: sus mensajes.
    if (conversacionId) {
      let q = db
        .from("web_conversaciones")
        .select("id, objetivo, datos, estado, pagina_origen, created_at, last_message_at, derivada_a")
        .eq("id", conversacionId)
        .eq("agency_id", agencyId)
      if (!filtro.todas) q = q.eq("objetivo", filtro.objetivo)
      const { data: conv } = await q.maybeSingle()
      if (!conv) return NextResponse.json({ error: "No encontrada." }, { status: 404 })

      const { data: mensajes } = await db
        .from("web_mensajes")
        .select("rol, texto, created_at")
        .eq("conversacion_id", conversacionId)
        .order("created_at")
      return NextResponse.json({ conversacion: conv, mensajes: mensajes ?? [] })
    }

    // La lista.
    let q = db
      .from("web_conversaciones")
      .select("id, objetivo, datos, estado, pagina_origen, last_message_at, mensajes_count, costo_usd, created_at")
      .eq("agency_id", agencyId)
      .order("last_message_at", { ascending: false })
      .limit(100)
    if (!filtro.todas) q = q.eq("objetivo", filtro.objetivo)
    const { data, error } = await q
    if (error) throw new Error(error.message)

    // El resumen sale de las MISMAS filas que se devuelven: lo que ve en la lista es lo que
    // cuentan los números, siempre. Un tablero que cuenta otra cosa se vuelve indiscutible y falso.
    const resumen = resumirConversaciones((data ?? []) as unknown as FilaParaMetricas[])
    return NextResponse.json({ conversaciones: data ?? [], resumen, soloMias: !filtro.todas })
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Error"
    return NextResponse.json({ error: mensaje }, { status: mensaje === "Unauthorized" ? 401 : 500 })
  }
}
