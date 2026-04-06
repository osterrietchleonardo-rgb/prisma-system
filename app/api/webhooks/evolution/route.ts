import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const payload = await req.json()

    // Asegurarse de que provenga del evento messages.upsert
    if (payload.event !== 'messages.upsert') {
      return NextResponse.json({ success: true, message: 'Event ignored (not messages.upsert)' })
    }

    const { data, instance: instanceName } = payload
    if (!data || !data.message) {
      return NextResponse.json({ success: true, message: 'No message data' })
    }

    const wamid = data.key?.id
    const contactPhone = data.key?.remoteJid?.split('@')[0]
    
    // Extraer contenido de texto según cómo venga en Evolution API
    const content = data.message?.conversation 
                 || data.message?.extendedTextMessage?.text 
                 || data.message?.imageMessage?.caption 
                 || 'Mensaje multimedia o no soportado'
    const contactName = data.pushName || null

    if (!contactPhone || data.key?.fromMe) {
      // Ignorar nuestros propios envíos o eventos raros sin teléfono
      return NextResponse.json({ success: true, message: 'Ignored outbound or missing remoteJid' })
    }

    // 1. Obtener la instancia usando el nombre de la instancia
    const resolvedInstanceName = instanceName || data.external_instance_id
    const { data: instance } = await supabase
      .from('whatsapp_instances')
      .select('id, agency_id')
      .eq('instance_name', resolvedInstanceName)
      .single()

    if (!instance) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 })
    }

    // 2. Buscar o crear la conversación
    let conversation_id: string
    let botIsActive = true
    const { data: conv } = await supabase
      .from('wa_conversations')
      .select('id, bot_active')
      .eq('instance_id', instance.id)
      .eq('contact_phone', contactPhone)
      .single()

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
          last_inbound_at: new Date().toISOString()
        })
        .select()
        .single()
      
      if (newConvErr || !newConv) {
         console.error('Error creating conversation:', newConvErr)
         return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
      }
      conversation_id = newConv.id
    } else {
      conversation_id = conv.id
      botIsActive = conv.bot_active
      await supabase
        .from('wa_conversations')
        .update({
           contact_name: contactName || undefined, // Update only if present
           last_message_at: new Date().toISOString(),
           last_inbound_at: new Date().toISOString()
        })
        .eq('id', conversation_id)
    }

    // 3. Insertar el mensaje entrante (humano/lead)
    const { error: msgErr } = await supabase
      .from('wa_messages')
      .insert({
        conversation_id,
        agency_id: instance.agency_id,
        content,
        role: 'lead',
        message_type: 'text',
        wamid,
        metadata: data
      })

    if (msgErr) {
       console.error('Error saving message from lead:', msgErr)
    }

    // 4. Si el Asesor IA (bot) está activo, reenviar el evento a n8n
    if (botIsActive) {
      if (process.env.N8N_WEBHOOK_URL) {
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
         }).catch(e => console.error('Error triggering n8n webhook:', e))
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Evolution webhook error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
