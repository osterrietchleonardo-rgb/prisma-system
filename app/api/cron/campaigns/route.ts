import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { processCampaign } from '@/lib/whatsapp/campaign-sender'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Tope de envíos por ejecución del cron (para no exceder el timeout de la función).
// El límite DIARIO real se respeta con el conteo de enviados en las últimas 24h.
const MAX_PER_RUN = 400

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
      results[campaign.id] = await processCampaign(campaign, supabase, MAX_PER_RUN)
    } catch (e) {
      results[campaign.id] = `exception: ${e instanceof Error ? e.message : 'error'}`
    }
  }

  return NextResponse.json({ success: true, results })
}
