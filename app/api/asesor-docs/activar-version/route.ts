import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { requireTenant } from "@/lib/auth/tenant-validation"
import { separarPorEstado, type FilaAsesor } from "@/lib/asesor-docs/propuesta"
import { faltanAsesoresParaActivar } from "@/lib/asesor-docs/generar"
import { estadoDeLaPlantilla, type ResultadoDeAsesor } from "@/lib/asesor-docs/confirmacion"

/**
 * Poner en uso una versión de la plantilla (spec §7.4.4).
 *
 * Escribe UNA columna: `advisor_doc_templates.version_actual`. Y **se niega si
 * queda algún asesor ACTIVO que no esté ya en esa versión.**
 *
 * ═══ Por qué esa negativa no se puede negociar ═══
 *
 * Es el hermano de la regla de la §7.3 —"una plantilla con un solo asesor en
 * rojo no pasa a `activa`"— y existe por lo mismo: **la versión vigente es lo
 * que la solapa lee para decir qué está en uso**. `armarFilas` cuenta como
 * "sin comparar" a todo el que tenga un `version_id` distinto del vigente, y
 * `explicacionDelEstado` escribe encima de eso.
 *
 * Si esta columna se pudiera mover con gente atrás, la pantalla diría que todos
 * están en la versión nueva mientras el contrato de esas personas sigue siendo
 * el viejo. No sería un error visible: sería una fila perfectamente redactada y
 * completamente falsa.
 *
 * Los pausados y desvinculados NO cuentan (spec §7.5): sus documentos no se
 * regeneran ni se tocan, así que exigirles estar en la versión nueva dejaría la
 * plantilla trabada para siempre. Se los dice igual, como advertencia, porque
 * el día que vuelvan su contrato va a ser el de la versión vieja.
 *
 * ═══ Y el `estado`, que sale de la MISMA regla, no de una copia ═══
 *
 * Este endpoint también escribe `advisor_doc_templates.estado`, y tiene que
 * hacerlo: la solapa lee esa columna para decir "Está en uso". Una plantilla
 * con la versión nueva aplicada a todos y el cartel diciendo "Borrador" es la
 * pantalla mintiendo, que es justo lo que esta etapa viene cerrando.
 *
 * Pero **la condición de publicación no se escribe de nuevo acá**. Sale de
 * `estadoDeLaPlantilla`, la misma función que usa `confirmar-plantilla`, que a
 * su vez se apoya en `laPlantillaSePublica`. Dos lugares decidiendo lo mismo
 * con reglas distintas es cómo se llega a que la pantalla mienta por el otro
 * lado, y acá los literales `"activa"` y `"borrador"` **no aparecen**: hay un
 * test estructural que lee este archivo y falla si alguien los escribe.
 *
 * Lo que se traduce, y cómo:
 *
 *  · un asesor activo con `estado: 'ok'` sobre la versión que se activa → `ok`;
 *  · cualquier otra cosa —`revisar`, `pendiente`, `null`— → `revisar`, que es
 *    lo que `laPlantillaSePublica` entiende por "esto lo tiene que mirar
 *    alguien". No hay pérdida de información: para cuando se llega acá, todos
 *    los activos ya están en la versión nueva, así que el único que puede
 *    quedar en `revisar` es uno que la confirmación de la §7.3 marcó así.
 *  · `huecosNoColocados: []` porque acá no hay molde a la vista; los huecos que
 *    no entraron los frena la §7.2, antes de que exista esta versión.
 */

export const dynamic = "force-dynamic"

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: Request) {
  let agencyId: string
  let role: string | null
  try {
    const tenant = await requireTenant()
    agencyId = tenant.agencyId
    role = tenant.role
  } catch {
    return NextResponse.json({ error: "No estás autenticado" }, { status: 401 })
  }

  if (role !== "director") {
    return NextResponse.json({ error: "Solo el director puede poner en uso una versión" }, { status: 403 })
  }

  let cuerpo: unknown
  try {
    cuerpo = await req.json()
  } catch {
    return NextResponse.json({ error: "El pedido no tiene cuerpo válido" }, { status: 400 })
  }

  const { templateId, versionId } = (cuerpo ?? {}) as Record<string, unknown>
  if (typeof templateId !== "string" || !ES_UUID.test(templateId)) {
    return NextResponse.json({ error: "Falta el tipo de documento" }, { status: 400 })
  }
  if (typeof versionId !== "string" || !ES_UUID.test(versionId)) {
    return NextResponse.json({ error: "Falta decir qué versión poner en uso" }, { status: 400 })
  }

  const supabase = createClient()

  const { data: tipo, error: errTipo } = await supabase
    .from("advisor_doc_templates")
    .select("id, nombre, version_actual")
    .eq("id", templateId)
    .eq("agency_id", agencyId)
    .maybeSingle()

  if (errTipo) {
    console.error("activar-version: no se pudo leer el tipo de documento:", errTipo.message)
    return NextResponse.json({ error: "No se pudo leer el tipo de documento" }, { status: 500 })
  }
  if (!tipo) {
    return NextResponse.json({ error: "Ese tipo de documento no existe en tu inmobiliaria" }, { status: 404 })
  }

  const { data: version, error: errVersion } = await supabase
    .from("advisor_doc_template_versions")
    .select("id, version")
    .eq("id", versionId)
    /** La clave foránea garantiza que la versión exista, no que sea de ESTA plantilla. */
    .eq("template_id", templateId)
    .eq("agency_id", agencyId)
    .maybeSingle()

  if (errVersion) {
    console.error("activar-version: no se pudo leer la versión:", errVersion.message)
    return NextResponse.json({ error: "No se pudo leer la versión de la plantilla" }, { status: 500 })
  }
  if (!version) {
    return NextResponse.json({ error: "Esa versión no existe en este tipo de documento" }, { status: 404 })
  }

  // ── Quiénes tienen este documento, y en qué versión están ────────────────
  const { data: documentos, error: errDocs } = await supabase
    .from("advisor_documents")
    .select("advisor_id, version_id, estado")
    .eq("template_id", templateId)
    .eq("agency_id", agencyId)
    .order("created_at", { ascending: true })
    .order("advisor_id", { ascending: true })

  if (errDocs) {
    console.error("activar-version: no se pudieron leer los documentos:", errDocs.message)
    return NextResponse.json({ error: "No se pudieron leer los documentos" }, { status: 500 })
  }

  const filas = documentos ?? []

  const { data: perfiles, error: errPerfiles } = await supabase
    .from("profiles")
    .select("id, estado, full_name")
    .in(
      "id",
      filas.map((f) => f.advisor_id),
    )
    .eq("agency_id", agencyId)

  if (errPerfiles) {
    console.error("activar-version: no se pudieron leer los asesores:", errPerfiles.message)
    return NextResponse.json({ error: "No se pudieron leer los asesores" }, { status: 500 })
  }

  const porId = new Map<string, { estado: string | null; full_name: string | null }>()
  for (const p of perfiles ?? []) porId.set(p.id, { estado: p.estado ?? null, full_name: p.full_name ?? null })

  /**
   * Al que no aparece en `profiles` se lo trata como ACTIVO, no como afuera.
   *
   * Es lo conservador: dar por pausado a alguien que no se pudo leer lo dejaría
   * fuera de la cuenta y permitiría activar con él atrás. La comprobación tiene
   * que fallar hacia "todavía no", nunca hacia "dale".
   */
  const candidatas: FilaAsesor[] = filas.map((f) => ({
    advisorId: f.advisor_id,
    estado: porId.get(f.advisor_id)?.estado ?? "activo",
    nombre: porId.get(f.advisor_id)?.full_name ?? null,
  }))

  const { dentro, advertencias } = separarPorEstado(candidatas)
  const activos = new Set(dentro.map((a) => a.advisorId))

  /** El nombre de una PERSONA. Nunca un nombre de archivo. */
  const nombreDe = (advisorId: string) => porId.get(advisorId)?.full_name?.trim() || "un asesor sin nombre cargado"

  const atrasados = filas.filter((f) => activos.has(f.advisor_id) && f.version_id !== versionId)

  /**
   * LA REGLA QUE NO SE PUEDE ROMPER. No se escribe el `version_actual` acá
   * arriba a propósito: quien decide es `faltanAsesoresParaActivar`, que está
   * bajo test, y este endpoint tiene el suyo por si alguien igual la saltea.
   */
  const motivo = faltanAsesoresParaActivar(atrasados.map((f) => nombreDe(f.advisor_id)))
  if (motivo) {
    return NextResponse.json({ error: motivo, faltan: atrasados.map((f) => f.advisor_id), advertencias }, { status: 409 })
  }

  /**
   * Los activos, traducidos a la forma que entiende la regla de publicación.
   * Ver el comentario de arriba: la condición vive en un solo lugar.
   */
  const resultados: ResultadoDeAsesor[] = filas
    .filter((f) => activos.has(f.advisor_id))
    .map((f) => ({
      advisorId: f.advisor_id,
      nombre: nombreDe(f.advisor_id),
      estado: f.estado === "ok" ? "ok" : "revisar",
      observacion: null,
    }))

  const estado = estadoDeLaPlantilla({ resultados, huecosNoColocados: [] })

  const { data: tocadas, error: errUpdate } = await supabase
    .from("advisor_doc_templates")
    .update({ version_actual: versionId, estado, updated_at: new Date().toISOString() })
    .eq("id", templateId)
    .eq("agency_id", agencyId)
    /**
     * El `.select()` no es para leer: es la única forma de saber si la escritura
     * tocó alguna fila. En PostgREST un `.eq` que no matchea devuelve éxito con
     * cero filas, así que sin esto "no se escribió nada" se lee igual que "se
     * escribió bien" — y el director se iría creyendo que la versión quedó en
     * uso.
     */
    .select("id")

  if (errUpdate || (tocadas?.length ?? 0) === 0) {
    console.error(
      "activar-version: no se pudo poner en uso la versión:",
      errUpdate ? errUpdate.message : "cero filas afectadas",
    )
    return NextResponse.json(
      { error: "No se pudo poner en uso esa versión. Actualizá la lista, fijate cómo quedó y probá de nuevo." },
      { status: 500 },
    )
  }

  return NextResponse.json({
    templateId,
    versionId,
    version: version.version,
    estado,
    advertencias,
    resumen: `La versión ${version.version} de "${tipo.nombre}" quedó en uso.`,
  })
}
