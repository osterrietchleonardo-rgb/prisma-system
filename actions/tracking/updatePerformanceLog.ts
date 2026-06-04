"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export async function updatePerformanceLog(id: string, payload: any, reason: string) {
  if (!reason || reason.trim() === '') {
    throw new Error("Se requiere un motivo para modificar la actividad");
  }

  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  // Verify the log exists and the user has access to it
  const { data: existingLog } = await supabase
    .from("performance_logs")
    .select("id")
    .eq("id", id)
    .single();

  if (!existingLog) {
    throw new Error("Registro no encontrado o sin permisos");
  }

  const { waMetrics, waAnalysis, ...baseData } = payload;

  const supabaseAdmin = createAdminClient();
  const { data: log, error } = await supabaseAdmin
    .from("performance_logs")
    .update({
      ...baseData,
      wa_metrics: waMetrics || {},
      wa_analysis: waAnalysis || {},
      ai_rating: null,
      ai_feedback: null,
      status: 'modificada',
      status_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Error updating performance log:", error);
    throw new Error(error.message);
  }

  revalidatePath("/director/tracking-performance");
  revalidatePath("/asesor/tracking-performance");
  revalidatePath("/director/dashboard");
  revalidatePath("/asesor/dashboard");

  return log;
}
