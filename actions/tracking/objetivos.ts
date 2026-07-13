"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import {
  isMonthLocked,
  getObjectivesDashboard,
  type AdvisorObjectives,
  type ObjectiveMetric,
  type ObjectiveRow,
} from "@/lib/tracking/objetivos";

interface SaveObjectivesInput {
  year: number;
  // Cada celda a persistir. Solo se aceptan métricas válidas y meses no cerrados.
  cells: { agent_id: string; month: number; metric: ObjectiveMetric; target_value: number }[];
}

async function getDirectorContext() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, agency_id")
    .eq("id", user.id)
    .single();

  if (!profile?.agency_id) throw new Error("Perfil sin inmobiliaria");
  if (profile.role !== "director") throw new Error("Solo el director puede modificar objetivos");

  return { userId: user.id, agencyId: profile.agency_id as string };
}

/**
 * Datos de objetivos vs alcanzado para el dashboard, por año.
 * Disponible para director y asesor (resuelve la agencia del usuario logueado).
 */
export async function getObjectivesDashboardForYear(year: number): Promise<AdvisorObjectives[]> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: profile } = await supabase
    .from("profiles")
    .select("agency_id")
    .eq("id", user.id)
    .single();

  if (!profile?.agency_id) return [];
  return getObjectivesDashboard(profile.agency_id, year);
}

/** Asesores de la agencia del director (para armar las filas del editor). */
export async function getAgencyAdvisors() {
  const { agencyId } = await getDirectorContext();
  const supabase = createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("agency_id", agencyId)
    .eq("role", "asesor")
    .order("full_name", { ascending: true });
  return (data || []).map((p: any) => ({ id: p.id, name: p.full_name || p.email || "Asesor" }));
}

/** Objetivos guardados de la agencia para un año (para precargar el editor). */
export async function getObjectivesForEditor(year: number): Promise<ObjectiveRow[]> {
  const { agencyId } = await getDirectorContext();
  const supabase = createClient();
  const { data, error } = await supabase
    .from("performance_objectives")
    .select("id, agent_id, year, month, metric, target_value")
    .eq("agency_id", agencyId)
    .eq("year", year);

  if (error) {
    console.error("Error fetching objectives for editor", error);
    return [];
  }
  return (data || []) as ObjectiveRow[];
}

/**
 * Guarda (upsert) los objetivos. Valida:
 *  - rol director,
 *  - métrica válida,
 *  - el mes no esté cerrado (no se pueden tocar meses ya pasados).
 * Usa admin client para el upsert (patrón deletePerformanceLog.ts), con la agencia
 * forzada desde el perfil (nunca desde el cliente).
 */
export async function saveObjectives(input: SaveObjectivesInput) {
  const { userId, agencyId } = await getDirectorContext();

  const validMetrics: ObjectiveMetric[] = ["facturacion", "captacion"];
  const now = new Date();

  const rows = input.cells
    .filter((c) => validMetrics.includes(c.metric))
    .filter((c) => c.month >= 1 && c.month <= 12)
    .filter((c) => !isMonthLocked(input.year, c.month, now))
    .map((c) => ({
      agency_id: agencyId,
      agent_id: c.agent_id,
      year: input.year,
      month: c.month,
      metric: c.metric,
      target_value: Number.isFinite(c.target_value) ? Math.max(0, c.target_value) : 0,
      created_by: userId,
      updated_at: new Date().toISOString(),
    }));

  if (rows.length === 0) {
    return { success: true, saved: 0 };
  }

  const supabaseAdmin = createAdminClient();
  const { error } = await supabaseAdmin
    .from("performance_objectives")
    .upsert(rows, { onConflict: "agent_id,year,month,metric" });

  if (error) {
    console.error("Error saving objectives", error);
    throw new Error(error.message);
  }

  revalidatePath("/director/tracking-performance");
  revalidatePath("/director/dashboard");
  revalidatePath("/asesor/dashboard");

  return { success: true, saved: rows.length };
}

// ── Pesos mensuales (%) para repartir el total anual ─────────────────────────

export interface ObjectiveWeightRow {
  metric: ObjectiveMetric;
  month: number; // 1-12
  weight_pct: number;
}

/** Lee los % mensuales guardados de la agencia para un año (todas las métricas). */
export async function getObjectiveWeights(year: number): Promise<ObjectiveWeightRow[]> {
  const { agencyId } = await getDirectorContext();
  const supabase = createClient();
  const { data, error } = await supabase
    .from("performance_objective_weights")
    .select("metric, month, weight_pct")
    .eq("agency_id", agencyId)
    .eq("year", year);

  if (error) {
    console.error("Error fetching objective weights", error);
    return [];
  }
  return (data || []).map((r: any) => ({
    metric: r.metric as ObjectiveMetric,
    month: Number(r.month),
    weight_pct: Number(r.weight_pct) || 0,
  }));
}

/**
 * Guarda (upsert) los 12 % de UNA métrica para un año.
 * Valida: rol director, métrica válida, meses 1-12, y que los 12 sumen 100 (±0.01).
 * Escribe siempre las 12 filas (los meses no provistos quedan en 0).
 */
export async function saveObjectiveWeights(input: {
  year: number;
  metric: ObjectiveMetric;
  weights: { month: number; weight_pct: number }[];
}) {
  const { userId, agencyId } = await getDirectorContext();

  const validMetrics: ObjectiveMetric[] = ["facturacion", "captacion"];
  if (!validMetrics.includes(input.metric)) {
    throw new Error("Métrica inválida");
  }

  const byMonth = new Map<number, number>();
  for (const w of input.weights) {
    if (w.month >= 1 && w.month <= 12) {
      const v = Number(w.weight_pct);
      byMonth.set(w.month, Number.isFinite(v) ? Math.max(0, v) : 0);
    }
  }

  const suma = [...byMonth.values()].reduce((s, v) => s + v, 0);
  if (Math.abs(suma - 100) > 0.01) {
    throw new Error("Los porcentajes deben sumar 100%");
  }

  const rows = [];
  for (let m = 1; m <= 12; m++) {
    rows.push({
      agency_id: agencyId,
      year: input.year,
      metric: input.metric,
      month: m,
      weight_pct: byMonth.get(m) ?? 0,
      created_by: userId,
      updated_at: new Date().toISOString(),
    });
  }

  const supabaseAdmin = createAdminClient();
  const { error } = await supabaseAdmin
    .from("performance_objective_weights")
    .upsert(rows, { onConflict: "agency_id,year,metric,month" });

  if (error) {
    console.error("Error saving objective weights", error);
    throw new Error(error.message);
  }

  revalidatePath("/director/tracking-performance");
  return { success: true };
}
