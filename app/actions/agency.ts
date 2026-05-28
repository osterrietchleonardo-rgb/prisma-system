"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { revalidatePath } from "next/cache"

export async function createAgencyAction(userId: string, settings: { name: string, tokko_api_key?: string }) {
  const admin = createAdminClient()

  const { data: agency, error: createError } = await admin
    .from("agencies")
    .insert([{
      name: settings.name,
      tokko_api_key: settings.tokko_api_key,
      owner_id: userId
    }])
    .select()
    .single()

  if (createError) throw new Error("Error al crear la agencia: " + createError.message)

  const { error: updateError } = await admin
    .from("profiles")
    .update({ agency_id: agency.id })
    .eq("id", userId)

  if (updateError) throw new Error("Error al vincular agencia al perfil: " + updateError.message)

  revalidatePath("/director/configuracion")
  revalidatePath("/director/dashboard")
  
  return agency
}

export async function updateAgencyAction(agencyId: string, settings: { name: string, tokko_api_key?: string, logo_url?: string }) {
  const admin = createAdminClient()

  const { error } = await admin
    .from("agencies")
    .update(settings)
    .eq("id", agencyId)

  if (error) throw new Error("Error al actualizar la agencia: " + error.message)

  revalidatePath("/director/configuracion")
  
  return { success: true }
}
