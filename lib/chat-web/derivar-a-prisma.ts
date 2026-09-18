/**
 * Chat web · Cuando la consulta le toca a un asesor de PRISMA.
 *
 * Decisión de Leonardo (17/9): lo que se manda al contacto de afuera se charla por su WhatsApp y
 * listo, pero **lo que le toca a un asesor se atiende desde PRISMA**, para que quede registrado.
 *
 * Como en ese caso es PRISMA quien abre la conversación en WhatsApp, hace falta una plantilla
 * aprobada: se le recuerda a la persona que nos escribió ELLA, por la web. Con su respuesta se
 * abre la ventana de 24 h y el asesor sigue escribiendo normal desde la bandeja.
 *
 * Tres cuidados que están en el código y no en la buena voluntad:
 * 1. **No se le roba el chat a nadie.** Si esa persona ya tenía una conversación con otro asesor,
 *    no se reasigna: se avisa igual, pero el dueño sigue siendo quien era.
 * 2. **No se apaga un bot que estaba trabajando** salvo que el chat sea nuevo o ya estuviera en
 *    manos de este mismo asesor.
 * 3. **Si la plantilla no está aprobada, no se inventa nada**: se devuelve el motivo y el lead se
 *    deriva igual por email, para que no se pierda.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { buscarOCrearConversacion } from "@/lib/whatsapp/conversations"
import { enviarPlantillaAlTelefono } from "@/lib/whatsapp/enviar-plantilla"

/** La plantilla del catálogo (lib/whatsapp/plantillas-v2.ts → plantillasWeb). */
export const PLANTILLA_WEB = "web_primer_contacto"

export interface ResultadoDerivacionPrisma {
  conversationId: string | null
  /** true si el chat quedó asignado a este asesor por esta derivación. */
  asignado: boolean
  /** Por qué NO se asignó, cuando no se asignó (ya era de otro asesor). */
  yaEraDe: string | null
  /** Resultado del envío de la plantilla al visitante. */
  plantilla: string
  wamid: string | null
}

export async function derivarDentroDePrisma(
  db: SupabaseClient,
  datos: {
    agencyId: string
    perfilId: string
    telefono: string
    nombre: string
    /** Una línea: de qué consultó. Va en la plantilla, así que la lee el visitante. */
    deQueConsulto: string
  },
  fetchFn: typeof fetch = fetch
): Promise<ResultadoDerivacionPrisma> {
  const telefono = datos.telefono.replace(/\D/g, "")
  if (telefono.length < 10)
    return { conversationId: null, asignado: false, yaEraDe: null, plantilla: "omitido_sin_celular", wamid: null }

  const { conv, creada } = await buscarOCrearConversacion<{
    id: string
    agent_id: string | null
    bot_active: boolean | null
  }>(db, {
    agency_id: datos.agencyId,
    contact_phone: telefono,
    columnas: "id, agent_id, bot_active",
    nueva: {
      agency_id: datos.agencyId,
      contact_phone: telefono,
      contact_name: datos.nombre || null,
      agent_id: datos.perfilId,
      // Lo toma una persona desde el primer momento: el bot no atiende este chat.
      bot_active: false,
      status: "active",
      metricas: { nombre: datos.nombre || null, origen: "chat_web" },
      last_message_at: new Date().toISOString(),
    },
  })

  if (!conv) return { conversationId: null, asignado: false, yaEraDe: null, plantilla: "error_sin_chat", wamid: null }

  let asignado = creada
  let yaEraDe: string | null = null
  if (!creada) {
    if (!conv.agent_id) {
      await db.from("wa_conversations").update({ agent_id: datos.perfilId, bot_active: false }).eq("id", conv.id)
      asignado = true
    } else if (conv.agent_id === datos.perfilId) {
      asignado = true
    } else {
      // Ya lo venía atendiendo otro: no se le saca. El aviso sale igual.
      yaEraDe = conv.agent_id
    }
  }

  const envio = await enviarPlantillaAlTelefono(
    db,
    datos.agencyId,
    {
      telefono,
      plantilla: PLANTILLA_WEB,
      variables: [datos.nombre || "¿cómo estás?", datos.deQueConsulto],
    },
    fetchFn
  )

  return {
    conversationId: conv.id,
    asignado,
    yaEraDe,
    plantilla: envio.resultado,
    wamid: envio.wamid,
  }
}
