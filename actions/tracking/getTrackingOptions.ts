"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
    .select("id, full_name, phone, email")
    .eq("agency_id", profile.agency_id);

  if (profile.role !== "director") {
    leadsQuery = leadsQuery.eq("assigned_agent_id", user.id);
  }

  const { data: leads } = await leadsQuery;

  // Contactos de WhatsApp para el desplegable de Tracking y Calendario.
  //
  // Se listan desde `wa_conversations` y no desde `wa_contacts` a propósito: el
  // dueño del lead lo marca la conversación (es lo que asigna el agente cuando
  // el cliente se interesa por una propiedad), mientras que en la agenda el
  // `agent_id` suele quedar vacío. Leyendo la agenda, el asesor no encontraba en
  // la lista sus propios leads, los cargaba a mano y ahí chocaba con el teléfono
  // ya existente. La RLS de `wa_conversations` ya filtra sola: el asesor ve las
  // suyas y el director las de toda la agencia.
  const { data: convs } = await supabase
    .from("wa_conversations")
    .select("contact_phone, contact_name")
    .eq("agency_id", profile.agency_id)
    .order("last_message_at", { ascending: false });

  // El desplegable tiene que devolver el id de `wa_contacts` porque
  // `performance_logs.wa_contact_id` es una FK contra esa tabla. Se resuelve por
  // teléfono con el cliente admin, ya que la agenda puede estar sin dueño y la
  // RLS no se la mostraría — pero solo para los teléfonos que ya son suyos.
  const phones = Array.from(new Set((convs ?? []).map((c) => c.contact_phone).filter(Boolean)));

  let waContacts: { id: string; name: string | null; phone: string }[] = [];
  if (phones.length > 0) {
    const admin = createAdminClient();
    const { data: contactRows } = await admin
      .from("wa_contacts")
      .select("id, name, phone")
      .eq("agency_id", profile.agency_id)
      .in("phone", phones);

    const porTelefono = new Map((contactRows ?? []).map((c) => [c.phone, c]));
    const vistos = new Set<string>();
    for (const conv of convs ?? []) {
      const contacto = porTelefono.get(conv.contact_phone);
      // Sin fila en la agenda no hay id válido para la FK: se omite.
      if (!contacto || vistos.has(contacto.id)) continue;
      vistos.add(contacto.id);
      waContacts.push({
        id: contacto.id,
        name: conv.contact_name || contacto.name,
        phone: conv.contact_phone,
      });
    }
  }

  // Fetch agents if director
  let agents = null;
  if (profile.role === "director") {
    const { data: agentsData } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("agency_id", profile.agency_id)
      .eq("role", "asesor");
    agents = agentsData;
  }

  return {
    properties: properties || [],
    leads: leads || [],
    waContacts: waContacts || [],
    agents: agents || []
  };
}
