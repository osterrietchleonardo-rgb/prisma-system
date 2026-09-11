// app/api/farming/zonas/[id]/route.ts
//
// Farming · editar (redibujar / sumar un pedazo / renombrar) y borrar una zona.
// Solo el dueño. El director libera por su propio endpoint; un compartido trabaja las
// tarjetas (etapa 3) pero no toca el territorio.
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireTenant } from "@/lib/auth/tenant-validation"
import { areaKm2, choquesContra, MAX_KM2, sumarPedazo, validarDibujo, type Dibujo } from "@/lib/farming/geometria"
import { armarZona, nombreDe, type FilaZona } from "@/lib/farming/armar"
import { cargarContexto, COLUMNAS_ZONA, responderError } from "@/lib/farming/servidor"

export const dynamic = "force-dynamic"

const LARGO_NOMBRE = 80

/** La zona, si es de la agencia. `mia` dice si el que llama es el dueño. */
async function buscarZona(admin: ReturnType<typeof createAdminClient>, id: string, agencyId: string, userId: string) {
  const { data, error } = await admin
    .from("farming_zonas")
    .select(COLUMNAS_ZONA)
    .eq("id", id)
    .eq("agency_id", agencyId)
    .maybeSingle()
  if (error) throw error
  const zona = data as FilaZona | null
  return { zona, mia: !!zona && zona.owner_user_id === userId }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId, agencyId } = await requireTenant()
    const admin = createAdminClient()
    const { zona, mia } = await buscarZona(admin, params.id, agencyId, userId)
    if (!zona) return NextResponse.json({ error: "No encontramos esa zona" }, { status: 404 })
    if (!mia) return NextResponse.json({ error: "Solo quien dibujó la zona puede cambiarla" }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const accion = body?.accion

    if (accion === "renombrar") {
      const nombre = String(body?.nombre || "").trim().slice(0, LARGO_NOMBRE)
      if (!nombre) return NextResponse.json({ error: "Ponele un nombre a la zona" }, { status: 400 })
      const { data, error } = await admin
        .from("farming_zonas")
        .update({ nombre, updated_at: new Date().toISOString() })
        .eq("id", zona.id)
        .eq("owner_user_id", userId)
        .select(COLUMNAS_ZONA)
        .single()
      if (error) throw error
      const ctx = await cargarContexto(admin, agencyId)
      return NextResponse.json({ zona: armarZona(data as FilaZona, ctx.compartidas, ctx.perfiles) })
    }

    if (accion !== "redibujar" && accion !== "sumar") {
      return NextResponse.json({ error: "No sé qué hacer con esa acción" }, { status: 400 })
    }

    const v = validarDibujo(body?.geojson)
    if (!v.ok) return NextResponse.json({ error: v.motivo }, { status: 400 })

    let dibujo: Dibujo = v.dibujo
    if (accion === "sumar") {
      const unido = sumarPedazo(zona.geojson, v.dibujo)
      if (!unido) return NextResponse.json({ error: "No se pudo sumar ese pedazo: volvé a dibujarlo" }, { status: 400 })
      const v2 = validarDibujo(unido)
      if (!v2.ok) return NextResponse.json({ error: v2.motivo }, { status: 400 })
      dibujo = v2.dibujo
    }

    const km2 = areaKm2(dibujo)
    if (km2 > MAX_KM2) {
      return NextResponse.json({ error: `Con ese cambio la zona mide ${km2.toFixed(1)} km² y el máximo son ${MAX_KM2} km².` }, { status: 400 })
    }

    const ctx = await cargarContexto(admin, agencyId)
    // La zona se excluye a sí misma: si no, redibujarla chocaría contra su versión anterior.
    const choques = choquesContra(
      dibujo,
      ctx.filas
        .filter((z) => z.id !== zona.id)
        .map((z) => ({ id: z.id, nombre: z.nombre, owner_nombre: z.owner_user_id === userId ? "vos" : nombreDe(ctx.perfiles, z.owner_user_id), geojson: z.geojson })),
    )
    if (choques.length > 0) {
      const p = choques[0]
      return NextResponse.json(
        { error: `Ese trazo pisa «${p.nombre}», zona de ${p.owner_nombre}. Corré el trazo y volvé a intentar.`, choques },
        { status: 409 },
      )
    }

    const ahora = new Date().toISOString()
    const { data, error } = await admin
      .from("farming_zonas")
      .update({ geojson: dibujo, area_km2: Number(km2.toFixed(4)), trazo_editado_en: ahora, updated_at: ahora })
      .eq("id", zona.id)
      .eq("owner_user_id", userId)
      .select(COLUMNAS_ZONA)
      .single()
    if (error) throw error

    // ETAPA 3: acá se recalcula `fuera_de_zona` en farming_direcciones. Regla del spec
    // ("Lo trabajado no se borra por mover un trazo"): las direcciones que quedan afuera y
    // están VACÍAS (etapa relevado, sin encargado, sin propietarios, sin contactos) se borran;
    // las demás quedan con fuera_de_zona=true y fuera_de_zona_desde=ahora. La respuesta suma
    // { fuera: { sacadas: n, marcadas: n } } para el aviso de pantalla.

    return NextResponse.json({ zona: armarZona(data as FilaZona, ctx.compartidas, ctx.perfiles) })
  } catch (e) {
    return responderError(e, "editar")
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId, agencyId } = await requireTenant()
    const admin = createAdminClient()
    const { zona, mia } = await buscarZona(admin, params.id, agencyId, userId)
    if (!zona) return NextResponse.json({ error: "No encontramos esa zona" }, { status: 404 })
    if (!mia) return NextResponse.json({ error: "Solo quien dibujó la zona puede borrarla" }, { status: 403 })

    // ETAPA 3: si la zona tiene direcciones cargadas NO se borra: pasa a estado 'archivada'
    // (spec, "Borrar una zona") y la respuesta dice { ok: true, accion: "archivada" }.

    // La FK con on delete cascade se lleva las compartidas en la base real; el doble de
    // prueba no sabe de cascadas, así que se borran explícito. Es inocuo en producción.
    const { error: e1 } = await admin.from("farming_zonas_compartidas").delete().eq("zona_id", zona.id)
    if (e1) throw e1
    const { error: e2 } = await admin.from("farming_zonas").delete().eq("id", zona.id).eq("owner_user_id", userId)
    if (e2) throw e2

    return NextResponse.json({ ok: true, accion: "borrada" })
  } catch (e) {
    return responderError(e, "borrar")
  }
}
