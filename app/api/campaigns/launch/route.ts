import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { processCampaign } from '@/lib/whatsapp/campaign-sender'

export const dynamic = 'force-dynamic'
// Mismo motivo que en /api/cron/campaigns: las lecturas de la cola no pueden salir de caché.
export const revalidate = 0
export const fetchCache = 'force-no-store'
export const maxDuration = 120

// Primer lote inmediato al "Lanzar ahora" (chico, para respuesta rápida).
// El resto lo sigue enviando el cron automáticamente (lotes diarios).
const IMMEDIATE_BATCH = 50

export async function POST(req: Request) {
  // Auth: solo el director de la agencia.
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('agency_id, role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'director' || !profile.agency_id) {
    return NextResponse.json({ success: false, error: 'Acceso denegado' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const campaignId = body?.campaign_id as string | undefined
  if (!campaignId) return NextResponse.json({ success: false, error: 'Falta campaign_id' }, { status: 400 })

  // La campaña debe ser de la agencia del director.
  const { data: campaign } = await supabase
    .from('wa_campaigns')
    .select('*')
    .eq('id', campaignId)
    .eq('agency_id', profile.agency_id)
    .maybeSingle()

  if (!campaign) return NextResponse.json({ success: false, error: 'Campaña no encontrada' }, { status: 404 })

  // Activar y enviar el primer lote inmediato (con cliente admin para el envío).
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  await admin.from('wa_campaigns').update({ status: 'active', updated_at: new Date().toISOString() }).eq('id', campaignId)
  campaign.status = 'active'

  try {
    const result = await processCampaign(campaign, admin, IMMEDIATE_BATCH)
    return NextResponse.json({ success: true, result })
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'Error al enviar' }, { status: 500 })
  }
}
