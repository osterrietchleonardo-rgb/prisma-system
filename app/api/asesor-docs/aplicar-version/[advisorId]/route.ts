import { NextResponse } from "next/server"
import PizZip from "pizzip"

import { createClient } from "@/lib/supabase/server"
import { requireTenant } from "@/lib/auth/tenant-validation"
import { huecosDe, huecosMalEscritos, rellenarDocx, textoPorParte } from "@/lib/plantillas/docx"
import { separarPorEstado } from "@/lib/asesor-docs/propuesta"
import { rutaDelDocumentoGenerado } from "@/lib/asesor-docs/reglas"
import {
  contarHuecosDelMolde,
  frenosDeLaGeneracion,
  huecosSinDato,
  observacionDePendiente,
  resumenDeLaGeneracion,
  valoresExclusivosDeOtros,
  type OtroAsesor,
  type ValorAjeno,
} from "@/lib/asesor-docs/generar"
import {
  camposQueParecenTextoFijo,
  ubicarValoresEnPartes,
  type AsesorParaContrastar,
} from "@/lib/asesor-docs/version-nueva"

/**
 * Aplicarle una versión de la plantilla a UN asesor (spec §7.4.4 y §7.5).
 *
 * **Es la primera vez que PRISMA genera el documento de una persona.** Todo lo
 * anterior de esta etapa leía, comparaba y avisaba; esto escribe. Un contrato
 * mal generado no lo descubre un test: lo descubre el asesor el día que lo
 * firma.
 *
 * ═══ De a UNO, y eso es el diseño ═══
 *
 * El spec §7.5 es explícito: el reemplazo no va en un solo pedido. De a un
 * asesor por vez, para que uno que falla no voltee a los otros y para que la
 * pantalla pueda mostrar progreso real, fila por fila.
 *
 * Hace, en orden:
 *
 *  1. Autoriza: director, y de SU agencia. El `agency_id` sale de la sesión del
 *     servidor y va como `.eq()` en cada consulta, además del RLS.
 *  2. Comprueba que ese asesor esté ACTIVO. Pausados y desvinculados quedan
 *     afuera por spec §7.5 y sus documentos **no se tocan ni se regeneran**.
 *  3. Baja el molde de la versión pedida y trae el `form_data` de esa persona.
 *  4. Si a esa persona le falta un dato que la versión nueva trajo, queda
 *     `pendiente` **con la versión anterior** (spec §7.4.2).
 *  5. Genera su `.docx` en memoria y le pasa **LA RED** —las cuatro
 *     comprobaciones de `lib/asesor-docs/generar.ts`— ANTES de escribir nada.
 *  6. Recién si la red pasa: sube el archivo y escribe la fila con la versión
 *     nueva, `estado: 'ok'`, `observacion: null` y `docx_path`.
 *
 * ═══ Lo que NO hace, y no es una simplificación ═══
 *
 *  · **No toca `advisor_doc_templates.version_actual`.** Eso lo hace
 *    `activar-version`, que se niega mientras quede un asesor activo fuera de
 *    la versión nueva. Moverlo acá, de a un asesor, dejaría a la solapa
 *    diciendo "está en uso" con la mitad de la gente atrás.
 *  · **No toca `archivo_original_path`, nunca, por ningún camino.** Es el
 *    `.docx` que subió el director y la única fuente de verdad contra la que
 *    compara toda la verificación de esta etapa. Si el generado lo pisara, la
 *    próxima comprobación compararía la plantilla contra un archivo que salió
 *    de la plantilla misma: daría verde siempre, contra cualquier error. Hay un
 *    test estructural que lee este archivo y falla si aparece un
 *    `archivo_original_path` adentro de un `update`.
 *  · **Si la red no pasa, no se escribe NADA de ese asesor.** Ni a medias, ni
 *    "escribo y aviso": queda como estaba, con su versión vieja, y la respuesta
 *    dice qué pasó en castellano.
 */

export const dynamic = "force-dynamic"

/**
 * Bajar el molde y el original del asesor, hasta tres documentos más para la
 * cuenta cruzada, rellenar, y sacarle el texto a cada resultado. El default de
 * 10 s no alcanza.
 */
export const maxDuration = 60

/** El mismo bucket que el resto de los documentos del asesor (spec §8.6). */
const BUCKET = "documents"

const TIPO_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Con cuántos asesores se contrasta como mucho en la cuenta cruzada.
 *
 * El mismo tope y el mismo motivo que en el endpoint de la subida: cada uno
 * cuesta una bajada de Storage y abrir un .docx, y esto corre dentro del mismo
 * presupuesto de 60 s. Lo que se busca es UN contraejemplo, no una estadística.
 *
 * A diferencia de allá, acá el tope se aplica **después** de saber que el molde
 * y el original se pudieron bajar: si el presupuesto se agota, no se pierde
 * nada porque todavía no se escribió nada. Es la deuda de la 7a mirada de
 * frente — acá no aplica, porque nada se destruye antes de contrastar.
 */
const TOPE_DE_CONTRASTES = 3

export async function POST(req: Request, { params }: { params: { advisorId: string } }) {
  let agencyId: string
  let role: string | null
  try {
    const tenant = await requireTenant()
    agencyId = tenant.agencyId
    role = tenant.role
  } catch {
    return NextResponse.json({ error: "No estás autenticado" }, { status: 401 })
  }

  /**
   * La plantilla es de la inmobiliaria entera: la versiona el director y nadie
   * más. El chequeo va acá aunque la política de RLS ya lo pida, porque una
   * defensa sola es una defensa que el día que se toque desaparece sin ruido.
   */
  if (role !== "director") {
    return NextResponse.json({ error: "Solo el director puede aplicar una versión" }, { status: 403 })
  }

  const advisorId = params.advisorId
  if (typeof advisorId !== "string" || !ES_UUID.test(advisorId)) {
    return NextResponse.json({ error: "Falta decir a qué asesor" }, { status: 400 })
  }

  let cuerpo: unknown
  try {
    cuerpo = await req.json()
  } catch {
    return NextResponse.json({ error: "El pedido no tiene cuerpo válido" }, { status: 400 })
  }

  /**
   * Del cliente llegan DOS datos —qué plantilla y qué versión— y **ninguno es
   * de autoridad**: la inmobiliaria y el rol salen de la sesión, y los dos ids
   * se comprueban contra la base filtrando por `agency_id`.
   */
  const { templateId, versionId } = (cuerpo ?? {}) as Record<string, unknown>
  if (typeof templateId !== "string" || !ES_UUID.test(templateId)) {
    return NextResponse.json({ error: "Falta el tipo de documento" }, { status: 400 })
  }
  if (typeof versionId !== "string" || !ES_UUID.test(versionId)) {
    return NextResponse.json({ error: "Falta decir qué versión aplicar" }, { status: 400 })
  }

  const supabase = createClient()

  // ── 1. Que la plantilla sea de SU inmobiliaria ──────────────────────────
  const { data: tipo, error: errTipo } = await supabase
    .from("advisor_doc_templates")
    .select("id, nombre")
    .eq("id", templateId)
    .eq("agency_id", agencyId)
    .maybeSingle()

  if (errTipo) {
    console.error("aplicar-version/[advisorId]: no se pudo leer el tipo:", errTipo.message)
    return NextResponse.json({ error: "No se pudo leer el tipo de documento" }, { status: 500 })
  }
  if (!tipo) {
    return NextResponse.json({ error: "Ese tipo de documento no existe en tu inmobiliaria" }, { status: 404 })
  }

  // ── La versión que se va a aplicar ──────────────────────────────────────
  const { data: version, error: errVersion } = await supabase
    .from("advisor_doc_template_versions")
    .select("id, version, docx_path")
    .eq("id", versionId)
    /**
     * El tercer filtro, y no sobra: la clave foránea garantiza que la versión
     * EXISTA, no que sea de ESTA plantilla. Sin esto, se le podría aplicar a un
     * asesor el molde de un tipo de documento distinto —el acuerdo de
     * confidencialidad en lugar del contrato— y nada lo delataría.
     */
    .eq("template_id", templateId)
    .eq("agency_id", agencyId)
    .maybeSingle()

  if (errVersion) {
    console.error("aplicar-version/[advisorId]: no se pudo leer la versión:", errVersion.message)
    return NextResponse.json({ error: "No se pudo leer la versión de la plantilla" }, { status: 500 })
  }
  if (!version) {
    return NextResponse.json({ error: "Esa versión no existe en este tipo de documento" }, { status: 404 })
  }

  // ── 2. Que el asesor esté ACTIVO (spec §7.5) ────────────────────────────
  const { data: perfil, error: errPerfil } = await supabase
    .from("profiles")
    .select("id, estado, full_name")
    .eq("id", advisorId)
    .eq("agency_id", agencyId)
    .maybeSingle()

  if (errPerfil) {
    console.error("aplicar-version/[advisorId]: no se pudo leer el asesor:", errPerfil.message)
    return NextResponse.json({ error: "No se pudo leer el asesor" }, { status: 500 })
  }
  if (!perfil) {
    return NextResponse.json({ error: "Ese asesor no está en tu inmobiliaria" }, { status: 404 })
  }

  /**
   * El nombre con el que se le habla al director: el de la PERSONA. Nunca cae a
   * un nombre de archivo — leer "No se le generó el documento a contrato-3.docx"
   * lo manda a buscar un archivo cuando el problema es de alguien.
   */
  const nombre = perfil.full_name?.trim() || "ese asesor"

  const { dentro, advertencias: avisosEstado } = separarPorEstado([
    { advisorId: perfil.id, estado: perfil.estado ?? null, nombre: perfil.full_name ?? null },
  ])
  if (dentro.length === 0) {
    /**
     * Y acá se termina, sin tocarle una fila. El spec §7.5 no dice solo que
     * queden "afuera del progreso": dice que sus documentos **no se regeneran
     * ni se tocan, quedan archivados como estaban**.
     */
    return NextResponse.json(
      {
        error:
          `A ${nombre} no se le puede aplicar la versión: está pausado o desvinculado, así que su documento queda ` +
          `archivado como está (spec §7.5). Reactivalo primero si querés incluirlo.`,
        advertencias: avisosEstado,
      },
      { status: 400 },
    )
  }

  // ── 3. Su documento, sus datos y su archivo original ────────────────────
  const { data: doc, error: errDoc } = await supabase
    .from("advisor_documents")
    .select("id, advisor_id, archivo_original_path, form_data, version_id")
    .eq("template_id", templateId)
    .eq("agency_id", agencyId)
    .eq("advisor_id", advisorId)
    .maybeSingle()

  if (errDoc) {
    console.error("aplicar-version/[advisorId]: no se pudo leer el documento:", errDoc.message)
    return NextResponse.json({ error: "No se pudo leer el documento de ese asesor" }, { status: 500 })
  }
  if (!doc) {
    return NextResponse.json(
      { error: `${nombre} no tiene cargado ningún documento de este tipo, así que no hay nada que regenerar.` },
      { status: 404 },
    )
  }

  const datos = (doc.form_data ?? null) as Record<string, string> | null

  // ── El molde de la versión ──────────────────────────────────────────────
  let zipMolde: PizZip
  let partesDelMolde: Record<string, string>
  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(version.docx_path)
    if (error || !data) throw error ?? new Error("archivo vacío")
    zipMolde = new PizZip(Buffer.from(await data.arrayBuffer()))
    partesDelMolde = textoPorParte(zipMolde)
  } catch (e) {
    console.error("aplicar-version/[advisorId]: no se pudo abrir el molde:", e)
    return NextResponse.json(
      { error: "No se pudo abrir el molde de esa versión. Volvé a subir el archivo de la versión y probá de nuevo." },
      { status: 500 },
    )
  }

  const huecosDelMolde = contarHuecosDelMolde(partesDelMolde)
  if (Object.keys(huecosDelMolde).length === 0) {
    /**
     * Un molde sin un solo hueco le daría a todos el mismo documento, con los
     * datos de la persona de la que salió pegados adentro. Frena, y frena antes
     * de generar nada.
     */
    return NextResponse.json(
      {
        error:
          "El molde de esa versión no tiene ni un campo adentro: le daría a todos el mismo documento. Volvé a " +
          "subir la versión.",
      },
      { status: 400 },
    )
  }

  // ── 4. El campo nuevo que esta persona no tiene (spec §7.4.2) ───────────
  const faltantes = huecosSinDato(huecosDelMolde, datos)
  if (faltantes.length > 0) {
    const observacion = observacionDePendiente(faltantes)
    /**
     * Se escribe SOLO el estado y el motivo. `version_id` **no se toca**: esa
     * persona sigue con la versión anterior, que es la verdad y lo que dice el
     * spec §7.4.2. Y `docx_path` tampoco: no hay documento nuevo que apuntar.
     */
    const { data: tocadas, error: errPendiente } = await supabase
      .from("advisor_documents")
      .update({ estado: "pendiente", observacion, updated_at: new Date().toISOString() })
      .eq("id", doc.id)
      .eq("agency_id", agencyId)
      /**
       * El `.select()` no es para leer: es la ÚNICA forma de saber si la
       * escritura tocó alguna fila. Un `.eq` que no matchea no es un error en
       * PostgREST —devuelve éxito con cero filas—, así que sin esto "no se
       * escribió nada" se lee exactamente igual que "se escribió bien". Es la
       * misma decisión de `confirmar-plantilla`.
       */
      .select("id")

    if (errPendiente || (tocadas?.length ?? 0) === 0) {
      console.error(
        "aplicar-version/[advisorId]: no se pudo marcar pendiente:",
        errPendiente?.message ?? "cero filas afectadas",
      )
      return NextResponse.json(
        { error: `A ${nombre} le falta un dato de la versión nueva, pero no se pudo dejar anotado. Probá de nuevo.` },
        { status: 500 },
      )
    }

    return NextResponse.json({
      advisorId,
      nombre,
      estado: "pendiente",
      camposQueFaltan: faltantes,
      mensaje: observacion,
      advertencias: avisosEstado,
    })
  }

  const datosCompletos = datos as Record<string, string>

  // ── Su archivo original: la única verdad de referencia que hay acá ──────
  /**
   * Se baja para poder descartar el ruido de la comprobación 2 (ver
   * `datosDeOtroQueSeColaron`): un texto que YA estaba en su documento viejo es
   * una frase del contrato, no un dato que se le coló ahora.
   *
   * Si no se puede abrir, **no se genera**. Una comprobación que no se pudo
   * correr no puede darse por pasada en silencio: eso es exactamente la forma
   * de falso verde que toda esta red vino a evitar.
   */
  let partesDeSuOriginal: Record<string, string>
  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(doc.archivo_original_path)
    if (error || !data) throw error ?? new Error("archivo vacío")
    partesDeSuOriginal = textoPorParte(new PizZip(Buffer.from(await data.arrayBuffer())))
  } catch (e) {
    console.error("aplicar-version/[advisorId]: no se pudo abrir el original:", e)
    return NextResponse.json(
      {
        error:
          `No se le generó el documento a ${nombre}: no se pudo abrir su documento original, que es contra lo ` +
          `único que se puede comprobar que no se le cuele el dato de otra persona. Revisá que su archivo sea un ` +
          `.docx de Word. Su documento no se tocó.`,
      },
      { status: 400 },
    )
  }

  // ── 5. Generar en memoria, y recién ahí LA RED ──────────────────────────
  let zipGenerado: PizZip
  try {
    zipGenerado = rellenarDocx(zipMolde, datosCompletos)
  } catch (e) {
    console.error("aplicar-version/[advisorId]: el molde no se puede rellenar:", e)
    return NextResponse.json(
      {
        error:
          `No se le generó el documento a ${nombre}: el molde de esta versión no se puede rellenar con sus datos. ` +
          `Volvé a subir la versión y mirá la vista previa antes de aplicarla. Su documento no se tocó.`,
      },
      { status: 400 },
    )
  }

  const partesDelGenerado = textoPorParte(zipGenerado)

  /**
   * Si esto falla, **no se genera**. Sin los datos de los otros no se pueden
   * correr dos de las cuatro comprobaciones, y una comprobación que no se pudo
   * correr no se puede dar por pasada: seguir igual sería escribir un contrato
   * con media red.
   */
  let exclusivosDeOtros: ValorAjeno[]
  let otrosParaContrastar: AsesorParaContrastar[]
  try {
    const otros = await loQueSabenLosOtros({
      supabase,
      templateId,
      agencyId,
      advisorId,
      propios: datosCompletos,
    })
    exclusivosDeOtros = otros.exclusivosDeOtros
    otrosParaContrastar = otros.otrosParaContrastar
  } catch (e) {
    console.error("aplicar-version/[advisorId]: no se pudo mirar a los otros asesores:", e)
    return NextResponse.json(
      {
        error:
          `No se le generó el documento a ${nombre}: no se pudieron leer los documentos de los demás asesores, y ` +
          `sin eso no se puede comprobar que no se le cuele el dato de otra persona. Probá de nuevo. Su documento ` +
          `no se tocó.`,
      },
      { status: 500 },
    )
  }

  /**
   * La cuenta cruzada se hace sobre el documento YA GENERADO de esta persona,
   * no sobre el archivo que subió el director. Es lo que la convierte en el
   * freno del caso "Palermo": si `{{ZONA}}` quedó dos veces en el molde, el
   * documento de Bruno dice su zona dos veces, y el documento de los otros
   * asesores tiene su dato una sola.
   */
  const sospechasDeTextoFijo = camposQueParecenTextoFijo({
    ubicaciones: ubicarValoresEnPartes(partesDelGenerado, datosCompletos).filter((u) => u.veces >= 2),
    partesDelNuevo: partesDelGenerado,
    otros: otrosParaContrastar,
  })

  const frenos = frenosDeLaGeneracion({
    nombre,
    huecosDelMolde,
    datos: datosCompletos,
    partesDelGenerado,
    partesDeSuOriginal,
    /**
     * Los dos, y no solo `huecosDe`.
     *
     * `huecosDe` lista los huecos BIEN escritos que quedaron sin rellenar. Lo
     * que parece un hueco y no lo es —un `{{ZONA-2}}` que se coló adentro del
     * dato guardado de esta persona— no lo ve, y saldría impreso literal en el
     * contrato. Ese caso es RUIDOSO (se ve en el papel), a diferencia del del
     * molde, que sale como un blanco y tiene su propia comprobación abajo.
     */
    huecosQueQuedaron: [...huecosDe(zipGenerado), ...huecosMalEscritos(partesDelGenerado)],
    /**
     * Y la quinta, que mira el MOLDE. Tiene que ser el molde: en el documento
     * generado ese hueco ya no está —docxtemplater lo dejó en blanco— así que
     * mirarlo ahí no encontraría nada. Está medido en `huecosMalEscritos`.
     */
    malEscritosEnElMolde: huecosMalEscritos(partesDelMolde),
    exclusivosDeOtros,
    sospechasDeTextoFijo,
  })

  if (frenos.length > 0) {
    /**
     * ═══ ACÁ NO SE ESCRIBE NADA, Y ESE ES TODO EL ASUNTO ═══
     *
     * Ni la fila, ni el archivo. Ese asesor queda exactamente como estaba, con
     * su versión vieja y su documento de siempre. Escribir "a medias" —subir el
     * archivo y no la fila, o marcarlo en rojo y seguir— dejaría en la base una
     * constancia de algo que no pasó.
     */
    return NextResponse.json(
      {
        error: frenos.map((f) => f.mensaje).join(" "),
        motivos: frenos,
        advertencias: avisosEstado,
      },
      { status: 409 },
    )
  }

  // ── 6. Recién ahora: el archivo y la fila ───────────────────────────────
  const docxPath = rutaDelDocumentoGenerado(agencyId, advisorId, doc.id, version.version)

  const { error: errSubida } = await supabase.storage
    .from(BUCKET)
    .upload(docxPath, zipGenerado.generate({ type: "nodebuffer" }), {
      contentType: TIPO_DOCX,
      /** Reintentar la misma aplicación escribe encima del mismo archivo, en vez de dejar un huérfano por intento. */
      upsert: true,
    })

  if (errSubida) {
    console.error("aplicar-version/[advisorId]: no se pudo subir el documento:", errSubida.message)
    return NextResponse.json(
      { error: `No se pudo guardar el documento de ${nombre}. Su documento no se tocó: probá de nuevo.` },
      { status: 500 },
    )
  }

  const { data: tocadas, error: errUpdate } = await supabase
    .from("advisor_documents")
    .update({
      version_id: version.id,
      estado: "ok",
      observacion: null,
      docx_path: docxPath,
      updated_at: new Date().toISOString(),
    })
    .eq("id", doc.id)
    .eq("agency_id", agencyId)
    /**
     * El tercer filtro, y el mismo de `confirmar-plantilla`: todo lo de arriba
     * —la red, la comparación contra su original— habla de ESE archivo. Si
     * mientras tanto el director le reemplazó el .docx, el reemplazo dejó las
     * cuatro columnas en null (`camposDelReemplazo`), que es la verdad: el
     * archivo nuevo no se comparó contra nada. Sin este `.eq`, este UPDATE se
     * las volvería a llenar con `ok` un segundo después.
     *
     * Y nótese que `archivo_original_path` está acá como FILTRO y en ningún
     * lugar como valor: este endpoint no lo escribe nunca.
     */
    .eq("archivo_original_path", doc.archivo_original_path)
    .select("id")

  if (errUpdate || (tocadas?.length ?? 0) === 0) {
    console.error(
      "aplicar-version/[advisorId]: no se pudo guardar la fila:",
      errUpdate ? errUpdate.message : "cero filas afectadas (el archivo cambió durante la aplicación)",
    )
    /**
     * El archivo quedó subido y la fila no lo apunta. **No se lo borra**: el
     * único identificador que se tiene de él es la ruta, y esa ruta es
     * determinista por documento y versión — o sea que es la MISMA que apuntaría
     * una aplicación anterior que sí salió bien. Borrar acá le sacaría al asesor
     * un documento vivo por culpa de un intento fallido. Queda anotado en el log
     * y el próximo intento lo pisa.
     */
    return NextResponse.json(
      {
        error: errUpdate
          ? `El documento de ${nombre} se generó, pero no se pudo anotar en su ficha. Probá de nuevo.`
          : `El documento de ${nombre} se reemplazó justo mientras se aplicaba la versión, así que lo que se ` +
            `comprobó fue el archivo anterior. Volvé a detectar la plantilla para comprobar el nuevo.`,
      },
      { status: 500 },
    )
  }

  return NextResponse.json({
    advisorId,
    nombre,
    estado: "ok",
    versionId: version.id,
    version: version.version,
    docxPath,
    advertencias: avisosEstado,
    resumen: resumenDeLaGeneracion({ nombre, version: version.version }),
  })
}

/**
 * Lo que hace falta saber de los OTROS asesores para las comprobaciones 2 y 4.
 *
 *  · `exclusivosDeOtros`: los valores que son de una sola otra persona. Sale de
 *    la base sin bajar un solo archivo, así que se miran TODOS los asesores —
 *    incluidos los pausados y los desvinculados: sus datos siguen siendo datos
 *    de una persona real y no tienen por qué aparecer en el contrato de otra.
 *  · `otrosParaContrastar`: los que además tienen su `.docx` original abierto,
 *    para la cuenta cruzada. Eso sí cuesta una bajada por cabeza, y por eso va
 *    con tope.
 *
 * Se saltea en silencio al que no tenga datos cargados o cuyo archivo no se
 * pueda abrir **solo para la cuenta cruzada**: un asesor menos deja esa
 * comprobación más callada, nunca equivocada. La lista de valores exclusivos no
 * depende de ningún archivo, así que no se degrada.
 */
async function loQueSabenLosOtros(args: {
  supabase: ReturnType<typeof createClient>
  templateId: string
  agencyId: string
  advisorId: string
  propios: Record<string, string>
}) {
  const { data: docs, error } = await args.supabase
    .from("advisor_documents")
    .select("advisor_id, archivo_original_path, form_data")
    .eq("template_id", args.templateId)
    .eq("agency_id", args.agencyId)
    /** El mismo orden que usa `detectar-plantilla`, para que dos corridas iguales digan lo mismo. */
    .order("created_at", { ascending: true })
    .order("advisor_id", { ascending: true })

  if (error) {
    console.error("aplicar-version/[advisorId]: no se pudieron leer los otros documentos:", error.message)
    /**
     * Se propaga como excepción, no como lista vacía. Una lista vacía apagaría
     * en silencio dos de las cuatro comprobaciones y el documento se escribiría
     * igual: es la forma exacta de falso verde que esta red vino a evitar.
     */
    throw new Error("no se pudieron leer los otros documentos")
  }

  const candidatos = (docs ?? [])
    .filter((d) => d.advisor_id !== args.advisorId)
    .filter((d) => d.form_data && typeof d.form_data === "object" && Object.keys(d.form_data).length > 0)

  const { data: perfiles } = await args.supabase
    .from("profiles")
    .select("id, full_name")
    .in(
      "id",
      candidatos.map((d) => d.advisor_id),
    )
    .eq("agency_id", args.agencyId)

  const nombrePorId = new Map<string, string>()
  for (const p of perfiles ?? []) if (p.full_name?.trim()) nombrePorId.set(p.id, p.full_name.trim())
  /** El nombre de una PERSONA, siempre. Nunca un nombre de archivo. */
  const nombreDe = (id: string) => nombrePorId.get(id) ?? "otro asesor"

  const otros: OtroAsesor[] = candidatos.map((d) => ({
    advisorId: d.advisor_id,
    nombre: nombreDe(d.advisor_id),
    valores: d.form_data as Record<string, string>,
  }))

  const otrosParaContrastar: AsesorParaContrastar[] = []
  for (const d of candidatos.slice(0, TOPE_DE_CONTRASTES)) {
    try {
      const { data, error: errBajada } = await args.supabase.storage.from(BUCKET).download(d.archivo_original_path)
      if (errBajada || !data) continue
      otrosParaContrastar.push({
        nombre: nombreDe(d.advisor_id),
        valores: d.form_data as Record<string, string>,
        partes: textoPorParte(new PizZip(Buffer.from(await data.arrayBuffer()))),
      })
    } catch (e) {
      console.error(`aplicar-version/[advisorId]: no se pudo leer ${d.archivo_original_path} para contrastar:`, e)
    }
  }

  return { exclusivosDeOtros: valoresExclusivosDeOtros(otros, args.propios), otrosParaContrastar }
}
