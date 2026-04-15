import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/n8n/reply
 *
 * Endpoint que n8n llama cuando quiere enviar una respuesta de la IA al lead.
 * 
 * Payload esperado desde n8n:
 * {
 *   conversation_id: string        // ID de la conversacion en Supabase
 *   reply: string                  // Texto de la respuesta generada por la IA
 *   secret?: string                // Token de seguridad (N8N_REPLY_SECRET)
 *   update_score?: number          // Opcional: actualizar el score del lead (0-100)
 *   add_etiquetas?: string[]       // Opcional: agregar etiquetas a la conversacion
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

    // --- Seguridad: verificar el secret de n8n ---
    const expectedSecret = process.env.N8N_REPLY_SECRET
    if (expectedSecret && secret !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // --- Validar campos requeridos ---
    if (!conversation_id || !reply?.trim()) {
      return NextResponse.json(
        { error: 'conversation_id y reply son requeridos' },
        { status: 400 }
      )
    }

    // --- Obtener la conversacion para saber agency_id y phone + instancia ---
    const { data: conv, error: convError } = await supabase
      .from('wa_conversations')
      .select('id, agency_id, contact_phone, bot_active, instance_id, etiquetas, score')
      .eq('id', conversation_id)
      .single()

    if (convError || !conv) {
      return NextResponse.json({ error: 'Conversacion no encontrada' }, { status: 404 })
    }

    // Si el bot fue pausado manualmente mientras n8n procesaba, no enviamos
    if (!conv.bot_active) {
      return NextResponse.json({
        success: false,
        message: 'Bot pausado: respuesta descartada para no interrumpir al agente humano',
      })
    }

    // --- Obtener las credenciales de la instancia (token + phone_number_id) ---
    const { data: instance, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .select('token, phone_number_id')
      .eq('id', conv.instance_id)
      .single()

    if (instanceError || !instance) {
      return NextResponse.json({ error: 'Instancia no encontrada' }, { status: 404 })
    }

    // --- 1. Enviar el mensaje al lead via Meta Cloud API ---
    const metaRes = await fetch(
      `https://graph.facebook.com/v20.0/${instance.phone_number_id}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${instance.token}`,
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
      console.error('Error enviando mensaje via Meta API:', metaData)
      return NextResponse.json(
        { error: `Error Meta API: ${metaData.error?.message || 'Unknown'}` },
        { status: 502 }
      )
    }

    const wamid = metaData.messages?.[0]?.id || null

    // --- 2. Guardar el mensaje del bot en Supabase (aparece en el chat) ---
    const { error: insertError } = await supabase
      .from('wa_messages')
      .insert({
        conversation_id,
        agency_id: conv.agency_id,
        content: reply,
        role: 'bot',
        message_type: 'text',
        wamid,
        metadata: { source: 'n8n', meta_response: metaData },
      })

    if (insertError) {
      console.error('Error guardando mensaje del bot:', insertError)
    }

    // --- 3. Actualizar last_message_at en la conversacion ---
    const conversationUpdates: Record<string, unknown> = {
      last_message_at: new Date().toISOString(),
    }

    // Actualizar score si n8n lo indica
    if (typeof update_score === 'number' && update_score >= 0 && update_score <= 100) {
      conversationUpdates.score = update_score
    }

    // Agregar etiquetas si n8n las indica (sin duplicar las existentes)
    if (Array.isArray(add_etiquetas) && add_etiquetas.length > 0) {
      const existing = conv.etiquetas || []
      const merged = Array.from(new Set([...existing, ...add_etiquetas]))
      conversationUpdates.etiquetas = merged
    }

    await supabase
      .from('wa_conversations')
      .update(conversationUpdates)
      .eq('id', conversation_id)

    return NextResponse.json({
      success: true,
      wamid,
      message: 'Respuesta enviada al lead y guardada en el sistema',
    })
  } catch (error) {
    console.error('Error en /api/n8n/reply:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
