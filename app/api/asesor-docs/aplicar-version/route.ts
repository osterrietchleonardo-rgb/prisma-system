import { NextResponse } from "next/server"
import PizZip from "pizzip"

import { createClient } from "@/lib/supabase/server"
import { requireTenant } from "@/lib/auth/tenant-validation"
import { huecosDe, ponerHuecosEnDocx, rellenarDocx, textoPorParte } from "@/lib/plantillas/docx"
import { separarPorEstado } from "@/lib/asesor-docs/propuesta"
import {
  avisoDeNotasAlFinal,
  camposConDatoCorto,
  camposQueChocanConOtroNombre,
  comoQuedaEnElDocumento,
  moldeInservible,
  type HuecoParaGuardar,
} from "@/lib/asesor-docs/confirmacion"
import { verificarDocumentoEntero } from "@/lib/asesor-docs/verificacion"
import {
  avisoDeCamposConElMismoDato,
  avisoDeCamposDesaparecidos,
  avisoDeCamposNuevos,
  avisoDeCamposSinDato,
  avisoDeDatosQueSePasan,
  avisoDeValoresRepetidos,
  camposConElMismoDato,
  camposSchemaDeLaVersionNueva,
  camposSinDato,
  compararCampos,
  moldeNoSeReconoce,
  nombresDelSchema,
  reemplazosDeLaVersionNueva,
  resumenDeLaVersionNueva,
  seVaAUsar,
  SIN_DATOS_DEL_ASESOR,
  SIN_VERSION_VIGENTE,
  textoDeVistaPrevia,
  ubicarValoresEnPartes,
  valoresQueSobrevivenEnElMolde,
  avisoDeValoresQueSobreviven,
} from "@/lib/asesor-docs/version-nueva"

/**
 * Subir una versión NUEVA de la plantilla (spec §7.4), primera mitad.
 *
 * Es la función que Leonardo pidió desde el principio: cambiar la versión de un
 * documento **sin volver a subirlo asesor por asesor**. Esta mitad LEE la
 * versión nueva y dice qué cambia; la otra la aplica.
 *
 * **Este endpoint NO aplica nada, y eso es parte del diseño, no una
 * simplificación.** El spec §7.4.4 dice que el reemplazo de los N documentos
 * ocurre "recién con el OK explícito" del director, después de que vio la vista
 * previa. Así que acá:
 *
 *  · se guarda la versión nueva en `advisor_doc_template_versions`, con
 *    `origen: 'subida'`, y su molde en Storage;
 *  · **no se toca `advisor_doc_templates.version_actual`** — la versión queda
 *    guardada y sin usar;
 *  · **no se toca ni una fila de `advisor_documents`.**
 *
 * Lo que hace, en orden:
 *
 *  1. Autoriza: director, y de SU agencia. El `agency_id` sale de la sesión del
 *     servidor y va como `.eq()` en cada consulta, además del RLS.
 *  2. Trae la versión vigente del tipo y el `form_data` del asesor indicado. Si
 *     ese asesor no tiene datos, se rechaza con ese mensaje: sin valores
 *     conocidos no hay nada determinista que buscar.
 *  3. Le saca el texto al .docx nuevo —el documento ENTERO, no solo el cuerpo—
 *     y ubica adentro los valores de esa persona.
 *  4. Rechaza el archivo genérico (spec §7.4.1) diciendo exactamente qué se
 *     esperaba encontrar y no apareció.
 *  5. Arma el molde nuevo y **comprueba que sirve**: rellenarlo con los datos de
 *     ese asesor tiene que devolver su documento. Es la misma red de la §7.3, y
 *     por el mismo motivo: Word parte el texto en *runs*.
 *  6. Guarda la versión y el molde.
 *  7. Devuelve qué campos cambian y la vista previa (spec §7.4.3).
 */

export const dynamic = "force-dynamic"

/**
 * Bajar nada, pero sí abrir un .docx, meterle los huecos, rellenarlo y
 * compararlo entero. Con un contrato normal son segundos; el default de 10 s no
 * alcanza igual.
 */
export const maxDuration = 60

/** El mismo bucket que el resto de los documentos del asesor (spec §8.6). */
const BUCKET = "documents"

/** Dónde vive el molde de cada versión (spec §8.6). El mismo de `confirmar-plantilla`. */
const rutaDelMolde = (agencyId: string, templateId: string, version: number) =>
  `asesores/${agencyId}/_plantillas/${templateId}/v${version}.docx`

/** El mismo tope práctico que usa el resto del repo para un documento subido. */
const MAX_ARCHIVO = 25 * 1024 * 1024

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const TIPO_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

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
   * La plantilla es de la inmobiliaria entera: la versiona el director y nadie
   * más. El chequeo va acá aunque la política de RLS ya lo pida, porque una
   * defensa sola es una defensa que el día que se toque desaparece sin ruido.
   */
  if (role !== "director") {
    return NextResponse.json({ error: "Solo el director puede subir una versión nueva" }, { status: 403 })
  }

  // ── Lo que llega del navegador ──────────────────────────────────────────
  /**
   * Multipart y no JSON: viene un .docx adentro. Del cliente llegan TRES datos
   * —qué plantilla, de qué asesor es el documento y el archivo— y ninguno de
   * ellos es de autoridad: la inmobiliaria y el rol salen de la sesión, y los
   * dos ids se comprueban después contra la base filtrando por `agency_id`.
   */
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: "El pedido no tiene la forma esperada" }, { status: 400 })
  }

  const templateId = form.get("templateId")
  const moldeAdvisorId = form.get("moldeAdvisorId")
  const archivo = form.get("archivo")

  if (typeof templateId !== "string" || !ES_UUID.test(templateId)) {
    return NextResponse.json({ error: "Falta el tipo de documento" }, { status: 400 })
  }
  if (typeof moldeAdvisorId !== "string" || !ES_UUID.test(moldeAdvisorId)) {
    return NextResponse.json(
      { error: "Falta decir de qué asesor son los datos con los que está completado el archivo" },
      { status: 400 },
    )
  }
  if (!(archivo instanceof File) || archivo.size === 0) {
    return NextResponse.json({ error: "Falta el archivo de la versión nueva" }, { status: 400 })
  }
  if (archivo.size > MAX_ARCHIVO) {
    return NextResponse.json({ error: "El archivo pesa más de 25 MB" }, { status: 400 })
  }
  if (!archivo.name.toLowerCase().endsWith(".docx")) {
    return NextResponse.json(
      { error: "El archivo tiene que ser un .docx de Word. Un PDF no se puede convertir en plantilla." },
      { status: 400 },
    )
  }

  const supabase = createClient()

  // ── 1. Que la plantilla sea de SU inmobiliaria ──────────────────────────
  const { data: tipo, error: errTipo } = await supabase
    .from("advisor_doc_templates")
    .select("id, nombre, version_actual")
    .eq("id", templateId)
    .eq("agency_id", agencyId)
    .maybeSingle()

  if (errTipo) {
    console.error("aplicar-version: no se pudo leer el tipo de documento:", errTipo.message)
    return NextResponse.json({ error: "No se pudo leer el tipo de documento" }, { status: 500 })
  }
  if (!tipo) {
    return NextResponse.json({ error: "Ese tipo de documento no existe en tu inmobiliaria" }, { status: 404 })
  }
  if (!tipo.version_actual) {
    return NextResponse.json({ error: SIN_VERSION_VIGENTE }, { status: 400 })
  }

  // ── La versión vigente: de acá salen los campos contra los que se compara ─
  const { data: vigente, error: errVigente } = await supabase
    .from("advisor_doc_template_versions")
    .select("id, version, campos_schema")
    .eq("id", tipo.version_actual)
    /**
     * El tercer filtro, y no sobra.
     *
     * `version_actual` tiene clave foránea a `advisor_doc_template_versions`,
     * así que la base garantiza que la fila EXISTA — pero no que sea de ESTA
     * plantilla. Verificado en `pg_constraint`: la restricción es sobre `id`, y
     * ninguna dice que la versión apuntada tenga que tener este `template_id`.
     *
     * Sin este `.eq`, una plantilla que quedara apuntando a la versión de otra
     * —por un `version_actual` mal escrito, hoy o el día que la 7b escriba esa
     * columna— compararía los campos nuevos contra el esquema del documento
     * equivocado. El resultado no sería un error: sería una lista de
     * "desaparecidos" y "nuevos" perfectamente redactada y completamente falsa.
     */
    .eq("template_id", templateId)
    .eq("agency_id", agencyId)
    .maybeSingle()

  if (errVigente) {
    console.error("aplicar-version: no se pudo leer la versión vigente:", errVigente.message)
    return NextResponse.json({ error: "No se pudo leer la versión vigente de la plantilla" }, { status: 500 })
  }
  if (!vigente) {
    return NextResponse.json({ error: SIN_VERSION_VIGENTE }, { status: 400 })
  }

  // ── 2. El asesor cuyos datos trae el archivo ────────────────────────────
  const { data: doc, error: errDoc } = await supabase
    .from("advisor_documents")
    .select("id, advisor_id, form_data")
    .eq("template_id", templateId)
    .eq("agency_id", agencyId)
    .eq("advisor_id", moldeAdvisorId)
    .maybeSingle()

  if (errDoc) {
    console.error("aplicar-version: no se pudo leer el documento del asesor:", errDoc.message)
    return NextResponse.json({ error: "No se pudo leer el documento de ese asesor" }, { status: 500 })
  }
  if (!doc) {
    return NextResponse.json(
      { error: "Ese asesor no tiene cargado ningún documento de este tipo, así que no se le conocen datos." },
      { status: 404 },
    )
  }

  const { data: perfil, error: errPerfil } = await supabase
    .from("profiles")
    .select("id, estado, full_name")
    .eq("id", moldeAdvisorId)
    .eq("agency_id", agencyId)
    .maybeSingle()

  if (errPerfil) {
    console.error("aplicar-version: no se pudo leer el asesor:", errPerfil.message)
    return NextResponse.json({ error: "No se pudo leer el asesor" }, { status: 500 })
  }
  if (!perfil) {
    return NextResponse.json({ error: "Ese asesor no está en tu inmobiliaria" }, { status: 404 })
  }

  /**
   * Pausados y desvinculados quedan afuera (spec §7.5). Acá no es que "no se le
   * regenera el documento": es que sus datos no pueden ser la referencia con la
   * que se lee la versión nueva de TODA la inmobiliaria.
   */
  const { dentro, advertencias: avisosEstado } = separarPorEstado([
    { advisorId: perfil.id, estado: perfil.estado ?? null, nombre: perfil.full_name ?? null },
  ])
  if (dentro.length === 0) {
    return NextResponse.json(
      {
        error:
          "Ese asesor está pausado o desvinculado, así que sus datos no se pueden usar de referencia. Elegí uno " +
          "activo.",
        advertencias: avisosEstado,
      },
      { status: 400 },
    )
  }

  const nombreDelAsesor = perfil.full_name?.trim() || "ese asesor"

  const datos = (doc.form_data ?? null) as Record<string, string> | null
  if (datos === null || typeof datos !== "object" || Object.keys(datos).length === 0) {
    return NextResponse.json({ error: SIN_DATOS_DEL_ASESOR }, { status: 400 })
  }

  // ── 3. El texto del .docx nuevo, ENTERO ─────────────────────────────────
  let zipNuevo: PizZip
  let partesDelNuevo: Record<string, string>
  try {
    zipNuevo = new PizZip(Buffer.from(await archivo.arrayBuffer()))
    /**
     * `textoPorParte` y no `textoDeDocx`: mammoth lee el CUERPO y nada más. Un
     * dato que viva en el encabezado no se encontraría, el campo saldría como
     * "desaparecido", y el molde nuevo se llevaría el encabezado de una sola
     * persona al documento de todas. Ese falso verde ya se pagó una vez en esta
     * etapa y está medido en `verificacion.ts`.
     */
    partesDelNuevo = textoPorParte(zipNuevo)
  } catch (e) {
    console.error("aplicar-version: no se pudo abrir el .docx:", e)
    return NextResponse.json(
      { error: "No se pudo abrir el archivo. Revisá que sea un .docx de Word y volvé a intentar." },
      { status: 400 },
    )
  }

  if (Object.values(partesDelNuevo).join("").trim() === "") {
    return NextResponse.json({ error: "El archivo no tiene texto que se pueda leer." }, { status: 400 })
  }

  const ubicaciones = ubicarValoresEnPartes(partesDelNuevo, datos)
  const usados = ubicaciones.filter(seVaAUsar)

  // ── 4. El archivo genérico se rechaza, y con nombre y apellido ──────────
  if (usados.length === 0) {
    return NextResponse.json({ error: moldeNoSeReconoce(ubicaciones, nombreDelAsesor) }, { status: 400 })
  }

  /**
   * Los huecos que el director escribió A MANO en el .docx nuevo.
   *
   * Es la única forma en que puede aparecer un campo que ANTES NO EXISTÍA
   * (spec §7.4.2): PRISMA no tiene ese dato de nadie, así que no hay ningún
   * valor conocido con el que encontrarlo. Escribir `{{COMISION}}` en el Word
   * es lo que le permite decir "acá va un dato nuevo".
   */
  const huecosAMano = huecosDe(zipNuevo)
  const yaUbicados = new Set(usados.map((u) => u.campo))

  /**
   * Los campos que el asesor de referencia trae VACÍOS **no se caen de la
   * versión nueva**.
   *
   * No se buscaron —no había qué buscar— así que declararlos "desaparecidos"
   * sería afirmar algo que el sistema no puede saber, y sacarlos del
   * `campos_schema` les borraría el campo a TODOS los asesores porque UNO no lo
   * tenía cargado. Entran en la versión y salen dichos aparte, en su propio
   * aviso.
   */
  const sinDato = camposSinDato(ubicaciones)

  const camposDeLaVersion = [
    ...usados.map((u) => u.campo),
    ...sinDato,
    ...huecosAMano.filter((h) => !yaUbicados.has(h)),
  ]

  const campos = compararCampos(nombresDelSchema(vigente.campos_schema), camposDeLaVersion)

  /**
   * Dos campos con el MISMO dato en esta persona: frena antes de tocar el .docx.
   * Es ambiguo de verdad, y el mensaje de "faltante" de `ponerHuecosEnDocx`
   * mandaría al director a buscar un problema de Word que no existe.
   */
  const mismoDato = camposConElMismoDato(ubicaciones)
  if (mismoDato.length > 0) {
    return NextResponse.json(
      { error: avisoDeCamposConElMismoDato(mismoDato, nombreDelAsesor) },
      { status: 400 },
    )
  }

  const advertencias: string[] = [...avisosEstado]
  /**
   * Las notas al FINAL, dichas con nombre propio. El molde se las lleva de esta
   * persona al documento de todas —docxtemplater no las rellena— así que si ahí
   * vive un dato de cada uno, el contrato de una sale con el número de otra.
   * Mismo motivo y mismo aviso que en la confirmación de la §7.2.
   */
  const avisoNotas = avisoDeNotasAlFinal(partesDelNuevo["word/endnotes.xml"] ?? "")
  if (avisoNotas) advertencias.push(avisoNotas)
  for (const aviso of [
    avisoDeCamposNuevos(campos.nuevos),
    avisoDeCamposDesaparecidos(campos.desaparecidos),
    avisoDeCamposSinDato(sinDato, nombreDelAsesor),
    avisoDeValoresRepetidos(ubicaciones),
    avisoDeDatosQueSePasan(ubicaciones),
  ]) {
    if (aviso) advertencias.push(aviso)
  }

  // ── 5. El molde nuevo, y la comprobación de que sirve ───────────────────
  let zipMolde: PizZip
  let noColocados: string[] = []
  try {
    const r = ponerHuecosEnDocx(zipNuevo, reemplazosDeLaVersionNueva(ubicaciones))
    zipMolde = r.zip
    advertencias.push(...r.advertencias)
    const colocados = new Set(r.puestos.map((p) => p.hueco))
    noColocados = usados.filter((u) => !colocados.has(comoQuedaEnElDocumento(u.campo))).map((u) => u.campo)
  } catch (e) {
    console.error("aplicar-version: no se pudo armar el molde:", e)
    return NextResponse.json(
      { error: "No se pudo marcar los campos adentro del archivo. Revisá que sea un .docx de Word." },
      { status: 400 },
    )
  }

  if (noColocados.length > 0) {
    /**
     * Frena, y no es una advertencia. A diferencia de la §7.2 —donde el
     * director todavía puede sacar el campo en la pantalla de revisión y volver
     * a intentar— acá el campo estaba en la versión vigente y en el archivo
     * nuevo, se lo encontró, y aun así no entró en el .docx. Guardar la versión
     * igual dejaría un molde que le escribe a todos el dato de esta persona.
     */
    const uno = noColocados.length === 1
    return NextResponse.json(
      {
        error:
          `${uno ? "Este campo se encontró" : "Estos campos se encontraron"} en el archivo pero no se ` +
          `${uno ? "pudo" : "pudieron"} marcar adentro: ${noColocados.join(", ")}. Casi siempre es porque Word ` +
          `guardó ese texto partido en pedazos. Volvé a escribirlo de una sola vez en el Word y subí el archivo de ` +
          `nuevo.`,
        advertencias,
      },
      { status: 400 },
    )
  }

  /**
   * Los datos con los que se comprueba el molde.
   *
   * A los del asesor se les agregan los huecos que el director escribió a mano,
   * cada uno con su propio `{{NOMBRE}}` de valor. No es una trampa para que dé
   * verde: es lo que el documento tiene que decir. Ese campo no tiene dato de
   * nadie todavía, así que el archivo nuevo trae el `{{COMISION}}` escrito y el
   * armado tiene que traerlo igual. Sin esto, `nullGetter` lo dejaría en blanco
   * y la comprobación saldría en rojo por el único caso que el spec §7.4.2
   * declara normal.
   */
  const datosParaComprobar: Record<string, string> = { ...datos }
  for (const hueco of huecosAMano) {
    if (!yaUbicados.has(hueco)) datosParaComprobar[hueco] = comoQuedaEnElDocumento(hueco)
  }

  /**
   * Y ANTES de rellenar: ¿quedó algún dato de esta persona pegado adentro del
   * molde? Es lo único que la comprobación de ida y vuelta NO puede ver, y es lo
   * que le mandaría a todos los asesores el CUIT de uno solo. Frena.
   *
   * Se miran SOLO los valores que estaban en el documento. Un valor `ausente`
   * no puede haber quedado pegado —no estaba— y mirarlo igual trae un falso
   * rojo real: un dato corto como "1" se encuentra adentro del nombre de un
   * campo que sí entró (`{{CAMPO_1}}`, con el guión bajo y las llaves de
   * borde), y el pedido se rechazaría por un dato que nunca estuvo.
   */
  const partesDelMolde = textoPorParte(zipMolde)
  const sobreviven = valoresQueSobrevivenEnElMolde(
    partesDelMolde,
    Object.fromEntries(usados.map((u) => [u.campo, u.valor])),
  )
  if (sobreviven.length > 0) {
    return NextResponse.json(
      { error: avisoDeValoresQueSobreviven(sobreviven, nombreDelAsesor), advertencias },
      { status: 400 },
    )
  }

  /**
   * Los mismos diagnósticos de la §7.2, tal cual: un dato tan corto que se mete
   * adentro del nombre de otro campo deja el .docx sin poder abrirse, y sin
   * esto el director recibe un "no se puede rellenar" y nada más.
   */
  const comoHuecos: HuecoParaGuardar[] = ubicaciones.map((u) => ({
    id: u.campo,
    nombre: u.campo,
    label: u.campo,
    contexto: "",
    valores: { [moldeAdvisorId]: u.valor },
  }))
  const choques = camposQueChocanConOtroNombre(comoHuecos, moldeAdvisorId)
  const camposCortos = camposConDatoCorto(comoHuecos, moldeAdvisorId)

  let armado: PizZip
  try {
    armado = rellenarDocx(zipMolde, datosParaComprobar)
  } catch (e) {
    console.error("aplicar-version: el molde no se puede rellenar:", e)
    return NextResponse.json({ error: moldeInservible({ choques, camposCortos }), advertencias }, { status: 400 })
  }

  const partesDelArmado = textoPorParte(armado)
  const verificacion = verificarDocumentoEntero(partesDelNuevo, partesDelArmado)
  if (!verificacion.coincide) {
    /**
     * LA RED DE SEGURIDAD, y acá frena de verdad: si rellenar el molde con los
     * datos de esta persona NO devuelve el documento que el director subió, ese
     * molde no sirve para nadie. Guardarlo igual sería guardar una versión que
     * el día que se aplique le va a cambiar el contrato a los N asesores.
     */
    return NextResponse.json(
      {
        error:
          `El molde que salió de este archivo no reproduce el documento de ${nombreDelAsesor}: ` +
          `${verificacion.observacion}`,
        advertencias,
      },
      { status: 400 },
    )
  }

  // ── 6. Guardar la versión y el molde ────────────────────────────────────
  const { data: ultima, error: errUltima } = await supabase
    .from("advisor_doc_template_versions")
    .select("version")
    .eq("template_id", templateId)
    .eq("agency_id", agencyId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (errUltima) {
    console.error("aplicar-version: no se pudo leer la última versión:", errUltima.message)
    return NextResponse.json({ error: "No se pudo averiguar el número de versión" }, { status: 500 })
  }

  const version = (ultima?.version ?? 0) + 1
  const docxPath = rutaDelMolde(agencyId, templateId, version)

  /**
   * La fila PRIMERO y el archivo después, igual que en `confirmar-plantilla`:
   * el índice único `(template_id, version)` es lo único atómico que hay acá.
   */
  const { data: nuevaVersion, error: errVersion } = await supabase
    .from("advisor_doc_template_versions")
    .insert({
      template_id: templateId,
      agency_id: agencyId,
      version,
      docx_path: docxPath,
      campos_schema: camposSchemaDeLaVersionNueva(camposDeLaVersion, vigente.campos_schema),
      /** Subida por el director, no deducida comparando documentos (spec §8.3). */
      origen: "subida",
      created_by: userId,
    })
    .select("id, version")
    .single()

  if (errVersion || !nuevaVersion) {
    console.error("aplicar-version: no se pudo crear la versión:", errVersion?.message)
    /**
     * Un choque de número de versión es un CONFLICTO y se devuelve como tal. No
     * se reintenta con el número siguiente en silencio: si alguien más acaba de
     * guardar una versión, lo que el director tiene en pantalla ya no es lo que
     * hay, y hacerle creer que su subida salió sobre lo que él veía es peor que
     * pedirle que mire de nuevo.
     */
    const chocaron = errVersion?.code === "23505"
    return NextResponse.json(
      {
        error: chocaron
          ? "Alguien más guardó una versión de esta plantilla hace un segundo. Actualizá la lista, fijate cómo " +
            "quedó y volvé a subir el archivo si hace falta."
          : "No se pudo crear la versión de la plantilla.",
        advertencias,
      },
      { status: chocaron ? 409 : 500 },
    )
  }

  const { error: errSubida } = await supabase.storage
    .from(BUCKET)
    .upload(docxPath, zipMolde.generate({ type: "nodebuffer" }), {
      contentType: TIPO_DOCX,
      /** Ver `confirmar-plantilla`: un huérfano de un intento fallido no es de nadie. */
      upsert: true,
    })

  if (errSubida) {
    console.error("aplicar-version: no se pudo subir el molde:", errSubida.message)
    // Sin archivo, la versión no sirve: se la borra en vez de dejarla apuntando a la nada.
    await supabase.from("advisor_doc_template_versions").delete().eq("id", nuevaVersion.id).eq("agency_id", agencyId)
    return NextResponse.json({ error: "No se pudo guardar el molde de la versión nueva." }, { status: 500 })
  }

  // ── 7. Lo que ve el director ────────────────────────────────────────────
  /**
   * **Acá se termina.** No se toca `version_actual` ni una sola fila de
   * `advisor_documents`: la versión queda guardada y sin usar hasta que el
   * director vea esta vista previa y confirme (spec §7.4.4).
   */
  return NextResponse.json({
    versionId: nuevaVersion.id,
    version: nuevaVersion.version,
    campos,
    ubicaciones,
    vistaPrevia: {
      advisorId: moldeAdvisorId,
      nombre: nombreDelAsesor,
      texto: textoDeVistaPrevia(partesDelArmado),
    },
    advertencias,
    resumen: resumenDeLaVersionNueva({
      version: nuevaVersion.version,
      ubicados: usados.length,
      nuevos: campos.nuevos,
      desaparecidos: campos.desaparecidos,
    }),
    aplicada: false,
  })
}
