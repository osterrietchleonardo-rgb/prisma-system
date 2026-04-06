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

async function getDirectorProfile(): Promise<{ agency_id: string }> {
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

  if (profile.role !== 'director') {
    throw new Error('Acceso denegado: se requiere rol director')
  }

  if (!profile.agency_id) {
    throw new Error('Acceso denegado: sin agencia asignada')
  }

  return { agency_id: profile.agency_id }
}

// =============================================
// Action 1: Conectar instancia WhatsApp
// =============================================

export async function connectWhatsApp(
  input: ConnectWhatsAppInput
): Promise<WhatsAppActionResult> {
  try {
    const { agency_id } = await getDirectorProfile()
    const supabase = createClient()

    const instance_name = `prisma_${agency_id.slice(0, 8)}`
    const evolutionUrl = process.env.EVOLUTION_API_URL
    const evolutionKey = process.env.EVOLUTION_API_KEY
    const appUrl = process.env.NEXT_PUBLIC_APP_URL

    if (!evolutionUrl || !evolutionKey || !appUrl) {
      return {
        success: false,
        error: 'Configuración de Evolution API incompleta. Verificar variables de entorno.',
      }
    }

    // Crear instancia en Evolution API
    const response = await fetch(`${evolutionUrl}/instance/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: evolutionKey,
      },
      body: JSON.stringify({
        instanceName: instance_name,
        qrcode: false,
        integration: 'WHATSAPP_CLOUD',
        cloud: {
          token: input.token,
          phoneNumberId: input.phone_number_id,
        },
        webhook: {
          enabled: true,
          url: `${appUrl}/api/webhooks/evolution`,
          webhookByEvents: false,
          base64: true,
          events: [
            'MESSAGES_UPSERT',
            'MESSAGES_UPDATE',
            'APPLICATION_STARTUP',
          ],
        },
      }),
    })

    if (!response.ok) {
      const errorData = await response.text()
      return {
        success: false,
        error: `Error al crear instancia en Evolution API: ${response.status}`,
      }
    }

    // Guardar instancia en Supabase
    const { error: insertError } = await supabase
      .from('whatsapp_instances')
      .insert({
        agency_id,
        instance_name,
        token: input.token,
        phone_number_id: input.phone_number_id,
        business_id: input.business_id,
        status: 'pending',
      })

    if (insertError) {
      return {
        success: false,
        error: `Error al guardar instancia: ${insertError.message}`,
      }
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
    await getDirectorProfile()
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
    const { agency_id } = await getDirectorProfile()
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
      .select('instance_name')
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
    const response = await fetch(
      `${evolutionUrl}/message/sendText/${instance.instance_name}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: evolutionKey,
        },
        body: JSON.stringify({
          number: conversation.contact_phone,
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
    const { error: insertError } = await supabase
      .from('wa_messages')
      .insert({
        conversation_id,
        agency_id,
        content,
        role: 'human',
        message_type: 'text',
      })

    if (insertError) {
      return {
        success: false,
        error: `Mensaje enviado pero error al guardar: ${insertError.message}`,
      }
    }

    return { success: true }
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
    const { agency_id } = await getDirectorProfile()
    const supabase = createClient()

    const { error } = await supabase
      .from('wa_messages')
      .insert({
        conversation_id,
        agency_id,
        content,
        role: 'internal',
        message_type: 'text',
      })

    if (error) {
      return { success: false, error: `Error al guardar nota: ${error.message}` }
    }

    return { success: true }
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
    await getDirectorProfile()
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
    if (input.header) {
      components.push({ type: 'HEADER', format: 'TEXT', text: input.header })
    }
    components.push({ type: 'BODY', text: input.body })
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
