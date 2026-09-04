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

/** Los formatos reales mezclan "+54 11...", "+549..." y "549...": comparamos los últimos 8 dígitos. */
export function coincideTelefono(a: string, b: string): boolean {
  const da = a.replace(/\D/g, "").slice(-8)
  const db_ = b.replace(/\D/g, "").slice(-8)
  return da.length === 8 && da === db_
}

export interface ActividadTracking {
  type: string
  fecha_actividad: string | null
  propiedad_ref: string | null
}

const DIAS_TRACKING = 14

/**
 * Lo que el veredicto necesita saber del registro en PRISMA:
 * - visita registrada = `visit_scheduled_at` en la conversación O una fila futura en
 *   `scheduled_visits` de la agencia cuyo teléfono coincida (últimos 8 dígitos).
 * - actividades del tracking = `performance_logs` del contacto (vía wa_contacts por
 *   teléfono exacto), últimos 14 días. Sin contacto que matchee: lista vacía.
 */
export async function contextoRegistro(
  db: SupabaseClient,
  c: { agency_id: string; contact_phone: string; visit_scheduled_at: string | null },
  ahoraMs: number
): Promise<{ visitaRegistrada: boolean; actividades: ActividadTracking[] }> {
  const hoy = new Date(ahoraMs).toISOString().slice(0, 10)
  const { data: visitas } = await db
    .from("scheduled_visits")
    .select("telefono, fecha_visita")
    .eq("agency_id", c.agency_id)
    .gte("fecha_visita", hoy)
    .limit(50)
  const enCalendario = (visitas ?? []).some((v: { telefono: string | null }) =>
    coincideTelefono(String(v.telefono ?? ""), c.contact_phone))
  const visitaRegistrada = Boolean(c.visit_scheduled_at) || enCalendario

  let actividades: ActividadTracking[] = []
  const { data: contacto } = await db
    .from("wa_contacts").select("id")
    .eq("agency_id", c.agency_id).eq("phone", c.contact_phone).maybeSingle()
  if (contacto?.id) {
    const desde = new Date(ahoraMs - DIAS_TRACKING * 24 * 3600e3).toISOString()
    const { data: acts } = await db
      .from("performance_logs")
      .select("type, fecha_actividad, propiedad_ref")
      .eq("wa_contact_id", contacto.id)
      .gte("created_at", desde)
      .limit(20)
    actividades = (acts ?? []) as ActividadTracking[]
  }
  return { visitaRegistrada, actividades }
}
