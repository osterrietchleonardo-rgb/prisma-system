import type { Candidato, CompromisoActivo } from "./tipos"

/** Claves de metricas con señal de compra. Verificadas 24/8 contra el volcado real (Task 0). */
const SENALES_POSITIVAS: Array<[clave: string, puntos: number]> = [
  ["presupuesto_max", 30], // la clave real (no existe "presupuesto")
  ["zona", 15],
  ["propiedad_interes", 25],
  ["apto_credito", 10],
  ["urgencia", 15],
  ["email", 10],
]

export function calcularScore(c: Candidato, compromisos: CompromisoActivo[]): number {
  let score = 0

  // La señal más fuerte: compromiso vencido o por vencer en <6h
  const seisHoras = Date.now() + 6 * 3600e3
  if (compromisos.some((k) => k.vence_en && new Date(k.vence_en).getTime() < seisHoras))
    score += 40

  for (const [clave, puntos] of SENALES_POSITIVAS) {
    const v = c.metricas?.[clave]
    if (v !== undefined && v !== null && String(v).trim() !== "" && String(v) !== "false")
      score += puntos
  }

  if (c.visit_status === "completed" || c.funnel_status === "visited") score += 20
  score -= 10 * c.follow_ups_sent // cada intento sin respuesta enfría

  return Math.max(0, score)
}
