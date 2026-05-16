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

export async function getUserFeedbackHistory(): Promise<{
  id: string
  type: string
  content: string
  status: string
  created_at: string
}[]> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return []

  const { data } = await supabase
    .from("system_feedback")
    .select("id, type, content, status, created_at")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false })
    .limit(20)

  return data ?? []
}

