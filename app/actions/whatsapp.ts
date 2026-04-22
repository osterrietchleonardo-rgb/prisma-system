'use server'

import { createClient } from '@/lib/supabase/server'
import type {
  WhatsAppActionResult,
  ConnectWhatsAppInput,
  InstanceStatusResult,
  CreateTemplateInput,
} from '@/types/whatsapp'

// =============================================
// Helper: Director-only access guard
// =============================================

// =============================================
// Helper: Agency access guard (asesor + director)
// =============================================

async function getAgencyProfile(): Promise<{ agency_id: string; role: string }> {
  const supabase = createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    throw new Error('Acceso denegado: usuario no autenticado')
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('agency_id, role')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    throw new Error('Acceso denegado: perfil no encontrado')
  }

  const allowedRoles = ['director', 'asesor']
  if (!allowedRoles.includes(profile.role)) {
    throw new Error('Acceso denegado: rol no autorizado')
  }

  if (!profile.agency_id) {
    throw new Error('Acceso denegado: sin agencia asignada')
  }

  return { agency_id: profile.agency_id, role: profile.role }
}

// Backward-compatible director-only guard (used by connectWhatsApp + createTemplate + sync)
async function getDirectorProfile(): Promise<{ agency_id: string }> {
  const result = await getAgencyProfile()
  if (result.role !== 'director') {
    throw new Error('Acceso denegado: se requiere rol director')
  }
  return { agency_id: result.agency_id }
}


// =============================================
// Action 1: Conectar instancia WhatsApp via Evolution API
// Evolution API es el intermediario preferido.
// Fallback: Meta Cloud API directa si Evo no esta configurado.
// =============================================

export async function connectWhatsApp(
  input: ConnectWhatsAppInput
): Promise<WhatsAppActionResult> {
  try {
    const { agency_id } = await getDirectorProfile()
    const supabase = createClient()

    // UUID completo como instanceName = 100% único por agencia, imposible de repetir
    const instance_name = `prisma-${agency_id}`
    const evolutionUrl = process.env.EVOLUTION_API_URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    // AUTHENTICATION_API_KEY global del servidor Evolution (no por instancia)
    const evolutionKey = process.env.EVOLUTION_API_KEY

    // -----------------------------------------------------------
    // MODO A: Evolution API como intermediario (modo preferido)
    // -----------------------------------------------------------
    if (evolutionUrl && evolutionKey && appUrl) {
      // Verificar si ya existe para eliminarla antes de recrear
      const { data: existing } = await supabase
        .from('whatsapp_instances')
        .select('id, evo_instance_name')
        .eq('agency_id', agency_id)
        .maybeSingle()

      if (existing?.evo_instance_name) {
        // Eliminar instancia anterior en Evolution (best-effort)
        fetch(`${evolutionUrl}/instance/delete/${existing.evo_instance_name}`, {
          method: 'DELETE',
          headers: { apikey: evolutionKey },
        }).catch(() => null)
      }

      // Crear instancia: integration WHATSAPP-BUSINESS = Meta Cloud API oficial
      const evoRes = await fetch(`${evolutionUrl}/instance/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: evolutionKey },
        body: JSON.stringify({
          instanceName: instance_name,
          integration: 'WHATSAPP-BUSINESS', // Meta Cloud API
          token: input.token,              // Meta Access Token permanente
          number: input.phone_number_id,   // Phone Number ID de Meta
          qrcode: false,
          webhook: {
            url: `${appUrl}/api/webhooks/evolution`,
            byEvents: true,
            base64: false,
            events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'SEND_MESSAGE'],
          },
        }),
      })

      if (!evoRes.ok) {
        const evoErr = await evoRes.text()
        return {
          success: false,
          error: `Error al crear instancia en Evolution API (${evoRes.status}): ${evoErr}`,
        }
      }

      const evoData = await evoRes.json()
      // Evolution devuelve: { instance: { instanceName, instanceId }, hash: { apikey } }
      const evoInstanceName: string = evoData?.instance?.instanceName || instance_name
      const evoInstanceId: string | null = evoData?.instance?.instanceId || null

      // Guardar en Supabase
      const { data: existing2 } = existing
        ? { data: existing }
        : await supabase.from('whatsapp_instances').select('id').eq('agency_id', agency_id).maybeSingle()

      const instancePayload = {
        agency_id,
        instance_name,
        evo_instance_name: evoInstanceName,
        evo_instance_id: evoInstanceId,
        token: input.token,
        phone_number_id: input.phone_number_id,
        business_id: input.business_id,
        status: 'connected',
        integration_type: 'evolution',
      }

      if (existing2) {
        const { error } = await supabase
          .from('whatsapp_instances')
          .update(instancePayload)
          .eq('id', existing2.id)
        if (error) return { success: false, error: `Error actualizando instancia: ${error.message}` }
      } else {
        const { error } = await supabase
          .from('whatsapp_instances')
          .insert(instancePayload)
        if (error) return { success: false, error: `Error guardando instancia: ${error.message}` }
      }

      return { success: true }
    }

    // -----------------------------------------------------------
    // MODO B: Meta Cloud API directa (fallback sin Evolution)
    // -----------------------------------------------------------
    const verifyRes = await fetch(
      `https://graph.facebook.com/v20.0/${input.phone_number_id}?fields=display_phone_number,verified_name`,
      { headers: { Authorization: `Bearer ${input.token}` } }
    )

    if (!verifyRes.ok) {
      const errData = await verifyRes.json().catch(() => ({}))
      return {
        success: false,
        error: `Token o Phone Number ID invalido: ${
          (errData as { error?: { message?: string } }).error?.message ||
          'Verificar credenciales en Meta Developer Portal'
        }`,
      }
    }

    const phoneData = await verifyRes.json() as { display_phone_number?: string }
    const phoneDisplay = phoneData.display_phone_number || null

    const { data: existing } = await supabase
      .from('whatsapp_instances')
      .select('id')
      .eq('agency_id', agency_id)
      .maybeSingle()

    const metaPayload = {
      agency_id,
      instance_name,
      token: input.token,
      phone_number_id: input.phone_number_id,
      business_id: input.business_id,
      phone_display: phoneDisplay,
      status: 'connected',
      integration_type: 'meta_direct',
    }

    if (existing) {
      const { error } = await supabase
        .from('whatsapp_instances')
        .update(metaPayload)
        .eq('id', existing.id)
      if (error) return { success: false, error: `Error actualizando instancia: ${error.message}` }
    } else {
      const { error } = await supabase
        .from('whatsapp_instances')
        .insert(metaPayload)
      if (error) return { success: false, error: `Error guardando instancia: ${error.message}` }
    }

    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return { success: false, error: message }
  }
}

// =============================================
// Action 2: Estado de instancia
// =============================================

export async function getInstanceStatus(
  instance_name: string
): Promise<WhatsAppActionResult & { data?: InstanceStatusResult }> {
  try {
    await getDirectorProfile()

    const evolutionUrl = process.env.EVOLUTION_API_URL
    const evolutionKey = process.env.EVOLUTION_API_KEY

    if (!evolutionUrl || !evolutionKey) {
      return {
        success: false,
        error: 'Configuración de Evolution API incompleta.',
      }
    }

    const response = await fetch(
      `${evolutionUrl}/instance/connectionState/${instance_name}`,
      {
        method: 'GET',
        headers: {
          apikey: evolutionKey,
        },
      }
    )

    if (!response.ok) {
      return {
        success: false,
        error: `Error al consultar estado: ${response.status}`,
      }
    }

    const data = await response.json()

    return {
      success: true,
      data: { state: data.state ?? data.instance?.state ?? 'unknown' },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return { success: false, error: message }
  }
}

// =============================================
// Action 3: Toggle bot activo/inactivo
// =============================================

export async function toggleBotActive(
  conversation_id: string,
  active: boolean
): Promise<WhatsAppActionResult> {
  try {
    await getAgencyProfile()
    const supabase = createClient()

    const { error } = await supabase
      .from('wa_conversations')
      .update({ bot_active: active })
      .eq('id', conversation_id)

    if (error) {
      return { success: false, error: `Error al actualizar bot: ${error.message}` }
    }

    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return { success: false, error: message }
  }
}

// =============================================
// Action 4: Enviar mensaje directo (human)
// =============================================

export async function sendDirectMessage(
  conversation_id: string,
  content: string
): Promise<WhatsAppActionResult> {
  try {
    const { agency_id } = await getAgencyProfile()
    const supabase = createClient()

    const evolutionUrl = process.env.EVOLUTION_API_URL
    const evolutionKey = process.env.EVOLUTION_API_KEY

    if (!evolutionUrl || !evolutionKey) {
      return {
        success: false,
        error: 'Configuración de Evolution API incompleta.',
      }
    }

    // Obtener instance_name de la agencia
    const { data: instance, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .select('instance_name, evo_instance_name, integration_type')
      .eq('agency_id', agency_id)
      .limit(1)
      .single()

    if (instanceError || !instance) {
      return {
        success: false,
        error: 'No se encontró una instancia de WhatsApp configurada.',
      }
    }

    // Obtener contact_phone de la conversación
    const { data: conversation, error: convError } = await supabase
      .from('wa_conversations')
      .select('contact_phone')
      .eq('id', conversation_id)
      .single()

    if (convError || !conversation) {
      return {
        success: false,
        error: 'Conversación no encontrada.',
      }
    }

    // Enviar mensaje via Evolution API
    // Clean phone (remove +, spaces)
    const cleanPhone = conversation.contact_phone.replace(/\D/g, "");

    // Usar evo_instance_name si está disponible (Evolution API), si no caer al instance_name legacy
    const evoName = instance.evo_instance_name || instance.instance_name
    const response = await fetch(
      `${evolutionUrl}/message/sendText/${evoName}`,

      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: evolutionKey,
        },
        body: JSON.stringify({
          number: cleanPhone,
          text: content,
        }),
      }
    )

    if (!response.ok) {
      return {
        success: false,
        error: `Error al enviar mensaje via Evolution: ${response.status}`,
      }
    }

    // Guardar mensaje en Supabase
    const { data: insertedMsg, error: insertError } = await supabase
      .from('wa_messages')
      .insert({
        conversation_id,
        agency_id,
        content,
        role: 'human',
        message_type: 'text',
      })
      .select()
      .single()

    if (insertError) {
      return {
        success: false,
        error: `Mensaje enviado pero error al guardar: ${insertError.message}`,
      }
    }

    // Sincronizar con la memoria de n8n (n8n_chat_histories) con el formato exacto que espera LangChain/n8n
    // Se guarda como tipo 'ai' porque es un mensaje enviado por la inmobiliaria/agente (nuestro lado)
    const fecha = new Date().toLocaleString('es-AR', { 
      timeZone: 'America/Argentina/Buenos_Aires',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).replace(',', '');

    await supabase
      .from('n8n_chat_histories')
      .insert({
        session_id: conversation_id,
        message: {
          type: 'ai',
          content: JSON.stringify({
            output: {
              Mensaje: content,
              Fecha: fecha
            }
          }),
          tool_calls: [],
          additional_kwargs: {},
          response_metadata: {
            source: 'system_manual_chat',
            agent_role: 'human_intervention'
          },
          invalid_tool_calls: []
        }
      })

    return { success: true, data: insertedMsg }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return { success: false, error: message }
  }
}

// =============================================
// Action 5: Agregar nota interna
// =============================================

export async function addInternalNote(
  conversation_id: string,
  content: string
): Promise<WhatsAppActionResult> {
  try {
    const { agency_id } = await getAgencyProfile()
    const supabase = createClient()

    const { data: insertedNote, error } = await supabase
      .from('wa_messages')
      .insert({
        conversation_id,
        agency_id,
        content,
        role: 'internal',
        message_type: 'text',
      })
      .select()
      .single()

    if (error) {
      return { success: false, error: `Error al guardar nota: ${error.message}` }
    }

    return { success: true, data: insertedNote }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return { success: false, error: message }
  }
}

// =============================================
// Action 6: Actualizar etiquetas
// =============================================

export async function updateEtiquetas(
  conversation_id: string,
  etiquetas: string[]
): Promise<WhatsAppActionResult> {
  try {
    await getAgencyProfile()
    const supabase = createClient()

    const { error } = await supabase
      .from('wa_conversations')
      .update({ etiquetas })
      .eq('id', conversation_id)

    if (error) {
      return { success: false, error: `Error al actualizar etiquetas: ${error.message}` }
    }

    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return { success: false, error: message }
  }
}

// =============================================
// Action 7: Crear template (Meta + Local)
// =============================================

export async function createTemplate(
  input: CreateTemplateInput
): Promise<WhatsAppActionResult> {
  try {
    const { agency_id } = await getDirectorProfile()
    const supabase = createClient()

    const { data: instance, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .select('token, business_id')
      .eq('agency_id', agency_id)
      .limit(1)
      .single()

    if (instanceError || !instance) {
      return { success: false, error: 'Instancia no configurada.' }
    }

    const components: Record<string, unknown>[] = []

    const extractVariables = (text: string, providedExamples?: string[]) => {
      const matches = text.match(/\{\{(\d+)\}\}/g)
      if (!matches) return null
      // Obtener el valor máximo de la variable (p. ej. si hay {{1}} y {{2}}, necesitamos 2 ejemplos)
      const maxVar = Math.max(...matches.map(m => parseInt(m.replace(/\D/g, ''), 10)))
      const examples = []
      for (let i = 0; i < maxVar; i++) {
        examples.push(providedExamples?.[i] || `ejemplo_${i + 1}`)
      }
      return examples
    }

    if (input.header) {
      const headerComp: Record<string, unknown> = { type: 'HEADER', format: 'TEXT', text: input.header }
      const headerVars = extractVariables(input.header, input.header_examples)
      if (headerVars) {
        headerComp.example = { header_text: headerVars }
      }
      components.push(headerComp)
    }
    
    const bodyComp: Record<string, unknown> = { type: 'BODY', text: input.body }
    const bodyVars = extractVariables(input.body, input.body_examples)
    if (bodyVars) {
      bodyComp.example = { body_text: [bodyVars] }
    }
    components.push(bodyComp)

    if (input.footer) {
      components.push({ type: 'FOOTER', text: input.footer })
    }
    if (input.buttons && input.buttons.length > 0) {
      components.push({ type: 'BUTTONS', buttons: input.buttons })
    }

    const res = await fetch(`https://graph.facebook.com/v19.0/${instance.business_id}/message_templates`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${instance.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: input.template_name,
        category: input.category,
        language: input.language,
        components,
      }),
    })

    const result = await res.json()

    if (!res.ok) {
      return { success: false, error: result.error?.message || 'Error al crear template en Meta' }
    }

    const { error: insertError } = await supabase
      .from('wa_templates')
      .insert({
        agency_id,
        template_name: input.template_name,
        category: input.category,
        language: input.language,
        components,
        status: 'PENDING',
        meta_template_id: result.id,
      })

    if (insertError) {
      return { success: false, error: `Error local: ${insertError.message}` }
    }

    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return { success: false, error: message }
  }
}

// =============================================
// Action 8: Sincronizar templates desde Meta
// =============================================

export async function syncTemplatesFromMeta(): Promise<WhatsAppActionResult & { count?: number }> {
  try {
    const { agency_id } = await getDirectorProfile()
    const supabase = createClient()

    const { data: instance, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .select('token, business_id')
      .eq('agency_id', agency_id)
      .limit(1)
      .single()

    if (instanceError || !instance) {
      return { success: false, error: 'Instancia no configurada.' }
    }

    const res = await fetch(`https://graph.facebook.com/v19.0/${instance.business_id}/message_templates?fields=name,status,components,rejected_reason,id`, {
      headers: {
        'Authorization': `Bearer ${instance.token}`,
      },
    })

    const result = await res.json()

    if (!res.ok) {
      return { success: false, error: result.error?.message || 'Error al sincronizar templates' }
    }

    const templates = result.data || []
    if (templates.length === 0) return { success: true, count: 0 }

    const upsertData = templates.map((t: Record<string, any>) => ({
      agency_id,
      template_name: t.name,
      status: t.status,
      components: t.components,
      rejection_reason: t.rejected_reason || null,
      meta_template_id: t.id,
    }))

    const { error: upsertError } = await supabase
      .from('wa_templates')
      .upsert(upsertData, { 
        onConflict: 'meta_template_id',
      })

    if (upsertError) {
      return { success: false, error: `Error actualizando templates: ${upsertError.message}` }
    }

    return { success: true, count: templates.length }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return { success: false, error: message }
  }
}

// =============================================
// Action 9: Marcar conversación como leída
// =============================================

export async function markConversationRead(
  conversation_id: string
): Promise<WhatsAppActionResult> {
  try {
    await getAgencyProfile()
    const supabase = createClient()

    const { error } = await supabase
      .from('wa_conversations')
      .update({ unread_count: 0 })
      .eq('id', conversation_id)

    if (error) {
      return { success: false, error: `Error al marcar como leída: ${error.message}` }
    }

    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return { success: false, error: message }
  }
}

// =============================================
// Action 10: Eliminar conversación
// =============================================

export async function deleteConversation(
  conversation_id: string
): Promise<WhatsAppActionResult> {
  try {
    await getAgencyProfile()
    const supabase = createClient()

    const { error } = await supabase
      .from('wa_conversations')
      .delete()
      .eq('id', conversation_id)

    if (error) {
      return { success: false, error: `Error al eliminar conversación: ${error.message}` }
    }

    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return { success: false, error: message }
  }
}

// =============================================
// Action 11: Eliminar instancia de WhatsApp (Zona Peligrosa)
// =============================================

export async function removeInstance(): Promise<WhatsAppActionResult> {
  try {
    const { agency_id } = await getDirectorProfile()
    const supabase = createClient()

    // 1. Obtener la instancia actual
    const { data: instance, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .select('id, evo_instance_name')
      .eq('agency_id', agency_id)
      .limit(1)
      .single()

    if (instanceError || !instance) {
      return { success: false, error: 'Instancia no encontrada.' }
    }

    // 2. Intentar eliminarla en Evolution API si existe
    const evolutionUrl = process.env.EVOLUTION_API_URL
    const evolutionKey = process.env.EVOLUTION_API_KEY

    // Usamos el evo_instance_name si está, si no el instanceName default
    const evoName = instance.evo_instance_name || `prisma-${agency_id}`

    if (evolutionUrl && evolutionKey) {
      await fetch(`${evolutionUrl}/instance/delete/${evoName}`, {
        method: 'DELETE',
        headers: { apikey: evolutionKey },
      }).catch(err => {
        console.error('Error al intentar borrar en evolution:', err)
      })
    }

    // 3. Eliminar el registro en la base de datos (whatsapp_instances)
    const { error: deleteError } = await supabase
      .from('whatsapp_instances')
      .delete()
      .eq('id', instance.id)

    if (deleteError) {
      return { success: false, error: `Error al eliminar la instancia local: ${deleteError.message}` }
    }

    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return { success: false, error: message }
  }
}

// =============================================
// Action 12: Editar template (Meta + Local)
// =============================================

export interface EditTemplateInput extends CreateTemplateInput {
  template_id: string
  meta_template_id: string
}

export async function editTemplate(
  input: EditTemplateInput
): Promise<WhatsAppActionResult> {
  try {
    const { agency_id } = await getDirectorProfile()
    const supabase = createClient()

    const { data: instance, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .select('token, business_id')
      .eq('agency_id', agency_id)
      .limit(1)
      .single()

    if (instanceError || !instance) {
      return { success: false, error: 'Instancia no configurada.' }
    }

    const components: Record<string, unknown>[] = []

    const extractVariables = (text: string, providedExamples?: string[]) => {
      const matches = text.match(/\{\{(\d+)\}\}/g)
      if (!matches) return null
      const maxVar = Math.max(...matches.map(m => parseInt(m.replace(/\D/g, ''), 10)))
      const examples = []
      for (let i = 0; i < maxVar; i++) {
        examples.push(providedExamples?.[i] || `ejemplo_${i + 1}`)
      }
      return examples
    }

    if (input.header) {
      const headerComp: Record<string, unknown> = { type: 'HEADER', format: 'TEXT', text: input.header }
      const headerVars = extractVariables(input.header, input.header_examples)
      if (headerVars) {
        headerComp.example = { header_text: headerVars }
      }
      components.push(headerComp)
    }

    const bodyComp: Record<string, unknown> = { type: 'BODY', text: input.body }
    const bodyVars = extractVariables(input.body, input.body_examples)
    if (bodyVars) {
      bodyComp.example = { body_text: [bodyVars] }
    }
    components.push(bodyComp)

    if (input.footer) {
      components.push({ type: 'FOOTER', text: input.footer })
    }
    if (input.buttons && input.buttons.length > 0) {
      components.push({ type: 'BUTTONS', buttons: input.buttons })
    }

    const res = await fetch(`https://graph.facebook.com/v19.0/${input.meta_template_id}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${instance.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        components,
      }),
    })

    const result = await res.json()

    if (!res.ok) {
      return { success: false, error: result.error?.message || 'Error al editar template en Meta' }
    }

    const { error: updateError } = await supabase
      .from('wa_templates')
      .update({
        components,
        status: 'PENDING',
      })
      .eq('id', input.template_id)

    if (updateError) {
      return { success: false, error: `Error local: ${updateError.message}` }
    }

    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return { success: false, error: message }
  }
}

// =============================================
// Action 13: Eliminar template
// =============================================

export async function deleteTemplate(
  template_id: string,
  template_name: string
): Promise<WhatsAppActionResult> {
  try {
    const { agency_id } = await getDirectorProfile()
    const supabase = createClient()

    const { data: instance, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .select('token, business_id')
      .eq('agency_id', agency_id)
      .limit(1)
      .single()

    if (instanceError || !instance) {
      return { success: false, error: 'Instancia no configurada.' }
    }

    const res = await fetch(`https://graph.facebook.com/v19.0/${instance.business_id}/message_templates?name=${template_name}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${instance.token}`
      }
    })

    const result = await res.json().catch(() => ({}))

    if (!res.ok && result?.error?.code !== 100) {
      console.warn("Meta Delete Error:", result.error)
    }

    const { error: deleteError } = await supabase
      .from('wa_templates')
      .delete()
      .eq('id', template_id)

    if (deleteError) {
      return { success: false, error: `Error local: ${deleteError.message}` }
    }

    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return { success: false, error: message }
  }
}

// =============================================
// Action 14: Enviar Template de Campaña Masiva
// =============================================

export interface SendCampaignMessageInput {
  phone: string;
  name: string;
  template_name: string;
  template_language: string;
  body_variables: string[];
  header_variables?: string[];
  template_full_text: string; // El texto armado "Hola Juan..." para guardar en el historial
}

export async function sendCampaignMessage(
  input: SendCampaignMessageInput
): Promise<WhatsAppActionResult> {
  try {
    const { agency_id } = await getAgencyProfile()
    const supabase = createClient()

    // 1. Obtener la instancia y credenciales
    const { data: instance, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .select('token, phone_number_id, business_id')
      .eq('agency_id', agency_id)
      .limit(1)
      .single()

    if (instanceError || !instance) {
      return { success: false, error: 'Instancia no configurada.' }
    }

    const cleanPhone = input.phone.replace(/\D/g, "");

    // 2. Construir payload de Meta Cloud API
    const components: any[] = []
    
    if (input.header_variables && input.header_variables.length > 0) {
      components.push({
        type: "header",
        parameters: input.header_variables.map((val) => ({
          type: "text",
          text: val
        }))
      })
    }

    if (input.body_variables && input.body_variables.length > 0) {
      components.push({
        type: "body",
        parameters: input.body_variables.map((val) => ({
          type: "text",
          text: val
        }))
      })
    }

    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: cleanPhone,
      type: "template",
      template: {
        name: input.template_name,
        language: { code: input.template_language },
        components: components.length > 0 ? components : undefined
      }
    }

    // 3. Enviar a Meta directamente
    const res = await fetch(`https://graph.facebook.com/v20.0/${instance.phone_number_id}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${instance.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const result = await res.json()

    if (!res.ok) {
      return { success: false, error: result.error?.message || 'Error al enviar template a Meta' }
    }

    // 4. Buscar o crear la conversación
    let conversation_id: string;
    const { data: convData, error: convErr } = await supabase
      .from('wa_conversations')
      .select('id')
      .eq('agency_id', agency_id)
      .eq('contact_phone', cleanPhone)
      .maybeSingle()

    if (convData) {
      conversation_id = convData.id;
      // Actualizar a bot_active = true para que responda la IA cuando el lead conteste
      await supabase
        .from('wa_conversations')
        .update({ bot_active: true })
        .eq('id', conversation_id)

      // CHEQUEO ANTI-DUPLICADO DE CAMPAÑA
      const { data: alreadySent } = await supabase
        .from('wa_messages')
        .select('id')
        .eq('conversation_id', conversation_id)
        .eq('content', input.template_full_text)
        .limit(1)
        .maybeSingle()

      if (alreadySent) {
         // Ya se envió exactamente el mismo texto a este lead (probablemente se pausó la campaña y reanudó)
         return { success: true, warning: 'skipped_duplicate' }
      }
    } else {
      const { data: newConv, error: createConvErr } = await supabase
        .from('wa_conversations')
        .insert({
          agency_id,
          contact_phone: cleanPhone,
          contact_name: input.name,
          bot_active: true, // Listo para la IA
          unread_count: 0
        })
        .select('id')
        .single()
        
      if (createConvErr || !newConv) {
        return { success: false, error: `Mensaje enviado pero falló crear conversación: ${createConvErr?.message}` }
      }
      conversation_id = newConv.id;
    }

    // 5. Guardar en wa_messages
    const { data: insertedMsg, error: insertError } = await supabase
      .from('wa_messages')
      .insert({
        conversation_id,
        agency_id,
        content: input.template_full_text,
        role: 'human', // se muestra como que lo mandamos nosotros
        message_type: 'text',
      })
      .select()
      .single()

    // 6. Guardar en n8n_chat_histories
    const fecha = new Date().toLocaleString('es-AR', { 
      timeZone: 'America/Argentina/Buenos_Aires',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).replace(',', '');

    await supabase
      .from('n8n_chat_histories')
      .insert({
        session_id: conversation_id,
        message: {
          type: 'ai',
          content: JSON.stringify({
            output: {
              Mensaje: input.template_full_text,
              Fecha: fecha
            }
          }),
          tool_calls: [],
          additional_kwargs: {},
          response_metadata: {
            source: 'campaign_template_mass',
            agent_role: 'system_campaign'
          },
          invalid_tool_calls: []
        }
      })

    return { success: true, data: insertedMsg }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return { success: false, error: message }
  }
}
