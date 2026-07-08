export type Semaforo = "verde" | "amarillo" | "rojo" | "gris"

export interface AuditSnapshot {
  experto: "whatsapp" | "sistema" | "redes"
  scope: string // 'global' o agency_id (uuid)
  semaforo: Semaforo
  resumen: string
  metricas: Record<string, unknown>
}

const ORDEN: Record<Semaforo, number> = { gris: 0, verde: 1, amarillo: 2, rojo: 3 }

/** Devuelve el semáforo más grave de una lista (rojo manda). Ignora 'gris' salvo que sea el único. */
export function peorSemaforo(vals: Semaforo[]): Semaforo {
  const reales = vals.filter((v) => v !== "gris")
  const lista = reales.length ? reales : vals
  return lista.reduce((peor, v) => (ORDEN[v] > ORDEN[peor] ? v : peor), "verde" as Semaforo)
}
