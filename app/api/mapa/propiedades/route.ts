// Mapa · propiedades dentro del rectangulo visible.
// Devuelve la cartera de la agencia + la red de colaboracion, con tope de 1.000 puntos
// contando las dos juntas. Payload liviano (una foto de portada, sin descripcion): la
// ficha completa se pide por /api/mapa/propiedad al clickear el punto.
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireTenant } from "@/lib/auth/tenant-validation"
import { parsearBBox } from "@/lib/mapa/bbox"
import { leerFiltros } from "@/lib/mapa/filtros"
import { consultarMapa } from "@/lib/mapa/consulta"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    const { userId, agencyId } = await requireTenant()

    const sp = new URL(req.url).searchParams
    const bbox = parsearBBox(sp.get("bbox"))
    if (!bbox) {
      return NextResponse.json(
        { error: "Falta el rectangulo visible o esta mal formado (bbox=sur,oeste,norte,este)" },
        { status: 400 },
      )
    }

    const admin = createAdminClient()
    const r = await consultarMapa(admin, {
      bbox,
      filtros: leerFiltros(sp),
      agencyId,
      userId,
    })

    return NextResponse.json(r)
  } catch (e: any) {
    console.error("Mapa propiedades error:", e)
    return NextResponse.json(
      { error: e.message },
      { status: e.message === "Unauthorized" ? 401 : 500 },
    )
  }
}
