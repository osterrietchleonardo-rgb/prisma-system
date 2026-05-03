"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { AgencyPerformanceConfig } from "@/lib/tracking/types";

export async function savePerformanceConfig(config: AgencyPerformanceConfig) {
  const supabase = createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: profile } = await supabase
    .from("profiles")
    .select("agency_id, role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== 'director') {
    throw new Error("Only directors can modify performance settings");
  }

  const { error } = await supabase
    .from("agencies")
    .update({ performance_config: config })
    .eq("id", profile.agency_id);

  if (error) {
    console.error("Error saving performance config:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/director/tracking-performance");
  revalidatePath("/director/dashboard");
  
  return { success: true };
}
