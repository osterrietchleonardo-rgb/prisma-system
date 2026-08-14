// Mapa · la escala de colores del precio por m2.
//
// Rojo = mas caro, verde = mas barato.
import type { BBox } from "./tipos.ts"

export interface CeldaPrecio extends BBox {
  mediana_m2: number
  propiedades: number
}

/** Una manzana real: el contorno viene como pares [lat, lng], listo para Leaflet. */
export interface ManzanaPrecio {
  id: number
  contorno: [number, number][]
  mediana_m2: number
  propiedades: number
}

export interface BarrioPrecio {
  nombre: string
  mediana_m2: number
  propiedades: number
}

/** Cinco escalones, de barato a caro. */
export const COLORES = ["#16a34a", "#84cc16", "#facc15", "#f97316", "#dc2626"]

/**
 * Los cuatro cortes que parten los valores en cinco grupos del mismo tamano.
 *
 * POR QUE POR CUANTILES Y NO POR VALOR FIJO
 * Una escala fija (0-1000 verde, 1000-2000 amarillo...) pinta Puerto Madero entero de
 * rojo y La Matanza entera de verde: dentro de cada zona no se distingue nada, que es
 * justo lo que uno quiere ver. Con cuantiles el color siempre compara contra lo que hay
 * EN PANTALLA, asi que al acercarse a un barrio se ven las diferencias internas.
 *
 * La contra es que el color no significa lo mismo en dos pantallas distintas. Por eso la
 * referencia de la pantalla muestra los numeros, no solo los colores.
 */
export function cortesDeEscala(valores: number[]): number[] {
  const ordenados = [...valores].sort((a, b) => a - b)
  if (ordenados.length === 0) return []
  return [0.2, 0.4, 0.6, 0.8].map(
    (q) => ordenados[Math.min(ordenados.length - 1, Math.floor(q * ordenados.length))],
  )
}

export function colorDe(valor: number, cortes: number[]): string {
  if (cortes.length === 0) return COLORES[2]
  let i = 0
  while (i < cortes.length && valor >= cortes[i]) i++
  return COLORES[i]
}

/** "US$ 2.040" — sin decimales, que en un precio por metro no aportan nada. */
export function formatearM2(valor: number, moneda: string): string {
  const simbolo = moneda === "ARS" ? "$" : "US$"
  return `${simbolo} ${Math.round(valor).toLocaleString("es-AR")}`
}

/**
 * Los cinco tramos con su color y su rango, para dibujar la referencia.
 *
 * Se arma desde los MISMOS cortes con los que se pinta: si se calcularan aparte, la
 * referencia podria decir una cosa y el mapa mostrar otra.
 */
export function tramosDeReferencia(
  valores: number[],
  cortes: number[],
  moneda: string,
): { color: string; texto: string }[] {
  if (valores.length === 0 || cortes.length === 0) return []
  const min = Math.min(...valores)
  const max = Math.max(...valores)
  const bordes = [min, ...cortes, max]

  return COLORES.map((color, i) => ({
    color,
    texto:
      i === 0
        ? `hasta ${formatearM2(bordes[1], moneda)}`
        : i === COLORES.length - 1
          ? `desde ${formatearM2(bordes[i], moneda)}`
          : `${formatearM2(bordes[i], moneda)} – ${formatearM2(bordes[i + 1], moneda)}`,
  }))
}
