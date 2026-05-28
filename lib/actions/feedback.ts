"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { revalidatePath } from "next/cache"

export async function submitFeedback(formData: {
  type: string
  content: string
  evidenceFiles?: File[]
}) {
  const supabase = createClient()
  const adminClient = createAdminClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return { error: "No autorizado" }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, email, agency_id")
    .eq("id", session.user.id)
    .single()

  if (!profile) {
    return { error: "Perfil no encontrado" }
  }

  // Upload evidence images to Storage
  const evidenceUrls: string[] = []
  if (formData.evidenceFiles && formData.evidenceFiles.length > 0) {
    for (const file of formData.evidenceFiles.slice(0, 2)) {
      const ext = file.name.split(".").pop() || "jpg"
      const path = `${session.user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const buffer = Buffer.from(await file.arrayBuffer())
      const { error: uploadError } = await adminClient.storage
        .from("feedback-evidence")
        .upload(path, buffer, { contentType: file.type, upsert: false })
      if (!uploadError) {
        const { data: urlData } = adminClient.storage
          .from("feedback-evidence")
          .getPublicUrl(path)
        evidenceUrls.push(urlData.publicUrl)
      }
    }
  }

  const { error } = await supabase.from("system_feedback").insert({
    user_id: session.user.id,
    email: profile.email,
    role: profile.role,
    agency_id: profile.agency_id ?? null,
    type: formData.type,
    content: formData.content,
    status: "new",
    estado: "pendiente",
    evidence_urls: evidenceUrls,
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
  estado?: string
  respuesta?: string | null
  evidence_urls?: string[] | null
  created_at: string
}[]> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return []

  const { data } = await supabase
    .from("system_feedback")
    .select("id, type, content, status, estado, respuesta, evidence_urls, created_at")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false })
    .limit(20)

  return data ?? []
}
