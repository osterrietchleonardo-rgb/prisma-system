import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Disparo robusto a n8n con reintentos + red de contención (dead-letter).
 *
 * Reemplaza el viejo `fetch(...).catch(() => log)` que tragaba los fallos y
 * dejaba leads sin respuesta y sin rastro. Ahora:
 *   1. Reintenta el POST a n8n hasta MAX_ATTEMPTS con backoff.
 *   2. Si agota los intentos, guarda el disparo en `wa_n8n_dead_letter` para
 *      poder reprocesarlo (endpoint /api/n8n/retry-pending). NUNCA se pierde.
 *
 * Nota de arquitectura: n8n responde al webhook al instante (ACK) y devuelve la
 * respuesta de la IA de forma asíncrona vía POST a /api/n8n/reply. Por eso el
 * ACK llega en <1-2s en operación normal y los reintentos son baratos y seguros
 * (un timeout NO significa que n8n esté procesando: significa que no llegó).
 */

const MAX_ATTEMPTS = 3
const BASE_BACKOFF_MS = 500 // backoff lineal: 500ms, 1000ms entre intentos
const FETCH_TIMEOUT_MS = 15000 // por intento; acotado para no exceder maxDuration

export interface N8nTriggerContext {
  conversation_id: string
  agency_id: string
  message_id: string | null
  contact_phone: string
  source: 'meta' | 'evolution' | 'manual'
}

export interface N8nCallResult {
  ok: boolean
  attempts: number
  error?: string
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Llama a n8n con reintentos. NO toca la base de datos.
 * Devuelve ok=true en el primer 2xx, o ok=false tras agotar los intentos.
 */
export async function callN8n(payload: Record<string, unknown>): Promise<N8nCallResult> {
  const url = process.env.N8N_WEBHOOK_URL
  if (!url) {
    return { ok: false, attempts: 0, error: 'N8N_WEBHOOK_URL no configurada' }
  }

  let lastError = ''
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })

      if (res.ok) {
        if (attempt > 1) {
          console.log(`[n8nTrigger] OK al intento ${attempt}/${MAX_ATTEMPTS}`)
        }
        return { ok: true, attempts: attempt }
      }

      const body = await res.text().catch(() => '')
      lastError = `HTTP ${res.status}: ${body.slice(0, 300)}`
      console.error(`[n8nTrigger] respuesta no-OK (intento ${attempt}/${MAX_ATTEMPTS}): ${lastError}`)
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string }
      lastError =
        err?.name === 'TimeoutError' || err?.name === 'AbortError'
          ? `timeout (>${FETCH_TIMEOUT_MS}ms)`
          : err?.message || String(e)
      console.error(`[n8nTrigger] error de red (intento ${attempt}/${MAX_ATTEMPTS}): ${lastError}`)
    }

    if (attempt < MAX_ATTEMPTS) {
      await sleep(BASE_BACKOFF_MS * attempt)
    }
  }

  return { ok: false, attempts: MAX_ATTEMPTS, error: lastError }
}

/**
 * Disparo a n8n con red de contención: si falla tras los reintentos, persiste
 * el payload en `wa_n8n_dead_letter` para reproceso posterior.
 *
 * Pensado para usarse desde los webhooks entrantes (Meta/Evolution).
 */
export async function triggerN8nWithSafetyNet(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
  ctx: N8nTriggerContext
): Promise<N8nCallResult> {
  const result = await callN8n(payload)

  if (!result.ok) {
    try {
      await supabase.from('wa_n8n_dead_letter').insert({
        conversation_id: ctx.conversation_id,
        agency_id: ctx.agency_id,
        message_id: ctx.message_id,
        contact_phone: ctx.contact_phone,
        source: ctx.source,
        payload,
        attempts: result.attempts,
        last_error: result.error || 'desconocido',
        status: 'pending',
      })
      console.error(
        `[n8nTrigger] DEAD-LETTER guardado — conv: ${ctx.conversation_id}. ` +
          `El lead NO se pierde: queda pendiente de reproceso. Causa: ${result.error}`
      )
    } catch (dlErr) {
      // Último recurso: si ni siquiera se puede guardar el dead-letter, al menos
      // queda en logs con todo el payload para recuperación manual.
      console.error(
        `[n8nTrigger] CRÍTICO: falló guardar dead-letter para conv ${ctx.conversation_id}.`,
        dlErr,
        JSON.stringify(payload)
      )
    }
  }

  return result
}
