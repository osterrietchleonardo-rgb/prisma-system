/**
 * Los inputs numéricos del ACM se escribían como `value={sujeto.piso || ''}`, y en JavaScript
 * el 0 es "falso": apenas el asesor escribía 0, el campo se vaciaba solo. En el ACM el 0 es un
 * valor real y frecuente —piso 0 es planta baja, 0 dormitorios es un monoambiente, 0 m²
 * cubiertos es un lote— así que el formulario estaba rechazando dato bueno. La etiqueta del
 * campo llegaba a decir "Piso (0 = PB)" mientras el input no lo aceptaba.
 */

/** Lo que se muestra en el input: el 0 se ve; lo que nunca se cargó, no. */
export const verNumero = (n: number | null | undefined): string =>
  typeof n === "number" && !Number.isNaN(n) ? String(n) : ""

/**
 * Lo que se guarda al tipear. El campo vacío queda SIN CARGAR (undefined), no en 0: si no,
 * un formulario en blanco afirmaría que la propiedad es planta baja y monoambiente. Nunca NaN.
 */
export const leerNumero = (v: string): number | undefined => {
  const n = Number(v)
  return v.trim() === "" || Number.isNaN(n) ? undefined : n
}
