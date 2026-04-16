import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/n8n/reply
 *
 * n8n llama este endpoint con la respuesta generada por la IA.
 * El sistema la guarda en Supabase y la envía al lead via Evolution API.
 *
 * Payload esperado desde n8n:
 * {
 *   conversation_id: string       // ID de la conversacion en Supabase
 *   reply: string                 // Texto de la respuesta generada
 *   secret?: string               // Token de seguridad (N8N_REPLY_SECRET)
 *   update_score?: number         // Opcional: actualizar score del lead (0-100)
 *   add_etiquetas?: string[]      // Opcional: agregar etiquetas a la conversacion
 * }
 */
export async function POST(req: Request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const body = await req.json()
    const { conversation_id, reply, secret, update_score, add_etiquetas } = body

    // Seguridad: verificar secret compartido con n8n
    const expectedSecret = process.env.N8N_REPLY_SECRET
    if (expectedSecret && secret !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!conversation_id || !reply?.trim()) {
      return NextResponse.json(
        { error: 'conversation_id y reply son requeridos' },
        { status: 400 }
      )
    }

    // Obtener conversación con datos de instancia
    const { data: conv, error: convError } = await supabase
      .from('wa_conversations')
      .select('id, agency_id, contact_phone, bot_active, instance_id, etiquetas, score')
      .eq('id', conversation_id)
      .single()

    if (convError || !conv) {
      return NextResponse.json({ error: 'Conversacion no encontrada' }, { status: 404 })
    }

    // Si el bot fue pausado manualmente mientras n8n procesaba, descartar
    if (!conv.bot_active) {
      return NextResponse.json({
        success: false,
        message: 'Bot pausado: respuesta descartada — el agente humano tomó control',
      })
    }

    // Obtener credenciales de la instancia
    const { data: instance, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .select('token, phone_number_id, evo_instance_name, integration_type')
      .eq('id', conv.instance_id)
      .single()

    if (instanceError || !instance) {
      return NextResponse.json({ error: 'Instancia WhatsApp no encontrada' }, { status: 404 })
    }

    let wamid: string | null = null

    // =============================================
    // ENVÍO: Evolution API (intermediario preferido)
    // =============================================
    if (instance.integration_type === 'evolution' && instance.evo_instance_name) {
      const evolutionUrl = process.env.EVOLUTION_API_URL
      // AUTHENTICATION_API_KEY global — administra todas las instancias
      const evolutionKey = process.env.EVOLUTION_API_KEY

      if (!evolutionUrl || !evolutionKey) {
        return NextResponse.json(
          { error: 'Faltan EVOLUTION_API_URL / EVOLUTION_API_KEY en las variables de entorno del servidor' },
          { status: 500 }
        )
      }

      const evoRes = await fetch(
        `${evolutionUrl}/message/sendText/${instance.evo_instance_name}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: evolutionKey,
          },
          body: JSON.stringify({
            number: conv.contact_phone,
            text: reply,
            // Opciones de delay para parecer más humano (ms)
            delay: 1200,
          }),
        }
      )

      const evoData = await evoRes.json()

      if (!evoRes.ok) {
        console.error('[n8n reply] Error Evolution API:', evoData)
        return NextResponse.json(
          { error: `Error Evolution API: ${evoData.message || JSON.stringify(evoData)}` },
          { status: 502 }
        )
      }

      wamid = evoData?.key?.id || evoData?.messageId || null

    // =============================================
    // FALLBACK: Meta Cloud API directa
    // =============================================
    } else if (instance.phone_number_id && instance.token) {
      const metaRes = await fetch(
        `https://graph.facebook.com/v20.0/${instance.phone_number_id}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${instance.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: conv.contact_phone,
            type: 'text',
            text: { body: reply },
          }),
        }
      )

      const metaData = await metaRes.json()

      if (!metaRes.ok) {
        console.error('[n8n reply] Error Meta API:', metaData)
        return NextResponse.json(
          { error: `Error Meta API: ${metaData.error?.message || 'Unknown'}` },
          { status: 502 }
        )
      }

      wamid = metaData.messages?.[0]?.id || null
    } else {
      return NextResponse.json(
        { error: 'No hay método de envío configurado: Evolution API ni Meta directa' },
        { status: 500 }
      )
    }

    // Guardar la respuesta del bot en Supabase (aparece en el chat en tiempo real)
    await supabase.from('wa_messages').insert({
      conversation_id,
      agency_id: conv.agency_id,
      content: reply,
      role: 'bot',
      message_type: 'text',
      wamid,
      metadata: {
        source: 'n8n',
        sent_via: instance.integration_type,
      },
    })

    // Actualizar conversación: timestamp + score + etiquetas opcionales
    const conversationUpdates: Record<string, unknown> = {
      last_message_at: new Date().toISOString(),
    }

    if (typeof update_score === 'number' && update_score >= 0 && update_score <= 100) {
      conversationUpdates.score = update_score
    }

    if (Array.isArray(add_etiquetas) && add_etiquetas.length > 0) {
      const existing = (conv.etiquetas as string[]) || []
      conversationUpdates.etiquetas = Array.from(new Set([...existing, ...add_etiquetas]))
    }

    await supabase
      .from('wa_conversations')
      .update(conversationUpdates)
      .eq('id', conversation_id)

    return NextResponse.json({
      success: true,
      wamid,
      sent_via: instance.integration_type,
      message: 'Respuesta enviada al lead y guardada en el sistema',
    })
  } catch (error) {
    console.error('[n8n reply] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
