"use server";

import { createClient } from "@/lib/supabase/server";

export async function getTrackingOptions() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, agency_id")
    .eq("id", user.id)
    .single();

  if (!profile) throw new Error("Perfil no encontrado");

  // Fetch properties
  let propertiesQuery = supabase
    .from("properties")
    .select("id, title, address, tokko_id")
    .eq("agency_id", profile.agency_id);

  if (profile.role !== "director") {
    propertiesQuery = propertiesQuery.eq("assigned_agent_id", user.id);
  }

  const { data: properties } = await propertiesQuery;

  // Fetch leads
  let leadsQuery = supabase
    .from("leads")
    .select("id, full_name")
    .eq("agency_id", profile.agency_id);

  if (profile.role !== "director") {
    leadsQuery = leadsQuery.eq("assigned_agent_id", user.id);
  }

  const { data: leads } = await leadsQuery;

  // Fetch WA contacts
  // wa_contacts doesn't have assigned_agent_id in the schema, they belong to the agency. 
  // We'll return all WA contacts for the agency for now, since WA is collaborative or handled via shared numbers.
  const { data: waContacts } = await supabase
    .from("wa_contacts")
    .select("id, name, phone")
    .eq("agency_id", profile.agency_id);

  return {
    properties: properties || [],
    leads: leads || [],
    waContacts: waContacts || []
  };
}
