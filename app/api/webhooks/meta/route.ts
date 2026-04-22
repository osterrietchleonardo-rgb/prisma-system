import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Para poder verificar el webhook desde la interfaz de Meta, primero hacemos el GET
export async function GET(req: Request) {
  const url = new URL(req.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')

  const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "PrismaSaaS2026_Verificacion!"

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      return new NextResponse(challenge, { status: 200 })
    }
    return new NextResponse('Forbidden', { status: 403 })
  }
  return new NextResponse('Bad Request', { status: 400 })
}

// Para recibir las actualizaciones de estado de los templates
export async function POST(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const payload = await req.json()

    // Verificar que es un evento de cuenta de negocios de WhatsApp
    if (payload.object !== 'whatsapp_business_account') {
       return NextResponse.json({ success: true, message: 'Ignored object type' })
    }

    // Recorrer el batch de cambios
    for (const entry of payload.entry) {
       for (const change of entry.changes) {
          const val = change.value
          
          // CASO 1: Actualizaciones de estado de Templates
          if (change.field === 'message_template_status_update') {
             const templateId = val.message_template_id
             const status = val.event // "APPROVED", "REJECTED", "PAUSED", etc.
             const reason = val.reason || null

             await supabase
                 .from('wa_templates')
                 .update({
                     status,
                     rejection_reason: reason,
                     updated_at: new Date().toISOString()
                 })
                 .eq('meta_template_id', templateId)
          }

          // CASO 2: Mensajes entrantes (Inbound Messages)
          if (change.field === 'messages' && val.messages) {
             const metadata = val.metadata
             const phoneNumberId = metadata.phone_number_id
             
             // Buscar la instancia por phone_number_id
             const { data: instance } = await supabase
                 .from('whatsapp_instances')
                 .select('id, agency_id')
                 .eq('phone_number_id', phoneNumberId)
                 .single()

             if (!instance) continue

             for (const message of val.messages) {
                const contactPhone = message.from
                const wamid = message.id
                const contactName = val.contacts?.[0]?.profile?.name || contactPhone

                let content = ''
                if (message.type === 'text') content = message.text.body
                else if (message.type === 'image') content = message.image.caption || 'Imagen recibida'
                else if (message.type === 'interactive') {
                    content = message.interactive.button_reply?.title || message.interactive.list_reply?.title || 'Respuesta interactiva'
                } else continue // Ignorar otros tipos por ahora

                // Buscar o crear la conversacion
                let conversation_id: string
                let botIsActive = true
                
                const { data: conv } = await supabase
                    .from('wa_conversations')
                    .select('id, bot_active, unread_count')
                    .eq('instance_id', instance.id)
                    .eq('contact_phone', contactPhone)
                    .maybeSingle()

                if (!conv) {
                    const { data: newConv } = await supabase
                        .from('wa_conversations')
                        .insert({
                            agency_id: instance.agency_id,
                            instance_id: instance.id,
                            contact_phone: contactPhone,
                            contact_name: contactName,
                            status: 'active',
                            bot_active: true,
                            unread_count: 1,
                            last_message_at: new Date().toISOString(),
                            last_inbound_at: new Date().toISOString()
                        })
                        .select()
                        .single()
                    
                    if (!newConv) continue
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
                            unread_count: (conv.unread_count || 0) + 1,
                        })
                        .eq('id', conversation_id)
                }

                // Insertar el mensaje
                const { data: insertedMsg } = await supabase
                    .from('wa_messages')
                    .insert({
                        conversation_id,
                        agency_id: instance.agency_id,
                        content,
                        role: 'lead',
                        message_type: message.type,
                        wamid,
                        metadata: message
                    })
                    .select('id')
                    .single()

                // Gatillar n8n si el bot esta activo
                if (botIsActive && process.env.N8N_WEBHOOK_URL) {
                    // Obtener los ultimos 10 mensajes para dar contexto de historial
                    const { data: recentMessages } = await supabase
                        .from('wa_messages')
                        .select('role, content, created_at')
                        .eq('conversation_id', conversation_id)
                        .order('created_at', { ascending: false })
                        .limit(10)

                    // Obtener etiquetas y score actualizados de la conversacion
                    const { data: convMeta } = await supabase
                        .from('wa_conversations')
                        .select('etiquetas, score, status')
                        .eq('id', conversation_id)
                        .single()

                    const enrichedPayload = {
                        debug_v: '5.0_meta_final',
                        webhook_event_id: crypto.randomUUID(),
                        message_id: insertedMsg?.id || null,
                        // IDs necesarios para que n8n pueda responder de vuelta
                        agency_id: instance.agency_id,
                        conversation_id,
                        // Datos del contacto
                        contact_phone: contactPhone,
                        contact_name: contactName,
                        // El mensaje actual que llego
                        message: {
                            id: insertedMsg?.id || null,
                            content,
                            type: message.type,
                            wamid,
                            received_at: new Date().toISOString(),
                        },
                        // Metadatos de la conversacion (etiquetas, score, estado)
                        conversation: {
                            etiquetas: convMeta?.etiquetas || [],
                            score: convMeta?.score || 0,
                            status: convMeta?.status || 'active',
                            bot_active: botIsActive,
                        },
                        // Historial de mensajes (del mas antiguo al mas reciente)
                        history: (recentMessages || []).reverse().map((m: { role: string; content: string; created_at: string }) => ({
                            role: m.role,
                            content: m.content,
                            at: m.created_at,
                        })),
                        // URL a la que n8n debe hacer POST para guardar la respuesta y enviarla al lead
                        reply_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/n8n/reply`,
                    }

                    fetch(process.env.N8N_WEBHOOK_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(enrichedPayload)
                    }).catch(e => console.error('Error triggering n8n from meta webhook:', e))
                } else if (!botIsActive) {
                    // Bot apagado (modo manual): guardar mensaje del lead en n8n_chat_histories
                    // con await para que Vercel no corte la función antes de completar
                    const fechaManual = new Date().toLocaleString('es-AR', {
                        timeZone: 'America/Argentina/Buenos_Aires',
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit', second: '2-digit'
                    }).replace(',', '')
                    const { error: historyErr } = await supabase.from('n8n_chat_histories').insert({
                        session_id: conversation_id,
                        message: {
                            type: 'human',
                            content: `# Mensaje a responder del usuario: \n\n- Mensaje: <${message.type}> ${content} </${message.type}>\n\n- Fecha actual: ${fechaManual}\n`,
                            additional_kwargs: {},
                            response_metadata: {}
                        }
                    })
                    if (historyErr) {
                        console.error('[Meta Webhook] Error guardando en n8n_chat_histories (modo manual):', historyErr)
                    } else {
                        console.log(`[Meta Webhook] Bot inactivo — mensaje del lead guardado en n8n_chat_histories para conv: ${conversation_id}`)
                    }
                }
             }
          }
       }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Meta webhook error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
