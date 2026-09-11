// app/api/farming/zonas/route.ts
//
// Farming · las zonas del territorio. GET: todo lo que la pantalla necesita. POST: crear.
//
// createAdminClient se saltea la RLS: por eso TODAS las consultas filtran por agency_id y
// las escrituras ponen owner_user_id de la sesión, nunca del body. No es opcional.
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireTenant } from "@/lib/auth/tenant-validation"
import { areaKm2, choquesContra, MAX_KM2, MAX_ZONAS_ACTIVAS, validarDibujo } from "@/lib/farming/geometria"
import { armarRespuesta, armarZona, nombreDe, type FilaZona } from "@/lib/farming/armar"
import { cargarContexto, COLUMNAS_ZONA, responderError } from "@/lib/farming/servidor"

export const dynamic = "force-dynamic"

const LARGO_NOMBRE = 80

export async function GET() {
  try {
    const { userId, agencyId, role } = await requireTenant()
    const admin = createAdminClient()
    const ctx = await cargarContexto(admin, agencyId)
    return NextResponse.json(armarRespuesta({ ...ctx, userId, role }))
  } catch (e) {
    return responderError(e, "listar")
  }
}

export async function POST(req: Request) {
  try {
    const { userId, agencyId, role } = await requireTenant()
    if (role !== "asesor") {
      return NextResponse.json({ error: "Farming es una herramienta del asesor: el director ve y libera, no dibuja" }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const nombre = String(body?.nombre || "").trim().slice(0, LARGO_NOMBRE)
    if (!nombre) return NextResponse.json({ error: "Ponele un nombre a la zona" }, { status: 400 })

    const v = validarDibujo(body?.geojson)
    if (!v.ok) return NextResponse.json({ error: v.motivo }, { status: 400 })

    const km2 = areaKm2(v.dibujo)
    if (km2 > MAX_KM2) {
      return NextResponse.json({ error: `La zona mide ${km2.toFixed(1)} km² y el máximo son ${MAX_KM2} km². Dibujá una más chica.` }, { status: 400 })
    }

    const admin = createAdminClient()
    const ctx = await cargarContexto(admin, agencyId)

    const mias = ctx.filas.filter((z) => z.owner_user_id === userId)
    if (mias.length >= MAX_ZONAS_ACTIVAS) {
      return NextResponse.json({ error: `Ya tenés ${MAX_ZONAS_ACTIVAS} zonas activas, que es el máximo. Borrá una para dibujar otra.` }, { status: 400 })
    }

    // Se controla contra TODAS las activas de la agencia, las propias incluidas: dos zonas
    // del mismo asesor una encima de la otra tampoco tienen sentido.
    const choques = choquesContra(
      v.dibujo,
      ctx.filas.map((z) => ({ id: z.id, nombre: z.nombre, owner_nombre: z.owner_user_id === userId ? "vos" : nombreDe(ctx.perfiles, z.owner_user_id), geojson: z.geojson })),
    )
    if (choques.length > 0) {
      const primero = choques[0]
      return NextResponse.json(
        { error: `Tu trazo pisa «${primero.nombre}», zona de ${primero.owner_nombre}. Corré el trazo y volvé a intentar.`, choques },
        { status: 409 },
      )
    }

    const { data, error } = await admin
      .from("farming_zonas")
      .insert({
        agency_id: agencyId,
        owner_user_id: userId,
        nombre,
        geojson: v.dibujo,
        area_km2: Number(km2.toFixed(4)),
        origen_mapa_zona_id: typeof body?.origen_mapa_zona_id === "string" ? body.origen_mapa_zona_id : null,
        estado: "activa",
      })
      .select(COLUMNAS_ZONA)
      .single()
    if (error) throw error

    return NextResponse.json({ zona: armarZona(data as FilaZona, [], ctx.perfiles) }, { status: 201 })
  } catch (e) {
    return responderError(e, "crear")
  }
}
