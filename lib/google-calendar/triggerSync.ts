/**
 * Dispara la sincronización de una visita con Google Calendar SIN bloquear.
 * "Fire-and-forget": si falla (o el asesor no conectó Google), no pasa nada.
 * La fuente de verdad es siempre Supabase.
 *
 * Se llama desde el cliente después de crear / editar / cancelar una visita.
 */
export function triggerCalendarSync(visitId: string | null | undefined): void {
  if (!visitId) return
  try {
    // No await: corre en segundo plano.
    fetch("/api/google-calendar/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitId }),
      keepalive: true,
    }).catch(() => {
      /* best-effort, ignorar */
    })
  } catch {
    /* best-effort, ignorar */
  }
}
