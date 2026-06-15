"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { revalidatePath } from "next/cache"

/**
 * Desvincula a un asesor de la agencia: lo deja sin acceso al sistema con ese email.
 * - estado='eliminado' + tokens_invalidos_desde=now() → los guards de layout fuerzan logout.
 * - registra el email en emails_bloqueados para impedir el reingreso.
 * Solo lo puede ejecutar un director sobre un asesor de SU misma agencia.
 */
export async function desvincularAsesor(agentId: string, motivo?: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("No autenticado")

  const { data: director } = await supabase
    .from("profiles")
    .select("role, agency_id")
    .eq("id", user.id)
    .single()

  if (!director?.agency_id) throw new Error("Perfil sin inmobiliaria")
  if (director.role !== "director") throw new Error("Solo el director puede desvincular asesores")

  // El asesor debe pertenecer a la misma agencia y ser rol asesor.
  const { data: asesor } = await supabase
    .from("profiles")
    .select("id, email, role, agency_id")
    .eq("id", agentId)
    .single()

  if (!asesor || asesor.agency_id !== director.agency_id || asesor.role !== "asesor") {
    throw new Error("Asesor no encontrado en tu inmobiliaria")
  }

  const admin = createAdminClient()
  const now = new Date().toISOString()

  const { error: updateError } = await admin
    .from("profiles")
    .update({
      estado: "eliminado",
      tokens_invalidos_desde: now,
      deleted_at: now,
      deleted_by: user.id,
    })
    .eq("id", agentId)

  if (updateError) {
    console.error("Error desvinculando asesor:", updateError)
    throw new Error(updateError.message)
  }

  // Bloquear el email para impedir reingreso (best-effort; no rompe si falla).
  if (asesor.email) {
    const { error: blockError } = await admin.from("emails_bloqueados").insert({
      email: asesor.email,
      tipo_entidad: "asesor",
      entidad_id: agentId,
      razon: motivo || "Desvinculado por el director",
      bloqueado_por: user.id,
      bloqueado_at: now,
    })
    if (blockError) console.error("No se pudo registrar el email bloqueado:", blockError)
  }

  revalidatePath("/director/asesores")
  return { success: true }
}
