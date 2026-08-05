"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CLASIFICACION_MANUAL } from "@/lib/whatsapp/clasificacion";
import { buscarOCrearConversacion } from "@/lib/whatsapp/conversations";

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

    const tagsArray = input.tags ? input.tags.split(",").map(t => t.trim()).filter(Boolean) : [];
    const email = input.email?.trim() || null;

    // 1. Buscar qué hay ya para ese teléfono, con el cliente admin a propósito.
    // La restricción UNIQUE(agency_id, phone) de wa_contacts es de TODA la
    // agencia, pero la RLS solo le muestra al asesor sus propios contactos:
    // buscando con su sesión, un teléfono ya cargado por otro asesor (o sin
    // dueño, como los que crea el webhook) aparecía como inexistente y el
    // INSERT moría con "wa_contacts_agency_id_phone_key", cortando el alta de
    // la visita. En wa_conversations pasa lo mismo pero peor: como no tiene
    // índice único por teléfono, en vez de fallar duplicaba el chat.
    const admin = createAdminClient();

    const { data: existingContact } = await admin
      .from('wa_contacts')
      .select('id, agent_id')
      .eq('agency_id', agency_id)
      .eq('phone', input.phone)
      .maybeSingle();

    // Por agency_id, no por instance_id: es la clave por la que la base garantiza
    // que hay un solo chat por teléfono. Buscar por instancia dejaba fuera los chats
    // de la misma agencia atados a otra instancia (o sin instancia) y se creaba uno
    // paralelo.
    const { data: existingConv } = await admin
      .from("wa_conversations")
      .select("id, agent_id")
      .eq("agency_id", agency_id)
      .eq("contact_phone", input.phone)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // De quién es el lead lo dice SIEMPRE la conversación (`wa_conversations`):
    // es la que el agente de WhatsApp asigna cuando el cliente se interesa por
    // una propiedad. `wa_contacts.agent_id` no sirve como dueño porque al
    // importar queda a nombre del que subió el archivo, no del que lo trabaja.
    const duenoAjeno =
      existingConv?.agent_id && existingConv.agent_id !== assigned_agent_id
        ? existingConv.agent_id
        : null;
    const esDeOtroAsesor = !isDirector && !!duenoAjeno;

    let wa_contact_id: string | undefined;
    // Aviso no bloqueante: el lead ya es de otro asesor y no le tocamos nada.
    let warning: string | undefined;

    if (esDeOtroAsesor) {
      // No se le roba el lead ni se le crea un chat paralelo al que lo carga:
      // se reutiliza lo que ya existe, sin modificarlo, y se avisa.
      wa_contact_id = existingContact?.id;
      const { data: owner } = await admin
        .from("profiles")
        .select("full_name")
        .eq("id", duenoAjeno!)
        .maybeSingle();
      warning = owner?.full_name
        ? `El número ya está en la inmobiliaria a nombre de ${owner.full_name}. Se agendó igual, pero el contacto de WhatsApp quedó como estaba.`
        : "El número ya está en la inmobiliaria a nombre de otro asesor. Se agendó igual, pero el contacto de WhatsApp quedó como estaba.";

      return { success: true, wa_contact_id, warning };
    }

    // 2. wa_contacts: se crea solo si el teléfono no estaba; si ya estaba, se reutiliza.
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
    } else {
      // El teléfono ya está en la agenda: se reutiliza tal cual. NO se escribe
      // nada sobre `wa_contacts` (ni dueño ni nombre ni etiquetas): la agenda es
      // de la inmobiliaria y no se le pisan los datos a nadie. Consultarla es lo
      // único necesario, justamente para no re-insertar y chocar con el UNIQUE.
      wa_contact_id = existingContact.id;
    }

    // 3. Insert or update wa_conversations (ya buscada arriba)
    if (!existingConv) {
      // Atomico a proposito: el alta manual puede cruzarse con un mensaje entrante
      // del mismo teléfono. Ver lib/whatsapp/conversations.ts.
      // El INSERT va con la sesión del asesor (respeta la RLS); las lecturas con
      // admin, que es lo único que ve los chats de otros asesores.
      const { error: convError } = await buscarOCrearConversacion(supabase, {
        agency_id,
        contact_phone: input.phone,
        columnas: "id, agent_id",
        readClient: admin,
        nueva: {
          instance_id: instance.id,
          agent_id: assigned_agent_id,
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
        },
      });

      if (convError) {
        console.error("Error creating wa_conversation:", convError);
        // We do not throw to avoid crashing if it's just a duplicate issue that we missed
      }
    } else if (!existingConv.agent_id) {
      // Sin asignar: queda para este asesor. Por admin, porque la RLS todavía no
      // le deja ver esa fila. (Si fuera de otro asesor ya salimos más arriba.)
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
