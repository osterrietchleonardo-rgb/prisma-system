// Crea la ficha de una SELECCIÓN: varias propiedades elegidas por el asesor en el Buscador
// IA o en el mapa, con la marca de su agencia, su tarjeta de contacto, una nota opcional
// por propiedad y una nota final opcional del grupo. Mismo molde que
// app/api/ficha/share/route.ts, del que reusa lib/ficha/snapshot.ts.
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireTenant } from "@/lib/auth/tenant-validation"
import { generarToken } from "@/lib/ficha/token"
import { marcaDeLaAgencia, propiedadParaFicha } from "@/lib/ficha/snapshot"
import { TOPE_SELECCION } from "@/lib/seleccion/estado"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const MAX_NOTA = 400
const MAX_NOTA_FINAL = 1000
const MAX_TITULO = 200
const MAX_DESCRIPCION = 4000

const recortar = (v: unknown, tope: number) => (typeof v === "string" ? v.trim().slice(0, tope) : "")

/**
 * El texto que el asesor revisó gana sobre el de la base.
 *
 * La descripción de un aviso de la red trae, en el 55% de los casos, la matrícula o el
 * corredor de la inmobiliaria que publica, y en el 42% su nombre. No se puede limpiar solo
 * de forma confiable (ver lib/seleccion/textos.ts), así que el asesor lo lee y lo corrige en
 * el repaso. Lo que quedó ahí es lo que se publica — incluso si mientras tanto cambió en la
 * base, porque es lo que él aprobó.
 *
 * Si no mandó nada, vale lo de la base: así el endpoint sigue sirviendo sin la pantalla de
 * repaso.
 */
const textoRevisado = (editado: unknown, deLaBase: string, tope: number) => {
  const limpio = recortar(editado, tope)
  return limpio || deLaBase
}

export async function POST(req: Request) {
  try {
    const cuerpo = await req.json()
    const elegidas = Array.isArray(cuerpo?.propiedades) ? cuerpo.propiedades : []

    if (elegidas.length === 0) {
      return NextResponse.json({ error: "No elegiste ninguna propiedad." }, { status: 400 })
    }
    if (elegidas.length > TOPE_SELECCION) {
      return NextResponse.json(
        { error: `Podés mandar hasta ${TOPE_SELECCION} propiedades en una misma ficha.` },
        { status: 400 },
      )
    }

    const { userId, agencyId } = await requireTenant()
    const supabase = await createClient()

    // ── Perfil del asesor/director que comparte (su tarjeta de contacto) ──
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email, phone, avatar_url, role")
      .eq("id", userId)
      .single()

    // ── Agencia + marca (Marketing IA → Configuración IA) ──
    const { data: agency } = await supabase
      .from("agencies")
      .select("id, name, marketing_ai_config")
      .eq("id", agencyId)
      .single()

    const properties: any[] = []
    const omitidas: Array<{ id: string; motivo: string }> = []

    for (const elegida of elegidas) {
      const id = String(elegida?.id ?? "")
      const resultado = await propiedadParaFicha(
        supabase as any,
        String(elegida?.source ?? ""),
        id,
        agencyId,
      )

      // Un 503 es un problema NUESTRO, no un hecho del mundo: cortamos todo antes de
      // guardar nada. Generar una ficha a la que le falta una propiedad por un hipo de la
      // base es peor que pedirle al asesor que reintente.
      if (!resultado.ok && resultado.estado === 503) {
        return NextResponse.json({ error: resultado.motivo }, { status: 503 })
      }
      if (!resultado.ok) {
        omitidas.push({ id, motivo: resultado.motivo })
        continue
      }
      properties.push({
        ...resultado.propiedad,
        title: textoRevisado(elegida?.titulo, resultado.propiedad.title || "", MAX_TITULO),
        description: textoRevisado(elegida?.descripcion, resultado.propiedad.description, MAX_DESCRIPCION),
        nota: recortar(elegida?.nota, MAX_NOTA),
      })
    }

    if (properties.length === 0) {
      return NextResponse.json(
        { error: "Ninguna de las propiedades que elegiste sigue publicada. Probá con otras." },
        { status: 404 },
      )
    }

    const snapshot = {
      properties,
      nota_final: recortar(cuerpo?.nota_final, MAX_NOTA_FINAL),
      agent: {
        full_name: profile?.full_name || "",
        email: profile?.email || "",
        phone: profile?.phone || "",
        avatar_url: profile?.avatar_url || null,
        role: profile?.role || "asesor",
      },
      agency: { id: agency?.id || agencyId, name: agency?.name || "" },
      brand: marcaDeLaAgencia(agency?.marketing_ai_config),
      created_at: new Date().toISOString(),
    }

    const token = generarToken()
    const admin = createAdminClient()
    const { error: insErr } = await admin.from("shared_selections").insert({
      token,
      snapshot,
      created_by: userId,
      agency_id: agencyId,
    })
    if (insErr) throw insErr

    return NextResponse.json({ token, path: `/seleccion/${token}`, omitidas })
  } catch (error: any) {
    console.error("Crear selección error:", error)
    return NextResponse.json({ error: "No pudimos armar la ficha. Probá de nuevo." }, { status: 500 })
  }
}
