import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import type { Metadata } from "next"
import { SetupWizard } from "@/components/whatsapp/SetupWizard"
import { WhatsAppTabsWrapper } from "@/components/whatsapp/WhatsAppTabsWrapper"

export const metadata: Metadata = {
  title: "Asesor IA en WhatsApp | PRISMA",
}

export default async function AsesorIAWhatsAppPage() {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("agency_id, role")
    .eq("id", user.id)
    .single()

  if (!profile || profile.role !== "director") {
    redirect("/")
  }

  // Check if agency has a WhatsApp instance configured
  const { data: instance } = await supabase
    .from("whatsapp_instances")
    .select("*")
    .eq("agency_id", profile.agency_id)
    .limit(1)
    .maybeSingle()

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {!instance ? (
        <SetupWizard />
      ) : (
        <WhatsAppTabsWrapper instance={instance} />
      )}
    </div>
  )
}
