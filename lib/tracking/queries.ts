import { createClient } from "@/lib/supabase/client";
import { PerformanceLog } from "./types";

export async function getPerformanceLogs(): Promise<PerformanceLog[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("performance_logs")
    .select("*")
    .order("fecha_actividad", { ascending: false });

  if (error) {
    console.error("Error fetching performance logs", error);
    return [];
  }
  return data as PerformanceLog[];
}

