"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { PROCESO_FIJO } from "@/lib/tracking/proceso";

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

  if (!profile) throw new Error("Perfil no encontrado");

  const { waMetrics, waAnalysis, ...baseData } = payload;

  // El proceso es obligatorio para toda alta nueva. En las tres etapas que ya
  // lo definen se deriva acá también, y no sólo en el formulario: el action es
  // la última puerta antes de la base, y no puede confiar en que quien llama
  // haya hecho los deberes.
  const proceso = PROCESO_FIJO[baseData.type as keyof typeof PROCESO_FIJO] ?? baseData.proceso ?? null;
  if (proceso !== "compra" && proceso !== "venta") {
    throw new Error("Falta indicar si la actividad es de Compra o de Venta");
  }
  baseData.proceso = proceso;

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
