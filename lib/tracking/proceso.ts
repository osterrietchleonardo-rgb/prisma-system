import type { ActivityType } from "./types";

/**
 * Qué es esta persona en esta actividad puntual.
 *
 * Absorbe al viejo "Tipo de Lead" (que sólo se preguntaba en Prospección):
 * un cliente puede vendernos una propiedad y a la vez buscar otra para
 * comprar, o alquilar la que tiene y buscar otra para alquilarse — el
 * tablero necesita poder seguirle cada proceso por separado sin que uno le
 * tape al otro.
 */
export type ProcesoNegocio = "vendedor" | "comprador" | "locador" | "locatario";

/**
 * El lado del negocio ya no es un valor que se guarda: se deriva del
 * proceso. "Ofrece" es quien tiene una propiedad (para vender o alquilar);
 * "busca" es quien quiere una (para comprar o alquilarse).
 */
export type LadoDelNegocio = "ofrece" | "busca";

export function ladoDelNegocio(proceso: ProcesoNegocio | null): LadoDelNegocio | null {
  if (proceso === "vendedor" || proceso === "locador") return "ofrece";
  if (proceso === "comprador" || proceso === "locatario") return "busca";
  return null;
}

/**
 * Qué valores de proceso admite cada etapa. Reemplaza al viejo `PROCESO_FIJO`:
 * antes cada etapa fija tenía UN solo valor posible (una captación sólo podía
 * ser "venta"), pero ahora una captación puede ser de un vendedor o de un
 * locador — dos opciones válidas, no una. Por eso el campo dejó de venir
 * relleno y bloqueado en esas etapas: hay que preguntar cuál de las dos es.
 *
 * Prospección, Reserva y Cierre siguen siendo de los cuatro valores: ahí el
 * asesor elige a conciencia, sin default.
 */
export const PROCESOS_POR_ETAPA: Record<ActivityType, ProcesoNegocio[]> = {
  prospeccion: ["vendedor", "comprador", "locador", "locatario"],
  prelisting: ["vendedor", "locador"],
  captacion: ["vendedor", "locador"],
  prebuying: ["comprador", "locatario"],
  reserva: ["vendedor", "comprador", "locador", "locatario"],
  cierre: ["vendedor", "comprador", "locador", "locatario"],
};

/** Las columnas del tablero que corresponden a cada lado del negocio. */
const ETAPAS_POR_LADO: Record<LadoDelNegocio, ActivityType[]> = {
  ofrece: ["prospeccion", "prelisting", "captacion", "reserva", "cierre"],
  busca: ["prospeccion", "prebuying", "reserva", "cierre"],
};

/**
 * Las columnas del tablero que admite cada proceso. Se deriva del lado:
 * vendedor y locador comparten las mismas etapas (las de quien ofrece);
 * comprador y locatario comparten las suyas (las de quien busca). El
 * bloqueo al arrastrar sigue siendo el mismo de antes, sólo que ahora hay
 * cuatro procesos repartidos en dos lados en vez de dos procesos sueltos.
 */
export const ETAPAS_POR_PROCESO: Record<ProcesoNegocio, ActivityType[]> = {
  vendedor: ETAPAS_POR_LADO.ofrece,
  locador: ETAPAS_POR_LADO.ofrece,
  comprador: ETAPAS_POR_LADO.busca,
  locatario: ETAPAS_POR_LADO.busca,
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

export function labelDeProceso(proceso: ProcesoNegocio | null): string {
  switch (proceso) {
    case "vendedor":
      return "Vendedor";
    case "comprador":
      return "Comprador";
    case "locador":
      return "Locador";
    case "locatario":
      return "Locatario";
    default:
      return "Sin definir";
  }
}

// El color comunica el lado (índigo = ofrece, violeta = busca); el texto
// comunica el valor exacto. Así se ve de un golpe de qué lado está la
// tarjeta, y se lee sin ambigüedad cuál de los dos procesos de ese lado es.
const COLOR_OFRECE = "bg-indigo-500/15 text-indigo-400 border-indigo-500/30";
const COLOR_BUSCA = "bg-violet-500/15 text-violet-400 border-violet-500/30";

const BADGES: Record<ProcesoNegocio | "sin-definir", { label: string; className: string }> = {
  vendedor: { label: "VENDEDOR", className: COLOR_OFRECE },
  locador: { label: "LOCADOR", className: COLOR_OFRECE },
  comprador: { label: "COMPRADOR", className: COLOR_BUSCA },
  locatario: { label: "LOCATARIO", className: COLOR_BUSCA },
  "sin-definir": {
    label: "SIN DEFINIR",
    className: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
};

export function badgeDeProceso(
  proceso: ProcesoNegocio | null
): { label: string; className: string } {
  return BADGES[proceso ?? "sin-definir"];
}

/**
 * Los procesos que se le pueden asignar a una tarjeta entera: los que sirven
 * para TODAS sus etapas (la intersección de `PROCESOS_POR_ETAPA` a lo largo
 * de las actividades de la tarjeta). Reemplaza a `procesoParaResolucion`: ya
 * no hay un único valor por fila que "forzar" cuando una etapa fija admite
 * dos opciones, así que el resolutor de "Sin definir" ofrece un solo valor
 * para toda la tarjeta, y solo entre los que le sirven a cada una de sus
 * actividades.
 *
 * Vacío cuando la tarjeta mezcla los dos lados del negocio (por ejemplo una
 * prelisting y una prebuying juntas, en una tarjeta que nunca tuvo proceso
 * definido) — un estado real y alcanzable, no un caso de error.
 */
export function procesosPosiblesParaTarjeta(tipos: ActivityType[]): ProcesoNegocio[] {
  if (tipos.length === 0) return [];
  const [primero, ...resto] = tipos;
  return PROCESOS_POR_ETAPA[primero].filter((p) =>
    resto.every((tipo) => PROCESOS_POR_ETAPA[tipo].includes(p))
  );
}
