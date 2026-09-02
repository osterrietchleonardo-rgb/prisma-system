import { NextResponse } from "next/server"
import PizZip from "pizzip"

import { createClient } from "@/lib/supabase/server"
import { requireTenant } from "@/lib/auth/tenant-validation"
import { huecosDe, ponerHuecosEnDocx, rellenarDocx, textoPorParte } from "@/lib/plantillas/docx"
import { separarPorEstado, type FilaAsesor } from "@/lib/asesor-docs/propuesta"
import {
  avisoDeNotasAlFinal,
  camposConDatoCorto,
  camposQueChocanConOtroNombre,
  camposSchema,
  estadoDeLaPlantilla,
  formDataDe,
  leerPropuestaConfirmada,
  moldeInservible,
  reemplazosDelMolde,
  resumenDeLaConfirmacion,
  type ResultadoDeAsesor,
} from "@/lib/asesor-docs/confirmacion"
import { LIMITE_DE_LA_COMPROBACION } from "@/lib/asesor-docs/plantillas"
import { verificarDocumentoEntero } from "@/lib/asesor-docs/verificacion"

/**
 * Confirmar la plantilla: el ÚNICO lugar de esta etapa que escribe (spec §7.2).
 *
 * Hasta acá no se guardó nada: `detectar-plantilla` compara y devuelve una
 * propuesta, el director la revisa en pantalla, y recién este endpoint la
 * convierte en algo que existe. Lo que se guarda acá es, al final del camino,
 * el contrato que una persona firma.
 *
 * Hace, en orden:
 *  1. Toma el .docx de uno de los asesores como MOLDE y le mete los `{{huecos}}`.
 *  2. Crea la versión (número, esquema de campos) y sube el molde a Storage.
 *  3. Le guarda a cada asesor su `form_data`.
 *  4. **La verificación (spec §7.3):** rellena la plantilla con los datos de
 *     cada asesor, le saca el texto y lo compara contra el texto de su archivo
 *     original. Idénticos → `ok`. Distintos → `revisar` con la observación.
 *  5. Devuelve el resumen: cuántos quedaron bien y cuáles en rojo, con el motivo.
 *
 * **La regla que no se puede romper:** si aunque sea UN asesor queda en rojo,
 * la versión se guarda pero la plantilla NO pasa a `activa`: se queda en
 * `borrador`, y el director ve exactamente quién falló y por qué.
 *
 * Y la de seguridad: **el `agency_id` y el rol salen de la sesión del
 * servidor, nunca del cliente.** Del cuerpo del pedido llega qué plantilla, con
 * qué asesor de molde y qué campos; todo eso se comprueba después contra la
 * base con el `agency_id` de la sesión. El 27-ago-2026 se cerró en producción
 * un agujero por confiar en un dato de autoridad que venía del navegador.
 */

export const dynamic = "force-dynamic"

/**
 * Bajar N documentos de Word, armar el molde, rellenarlo N veces y sacarle el
 * texto a cada resultado. Con 3 asesores son segundos; el default de 10 s no
 * alcanza igual.
 */
export const maxDuration = 60

/** El mismo bucket que el resto de los documentos del asesor (spec §8.6). */
const BUCKET = "documents"

/** Dónde vive el molde de cada versión (spec §8.6). */
const rutaDelMolde = (agencyId: string, templateId: string, version: number) =>
  `asesores/${agencyId}/_plantillas/${templateId}/v${version}.docx`

type FilaDocumento = {
  id: string
  advisor_id: string
  archivo_original_path: string
  nombre_archivo: string
}

export async function POST(req: Request) {
  let agencyId: string
  let userId: string
  let role: string | null
  try {
    const tenant = await requireTenant()
    agencyId = tenant.agencyId
    userId = tenant.userId
    role = tenant.role
  } catch {
    return NextResponse.json({ error: "No estás autenticado" }, { status: 401 })
  }

  /**
   * La plantilla es de la inmobiliaria entera: la confirma el director y nadie
   * más. El chequeo va acá aunque la política de RLS ya lo pida, porque una
   * defensa sola es una defensa que el día que se toque desaparece sin ruido.
   */
  if (role !== "director") {
    return NextResponse.json({ error: "Solo el director puede confirmar la plantilla" }, { status: 403 })
  }

  let cuerpo: unknown
  try {
    cuerpo = await req.json()
  } catch {
    return NextResponse.json({ error: "El pedido no tiene cuerpo válido" }, { status: 400 })
  }

  const leido = leerPropuestaConfirmada(cuerpo)
  if (!leido.ok) return NextResponse.json({ error: leido.error }, { status: 400 })

  const { propuesta } = leido
  const advertencias: string[] = [...leido.advertencias]

  const supabase = createClient()

  // ── Que la plantilla sea de SU inmobiliaria ──────────────────────────────
  const { data: tipo, error: errTipo } = await supabase
    .from("advisor_doc_templates")
    .select("id, nombre")
    .eq("id", propuesta.templateId)
    .eq("agency_id", agencyId)
    .maybeSingle()

  if (errTipo) {
    console.error("confirmar-plantilla: no se pudo leer el tipo de documento:", errTipo.message)
    return NextResponse.json({ error: "No se pudo leer el tipo de documento" }, { status: 500 })
  }
  if (!tipo) {
    return NextResponse.json({ error: "Ese tipo de documento no existe en tu inmobiliaria" }, { status: 404 })
  }

  // ── Los documentos de ese tipo, con el filtro de agencia de la sesión ────
  const { data: documentos, error: errDocs } = await supabase
    .from("advisor_documents")
    .select("id, advisor_id, archivo_original_path, nombre_archivo")
    .eq("template_id", propuesta.templateId)
    .eq("agency_id", agencyId)
    .order("created_at", { ascending: true })
    .order("advisor_id", { ascending: true })

  if (errDocs) {
    console.error("confirmar-plantilla: no se pudieron leer los documentos:", errDocs.message)
    return NextResponse.json({ error: "No se pudieron leer los documentos" }, { status: 500 })
  }

  const filas = (documentos ?? []) as FilaDocumento[]
  if (filas.length === 0) {
    return NextResponse.json(
      { error: `Ya no queda ningún documento cargado en "${tipo.nombre}".` },
      { status: 400 },
    )
  }

  // ── Quiénes quedan afuera (spec §7.5: pausados y desvinculados) ──────────
  const { data: perfiles, error: errPerfiles } = await supabase
    .from("profiles")
    .select("id, estado, full_name")
    .in("id", filas.map((f) => f.advisor_id))
    .eq("agency_id", agencyId)

  if (errPerfiles) {
    console.error("confirmar-plantilla: no se pudieron leer los asesores:", errPerfiles.message)
    return NextResponse.json({ error: "No se pudieron leer los asesores" }, { status: 500 })
  }

  const porId = new Map<string, { estado: string | null; full_name: string | null }>()
  for (const p of perfiles ?? []) porId.set(p.id, { estado: p.estado ?? null, full_name: p.full_name ?? null })

  const candidatas: FilaAsesor[] = []
  const docPorAsesor = new Map<string, FilaDocumento>()
  for (const fila of filas) {
    const perfil = porId.get(fila.advisor_id)
    if (!perfil) {
      advertencias.push(
        `No se encontró al asesor del archivo "${fila.nombre_archivo}" en tu inmobiliaria: ese documento no se ` +
          `comprobó y no se tocó.`,
      )
      continue
    }
    /**
     * Un asesor con DOS documentos del mismo tipo.
     *
     * En producción no puede pasar: hay un índice único (advisor_id,
     * template_id). Pero el código no tenía defensa propia, y sin ella se
     * armaban 4 resultados para 3 personas, se verificaba dos veces el mismo
     * archivo y al otro se le escribía un estado sin haberlo mirado. Un índice
     * es una defensa de la base; esto es la del código, y cuesta una línea.
     */
    if (docPorAsesor.has(fila.advisor_id)) {
      advertencias.push(
        `${perfil.full_name?.trim() || "Un asesor"} tiene más de un documento de este tipo: se usa el primero y ` +
          `el resto no se tocó. Borrá los que sobren.`,
      )
      continue
    }

    candidatas.push({ advisorId: fila.advisor_id, estado: perfil.estado, nombre: perfil.full_name })
    docPorAsesor.set(fila.advisor_id, fila)
  }

  /**
   * Quiénes entran se decide ACÁ, contra la base, y no con lo que mandó la
   * pantalla. La pantalla puede decir cualquier cosa; y aunque no mintiera,
   * entre la detección y el confirmar alguien pudo subir otro documento. Un
   * asesor que aparece después queda en rojo por no tener datos, que es la
   * verdad, en vez de quedar invisible.
   */
  const { dentro, advertencias: avisosEstado } = separarPorEstado(candidatas)
  advertencias.push(...avisosEstado)

  if (dentro.length === 0) {
    return NextResponse.json(
      {
        error:
          `Ninguno de los documentos de "${tipo.nombre}" se puede usar: los asesores que los tienen están ` +
          `pausados o desvinculados.`,
        advertencias,
      },
      { status: 400 },
    )
  }

  const nombreDe = (advisorId: string) =>
    porId.get(advisorId)?.full_name?.trim() || docPorAsesor.get(advisorId)?.nombre_archivo || "Un asesor"

  // ── 1. El molde ─────────────────────────────────────────────────────────
  const docMolde = docPorAsesor.get(propuesta.moldeAdvisorId)
  if (!docMolde || !dentro.some((a) => a.advisorId === propuesta.moldeAdvisorId)) {
    return NextResponse.json(
      {
        error:
          "El documento que se iba a usar de molde ya no está disponible (se borró, o el asesor quedó pausado). " +
          "Volvé a detectar la plantilla.",
      },
      { status: 409 },
    )
  }

  let zipMolde: PizZip
  let puestos: number
  const noColocados: string[] = []
  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(docMolde.archivo_original_path)
    if (error || !data) throw error ?? new Error("archivo vacío")

    const original = new PizZip(Buffer.from(await data.arrayBuffer()))
    const { reemplazos, sinValorEnElMolde } = reemplazosDelMolde(propuesta.huecos, propuesta.moldeAdvisorId)
    noColocados.push(...sinValorEnElMolde)

    const r = ponerHuecosEnDocx(original, reemplazos)
    zipMolde = r.zip
    puestos = r.puestos.length
    advertencias.push(...r.advertencias)

    /**
     * Qué campo quedó sin su `{{HUECO}}` adentro del .docx.
     *
     * Se saca de `puestos` —lo que SÍ entró— y no de `faltantes`, aunque
     * `faltantes` parezca lo natural. Motivo: `faltantes` viene por texto
     * buscado, y dos campos distintos pueden pedir el mismo texto (dos datos
     * que casualmente coinciden en el documento molde). Ahí el primero entra,
     * el segundo no, y el texto aparece una sola vez en la lista: por texto no
     * se puede saber cuál de los dos fue. Los nombres de campo, en cambio, son
     * únicos —`nombresFinales` lo garantiza—, así que la resta es exacta.
     *
     * Se nombra por el campo y NO por el valor a propósito: al director le
     * sirve saber que "el CUIT no se pudo marcar"; ver el número de otra
     * persona, no.
     */
    const colocados = new Set(r.puestos.map((p) => p.hueco))
    for (const x of reemplazos) if (!colocados.has(x.hueco)) noColocados.push(x.nombre)
  } catch (e) {
    console.error("confirmar-plantilla: no se pudo armar el molde:", e)
    return NextResponse.json(
      {
        error:
          `No se pudo abrir el documento de ${nombreDe(propuesta.moldeAdvisorId)} para usarlo de molde. ` +
          `Revisá que sea un .docx de Word y volvé a intentar.`,
      },
      { status: 400 },
    )
  }

  if (noColocados.length > 0) {
    advertencias.push(
      `${noColocados.length === 1 ? "Este campo no se pudo" : "Estos campos no se pudieron"} marcar dentro del ` +
        `documento: ${[...new Set(noColocados)].join(", ")}. Casi siempre es porque Word guardó ese texto partido ` +
        `en pedazos, o porque el dato está en una nota al final. Hay que ponerlo a mano en el Word y volver a ` +
        `detectar.`,
    )
  }

  /**
   * Lo que `huecosDe` NO ve: un hueco escrito a mano a caballo de dos párrafos
   * no aparece en esta lista, aunque docxtemplater sí lo rellene. Por eso esto
   * es una advertencia y no un error: se informa la diferencia y decide el
   * director. Lo que de verdad manda es la verificación de más abajo.
   */
  const enElArchivo = new Set(huecosDe(zipMolde))
  const puestosPeroNoLeidos = propuesta.huecos.filter(
    (h) => !enElArchivo.has(h.nombre) && !noColocados.includes(h.nombre),
  )
  if (puestosPeroNoLeidos.length > 0) {
    advertencias.push(
      `${puestosPeroNoLeidos.map((h) => h.nombre).join(", ")}: se marcaron en el documento pero al releerlo no se ` +
        `los encuentra. Mirá con atención el resultado de la comprobación de abajo.`,
    )
  }

  const partesDelMolde = textoPorParte(zipMolde)

  /**
   * Las notas al final, dichas con nombre propio.
   *
   * El molde se lleva las del asesor molde al documento de todos —
   * docxtemplater no las rellena—, así que si ahí vive un dato de cada persona
   * el contrato de una sale con el número de otra. La comparación lo pone en
   * rojo; esto es para que el director sepa POR QUÉ antes de leer el rojo.
   */
  const avisoNotas = avisoDeNotasAlFinal(partesDelMolde["word/endnotes.xml"] ?? "")
  if (avisoNotas) advertencias.push(avisoNotas)

  const textoMolde = Object.values(partesDelMolde).join("")
  if (textoMolde.trim() === "") {
    return NextResponse.json(
      { error: "El molde quedó vacío: el documento del asesor no tiene texto que se pueda leer." },
      { status: 400 },
    )
  }

  /**
   * ¿El molde se puede rellenar? Se prueba UNA vez, en seco, ANTES de crear la
   * versión y de subir nada.
   *
   * No es una precaución de más: medido con tres contratos reales, un dato de
   * un solo carácter —el "1" de "1 de marzo"— se metió adentro de un campo ya
   * puesto y dejó `{{CAMPO_{{CAMPO_14}}}}`. docxtemplater no puede abrir un
   * documento así, y el molde entero deja de servir. Sin esta prueba, la
   * versión se guardaba igual, los N asesores salían en rojo con un mensaje
   * genérico, y el motivo real —un campo de dos letras -- no aparecía por
   * ningún lado.
   *
   * Se prueba con los datos del molde, no con un objeto vacío: es exactamente
   * lo que se va a hacer después, asesor por asesor.
   */
  const camposCortos = camposConDatoCorto(propuesta.huecos, propuesta.moldeAdvisorId)
  const choques = camposQueChocanConOtroNombre(propuesta.huecos, propuesta.moldeAdvisorId)
  try {
    rellenarDocx(zipMolde, formDataDe(propuesta.huecos, propuesta.moldeAdvisorId) ?? {})
  } catch (e) {
    console.error("confirmar-plantilla: el molde no se puede rellenar:", e)
    /**
     * Las advertencias viajan junto al error, y la pantalla las MUESTRA: acá es
     * donde más falta hacen, porque el director tiene que decidir qué campo
     * sacar y volver a intentar.
     */
    return NextResponse.json({ error: moldeInservible({ choques, camposCortos }), advertencias }, { status: 400 })
  }

  if (camposCortos.length > 0) {
    advertencias.push(
      `${camposCortos.length === 1 ? "El campo" : "Los campos"} ${camposCortos.join(", ")} ` +
        `${camposCortos.length === 1 ? "tiene un dato" : "tienen datos"} de muy pocas letras, así que se ` +
        `${camposCortos.length === 1 ? "reemplazó" : "reemplazaron"} en todos los lugares del contrato donde ` +
        `aparece ese texto, no solo donde corresponde. Si abajo hay asesores en rojo, mirá primero por acá.`,
    )
  }

  // ── 2. La versión ───────────────────────────────────────────────────────
  const { data: ultima, error: errUltima } = await supabase
    .from("advisor_doc_template_versions")
    .select("version")
    .eq("template_id", propuesta.templateId)
    .eq("agency_id", agencyId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (errUltima) {
    console.error("confirmar-plantilla: no se pudo leer la última versión:", errUltima.message)
    return NextResponse.json({ error: "No se pudo averiguar el número de versión" }, { status: 500 })
  }

  const version = (ultima?.version ?? 0) + 1
  const docxPath = rutaDelMolde(agencyId, propuesta.templateId, version)

  /**
   * La fila PRIMERO y el archivo después, a propósito: el índice único
   * `(template_id, version)` es lo único atómico que hay acá. Si dos
   * confirmaciones salen a la vez, la segunda choca contra el índice en vez de
   * pisarle el archivo a la primera. Si después falla la subida, se borra la
   * fila y no queda nada.
   */
  const { data: nuevaVersion, error: errVersion } = await supabase
    .from("advisor_doc_template_versions")
    .insert({
      template_id: propuesta.templateId,
      agency_id: agencyId,
      version,
      docx_path: docxPath,
      campos_schema: camposSchema(propuesta.huecos),
      origen: "detectada",
      created_by: userId,
    })
    .select("id, version")
    .single()

  if (errVersion || !nuevaVersion) {
    console.error("confirmar-plantilla: no se pudo crear la versión:", errVersion?.message)
    const chocaron = errVersion?.code === "23505"
    return NextResponse.json(
      {
        error: chocaron
          ? "Alguien más confirmó esta plantilla hace un segundo. Actualizá la lista y fijate cómo quedó."
          : "No se pudo crear la versión de la plantilla.",
      },
      { status: chocaron ? 409 : 500 },
    )
  }

  const { error: errSubida } = await supabase.storage
    .from(BUCKET)
    .upload(docxPath, zipMolde.generate({ type: "nodebuffer" }), {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      /**
       * `upsert: true` y no `false`: si quedó un archivo huérfano de un intento
       * anterior que falló DESPUÉS de subir, la fila de esa versión ya se
       * borró, así que nadie apunta a ese archivo y pisarlo no le saca nada a
       * nadie. Con `false`, ese huérfano dejaría la plantilla trabada para
       * siempre en el mismo número de versión.
       */
      upsert: true,
    })

  if (errSubida) {
    console.error("confirmar-plantilla: no se pudo subir el molde:", errSubida.message)
    // Sin archivo, la versión no sirve para nada: se la borra en vez de dejarla apuntando a la nada.
    await supabase.from("advisor_doc_template_versions").delete().eq("id", nuevaVersion.id).eq("agency_id", agencyId)
    return NextResponse.json({ error: "No se pudo guardar el molde de la plantilla." }, { status: 500 })
  }

  // ── 3 y 4. Los datos de cada asesor, y la verificación ───────────────────
  const resultados: ResultadoDeAsesor[] = []

  for (const asesor of dentro) {
    const doc = docPorAsesor.get(asesor.advisorId)!
    const quien = nombreDe(asesor.advisorId)
    const datos = formDataDe(propuesta.huecos, asesor.advisorId)

    let estado: "ok" | "revisar" = "revisar"
    let observacion: string | null = null

    if (datos === null) {
      observacion =
        "Este asesor no entró en la comparación, así que no tiene datos cargados. Su documento se dejó como " +
        "estaba: hay que completarle los campos a mano o volver a detectar la plantilla."
    } else {
      try {
        const { data, error } = await supabase.storage.from(BUCKET).download(doc.archivo_original_path)
        if (error || !data) throw error ?? new Error("archivo vacío")
        /**
         * TODAS las partes que el molde toca —cuerpo, encabezado, pie, notas al
         * pie y comentarios—, no solo el cuerpo. Comparar únicamente el cuerpo
         * dejaba pasar en VERDE un legajo de encabezado que salía con el número
         * de otra persona: la detección nunca lo ve (compara cuerpos), así que
         * no es campo, y el molde se lo lleva literal del asesor que hizo de
         * molde. Medido.
         */
        const original = textoPorParte(new PizZip(Buffer.from(await data.arrayBuffer())))

        const armado = rellenarDocx(zipMolde, datos)
        const v = verificarDocumentoEntero(original, textoPorParte(armado))
        estado = v.coincide ? "ok" : "revisar"
        observacion = v.observacion
      } catch (e) {
        console.error(`confirmar-plantilla: falló la comprobación de ${doc.archivo_original_path}:`, e)
        observacion =
          "No se pudo comprobar: el documento original no se pudo abrir o la plantilla no se pudo rellenar con " +
          "sus datos. Revisá que el archivo sea un .docx de Word."
      }
    }

    const { data: guardados, error: errUpdate } = await supabase
      .from("advisor_documents")
      .update({
        version_id: nuevaVersion.id,
        form_data: datos,
        estado,
        observacion,
        updated_at: new Date().toISOString(),
      })
      .eq("id", doc.id)
      .eq("agency_id", agencyId)
      /**
       * El tercer filtro, y el que impide la última vía a `activa`.
       *
       * `doc.archivo_original_path` se leyó al empezar el pedido; todo lo de
       * arriba —la bajada, la comparación, el veredicto— habla de ESE archivo.
       * Si mientras tanto el director le reemplaza el .docx a este asesor, el
       * reemplazo deja las cuatro columnas en null (`camposDelReemplazo`), que
       * es la verdad: el archivo nuevo no se comparó contra nada. Sin este
       * `.eq`, este UPDATE se las vuelve a llenar un segundo después con el
       * veredicto del archivo VIEJO — y si daba `ok`, la plantilla pasa a
       * `activa` con un documento que nadie miró nunca.
       *
       * Acotando por la ruta, la fila ya no matchea y no se escribe nada.
       */
      .eq("archivo_original_path", doc.archivo_original_path)
      /**
       * El `.select()` no es para leer: es la ÚNICA forma de saber si la
       * escritura tocó alguna fila. Un `.eq` que no matchea no es un error en
       * PostgREST — devuelve éxito con cero filas afectadas, y `error` viene
       * en null. Sin esto, "no se escribió nada" se lee exactamente igual que
       * "se escribió bien".
       */
      .select("id")

    const filasTocadas = guardados?.length ?? 0

    /**
     * Un guardado que falla NO puede terminar en verde: los datos de esa
     * persona no quedaron. Se la pasa a rojo en la respuesta aunque la
     * comprobación hubiera dado bien, y con eso la plantilla no se publica.
     *
     * "Falló" incluye las dos formas de no quedar guardado: que la base diga
     * que no, y que la base diga que sí sin tocar ninguna fila.
     */
    if (errUpdate || filasTocadas === 0) {
      console.error(
        `confirmar-plantilla: no se pudo guardar el documento ${doc.id}:`,
        errUpdate ? errUpdate.message : "cero filas afectadas (el archivo cambió durante la confirmación)",
      )
      estado = "revisar"
      observacion = errUpdate
        ? "La comprobación se hizo, pero no se pudieron guardar sus datos. Probá de nuevo."
        : "Su documento se reemplazó justo mientras se confirmaba la plantilla, así que lo que se comprobó fue el " +
          "archivo anterior. Volvé a detectar la plantilla para comprobar el nuevo."
    }

    resultados.push({ advisorId: asesor.advisorId, nombre: quien, estado, observacion })
  }

  // ── 5. Publicar, o no ───────────────────────────────────────────────────

  /**
   * Quiénes tienen un documento de este tipo y NO se comprobaron contra esta
   * versión: los pausados y desvinculados (spec §7.5), y cualquiera que se haya
   * caído en el camino.
   *
   * No frena la publicación —dejar que un solo asesor pausado congele la
   * plantilla para siempre sería peor— pero se dice, y con nombre. La
   * constancia en la base ya existe sin escribir nada: su `version_id` sigue
   * apuntando a otra versión (o a ninguna), y la solapa lo cuenta aparte por
   * eso. Lo que faltaba no era el dato: era que alguien lo leyera y lo dijera.
   */
  const comprobados = new Set(resultados.map((r) => r.advisorId))
  const sinComprobar = filas.filter((f) => !comprobados.has(f.advisor_id))
  if (sinComprobar.length > 0) {
    const quienes = sinComprobar.map((f) => nombreDe(f.advisor_id)).join(", ")
    advertencias.push(
      `${sinComprobar.length === 1 ? "Este asesor tiene" : "Estos asesores tienen"} un documento de este tipo y ` +
        `NO se comprobó contra esta versión: ${quienes}. Su documento quedó como estaba. Cuando ` +
        `${sinComprobar.length === 1 ? "vuelva a estar activo" : "vuelvan a estar activos"}, volvé a detectar la ` +
        `plantilla para incluir${sinComprobar.length === 1 ? "lo" : "los"}.`,
    )
  }

  const huecosNoColocados = [...new Set(noColocados)]
  /**
   * LA REGLA QUE NO SE PUEDE ROMPER, y el único lugar donde de verdad se
   * aplica. No se escribe `"activa"` ni `"borrador"` acá a propósito: un
   * literal suelto en el cableado se puede dar vuelta sin que ninguna función
   * pura se entere. La decide `estadoDeLaPlantilla`, que está bajo test, y
   * este endpoint tiene el suyo (`route.test.ts`) por si alguien igual la
   * saltea.
   */
  const estado = estadoDeLaPlantilla({ resultados, huecosNoColocados })

  const { error: errTipoUpdate } = await supabase
    .from("advisor_doc_templates")
    .update({
      version_actual: nuevaVersion.id,
      estado,
      updated_at: new Date().toISOString(),
    })
    .eq("id", propuesta.templateId)
    .eq("agency_id", agencyId)

  if (errTipoUpdate) {
    console.error("confirmar-plantilla: no se pudo actualizar el tipo:", errTipoUpdate.message)
    advertencias.push(
      "La versión y los datos de cada asesor se guardaron, pero la plantilla no se pudo marcar. Actualizá la " +
        "lista para ver cómo quedó.",
    )
  }

  advertencias.push(LIMITE_DE_LA_COMPROBACION)

  return NextResponse.json({
    versionId: nuevaVersion.id,
    version: nuevaVersion.version,
    estado,
    camposPuestos: puestos,
    huecosNoColocados,
    resultados,
    advertencias,
    sinComprobar: sinComprobar.map((f) => nombreDe(f.advisor_id)),
    resumen: resumenDeLaConfirmacion({
      resultados,
      huecosNoColocados,
      version: nuevaVersion.version,
      sinComprobar: sinComprobar.length,
    }),
  })
}
