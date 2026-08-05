import type { Bucket } from "./types"

/**
 * Rango de tiempo de una respuesta. Los umbrales son los mismos que usa el panel de
 * handoffs sin atender (demorado a las 2h, crítico a las 24h), abiertos a 1h y 4h para
 * que el director vea dónde se traba.
 *
 * Los bordes caen para arriba: exactamente 1h ya es "1-4h".
 */
export function bucketOf(hours: number | null): Bucket {
  if (hours === null) return "sin atender"
  if (hours < 1) return "<1h"
  if (hours < 4) return "1-4h"
  if (hours < 24) return "4-24h"
  return "+24h"
}
