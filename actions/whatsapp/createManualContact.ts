"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CLASIFICACION_MANUAL } from "@/lib/whatsapp/clasificacion";

interface ManualContactInput {
  name: string;
  phone: string; // Already verified client side to be numbers
  email?: string;
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
    // El director sí puede reasignar contactos y conversaciones de su agencia:
    // la regla de "no le pises el contacto a otro asesor" es solo para asesores.
    const isDirector = profile.role === "director";

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
    const email = input.email?.trim() || null;

    // La búsqueda del contacto va con el cliente admin a propósito.
    // La restricción UNIQUE(agency_id, phone) es de TODA la agencia, pero la RLS
    // solo le muestra al asesor sus propios contactos: buscando con su sesión,
    // un teléfono ya cargado por otro asesor (o sin dueño, como los que crea el
    // webhook) aparecía como inexistente y el INSERT moría con
    // "wa_contacts_agency_id_phone_key", cortando el alta de la visita.
    const admin = createAdminClient();
    const { data: existingContact } = await admin
      .from('wa_contacts')
      .select('id, agent_id')
      .eq('agency_id', agency_id)
      .eq('phone', input.phone)
      .maybeSingle();

    let wa_contact_id: string;
    // Aviso no bloqueante: el contacto ya es de otro asesor y no se lo tocamos.
    let warning: string | undefined;

    if (!existingContact) {
      const { data: newContact, error: contactError } = await supabase
        .from("wa_contacts")
        .insert({
          agency_id,
          agent_id: assigned_agent_id,
          phone: input.phone,
          name: input.name,
          tags: tagsArray,
          metadata: email ? { email } : {},
          clasificacion: CLASIFICACION_MANUAL,
        })
        .select()
        .single();

      if (contactError) throw contactError;
      wa_contact_id = newContact.id;
    } else if (!isDirector && existingContact.agent_id && existingContact.agent_id !== assigned_agent_id) {
      // Ya tiene dueño y es otro asesor: no se le roba el contacto ni se le pisan
      // los datos. Se reutiliza el que existe y se avisa.
      wa_contact_id = existingContact.id;
      const { data: owner } = await admin
        .from("profiles")
        .select("full_name")
        .eq("id", existingContact.agent_id)
        .maybeSingle();
      warning = owner?.full_name
        ? `El número ya estaba cargado en la agencia a nombre de ${owner.full_name}. Se usó ese contacto sin modificarlo.`
        : "El número ya estaba cargado en la agencia por otro asesor. Se usó ese contacto sin modificarlo.";
    } else {
      wa_contact_id = existingContact.id;
      // Update name, tags and email if it exists
      const updatePayload: Record<string, any> = {
        name: input.name,
        tags: tagsArray,
      };
      if (email) updatePayload.metadata = { email };
      // Sin dueño (típico de los contactos que crea el webhook): recién ahora,
      // que el cliente se engancha con una propiedad, queda asignado al asesor.
      // Va por admin porque la RLS todavía no le deja ver esa fila.
      if (!existingContact.agent_id) {
        updatePayload.agent_id = assigned_agent_id;
        await admin.from("wa_contacts").update(updatePayload).eq("id", wa_contact_id);
      } else {
        await supabase.from("wa_contacts").update(updatePayload).eq("id", wa_contact_id);
      }
    }

    // 2. Check if conversation already exists for this phone and instance
    // También por admin: wa_conversations no tiene índice único por teléfono, así
    // que buscar con la RLS del asesor haría que una conversación de otro asesor
    // se vea como inexistente y termine duplicando el chat en la bandeja.
    const { data: existingConv } = await admin
      .from("wa_conversations")
      .select("id, agent_id")
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
          clasificacion: CLASIFICACION_MANUAL,
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
    } else if (!isDirector && existingConv.agent_id && existingConv.agent_id !== assigned_agent_id) {
      // La conversación ya es de otro asesor: se deja como está (mismo criterio
      // que el contacto). Normalmente el aviso ya se armó arriba, salvo que la
      // conversación y el contacto tengan dueños distintos.
      warning ??= "Ese número ya tiene una conversación de WhatsApp a cargo de otro asesor. Se dejó como está.";
    } else if (!existingConv.agent_id) {
      // Sin asignar: queda para este asesor. Por admin, igual que el contacto.
      await admin
        .from("wa_conversations")
        .update({ agent_id: assigned_agent_id, contact_name: input.name, etiquetas: tagsArray })
        .eq('id', existingConv.id);
    } else {
      // Ya es suya: se refrescan nombre y etiquetas.
      await supabase
        .from("wa_conversations")
        .update({ agent_id: assigned_agent_id, contact_name: input.name, etiquetas: tagsArray })
        .eq('id', existingConv.id);
    }

    return { success: true, wa_contact_id, warning };

  } catch (error: any) {
    // El detalle técnico queda en el log; al asesor le llega algo entendible.
    console.error("Error creating manual contact:", error);
    return {
      success: false,
      error: "No pudimos registrar el contacto. Revisá el número e intentá de nuevo; si sigue fallando, avisale al equipo de Vakdor.",
    };
  }
}
