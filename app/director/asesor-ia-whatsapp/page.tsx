import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import type { Metadata } from "next"
import dynamic from "next/dynamic"
import { SetupWizard } from "@/components/whatsapp/SetupWizard"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import TemplatesTab from "@/components/whatsapp/TemplatesTab"
import AiSettingsTab from "@/components/whatsapp/AiSettingsTab"
import CampaignsTab from "@/components/whatsapp/CampaignsTab"
import ContactsTab from "@/components/whatsapp/ContactsTab"
import { ConnectionIndicator } from "@/components/whatsapp/ConnectionIndicator"

const ChatInterface = dynamic(
  () => import("@/components/whatsapp/ChatInterface").then((m) => m.default),
  {
    loading: () => (
      <div className="flex-1 flex items-center justify-center p-12">
        <div className="flex flex-col items-center gap-4 animate-pulse">
          <div className="w-16 h-16 rounded-full bg-accent/20" />
          <p className="text-muted-foreground text-sm">Cargando chat...</p>
        </div>
      </div>
    ),
  }
)

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
        <Tabs defaultValue="chat" className="flex-1 flex flex-col h-full min-h-0 bg-background">
          <div className="border-b px-4 md:px-6 py-2 bg-background flex items-center justify-between">
            <TabsList className="bg-muted h-9">
              <TabsTrigger value="chat" className="text-xs px-4">💬 Chat</TabsTrigger>
              <TabsTrigger value="plantillas" className="text-xs px-4">📋 Plantillas</TabsTrigger>
              <TabsTrigger value="contactos" className="text-xs px-4">👥 Contactos</TabsTrigger>
              <TabsTrigger value="campanas" className="text-xs px-4">📣 Campañas</TabsTrigger>
              <TabsTrigger value="config" className="text-xs px-4">⚙️ Configuración IA</TabsTrigger>
            </TabsList>
            <ConnectionIndicator instanceId={instance.id} initialStatus={instance.status} />
          </div>
          <TabsContent value="chat" className="flex-1 min-h-0 m-0 border-none p-0 outline-none data-[state=inactive]:hidden flex flex-col">
            <ChatInterface instance={instance} />
          </TabsContent>
          <TabsContent value="plantillas" className="flex-1 overflow-y-auto p-4 md:p-6 outline-none data-[state=inactive]:hidden">
            <TemplatesTab instance={instance} />
          </TabsContent>
          <TabsContent value="config" className="flex-1 overflow-y-auto p-4 md:p-6 outline-none data-[state=inactive]:hidden">
            <AiSettingsTab instance={instance} />
          </TabsContent>
          <TabsContent value="contactos" className="flex-1 overflow-y-auto p-4 md:p-6 outline-none data-[state=inactive]:hidden">
            <ContactsTab instance={instance} />
          </TabsContent>
          <TabsContent value="campanas" className="flex-1 overflow-y-auto p-4 md:p-6 outline-none data-[state=inactive]:hidden">
            <CampaignsTab instance={instance} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
