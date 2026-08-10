import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { callN8n } from '@/lib/whatsapp/n8nTrigger'

export const dynamic = 'force-dynamic'
// Puede reprocesar varios disparos (cada uno con reintentos). Damos margen.
export const maxDuration = 60

/**
 * POST /api/n8n/retry-pending
 *
 * Drena la cola `wa_n8n_dead_letter`: vuelve a disparar a n8n los mensajes cuyo
 * disparo original falló (red de contención anti "lead perdido"). Pensado para
 * llamarse manualmente o desde un cron (GitHub Action).
 *
 * Seguridad (acepta cualquiera de las dos):
 *   - Estándar de cron: header `Authorization: Bearer <CRON_SECRET>` (lo usa el
 *     GitHub Action, igual que los demás crons del proyecto).
 *   - Manual: header `x-retry-secret` o query `?secret=` con `N8N_REPLY_SECRET`.
 *   Falla CERRADO: si no matchea ninguno, 401.
 *
 * Query opcional:
 *   ?limit=25          (1..100) — cuántos drenar por corrida.
 *   ?maxAgeHours=3     — solo reprocesar lo caído en las últimas N horas. Evita
 *                        que el cron le conteste a un lead un mensaje viejísimo.
 *                        Sin este parámetro, drena TODO lo pendiente (uso manual).
 */
export async function POST(req: Request) {
  try {
    const url = new URL(req.url)

    // Auth: cron (Bearer CRON_SECRET) O manual (N8N_REPLY_SECRET). Fail-closed.
    const cronSecret = process.env.CRON_SECRET
    const cronOk = !!cronSecret && req.headers.get('authorization') === `Bearer ${cronSecret}`

    const manualSecret = process.env.N8N_REPLY_SECRET
    const providedManual = req.headers.get('x-retry-secret') || url.searchParams.get('secret')
    const manualOk = !!manualSecret && providedManual === manualSecret

    if (!cronOk && !manualOk) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '25', 10) || 25, 1), 100)

    // Filtro de antigüedad opcional: solo caídos recientes (para el cron).
    const maxAgeHours = parseFloat(url.searchParams.get('maxAgeHours') || '')
    const hasAgeFilter = Number.isFinite(maxAgeHours) && maxAgeHours > 0

    let query = supabase
      .from('wa_n8n_dead_letter')
      .select('id, payload, attempts, conversation_id')
      .eq('status', 'pending')

    if (hasAgeFilter) {
      const cutoff = new Date(Date.now() - maxAgeHours * 3600_000).toISOString()
      query = query.gte('created_at', cutoff)
    }

    const { data: pendings, error } = await query
      .order('created_at', { ascending: true })
      .limit(limit)

    if (error) {
      console.error('[retry-pending] Error leyendo cola:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!pendings || pendings.length === 0) {
      return NextResponse.json({ success: true, processed: 0, reprocessed: 0, stillFailing: 0, message: 'No hay disparos pendientes' })
    }

    let reprocessed = 0
    let stillFailing = 0

    for (const row of pendings) {
      const result = await callN8n(row.payload as Record<string, unknown>)
      const prevAttempts = (row.attempts as number) || 0

      if (result.ok) {
        await supabase
          .from('wa_n8n_dead_letter')
          .update({
            status: 'reprocessed',
            reprocessed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            attempts: prevAttempts + result.attempts,
          })
          .eq('id', row.id)
        reprocessed++
        console.log(`[retry-pending] Reprocesado OK — conv: ${row.conversation_id}`)
      } else {
        await supabase
          .from('wa_n8n_dead_letter')
          .update({
            last_error: result.error || 'desconocido',
            updated_at: new Date().toISOString(),
            attempts: prevAttempts + result.attempts,
          })
          .eq('id', row.id)
        stillFailing++
        console.error(`[retry-pending] Sigue fallando — conv: ${row.conversation_id} — ${result.error}`)
      }
    }

    return NextResponse.json({
      success: true,
      processed: pendings.length,
      reprocessed,
      stillFailing,
    })
  } catch (e) {
    console.error('[retry-pending] Error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
