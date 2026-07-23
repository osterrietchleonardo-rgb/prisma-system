import type { SupabaseClient } from '@supabase/supabase-js'
import {
  sumarClasificacion,
  origenPlantilla,
  esPlantillaDelSistema,
} from '@/lib/whatsapp/clasificaciones'

// Lógica compartida de envío de una campaña por goteo.
// La usan: el cron (/api/cron/campaigns) y el botón "Lanzar ahora" (/api/campaigns/launch).

export const SEND_DELAY_MS = 350

// Presupuesto de tiempo por corrida. La función se muere sola a los 300s (maxDuration) y
// ese corte a mitad de una iteración era lo que dejaba leads "pendientes" con la plantilla
// ya entregada. Cortamos ANTES, de forma ordenada, y el resto lo toma la corrida siguiente.
export const RUN_BUDGET_MS = 240_000

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
 *
 * Garantía de NO reenvío (una plantilla por lead, pase lo que pase):
 *  1. Cada lead se RESERVA ('pending' -> 'sending') antes de mandar nada a Meta. La reserva es
 *     condicional, así que dos corridas superpuestas nunca toman el mismo lead.
 *  2. Apenas Meta acepta el mensaje se marca 'sent', ANTES de crear el chat y los mensajes.
 *  3. La corrida se corta sola a los RUN_BUDGET_MS, antes de que la plataforma la mate.
 *  4. Si algo falla después del envío, el lead queda en 'sending' y nadie lo reenvía:
 *     preferimos no enviar antes que enviar dos veces.
 */
export async function processCampaign(
  campaign: any,
  supabase: SupabaseClient,
  maxToSend: number
): Promise<Record<string, unknown> | string> {
  const startedAt = Date.now()

  // 1. Instancia de la agencia.
  const { data: instance } = await supabase
    .from('whatsapp_instances')
    .select('id, token, phone_number_id, business_id, messaging_limit_tier, status')
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
    // Desempate por id: los destinatarios se cargan de un saque y comparten el MISMO
    // created_at, así que ordenar solo por fecha devolvía un grupo distinto en cada
    // corrida (unos leads salían sorteados muchas veces y otros nunca).
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
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
  let omitidos = 0          // ya reservados por otra corrida
  let sinMarcar = 0         // enviados a Meta pero no se pudo marcar (quedan en 'sending')
  let cortadaPorTiempo = false

  // Clasificación que deja la campaña en el lead. GANA el segmento (que es el nombre que
  // el director le puso al lote cuando importó los contactos); el nombre de la plantilla
  // es solo el respaldo para cuando la campaña no tiene segmento (va a todos los contactos).
  // Así no quedan dos badges redundantes ("Reclutamientormx0726" + "reclutamiento_22062026").
  // Las plantillas que dispara el sistema solo nunca clasifican.
  const clasifPlantilla = esPlantillaDelSistema(campaign.template_name) ? null : campaign.template_name
  const clasifCampaign: string | null = campaign.audience_clasificacion ?? clasifPlantilla
  const origenCampaign = campaign.audience_clasificacion
    ? `campaña: ${campaign.name || campaign.template_name}`
    : origenPlantilla(campaign.template_name)

  const markContactStatus = async (contactId: string | null, phone: string, statusLabel: 'enviado' | 'error') => {
    try {
      const base = supabase
        .from('wa_contacts')
        .select('id, campaign_statuses, clasificacion, clasificaciones_historial')
        .eq('agency_id', campaign.agency_id)
      const { data: c } = await (contactId ? base.eq('id', contactId) : base.eq('phone', phone.replace(/\D/g, ''))).maybeSingle()
      if (!c) return
      const current = (c.campaign_statuses || {}) as Record<string, unknown>
      const at = new Date().toISOString()
      const update: Record<string, unknown> = {
        campaign_statuses: { ...current, [campaign.template_name]: { status: statusLabel, sent_at: at } },
        last_campaign_status: statusLabel,
        last_campaign_template: campaign.template_name,
        last_campaign_sent_at: at,
      }
      // Solo se clasifica lo que efectivamente salió.
      if (statusLabel === 'enviado') {
        const hist = sumarClasificacion(c, clasifCampaign, origenCampaign)
        if (hist) update.clasificaciones_historial = hist
      }
      await supabase.from('wa_contacts').update(update).eq('id', c.id)
    } catch { /* best-effort */ }
  }

  for (const r of recipients) {
    // Cortar de forma ordenada antes de que la plataforma mate la función a mitad de un envío.
    if (Date.now() - startedAt > RUN_BUDGET_MS) {
      cortadaPorTiempo = true
      break
    }

    // RESERVA: pending -> sending, en una sola operación condicional. Si no afecta ninguna
    // fila es porque otra corrida ya la tomó, así que no se manda. Esto es lo que impide
    // que dos corridas superpuestas le manden la misma plantilla al mismo lead.
    const { data: reservado, error: errReserva } = await supabase
      .from('wa_campaign_recipients')
      .update({ status: 'sending', claimed_at: new Date().toISOString() })
      .eq('id', r.id)
      .eq('status', 'pending')
      .select('id')

    if (errReserva || !reservado || reservado.length === 0) {
      omitidos++
      continue
    }

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
        await supabase
          .from('wa_campaign_recipients')
          .update({ status: 'error', error_message: String(msg).slice(0, 400) })
          .eq('id', r.id)
          .eq('status', 'sending')
        await markContactStatus(r.contact_id, r.phone, 'error')
        errored++
        continue
      }

      // Capturar el wamid de Meta para poder rastrear la entrega real (webhook de estado).
      const okBody = await res.json().catch(() => ({}))
      const campWamid: string | null = (okBody as any)?.messages?.[0]?.id || null

      // La plantilla YA salió por WhatsApp. Marcar 'sent' ACÁ, antes de crear el chat y los
      // mensajes: si algo falla más abajo se pierde el registro visual (recuperable), pero
      // nunca se reenvía. Antes se marcaba al final y cualquier corte en el medio provocaba
      // que la corrida siguiente le mandara la plantilla de nuevo al mismo lead.
      const marcarEnviado = () => supabase
        .from('wa_campaign_recipients')
        .update({ status: 'sent', sent_at: new Date().toISOString(), error_message: null })
        .eq('id', r.id)

      let { error: errMarca } = await marcarEnviado()
      if (errMarca) {
        ;({ error: errMarca } = await marcarEnviado())
      }
      if (errMarca) {
        // Queda en 'sending': no se reenvía (preferimos no enviar antes que enviar dos veces).
        console.error(`[campaigns] plantilla enviada a ${r.phone} pero no se pudo marcar: ${errMarca.message}`)
        sinMarcar++
      }

      let fullText = bodyTextTemplate
      bodyParams.forEach((val, idx) => { fullText = fullText.replace(`{{${idx + 1}}}`, val) })

      const cleanPhone = r.phone.replace(/\D/g, '')
      const { data: conv } = await supabase
        .from('wa_conversations')
        .select('id, clasificacion, clasificaciones_historial')
        .eq('agency_id', campaign.agency_id)
        .eq('contact_phone', cleanPhone)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()


      let conversationId: string | undefined
      if (!conv) {
        const { data: contactClasif } = await supabase
          .from('wa_contacts').select('clasificacion').eq('agency_id', campaign.agency_id).eq('phone', cleanPhone).maybeSingle()
        // Si la campaña tiene segmento, manda el segmento. Si va a todos los contactos
        // (sin segmento), se respeta la del contacto en vez de dejar el chat sin clasificar.
        // Gana el segmento de la campaña (el nombre del lote importado); si no tiene,
        // la del contacto en la agenda; y como último respaldo el nombre de la plantilla.
        const clasifInicial = campaign.audience_clasificacion ?? contactClasif?.clasificacion ?? clasifPlantilla
        const atNuevo = new Date().toISOString()
        const historialNuevo = clasifInicial
          ? [{ clasificacion: clasifInicial, origen: origenCampaign, at: atNuevo }]
          : []
        const { data: newConv } = await supabase
          .from('wa_conversations')
          .insert({
            agency_id: campaign.agency_id,
            instance_id: instance.id,
            contact_phone: cleanPhone,
            contact_name: r.name,
            // El director decide al crear la campaña si los chats nuevos nacen con
            // el bot IA prendido o apagado (ej: reclutamiento → apagado). Default true.
            bot_active: campaign.bot_active_on_reply ?? true,
            unread_count: 0,
            clasificacion: clasifInicial,
            clasificaciones_historial: historialNuevo,
          })
          .select('id')
          .single()
        conversationId = newConv?.id
      } else {
        conversationId = conv.id
        // El chat ya existía: se alinea con la campaña en curso.
        //  - instance_id: SIEMPRE. Es lo que ata el chat a la instancia; sin esto se creaban
        //    chats duplicados para el mismo teléfono.
        //  - bot_active: lo decide la campaña (decisión del director, pisa el manual a propósito).
        //  - clasificacion: NO se pisa. El lead conserva su origen (ej. `Whatsapp-Consulta`)
        //    y las de la campaña se le SUMAN al recorrido. Así el filtro lo encuentra por
        //    cualquiera de las dos y no se pierde de dónde vino.
        const update: Record<string, unknown> = {
          instance_id: instance.id,
          bot_active: campaign.bot_active_on_reply ?? true,
        }
        // Si el lead no tenía ninguna, la de la campaña pasa a ser su origen.
        if (!conv.clasificacion && clasifCampaign) {
          update.clasificacion = clasifCampaign
        }
        const hist = sumarClasificacion(
          { clasificacion: (update.clasificacion as string) ?? conv.clasificacion, clasificaciones_historial: conv.clasificaciones_historial },
          clasifCampaign,
          origenCampaign
        )
        if (hist) update.clasificaciones_historial = hist

        await supabase.from('wa_conversations').update(update).eq('id', conversationId)
      }

      if (conversationId) {
        await supabase.from('wa_messages').insert({
          conversation_id: conversationId,
          agency_id: campaign.agency_id,
          content: fullText.trim(),
          role: 'human',
          message_type: 'text',
          wamid: campWamid,
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

      await markContactStatus(r.contact_id, r.phone, 'enviado')
      sent++
    } catch (e) {
      // Ojo: la plantilla pudo haber salido igual. Solo volvemos a 'pending' (reintentable)
      // si la excepción ocurrió ANTES de que Meta aceptara el mensaje; si ya se marcó
      // 'sent' este update no la toca, porque filtra por status 'sending'.
      errored++
      await supabase
        .from('wa_campaign_recipients')
        .update({ status: 'error', error_message: (e instanceof Error ? e.message : 'error').slice(0, 400) })
        .eq('id', r.id)
        .eq('status', 'sending')
      await markContactStatus(r.contact_id, r.phone, 'error')
    }

    await new Promise((resolve) => setTimeout(resolve, SEND_DELAY_MS))
  }

  const { count: remaining } = await supabase
    .from('wa_campaign_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaign.id)
    .eq('status', 'pending')

  // 'sending' cuenta como pendiente de resolver: son leads que quedaron reservados por una
  // corrida cortada. No se reenvían, pero la campaña tampoco puede darse por completada.
  const { count: reservados } = await supabase
    .from('wa_campaign_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaign.id)
    .eq('status', 'sending')

  if ((remaining ?? 0) === 0 && (reservados ?? 0) === 0) {
    await supabase.from('wa_campaigns').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', campaign.id)
  }

  return {
    sent,
    errored,
    omitidos,
    sinMarcar,
    reservados: reservados ?? 0,
    remaining: remaining ?? 0,
    dailyLimit,
    cortadaPorTiempo,
    duracionSeg: Math.round((Date.now() - startedAt) / 1000),
  }
}
