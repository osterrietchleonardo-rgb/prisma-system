/**
 * Chat web · Prender y apagar el asistente de la web.
 *
 * Hasta hoy `activo` se cambiaba a mano en la base y el director no tenía forma de prenderlo: la
 * pantalla decía "está apagado" y no ofrecía nada. Esto es ese interruptor.
 *
 * Dos condiciones para prender, porque un asistente prendido atiende a gente de verdad y gasta:
 * que la configuración exista, y que el sitio ya se haya leído (si no sabe nada, contesta mal).
 * Apagar no tiene condiciones: si alguien quiere cortar, se corta.
 */
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireTenant } from "@/lib/auth/tenant-validation"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

export async function POST(req: Request) {
  try {
    const { agencyId, role } = await requireTenant()
    if (role !== "director") {
      return NextResponse.json(
        { error: "Solo los directores pueden prender o apagar el chat de la web." },
        { status: 403 }
      )
    }

    const cuerpo = await req.json().catch(() => ({}))
    const prender = cuerpo?.activo === true

    const db = createAdminClient()
    const { data: widget } = await db
      .from("web_widgets")
      .select("id, activo, rastreo_paginas")
      .eq("agency_id", agencyId)
      .maybeSingle()

    if (!widget) {
      return NextResponse.json(
        { error: "Primero hay que completar la configuración del Asesor IA Web." },
        { status: 400 }
      )
    }

    if (prender && !(widget.rastreo_paginas > 0)) {
      return NextResponse.json(
        {
          error:
            "Todavía no se leyó tu sitio, así que el asistente no sabría qué contestar. " +
            "Abrí la configuración y usá «Leer mi sitio» antes de prenderlo.",
        },
        { status: 400 }
      )
    }

    // El agency_id sale de la sesión: el id del cuerpo del pedido no se usa para nada.
    const { data, error } = await db
      .from("web_widgets")
      .update({ activo: prender, updated_at: new Date().toISOString() })
      .eq("agency_id", agencyId)
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
