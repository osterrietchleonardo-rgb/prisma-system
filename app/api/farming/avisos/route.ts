// Farming · lo que se publica HOY adentro de una zona. La lista no se guarda en ningún lado:
// se calcula del polígono en cada carga, así el trazo y la lista nunca se desfasan.
//
// createAdminClient se saltea la RLS: el acceso a la zona se valida a mano, siempre.
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireTenant } from "@/lib/auth/tenant-validation"
import { responderError, zonaAccesible } from "@/lib/farming/servidor"
import { armarAviso, atajosVisibles, POR_PAGINA, SENALES, type ConteosSenales, type FilaAviso, type Senal } from "@/lib/farming/avisos"

export const dynamic = "force-dynamic"

const CLAVES: string[] = SENALES.map((s) => s.clave)

export async function GET(req: Request) {
  try {
    const { userId, agencyId } = await requireTenant()
    const q = new URL(req.url).searchParams

    const zonaId = q.get("zona_id")?.trim()
    if (!zonaId) return NextResponse.json({ error: "Falta la zona" }, { status: 400 })

    const senal = q.get("senal")?.trim() || null
    if (senal && !CLAVES.includes(senal)) {
      return NextResponse.json({ error: "No conozco ese filtro" }, { status: 400 })
    }

    const pagina = Math.max(0, Number(q.get("pagina") ?? 0) || 0)

    const admin = createAdminClient()
    const { zona, puede } = await zonaAccesible(admin, zonaId, agencyId, userId)
    if (!zona) return NextResponse.json({ error: "No encontramos esa zona activa" }, { status: 404 })
    if (!puede) return NextResponse.json({ error: "Esa zona es de un colega" }, { status: 403 })

    // Lo ya descartado no vuelve a aparecer: va a la consulta, no se filtra después, para que
    // la página no quede corta ni los conteos mientan.
    const { data: marcas, error: eM } = await admin
      .from("farming_avisos_marca")
      .select("aviso_id")
      .eq("zona_id", zonaId)
      .eq("estado", "descartado")
    if (eM) throw eM
    const excluir = (marcas || []).map((m: any) => Number(m.aviso_id))

    const geojson = JSON.stringify(zona.geojson)

    // Se pide UNA fila de más que la página: así se sabe si hay más sin contar dos veces.
    const [lista, conteos] = await Promise.all([
      admin.rpc("farming_avisos_en_zona", {
        p_geojson: geojson,
        p_senal: senal,
        p_excluir: excluir,
        p_limit: POR_PAGINA + 1,
        p_offset: pagina * POR_PAGINA,
      }),
      admin.rpc("farming_avisos_conteos", { p_geojson: geojson, p_excluir: excluir }),
    ])
    if (lista.error) throw lista.error
    if (conteos.error) throw conteos.error

    const filas = (lista.data || []) as FilaAviso[]
    const hayMas = filas.length > POR_PAGINA
    const c = ((conteos.data || [])[0] || { total: 0, duenos: 0, caidos: 0, viejos: 0, bajaron: 0 }) as ConteosSenales

    return NextResponse.json({
      zona: { id: zona.id, nombre: zona.nombre },
      conteos: {
        total: Number(c.total) || 0,
        duenos: Number(c.duenos) || 0,
        caidos: Number(c.caidos) || 0,
        viejos: Number(c.viejos) || 0,
        bajaron: Number(c.bajaron) || 0,
      },
      atajos: atajosVisibles({
        total: Number(c.total) || 0,
        duenos: Number(c.duenos) || 0,
        caidos: Number(c.caidos) || 0,
        viejos: Number(c.viejos) || 0,
        bajaron: Number(c.bajaron) || 0,
      }) as Senal[],
      avisos: filas.slice(0, POR_PAGINA).map(armarAviso),
      pagina,
      hay_mas: hayMas,
    })
  } catch (e) {
    return responderError(e, "avisos de la zona")
  }
}
