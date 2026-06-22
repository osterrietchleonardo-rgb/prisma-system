import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { ContratosIAPage } from "@/components/contratos-ia/ContratosIAPage"
import { contratosIaDeshabilitado } from "@/lib/access/contratos-ia"

export default async function DirectorContratosIA() {
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (session) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("agency_id")
      .eq("id", session.user.id)
      .single()

    // Agencia sin acceso a Contratos IA → fuera del módulo
    if (contratosIaDeshabilitado(profile?.agency_id)) {
      redirect("/director/dashboard")
    }
  }

  return <ContratosIAPage role="director" />
}
