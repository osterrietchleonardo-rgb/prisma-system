"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export async function deletePerformanceLog(id: string) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  // Verify the log exists and the user has access to it
  const { data: log } = await supabase
    .from("performance_logs")
    .select("id")
    .eq("id", id)
    .single();

  if (!log) {
    throw new Error("Registro no encontrado o sin permisos");
  }

  // Use admin client to delete bypassing RLS if DELETE policy is missing
  const supabaseAdmin = createAdminClient();
  const { error } = await supabaseAdmin
    .from("performance_logs")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting performance log:", error);
    throw new Error(error.message);
  }

  revalidatePath("/director/tracking-performance");
  revalidatePath("/asesor/tracking-performance");
  revalidatePath("/director/dashboard");
  revalidatePath("/asesor/dashboard");

  return { success: true };
}
