"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function saveLead(payload: any) {
  const supabase = createClient();

  // Obtener usuario actual para el user_id
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  // Si no se pasó organization_id, intentar buscarlo
  let orgId = payload.organization_id;
  if (!orgId) {
    const { data: orgMember } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .single();
    orgId = orgMember?.organization_id;
  }

  const { waMetrics, waAnalysis, ...baseData } = payload;

  const fullPayload = {
    ...baseData,
    ...waMetrics,
    ...waAnalysis,
    user_id: user.id,
    organization_id: orgId,
  };

  const { data, error } = await supabase
    .from("leads")
    .insert([fullPayload])
    .select()
    .single();

  if (error) {
    console.error("Error saving lead:", error);
    throw new Error(error.message);
  }

  revalidatePath("/tracking-performance");
  revalidatePath("/director/dashboard");
  revalidatePath("/asesor/dashboard");

  return data;
}
