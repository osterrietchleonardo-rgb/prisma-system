/**
 * Con qué operación hay que enlazar un cierre nuevo, y a quién más hay que
 * estamparle esa operación.
 *
 * Está separado del action que lo usa (`actions/tracking/enlazarOperacion.ts`)
 * porque acá vive lo único que puede decidir mal: qué pasa cuando hay varias
 * candidatas, cuando algunas ya están enlazadas entre sí, y cuando hay dos
 * operaciones distintas en la misma dirección. Las llamadas a la base son
 * plomería; esto es el criterio.
 */

export interface CandidataDeEnlace {
  id: string;
  operacion_id?: string | null;
}

export interface DecisionDeEnlace {
  /** El id con el que se guarda el cierre nuevo. null = no se enlaza con nada. */
  operacionId: string | null;
  /** Las filas ya existentes a las que hay que escribirles ese id. */
  aEnlazar: string[];
}

const SIN_ENLACE: DecisionDeEnlace = { operacionId: null, aEnlazar: [] };

/**
 * `nuevoId` se pasa como argumento y no se genera adentro para que la decisión
 * sea determinística y se pueda probar sin mirar un uuid al azar.
 */
export function decidirEnlace(
  candidatas: readonly CandidataDeEnlace[],
  nuevoId: () => string
): DecisionDeEnlace {
  if (candidatas.length === 0) return SIN_ENLACE;

  const operacionesYaExistentes = Array.from(
    new Set(candidatas.map((c) => c.operacion_id).filter((v): v is string => !!v))
  );

  // Dos operaciones distintas en la misma dirección: por ejemplo la misma
  // propiedad vendida dos veces en el año. No hay forma de saber cuál es la del
  // asesor, y el aviso que él confirmó no le mostraba ninguna en particular.
  //
  // Enlazar a la que sea haría desaparecer una venta entera del volumen. No
  // enlazar sólo lo deja inflado, y el director puede unirlas después. Ante la
  // duda, la que se puede corregir.
  if (operacionesYaExistentes.length > 1) return SIN_ENLACE;

  const operacionId = operacionesYaExistentes[0] ?? nuevoId();

  return {
    operacionId,
    // Las que ya la tienen no se tocan: escribirles el mismo valor no cambia
    // nada y ensucia el `updated_at` de la fila de otro asesor.
    aEnlazar: candidatas.filter((c) => !c.operacion_id).map((c) => c.id),
  };
}
