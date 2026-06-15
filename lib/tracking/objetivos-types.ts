// Tipos y utilidades PURAS de objetivos (sin dependencias de server/next/headers).
// Seguro para importar desde componentes cliente y desde el server.

export type ObjectiveMetric = "facturacion" | "captacion";

export const OBJECTIVE_METRICS: { key: ObjectiveMetric; label: string; unit: "usd" | "count" }[] = [
  { key: "facturacion", label: "Facturación", unit: "usd" },
  { key: "captacion", label: "Captación", unit: "count" },
];

export const MONTH_NAMES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

export interface ObjectiveRow {
  id?: string;
  agent_id: string;
  year: number;
  month: number; // 1-12
  metric: ObjectiveMetric;
  target_value: number;
}

export interface AdvisorObjectives {
  agentId: string;
  name: string;
  // metric -> month(1-12) -> { objetivo, alcanzado, pct }
  metrics: Record<ObjectiveMetric, Record<number, { objetivo: number; alcanzado: number; pct: number | null }>>;
}

/**
 * Devuelve qué meses están cerrados (no editables) para un año dado.
 * Regla confirmada: mes en curso + futuros editables; meses ya cerrados, no.
 * Años pasados: todos cerrados. Años futuros: todos editables.
 * month es 1-12. `now` se inyecta para testeo; default = ahora.
 */
export function isMonthLocked(year: number, month: number, now: Date = new Date()): boolean {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12
  if (year < currentYear) return true;
  if (year > currentYear) return false;
  return month < currentMonth;
}
