import type { ActivityType } from "./types";

/**
 * De qué lado del negocio está el cliente en una actividad determinada.
 *
 * Existe porque una misma persona puede estar comprándonos y vendiéndonos a la
 * vez, y el tablero necesita poder seguirle los dos procesos por separado sin
 * que uno le tape al otro.
 */
export type ProcesoNegocio = "compra" | "venta";

/**
 * Las tres etapas donde el proceso NO se elige: ya lo dice la etapa.
 * Un prelisting o una captación son del lado del vendedor por definición, y un
 * prebuying del comprador. Dejarlas elegibles sólo habilitaría cargar un
 * registro que se contradice a sí mismo.
 */
export const PROCESO_FIJO: Partial<Record<ActivityType, ProcesoNegocio>> = {
  prelisting: "venta",
  captacion: "venta",
  prebuying: "compra",
};

/**
 * Las columnas del tablero que admite cada proceso. Prospección, reserva y
 * cierre son de los dos lados; el resto es de uno solo.
 */
export const ETAPAS_POR_PROCESO: Record<ProcesoNegocio, ActivityType[]> = {
  venta: ["prospeccion", "prelisting", "captacion", "reserva", "cierre"],
  compra: ["prospeccion", "prebuying", "reserva", "cierre"],
};

const TODAS_LAS_ETAPAS: ActivityType[] = [
  "prospeccion",
  "prelisting",
  "prebuying",
  "captacion",
  "reserva",
  "cierre",
];

/**
 * A dónde puede moverse una tarjeta. Las tarjetas sin proceso definido (las
 * históricas) no se bloquean: siguen comportándose como el tablero de antes.
 */
export function etapasPermitidas(proceso: ProcesoNegocio | null): ActivityType[] {
  return proceso ? ETAPAS_POR_PROCESO[proceso] : TODAS_LAS_ETAPAS;
}

/**
 * La clave de una tarjeta del tablero. La unidad ya no es el cliente sino el
 * par (cliente, proceso): por eso Matías comprador y Matías vendedor son dos
 * tarjetas distintas aunque sean la misma persona.
 */
export function cardKeyDe(clientKey: string, proceso: ProcesoNegocio | null): string {
  return `${clientKey}::${proceso ?? "sin-definir"}`;
}

/**
 * El valor que se escribe al resolver en un clic una tarjeta "Sin definir"
 * (botón en `PipelineClientSheet`, action `asignarProcesoATarjeta`).
 *
 * Si la etapa de la fila tiene un lado fijo (Prelisting/Captación = venta,
 * Prebuying = compra) ese lado gana siempre, sin importar qué botón haya
 * tocado el asesor. Es lo que hace que la escritura sea segura por
 * construcción: nunca puede producir un valor que el CHECK de la base
 * (`performance_logs_proceso_coherente`) vaya a rechazar.
 */
export function procesoParaResolucion(
  type: ActivityType,
  elegido: ProcesoNegocio
): ProcesoNegocio {
  return PROCESO_FIJO[type] ?? elegido;
}

export function labelDeProceso(proceso: ProcesoNegocio | null): string {
  if (proceso === "compra") return "Compra";
  if (proceso === "venta") return "Venta";
  return "Sin definir";
}

const BADGES = {
  compra: {
    label: "COMPRA",
    // Violeta: el mismo color con el que la columna Prebuying se identifica.
    className: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  },
  venta: {
    label: "VENTA",
    // Índigo: el color de la columna Prelisting.
    className: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  },
  "sin-definir": {
    label: "SIN DEFINIR",
    className: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
} as const;

export function badgeDeProceso(
  proceso: ProcesoNegocio | null
): { label: string; className: string } {
  return BADGES[proceso ?? "sin-definir"];
}
