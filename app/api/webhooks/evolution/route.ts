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

    const { data: conv } = await supabase
      .from('wa_conversations')
      .select('id, bot_active, etiquetas, score, status')
      .eq('instance_id', instance.id)
      .eq('contact_phone', contactPhone)
      .maybeSingle()

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

      await supabase
        .from('wa_conversations')
        .update({
          contact_name: contactName,
          last_message_at: new Date().toISOString(),
          last_inbound_at: new Date().toISOString(),
        })
        .eq('id', conversation_id)
    }

    // 3. Guardar el mensaje del lead en Supabase
    await supabase.from('wa_messages').insert({
      conversation_id,
      agency_id: instance.agency_id,
      content,
      role: 'lead',
      message_type: messageType,
      wamid,
      metadata: data,
    })

    // 4. Disparar n8n con payload enriquecido (solo si bot activo)
    if (botIsActive && process.env.N8N_WEBHOOK_URL) {
      // Obtener historial reciente para contexto
      const { data: recentMessages } = await supabase
        .from('wa_messages')
        .select('role, content, created_at')
        .eq('conversation_id', conversation_id)
        .order('created_at', { ascending: false })
        .limit(10)

      // Obtener metadatos actualizados de la conversación
      const { data: convMeta } = await supabase
        .from('wa_conversations')
        .select('etiquetas, score, status')
        .eq('id', conversation_id)
        .single()

      const enrichedPayload = {
        // IDs para que n8n pueda responder de vuelta
        agency_id: instance.agency_id,
        conversation_id,
        instance_name: instance.evo_instance_name || resolvedName,

        // Datos del contacto
        contact_phone: contactPhone,
        contact_name: contactName,

        // Mensaje actual
        message: {
          content,
          type: messageType,
          wamid,
          received_at: new Date().toISOString(),
        },

        // Metadatos de la conversación para que la IA tenga contexto
        conversation: {
          etiquetas: convMeta?.etiquetas || [],
          score: convMeta?.score || 0,
          status: convMeta?.status || 'active',
        },

        // Historial (del más antiguo al más reciente)
        history: (recentMessages || [])
          .reverse()
          .map((m: { role: string; content: string; created_at: string }) => ({
            role: m.role,
            content: m.content,
            at: m.created_at,
          })),

        // URL donde n8n POST-ea la respuesta de la IA
        reply_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/n8n/reply`,
      }

      // Llamada a n8n con timeout para garantizar que Vercel no la corte
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 15000) // 15s max

        const n8nRes = await fetch(process.env.N8N_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(enrichedPayload),
          signal: controller.signal,
        })
        clearTimeout(timeoutId)

        if (!n8nRes.ok) {
          const errBody = await n8nRes.text().catch(() => '')
          console.error(`[Evolution Webhook] n8n respondió ${n8nRes.status}: ${errBody}`)
        } else {
          console.log(`[Evolution Webhook] n8n triggered OK — conversation: ${conversation_id}`)
        }
      } catch (n8nErr) {
        console.error('[Evolution Webhook] Error llamando n8n:', n8nErr)
      }
    } // end if (botIsActive)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Evolution Webhook] Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
