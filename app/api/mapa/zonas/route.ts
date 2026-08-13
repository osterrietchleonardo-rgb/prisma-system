// Mapa · zonas dibujadas a mano alzada y guardadas por el usuario.
//
// PRIVADAS: cada uno ve unicamente las suyas. Ni el director ve las de un asesor.
// Por eso TODAS las consultas filtran por user_id, nunca solo por agency_id.
// createAdminClient se saltea RLS, asi que el filtro explicito no es opcional.
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireTenant } from "@/lib/auth/tenant-validation"

export const dynamic = "force-dynamic"

const LARGO_NOMBRE = 80
const LARGO_DESCRIPCION = 300
const MAX_ZONAS = 200

function responderError(e: any, contexto: string) {
  console.error(`Mapa zonas (${contexto}):`, e)
  return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 500 })
}

export async function GET() {
  try {
    const { userId } = await requireTenant()
    const admin = createAdminClient()

    const { data, error } = await admin
      .from("mapa_zonas")
      .select("id, nombre, descripcion, geojson, filtros, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(MAX_ZONAS)
    if (error) throw error

    return NextResponse.json({ zonas: data || [] })
  } catch (e: any) {
    return responderError(e, "listar")
  }
}

export async function POST(req: Request) {
  try {
    const { userId, agencyId } = await requireTenant()
    const body = await req.json()

    const nombre = String(body?.nombre || "").trim().slice(0, LARGO_NOMBRE)
    if (!nombre) return NextResponse.json({ error: "Ponele un nombre a la zona" }, { status: 400 })
    if (!body?.geojson) return NextResponse.json({ error: "Falta el trazo" }, { status: 400 })

    const admin = createAdminClient()
    const { data, error } = await admin
      .from("mapa_zonas")
      .insert({
        user_id: userId,
        agency_id: agencyId,
        nombre,
        descripcion: String(body?.descripcion || "").trim().slice(0, LARGO_DESCRIPCION) || null,
        geojson: body.geojson,
        filtros: body?.filtros ?? null,
      })
      .select("id, nombre, descripcion, geojson, filtros, created_at")
      .single()
    if (error) throw error

    return NextResponse.json({ zona: data })
  } catch (e: any) {
    return responderError(e, "guardar")
  }
}

export async function DELETE(req: Request) {
  try {
    const { userId } = await requireTenant()

    const id = new URL(req.url).searchParams.get("id")?.trim()
    if (!id) return NextResponse.json({ error: "Falta el id" }, { status: 400 })

    const admin = createAdminClient()
    // El .eq("user_id") va SIEMPRE junto al id: sin el, cualquiera podria borrar la de otro.
    const { data, error } = await admin
      .from("mapa_zonas")
      .delete()
      .eq("id", id)
      .eq("user_id", userId)
      .select("id")
    if (error) throw error
    if (!data || data.length === 0) {
      return NextResponse.json({ error: "No encontrada" }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return responderError(e, "borrar")
  }
}
