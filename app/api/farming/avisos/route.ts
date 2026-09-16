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

    // El offset es CUÁNTAS tarjetas ya tiene el asesor en pantalla (avisos.length del
    // componente), no pagina×60: la lista de excluidos se recalcula en cada pedido, así que
    // un offset fijo por página se corre cuando de por medio hubo un descarte (bug real:
    // "Ver más" salteaba avisos después de descartar). avisos.length absorbe también un
    // deshacer, porque siempre es un prefijo del resultado ya filtrado.
    //
    // Number("1e400") da Infinity, y Infinity no es un offset válido: se sanea a 0 en vez de
    // mentir con "pagina": null o romper con un offset no entero.
    const desdeCruda = Number(q.get("desde") ?? 0)
    const desde = Number.isFinite(desdeCruda) ? Math.max(0, Math.floor(desdeCruda)) : 0

    const admin = createAdminClient()
    const { zona, puede } = await zonaAccesible(admin, zonaId, agencyId, userId)
    if (!zona) return NextResponse.json({ error: "No encontramos esa zona activa" }, { status: 404 })
    if (!puede) return NextResponse.json({ error: "Esa zona es de un colega" }, { status: 403 })

    // Lo ya descartado NI lo ya convertido en tarjeta vuelven a aparecer: los dos van a la
    // consulta, no se filtran después, para que la página no quede corta ni los conteos
    // mientan. "convertido" entra acá también (task 6, 16-sep-2026): un aviso que el asesor ya
    // pasó a Relevamiento no tiene sentido que siga en esta lista — si volviera, «crear
    // tarjeta» chocaría con un 409 contra la misma puerta que él mismo ya cargó.
    const { data: marcas, error: eM } = await admin
      .from("farming_avisos_marca")
      .select("aviso_id")
      .eq("zona_id", zonaId)
      .in("estado", ["descartado", "convertido"])
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
        p_offset: desde,
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
      // Campo de contrato (ver el comentario en RespuestaAvisos.pagina): ya no maneja la
      // paginación, solo informa cuántas tandas de POR_PAGINA representa este `desde`.
      pagina: Math.floor(desde / POR_PAGINA),
      hay_mas: hayMas,
    })
  } catch (e) {
    return responderError(e, "avisos de la zona")
  }
}
