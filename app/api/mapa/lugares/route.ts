// Mapa · buscador de lugares: que le sugiere la cajita mientras el usuario tipea.
//
// Junta TRES fuentes, todas tolerantes a acentos y errores de tipeo:
//   1. tus zonas guardadas   (privadas: se filtran por user_id, nunca por agencia)
//   2. barrios de tu cartera (filtrados por agencia)
//   3. barrios de la red     (catalogo compartido mapa_barrios)
//
// Las direcciones NO estan aca: las busca el navegador contra MapTiler. La clave exige
// la cabecera Origin y el servidor no la manda, asi que llamarlo desde el backend
// devuelve 403. Verificado el 2026-08-10.
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireTenant } from "@/lib/auth/tenant-validation"
import {
  detalleDeBarrio,
  detalleDeCartera,
  sacarBarriosRepetidos,
  unirLugares,
  type Lugar,
} from "@/lib/mapa/lugares"

export const dynamic = "force-dynamic"

const LARGO_MAXIMO = 60
const ZONAS = 3
const CARTERA = 4
const RED = 6

interface FilaBarrio {
  nombre: string
  cantidad: number
  sur: number
  oeste: number
  norte: number
  este: number
  /** Provincia o ciudad del barrio. Solo la red: la cartera propia es toda de una zona. */
  donde?: string | null
}

function aLugar(f: FilaBarrio, tipo: "barrio" | "cartera"): Lugar {
  return {
    id: `${tipo}:${f.nombre}`,
    tipo,
    nombre: f.nombre,
    detalle: tipo === "cartera" ? detalleDeCartera(f.cantidad) : detalleDeBarrio(f.cantidad, f.donde),
    bbox: { sur: f.sur, oeste: f.oeste, norte: f.norte, este: f.este },
  }
}

export async function GET(req: Request) {
  try {
    const { userId, agencyId } = await requireTenant()

    const q = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, LARGO_MAXIMO)
    // Con una sola letra sugeriria medio catalogo y no ayudaria a nadie.
    if (q.length < 2) return NextResponse.json({ lugares: [] })

    const admin = createAdminClient()

    const [resZonas, resCartera, resRed] = await Promise.all([
      // PRIVADAS: el filtro por user_id no es opcional, createAdminClient se saltea RLS.
      admin
        .from("mapa_zonas")
        .select("id, nombre, geojson")
        .eq("user_id", userId)
        .ilike("nombre", `%${q}%`)
        .limit(ZONAS),
      admin.rpc("mapa_buscar_barrios_cartera", {
        p_agency_id: agencyId,
        p_q: q,
        p_limit: CARTERA,
      }),
      admin.rpc("mapa_buscar_barrios", { p_q: q, p_limit: RED }),
    ])

    if (resZonas.error) throw resZonas.error
    if (resCartera.error) throw resCartera.error
    if (resRed.error) throw resRed.error

    const zonas: Lugar[] = (resZonas.data || []).map((z: any) => ({
      id: `zona:${z.id}`,
      tipo: "zona" as const,
      nombre: z.nombre,
      detalle: "zona guardada por vos",
      // El recuadro lo calcula el navegador a partir del trazo, con la misma cuenta que
      // ya usa al aplicar una zona: aca no hace falta repetirla.
      bbox: { sur: 0, oeste: 0, norte: 0, este: 0 },
      geojson: z.geojson,
    }))

    const cartera = (resCartera.data || []).map((f: FilaBarrio) => aLugar(f, "cartera"))
    const red = sacarBarriosRepetidos(
      (resRed.data || []).map((f: FilaBarrio) => aLugar(f, "barrio")),
      cartera,
    )

    // El orden es la respuesta a "que quiso decir": primero lo suyo, despues lo de todos.
    return NextResponse.json({ lugares: unirLugares(zonas, cartera, red) })
  } catch (e: any) {
    console.error("Mapa lugares error:", e)
    return NextResponse.json(
      { error: e.message },
      { status: e.message === "Unauthorized" ? 401 : 500 },
    )
  }
}
