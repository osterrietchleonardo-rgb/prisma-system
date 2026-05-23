"use server"

import { createAdminClient } from "@/lib/supabase/admin"

export async function generateDirectorInvite() {
  try {
    const adminClient = createAdminClient()
    const inviteCode = "DIR-" + Math.random().toString(36).substring(2, 8).toUpperCase()
    
    const { error } = await adminClient
      .from('director_invites')
      .insert({
        code: inviteCode,
        is_used: false
      })

    if (error) {
      console.error("Error generating director invite:", error)
      return { error: "No se pudo generar el código." }
    }

    return { success: true, code: inviteCode }
  } catch (err) {
    return { error: "Error desconocido al generar código." }
  }
}
