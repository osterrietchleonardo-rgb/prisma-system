import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Para poder verificar el webhook desde la interfaz de Meta, primero hacemos el GET
export async function GET(req: Request) {
  const url = new URL(req.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')

  if (mode && token) {
    if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
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
          if (change.field === 'message_template_status_update') {
             const val = change.value
             const templateId = val.message_template_id
             const status = val.event // "APPROVED", "REJECTED", "PENDING", "PAUSED", etc.
             const reason = val.reason || null

             const { error } = await supabase
                 .from('wa_templates')
                 .update({
                     status,
                     rejection_reason: reason,
                     updated_at: new Date().toISOString()
                 })
                 .eq('meta_template_id', templateId)

             if (error) {
                console.error(`Error updating template status for ${templateId}:`, error.message)
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
