import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Validar seguridad del endpoint
    const authHeader = req.headers.get('authorization')
    const secret = process.env.BOT_REPLY_SECRET

    if (!authHeader || authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { agency_id, conversation_id, content } = await req.json()

    if (!agency_id || !conversation_id || !content) {
      return NextResponse.json({ error: 'Missing required payload fields' }, { status: 400 })
    }

    // 1. Guardar mensaje del bot en Supabase
    const { data: newMsg, error: msgErr } = await supabase
      .from('wa_messages')
      .insert({
        conversation_id,
        agency_id,
        content,
        role: 'bot',
        message_type: 'text',
        metadata: {}
      })
      .select()
      .single()

    if (msgErr) {
       console.error('Error saving bot message:', msgErr)
       return NextResponse.json({ error: 'Failed to save message' }, { status: 500 })
    }

    // 2. Obtener datos de la conversación e instancia para enviar por Evolution API
    const { data: conv } = await supabase
      .from('wa_conversations')
      .select('contact_phone, instance_id')
      .eq('id', conversation_id)
      .single()

    if (!conv) {
       return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    const { data: instance } = await supabase
      .from('whatsapp_instances')
      .select('instance_name')
      .eq('id', conv.instance_id)
      .single()

    if (!instance) {
       return NextResponse.json({ error: 'Instance not found' }, { status: 404 })
    }

    const evolutionUrl = process.env.EVOLUTION_API_URL
    const evolutionApiKey = process.env.EVOLUTION_API_KEY
    const instanceName = instance.instance_name

    // 3. POST a Evolution API: /message/sendText/{instanceName}
    const sendRes = await fetch(`${evolutionUrl?.replace(/\/$/, '')}/message/sendText/${instanceName}`, {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         'apikey': evolutionApiKey!
       },
       body: JSON.stringify({
         number: conv.contact_phone,
         text: content,
         delay: 1200 // typing simulation o retraso
       })
    })

    const sendResult = await sendRes.json()

    // 4. Actualizar WAMID devuelto por Evolution y última actividad de la conversación
    if (sendResult.key?.id) {
       await supabase.from('wa_messages').update({ wamid: sendResult.key.id }).eq('id', newMsg.id)
    }

    await supabase.from('wa_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversation_id)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Bot reply error:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
