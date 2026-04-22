import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/webhooks/evolution
 *
 * Recibe eventos de Evolution API y los procesa:
 * 1. Guarda el mensaje en Supabase
 * 2. Si bot_active=true, dispara n8n con payload enriquecido
 */
export async function POST(req: Request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const payload = await req.json()

    // Solo procesar mensajes entrantes del lead
    if (payload.event !== 'messages.upsert') {
      return NextResponse.json({ success: true, message: `Event ignored: ${payload.event}` })
    }

    const { data, instance: instanceName } = payload

    if (!data?.message) {
      return NextResponse.json({ success: true, message: 'No message data' })
    }

    const wamid = data.key?.id
    const rawJid = data.key?.remoteJid || ''
    const contactPhone = rawJid.split('@')[0]

    // Ignorar mensajes propios o sin número
    if (!contactPhone || data.key?.fromMe) {
      return NextResponse.json({ success: true, message: 'Ignored: outbound or missing remoteJid' })
    }

    // Extraer contenido según tipo de mensaje
    const content =
      data.message?.conversation ||
      data.message?.extendedTextMessage?.text ||
      data.message?.imageMessage?.caption ||
      data.message?.audioMessage?.url ||
      'Mensaje multimedia o no soportado'

    const contactName = data.pushName || contactPhone
    const messageType = data.message?.conversation
      ? 'text'
      : data.message?.imageMessage
        ? 'image'
        : data.message?.audioMessage
          ? 'audio'
          : 'other'

    // 1. Buscar la instancia por evo_instance_name (prioridad) o instance_name
    const resolvedName = instanceName || data.external_instance_id
    const { data: instance } = await supabase
      .from('whatsapp_instances')
      .select('id, agency_id, evo_instance_name')
      .or(`evo_instance_name.eq.${resolvedName},instance_name.eq.${resolvedName}`)
      .maybeSingle()

    if (!instance) {
      console.warn(`[Evolution Webhook] Instancia no encontrada: ${resolvedName}`)
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 })
    }

    // 2. Buscar o crear la conversación
    let conversation_id: string
    let botIsActive = true


    const { data: convs } = await supabase
      .from('wa_conversations')
      .select('id, bot_active, etiquetas, score, status, unread_count')
      .eq('instance_id', instance.id)
      .eq('contact_phone', contactPhone)
      .order('last_message_at', { ascending: false })
      .limit(1)

    const conv = convs && convs.length > 0 ? convs[0] : null

    if (!conv) {
      const { data: newConv, error: newConvErr } = await supabase
        .from('wa_conversations')
        .insert({
          agency_id: instance.agency_id,
          instance_id: instance.id,
          contact_phone: contactPhone,
          contact_name: contactName,
          status: 'active',
          bot_active: true,
          score: 0,
          unread_count: 1,
          etiquetas: [],
          last_message_at: new Date().toISOString(),
          last_inbound_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (newConvErr || !newConv) {
        console.error('[Evolution Webhook] Error creando conversación:', newConvErr)
        return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
      }
      conversation_id = newConv.id
    } else {
      conversation_id = conv.id
      botIsActive = conv.bot_active
    }

    const activeConv = conv || newConv

    // Ejecutar queries lentas de BD en paralelo para acelerar trigger a n8n
    const promises: Promise<any>[] = []

    // 1. Promesa: UPDATE wa_conversations (Solo si la conv ya existía)
    if (conv) {
      promises.push(
        supabase
          .from('wa_conversations')
          .update({
            contact_name: contactName,
            last_message_at: new Date().toISOString(),
            last_inbound_at: new Date().toISOString(),
            unread_count: (conv.unread_count || 0) + 1,
          })
          .eq('id', conversation_id)
      )
    } else {
      promises.push(Promise.resolve(null)) // Mantener indice del array
    }

    // 2. Promesa: INSERT wa_messages
    promises.push(
      supabase.from('wa_messages').insert({
        conversation_id,
        agency_id: instance.agency_id,
        content,
        role: 'lead',
        message_type: messageType,
        wamid,
        metadata: data,
      }).select('id').single()  // Solo necesitamos el ID para confirmar y evitar cargar data innecesaria
    )

    // 3. Promesa: GET history
    if (process.env.N8N_WEBHOOK_URL) {
      promises.push(
        supabase
          .from('wa_messages')
          .select('id, role, content, created_at')
          .eq('conversation_id', conversation_id)
          .order('created_at', { ascending: false })
          .limit(10)
      )
    } else {
      promises.push(Promise.resolve({ data: [] }))
    }

    // Esperar todas juntas (~66% de reducción en latencia de BD)
    const [ _, insertResult, historyResult ] = await Promise.all(promises)
    const { data: insertedMsg, error: insertError } = insertResult
    const { data: recentMessages } = historyResult

    if (insertError) {
      console.error('[Evolution Webhook] Error insertando mensaje:', insertError)
    } else {
      // Broadcast manual "fire-and-forget" para no retrasar n8n
      supabase.channel(`agency-${instance.agency_id}`).send({
        type: 'broadcast',
        event: 'refresh-whatsapp',
        payload: { conversation_id, type: 'new_message' }
      }).catch(() => {})

      supabase.channel(`active-agency-${instance.agency_id}`).send({
        type: 'broadcast',
        event: 'refresh-whatsapp',
        payload: { conversation_id, type: 'new_message' }
      }).catch(() => {})
    }

    // 4. Disparar n8n con payload enriquecido SOLO si el bot está activo
    if (process.env.N8N_WEBHOOK_URL) {
      if (!botIsActive) {
        // Guardar mensaje del lead en n8n_chat_histories para mantener historial completo
        // aunque el bot esté pausado — cuando se reactive tendrá contexto de la intervención manual
        const fechaManual = new Date().toLocaleString('es-AR', {
          timeZone: 'America/Argentina/Buenos_Aires',
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit'
        }).replace(',', '')
        supabase.from('n8n_chat_histories').insert({
          session_id: conversation_id,
          message: {
            type: 'human',
            content: `# Mensaje a responder del usuario: \n\n- Mensaje: <${messageType}> ${content} </${messageType}>\n\n- Fecha actual: ${fechaManual}\n`,
            additional_kwargs: { source: 'lead_during_manual_mode' },
            response_metadata: {}
          }
        }).catch((e: Error) => console.error('[Evolution Webhook] Error guardando en n8n_chat_histories (manual mode):', e))

        console.log(`[Evolution Webhook] Bot inactivo (Control manual) para conv: ${conversation_id}. Mensaje guardado en historial.`)
        return NextResponse.json({ success: true, message: 'Message saved but n8n ignored (bot_active = false)' })
      }

      const enrichedPayload = {
        debug_v: '5.1_final_manual_mode', // Versión de debug
        message_id: insertedMsg?.id || null, // ID raíz garantizado
        webhook_event_id: crypto.randomUUID(), 
        // IDs para que n8n pueda responder de vuelta
        agency_id: instance.agency_id,
        conversation_id,
        instance_name: instance.evo_instance_name || resolvedName,
        evolution_url: process.env.EVOLUTION_API_URL,

        // Datos del contacto
        contact_phone: contactPhone,
        contact_name: contactName,

        // Mensaje actual
        message: {
          id: insertedMsg?.id || null, // ID único del mensaje en la base de datos (Clave primaria UUID)
          content,
          type: messageType,
          wamid,
          received_at: new Date().toISOString(),
        },

        // Metadatos de la conversación para que la IA tenga contexto
        conversation: {
          etiquetas: activeConv?.etiquetas || [],
          score: activeConv?.score || 0,
          status: activeConv?.status || 'active',
          bot_active: botIsActive,
        },

        // Historial (del más antiguo al más reciente, saltándonos el mensaje actual si quedó atrapado en la race condition)
        history: (recentMessages || [])
          .filter((m: { id: string }) => m.id !== insertedMsg?.id)
          .reverse()
          .map((m: { role: string; content: string; created_at: string }) => ({
            role: m.role,
            content: m.content,
            at: m.created_at,
          })),

        // URL donde n8n POST-ea la respuesta de la IA
        reply_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/n8n/reply`,
      }

      // Llamada a n8n esperando la respuesta para evitar que Vercel cancele el request
      try {
        const n8nRes = await fetch(process.env.N8N_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(enrichedPayload),
        });

        if (!n8nRes.ok) {
          const errBody = await n8nRes.text().catch(() => '')
          console.error(`[Evolution Webhook] n8n respondió ${n8nRes.status}: ${errBody}`)
        } else {
          console.log(`[Evolution Webhook] n8n triggered OK — conversation: ${conversation_id}`)
        }
      } catch (n8nErr) {
        console.error('[Evolution Webhook] Error llamando a n8n:', n8nErr)
      }
    } // end if n8n configured

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Evolution Webhook] Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
