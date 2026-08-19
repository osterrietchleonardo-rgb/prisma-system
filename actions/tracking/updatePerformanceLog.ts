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

  // Verify the log exists and the user has access to it. Se trae también
  // `type`: hace falta más abajo para el caso de un payload que manda
  // `proceso` sin mandar `type` (ver comentario ahí).
  const { data: existingLog } = await supabase
    .from("performance_logs")
    .select("id, type")
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
  // (sin `type` ni `proceso`) no se rompa: ahí no hay nada que derivar y lo
  // dejamos pasar tal cual, para que Supabase lo descarte del UPDATE y el
  // proceso ya guardado sobreviva sin tocarse (decisión deliberada, no un
  // caso sin cubrir).
  //
  // Caso aparte: un payload que manda `proceso` pero no `type`. Ahí no hay
  // `type` del que derivar el lado fijo, así que sin esto un `proceso`
  // inventado (p.ej. 'compra' sobre una fila que en realidad es prelisting)
  // pasaba el chequeo literal de abajo y llegaba a la base, donde el CHECK
  // la rechazaba con un error crudo de Postgres en vez de este mensaje. Se
  // usa el `type` ya guardado (el mismo registro que el select de arriba ya
  // confirmó que existe) para derivar igual que si el payload lo hubiera
  // mandado.
  const seTocaAlgo = baseData.type !== undefined || baseData.proceso !== undefined;
  const tipoParaDerivar = baseData.type !== undefined ? baseData.type : existingLog.type;
  const procesoDerivado = seTocaAlgo
    ? PROCESO_FIJO[tipoParaDerivar as keyof typeof PROCESO_FIJO] ?? baseData.proceso
    : undefined;
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
