import { createClient } from "@/lib/supabase/server";
import {
  OBJECTIVE_METRICS,
  type AdvisorObjectives,
  type ObjectiveMetric,
  type ObjectiveRow,
} from "@/lib/tracking/objetivos-types";

// Re-export de tipos/constantes para conveniencia del lado server.
export * from "@/lib/tracking/objetivos-types";

/**
 * Calcula los valores ALCANZADOS por asesor x mes a partir de performance_logs.
 * Misma fórmula que el dashboard (lib/queries/dashboard.ts):
 *  - facturacion (GCI): sum(monto_operacion * comision_generada / 100) sobre cierres
 *  - captacion: count de logs type='captacion'
 * Devuelve: agentId -> metric -> month(1-12) -> número.
 */
export async function getAchievedByAgentMonth(
  agencyId: string,
  year: number,
): Promise<Record<string, Record<ObjectiveMetric, Record<number, number>>>> {
  const supabase = createClient();

  const start = `${year}-01-01`;
  const end = `${year}-12-31T23:59:59`;

  const { data: rawLogs } = await supabase
    .from("performance_logs")
    .select("agent_id, type, monto_operacion, comision_generada, fecha_actividad, created_at, status")
    .eq("agency_id", agencyId)
    .gte("fecha_actividad", start)
    .lte("fecha_actividad", end);

  const logs = (rawLogs || []).filter((l: any) => l.status !== "eliminada");

  const result: Record<string, Record<ObjectiveMetric, Record<number, number>>> = {};

  const ensure = (agentId: string) => {
    if (!result[agentId]) {
      result[agentId] = {
        facturacion: {},
        captacion: {},
      };
      for (let m = 1; m <= 12; m++) {
        result[agentId].facturacion[m] = 0;
        result[agentId].captacion[m] = 0;
      }
    }
    return result[agentId];
  };

  for (const l of logs as any[]) {
    if (!l.agent_id) continue;
    const date = new Date(l.fecha_actividad || l.created_at);
    if (date.getFullYear() !== year) continue;
    const month = date.getMonth() + 1;
    const agent = ensure(l.agent_id);

    if (l.type === "cierre") {
      const valor = Number(l.monto_operacion) || 0;
      const hon = Number(l.comision_generada) || 0;
      agent.facturacion[month] += (valor * hon) / 100;
    }
    if (l.type === "captacion") {
      agent.captacion[month] += 1;
    }
  }

  return result;
}

/** Lee los objetivos guardados de una agencia para un año. */
export async function getObjectivesByAgency(agencyId: string, year: number): Promise<ObjectiveRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("performance_objectives")
    .select("id, agent_id, year, month, metric, target_value")
    .eq("agency_id", agencyId)
    .eq("year", year);

  if (error) {
    console.error("Error fetching performance_objectives", error);
    return [];
  }
  return (data || []) as ObjectiveRow[];
}

/**
 * Construye la matriz completa (objetivo + alcanzado + %) por asesor para el dashboard.
 * Solo asesores (role='asesor'), igual que el Ranking.
 */
export async function getObjectivesDashboard(agencyId: string, year: number): Promise<AdvisorObjectives[]> {
  const supabase = createClient();

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("agency_id", agencyId)
    .eq("role", "asesor");

  const [objectives, achieved] = await Promise.all([
    getObjectivesByAgency(agencyId, year),
    getAchievedByAgentMonth(agencyId, year),
  ]);

  // index objetivos: agentId -> metric -> month -> value
  const objIndex: Record<string, Record<string, Record<number, number>>> = {};
  for (const o of objectives) {
    if (!objIndex[o.agent_id]) objIndex[o.agent_id] = { facturacion: {}, captacion: {} };
    objIndex[o.agent_id][o.metric][o.month] = Number(o.target_value) || 0;
  }

  return (profiles || []).map((p: any) => {
    const metrics = {} as AdvisorObjectives["metrics"];
    for (const { key } of OBJECTIVE_METRICS) {
      metrics[key] = {};
      for (let m = 1; m <= 12; m++) {
        const objetivo = objIndex[p.id]?.[key]?.[m] || 0;
        const alcanzado = achieved[p.id]?.[key]?.[m] || 0;
        const pct = objetivo > 0 ? (alcanzado / objetivo) * 100 : null;
        metrics[key][m] = { objetivo, alcanzado, pct };
      }
    }
    return {
      agentId: p.id,
      name: p.full_name || "Asesor Sin Nombre",
      metrics,
    };
  });
}
