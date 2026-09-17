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
//
// LA REGLA QUE SOSTIENE TODO ESTE ARCHIVO: una persona, UNA actividad. El pipeline del equipo
// no se infla por un botón apretado dos veces. Se defiende en tres capas, porque PostgREST no
// da transacciones:
//   1. la tarjeta ya tiene `tracking_log_id` → 409 y listo;
//   2. no lo tiene, pero la actividad existe igual (un enlace que no se pudo guardar antes) →
//      se la busca por el id de la persona que viaja en `metadata`, se repara el enlace y 409;
//   3. se crea, y el enlace se escribe SOLO si sigue vacío. Cero filas tocadas = otro apretón
//      ganó la carrera: la actividad recién creada se borra y se contesta 409.
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

// «tu pipeline» sería mentira en una zona compartida: la actividad la creó QUIEN LA APRETÓ
// primero, no necesariamente este asesor — «una persona, una actividad» es del EQUIPO, y el
// colega que llegó segundo tiene que leer que es del equipo, no que es suya y que por eso no
// la ve en su propio Tracking.
const YA_ESTA = "Esta persona ya está en el pipeline del equipo"

/** ¿Esta persona YA tiene una actividad en Tracking, aunque la tarjeta no la muestre?
 *
 *  Es la red que atrapa el caso feo: la actividad se creó, el enlace a `farming_propietarios`
 *  no se pudo guardar, y la tarjeta volvió a mostrar el botón. Sin esta consulta, el siguiente
 *  apretón crearía una SEGUNDA prospección para la misma persona en el pipeline del equipo.
 *  El id de la persona viaja en `metadata` desde que se creó la actividad, así que se la busca
 *  por ahí. `agency_id` va SIEMPRE en el filtro: el cliente admin se saltea la RLS. */
async function actividadYaCreada(
  admin: ReturnType<typeof createAdminClient>,
  agencyId: string,
  pid: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("performance_logs")
    .select("id")
    .eq("agency_id", agencyId)
    .eq("type", "prospeccion")
    .eq("metadata->>farming_propietario_id", pid)
    .limit(1)
  if (error) throw error
  return (data as any[] | null)?.[0]?.id ?? null
}

/** Enlaza la actividad a la persona SOLO si sigue sin enlazar. Devuelve cuántas filas tocó:
 *  0 significa que otro apretón ganó la carrera mientras esta actividad se creaba. */
function enlazar(admin: ReturnType<typeof createAdminClient>, pid: string, logId: string) {
  return admin
    .from("farming_propietarios")
    .update({ tracking_log_id: logId, updated_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", pid)
    .is("tracking_log_id", null)
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
        { error: YA_ESTA, tracking_log_id: propietario.tracking_log_id },
        { status: 409 },
      )
    }

    const body = await req.json().catch(() => ({}))
    const proceso = body?.proceso
    if (!PROCESOS_VALIDOS.includes(proceso)) {
      return NextResponse.json({ error: "Elegí si esta persona es vendedora o locadora." }, { status: 400 })
    }

    // La tarjeta dice que no está enlazada, pero la actividad puede existir igual (un enlace
    // que no se pudo guardar la vez anterior). Se busca ANTES de crear nada: el equipo no se
    // come una prospección duplicada por un enlace roto.
    const colgada = await actividadYaCreada(admin, agencyId, params.pid)
    if (colgada) {
      const { error: eReparar } = await enlazar(admin, params.pid, colgada)
      if (eReparar) console.error("Farming (reparar enlace a Tracking):", eReparar)
      return NextResponse.json({ error: YA_ESTA, tracking_log_id: colgada }, { status: 409 })
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
      // El farming puerta a puerta se hace a la tardecita, que es cuando la gente está en la
      // casa. Con la fecha en UTC, todo lo que se aprieta después de las 21 quedaba fechado al
      // día siguiente. Va la hora de Buenos Aires, igual que farming_contactos.fecha.
      fecha_actividad: new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }),
      // `nombre_cliente` es la única columna propia donde el nombre se ve en una pantalla: el
      // feed de actividad del dashboard (components/dashboard-activity.tsx) la lee directo. La
      // lista de Tracking arma el nombre por join a `leads`/`wa_contacts`, que esto no crea:
      // ahí la fila se reconoce por `propiedad_ref`.
      nombre_cliente: propietario.nombre,
      // El teléfono no tiene columna propia en performance_logs: va en `metadata`, con el
      // origen y los ids de Farming para poder rastrear de vuelta cuál puerta generó esto.
      metadata: {
        origen: "farming",
        farming_direccion_id: params.id,
        farming_propietario_id: params.pid,
        nombre: propietario.nombre,
        telefono: propietario.telefono,
      },
    })

    const { count, error: eUpdate } = await enlazar(admin, params.pid, log.id)

    if (eUpdate) {
      // La actividad YA se creó del lado de Tracking: contestar como si hubiera fallado
      // invitaría al asesor a apretar de nuevo y duplicarla. Un aviso, no un error. Y si
      // aprieta igual, la búsqueda de arriba la encuentra y repara el enlace.
      console.error("Farming (enlazar propietario a Tracking):", eUpdate)
      return NextResponse.json({
        tracking_log_id: log.id,
        aviso: "La actividad ya se creó en tu pipeline, pero no pudimos guardar el enlace en esta tarjeta.",
      })
    }

    // Cero filas tocadas = otro apretón enlazó a esta persona mientras esta actividad se
    // creaba. La nuestra sobra: se borra, para que el Tracking del equipo no quede inflado.
    // `count === 0` estricto a propósito: un `count` nulo (que el cliente no contó) no puede
    // terminar borrando una actividad buena.
    if (count === 0) {
      const { error: eBorrar } = await admin
        .from("performance_logs")
        .delete()
        .eq("id", log.id)
        .eq("agency_id", agencyId)
      const { data: actual } = await admin
        .from("farming_propietarios")
        .select("tracking_log_id")
        .eq("id", params.pid)
        .maybeSingle()
      const ganador = (actual as any)?.tracking_log_id ?? null
      if (eBorrar) {
        // No se le dice al asesor lo contrario de lo que pasó: quedó una actividad de más.
        console.error("Farming (borrar actividad duplicada de Tracking):", eBorrar)
        return NextResponse.json(
          {
            error: `${YA_ESTA}. Quedó una actividad repetida en Tracking que no pudimos borrar: borrala desde ahí.`,
            tracking_log_id: ganador,
          },
          { status: 409 },
        )
      }
      return NextResponse.json({ error: YA_ESTA, tracking_log_id: ganador }, { status: 409 })
    }

    return NextResponse.json({ tracking_log_id: log.id })
  } catch (e) {
    return responderError(e, "pasar propietario a Tracking")
  }
}
