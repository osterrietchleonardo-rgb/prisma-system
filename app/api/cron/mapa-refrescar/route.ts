import { NextResponse } from "next/server"
import { assertCron } from "@/lib/admin-vakdor/cron-auth"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * GET /api/cron/mapa-refrescar
 *
 * Recalcula todo lo que el mapa tiene PRECALCULADO. Sin esto, los precios por m² y el
 * ranking de barrios se quedan con los numeros del dia que se cargaron: las propiedades
 * nuevas entran a la base, se ven como pines, pero no mueven ningun promedio.
 *
 * QUE SE RECALCULA Y QUE NO
 *   mapa_barrios              catalogo del buscador (barrios nuevos, conteos)
 *   mapa_precio_m2_celdas     cuadricula de respaldo
 *   mapa_precio_m2_barrios    ranking de barrios
 *   mapa_precio_m2_manzanas   el precio de cada manzana real
 *
 * Las manzanas EN SI (mapa_manzanas) no se tocan: son las calles de OpenStreetMap y no
 * cambian de un dia para el otro. Se cargan aparte con scripts/cargar-manzanas.mjs.
 *
 * POR QUE POR CRON Y NO AL GUARDAR CADA PROPIEDAD
 * Cada recalculo recorre la tabla entera de la red. Hacerlo con cada alta seria pagar ese
 * costo miles de veces por dia para mover una mediana que, con 12 avisos por manzana, no
 * se entera de una propiedad. Una vez por dia alcanza y sobra.
 */
export async function GET(req: Request) {
  const denied = assertCron(req)
  if (denied) return denied

  const admin = createAdminClient()
  const arranque = Date.now()

  // En orden: el catalogo de barrios primero, porque el ranking se apoya en el.
  const [barriosCat, precios, manzanas] = await Promise.all([
    admin.rpc("refrescar_mapa_barrios"),
    admin.rpc("refrescar_precio_m2"),
    admin.rpc("refrescar_precio_m2_manzanas"),
  ])

  const errores = [barriosCat.error, precios.error, manzanas.error].filter(Boolean)
  if (errores.length > 0) {
    console.error("Mapa refrescar:", errores)
    return NextResponse.json(
      { ok: false, errores: errores.map((e: any) => e.message) },
      { status: 500 },
    )
  }

  // refrescar_precio_m2 devuelve una fila con las dos cuentas.
  const p = Array.isArray(precios.data) ? precios.data[0] : precios.data

  return NextResponse.json({
    ok: true,
    barrios_del_buscador: barriosCat.data,
    celdas: p?.celdas ?? null,
    barrios_con_precio: p?.barrios ?? null,
    manzanas_con_precio: manzanas.data,
    segundos: Math.round((Date.now() - arranque) / 1000),
  })
}
