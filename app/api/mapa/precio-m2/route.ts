// Mapa · Fase 2: el precio por m2 del rectangulo visible, por cuadricula y por barrio.
//
// Lee tablas ya calculadas (ver la migracion 20260810200000). Calcularlo al vuelo tardaba
// 18.548 ms sobre CABA y la base cancelaba la consulta sola.
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireTenant } from "@/lib/auth/tenant-validation"
import { parsearBBox } from "@/lib/mapa/bbox"

export const dynamic = "force-dynamic"

const TOPE_MANZANAS = 1500
const TOPE_CELDAS = 3000
const TOPE_BARRIOS = 40

export async function GET(req: Request) {
  try {
    // No devuelve nada de la agencia —son precios de la red— pero igual se exige sesion:
    // ningun endpoint del mapa contesta sin ella.
    await requireTenant()

    const sp = new URL(req.url).searchParams
    const bbox = parsearBBox(sp.get("bbox"))
    if (!bbox) {
      return NextResponse.json({ error: "Falta el rectangulo visible" }, { status: 400 })
    }

    const operacion = sp.get("operacion") === "Alquiler" ? "Alquiler" : "Venta"
    const moneda = sp.get("moneda") === "ARS" ? "ARS" : "USD"

    const comunes = {
      p_sur: bbox.sur,
      p_oeste: bbox.oeste,
      p_norte: bbox.norte,
      p_este: bbox.este,
      p_operacion: operacion,
      p_moneda: moneda,
    }

    const admin = createAdminClient()
    const [resManzanas, resCeldas, resBarrios] = await Promise.all([
      admin.rpc("mapa_precio_m2_por_manzana", { ...comunes, p_limit: TOPE_MANZANAS }),
      admin.rpc("mapa_precio_m2", { ...comunes, p_limit: TOPE_CELDAS }),
      admin.rpc("mapa_ranking_barrios", { ...comunes, p_limit: TOPE_BARRIOS }),
    ])

    if (resManzanas.error) throw resManzanas.error
    if (resCeldas.error) throw resCeldas.error
    if (resBarrios.error) throw resBarrios.error

    // Los numeros vienen como texto porque son `numeric` de Postgres, y numeric no entra
    // en un double sin perder precision. Aca si: son precios redondeados.
    const celdas = (resCeldas.data || []).map((c: any) => ({
      sur: c.sur, oeste: c.oeste, norte: c.norte, este: c.este,
      mediana_m2: Number(c.mediana_m2),
      propiedades: c.propiedades,
    }))
    const barrios = (resBarrios.data || []).map((b: any) => ({
      nombre: b.nombre,
      mediana_m2: Number(b.mediana_m2),
      propiedades: b.propiedades,
    }))

    const manzanas = (resManzanas.data || [])
      .filter((m: any) => Array.isArray(m.contorno) && m.contorno.length >= 4)
      .map((m: any) => ({
        id: m.id,
        contorno: m.contorno,
        mediana_m2: Number(m.mediana_m2),
        propiedades: m.propiedades,
      }))

    // Las manzanas reales GANAN. No se mezclan con la cuadricula: una celda cuadrada
    // encima de las manzanas volveria a pintar de un color las dos veredas de una
    // avenida, que es justo el error que las manzanas vienen a corregir. Donde todavia
    // no hay manzanas cargadas se sigue mostrando la cuadricula, que es mejor que nada.
    const hayManzanas = manzanas.length > 0

    return NextResponse.json({
      manzanas,
      celdas: hayManzanas ? [] : celdas,
      unidad: hayManzanas ? "manzana" : "cuadricula",
      barrios,
      operacion,
      moneda,
    })
  } catch (e: any) {
    console.error("Mapa precio m2 error:", e)
    return NextResponse.json(
      { error: e.message },
      { status: e.message === "Unauthorized" ? 401 : 500 },
    )
  }
}
