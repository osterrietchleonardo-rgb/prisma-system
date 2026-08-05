import { buildAgentRows, buildSignalRows } from "./data"
import { phoneKey } from "./phone"
import {
  esVisita,
  fetchAsesores,
  fetchConsultas,
  fetchConversaciones,
  fetchEtapasPipeline,
  fetchHandoffs,
  fetchMensajesDesde,
  fetchVisitasDesde,
  type Agencia,
  type ResendEmail,
} from "./sources"
import type { DerivationEvent, PipelineRow, WeeklyReport, WeekWindow } from "./types"

const MARCA_HANDOFF = "Handoff activado"
const SIN_ASESOR = "(sin asesor)"

interface Mensaje {
  conversationId: string
  role: string
  content: string | null
  at: string
}

/**
 * Horas hasta el primer mensaje de la agencia después de `desde`, o null si nadie escribió.
 *
 * Cuenta 'human' y también 'internal' que no sea la marca del handoff: algunos mensajes de
 * asesor quedan guardados como internal. Misma regla que lib/queries/handoffs.ts.
 */
export function primeraRespuesta(
  mensajes: Mensaje[],
  conversationId: string,
  desde: string,
): number | null {
  const candidatos = mensajes.filter(
    (m) =>
      m.conversationId === conversationId &&
      m.at > desde &&
      (m.role === "human" || (m.role === "internal" && !m.content?.includes(MARCA_HANDOFF))),
  )
  if (!candidatos.length) return null
  // El array puede no venir ordenado por fecha: se busca el más temprano por valor de `at`,
  // no el primero en orden de array (find() se quedaría con el que aparezca primero, no
  // con el cronológicamente antes).
  const respuesta = candidatos.reduce((a, b) => (a.at < b.at ? a : b))
  return (new Date(respuesta.at).getTime() - new Date(desde).getTime()) / 3_600_000
}

/** Etiquetas lindas de las etapas del pipeline (mismo orden que lib/tracking/pipeline.ts). */
const ETAPAS: Record<string, string> = {
  prospeccion: "Prospección",
  prelisting: "Prelisting",
  prebuying: "Prebuying",
  captacion: "Captación",
  reserva: "Reserva",
  cierre: "Cierre",
}
const ORDEN_ETAPAS = Object.keys(ETAPAS)

export async function buildReport(
  agencia: Agencia,
  w: WeekWindow,
  emails: ResendEmail[] | null,
): Promise<WeeklyReport> {
  const [consultas, handoffs, conversaciones, asesores, etapas, visitas] = await Promise.all([
    fetchConsultas(agencia.id, w),
    fetchHandoffs(agencia.id, w),
    fetchConversaciones(agencia.id),
    fetchAsesores(agencia.id),
    fetchEtapasPipeline(agencia.id),
    fetchVisitasDesde(agencia.id, w.startUtc),
  ])

  const convPorId = new Map(conversaciones.map((c) => [c.id, c]))
  const convPorTel = new Map<string, (typeof conversaciones)[number]>()
  for (const c of conversaciones) {
    const key = phoneKey(c.phone)
    if (key && !convPorTel.has(key)) convPorTel.set(key, c)
  }

  // Los emails de esta inmobiliaria: los que fueron a un asesor con perfil acá.
  const mios = (emails ?? []).filter((e) => asesores.has(e.to))
  const deVisita = mios.filter((e) => esVisita(e.subject))
  const deLink = mios.filter((e) => !esVisita(e.subject))

  // Todas las conversaciones tocadas esta semana, para pedir sus mensajes de una vez.
  const idsEmail = mios
    .map((e) => (e.phoneKey ? convPorTel.get(e.phoneKey)?.id : undefined))
    .filter(Boolean) as string[]
  const ids = [...new Set([...handoffs.map((h) => h.conversationId), ...idsEmail])]
  const mensajes = await fetchMensajesDesde(agencia.id, ids, w.startUtc)

  const huboVisitaDespues = (key: string | null, desde: string): boolean =>
    !!key && visitas.some((v) => v.phoneKey === key && v.at > desde)

  const eventosHandoff: DerivationEvent[] = handoffs.map((h) => {
    const conv = convPorId.get(h.conversationId)
    return {
      agentName: (conv?.agentId && asesores.get(conv.agentId)) || SIN_ASESOR,
      at: h.at,
      replyHours: primeraRespuesta(mensajes, h.conversationId, h.at),
      visitScheduled: huboVisitaDespues(phoneKey(conv?.phone), h.at),
      emailClicked: false, // el email del handoff no se cruza: el handoff ya sale de la base
    }
  })

  const eventoDeEmail = (e: ResendEmail): DerivationEvent => {
    const conv = e.phoneKey ? convPorTel.get(e.phoneKey) : undefined
    return {
      agentName: asesores.get(e.to) ?? SIN_ASESOR,
      at: e.createdAt,
      replyHours: conv ? primeraRespuesta(mensajes, conv.id, e.createdAt) : null,
      visitScheduled: huboVisitaDespues(e.phoneKey, e.createdAt),
      emailClicked: e.clicked,
    }
  }

  // Pipeline: de los leads derivados esta semana, cuáles tienen actividad cargada.
  const telsDerivados = new Set<string>()
  for (const h of handoffs) {
    const key = phoneKey(convPorId.get(h.conversationId)?.phone)
    if (key) telsDerivados.add(key)
  }
  for (const e of mios) if (e.phoneKey) telsDerivados.add(e.phoneKey)

  const conteoEtapas = new Map<string, number>()
  let cargados = 0
  for (const tel of telsDerivados) {
    const etapa = etapas.get(tel)
    if (!etapa) continue
    cargados++
    conteoEtapas.set(etapa, (conteoEtapas.get(etapa) ?? 0) + 1)
  }
  // Ojo: se ordena por la CLAVE cruda ("prospeccion"), no por la etiqueta ("Prospección"),
  // que es lo que está en ORDEN_ETAPAS. Recién después se traduce a etiqueta.
  const filasPipeline: PipelineRow[] = [...conteoEtapas]
    .sort((a, b) => ORDEN_ETAPAS.indexOf(a[0]) - ORDEN_ETAPAS.indexOf(b[0]))
    .map(([stage, count]) => ({ stage: ETAPAS[stage] ?? stage, count }))

  return {
    agencyName: agencia.name,
    window: w,
    consultas,
    handoffs: { total: handoffs.length, rows: buildAgentRows(eventosHandoff) },
    visitas: { total: deVisita.length, rows: buildSignalRows(deVisita.map(eventoDeEmail)) },
    links: { total: deLink.length, rows: buildSignalRows(deLink.map(eventoDeEmail)) },
    pipeline: { derivados: telsDerivados.size, cargados, rows: filasPipeline },
    resendOk: emails !== null,
  }
}
