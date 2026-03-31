import { createClient } from "@/lib/supabase/client";
import { Lead } from "./types";

export async function getLeads(): Promise<Lead[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .order("fecha_primer_contacto", { ascending: false });

  if (error) {
    console.error("Error fetching leads", error);
    return [];
  }
  return data as Lead[];
}

export async function insertLead(payload: any): Promise<any> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("leads")
    .insert([payload])
    .select()
    .single();

  if (error) {
    console.error("Error inserting lead:", error);
    throw new Error(error.message);
  }
  return data;
}

export async function updateLead(id: string, payload: any): Promise<any> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("leads")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Error updating lead:", error);
    throw new Error(error.message);
  }
  return data;
}
