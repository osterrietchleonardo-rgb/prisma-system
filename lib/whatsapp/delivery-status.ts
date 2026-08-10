import type { SupabaseClient } from '@supabase/supabase-js'

// Traduce los estados de entrega que llegan por webhook a nuestro vocabulario.
// Dos fuentes hablan distinto:
//   - Meta Cloud API:      'sent' | 'delivered' | 'read' | 'failed'
//   - Evolution/Baileys:   'PENDING' | 'SERVER_ACK' | 'DELIVERY_ACK' | 'READ' | 'PLAYED' | 'ERROR'
//                          (o el número: 1..5, 0/undefined = error/pending)
export type DeliveryStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed'

// Orden de progreso: nunca "retroceder" un estado (ej: un 'delivered' tardío no debe
// pisar un 'read' que ya llegó antes).
const RANK: Record<DeliveryStatus, number> = {
  pending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4, // terminal: siempre gana (es el que le importa al asesor)
}

export function mapDeliveryStatus(raw: unknown): DeliveryStatus | null {
  if (raw === null || raw === undefined) return null
  const s = String(raw).trim().toUpperCase()
  switch (s) {
    case 'SENT':
    case 'SERVER_ACK':
    case '2':
      return 'sent'
    case 'DELIVERED':
    case 'DELIVERY_ACK':
    case '3':
      return 'delivered'
    case 'READ':
    case 'PLAYED':
    case '4':
    case '5':
      return 'read'
    case 'FAILED':
    case 'ERROR':
    case '0':
      return 'failed'
    case 'PENDING':
    case '1':
      return 'pending'
    default:
      return null
  }
}

/**
 * Actualiza el estado de entrega de un mensaje saliente por su wamid.
 * - No retrocede el estado (usa el rank), salvo 'failed' que siempre gana.
 * - Best-effort: nunca rompe el flujo del webhook.
 */
export async function actualizarEstadoEntrega(
  supabase: SupabaseClient,
  wamid: string,
  rawStatus: unknown,
  errorMsg?: string | null
): Promise<void> {
  const nuevo = mapDeliveryStatus(rawStatus)
  if (!wamid || !nuevo) return
  try {
    const { data: msg } = await supabase
      .from('wa_messages')
      .select('id, status')
      .eq('wamid', wamid)
      .maybeSingle()
    if (!msg) return

    const actual = (msg.status as DeliveryStatus | null) ?? 'pending'
    // Solo avanzar; 'failed' pisa cualquier cosa.
    if (nuevo !== 'failed' && RANK[nuevo] <= RANK[actual]) return

    await supabase
      .from('wa_messages')
      .update({
        status: nuevo,
        status_error: nuevo === 'failed' ? (errorMsg || 'No entregado').slice(0, 400) : null,
        status_at: new Date().toISOString(),
      })
      .eq('id', msg.id)
  } catch {
    /* best-effort: la entrega no puede tumbar el webhook */
  }
}
