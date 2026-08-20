"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { PROCESOS_POR_ETAPA, labelDeProceso } from "@/lib/tracking/proceso";
import type { ActivityType } from "@/lib/tracking/types";

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
  // base y no puede confiar en que el llamador haya hecho los deberes. Ya no
  // hay un único valor que "derivar" por etapa (prelisting y captación
  // admiten vendedor o locador; prebuying, comprador o locatario), así que
  // esto pasó de derivación a validación: si el payload manda `proceso`, se
  // valida contra lo que permite la etapa (la nueva si mandaron `type`, la
  // ya guardada si no la mandaron — el mismo registro que el select de
  // arriba ya confirmó que existe).
  //
  // Una edición puede legítimamente no tocar el proceso (por ejemplo,
  // corregir solo el monto o la fecha): si el payload no manda `proceso`, no
  // hay nada que validar y `baseData.proceso` queda `undefined`, así que
  // Supabase lo descarta del UPDATE y el proceso ya guardado sobrevive sin
  // tocarse (decisión deliberada, no un caso sin cubrir).
  if (baseData.proceso !== undefined) {
    const tipoParaValidar = (baseData.type !== undefined ? baseData.type : existingLog.type) as ActivityType;
    const permitidos = PROCESOS_POR_ETAPA[tipoParaValidar];
    if (!permitidos.includes(baseData.proceso)) {
      throw new Error(
        `El proceso debe ser uno de estos para esta etapa: ${permitidos.map(labelDeProceso).join(", ")}`
      );
    }
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
