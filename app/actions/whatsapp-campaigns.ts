'use server'

import { createClient } from '@/lib/supabase/server'
import type { WhatsAppActionResult } from '@/types/whatsapp'

// =============================================
// Guard: director de la agencia
// =============================================
async function getDirector(): Promise<{ agency_id: string; user_id: string }> {
  const supabase = createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Acceso denegado: no autenticado')

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('agency_id, role')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) throw new Error('Acceso denegado: perfil no encontrado')
  if (profile.role !== 'director') throw new Error('Acceso denegado: se requiere rol director')
  if (!profile.agency_id) throw new Error('Acceso denegado: sin agencia asignada')

  return { agency_id: profile.agency_id, user_id: user.id }
}

// =============================================
// Crear campaña por segmento (clasificación) e inscribir destinatarios
// =============================================
export interface CreateSegmentCampaignInput {
  name: string
  template_name: string
  template_language: string
  variable_map: Record<string, unknown>
  audience_clasificacion: string | null
  daily_limit: number | null
}

export async function createSegmentCampaign(
  input: CreateSegmentCampaignInput
): Promise<WhatsAppActionResult & { campaign_id?: string; enrolled?: number }> {
  try {
    const { agency_id, user_id } = await getDirector()
    const supabase = createClient()

    if (!input.name?.trim()) return { success: false, error: 'Falta el nombre de la campaña.' }
    if (!input.template_name) return { success: false, error: 'Falta la plantilla.' }

    const { data: campaign, error: createErr } = await supabase
      .from('wa_campaigns')
      .insert({
        agency_id,
        name: input.name.trim(),
        template_name: input.template_name,
        template_language: input.template_language || 'es_AR',
        variable_map: input.variable_map || {},
        audience_clasificacion: input.audience_clasificacion,
        daily_limit: input.daily_limit,
        status: 'active',
        created_by: user_id,
      })
      .select('id')
      .single()

    if (createErr || !campaign) {
      return { success: false, error: `Error al crear la campaña: ${createErr?.message}` }
    }

    // Inscribir destinatarios del segmento (INSERT...SELECT eficiente vía función SQL).
    const { data: enrolled, error: enrollErr } = await supabase
      .rpc('enroll_campaign_recipients', { p_campaign_id: campaign.id })

    if (enrollErr) {
      return { success: false, error: `Campaña creada pero falló inscribir contactos: ${enrollErr.message}`, campaign_id: campaign.id }
    }

    return { success: true, campaign_id: campaign.id, enrolled: (enrolled as number) ?? 0 }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return { success: false, error: message }
  }
}

// =============================================
// Listar campañas con estadísticas
// =============================================
export interface CampaignWithStats {
  id: string
  name: string
  template_name: string
  audience_clasificacion: string | null
  daily_limit: number | null
  status: string
  created_at: string
  total: number
  sent: number
  pending: number
  error: number
  sent_24h: number
}

export async function getCampaignsWithStats(): Promise<{ success: boolean; data?: CampaignWithStats[]; error?: string }> {
  try {
    const { agency_id } = await getDirector()
    const supabase = createClient()

    const { data: campaigns, error } = await supabase
      .from('wa_campaigns')
      .select('id, name, template_name, audience_clasificacion, daily_limit, status, created_at')
      .eq('agency_id', agency_id)
      .order('created_at', { ascending: false })

    if (error) return { success: false, error: error.message }

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const withStats: CampaignWithStats[] = await Promise.all(
      (campaigns || []).map(async (c) => {
        const base = supabase
          .from('wa_campaign_recipients')
          .select('id', { count: 'exact', head: true })
          .eq('campaign_id', c.id)

        const [total, sent, pending, errored, sent24h] = await Promise.all([
          base,
          supabase.from('wa_campaign_recipients').select('id', { count: 'exact', head: true }).eq('campaign_id', c.id).eq('status', 'sent'),
          supabase.from('wa_campaign_recipients').select('id', { count: 'exact', head: true }).eq('campaign_id', c.id).eq('status', 'pending'),
          supabase.from('wa_campaign_recipients').select('id', { count: 'exact', head: true }).eq('campaign_id', c.id).eq('status', 'error'),
          supabase.from('wa_campaign_recipients').select('id', { count: 'exact', head: true }).eq('campaign_id', c.id).eq('status', 'sent').gt('sent_at', since24h),
        ])

        return {
          ...c,
          total: total.count ?? 0,
          sent: sent.count ?? 0,
          pending: pending.count ?? 0,
          error: errored.count ?? 0,
          sent_24h: sent24h.count ?? 0,
        }
      })
    )

    return { success: true, data: withStats }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return { success: false, error: message }
  }
}

// =============================================
// Pausar / reanudar / cancelar campaña
// =============================================
export async function setCampaignStatus(
  campaign_id: string,
  status: 'active' | 'paused' | 'completed'
): Promise<WhatsAppActionResult> {
  try {
    const { agency_id } = await getDirector()
    const supabase = createClient()

    const { error } = await supabase
      .from('wa_campaigns')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', campaign_id)
      .eq('agency_id', agency_id)

    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return { success: false, error: message }
  }
}

// =============================================
// Eliminar campaña (borra también sus destinatarios por CASCADE)
// =============================================
export async function deleteCampaign(campaign_id: string): Promise<WhatsAppActionResult> {
  try {
    const { agency_id } = await getDirector()
    const supabase = createClient()

    const { error } = await supabase
      .from('wa_campaigns')
      .delete()
      .eq('id', campaign_id)
      .eq('agency_id', agency_id)

    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return { success: false, error: message }
  }
}
