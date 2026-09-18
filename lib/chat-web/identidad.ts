/**
 * Chat web · Quién es el visitante (pregunta de Leonardo, 17/9).
 *
 * "¿Cómo se hace para que la conversación de un cliente no la vea otro, si no está logueado?"
 *
 * Antes la identidad la ponía el propio navegador: la ventana generaba un número, lo guardaba y
 * lo mandaba en cada mensaje. Andaba, pero tenía un defecto de fondo: **el que llama dice quién
 * es**. Con el número de otra persona, el asistente hubiera seguido SU conversación y podría
 * haber repetido lo que esa persona contó (su nombre, su teléfono, lo que busca).
 *
 * Ahora la identidad la pone el servidor en una cookie del navegador, y el pedido no puede
 * elegirla:
 * - `HttpOnly`: no la puede leer ningún JavaScript, ni el de la web del cliente.
 * - `Partitioned`: el navegador la guarda separada por sitio, así que el chat puesto en dos
 *   inmobiliarias distintas son dos visitantes distintos, aunque sea la misma persona.
 * - vive en nuestro dominio, no en el del cliente: su web nunca ve este dato.
 *
 * Si el navegador bloquea las cookies, el chat funciona igual, pero sin memoria entre recargas:
 * cada vez es una conversación nueva. Es la falla correcta — se pierde comodidad, no privacidad.
 */

/** 90 días: si vuelve el mes que viene, sigue su conversación. */
const DURACION = 90 * 24 * 60 * 60

/** Una cookie por widget: el chat de dos inmobiliarias no se mezcla. */
export function nombreDeCookie(widgetId: string): string {
  return `pcw_${String(widgetId ?? "").replace(/-/g, "").slice(0, 8)}`
}

export function esIdDeVisitante(valor: unknown): boolean {
  return /^[0-9a-f]{32}$/i.test(String(valor ?? ""))
}

/** El visitante que dice el navegador. `null` si no hay cookie o si viene rara. */
export function leerVisitante(cookieHeader: string | null | undefined, widgetId: string): string | null {
  const buscado = nombreDeCookie(widgetId)
  for (const trozo of String(cookieHeader ?? "").split(";")) {
    const i = trozo.indexOf("=")
    if (i < 0) continue
    if (trozo.slice(0, i).trim() !== buscado) continue
    const valor = trozo.slice(i + 1).trim()
    return esIdDeVisitante(valor) ? valor : null
  }
  return null
}

/**
 * La cookie para mandar al navegador. `seguro` es true en https: en la máquina (http) el
 * navegador rechaza `Secure`, y sin esto no se podría probar nada en local.
 */
export function cookieDeVisitante(widgetId: string, id: string, seguro: boolean): string {
  const base = `${nombreDeCookie(widgetId)}=${id}; Path=/; Max-Age=${DURACION}; HttpOnly`
  return seguro ? `${base}; Secure; SameSite=None; Partitioned` : `${base}; SameSite=Lax`
}
