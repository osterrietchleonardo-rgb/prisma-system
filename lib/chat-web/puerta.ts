/**
 * Chat web · La puerta de calle: quién puede usar el asistente y hasta dónde.
 *
 * Esta es la única parte de PRISMA que atiende a cualquiera de internet, sin cuenta ni sesión.
 * Todo lo de acá está pensado para el día malo: alguien que copia la dirección del chat y la
 * llama en bucle desde su casa.
 *
 * Dos criterios:
 * 1. **Falla cerrado.** Si no se puede comprobar de dónde viene el pedido, no se atiende. Un
 *    chat que atiende "por las dudas" es una factura abierta.
 * 2. **Cuando se corta, no se corta seco.** Del otro lado hay una persona que quiere comprar o
 *    vender una casa: se la manda a WhatsApp, que es donde el equipo trabaja igual.
 */

export const LIMITES_CHAT = {
  /** Una conversación de venta no necesita más que esto; más es un bucle o un curioso. */
  mensajesPorConversacion: 30,
  /** Tope de gasto de UNA conversación. */
  costoPorConversacionUSD: 0.3,
  /** Tope del día para toda la agencia: un error nuestro no puede vaciar la cuenta. */
  costoPorAgenciaPorDiaUSD: 3,
}

export interface WidgetPublico {
  id: string
  agency_id: string
  activo: boolean
  dominios: string[]
  whatsapp_destino: string | null
}

export interface EstadoConversacion {
  mensajes: number
  costoUSD: number
}

export type MotivoCorte = "apagado" | "muchos_mensajes" | "costo_conversacion" | "costo_dia"

export type Atencion =
  | { ok: true }
  | { ok: false; motivo: MotivoCorte; paraElVisitante: string }

/**
 * ¿El pedido viene de la web de esta agencia? Se compara el host exacto contra los dominios
 * declarados (el dominio y su www, que salen de la dirección del sitio: nadie los escribe).
 */
export function revisarOrigen(origin: string | null | undefined, dominios: string[]): boolean {
  if (!origin || !dominios.length) return false
  let host: string
  try {
    host = new URL(origin).hostname.toLowerCase()
  } catch {
    return false
  }
  return dominios.map((d) => d.toLowerCase()).includes(host)
}

function salida(whatsapp: string | null): string {
  return whatsapp
    ? "Para seguir bien esta charla te paso con el equipo por WhatsApp, que es donde te pueden ayudar mejor."
    : "Para seguir bien esta charla necesito que te contacte alguien del equipo. Dejame tu teléfono o tu email y te escriben."
}

export function decidirAtencion(opts: {
  widget: WidgetPublico
  conversacion: EstadoConversacion
  gastoDelDiaUSD: number
}): Atencion {
  const { widget, conversacion, gastoDelDiaUSD } = opts

  if (!widget.activo)
    return {
      ok: false,
      motivo: "apagado",
      paraElVisitante:
        "El chat no está disponible en este momento. Escribinos por los medios de contacto del sitio y te respondemos.",
    }

  if (conversacion.mensajes >= LIMITES_CHAT.mensajesPorConversacion)
    return { ok: false, motivo: "muchos_mensajes", paraElVisitante: salida(widget.whatsapp_destino) }

  if (conversacion.costoUSD >= LIMITES_CHAT.costoPorConversacionUSD)
    return { ok: false, motivo: "costo_conversacion", paraElVisitante: salida(widget.whatsapp_destino) }

  if (gastoDelDiaUSD >= LIMITES_CHAT.costoPorAgenciaPorDiaUSD)
    return { ok: false, motivo: "costo_dia", paraElVisitante: salida(widget.whatsapp_destino) }

  return { ok: true }
}
