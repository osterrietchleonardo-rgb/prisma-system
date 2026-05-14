import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import type { Metadata } from "next"
import { SetupWizard } from "@/components/whatsapp/SetupWizard"
import { WhatsAppTabsWrapper } from "@/components/whatsapp/WhatsAppTabsWrapper"

export const metadata: Metadata = {
  title: "Asesor IA en WhatsApp | PRISMA",
}

import { WhatsAppErrorBoundary } from "@/components/whatsapp/WhatsAppErrorBoundary"

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
    <div id="whatsapp-ia-page" className="flex-1 flex flex-col min-h-0 whatsapp-page-container bg-background">
      {/* Banner de Diagnóstico (Solo visible durante debug) */}
      <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-4 py-1 flex items-center justify-between">
        <span className="text-[10px] font-mono text-yellow-600">
          DEBUG: ID={instance?.id?.substring(0,8) || "NULL"} | AG={instance?.agency_id?.substring(0,8) || "NULL"} | ST={instance?.status || "UNK"}
        </span>
        <span className="text-[10px] font-mono text-green-600 animate-pulse">● LIVE</span>
      </div>

      {!instance ? (
        <SetupWizard />
      ) : (
        <WhatsAppErrorBoundary>
          <WhatsAppTabsWrapper instance={instance} />
        </WhatsAppErrorBoundary>
      )}
    </div>
  )
}
