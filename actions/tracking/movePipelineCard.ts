"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ActivityType } from "@/lib/tracking/types";
import { etapasPermitidas, type ProcesoNegocio } from "@/lib/tracking/proceso";

export interface MovePipelineCardInput {
  clientKey: string;
  /** Qué tarjeta del cliente se movió. Sin esto, mover la de compra movería también la de venta. */
  proceso: ProcesoNegocio | null;
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

  // Mismo bloqueo que el formulario y el drag del tablero: la CHECK de la
  // tabla constriñe el dominio de `proceso` pero no la combinación
  // `proceso` × `to_stage`, así que sin esto una llamada armada a mano podía
  // grabar, por ejemplo, una tarjeta de vendedor movida a Prebuying. Las
  // tarjetas sin proceso ("Sin definir") siguen sin bloqueo: es el
  // comportamiento deliberado de `etapasPermitidas(null)`.
  if (!etapasPermitidas(input.proceso).includes(input.toStage)) {
    return {
      success: false,
      error: "Esa etapa no admite el proceso de esta tarjeta.",
    };
  }

  const { error } = await supabase.from("tracking_pipeline_moves").insert([{
    agency_id: profile.agency_id,
    agent_id: user.id,
    client_key: input.clientKey,
    proceso: input.proceso,
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
