/**
 * Chat web · La configuración del widget de la agencia.
 *
 * GET: lo que hay guardado, más las páginas que se leyeron del sitio (para que el director vea
 * qué sabe el asistente y pueda sacar lo que no quiera).
 * POST: guardar. Solo el director, y siempre en SU agencia: el agency_id sale de la sesión,
 * nunca del cuerpo del pedido.
 */
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireTenant } from "@/lib/auth/tenant-validation"
import { validarConfiguracion } from "@/lib/chat-web/configuracion"

export async function GET() {
  try {
    const { agencyId } = await requireTenant()
    const db = createAdminClient()

    const { data: widget } = await db
      .from("web_widgets")
      .select("*")
      .eq("agency_id", agencyId)
      .maybeSingle()

    if (!widget) return NextResponse.json({ widget: null, paginas: [] })

    // Solo lo que se muestra en la lista: el texto de cada página no hace falta acá y son
    // 8.000 caracteres por fila.
    const { data: paginas } = await db
      .from("web_paginas")
      .select("url, titulo, orden, excluida")
      .eq("widget_id", widget.id)
      .order("url")

    return NextResponse.json({ widget, paginas: paginas ?? [] })
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Error"
    const estado = mensaje === "Unauthorized" ? 401 : 500
    return NextResponse.json({ error: mensaje }, { status: estado })
  }
}

export async function POST(req: Request) {
  try {
    const { agencyId, role } = await requireTenant()
    if (role !== "director") {
      return NextResponse.json(
        { error: "Solo los directores pueden configurar el chat de la web." },
        { status: 403 }
      )
    }

    const cuerpo = await req.json().catch(() => ({}))
    const revisado = validarConfiguracion(cuerpo)
    if (!revisado.ok) return NextResponse.json({ errores: revisado.errores }, { status: 400 })

    const db = createAdminClient()
    // `ruteo` (el reparto por tipo de consulta) vive en la columna `destinos_por_objetivo`.
    const { ruteo, ...resto } = revisado.valor
    const { data, error } = await db
      .from("web_widgets")
      .upsert(
        { agency_id: agencyId, ...resto, destinos_por_objetivo: ruteo, updated_at: new Date().toISOString() },
        { onConflict: "agency_id" }
      )
      .select("*")
      .single()
    if (error) throw new Error(error.message)

    return NextResponse.json({ widget: data })
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Error"
    const estado = mensaje === "Unauthorized" ? 401 : 500
    return NextResponse.json({ error: mensaje }, { status: estado })
  }
}
