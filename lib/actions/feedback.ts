"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function submitFeedback(formData: {
  type: string
  content: string
}) {
  const supabase = createClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return { error: "No autorizado" }
  }

  // Fetch profile to get role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, email")
    .eq("id", session.user.id)
    .single()

  if (!profile) {
    return { error: "Perfil no encontrado" }
  }

  const { error } = await supabase.from("system_feedback").insert({
    user_id: session.user.id,
    email: profile.email,
    role: profile.role,
    type: formData.type,
    content: formData.content,
    status: "new",
  })

  if (error) {
    console.error("Error submitting feedback:", error)
    return { error: "Error al enviar la sugerencia" }
  }

  revalidatePath("/director/feedback")
  revalidatePath("/asesor/feedback")
  
  return { success: true }
}
