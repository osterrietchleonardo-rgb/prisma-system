import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

/**
 * Quién está mirando y la instancia de WhatsApp de su agencia.
 *
 * Es el arranque que tenían las páginas de WhatsApp (director y asesor) antes de
 * que sus solapas fueran páginas propias: ahora lo comparten la bandeja y las
 * páginas de Difusión, con las mismas salidas de cada rol.
 *
 * - Sin sesión → login.
 * - Director: si el perfil no es de director, afuera.
 * - Asesor: si no tiene agencia, a su dashboard.
 */
export async function instanciaWhatsAppDelUsuario(rol: "director" | "asesor") {
  const supabase = createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect("/auth/login")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("agency_id, role")
    .eq("id", user.id)
    .single()

  if (rol === "director" && (!profile || profile.role !== "director")) {
    redirect("/")
  }
  if (!profile?.agency_id) {
    redirect(rol === "director" ? "/" : "/asesor/dashboard")
  }

  const { data: instance } = await supabase
    .from("whatsapp_instances")
    .select("*")
    .eq("agency_id", profile.agency_id)
    .limit(1)
    .maybeSingle()

  return { instance, profile }
}
