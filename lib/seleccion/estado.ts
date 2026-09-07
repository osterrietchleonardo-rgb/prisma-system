// La lógica de la selección, sin React: qué entra, qué sale, el tope y las notas.
// Vive separada del contexto para poder probarla con vitest sin montar nada.
import type { FuentePropiedad } from "@/lib/ficha/snapshot"

/** Mismo tope que la ficha del ACM: 12 hojas ya son muchas para mandar por WhatsApp. */
export const TOPE_SELECCION = 12

export interface ItemSeleccion {
  id: string
  source: FuentePropiedad
  /** Lo mínimo para dibujar el repaso sin volver a pedir nada a la base. */
  titulo: string
  precio: number
  moneda: string
  foto: string | null
  nota: string
}

export type Candidata = Omit<ItemSeleccion, "nota">

export function estaElegida(items: ItemSeleccion[], id: string): boolean {
  return items.some((i) => i.id === id)
}

export function sacar(items: ItemSeleccion[], id: string): ItemSeleccion[] {
  return items.filter((i) => i.id !== id)
}

export function anotar(items: ItemSeleccion[], id: string, nota: string): ItemSeleccion[] {
  return items.map((i) => (i.id === id ? { ...i, nota } : i))
}

/**
 * Agrega o saca. Sacar SIEMPRE se puede, aunque esté en el tope: si no, con 12 marcadas
 * el asesor no podría cambiar una por otra sin vaciar todo.
 */
export function alternar(
  items: ItemSeleccion[],
  c: Candidata,
): { items: ItemSeleccion[]; error?: string } {
  if (estaElegida(items, c.id)) return { items: sacar(items, c.id) }
  if (items.length >= TOPE_SELECCION) {
    return {
      items,
      error: `Podés elegir hasta ${TOPE_SELECCION} propiedades para una misma ficha.`,
    }
  }
  return { items: [...items, { ...c, nota: "" }] }
}
