import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * GATE DE INTERNOS (Super Agente, Task 12e / §III.2.6).
 *
 * Los avisos al equipo (asesores y director) salen del MISMO número de WhatsApp que atiende a
 * los leads. Cuando un asesor contesta, su mensaje entra por el mismo webhook que los leads y,
 * sin este gate, el conversacional lo trataría como un lead nuevo. El gate corre en el webhook
 * ANTES de buscar/crear la conversación: si el teléfono es de alguien del equipo de esa agencia,
 * el mensaje se registra en `interacciones_canal`, se le contesta una confirmación fija (sin IA)
 * con el link a PRISMA, y el flujo termina ahí — sin conversación, sin wa_messages, sin n8n.
 *
 * Reglas duras:
 *  - FALLA ABIERTO: cualquier error al consultar profiles ⇒ `null` ⇒ el mensaje sigue el camino
 *    normal. Un bug acá jamás puede dejar a un lead sin respuesta.
 *  - Nunca matchea teléfonos vacíos ni de perfiles eliminados.
 *  - Misma convención de dígitos que wa_conversations.contact_phone (549…, sin "+").
 *  - Dedupe por wamid: Evolution/Meta reemiten eventos; la confirmación sale UNA vez.
 */

export interface PerfilInterno {
  id: string
  role: string
  full_name: string | null
  phone: string
}

export interface EntradaInterna {
  agencyId: string
  perfil: PerfilInterno
  contactPhone: string
  contenido: string
  wamid: string | null
  canal?: "whatsapp"
}

export type EnviarTexto = (telefono: string, texto: string) => Promise<void>

/** Solo dígitos: "+54 9 11 6132-8586" → "5491161328586". */
export function digitos(tel: string | null | undefined): string {
  return String(tel ?? "").replace(/\D/g, "")
}

/** ¿El teléfono es de un asesor/director (no eliminado) de ESTA agencia? Falla abierto. */
export async function buscarInterno(
  db: SupabaseClient,
  agencyId: string,
  contactPhone: string
): Promise<PerfilInterno | null> {
  const objetivo = digitos(contactPhone)
  if (objetivo.length < 8) return null
  try {
    const { data, error } = await db
      .from("profiles")
      .select("id, role, full_name, phone")
      .eq("agency_id", agencyId)
      .is("deleted_at", null)
      .not("phone", "is", null)
    if (error || !data) return null
    const hit = data.find((p) => {
      const d = digitos(p.phone)
      return d.length >= 8 && d === objetivo
    })
    return hit ? { id: hit.id, role: hit.role, full_name: hit.full_name, phone: hit.phone } : null
  } catch {
    return null
  }
}

/** Link a la bandeja de chats según el rol. La ruta del asesor solo abre conversaciones asignadas a él. */
export function linkPrisma(perfil: PerfilInterno, appUrl: string): string {
  const base = appUrl.replace(/\/+$/, "")
  return `${base}/${perfil.role === "director" ? "director" : "asesor"}/leads-whatsapp`
}

/** Confirmación fija, sin IA, dentro de la ventana de 24 h (el asesor acaba de escribir). */
export function textoConfirmacion(perfil: PerfilInterno, appUrl: string): string {
  const nombre = (perfil.full_name ?? "").trim().split(/\s+/)[0]
  return `${nombre ? `${nombre}, r` : "R"}ecibido, quedó anotado. Para responderle al cliente entrá a PRISMA: ${linkPrisma(perfil, appUrl)}`
}

/**
 * Registra el mensaje interno y contesta la confirmación. Nunca lanza: el webhook tiene que
 * devolver 200 pase lo que pase (Evolution reintenta ante errores).
 * Devuelve qué hizo, para el log del webhook.
 */
export async function procesarMensajeInterno(
  db: SupabaseClient,
  entrada: EntradaInterna,
  enviarTexto: EnviarTexto,
  appUrl: string
): Promise<{ registrado: boolean; duplicado: boolean; confirmacionEnviada: boolean }> {
  const resultado = { registrado: false, duplicado: false, confirmacionEnviada: false }
  try {
    if (entrada.wamid) {
      const { data: dup } = await db
        .from("interacciones_canal")
        .select("id")
        .eq("wamid", entrada.wamid)
        .maybeSingle()
      if (dup) {
        resultado.duplicado = true
        return resultado
      }
    }
    const { error } = await db.from("interacciones_canal").insert({
      agency_id: entrada.agencyId,
      conversation_id: null,
      destinatario: entrada.perfil.role === "director" ? "director" : "asesor",
      destinatario_ref: entrada.perfil.id,
      canal: entrada.canal ?? "whatsapp",
      direccion: "entrada",
      asunto: null,
      contenido: entrada.contenido,
      wamid: entrada.wamid,
      metadata: { telefono: digitos(entrada.contactPhone), nombre: entrada.perfil.full_name },
    })
    resultado.registrado = !error
    if (error) console.error("[gate-internos] error registrando interacción:", error.message)
  } catch (e) {
    console.error("[gate-internos] excepción registrando:", e)
  }

  try {
    await enviarTexto(entrada.contactPhone, textoConfirmacion(entrada.perfil, appUrl))
    resultado.confirmacionEnviada = true
  } catch (e) {
    console.error("[gate-internos] no se pudo enviar la confirmación:", e)
  }
  return resultado
}

/**
 * Envío de texto libre por la instancia de la agencia (Evolution o Meta), mismo camino que
 * usa /api/n8n/reply. Solo para la confirmación del gate: el asesor acaba de escribir, así que
 * la ventana de 24 h está abierta y no hace falta plantilla.
 */
export function crearEnviadorTexto(db: SupabaseClient, instanceId: string): EnviarTexto {
  return async (telefono, texto) => {
    const { data: inst, error } = await db
      .from("whatsapp_instances")
      .select("integration_type, evo_instance_name, phone_number_id, token")
      .eq("id", instanceId)
      .single()
    if (error || !inst) throw new Error(`instancia ${instanceId} no encontrada`)
    const numero = digitos(telefono)

    if (inst.integration_type === "evolution" && inst.evo_instance_name) {
      const url = process.env.EVOLUTION_API_URL
      const key = process.env.EVOLUTION_API_KEY
      if (!url || !key) throw new Error("faltan EVOLUTION_API_URL / EVOLUTION_API_KEY")
      const res = await fetch(`${url}/message/sendText/${inst.evo_instance_name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: key },
        body: JSON.stringify({ number: numero, text: texto, delay: 800 }),
      })
      if (!res.ok) throw new Error(`Evolution sendText ${res.status}: ${(await res.text()).slice(0, 200)}`)
      return
    }

    if (inst.phone_number_id && inst.token) {
      const res = await fetch(`https://graph.facebook.com/v19.0/${inst.phone_number_id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${inst.token}` },
        body: JSON.stringify({ messaging_product: "whatsapp", to: numero, type: "text", text: { body: texto } }),
      })
      if (!res.ok) throw new Error(`Meta messages ${res.status}: ${(await res.text()).slice(0, 200)}`)
      return
    }
    throw new Error(`instancia ${instanceId} sin canal de envío configurado`)
  }
}
