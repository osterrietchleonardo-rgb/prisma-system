import { BUCKETS, type AgentRow, type Bucket, type DerivationEvent, type SignalRow } from "./types"
import { bucketOf } from "./buckets"

function bucketsVacios(): Record<Bucket, number> {
  return Object.fromEntries(BUCKETS.map((b) => [b, 0])) as Record<Bucket, number>
}

function porcentaje(parte: number, total: number): number | null {
  return total ? Math.round((parte / total) * 100) : null
}

/**
 * Agrupa los eventos por asesor en el mismo orden en que se leen y devuelve las filas
 * ordenadas por volumen, con TOTAL al final.
 *
 * El genérico es para no repetir el agrupar/ordenar/totalizar en las dos tablas.
 */
function agrupar<T extends { agent: string; total: number }>(
  events: DerivationEvent[],
  filaVacia: (agent: string) => T,
  acumular: (fila: T, ev: DerivationEvent) => void,
  cerrar: (fila: T) => T,
): T[] {
  const porAsesor = new Map<string, T>()
  const total = filaVacia("TOTAL")

  for (const ev of events) {
    let fila = porAsesor.get(ev.agentName)
    if (!fila) {
      fila = filaVacia(ev.agentName)
      porAsesor.set(ev.agentName, fila)
    }
    acumular(fila, ev)
    acumular(total, ev)
  }

  const filas = [...porAsesor.values()]
  // Más derivaciones primero; a igual volumen, alfabético, para que el orden sea estable
  // semana a semana y el director pueda comparar.
  filas.sort((a, b) => b.total - a.total || a.agent.localeCompare(b.agent, "es"))

  return [...filas.map(cerrar), cerrar(total)]
}

/** Tabla de handoffs: intervención en el chat, repartida por rango de tiempo. */
export function buildAgentRows(events: DerivationEvent[]): AgentRow[] {
  return agrupar<AgentRow>(
    events,
    (agent) => ({ agent, total: 0, attended: 0, pct: null, buckets: bucketsVacios() }),
    (fila, ev) => {
      fila.total++
      if (ev.replyHours !== null) fila.attended++
      fila.buckets[bucketOf(ev.replyHours)]++
    },
    (fila) => ({ ...fila, pct: porcentaje(fila.attended, fila.total) }),
  )
}

/** Tabla de visita y link: las tres señales por separado, sin mezclarlas en un %. */
export function buildSignalRows(events: DerivationEvent[]): SignalRow[] {
  return agrupar<SignalRow>(
    events,
    (agent) => ({ agent, total: 0, chat: 0, visita: 0, email: 0, sinRastro: 0 }),
    (fila, ev) => {
      fila.total++
      if (ev.replyHours !== null) fila.chat++
      if (ev.visitScheduled) fila.visita++
      if (ev.emailClicked) fila.email++
      if (ev.replyHours === null && !ev.visitScheduled && !ev.emailClicked) fila.sinRastro++
    },
    (fila) => fila,
  )
}
