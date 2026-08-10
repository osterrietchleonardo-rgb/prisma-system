// Condensador de descripciones para la app (ficha del ACM).
//
// UNA SOLA FUENTE DE VERDAD: la implementación real vive en `roomix-sync/condensar-descripcion.mjs`,
// porque ese archivo también lo usa el worker del crawler (que se empaqueta en su propio Docker y no
// puede importar TypeScript). Es JS puro y autocontenido —sin imports, sin `fs`, sin red— así que
// se puede importar tal cual desde un server component. Acá solo se le pone el tipo.
//
// Si tocás las reglas del condensado, se toca en el .mjs y aplica a los dos lados.
import { condensarDescripcion as condensar } from "@/roomix-sync/condensar-descripcion.mjs";

/** Presupuesto de la hoja del comparable: la hoja es un A4 EXACTO y el bloque son 3 líneas. */
export const MAX_DESC_FICHA_ACM = 380;

/**
 * Descripción de un aviso → resumen ordenado (Superficie · Interior · Ubicación · Edificio),
 * sin letra chica ni datos de contacto de la inmobiliaria publicante. Determinista, sin IA.
 * Nunca corta a mitad de palabra: si un ítem no entra, no entra entero.
 */
export function condensarDescripcion(texto: string, max: number = MAX_DESC_FICHA_ACM): string {
  return (condensar as (t: string, m?: number) => string)(texto || "", max);
}
