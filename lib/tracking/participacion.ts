/**
 * Cuánto negocio vale un cierre según a cuántas partes representó el asesor.
 *
 * Por qué existe este archivo: la regla estaba escrita TRES veces a mano dentro
 * de `lib/queries/dashboard.ts` —el total de la agencia, el ranking por asesor y
 * la evolución mensual— y dos de esas tres copias se habían quedado con la lista
 * vieja de dos valores (`Solo Comprador` / `Solo Vendedor`), de cuando el sistema
 * todavía no distinguía alquileres. Resultado: un alquiler de una sola punta
 * contaba 0,5 negocios en el total de la agencia y 1 negocio entero en el ranking
 * y en el gráfico mensual. Los tres números salían del mismo dato y no coincidían
 * entre sí.
 *
 * La regla vive acá una sola vez y los tres lugares la llaman. Si mañana aparece
 * una participación nueva, se agrega en un solo lugar y no puede volver a
 * desincronizarse.
 */

/** A cuántas partes del negocio representó el asesor en el cierre. */
export type Participacion =
  | "Ambas puntas"
  | "Solo Vendedor"
  | "Solo Comprador"
  | "Solo Locador"
  | "Solo Locatario";

/**
 * Las cinco opciones, en el mismo orden en que las ofrece el formulario
 * (`components/tracking/PerformanceLogForm.tsx`). Los textos son EXACTOS: es lo
 * que quedó guardado en `metadata.participacion` de cada cierre ya cargado, así
 * que cambiarle una mayúscula a cualquiera de estos valores deja de contar bien
 * todo lo histórico.
 */
export const PARTICIPACIONES: readonly Participacion[] = [
  "Ambas puntas",
  "Solo Comprador",
  "Solo Vendedor",
  "Solo Locador",
  "Solo Locatario",
] as const;

/** Las cuatro que valen medio negocio: el asesor trabajó una sola punta. */
const UNA_SOLA_PUNTA: ReadonlySet<string> = new Set<Participacion>([
  "Solo Vendedor",
  "Solo Comprador",
  "Solo Locador",
  "Solo Locatario",
]);

/** La forma mínima que necesita el conteo. Las filas llegan de Supabase con `select("*")`. */
export interface LogParaConteo {
  type?: string | null;
  metadata?: { participacion?: unknown } | null;
}

/**
 * Cuántos negocios vale UN cierre: 1 si representó a las dos partes, 0,5 si
 * trabajó una sola punta.
 *
 * El default es 1 a propósito, y no 0,5: los cierres viejos se cargaron cuando el
 * campo Participación todavía no existía, y quedaron con `metadata.participacion`
 * vacío. Contarlos como medio negocio le bajaría a cada asesor la mitad de su
 * historia por un campo que en su momento nadie le pidió. Ante la duda, el
 * negocio se cuenta entero. Ese criterio ya era el del total de la agencia: acá
 * no se cambia, solo se escribe una vez.
 */
export function negociosDeCierre(participacion: unknown): number {
  if (participacion === "Ambas puntas") return 1;
  if (typeof participacion === "string" && UNA_SOLA_PUNTA.has(participacion)) return 0.5;
  return 1;
}

/**
 * Cuántos negocios suman los cierres de una lista de actividades. Filtra las que
 * no son cierres, así los tres lugares que la usan le pasan su lista completa sin
 * repetir el filtro (que era justamente la parte que se copiaba y se desfasaba).
 */
export function transaccionesDe(logs: readonly LogParaConteo[] | null | undefined): number {
  if (!logs) return 0;
  return logs
    .filter((l) => l.type === "cierre")
    .reduce((acc, l) => acc + negociosDeCierre(l.metadata?.participacion), 0);
}
