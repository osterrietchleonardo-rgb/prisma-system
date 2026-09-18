/**
 * Chat web · El freno por conexión (Leonardo, 17/9: "hay que ver el freno por IP, es importante").
 *
 * Los topes que ya existían se miden POR CONVERSACIÓN, y una conversación la abre cualquiera:
 * basta con borrar lo que el navegador guardó para empezar otra. Este freno mira la conexión, que
 * es lo que no se cambia tan fácil.
 *
 * Sin Upstash configurado no hay dónde llevar la cuenta, así que se cuenta contra los mensajes ya
 * guardados: una consulta más por mensaje, sobre un índice, en una tabla chica.
 *
 * **Nunca se guarda la IP.** Se guarda una huella irreversible (la IP mezclada con un secreto
 * nuestro): sirve para contar y para nada más. Si alguien se lleva la base, no se lleva las IP de
 * los visitantes de nuestros clientes.
 */
import { createHash } from "node:crypto"

export const LIMITES_IP = {
  /**
   * 60 mensajes cada 10 minutos. Es mucho más que una conversación de venta (10-20), y a
   * propósito: en una oficina, un edificio o un celular con datos móviles, muchas personas
   * comparten la misma conexión. El tope está para cortar un bucle, no para apretar a nadie.
   */
  mensajesPorVentana: 60,
  minutosDeVentana: 10,
}

const ES_IP =
  /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|[0-9a-f:]+)$/i

/** De qué conexión viene el pedido, mirando las cabeceras que pone el proxy. */
export function ipDelPedido(headers: Headers): string | null {
  const candidatas = [
    headers.get("x-forwarded-for")?.split(",")[0],
    headers.get("x-real-ip"),
    headers.get("cf-connecting-ip"),
  ]
  for (const c of candidatas) {
    const limpia = String(c ?? "").trim()
    if (limpia && ES_IP.test(limpia)) return limpia
  }
  return null
}

/**
 * La huella de una IP: irreversible y distinta por agencia, así que la huella de una no sirve
 * para cruzar datos en otra.
 */
export function huellaDeIp(ip: string | null | undefined, sal: string): string | null {
  const limpia = String(ip ?? "").trim()
  if (!limpia) return null
  return createHash("sha256").update(`${sal}:${limpia}`).digest("hex").slice(0, 32)
}

export function pasaElFreno(mensajesEnLaVentana: number): boolean {
  return mensajesEnLaVentana < LIMITES_IP.mensajesPorVentana
}
