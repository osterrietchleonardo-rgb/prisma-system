/**
 * Encontrar cierres que parecen la misma operación y todavía no están enlazados.
 *
 * Es la red del aviso automático que ve el asesor al cargar. Ese aviso no
 * alcanza en dos casos reales:
 *  - el segundo asesor nunca cargó su punta, y aparece semanas después;
 *  - la dirección se escribió tan distinta que no coincidió.
 *
 * Acá el que mira es el director, que ya ve toda la agencia: no hay nada que
 * ocultarle, así que puede decidir con la dirección, los dos asesores, las dos
 * fechas y los dos montos a la vista. Por eso este módulo puede ser más
 * permisivo que el aviso a ciegas: mostrar un par de más sólo le cuesta un
 * clic, mientras que al asesor le costaba un enlace equivocado.
 */

import { direccionesCoinciden } from "./direcciones";
import { puedenSerLasDosPuntas } from "./enlace";

export interface CierreParaAparear {
  id: string;
  agent_id?: string | null;
  operacion_id?: string | null;
  propiedad_ref?: string | null;
  monto_operacion?: number | string | null;
  comision_generada?: number | string | null;
  fecha_actividad?: string | null;
  metadata?: { propiedad_colaboracion?: unknown; participacion?: unknown } | null;
}

export interface ParSospechoso {
  a: CierreParaAparear;
  b: CierreParaAparear;
}

/** La dirección de un cierre, esté donde esté escrita. */
function direccionDe(c: CierreParaAparear): string {
  const colaboracion = c.metadata?.propiedad_colaboracion;
  return String(c.propiedad_ref || (typeof colaboracion === "string" ? colaboracion : "") || "");
}

/**
 * Los pares de cierres SUELTOS que parecen la misma operación.
 *
 * Sólo mira los que tienen `operacion_id` vacío. Los ya enlazados no se
 * proponen —ya están resueltos— y los que el director marcó como distintos
 * tampoco, porque marcarlos les da a cada uno su propia operación y dejan de
 * estar sueltos. Así un "no son la misma" no vuelve a aparecer nunca, sin
 * necesidad de guardar la decisión en ningún lado.
 *
 * Condiciones para proponer un par:
 *  - los dos sin operación,
 *  - de asesores distintos (un mismo asesor con las dos puntas carga una sola
 *    fila con "Ambas puntas"),
 *  - direcciones que coinciden,
 *  - y puntas que pueden ser complementarias.
 */
export function paresSospechosos(cierres: readonly CierreParaAparear[]): ParSospechoso[] {
  const sueltos = cierres.filter((c) => !c.operacion_id);
  const pares: ParSospechoso[] = [];

  // Comparación de todos contra todos. Es cuadrática, así que quien la llama
  // acota por período: con unos cientos de cierres es instantánea, con decenas
  // de miles no lo sería.
  for (let i = 0; i < sueltos.length; i++) {
    for (let j = i + 1; j < sueltos.length; j++) {
      const a = sueltos[i];
      const b = sueltos[j];

      if (a.agent_id && b.agent_id && a.agent_id === b.agent_id) continue;
      if (!direccionesCoinciden(direccionDe(a), direccionDe(b))) continue;
      if (!puedenSerLasDosPuntas(a.metadata?.participacion, b.metadata?.participacion)) continue;

      pares.push({ a, b });
    }
  }

  return pares;
}

/**
 * Los cierres ya enlazados, agrupados por operación, para que el director pueda
 * revisarlos y separarlos si alguno se enlazó mal.
 *
 * Devuelve sólo los grupos de dos o más: una operación con una sola fila es la
 * que el director marcó como distinta de otra, y no hay nada que revisar ahí.
 */
export function operacionesEnlazadas(
  cierres: readonly CierreParaAparear[]
): { operacionId: string; filas: CierreParaAparear[] }[] {
  const porOperacion = new Map<string, CierreParaAparear[]>();

  for (const c of cierres) {
    if (!c.operacion_id) continue;
    const grupo = porOperacion.get(c.operacion_id);
    if (grupo) grupo.push(c);
    else porOperacion.set(c.operacion_id, [c]);
  }

  return Array.from(porOperacion.entries())
    .filter(([, filas]) => filas.length > 1)
    .map(([operacionId, filas]) => ({ operacionId, filas }));
}
