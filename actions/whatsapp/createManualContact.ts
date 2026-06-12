"use server";

import { createClient } from "@/lib/supabase/server";

interface ManualContactInput {
  name: string;
  phone: string; // Already verified client side to be numbers
  tags?: string;
  agent_id?: string; // Only provided if director assigns it explicitly
}

export async function createManualContact(input: ManualContactInput) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return { success: false, error: "No autenticado" };
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("agency_id, role")
      .eq("id", user.id)
      .single();

    if (!profile?.agency_id) {
      return { success: false, error: "Perfil sin agencia" };
    }

    const agency_id = profile.agency_id;
    const assigned_agent_id = input.agent_id || user.id;

    // Obtener la instancia de WhatsApp de la agencia
    const { data: instance } = await supabase
      .from("whatsapp_instances")
      .select("id")
      .eq("agency_id", agency_id)
      .maybeSingle();

    if (!instance) {
      return { success: false, error: "La agencia no tiene WhatsApp conectado." };
    }

    // 1. Insert or update wa_contacts
    const tagsArray = input.tags ? input.tags.split(",").map(t => t.trim()).filter(Boolean) : [];
    
    // Check if contact already exists
    const { data: existingContact } = await supabase
      .from('wa_contacts')
      .select('id')
      .eq('agency_id', agency_id)
      .eq('phone', input.phone)
      .maybeSingle();

    let wa_contact_id: string;

    if (!existingContact) {
      const { data: newContact, error: contactError } = await supabase
        .from("wa_contacts")
        .insert({
          agency_id,
          phone: input.phone,
          name: input.name,
          tags: tagsArray,
        })
        .select()
        .single();
        
      if (contactError) throw contactError;
      wa_contact_id = newContact.id;
    } else {
      wa_contact_id = existingContact.id;
      // Update name and tags if it exists
      await supabase
        .from("wa_contacts")
        .update({ 
          name: input.name,
          tags: tagsArray 
        })
        .eq('id', wa_contact_id);
    }

    // 2. Check if conversation already exists for this phone and instance
    const { data: existingConv } = await supabase
      .from("wa_conversations")
      .select("id")
      .eq("instance_id", instance.id)
      .eq("contact_phone", input.phone)
      .maybeSingle();

    if (!existingConv) {
      const { error: convError } = await supabase
        .from("wa_conversations")
        .insert({
          agency_id,
          instance_id: instance.id,
          agent_id: assigned_agent_id,
          contact_phone: input.phone,
          contact_name: input.name,
          status: 'active',
          bot_active: false, // Manual so we don't trigger the bot automatically
          score: 0,
          unread_count: 0,
          etiquetas: tagsArray,
          last_message_at: new Date().toISOString(),
          last_inbound_at: new Date().toISOString(),
          next_follow_up_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          requires_follow_up: false,
          follow_ups_sent: 0,
          funnel_status: 'open',
        });
        
      if (convError) {
        console.error("Error creating wa_conversation:", convError);
        // We do not throw to avoid crashing if it's just a duplicate issue that we missed
      }
    } else {
      // Update agent if different
      await supabase
        .from("wa_conversations")
        .update({ agent_id: assigned_agent_id, contact_name: input.name, etiquetas: tagsArray })
        .eq('id', existingConv.id);
    }

    return { success: true, wa_contact_id };

  } catch (error: any) {
    console.error("Error creating manual contact:", error);
    return { success: false, error: error.message || "Error desconocido" };
  }
}
