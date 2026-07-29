"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ActivityType } from "@/lib/tracking/types";

export interface MovePipelineCardInput {
  clientKey: string;
  leadId: string | null;
  waContactId: string | null;
  fromStage: ActivityType | null;
  toStage: ActivityType;
}

/**
 * Registra que alguien movió a mano la tarjeta de un cliente a otra etapa.
 *
 * IMPORTANTE: esto NO crea una actividad. Es justamente lo que permite mover
 * una tarjeta hacia atrás (o hacia una etapa ya recorrida) sin inflar las
 * métricas del Dashboard. Cuando la etapa destino todavía no tiene actividad,
 * el que llama primero guarda la actividad con savePerformanceLog y recién
 * después no necesita llamar acá.
 */
export async function movePipelineCard(
  input: MovePipelineCardInput
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "No autenticado" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("agency_id")
    .eq("id", user.id)
    .single();

  if (!profile?.agency_id) return { success: false, error: "Perfil no encontrado" };

  const { error } = await supabase.from("tracking_pipeline_moves").insert([{
    agency_id: profile.agency_id,
    agent_id: user.id,
    client_key: input.clientKey,
    lead_id: input.leadId,
    wa_contact_id: input.waContactId,
    from_stage: input.fromStage,
    to_stage: input.toStage,
  }]);

  if (error) {
    console.error("Error moving pipeline card:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/director/tracking-performance");
  revalidatePath("/asesor/tracking-performance");

  return { success: true };
}
