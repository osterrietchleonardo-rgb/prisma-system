"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function savePerformanceLog(payload: any) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  // Obtener perfil para agency_id
  const { data: profile } = await supabase
    .from("profiles")
    .select("agency_id")
    .eq("id", user.id)
    .single();

  const { waMetrics, waAnalysis, ...baseData } = payload;

  const fullPayload = {
    ...baseData,
    agent_id: user.id,
    agency_id: profile?.agency_id,
    wa_metrics: waMetrics || {},
    wa_analysis: waAnalysis || {},
  };

  // Get agency config for AI evaluation
  const { data: agency } = await supabase
    .from("agencies")
    .select("performance_config")
    .eq("id", profile.agency_id)
    .single();

  const { data: log, error } = await supabase
    .from("performance_logs")
    .insert([{
      ...fullPayload,
      agent_id: user.id,
      agency_id: profile.agency_id,
      ai_rating: null,
      ai_feedback: null
    }])
    .select()
    .single();

  if (error) {
    console.error("Error saving performance log:", error);
    throw new Error(error.message);
  }

  revalidatePath("/director/tracking-performance");
  revalidatePath("/asesor/tracking-performance");
  revalidatePath("/director/dashboard");
  revalidatePath("/asesor/dashboard");

  return log;
}
