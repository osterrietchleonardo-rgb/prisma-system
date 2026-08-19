"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { procesoParaResolucion, type ProcesoNegocio } from "@/lib/tracking/proceso";
import type { ActivityType } from "@/lib/tracking/types";

export interface AsignarProcesoATarjetaResult {
  success: boolean;
  error?: string;
  actualizados?: number;
}

/**
 * Resuelve una tarjeta "Sin definir" en un clic: le pone proceso a las
 * actividades viejas de esa tarjeta que todavía no lo tienen.
 *
 * A propósito NO toca `status`, `status_reason`, `ai_rating` ni
 * `ai_feedback` — a diferencia de `updatePerformanceLog`. Esto es
 * clasificar una actividad histórica, no modificar su contenido comercial;
 * por eso existe este botón en vez de mandar a la gente por el camino de
 * edición de la vista Lista (que sí marca "modificada" y borra la
 * calificación de IA).
 */
export async function asignarProcesoATarjeta(
  logIds: string[],
  proceso: ProcesoNegocio
): Promise<AsignarProcesoATarjetaResult> {
  if (proceso !== "compra" && proceso !== "venta") {
    return { success: false, error: "El proceso debe ser Compra o Venta" };
  }

  const ids = Array.from(new Set((logIds ?? []).filter(Boolean)));
  if (ids.length === 0) {
    return { success: false, error: "No hay actividades para clasificar" };
  }

  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "No autenticado" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("agency_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.agency_id) return { success: false, error: "Perfil no encontrado" };

  // Lectura con el cliente que respeta RLS: sólo trae las filas que este
  // usuario puede VER (las propias, o todas las de la agencia si es
  // director — misma regla que la política SELECT de performance_logs). Es
  // la misma verificación de acceso que usa `updatePerformanceLog`, y es lo
  // que impide que un asesor reclasifique actividades de otro asesor o de
  // otra agencia: si la fila no aparece acá, no se toca. El filtro
  // `proceso IS NULL` va en la consulta misma, no sólo confiado al llamador.
  const { data: logs, error: fetchError } = await supabase
    .from("performance_logs")
    .select("id, type")
    .in("id", ids)
    .is("proceso", null);

  if (fetchError) {
    console.error("Error reading performance logs to assign proceso:", fetchError);
    return { success: false, error: fetchError.message };
  }
  if (!logs || logs.length === 0) {
    return { success: false, error: "No quedan actividades sin proceso en esta tarjeta" };
  }

  // La escritura necesita el cliente admin: `performance_logs` no tiene
  // política RLS de UPDATE (sólo SELECT e INSERT), igual que
  // `updatePerformanceLog`. Por eso acá se refuerzan a mano, en la propia
  // consulta de escritura, las mismas condiciones que la lectura de arriba
  // ya usó para decidir qué filas mostrar: misma agencia, y — si quien pide
  // esto no es director — sólo sus propias filas.
  const supabaseAdmin = createAdminClient();

  const porValor = new Map<ProcesoNegocio, string[]>();
  for (const log of logs) {
    const valor = procesoParaResolucion(log.type as ActivityType, proceso);
    const idsDelGrupo = porValor.get(valor) ?? [];
    idsDelGrupo.push(log.id);
    porValor.set(valor, idsDelGrupo);
  }

  let actualizados = 0;
  for (const [valor, idsDelGrupo] of porValor) {
    let query = supabaseAdmin
      .from("performance_logs")
      .update({ proceso: valor })
      .in("id", idsDelGrupo)
      .is("proceso", null)
      .eq("agency_id", profile.agency_id);

    if (profile.role !== "director") {
      query = query.eq("agent_id", user.id);
    }

    const { data, error } = await query.select("id");

    if (error) {
      console.error("Error assigning proceso:", error);
      return { success: false, error: error.message };
    }
    actualizados += data?.length ?? 0;
  }

  revalidatePath("/director/tracking-performance");
  revalidatePath("/asesor/tracking-performance");
  revalidatePath("/director/dashboard");
  revalidatePath("/asesor/dashboard");

  return { success: true, actualizados };
}
