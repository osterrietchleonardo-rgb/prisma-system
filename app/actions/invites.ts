"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { revalidatePath } from "next/cache"

/**
 * Elimina un código de invitación (agency_invites) de la lista.
 * - Solo un director puede borrar códigos de SU misma agencia.
 * - Se permite borrar tanto códigos activos como ya usados: borrar el código NO
 *   desvincula a la persona (para eso está desvincularAsesor), solo limpia la fila.
 */
export async function eliminarCodigoInvitacion(inviteId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("No autenticado")

  const { data: director } = await supabase
    .from("profiles")
    .select("role, agency_id")
    .eq("id", user.id)
    .single()

  if (!director?.agency_id) throw new Error("Perfil sin inmobiliaria")
  if (director.role !== "director") throw new Error("Solo el director puede borrar códigos")

  const admin = createAdminClient()

  // El código debe pertenecer a la misma agencia del director.
  const { data: invite } = await admin
    .from("agency_invites")
    .select("id, agency_id")
    .eq("id", inviteId)
    .single()

  if (!invite || invite.agency_id !== director.agency_id) {
    throw new Error("Código no encontrado en tu inmobiliaria")
  }

  const { error } = await admin.from("agency_invites").delete().eq("id", inviteId)
  if (error) {
    console.error("Error eliminando código de invitación:", error)
    throw new Error(error.message)
  }

  revalidatePath("/director/configuracion")
  return { success: true }
}
