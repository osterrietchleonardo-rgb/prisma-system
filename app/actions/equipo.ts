"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { enviarAviso, type PerfilEquipo } from "@/lib/seguimiento/avisos"
import {
  HORAS_VENCE_APROBACION, armarAvisoAsignacion, armarAvisoPedidoAlDirector, fraseReapertura,
  validarJustificacion, venceEn, ventanaCerrada,
} from "@/lib/seguimiento/equipo"
import { registrarEvento } from "@/lib/seguimiento/eventos"
import { nombreValido } from "@/lib/seguimiento/semilla"
import type { Candidato } from "@/lib/seguimiento/tipos"

/**
 * Reasignación, "Lo tomo" / "No lo puedo tomar", "Dar más tiempo", "Marcar como perdido" y
 * aprobaciones consume-once. Cada acción: verifica quién es (sesión), verifica que el chat
 * sea de su agencia (y suyo, si es asesor), escribe con el cliente de servidor (la RLS de
 * wa_conversations no dejaría a un asesor soltar su propio chat), deja rastro en
 * lead_eventos y avisa a quien corresponda por email + WhatsApp.
 */

export type Resultado = { ok: true; detalle?: string } | { ok: false; error: string }

type Yo = { id: string; agency_id: string; role: "director" | "asesor"; full_name: string }

async function quienSoy(): Promise<Yo> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Tenés que iniciar sesión.")
  const { data: p } = await supabase.from("profiles").select("id, agency_id, role, full_name, estado").eq("id", user.id).single()
  if (!p?.agency_id || p.estado !== "activo") throw new Error("Tu usuario no está activo.")
  return { id: p.id, agency_id: p.agency_id, role: p.role === "director" ? "director" : "asesor", full_name: p.full_name ?? "" }
}

type Conv = Pick<Candidato, "id" | "agency_id" | "contact_phone" | "metricas"> & {
  agent_id: string | null; funnel_status: string; last_message_at: string | null; bot_active: boolean
}

/** Lee el chat con el cliente de servidor y verifica que sea de la agencia de quien pide. */
async function leerChat(yo: Yo, conversationId: string): Promise<Conv> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("wa_conversations")
    .select("id, agency_id, contact_phone, metricas, agent_id, funnel_status, last_message_at, bot_active")
    .eq("id", conversationId)
    .maybeSingle()
  if (!data || data.agency_id !== yo.agency_id) throw new Error("Ese chat no existe o no es de tu agencia.")
  return data as Conv
}

async function nombreAgencia(agencyId: string): Promise<string> {
  const { data } = await createAdminClient().from("agencies").select("name").eq("id", agencyId).maybeSingle()
  return data?.name ?? "PRISMA"
}

async function perfil(id: string): Promise<PerfilEquipo | null> {
  const { data } = await createAdminClient()
    .from("profiles").select("id, full_name, role, email, phone").eq("id", id).is("deleted_at", null).maybeSingle()
  return (data as PerfilEquipo | null) ?? null
}

async function directoresActivos(agencyId: string): Promise<PerfilEquipo[]> {
  const { data } = await createAdminClient()
    .from("profiles").select("id, full_name, role, email, phone")
    .eq("agency_id", agencyId).eq("role", "director").eq("estado", "activo").is("deleted_at", null)
    .order("created_at", { ascending: true })
  return (data ?? []) as PerfilEquipo[]
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://prisma.vakdor.com"
}

/** Base URL del servidor que atiende ESTE pedido (en local es localhost, no producción). */
function baseUrlDeEstePedido(): string {
  const h = headers()
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https")
  return `${proto}://${host}`
}

async function cancelarCompromisosDelAsesor(conversationId: string, motivo: string) {
  await createAdminClient()
    .from("compromisos")
    .update({ estado: "cancelado", cerrado_en: new Date().toISOString(), metadata: { motivo } })
    .eq("conversation_id", conversationId).eq("tipo", "respuesta_pendiente").eq("estado", "activo")
}

async function abrirCompromisoDelAsesor(c: Conv, descripcion: string, origen: string) {
  await createAdminClient().from("compromisos").insert({
    agency_id: c.agency_id, conversation_id: c.id, tipo: "respuesta_pendiente", descripcion,
    asumido_por: "asesor", vence_en: venceEn(new Date()), origen,
  })
}

function refrescar(conversationId: string) {
  revalidatePath(`/director/leads-whatsapp/${conversationId}`)
  revalidatePath(`/asesor/leads-whatsapp/${conversationId}`)
  revalidatePath("/director/aprobaciones")
}

// ─────────────────────────────────────────────────────────────────────────────
// Estado que ve el panel de la ficha
// ─────────────────────────────────────────────────────────────────────────────

export interface EstadoEquipo {
  rol: "director" | "asesor"
  yo: string
  asesor: { id: string; full_name: string | null } | null
  esMio: boolean
  funnel_status: string
  compromisos: Array<{ id: string; tipo: string; descripcion: string; asumido_por: string; vence_en: string | null }>
  aprobacionPendiente: { id: string; justificacion: string; creado_en: string; quien: string } | null
  ventanaCerrada: boolean
  /** Si se puede reabrir la conversación con el cliente por plantilla, y si no, por qué. */
  reapertura: { disponible: boolean; motivo: string | null }
  asesores: Array<{ id: string; full_name: string | null; role: string }>
  ultimosEventos: Array<{ tipo: string; descripcion: string; ts: string }>
}

export async function estadoEquipo(conversationId: string): Promise<EstadoEquipo> {
  const yo = await quienSoy()
  const c = await leerChat(yo, conversationId)
  if (yo.role === "asesor" && c.agent_id !== yo.id) throw new Error("Este chat no está asignado a vos.")
  const admin = createAdminClient()

  const [{ data: comps }, { data: apro }, { data: ultimoLead }, { data: tpl }, { data: eventos }] = await Promise.all([
    admin.from("compromisos").select("id, tipo, descripcion, asumido_por, vence_en")
      .eq("conversation_id", c.id).eq("estado", "activo").order("vence_en", { ascending: true }),
    admin.from("aprobaciones").select("id, justificacion, creado_en, solicitada_por")
      .eq("conversation_id", c.id).eq("estado", "pendiente").order("creado_en", { ascending: false }).limit(1).maybeSingle(),
    admin.from("wa_messages").select("created_at").eq("conversation_id", c.id).eq("role", "lead")
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("wa_templates").select("status").eq("agency_id", c.agency_id)
      .eq("template_name", `ag${c.agency_id.replace(/-/g, "").substring(0, 6)}_seg_pendiente`).maybeSingle(),
    admin.from("lead_eventos").select("tipo, descripcion, ts").eq("conversation_id", c.id)
      .in("tipo", ["reasignacion", "asesor_tomo", "asesor_no_puede", "director_dio_tiempo", "lead_perdido_por_asesor", "aviso_equipo", "reapertura_cliente", "aprobacion_decidida"])
      .order("ts", { ascending: false }).limit(6),
  ])

  const asesor = c.agent_id ? await perfil(c.agent_id) : null
  let quien = "un asesor"
  if (apro?.solicitada_por?.startsWith("asesor:")) {
    const p = await perfil(apro.solicitada_por.slice(7))
    if (p?.full_name) quien = p.full_name
  }
  const cerrada = ventanaCerrada(ultimoLead?.created_at ?? null)
  const conNombre = nombreValido(c as Candidato)
  const reapertura = !cerrada
    ? { disponible: false, motivo: "La conversación sigue abierta: el asesor nuevo puede escribirle directo." }
    : !conNombre
      ? { disponible: false, motivo: "El cliente no tiene nombre registrado y la plantilla lo necesita." }
      : tpl?.status !== "APPROVED"
        ? { disponible: false, motivo: "Esta agencia todavía no tiene aprobada la plantilla para reabrir conversaciones." }
        : { disponible: true, motivo: null }

  let asesores: EstadoEquipo["asesores"] = []
  if (yo.role === "director") {
    const { data } = await admin.from("profiles").select("id, full_name, role")
      .eq("agency_id", yo.agency_id).eq("estado", "activo").is("deleted_at", null).order("full_name")
    asesores = (data ?? []) as EstadoEquipo["asesores"]
  }

  return {
    rol: yo.role,
    yo: yo.id,
    asesor: asesor ? { id: asesor.id, full_name: asesor.full_name } : null,
    esMio: c.agent_id === yo.id,
    funnel_status: c.funnel_status,
    compromisos: (comps ?? []) as EstadoEquipo["compromisos"],
    aprobacionPendiente: apro ? { id: apro.id, justificacion: apro.justificacion, creado_en: apro.creado_en, quien } : null,
    ventanaCerrada: cerrada,
    reapertura,
    asesores,
    ultimosEventos: (eventos ?? []) as EstadoEquipo["ultimosEventos"],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Acciones
// ─────────────────────────────────────────────────────────────────────────────

/** Asesor asignado (o director): "Lo tomo". Mueve la responsabilidad; "atendido" lo mide el dato. */
export async function tomarChat(conversationId: string): Promise<Resultado> {
  try {
    const yo = await quienSoy()
    const c = await leerChat(yo, conversationId)
    const admin = createAdminClient()
    if (yo.role === "asesor" && c.agent_id !== yo.id) return { ok: false, error: "Este chat no está asignado a vos." }

    if (c.agent_id !== yo.id) {
      // el director se lo asigna a sí mismo
      await admin.from("wa_conversations").update({ agent_id: yo.id }).eq("id", c.id)
      await cancelarCompromisosDelAsesor(c.id, `lo tomó ${yo.full_name}`)
      await abrirCompromisoDelAsesor(c, `Responderle al cliente (lo tomó ${yo.full_name})`, "lo_tomo")
    }
    // si había un pedido pendiente por este chat, queda resuelto
    await admin.from("aprobaciones")
      .update({ estado: "aprobada", decision: { tipo: "lo_tomo", por: yo.id }, decidida_por: yo.id, decidida_en: new Date().toISOString(), consumida: true })
      .eq("conversation_id", c.id).eq("estado", "pendiente")
    await registrarEvento(admin, c.agency_id, c.id, "asesor_tomo", `${yo.full_name} tomó el chat`, { perfil_id: yo.id }, `${yo.role}:${yo.id}`)
    refrescar(c.id)
    return { ok: true, detalle: "Listo, el chat es tuyo. Cuando le escribas al cliente, el seguimiento lo registra." }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Asesor: "No lo puedo tomar" con justificación. Se le saca el chat y el director decide. */
export async function noPuedoTomar(conversationId: string, justificacion: string): Promise<Resultado> {
  try {
    const err = validarJustificacion(justificacion)
    if (err) return { ok: false, error: err }
    const yo = await quienSoy()
    const c = await leerChat(yo, conversationId)
    if (c.agent_id !== yo.id) return { ok: false, error: "Este chat no está asignado a vos." }
    const admin = createAdminClient()
    const motivo = justificacion.replace(/\s+/g, " ").trim()

    await admin.from("wa_conversations").update({ agent_id: null }).eq("id", c.id)
    await cancelarCompromisosDelAsesor(c.id, `${yo.full_name} no lo puede tomar`)
    const { data: apro } = await admin.from("aprobaciones").insert({
      agency_id: c.agency_id, conversation_id: c.id, tipo: "reasignar",
      solicitada_por: `asesor:${yo.id}`,
      accion: { tipo: "reasignar", conversation_id: c.id, desde: yo.id },
      aprobador: "director", justificacion: motivo,
      vence_en: new Date(Date.now() + HORAS_VENCE_APROBACION * 3600e3).toISOString(),
    }).select("id").single()
    await registrarEvento(admin, c.agency_id, c.id, "asesor_no_puede",
      `${yo.full_name} no puede tomar el chat: «${motivo}». Quedó sin asesor, el director decide.`,
      { perfil_id: yo.id, aprobacion_id: apro?.id ?? null }, `asesor:${yo.id}`)

    // aviso al director (email siempre, WhatsApp si tiene celular)
    const directores = await directoresActivos(c.agency_id)
    const agencia = await nombreAgencia(c.agency_id)
    for (const d of directores.slice(0, 1)) {
      const aviso = armarAvisoPedidoAlDirector(d, c, { asesorNombre: yo.full_name || "Un asesor", justificacion: motivo }, appUrl(), agencia)
      await enviarAviso(admin, c, aviso, agencia, { decisionId: apro?.id ?? null })
    }
    refrescar(c.id)
    return { ok: true, detalle: "Listo: el chat ya no es tuyo y el director recibió tu motivo para reasignarlo." }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export interface OpcionesReasignar {
  motivo?: string | null
  /** Si la ventana de 24 h está cerrada: mandarle al cliente la plantilla de reapertura. */
  avisarCliente?: boolean
  /** Si viene de la pantalla de aprobaciones: el pedido que se consume. */
  aprobacionId?: string | null
}

/** Director: reasignar a otro asesor (o a sí mismo). Avisa al asesor nuevo; opcionalmente reabre con el cliente. */
export async function reasignarChat(conversationId: string, nuevoId: string, opts: OpcionesReasignar = {}): Promise<Resultado> {
  try {
    const yo = await quienSoy()
    if (yo.role !== "director") return { ok: false, error: "Solo el director puede reasignar un chat." }
    const c = await leerChat(yo, conversationId)
    const admin = createAdminClient()
    const nuevo = await perfil(nuevoId)
    const { data: nuevoFila } = await admin.from("profiles").select("agency_id, estado").eq("id", nuevoId).maybeSingle()
    if (!nuevo || nuevoFila?.agency_id !== yo.agency_id || nuevoFila?.estado !== "activo")
      return { ok: false, error: "Ese asesor no está activo en tu agencia." }
    if (c.agent_id === nuevoId) return { ok: false, error: "El chat ya está asignado a esa persona." }
    const motivo = (opts.motivo ?? "").replace(/\s+/g, " ").trim() || null
    const anterior = c.agent_id ? await perfil(c.agent_id) : null

    // 1. la asignación
    await admin.from("wa_conversations").update({ agent_id: nuevoId }).eq("id", c.id)
    await cancelarCompromisosDelAsesor(c.id, `reasignado a ${nuevo.full_name}`)
    await abrirCompromisoDelAsesor(c, `Responderle al cliente (reasignado por ${yo.full_name})`, opts.aprobacionId ?? "reasignacion")
    if (opts.aprobacionId) {
      await admin.from("aprobaciones")
        .update({ estado: "aprobada", decision: { tipo: "reasignar", a: nuevoId, motivo }, decidida_por: yo.id, decidida_en: new Date().toISOString(), consumida: true })
        .eq("id", opts.aprobacionId).eq("estado", "pendiente")
    } else {
      // un pedido pendiente por este chat queda resuelto por esta reasignación directa
      await admin.from("aprobaciones")
        .update({ estado: "aprobada", decision: { tipo: "reasignar", a: nuevoId, motivo }, decidida_por: yo.id, decidida_en: new Date().toISOString(), consumida: true })
        .eq("conversation_id", c.id).eq("estado", "pendiente")
    }
    await registrarEvento(admin, c.agency_id, c.id, "reasignacion",
      `${yo.full_name} reasignó el chat de ${anterior?.full_name ?? "nadie"} a ${nuevo.full_name}${motivo ? `: ${motivo}` : ""}`,
      { de: c.agent_id, a: nuevoId, motivo, aprobacion_id: opts.aprobacionId ?? null }, `director:${yo.id}`)

    // 2. aviso al asesor nuevo (si no es el propio director)
    const agencia = await nombreAgencia(c.agency_id)
    let detalle = `Chat reasignado a ${nuevo.full_name}.`
    if (nuevoId !== yo.id) {
      const aviso = armarAvisoAsignacion(nuevo, c, { porQuien: yo.full_name || "El director", motivo }, appUrl(), agencia)
      const r = await enviarAviso(admin, c, aviso, agencia, { decisionId: opts.aprobacionId ?? null })
      detalle += ` Aviso: email ${r.email === "enviado" ? "enviado" : r.email}, WhatsApp ${r.whatsapp === "enviado" ? "enviado" : r.whatsapp.replace(/_/g, " ")}.`
    }

    // 3. reabrir con el cliente, solo si el director lo pidió y la ventana está cerrada
    if (opts.avisarCliente) {
      const { data: ultimoLead } = await admin.from("wa_messages").select("created_at").eq("conversation_id", c.id)
        .eq("role", "lead").order("created_at", { ascending: false }).limit(1).maybeSingle()
      if (!ventanaCerrada(ultimoLead?.created_at ?? null)) {
        detalle += " La conversación sigue abierta: no hizo falta plantilla."
      } else if (!nombreValido(c as Candidato)) {
        detalle += " No se le escribió al cliente: no tiene nombre registrado."
      } else {
        const res = await fetch(`${baseUrlDeEstePedido()}/api/whatsapp/dispatch`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": process.env.DISPATCH_SECRET ?? "" },
          body: JSON.stringify({
            agency_id: c.agency_id, conversation_id: c.id, contact_phone: c.contact_phone,
            template_name: "seg_pendiente",
            variables: [String(c.metricas.nombre).trim(), fraseReapertura(nuevo.full_name ?? "")],
          }),
        })
        const data = await res.json().catch(() => ({}))
        const okEnvio = res.ok && data?.success
        await registrarEvento(admin, c.agency_id, c.id, "reapertura_cliente",
          okEnvio ? `Se le escribió al cliente que ahora lo sigue ${nuevo.full_name}` : `No se pudo reabrir con el cliente: ${data?.skipped ?? data?.error ?? res.status}`,
          { wamid: data?.wamid ?? null, resultado: okEnvio ? "enviada" : String(data?.skipped ?? data?.error ?? res.status) }, `director:${yo.id}`)
        detalle += okEnvio ? " Al cliente se le avisó por WhatsApp." : ` No se pudo avisar al cliente (${data?.skipped ?? data?.error ?? res.status}).`
      }
    }
    refrescar(c.id)
    return { ok: true, detalle }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Director: 24 h más para el compromiso del asesor. */
export async function darMasTiempo(conversationId: string): Promise<Resultado> {
  try {
    const yo = await quienSoy()
    if (yo.role !== "director") return { ok: false, error: "Solo el director puede dar más tiempo." }
    const c = await leerChat(yo, conversationId)
    const admin = createAdminClient()
    const { data: comp } = await admin.from("compromisos").select("id, vence_en")
      .eq("conversation_id", c.id).eq("tipo", "respuesta_pendiente").eq("estado", "activo").limit(1).maybeSingle()
    if (!comp) return { ok: false, error: "No hay ningún compromiso del asesor abierto en este chat." }
    const base = comp.vence_en && Date.parse(comp.vence_en) > Date.now() ? new Date(comp.vence_en) : new Date()
    const nuevo = venceEn(base)
    await admin.from("compromisos").update({ vence_en: nuevo }).eq("id", comp.id)
    await registrarEvento(admin, c.agency_id, c.id, "director_dio_tiempo", `${yo.full_name} dio 24 h más al asesor`, { vence_en: nuevo }, `director:${yo.id}`)
    refrescar(c.id)
    return { ok: true, detalle: "Listo: el asesor tiene 24 h más." }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Asesor asignado o director: el lead no contesta más ⇒ perdido, con motivo. Reversible desde la ficha (estado). */
export async function marcarPerdido(conversationId: string, justificacion: string): Promise<Resultado> {
  try {
    const err = validarJustificacion(justificacion)
    if (err) return { ok: false, error: err }
    const yo = await quienSoy()
    const c = await leerChat(yo, conversationId)
    if (yo.role === "asesor" && c.agent_id !== yo.id) return { ok: false, error: "Este chat no está asignado a vos." }
    const admin = createAdminClient()
    const motivo = justificacion.replace(/\s+/g, " ").trim()
    await admin.from("wa_conversations")
      .update({ funnel_status: "closed_lost", requires_follow_up: false, next_follow_up_at: null, dropoff_reason: `${yo.role}: ${motivo}`.slice(0, 200) })
      .eq("id", c.id)
    await admin.from("compromisos").update({ estado: "cancelado", cerrado_en: new Date().toISOString(), metadata: { motivo: "lead perdido" } })
      .eq("conversation_id", c.id).eq("estado", "activo")
    await registrarEvento(admin, c.agency_id, c.id, "lead_perdido_por_asesor", `${yo.full_name} marcó el lead como perdido: «${motivo}»`, { perfil_id: yo.id }, `${yo.role}:${yo.id}`)
    refrescar(c.id)
    return { ok: true, detalle: "Marcado como perdido. El seguimiento automático no lo va a tocar más." }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Aprobaciones (pantalla del director)
// ─────────────────────────────────────────────────────────────────────────────

export interface AprobacionVista {
  id: string
  tipo: string
  estado: string
  justificacion: string
  creado_en: string
  vence_en: string | null
  decidida_en: string | null
  decision: Record<string, unknown> | null
  quien: string
  lead: { conversation_id: string | null; nombre: string; telefono: string | null }
  decididaPor: string | null
}

export async function listarAprobaciones(): Promise<{ pendientes: AprobacionVista[]; historial: AprobacionVista[]; asesores: EstadoEquipo["asesores"] }> {
  const yo = await quienSoy()
  if (yo.role !== "director") throw new Error("Solo el director ve las aprobaciones.")
  const admin = createAdminClient()
  // vencer lo vencido (fail-closed: nunca se ejecuta sin respuesta)
  await admin.from("aprobaciones").update({ estado: "vencida" })
    .eq("agency_id", yo.agency_id).eq("estado", "pendiente").lt("vence_en", new Date().toISOString())

  const { data: filas } = await admin.from("aprobaciones").select("*")
    .eq("agency_id", yo.agency_id).order("creado_en", { ascending: false }).limit(60)
  const ids = new Set<string>()
  for (const f of filas ?? []) {
    if (f.solicitada_por?.startsWith("asesor:")) ids.add(f.solicitada_por.slice(7))
    if (f.decidida_por) ids.add(f.decidida_por)
    const a = (f.decision as { a?: string } | null)?.a
    if (a) ids.add(a)
  }
  const { data: perfiles } = await admin.from("profiles").select("id, full_name").in("id", [...ids].length ? [...ids] : ["00000000-0000-0000-0000-000000000000"])
  const nombre = new Map((perfiles ?? []).map((p) => [p.id, p.full_name ?? "?"]))
  const convIds = (filas ?? []).map((f) => f.conversation_id).filter(Boolean)
  const { data: convs } = await admin.from("wa_conversations").select("id, contact_phone, metricas")
    .in("id", convIds.length ? convIds : ["00000000-0000-0000-0000-000000000000"])
  const conv = new Map((convs ?? []).map((c) => [c.id, c]))

  const vistas: AprobacionVista[] = (filas ?? []).map((f) => {
    const c = f.conversation_id ? conv.get(f.conversation_id) : null
    const nombreLead = c && nombreValido(c as Candidato) ? String((c.metricas as Record<string, unknown>).nombre).trim() : "Un cliente"
    return {
      id: f.id, tipo: f.tipo, estado: f.estado, justificacion: f.justificacion, creado_en: f.creado_en,
      vence_en: f.vence_en, decidida_en: f.decidida_en, decision: f.decision,
      quien: f.solicitada_por?.startsWith("asesor:") ? (nombre.get(f.solicitada_por.slice(7)) ?? "Un asesor") : f.solicitada_por,
      lead: { conversation_id: f.conversation_id, nombre: nombreLead, telefono: c?.contact_phone ?? null },
      decididaPor: f.decidida_por ? (nombre.get(f.decidida_por) ?? null) : null,
    }
  })
  const { data: asesores } = await admin.from("profiles").select("id, full_name, role")
    .eq("agency_id", yo.agency_id).eq("estado", "activo").is("deleted_at", null).order("full_name")
  return {
    pendientes: vistas.filter((v) => v.estado === "pendiente"),
    historial: vistas.filter((v) => v.estado !== "pendiente"),
    asesores: (asesores ?? []) as EstadoEquipo["asesores"],
  }
}

export async function contarAprobacionesPendientes(): Promise<number> {
  try {
    const yo = await quienSoy()
    if (yo.role !== "director") return 0
    const { count } = await createAdminClient().from("aprobaciones").select("id", { count: "exact", head: true })
      .eq("agency_id", yo.agency_id).eq("estado", "pendiente")
    return count ?? 0
  } catch {
    return 0
  }
}

export type DecisionAprobacion =
  | { tipo: "lo_tomo" }
  | { tipo: "reasignar"; asesorId: string; motivo?: string | null; avisarCliente?: boolean }
  | { tipo: "rechazar"; motivo: string }

/** Consume-once: solo se decide una vez; si ya se decidió, avisa y no repite nada. */
export async function resolverAprobacion(id: string, decision: DecisionAprobacion): Promise<Resultado> {
  try {
    const yo = await quienSoy()
    if (yo.role !== "director") return { ok: false, error: "Solo el director decide las aprobaciones." }
    const admin = createAdminClient()
    const { data: a } = await admin.from("aprobaciones").select("*").eq("id", id).eq("agency_id", yo.agency_id).maybeSingle()
    if (!a) return { ok: false, error: "Ese pedido no existe." }
    if (a.estado !== "pendiente") return { ok: false, error: `Ese pedido ya fue ${a.estado === "vencida" ? "vencido" : a.estado.replace("a", "o")}: no se repite.` }
    if (a.vence_en && Date.parse(a.vence_en) < Date.now()) {
      await admin.from("aprobaciones").update({ estado: "vencida" }).eq("id", id)
      return { ok: false, error: "Ese pedido venció sin respuesta; el chat sigue sin asesor. Reasignalo desde la ficha." }
    }
    if (a.tipo !== "reasignar" || !a.conversation_id) return { ok: false, error: "Tipo de pedido no soportado todavía." }

    if (decision.tipo === "rechazar") {
      const err = validarJustificacion(decision.motivo)
      if (err) return { ok: false, error: err }
      await admin.from("aprobaciones")
        .update({ estado: "rechazada", decision: { tipo: "rechazar", motivo: decision.motivo.trim() }, decidida_por: yo.id, decidida_en: new Date().toISOString(), consumida: true })
        .eq("id", id).eq("estado", "pendiente")
      await registrarEvento(admin, yo.agency_id, a.conversation_id, "aprobacion_decidida",
        `${yo.full_name} dejó el chat sin asesor por ahora: «${decision.motivo.trim()}»`, { aprobacion_id: id }, `director:${yo.id}`)
      refrescar(a.conversation_id)
      return { ok: true, detalle: "Anotado. El chat queda sin asesor; el agente lo sigue mirando." }
    }
    if (decision.tipo === "lo_tomo") {
      const r = await reasignarChat(a.conversation_id, yo.id, { aprobacionId: id })
      return r
    }
    return reasignarChat(a.conversation_id, decision.asesorId, { motivo: decision.motivo, avisarCliente: decision.avisarCliente, aprobacionId: id })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
