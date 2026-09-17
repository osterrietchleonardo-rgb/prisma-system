/**
 * Chat web · "Actualizar el sitio": leer la web de la agencia y guardarla.
 *
 * Es la operación más cara del módulo (hasta 60 páginas leídas más sus vectores), así que:
 * - solo el director,
 * - solo su propio sitio (el que está guardado, NO uno que venga en el pedido: si no, cualquiera
 *   podría hacer que nuestro servidor lea la dirección que se le antoje),
 * - y no dos veces seguidas (espera entre rastreos).
 */
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireTenant } from "@/lib/auth/tenant-validation"
import { generateEmbedding } from "@/lib/gemini"
import { almacenSupabase } from "@/lib/chat-web/almacen-supabase"
import { puedeRastrearDeNuevo } from "@/lib/chat-web/configuracion"
import { guardarRastreo } from "@/lib/chat-web/guardar"
import { rastrearSitio } from "@/lib/chat-web/rastreo"

/** Leer 60 páginas y sacarles los vectores puede pasar largo del minuto. */
export const maxDuration = 300

export async function POST() {
  try {
    const { agencyId, role } = await requireTenant()
    if (role !== "director") {
      return NextResponse.json(
        { error: "Solo los directores pueden actualizar el sitio." },
        { status: 403 }
      )
    }

    const db = createAdminClient()
    const { data: widget } = await db
      .from("web_widgets")
      .select("id, sitio, rastreo_en")
      .eq("agency_id", agencyId)
      .maybeSingle()

    if (!widget?.sitio) {
      return NextResponse.json(
        { error: "Primero guardá la dirección del sitio." },
        { status: 404 }
      )
    }

    const espera = puedeRastrearDeNuevo(widget.rastreo_en as string | null, Date.now())
    if (!espera.puede) {
      return NextResponse.json(
        { error: `El sitio se leyó recién. Probá de nuevo en ${espera.faltanMinutos} minutos.` },
        { status: 429 }
      )
    }

    const resultado = await rastrearSitio({ sitio: widget.sitio as string })
    const resumen = await guardarRastreo({
      almacen: almacenSupabase(),
      widgetId: widget.id as string,
      agencyId,
      resultado,
      embeder: (texto) => generateEmbedding(texto, "RETRIEVAL_DOCUMENT"),
    })

    return NextResponse.json({
      ...resumen,
      paginasLeidas: resultado.urlsLeidas,
      truncado: resultado.truncado,
      desdeSitemap: resultado.desdeSitemap,
    })
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Error"
    const estado = mensaje === "Unauthorized" ? 401 : 500
    return NextResponse.json({ error: mensaje }, { status: estado })
  }
}
