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
  let u: URL
  try {
    u = new URL(origin)
  } catch {
    return false
  }
  const permitidos = dominios.map((d) => d.toLowerCase())
  // Se acepta por nombre (central.com) o por nombre con puerto (localhost:3000): lo segundo es
  // lo que hace falta para poder probar el chat en la máquina antes de publicarlo.
  return permitidos.includes(u.hostname.toLowerCase()) || permitidos.includes(u.host.toLowerCase())
}

function salida(whatsapp: string | null): string {
  return whatsapp
    ? "Para seguir bien esta charla te paso con el equipo por WhatsApp, que es donde te pueden ayudar mejor."
    : "Para seguir bien esta charla necesito que te contacte alguien del equipo. Dejame tu teléfono o tu email y te escriben."
}

/**
 * De qué web viene el pedido, de verdad.
 *
 * La ventana del chat la sirve PRISMA y se muestra DENTRO de un marco en el sitio de la
 * inmobiliaria. Por eso el pedido sale con el origen de PRISMA, no con el del cliente: mirar solo
 * el origen dejaría afuera al visitante de verdad. Lo que dice de qué web viene es la página que
 * la ventana informa (el referente del marco).
 *
 * Sigue fallando cerrado: si no se puede saber de qué página viene, no se atiende.
 *
 * Lo que este control NO puede evitar, y conviene tenerlo escrito: alguien decidido puede armar
 * un pedido a mano diciendo que viene del sitio del cliente. No consigue datos de nadie —solo
 * hablar con el asistente— y lo frenan los topes: 30 mensajes por conversación y US$3 por día
 * por agencia. Para cerrarlo del todo hace falta que la ventana traiga una firma nuestra, y eso
 * va cuando haya que abrirlo a más clientes.
 */
export function revisarProcedencia(opts: {
  origin: string | null | undefined
  /** El origen del propio PRISMA que atendió este pedido (local, copia de prueba o producción). */
  propio: string
  /** La página del sitio donde está puesto el chat, informada por la ventana. */
  pagina: string | null | undefined
  dominios: string[]
}): boolean {
  const { origin, propio, pagina, dominios } = opts
  if (!origin) return false
  // Pedido hecho directamente desde la web del cliente (sin marco).
  if (revisarOrigen(origin, dominios)) return true
  // Pedido hecho desde nuestra ventana: manda la página que la contiene.
  if (origin.replace(/\/$/, "") !== propio.replace(/\/$/, "")) return false
  return revisarOrigen(pagina ? (() => { try { return new URL(pagina).origin } catch { return "" } })() : "", dominios)
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
