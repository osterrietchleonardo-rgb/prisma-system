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
                    // Manejar botones o listas
                    content = message.interactive.button_reply?.title || message.interactive.list_reply?.title || 'Respuesta interactiva'
                } else continue // Ignorar otros tipos por ahora

                // Buscar o crear la conversación (Lógica compartida con Evolution)
                let conversation_id: string
                let botIsActive = true
                
                const { data: conv } = await supabase
                    .from('wa_conversations')
                    .select('id, bot_active')
                    .eq('instance_id', instance.id)
                    .eq('contact_phone', contactPhone)
                    .single()

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
                            last_inbound_at: new Date().toISOString()
                        })
                        .eq('id', conversation_id)
                }

                // Insertar el mensaje
                await supabase
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

                // Gatillar n8n si el bot está activo
                if (botIsActive && process.env.N8N_WEBHOOK_URL) {
                    fetch(process.env.N8N_WEBHOOK_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            agency_id: instance.agency_id,
                            conversation_id,
                            contact_phone: contactPhone,
                            contact_name: contactName,
                            content,
                        })
                    }).catch(e => console.error('Error triggering n8n from meta webhook:', e))
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
