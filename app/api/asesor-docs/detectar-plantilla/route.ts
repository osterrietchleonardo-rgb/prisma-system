import { NextResponse } from "next/server"
import { GoogleGenerativeAI } from "@google/generative-ai"

import { createClient } from "@/lib/supabase/server"
import { consumeAiCredits, requireTenant, updateAiTransactionCost } from "@/lib/auth/tenant-validation"
import { calculateCost, tokensFromUsage } from "@/utils/aiCostCalculator"
import { textoDeDocx } from "@/lib/plantillas/docx"
import { detectarHuecos, type Documento, type Hueco } from "@/lib/plantillas/deteccion"
import {
  armarPropuesta,
  nombresParaHuecos,
  promptDeNombres,
  separarPorEstado,
  SYSTEM_PROMPT_NOMBRES,
  type FilaAsesor,
  type Propuesta,
} from "@/lib/asesor-docs/propuesta"

/**
 * Detectar la plantilla de un tipo de documento comparando los contratos
 * personalizados que ya subió el director (spec §7.1).
 *
 * Lo que hace, en orden: junta los documentos del tipo, deja afuera a los
 * asesores pausados y desvinculados, baja cada .docx, les saca el texto, los
 * compara entre sí para deducir qué es texto fijo y qué es el dato de cada
 * uno, le pide a la IA que le ponga nombre a cada dato, y devuelve una
 * propuesta para que el director la revise.
 *
 * **No guarda absolutamente nada.** Ni una fila, ni un archivo, ni un estado.
 * Lo que se guarda lo guarda `confirmar-plantilla`, después de la revisión
 * obligatoria (spec §7.2).
 *
 * Dos cosas que no se negocian acá:
 *  1. El `agency_id` sale de la sesión del servidor, NUNCA del cuerpo del
 *     pedido. Del cliente llega un solo dato —qué tipo de documento— y
 *     después se comprueba que ese tipo sea de su inmobiliaria.
 *  2. Si la IA falla, la detección NO falla: los campos salen `CAMPO_1`,
 *     `CAMPO_2` y el director los renombra. Es literal del spec §7.1.
 */

export const dynamic = "force-dynamic"
/** Bajar y leer N documentos de Word tarda; el default de 10 s no alcanza. */
export const maxDuration = 60

/** El mismo bucket que usa el resto de los documentos del asesor. */
const BUCKET = "documents"

/** El modelo que ya usa el repo para tareas de texto (convert-template). */
const MODELO = "gemini-3.5-flash"

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type FilaDocumento = {
  advisor_id: string
  archivo_original_path: string
  nombre_archivo: string
}

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

  /**
   * La plantilla es de la inmobiliaria entera, no de un asesor: la detecta el
   * director y nadie más. El chequeo va acá aunque la política de RLS de
   * `advisor_doc_templates` ya lo pida, porque una defensa sola es una
   * defensa que el día que se toque desaparece sin ruido.
   */
  if (role !== "director") {
    return NextResponse.json({ error: "Solo el director puede detectar la plantilla" }, { status: 403 })
  }

  let templateId: unknown
  try {
    const body = await req.json()
    templateId = (body as { templateId?: unknown })?.templateId
  } catch {
    return NextResponse.json({ error: "El pedido no tiene cuerpo válido" }, { status: 400 })
  }

  if (typeof templateId !== "string" || !ES_UUID.test(templateId)) {
    return NextResponse.json({ error: "Falta el tipo de documento" }, { status: 400 })
  }

  const supabase = createClient()

  /**
   * Que el tipo de documento sea de SU inmobiliaria. El `agency_id` del
   * filtro sale de `requireTenant`, no del cuerpo del pedido: es la única
   * forma de que pedir el id de otra agencia no devuelva nada.
   */
  const { data: tipo, error: errTipo } = await supabase
    .from("advisor_doc_templates")
    .select("id, nombre")
    .eq("id", templateId)
    .eq("agency_id", agencyId)
    .maybeSingle()

  if (errTipo) {
    console.error("detectar-plantilla: no se pudo leer el tipo de documento:", errTipo.message)
    return NextResponse.json({ error: "No se pudo leer el tipo de documento" }, { status: 500 })
  }
  if (!tipo) {
    return NextResponse.json({ error: "Ese tipo de documento no existe en tu inmobiliaria" }, { status: 404 })
  }

  const { data: documentos, error: errDocs } = await supabase
    .from("advisor_documents")
    .select("advisor_id, archivo_original_path, nombre_archivo")
    .eq("template_id", templateId)
    .eq("agency_id", agencyId)
    /**
     * El orden importa y no es cosmético: el PRIMER documento que sobrevive es
     * el que `detectarHuecos` usa de base, y de esa elección dependen los
     * rangos de los huecos. Sin `order`, PostgREST devuelve las filas en el
     * orden que le queda cómodo, y dos detecciones seguidas sobre los mismos
     * archivos podrían proponer huecos distintos sin que nada haya cambiado.
     * `created_at` primero (el más viejo suele ser el mejor formado) y
     * `advisor_id` para desempatar dos subidas del mismo segundo.
     */
    .order("created_at", { ascending: true })
    .order("advisor_id", { ascending: true })

  if (errDocs) {
    console.error("detectar-plantilla: no se pudieron leer los documentos:", errDocs.message)
    return NextResponse.json({ error: "No se pudieron leer los documentos" }, { status: 500 })
  }

  const filas = (documentos ?? []) as FilaDocumento[]
  if (filas.length === 0) {
    return NextResponse.json(
      { error: `Todavía no hay ningún documento cargado en "${tipo.nombre}".` },
      { status: 400 },
    )
  }

  // ── Quiénes quedan afuera ────────────────────────────────────────────────
  const { data: perfiles, error: errPerfiles } = await supabase
    .from("profiles")
    .select("id, estado, full_name")
    .in("id", filas.map((f) => f.advisor_id))
    .eq("agency_id", agencyId)

  if (errPerfiles) {
    console.error("detectar-plantilla: no se pudieron leer los asesores:", errPerfiles.message)
    return NextResponse.json({ error: "No se pudieron leer los asesores" }, { status: 500 })
  }

  const porId = new Map<string, { estado: string | null; full_name: string | null }>()
  for (const p of perfiles ?? []) porId.set(p.id, { estado: p.estado ?? null, full_name: p.full_name ?? null })

  const advertencias: string[] = []
  const candidatas: FilaAsesor[] = []
  const rutas = new Map<string, FilaDocumento>()

  for (const fila of filas) {
    const perfil = porId.get(fila.advisor_id)
    if (!perfil) {
      /**
       * Sin el perfil no se puede saber si esa persona está pausada. Se la
       * deja afuera —que es lo conservador— pero se lo dice: un documento que
       * el director ve en la lista y que no entró en la comparación tiene que
       * aparecer explicado en algún lado.
       */
      advertencias.push(
        `No se encontró al asesor del archivo "${fila.nombre_archivo}" en tu inmobiliaria: ese documento queda ` +
          `fuera de la comparación.`,
      )
      continue
    }
    candidatas.push({ advisorId: fila.advisor_id, estado: perfil.estado, nombre: perfil.full_name })
    rutas.set(fila.advisor_id, fila)
  }

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

  // ── Bajar los .docx y sacarles el texto ──────────────────────────────────
  const leidos = await Promise.all(
    dentro.map(async (asesor): Promise<{ doc: Documento | null; aviso: string | null }> => {
      const fila = rutas.get(asesor.advisorId)!
      const quien = asesor.nombre?.trim() || fila.nombre_archivo
      try {
        const { data, error } = await supabase.storage.from(BUCKET).download(fila.archivo_original_path)
        if (error || !data) throw error ?? new Error("archivo vacío")
        const texto = await textoDeDocx(Buffer.from(await data.arrayBuffer()))
        return { doc: { advisorId: asesor.advisorId, texto }, aviso: null }
      } catch (e) {
        console.error(`detectar-plantilla: no se pudo leer ${fila.archivo_original_path}:`, e)
        return {
          doc: null,
          aviso: `No se pudo abrir el documento de ${quien} ("${fila.nombre_archivo}"): queda fuera de la comparación.`,
        }
      }
    }),
  )

  const docs: Documento[] = []
  for (const r of leidos) {
    if (r.doc) docs.push(r.doc)
    if (r.aviso) advertencias.push(r.aviso)
  }

  /**
   * `detectarHuecos` ya avisa cuando llegan menos de 3 documentos y cuando uno
   * queda vacío o no se pudo comparar. No se falla por eso: se devuelve la
   * propuesta con las advertencias y decide el director (brief de la tarea).
   */
  const deteccion = detectarHuecos(docs)

  // ── La IA le pone nombre a cada hueco ────────────────────────────────────
  const { respuesta, avisos } = await nombrarConIa(deteccion.huecos)
  advertencias.push(...avisos)

  const nombres = nombresParaHuecos(respuesta, deteccion.huecos.length)
  advertencias.push(...nombres.advertencias)

  const propuesta: Propuesta = armarPropuesta({
    templateId,
    deteccion,
    nombres: nombres.nombres,
    laIaRespondio: nombres.laIaRespondio,
    advertenciasPrevias: advertencias,
  })

  return NextResponse.json(propuesta)
}

/**
 * Le pide a la IA los nombres de los campos, gastando UN crédito por
 * detección —no uno por asesor— y solo si hay algo que nombrar.
 *
 * Nada de acá adentro puede tumbar la detección: si no hay créditos, si falta
 * la clave, si el modelo se cae o si tarda de más, se devuelve `null` y los
 * campos salen `CAMPO_N`. Es la regla del spec §7.1, y por eso el `catch`
 * abarca también el consumo del crédito: quedarse sin créditos es una forma
 * más de que la IA no esté.
 *
 * Devolver `null` no es tapar el fallo: `nombresParaHuecos` lo convierte en
 * una advertencia para el director. Los `avisos` de acá son los que agregan
 * el POR QUÉ cuando se lo sabe, encima de esa advertencia genérica.
 */
async function nombrarConIa(huecos: Hueco[]): Promise<{ respuesta: string | null; avisos: string[] }> {
  if (huecos.length === 0) return { respuesta: null, avisos: [] }

  if (!process.env.GEMINI_API_KEY) {
    console.error("detectar-plantilla: falta GEMINI_API_KEY")
    return { respuesta: null, avisos: [] }
  }

  let txId: string | null = null
  try {
    txId = await consumeAiCredits("plantillas_asesor", 1, `Detectar plantilla: ${huecos.length} campos`)
  } catch (e) {
    console.error("detectar-plantilla: no se pudo consumir el crédito:", e)
    return {
      respuesta: null,
      avisos: [
        "No quedaban créditos de IA, así que los campos salen como CAMPO_1, CAMPO_2… La detección se hizo igual; " +
          "solo hay que ponerles nombre a mano.",
      ],
    }
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: MODELO })
    const resultado = await model.generateContent([SYSTEM_PROMPT_NOMBRES, `\n\n${promptDeNombres(huecos)}`])

    const uso = resultado.response.usageMetadata
    if (uso) {
      const { inputTokens, outputTokens } = tokensFromUsage(uso)
      const { totalCostUSD } = calculateCost({ model: MODELO, inputTokens, outputTokens })
      updateAiTransactionCost(txId, inputTokens, outputTokens, totalCostUSD)
    }

    return { respuesta: resultado.response.text(), avisos: [] }
  } catch (e) {
    /**
     * El crédito ya se consumió y no se devuelve. Es a propósito: la llamada
     * salió y puede haber costado tokens. Lo que no puede pasar es que el
     * director no se entere de que pagó por un nombre que no llegó.
     */
    console.error("detectar-plantilla: la IA falló al nombrar los campos:", e)
    return { respuesta: null, avisos: [] }
  }
}
