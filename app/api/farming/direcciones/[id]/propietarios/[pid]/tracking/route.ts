// app/api/farming/direcciones/[id]/propietarios/[pid]/tracking/route.ts
//
// Farming · el botón que pasa un propietario al pipeline de Tracking. El asesor golpeó la
// puerta, la persona mostró interés en vender o alquilar, y ahora es un lead más del equipo —
// pero SOLO cuando el asesor lo aprieta: nada de esto corre solo (spec).
//
// `direccionAccesible` (lib/farming/servidor.ts) es el mismo candado que el resto de Farming:
// corre ANTES de tocar nada. `savePerformanceLog` (actions/tracking/savePerformanceLog.ts) es
// la puerta de Tracking: crea la actividad y valida el proceso contra PROCESOS_POR_ETAPA. Acá
// se elige `type: "prospeccion"` siempre; el proceso (vendedor o locador) lo elige el asesor en
// la pantalla, nunca un default del servidor.
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireTenant } from "@/lib/auth/tenant-validation"
import { direccionAccesible, rechazoDeDireccion, responderError, FORMA_UUID } from "@/lib/farming/servidor"
import { savePerformanceLog } from "@/actions/tracking/savePerformanceLog"

export const dynamic = "force-dynamic"

type ProcesoPipeline = "vendedor" | "locador"
const PROCESOS_VALIDOS: ProcesoPipeline[] = ["vendedor", "locador"]

/** El propietario, ya confirmado de ESTA dirección. Mismo criterio que el candado de
 *  app/api/farming/direcciones/[id]/propietarios/[pid]/route.ts: un `pid` de otra tarjeta (o
 *  sin forma de uuid) da 404, aunque exista de verdad y aunque quien llama tenga acceso también
 *  a la dirección dueña. */
async function buscarPropietario(admin: ReturnType<typeof createAdminClient>, direccionId: string, pid: string) {
  if (!FORMA_UUID.test(pid)) return null
  const { data, error } = await admin.from("farming_propietarios").select("*").eq("id", pid).maybeSingle()
  if (error) throw error
  if (!data || (data as any).direccion_id !== direccionId) return null
  return data as any
}

export async function POST(req: Request, { params }: { params: { id: string; pid: string } }) {
  try {
    const { userId, agencyId } = await requireTenant()
    const admin = createAdminClient()

    // "escribir": pasar a alguien al pipeline es una escritura sobre la tarjeta. En una zona
    // archivada no se genera actividad nueva — se mira, no se trabaja.
    const acceso = await direccionAccesible(admin, params.id, agencyId, userId, "escribir")
    const no = rechazoDeDireccion(acceso)
    if (no) return no
    const direccion = acceso.direccion

    const propietario = await buscarPropietario(admin, params.id, params.pid)
    if (!propietario) {
      return NextResponse.json({ error: "No encontramos ese propietario en esta tarjeta" }, { status: 404 })
    }

    // Nunca se infla el Tracking del equipo por un doble toque: si ya tiene un id, se contesta
    // con el que ya existe y no se crea una segunda actividad.
    if (propietario.tracking_log_id) {
      return NextResponse.json(
        { error: "Esta persona ya está en tu pipeline", tracking_log_id: propietario.tracking_log_id },
        { status: 409 },
      )
    }

    const body = await req.json().catch(() => ({}))
    const proceso = body?.proceso
    if (!PROCESOS_VALIDOS.includes(proceso)) {
      return NextResponse.json({ error: "Elegí si esta persona es vendedora o locadora." }, { status: 400 })
    }

    // El nombre de la zona, para que la referencia se lea igual en la tarjeta de Farming y en
    // la de Tracking: «Av. Ejemplo 1200 · zona «Palermo»».
    const { data: zona, error: eZona } = await admin
      .from("farming_zonas")
      .select("nombre")
      .eq("id", direccion.zona_id)
      .maybeSingle()
    if (eZona) throw eZona
    const propiedad_ref =
      `${[direccion.calle, direccion.altura].filter(Boolean).join(" ")} · zona «${(zona as any)?.nombre ?? ""}»`

    const log = await savePerformanceLog({
      type: "prospeccion",
      proceso,
      propiedad_ref,
      // Fecha simple (no la de Buenos Aires): es la misma fórmula que ya usa el formulario de
      // Tracking (components/tracking/PerformanceLogForm.tsx) para este mismo campo — acá se
      // sigue esa convención, no la de farming_contactos.fecha.
      fecha_actividad: new Date().toISOString().slice(0, 10),
      // performance_logs no tiene columnas propias de nombre/teléfono (los lee de `leads` o de
      // `wa_contacts`, que esto no crea): van en `metadata`, con el origen y los ids de Farming
      // para poder rastrear de vuelta cuál puerta generó esta actividad.
      metadata: {
        origen: "farming",
        farming_direccion_id: params.id,
        farming_propietario_id: params.pid,
        nombre: propietario.nombre,
        telefono: propietario.telefono,
      },
    })

    const { error: eUpdate } = await admin
      .from("farming_propietarios")
      .update({ tracking_log_id: log.id, updated_at: new Date().toISOString() })
      .eq("id", params.pid)

    if (eUpdate) {
      // La actividad YA se creó del lado de Tracking: contestar como si hubiera fallado
      // invitaría al asesor a apretar de nuevo y duplicarla. Un aviso, no un error.
      console.error("Farming (enlazar propietario a Tracking):", eUpdate)
      return NextResponse.json({
        tracking_log_id: log.id,
        aviso: "La actividad ya se creó en tu pipeline, pero no pudimos guardar el enlace en esta tarjeta.",
      })
    }

    return NextResponse.json({ tracking_log_id: log.id })
  } catch (e) {
    return responderError(e, "pasar propietario a Tracking")
  }
}
