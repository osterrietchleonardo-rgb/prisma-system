import type { SupabaseClient } from '@supabase/supabase-js'

// Lógica compartida de envío de una campaña por goteo.
// La usan: el cron (/api/cron/campaigns) y el botón "Lanzar ahora" (/api/campaigns/launch).

export const SEND_DELAY_MS = 350

export function tierToNumber(tier: string | null | undefined): number {
  if (!tier) return 250
  const t = String(tier).toUpperCase()
  if (t.includes('UNLIMITED')) return 1000000
  const k = t.match(/(\d+)\s*K/)
  if (k) return parseInt(k[1], 10) * 1000
  const n = t.match(/(\d+)/)
  if (n) return parseInt(n[1], 10)
  return 250
}

interface VarEntry { mode: 'manual' | 'field'; value: string }

function resolveVar(entry: VarEntry | undefined, recipient: { name: string | null; phone: string }): string {
  if (!entry) return ''
  if (entry.mode === 'manual') return entry.value || ''
  if (entry.value === 'nombre') return recipient.name || ''
  if (entry.value === 'celular') return recipient.phone || ''
  return ''
}

/**
 * Procesa UN lote de una campaña: lee el límite real de Meta, calcula el cupo restante
 * (límite − enviados últimas 24h), envía hasta `maxToSend` pendientes, marca enviados/errores
 * (idempotente), crea el chat y refleja el estado en wa_contacts. No supera el límite de Meta.
 */
export async function processCampaign(
  campaign: any,
  supabase: SupabaseClient,
  maxToSend: number
): Promise<Record<string, unknown> | string> {
  // 1. Instancia de la agencia.
  const { data: instance } = await supabase
    .from('whatsapp_instances')
    .select('token, phone_number_id, business_id, messaging_limit_tier, status')
    .eq('agency_id', campaign.agency_id)
    .limit(1)
    .maybeSingle()

  if (!instance || instance.status === 'disconnected' || !instance.token || !instance.phone_number_id) {
    return 'sin_instancia_o_token'
  }

  // 2. Validar token antes de enviar (no quema la cola si está vencido).
  const tokenCheck = await fetch(
    `https://graph.facebook.com/v20.0/${instance.phone_number_id}?fields=id`,
    { headers: { Authorization: `Bearer ${instance.token}` } }
  )
  if (!tokenCheck.ok) {
    const tErr = await tokenCheck.json().catch(() => ({}))
    return `token_invalido: ${(tErr as any)?.error?.message || tokenCheck.status}`
  }

  // 3. Límite REAL de Meta (WABA). Si falla, usar el último guardado.
  let metaTier = instance.messaging_limit_tier
  if (instance.business_id) {
    try {
      const limitRes = await fetch(
        `https://graph.facebook.com/v20.0/${instance.business_id}?fields=whatsapp_business_manager_messaging_limit`,
        { headers: { Authorization: `Bearer ${instance.token}` } }
      )
      if (limitRes.ok) {
        const limitData = await limitRes.json().catch(() => ({})) as { whatsapp_business_manager_messaging_limit?: string }
        if (limitData.whatsapp_business_manager_messaging_limit) {
          metaTier = limitData.whatsapp_business_manager_messaging_limit
          if (metaTier !== instance.messaging_limit_tier) {
            await supabase.from('whatsapp_instances').update({ messaging_limit_tier: metaTier }).eq('agency_id', campaign.agency_id)
          }
        }
      }
    } catch { /* usar el último guardado */ }
  }

  // 4. Plantilla.
  const { data: template } = await supabase
    .from('wa_templates')
    .select('components, language')
    .eq('agency_id', campaign.agency_id)
    .eq('template_name', campaign.template_name)
    .limit(1)
    .maybeSingle()

  // 5. Cupo = límite real − enviados últimas 24h.
  const metaLimit = tierToNumber(metaTier)
  const dailyLimit = campaign.daily_limit ? Math.min(campaign.daily_limit, metaLimit) : metaLimit
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count: sent24h } = await supabase
    .from('wa_campaign_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaign.id)
    .eq('status', 'sent')
    .gt('sent_at', since24h)

  const quota = Math.max(0, dailyLimit - (sent24h ?? 0))
  if (quota === 0) {
    return `limite_diario_alcanzado (${dailyLimit})`
  }

  const batchSize = Math.min(quota, maxToSend)

  const { data: recipients } = await supabase
    .from('wa_campaign_recipients')
    .select('id, phone, name, contact_id')
    .eq('campaign_id', campaign.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(batchSize)

  if (!recipients || recipients.length === 0) {
    await supabase.from('wa_campaigns').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', campaign.id)
    return 'completada'
  }

  const varMap = (campaign.variable_map || {}) as { header?: VarEntry[]; body?: VarEntry[] }
  const lang = campaign.template_language || (template?.language as string) || 'es_AR'
  const bodyComponent = Array.isArray(template?.components)
    ? (template!.components as any[]).find((c) => c.type === 'BODY')
    : null
  const bodyTextTemplate: string = bodyComponent?.text || `[Plantilla: ${campaign.template_name}]`

  let sent = 0
  let errored = 0

  const markContactStatus = async (contactId: string | null, phone: string, statusLabel: 'enviado' | 'error') => {
    try {
      const base = supabase.from('wa_contacts').select('id, campaign_statuses').eq('agency_id', campaign.agency_id)
      const { data: c } = await (contactId ? base.eq('id', contactId) : base.eq('phone', phone.replace(/\D/g, ''))).maybeSingle()
      if (!c) return
      const current = (c.campaign_statuses || {}) as Record<string, unknown>
      const at = new Date().toISOString()
      await supabase.from('wa_contacts').update({
        campaign_statuses: { ...current, [campaign.template_name]: { status: statusLabel, sent_at: at } },
        last_campaign_status: statusLabel,
        last_campaign_template: campaign.template_name,
        last_campaign_sent_at: at,
      }).eq('id', c.id)
    } catch { /* best-effort */ }
  }

  for (const r of recipients) {
    try {
      const headerParams = (varMap.header || []).map((e) => resolveVar(e, r))
      const bodyParams = (varMap.body || []).map((e) => resolveVar(e, r))

      const components: any[] = []
      if (headerParams.length > 0) {
        components.push({ type: 'header', parameters: headerParams.map((t) => ({ type: 'text', text: t })) })
      }
      if (bodyParams.length > 0) {
        components.push({ type: 'body', parameters: bodyParams.map((t) => ({ type: 'text', text: t })) })
      }

      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: r.phone.replace(/\D/g, ''),
        type: 'template',
        template: {
          name: campaign.template_name,
          language: { code: lang },
          components: components.length > 0 ? components : undefined,
        },
      }

      const res = await fetch(`https://graph.facebook.com/v20.0/${instance.phone_number_id}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${instance.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        const msg = (errBody as any)?.error?.message || `HTTP ${res.status}`
        await supabase.from('wa_campaign_recipients').update({ status: 'error', error_message: String(msg).slice(0, 400) }).eq('id', r.id)
        await markContactStatus(r.contact_id, r.phone, 'error')
        errored++
        continue
      }

      let fullText = bodyTextTemplate
      bodyParams.forEach((val, idx) => { fullText = fullText.replace(`{{${idx + 1}}}`, val) })

      const cleanPhone = r.phone.replace(/\D/g, '')
      const { data: conv } = await supabase
        .from('wa_conversations')
        .select('id')
        .eq('agency_id', campaign.agency_id)
        .eq('contact_phone', cleanPhone)
        .maybeSingle()

      let conversationId = conv?.id as string | undefined
      if (!conversationId) {
        const { data: contactClasif } = await supabase
          .from('wa_contacts').select('clasificacion').eq('agency_id', campaign.agency_id).eq('phone', cleanPhone).maybeSingle()
        const { data: newConv } = await supabase
          .from('wa_conversations')
          .insert({
            agency_id: campaign.agency_id,
            contact_phone: cleanPhone,
            contact_name: r.name,
            // El director decide al crear la campaña si los chats nuevos nacen con
            // el bot IA prendido o apagado (ej: reclutamiento → apagado). Default true.
            bot_active: campaign.bot_active_on_reply ?? true,
            unread_count: 0,
            clasificacion: contactClasif?.clasificacion ?? campaign.audience_clasificacion ?? null,
          })
          .select('id')
          .single()
        conversationId = newConv?.id
      } else {
        // Si la conversación ya existía de antes, actualizamos bot_active y clasificacion 
        // para alinearlos con la configuración de la campaña actual.
        await supabase
          .from('wa_conversations')
          .update({
            bot_active: campaign.bot_active_on_reply ?? true,
            clasificacion: campaign.audience_clasificacion ?? null
          })
          .eq('id', conversationId)
      }

      if (conversationId) {
        await supabase.from('wa_messages').insert({
          conversation_id: conversationId,
          agency_id: campaign.agency_id,
          content: fullText.trim(),
          role: 'human',
          message_type: 'text',
        })

        // Guardar en n8n_chat_histories para dar contexto a la IA
        const fecha = new Date().toLocaleString('es-AR', { 
          timeZone: 'America/Argentina/Buenos_Aires',
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit'
        }).replace(',', '')

        await supabase.from('n8n_chat_histories').insert({
          session_id: conversationId,
          message: {
            type: 'ai',
            content: JSON.stringify({
              output: {
                Mensaje: fullText.trim(),
                Fecha: fecha
              }
            }),
            tool_calls: [],
            additional_kwargs: {
              is_template: true,
              template_name: campaign.template_name
            },
            response_metadata: {
              source: 'campaign_template_mass_auto',
              agent_role: 'system_campaign_auto'
            },
            invalid_tool_calls: []
          }
        })
      }

      await supabase.from('wa_campaign_recipients').update({ status: 'sent', sent_at: new Date().toISOString(), error_message: null }).eq('id', r.id)
      await markContactStatus(r.contact_id, r.phone, 'enviado')
      sent++
    } catch (e) {
      errored++
      await supabase.from('wa_campaign_recipients').update({ status: 'error', error_message: (e instanceof Error ? e.message : 'error').slice(0, 400) }).eq('id', r.id)
      await markContactStatus(r.contact_id, r.phone, 'error')
    }

    await new Promise((resolve) => setTimeout(resolve, SEND_DELAY_MS))
  }

  const { count: remaining } = await supabase
    .from('wa_campaign_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaign.id)
    .eq('status', 'pending')

  if ((remaining ?? 0) === 0) {
    await supabase.from('wa_campaigns').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', campaign.id)
  }

  return { sent, errored, remaining: remaining ?? 0, dailyLimit }
}
