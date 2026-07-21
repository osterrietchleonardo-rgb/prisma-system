"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { revalidatePath } from "next/cache"

export async function submitFeedback(formData: FormData) {
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

  const type = formData.get("type") as string
  const content = formData.get("content") as string
  const evidenceFiles = formData.getAll("evidenceFiles") as File[]

  if (!type || !content) {
    return { error: "Tipo y contenido son requeridos" }
  }

  // Upload evidence images to Storage
  const evidenceUrls: string[] = []
  if (evidenceFiles && evidenceFiles.length > 0) {
    for (const file of evidenceFiles.slice(0, 2)) {
      if (!file || typeof file === "string" || file.size === 0) continue
      const ext = file.name ? file.name.split(".").pop() || "jpg" : "jpg"
      const path = `${session.user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const buffer = Buffer.from(await file.arrayBuffer())
      const { error: uploadError } = await adminClient.storage
        .from("feedback-evidence")
        .upload(path, buffer, { contentType: file.type || "image/jpeg", upsert: false })
      if (!uploadError) {
        const { data: urlData } = adminClient.storage
          .from("feedback-evidence")
          .getPublicUrl(path)
        evidenceUrls.push(urlData.publicUrl)
      } else {
        console.error("Error uploading evidence image:", uploadError)
      }
    }
  }

  const { error } = await supabase.from("system_feedback").insert({
    user_id: session.user.id,
    email: profile.email,
    role: profile.role,
    agency_id: profile.agency_id ?? null,
    type,
    content,
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
