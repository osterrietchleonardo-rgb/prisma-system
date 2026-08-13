import { NextRequest, NextResponse } from "next/server"
import { requireAdminVakdor, isNextResponse } from "@/lib/admin-vakdor/guard"
import { getAdminDb } from "@/lib/admin-vakdor/logger"
import { actualizarContenido, regenerarVisuales, textosRecientes } from "@/lib/admin-vakdor/marketing/store"
import { generarTexto } from "@/lib/admin-vakdor/marketing/claude"
import { BRAND_SYSTEM } from "@/lib/admin-vakdor/marketing/brand-prompt"
import { canonDeVoz } from "@/lib/admin-vakdor/marketing/recursos"
import { promptRevision, detectarMuletillas, instruccionCta, type EtapaEmbudo } from "@/lib/admin-vakdor/marketing/voz"
import { hookRepetido } from "@/lib/admin-vakdor/marketing/similitud"

export const dynamic = "force-dynamic"

/**
 * Defensa contra el modelo citando su propia reescritura: el prompt de reescritura marca
 * el texto de entrada con delimitadores `"""`, y a veces el modelo los ecoa en la respuesta
 * como si la estuviera citando. Saca una línea `"""` inicial/final (y las líneas en blanco
 * pegadas al borde) sin tocar nada del contenido real. Espejo de limpiarComillasEnvolventes
 * en marketing-worker/revision.mjs.
 */
function limpiarComillasEnvolventes(texto: string): string {
  const lineas = (texto ?? "").split("\n")
  while (lineas.length && lineas[0].trim() === "") lineas.shift()
  if (lineas.length && lineas[0].trim() === '"""') {
    lineas.shift()
    while (lineas.length && lineas[0].trim() === "") lineas.shift()
  }
  while (lineas.length && lineas[lineas.length - 1].trim() === "") lineas.pop()
  if (lineas.length && lineas[lineas.length - 1].trim() === '"""') {
    lineas.pop()
    while (lineas.length && lineas[lineas.length - 1].trim() === "") lineas.pop()
  }
  return lineas.join("\n").trim()
}

/**
 * Piso de longitud de una reescritura respecto del texto que reemplaza. Una respuesta cortada por
 * `max_tokens` vuelve a medio escribir: no es falsy, así que sin este piso pisaba en silencio a
 * una pieza completa. 0.6 deja margen para una reescritura legítimamente más apretada.
 * Espejo de PISO_REESCRITURA en marketing-worker/revision.mjs.
 */
const PISO_REESCRITURA = 0.6

/**
 * ¿La reescritura sirve para reemplazar al original? Se evalúa DESPUÉS de sanear, porque el saneo
 * es justamente lo que puede dejarla vacía: una respuesta que es solo `"""` sobrevive al `|| texto`
 * (no es falsy) y recién `limpiarComillasEnvolventes` la reduce a "".
 */
function reescrituraUsable(original: string, reescrito: string): { usable: boolean; motivo: string } {
  const nuevo = (reescrito ?? "").trim()
  if (!nuevo) return { usable: false, motivo: "quedó vacía después de sanear" }
  const previo = (original ?? "").trim()
  const piso = Math.floor(previo.length * PISO_REESCRITURA)
  if (nuevo.length < piso) {
    return { usable: false, motivo: `demasiado corta: ${nuevo.length} car contra un piso de ${piso} (el original tenía ${previo.length})` }
  }
  return { usable: true, motivo: "" }
}

/** Revisa contra rúbrica y reescribe UNA sola vez si no aprueba. */
async function revisarYCorregir(texto: string, etapa: EtapaEmbudo, systemBase: string): Promise<string> {
  let previas: Awaited<ReturnType<typeof textosRecientes>> = []
  try {
    previas = await textosRecientes(15)
  } catch (e) {
    // Falla suave: sin memoria no se puede chequear repetición de apertura,
    // pero el resto de la revisión sigue en pie.
    console.error(`revisarYCorregir(textosRecientes): ${(e as Error).message}`)
  }
  const hooks = previas.map((p) => p.hook).filter(Boolean)
  const hookNuevo = texto.split("\n").map((l) => l.trim()).find((l) => l) ?? ""

  const fallos: string[] = []
  const rep = hookRepetido(hookNuevo, hooks)
  if (rep.repetido) fallos.push(`5: la apertura se parece demasiado a una ya publicada ("${rep.contra}")`)
  const muletillas = detectarMuletillas(texto)
  if (muletillas.length) fallos.push(`7: muletillas de IA detectadas: ${muletillas.join(", ")}`)

  try {
    const veredicto = await generarTexto(systemBase, promptRevision(texto, etapa, hooks), { maxTokens: 2000, effort: "low" })
    const parsed = JSON.parse(veredicto.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as { aprobado?: boolean; fallos?: string[] }
    if (parsed.aprobado === false) fallos.push(...(parsed.fallos ?? []))
  } catch (e) {
    // Falla suave: si el juez no responde o el veredicto no parsea, se queda con los chequeos locales.
    console.error(`revisarYCorregir(veredicto): ${(e as Error).message}`)
  }

  if (fallos.length === 0) return texto

  // Regla dura: la reescritura solo pisa al original si es usable. Si la llamada falla (p.ej. la
  // respuesta vino truncada por max_tokens), si vuelve vacía o si vuelve mutilada, se conserva
  // el texto que ya teníamos — un borrador bueno no se reemplaza por uno roto.
  let corregido: string
  try {
    corregido = await generarTexto(
      systemBase,
      [
        `Reescribí esta pieza corrigiendo SOLO los fallos listados. Mantené el argumento y la extensión.`,
        `FALLOS:\n${fallos.map((f) => `- ${f}`).join("\n")}`,
        `PIEZA:\n"""\n${texto}\n"""`,
        `Devolvé SOLO la pieza corregida, sin explicaciones. No envuelvas la respuesta entre comillas triples ni ningún otro delimitador: las comillas triples de arriba marcan dónde empieza y termina el texto de ENTRADA, no deben aparecer en tu respuesta.`,
      ].join("\n\n"),
      { maxTokens: 8000 },
    )
  } catch (e) {
    console.error(`[revision] reescritura descartada (la llamada falló: ${(e as Error).message}) — se conserva el texto original`)
    return texto
  }

  const limpio = limpiarComillasEnvolventes((corregido || "").trim())
  const chequeo = reescrituraUsable(texto, limpio)
  if (!chequeo.usable) {
    console.error(`[revision] reescritura descartada (${chequeo.motivo}) — se conserva el texto original`)
    return texto
  }
  return limpio
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdminVakdor(request)
  if (isNextResponse(auth)) return auth

  const body = await request.json().catch(() => null)
  const comentario = (body?.comentario as string | undefined)?.trim()
  const regenerar = body?.regenerar_visuales === true
  if (!comentario) return NextResponse.json({ error: "falta comentario" }, { status: 400 })

  const db = getAdminDb()
  const { data: idea, error } = await db
    .from("marketing_ideas")
    .select("titulo, fuente, formato, funnel, contenido")
    .eq("id", params.id).single()
  if (error || !idea) return NextResponse.json({ error: "idea no encontrada" }, { status: 404 })

  // Permitir regeneración de visuales / portada para todos los formatos (carrusel, blog, post imagen, etc.)
  const puedeRegenerar = true
  const haráRegenerar = regenerar && puedeRegenerar

  // Regenerar TODO: limpiamos assets y borrador y mandamos la tarjeta a "en_proceso" con el comentario para el worker
  if (haráRegenerar) {
    try {
      await regenerarVisuales(params.id, comentario)
      return NextResponse.json({ regenerando: true })
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 })
    }
  }

  // Reformular solo el texto. El canon y el CTA de la etapa entran YA en el borrador: escribir
  // primero "plano" y parchear después en la revisión daba una pieza con la voz vieja y una sola
  // pasada para arreglarla.
  const etapa = (idea.funnel as EtapaEmbudo | null) ?? "mofu"
  const systemBase = `${BRAND_SYSTEM}\n\n${await canonDeVoz()}`

  const user = [
    `Pieza: ${idea.fuente} · ${idea.formato}. Título: ${idea.titulo}.`,
    `Instrucción del director para reformular: ${comentario}`,
    idea.contenido ? `Borrador actual:\n${idea.contenido}` : `Todavía no hay borrador; escribí uno.`,
    instruccionCta(etapa),
    `Devolvé SOLO el nuevo texto, listo para publicar. Sin explicaciones.`,
  ].filter(Boolean).join("\n\n")

  try {
    const borrador = await generarTexto(systemBase, user)
    const contenido = await revisarYCorregir(borrador, etapa, systemBase)
    await actualizarContenido(params.id, {
      contenido, comentario,
      evento: { fecha: new Date().toISOString(), tipo: "reformulada", detalle: comentario.slice(0, 120) },
    })
    return NextResponse.json({ contenido, regenerando: false })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
