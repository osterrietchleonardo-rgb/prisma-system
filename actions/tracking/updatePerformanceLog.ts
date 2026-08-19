"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { PROCESO_FIJO } from "@/lib/tracking/proceso";

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

  // Igual que savePerformanceLog: el action es la última puerta antes de la
  // base y no puede confiar en que el llamador haya hecho los deberes. A
  // diferencia del alta, una edición puede legítimamente no tocar el proceso
  // (por ejemplo, corregir solo el monto o la fecha) — este formulario SIEMPRE
  // manda `type`, así que este bloque corre en todo uso real de la UI; queda
  // condicionado para que un caller externo que sólo actualice otro campo
  // (sin `type` ni `proceso`) no se rompa: ahí el valor derivado da
  // `undefined` y lo dejamos pasar tal cual, para que Supabase lo descarte del
  // UPDATE y el proceso ya guardado sobreviva sin tocarse (decisión deliberada,
  // no un caso sin cubrir). Lo que sí se rechaza siempre es un valor
  // explícito que no sea ni 'compra' ni 'venta'.
  const procesoDerivado =
    PROCESO_FIJO[baseData.type as keyof typeof PROCESO_FIJO] ?? baseData.proceso;
  if (procesoDerivado !== undefined) {
    if (procesoDerivado !== "compra" && procesoDerivado !== "venta") {
      throw new Error("El proceso debe ser Compra o Venta");
    }
    baseData.proceso = procesoDerivado;
  }

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
