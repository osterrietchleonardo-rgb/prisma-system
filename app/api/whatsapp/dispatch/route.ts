import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  try {
    // 1. Verificación de Seguridad
    const apiKey = req.headers.get('x-api-key')
    if (process.env.DISPATCH_SECRET && apiKey !== process.env.DISPATCH_SECRET) {
      return NextResponse.json({ error: 'Unauthorized. Invalid x-api-key.' }, { status: 401 })
    }

    const body = await req.json()
    const { agency_id, conversation_id, contact_phone, template_name, variables } = body

    if (!agency_id || !conversation_id || !contact_phone || !template_name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // 2. Localizar Instancia
    const { data: instance, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .select('token, phone_number_id, evo_instance_name, integration_type, business_id')
      .eq('agency_id', agency_id)
      .single()

    if (instanceError || !instance) {
      return NextResponse.json({ error: 'Instancia WhatsApp no encontrada para esta agencia' }, { status: 404 })
    }

    // Calcular el nombre final de la plantilla (anteponiendo el prefijo único)
    const prefix = `ag${agency_id.replace(/-/g, '').substring(0, 6)}`
    // Si n8n ya manda el nombre con el prefijo, no lo duplicamos. 
    // Lo ideal es que n8n mande "seg_f1_seguimiento" y nosotros lo completamos.
    const finalTemplateName = template_name.startsWith(prefix) ? template_name : `${prefix}_${template_name}`

    // 2b. Resolver el texto REAL de la plantilla desde wa_templates
    //     (igual que hace CampaignsTab al construir fullText)
    const { data: templateRow } = await supabase
      .from('wa_templates')
      .select('components')
      .eq('agency_id', agency_id)
      .eq('template_name', finalTemplateName)
      .maybeSingle()

    function buildFullText(components: any[], vars: string[]): string {
      let text = ''
      for (const c of components || []) {
        if (c.type === 'HEADER' && c.text) {
          let t: string = c.text
          ;(vars || []).forEach((v, i) => { t = t.replace(`{{${i + 1}}}`, v) })
          text += t + '\n'
        }
        if (c.type === 'BODY' && c.text) {
          let t: string = c.text
          ;(vars || []).forEach((v, i) => { t = t.replace(`{{${i + 1}}}`, v) })
          text += t + '\n'
        }
        if (c.type === 'FOOTER' && c.text) {
          text += `\n${c.text}`
        }
      }
      return text.trim()
    }

    const resolvedText = templateRow?.components
      ? buildFullText(templateRow.components as any[], variables || [])
      : null

    // Si la plantilla no está en BD (ej: entorno de prueba sin plantillas reales),
    // usamos un fallback legible en lugar del placeholder feo anterior.
    const messageContent = resolvedText
      || `[Plantilla: ${finalTemplateName}] ${(variables || []).join(' | ')}`

    let wamid: string | null = null
    const cleanPhone = contact_phone.replace(/\D/g, "")

    // 3. Envío Vía Evolution API o Meta Cloud API
    if (instance.integration_type === 'evolution' && instance.evo_instance_name) {
      const evolutionUrl = process.env.EVOLUTION_API_URL
      const evolutionKey = process.env.EVOLUTION_API_KEY

      if (!evolutionUrl || !evolutionKey) {
        return NextResponse.json({ error: 'Evolution API no configurada' }, { status: 500 })
      }

      const evoPayload = {
        number: cleanPhone,
        name: finalTemplateName,
        language: "es_AR",
        variables: [
          {
            type: "body",
            parameters: (variables || []).map((v: string) => ({
              type: "text",
              text: v
            }))
          }
        ]
      }

      const res = await fetch(`${evolutionUrl}/message/sendTemplate/${instance.evo_instance_name}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: evolutionKey,
        },
        body: JSON.stringify(evoPayload)
      })

      const evoData = await res.json()
      if (!res.ok) {
        console.error('[Dispatch] Error Evolution:', evoData)
        return NextResponse.json({ error: `Evolution Error: ${JSON.stringify(evoData)}` }, { status: 502 })
      }
      wamid = evoData?.key?.id || evoData?.messageId || null

    } else if (instance.phone_number_id && instance.token) {
      // Fallback a Meta Graph API
      const metaPayload = {
        messaging_product: "whatsapp",
        to: cleanPhone,
        type: "template",
        template: {
          name: finalTemplateName,
          language: { code: "es_AR" },
          components: [
            {
              type: "body",
              parameters: (variables || []).map((v: string) => ({
                type: "text",
                text: v
              }))
            }
          ]
        }
      }

      const res = await fetch(`https://graph.facebook.com/v20.0/${instance.phone_number_id}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${instance.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(metaPayload)
      })

      const metaData = await res.json()
      if (!res.ok) {
        console.error('[Dispatch] Error Meta:', metaData)
        return NextResponse.json({ error: `Meta Error: ${metaData.error?.message}` }, { status: 502 })
      }
      wamid = metaData.messages?.[0]?.id || null
    } else {
      return NextResponse.json({ error: 'No hay método de envío configurado' }, { status: 500 })
    }

    // 4. Guardar en wa_messages (texto real de la plantilla con variables sustituidas)
    await supabase.from('wa_messages').insert({
      conversation_id,
      agency_id,
      content: messageContent,
      role: 'bot',
      message_type: 'template',
      wamid,
      metadata: { template_name: finalTemplateName, variables }
    })

    // 5. Guardar en n8n_chat_histories (el agente IA de n8n lee el texto real)
    const fecha = new Date().toLocaleString('es-AR', { 
      timeZone: 'America/Argentina/Buenos_Aires',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).replace(',', '')

    const { error: n8nError } = await supabase.from('n8n_chat_histories').insert({
      session_id: conversation_id,
      message: {
        type: 'ai',
        content: JSON.stringify({
          output: {
            Mensaje: messageContent,
            Fecha: fecha
          }
        }),
        tool_calls: [],
        additional_kwargs: { 
          is_template: true, 
          template_name: finalTemplateName 
        },
        response_metadata: {
          source: 'system_dispatch',
          agent_role: 'follow_up_bot'
        },
        invalid_tool_calls: []
      }
    })
    
    if (n8nError) {
      console.error('[Dispatch] Error guardando en n8n_chat_histories:', n8nError)
    }

    // 6. Registrar evento en follow_ups_history (log inmutable de trazabilidad)
    const { data: convSnap } = await supabase
      .from('wa_conversations')
      .select('follow_ups_history, funnel_status, follow_ups_sent, requires_follow_up, visit_status, recovery_stage, next_follow_up_at, opt_out')
      .eq('id', conversation_id)
      .single()

    const currentHistory = (convSnap?.follow_ups_history as Record<string, unknown>[] | null) ?? []
    const historyEvent = {
      type: template_name,
      template: finalTemplateName,
      at: new Date().toISOString(),
      variables: variables || [],
      wamid: wamid || null,
      // Snapshot del estado en el momento del envío
      snapshot: {
        funnel_status:      convSnap?.funnel_status      ?? null,
        follow_ups_sent:    convSnap?.follow_ups_sent    ?? 0,
        requires_follow_up: convSnap?.requires_follow_up ?? true,
        visit_status:       convSnap?.visit_status       ?? 'none',
        recovery_stage:     convSnap?.recovery_stage     ?? 'direct',
        next_follow_up_at:  convSnap?.next_follow_up_at  ?? null,
        opt_out:            convSnap?.opt_out             ?? false,
      },
    }

    await supabase
      .from('wa_conversations')
      .update({ follow_ups_history: [...currentHistory, historyEvent] })
      .eq('id', conversation_id)

    // 7. Broadcast Realtime
    supabase.channel(`agency-${agency_id}`).send({
      type: 'broadcast',
      event: 'refresh-whatsapp',
      payload: { conversation_id, type: 'bot_reply' }
    }).catch(() => {})

    return NextResponse.json({ success: true, wamid, message: 'Plantilla despachada y sincronizada' })

  } catch (error) {
    console.error('[Dispatch] Internal error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
