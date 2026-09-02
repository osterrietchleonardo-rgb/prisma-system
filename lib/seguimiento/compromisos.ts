import type { SupabaseClient } from "@supabase/supabase-js"
import type { Candidato } from "./tipos"

/**
 * Compromisos: lo que el sistema persigue. La pieza más valiosa del agente (Task 13):
 * un compromiso activo vale +40 en el score y el agente lo lee con `leer_compromisos`.
 */

/** Pura: de una conversación con visita agendada sale el compromiso del lead. */
export function derivarCompromisosDeVisita(c: Candidato) {
  if (!["scheduled", "confirmed"].includes(c.visit_status) || !c.visit_scheduled_at) return null
  return {
    tipo: "visita_agendada" as const,
    descripcion: `Visita a ${c.visit_address?.trim() || "la propiedad acordada"}`,
    asumido_por: "lead" as const,
    vence_en: c.visit_scheduled_at,
  }
}

/** Corre al inicio de cada corrida: vence lo vencido, crea compromisos de visita nuevos. */
export async function sincronizarCompromisos(db: SupabaseClient) {
  // 1. Marcar vencidos (idempotente)
  await db
    .from("compromisos")
    .update({ estado: "vencido" })
    .eq("estado", "activo")
    .lt("vence_en", new Date().toISOString())

  // 2. Compromisos de visita para conversaciones con visita futura y sin compromiso activo
  const { data: conVisita } = await db
    .from("wa_conversations")
    .select("id, agency_id, visit_status, visit_scheduled_at, visit_address")
    .in("visit_status", ["scheduled", "confirmed"])
    .gt("visit_scheduled_at", new Date().toISOString())
  for (const c of conVisita ?? []) {
    const { data: ya } = await db
      .from("compromisos")
      .select("id")
      .eq("conversation_id", c.id)
      .eq("tipo", "visita_agendada")
      .eq("estado", "activo")
      .limit(1)
    if (ya?.length) continue
    const k = derivarCompromisosDeVisita(c as Candidato)
    if (k)
      await db.from("compromisos").insert({
        agency_id: c.agency_id,
        conversation_id: c.id,
        ...k,
        origen: "visita",
      })
  }
}

/**
 * Task 14: cuando el agente escala, el asesor asume "respuesta_pendiente" con vencimiento
 * en 24 h. Máximo 1 activo por conversación. En sombra también se crea: es información
 * para el asesor, no un envío.
 */
export async function crearCompromisoEscalar(
  db: SupabaseClient,
  c: Pick<Candidato, "id" | "agency_id">,
  descripcion: string,
  decisionId: string | null
): Promise<"creado" | "ya_existia"> {
  const { data: yaEscalado } = await db
    .from("compromisos")
    .select("id")
    .eq("conversation_id", c.id)
    .eq("tipo", "respuesta_pendiente")
    .eq("estado", "activo")
    .limit(1)
  if (yaEscalado?.length) return "ya_existia"
  await db.from("compromisos").insert({
    agency_id: c.agency_id,
    conversation_id: c.id,
    tipo: "respuesta_pendiente",
    descripcion,
    asumido_por: "asesor",
    vence_en: new Date(Date.now() + 24 * 3600e3).toISOString(),
    origen: decisionId ?? "decision",
  })
  return "creado"
}
