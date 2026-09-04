import type { SupabaseClient } from "@supabase/supabase-js"

/** El sistema escribe este marcador con role='internal' al apagarse el bot: NO es una nota del asesor. */
export const MARCADOR_HANDOFF = "⚠️ Handoff activado"

export interface NotaInterna {
  id: string
  content: string
  created_at: string
}

/** La última nota interna REAL del asesor posterior a t0 (excluye el marcador automático). */
export async function notaPosterior(
  db: SupabaseClient,
  conversationId: string,
  t0ISO: string
): Promise<NotaInterna | null> {
  const { data } = await db
    .from("wa_messages")
    .select("id, content, created_at")
    .eq("conversation_id", conversationId)
    .eq("role", "internal")
    .not("content", "like", `${MARCADOR_HANDOFF}%`)
    .gt("created_at", t0ISO)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as NotaInterna | null) ?? null
}
