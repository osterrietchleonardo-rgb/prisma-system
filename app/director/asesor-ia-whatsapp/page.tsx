import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import type { Metadata } from "next"
import { SetupWizard } from "@/components/whatsapp/SetupWizard"
import { WhatsAppTabsWrapper } from "@/components/whatsapp/WhatsAppTabsWrapper"

export const metadata: Metadata = {
  title: "Asesor IA en WhatsApp | PRISMA",
}

import { SimpleErrorCatcher } from "@/components/whatsapp/SimpleErrorCatcher"

export default async function AsesorIAWhatsAppPage() {
  try {
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
      <SimpleErrorCatcher>
        <div id="whatsapp-ia-page" className="flex-1 flex flex-col min-h-0 bg-background overflow-hidden">
          {!instance ? (
            <SetupWizard />
          ) : (
            <WhatsAppTabsWrapper instance={instance} />
          )}
        </div>
      </SimpleErrorCatcher>
    )
  } catch (error: any) {
    return (
      <div style={{ padding: '20px', color: 'red' }}>
        <h1>Error en Servidor:</h1>
        <pre>{error.message}</pre>
      </div>
    )
  }
}
