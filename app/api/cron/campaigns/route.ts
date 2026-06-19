import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Tope de envíos por ejecución del cron (para no exceder el timeout de la función).
// El límite DIARIO real se respeta con el conteo de enviados en las últimas 24h.
// Llamar al cron varias veces al día permite cubrir límites diarios altos.
const MAX_PER_RUN = 400
const SEND_DELAY_MS = 350

function tierToNumber(tier: string | null | undefined): number {
  if (!tier) return 250
  const t = String(tier).toUpperCase()
  if (t.includes('UNLIMITED')) return 1000000
  // "TIER_2K", "TIER_10K", "TIER_100K" → número * 1000
  const k = t.match(/(\d+)\s*K/)
  if (k) return parseInt(k[1], 10) * 1000
  // "TIER_250", "TIER_2000" o un número suelto "2000"
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

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: campaigns, error } = await supabase
    .from('wa_campaigns')
    .select('*')
    .eq('status', 'active')

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  if (!campaigns || campaigns.length === 0) {
    return NextResponse.json({ success: true, message: 'No hay campañas activas.' })
  }

  const results: Record<string, unknown> = {}

  for (const campaign of campaigns) {
    try {
      // 1. Instancia de la agencia (token + phone_number_id de Meta).
      const { data: instance } = await supabase
        .from('whatsapp_instances')
        .select('token, phone_number_id, business_id, messaging_limit_tier, status')
        .eq('agency_id', campaign.agency_id)
        .limit(1)
        .maybeSingle()

      if (!instance || instance.status === 'disconnected' || !instance.token || !instance.phone_number_id) {
        results[campaign.id] = 'sin_instancia_o_token'
        continue
      }

      // Validar el token ANTES de enviar. Si está vencido/inválido, saltear la campaña
      // (no marcar 'error'): quedan en cola para cuando se actualice el token.
      const tokenCheck = await fetch(
        `https://graph.facebook.com/v20.0/${instance.phone_number_id}?fields=id`,
        { headers: { Authorization: `Bearer ${instance.token}` } }
      )
      if (!tokenCheck.ok) {
        const tErr = await tokenCheck.json().catch(() => ({}))
        results[campaign.id] = `token_invalido: ${(tErr as any)?.error?.message || tokenCheck.status}`
        continue
      }

      // Leer el LÍMITE REAL de Meta desde la WABA (whatsapp_business_manager_messaging_limit),
      // y guardarlo como fuente de verdad. Si falla, usamos el último guardado.
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

      // 2. Plantilla (para idioma y construcción de componentes/cuerpo).
      const { data: template } = await supabase
        .from('wa_templates')
        .select('components, language')
        .eq('agency_id', campaign.agency_id)
        .eq('template_name', campaign.template_name)
        .limit(1)
        .maybeSingle()

      // 3. Cupo de hoy = límite REAL de Meta − enviados en las últimas 24h.
      //    El límite lo manda Meta (metaTier); campaign.daily_limit solo puede BAJARLO
      //    (auto-freno opcional), nunca superar el tope real de Meta.
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
        results[campaign.id] = `limite_diario_alcanzado (${dailyLimit})`
        continue
      }

      const batchSize = Math.min(quota, MAX_PER_RUN)

      // 4. Tomar los pendientes del lote.
      const { data: recipients } = await supabase
        .from('wa_campaign_recipients')
        .select('id, phone, name, contact_id')
        .eq('campaign_id', campaign.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(batchSize)

      if (!recipients || recipients.length === 0) {
        // No quedan pendientes → campaña completada.
        await supabase.from('wa_campaigns').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', campaign.id)
        results[campaign.id] = 'completada'
        continue
      }

      const varMap = (campaign.variable_map || {}) as { header?: VarEntry[]; body?: VarEntry[] }
      const lang = campaign.template_language || (template?.language as string) || 'es_AR'

      // Texto del cuerpo de la plantilla (para guardar en el historial del chat).
      const bodyComponent = Array.isArray(template?.components)
        ? (template!.components as any[]).find((c) => c.type === 'BODY')
        : null
      const bodyTextTemplate: string = bodyComponent?.text || `[Plantilla: ${campaign.template_name}]`

      let sent = 0
      let errored = 0

      // Refleja el estado por-lead en wa_contacts.campaign_statuses[plantilla] para que
      // se vea en la solapa "Contactos" (misma vista que el envío manual).
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

          // Texto final para el historial (reemplaza {{n}} del cuerpo con los body params).
          let fullText = bodyTextTemplate
          bodyParams.forEach((val, idx) => { fullText = fullText.replace(`{{${idx + 1}}}`, val) })

          // Asegurar conversación (para que el chat aparezca en la bandeja/Leads), heredando clasificación.
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
                bot_active: true,
                unread_count: 0,
                clasificacion: contactClasif?.clasificacion ?? campaign.audience_clasificacion ?? null,
              })
              .select('id')
              .single()
            conversationId = newConv?.id
          }

          if (conversationId) {
            await supabase.from('wa_messages').insert({
              conversation_id: conversationId,
              agency_id: campaign.agency_id,
              content: fullText.trim(),
              role: 'human',
              message_type: 'text',
            })
          }

          await supabase.from('wa_campaign_recipients').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', r.id)
          await markContactStatus(r.contact_id, r.phone, 'enviado')
          sent++
        } catch (e) {
          errored++
          await supabase.from('wa_campaign_recipients').update({ status: 'error', error_message: (e instanceof Error ? e.message : 'error').slice(0, 400) }).eq('id', r.id)
          await markContactStatus(r.contact_id, r.phone, 'error')
        }

        await new Promise((res) => setTimeout(res, SEND_DELAY_MS))
      }

      // ¿Quedan pendientes? Si no, completar.
      const { count: remaining } = await supabase
        .from('wa_campaign_recipients')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaign.id)
        .eq('status', 'pending')

      if ((remaining ?? 0) === 0) {
        await supabase.from('wa_campaigns').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', campaign.id)
      }

      results[campaign.id] = { sent, errored, remaining: remaining ?? 0, dailyLimit }
    } catch (e) {
      results[campaign.id] = `exception: ${e instanceof Error ? e.message : 'error'}`
    }
  }

  return NextResponse.json({ success: true, results })
}
