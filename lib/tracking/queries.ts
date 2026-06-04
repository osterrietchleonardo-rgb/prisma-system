import { createClient } from "@/lib/supabase/client";
import { PerformanceLog } from "./types";

export async function getPerformanceLogs(): Promise<PerformanceLog[]> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, agency_id")
    .eq("id", user.id)
    .single();

  let query = supabase
    .from("performance_logs")
    .select("*, profiles(full_name, email), properties(id, title, address, tokko_id), leads(id, full_name), wa_contacts(id, name, phone)")
    .order("fecha_actividad", { ascending: false });

  if (profile?.role === "director") {
    query = query.eq("agency_id", profile.agency_id);
  } else {
    query = query.eq("agent_id", user.id).neq("status", "eliminada");
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching performance logs", error);
    return [];
  }
  return data as PerformanceLog[];
}

