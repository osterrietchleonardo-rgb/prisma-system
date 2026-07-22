import { NextResponse } from 'next/server'
import { assertCron } from '@/lib/admin-vakdor/cron-auth'
import { createClient } from '@supabase/supabase-js'
import { processCampaign } from '@/lib/whatsapp/campaign-sender'

export const dynamic = 'force-dynamic'
// Sin esto, Next cachea los fetch que hace supabase-js por debajo y la corrida trabaja
// con datos viejos: llegó a ver "no hay campañas activas" con una campaña activa, y peor,
// puede leer una lista de pendientes ya enviados. La reserva condicional lo cubre igual
// (un UPDATE nunca se cachea), pero la lectura tiene que ser fresca sí o sí.
export const revalidate = 0
export const fetchCache = 'force-no-store'
export const maxDuration = 300

// Tope de envíos por ejecución del cron (para no exceder el timeout de la función).
// El límite DIARIO real se respeta con el conteo de enviados en las últimas 24h.
const MAX_PER_RUN = 200

export async function GET(req: Request) {
  const denied = assertCron(req)
  if (denied) return denied

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
