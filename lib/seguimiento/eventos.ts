import type { SupabaseClient } from "@supabase/supabase-js"

export async function registrarEvento(
  db: SupabaseClient,
  agencyId: string,
  conversationId: string,
  tipo: string,
  descripcion: string,
  datos: Record<string, unknown> = {},
  actor = "agente_seguimiento"
) {
  const { error } = await db.from("lead_eventos").insert({
    agency_id: agencyId,
    conversation_id: conversationId,
    tipo,
    actor,
    descripcion,
    datos,
  })
  if (error) console.error("[seguimiento] error registrando evento:", error.message)
  // nunca rompe el flujo: el evento es trazabilidad, no lógica
}
