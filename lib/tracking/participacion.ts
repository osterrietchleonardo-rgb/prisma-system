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

import { operacionDe } from "./proceso";

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
  /** Uno de los cuatro `ProcesoNegocio`, o null en las filas históricas. */
  proceso?: string | null;
  /** Postgres devuelve `numeric` como string, no como number. */
  monto_operacion?: number | string | null;
  comision_generada?: number | string | null;
  /** Agrupa las filas que son el mismo negocio. NULL = esta fila es su propia operación. */
  operacion_id?: string | null;
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

/**
 * La facturación bruta (GCI) de una lista: para cada cierre, el valor de la
 * operación por el porcentaje de honorarios. Mismo criterio que ya usaba el
 * dashboard, escrito una sola vez para que el desglose por tipo de operación no
 * vuelva a ser otra copia de la fórmula.
 */
export function gciDe(logs: readonly LogParaConteo[] | null | undefined): number {
  if (!logs) return 0;
  return logs
    .filter((l) => l.type === "cierre")
    .reduce((acc, l) => {
      const valor = Number(l.monto_operacion) || 0;
      const honorario = Number(l.comision_generada) || 0;
      return acc + (valor * honorario) / 100;
    }, 0);
}

/**
 * El volumen operado: cuánta plata en propiedades se movió.
 *
 * A diferencia del GCI, esto NO se puede sumar fila por fila. Cuando dos
 * asesores trabajan la misma venta —uno la punta del vendedor, el otro la del
 * comprador— hay dos filas con el mismo `monto_operacion`, pero la propiedad se
 * vendió una sola vez. Por eso las filas que comparten `operacion_id` aportan
 * el monto UNA vez. Las que lo tienen en NULL son cada una su propia operación,
 * que es lo que corresponde a todo lo cargado antes de que existiera la columna.
 *
 * Si dos filas de la misma operación traen montos distintos —un error de carga—
 * se toma el mayor. Quedarse con el menor haría desaparecer plata sin que nadie
 * lo note; el mayor deja el número alto y visible, que es el error que sí se
 * revisa.
 */
export function volumenDe(logs: readonly LogParaConteo[] | null | undefined): number {
  const cierres = (logs ?? []).filter((l) => l.type === "cierre");
  const porOperacion = new Map<string, number>();
  let sueltas = 0;

  for (const l of cierres) {
    const monto = Number(l.monto_operacion) || 0;
    if (!l.operacion_id) {
      sueltas += monto;
      continue;
    }
    porOperacion.set(l.operacion_id, Math.max(porOperacion.get(l.operacion_id) ?? 0, monto));
  }

  let total = sueltas;
  for (const monto of porOperacion.values()) total += monto;
  return total;
}

/**
 * El porcentaje que la inmobiliaria realmente cobró sobre lo que operó.
 *
 * Es GCI ÷ volumen, no el promedio de los porcentajes de cada fila. El promedio
 * simple —que es lo que había antes— no pesa por el tamaño de la operación: un
 * 2% sobre US$159.000 y un 7% sobre US$40.000 promedian 4,5%, cuando lo
 * realmente cobrado sobre lo vendido es 3,0%.
 */
export function honorarioRealDe(logs: readonly LogParaConteo[] | null | undefined): number {
  const volumen = volumenDe(logs);
  if (volumen <= 0) return 0;
  return (gciDe(logs) / volumen) * 100;
}

export interface MetricasDeCierre {
  transacciones: number;
  gci: number;
}

/**
 * Los mismos dos números, abiertos por tipo de operación.
 *
 * `sinDefinir` son los cierres históricos que se cargaron antes de que `proceso`
 * existiera. No se reparten entre venta y alquiler ni se suman a uno de los dos:
 * se muestran aparte cuando los hay. Por eso vale siempre que
 * `venta + alquiler + sinDefinir === total`, y la pantalla nunca miente sumando
 * de menos.
 */
export interface DesgloseDeCierres {
  total: MetricasDeCierre;
  venta: MetricasDeCierre;
  alquiler: MetricasDeCierre;
  sinDefinir: MetricasDeCierre;
}

export function desgloseDeCierres(
  logs: readonly LogParaConteo[] | null | undefined
): DesgloseDeCierres {
  const cierres = (logs ?? []).filter((l) => l.type === "cierre");
  const medir = (filas: LogParaConteo[]): MetricasDeCierre => ({
    transacciones: transaccionesDe(filas),
    gci: gciDe(filas),
  });

  return {
    total: medir(cierres),
    venta: medir(cierres.filter((l) => operacionDe(l.proceso) === "venta")),
    alquiler: medir(cierres.filter((l) => operacionDe(l.proceso) === "alquiler")),
    sinDefinir: medir(cierres.filter((l) => operacionDe(l.proceso) === null)),
  };
}
