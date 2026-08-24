/**
 * Buzón para pasar una foto de la galería a la solapa Fotos.
 *
 * No alcanza con un evento: mientras el asesor está en Historial, el panel de
 * Fotos está desmontado y no hay nadie escuchando. Así que la galería deja la
 * foto acá, la solapa la levanta cuando monta, y el evento queda solo para el
 * caso en que ya estuviera montada.
 */

export type FotoRetomada = {
  url: string;
  referencia_url: string;
  relevamiento: any | null;
  tokko_id: number | string | null;
  propiedad: string;
  /** Para que el retoque entre en la tarjeta que ya existe, y no abra otra. */
  sesion_id?: string | null;
};

let pendiente: FotoRetomada | null = null;

export const EVENTO_RETOMAR = "retomar-foto-ia";

export function dejarFotoParaEditar(foto: FotoRetomada) {
  pendiente = foto;
  window.dispatchEvent(new CustomEvent(EVENTO_RETOMAR, { detail: foto }));
}

/** La devuelve una sola vez: si se vuelve a entrar, ya no está. */
export function tomarFotoPendiente(): FotoRetomada | null {
  const f = pendiente;
  pendiente = null;
  return f;
}
