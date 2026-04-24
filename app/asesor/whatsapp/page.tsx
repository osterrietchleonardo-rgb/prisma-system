import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import dynamic from "next/dynamic"
import type { Metadata } from "next"
import { SetupWizard } from "@/components/whatsapp/SetupWizard"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import TemplatesTab from "@/components/whatsapp/TemplatesTab"
import ContactsTab from "@/components/whatsapp/ContactsTab"
import { ConnectionIndicator } from "@/components/whatsapp/ConnectionIndicator"
import type { WhatsAppInstance } from "@/types/whatsapp"

const ChatInterface = dynamic(
  () => import("@/components/whatsapp/ChatInterface").then((m) => m.default),
  {
    loading: () => (
      <div className="flex-1 flex items-center justify-center p-12">
        <div className="flex flex-col items-center gap-4 animate-pulse">
          <div className="w-16 h-16 rounded-full bg-accent/20" />
          <p className="text-muted-foreground text-sm">Cargando bandeja...</p>
        </div>
      </div>
    ),
  }
)

export const metadata: Metadata = {
  title: "Bandeja WhatsApp | PRISMA",
  description: "Gestiona tus conversaciones de WhatsApp en tiempo real.",
}

export default async function WhatsAppInboxPage() {
  const supabase = createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect("/auth/login")
  }

  // Obtener perfil — funciona para asesor y director
  const { data: profile } = await supabase
    .from("profiles")
    .select("agency_id, role")
    .eq("id", user.id)
    .single()

  if (!profile?.agency_id) {
    redirect("/asesor/dashboard")
  }

  // Buscar instancia de WhatsApp activa de la agencia
  const { data: instance } = await supabase
    .from("whatsapp_instances")
    .select("*")
    .eq("agency_id", profile.agency_id)
    .limit(1)
    .maybeSingle()

  // Si no hay instancia, solo el director puede configurarla
  if (!instance) {
    if (profile.role !== "director") {
      return (
        <div className="flex-1 flex items-center justify-center p-12">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto text-3xl">
              💬
            </div>
            <h2 className="text-xl font-bold">WhatsApp no configurado</h2>
            <p className="text-muted-foreground text-sm max-w-xs mx-auto">
              Tu director de agencia aún no ha conectado WhatsApp Business. Pedile que lo configure desde su panel.
            </p>
          </div>
        </div>
      )
    }

    return (
      <div className="flex-1 overflow-y-auto">
        <SetupWizard />
      </div>
    )
  }

  // Si hay instancia, mostrar el inbox completo con tabs
  return (
    <div className="flex-1 flex flex-col min-h-0 h-full">
      <Tabs defaultValue="chat" className="flex-1 flex flex-col h-full min-h-0 bg-background">
        <div className="border-b px-4 md:px-6 py-2 bg-background flex items-center justify-between flex-shrink-0">
          <TabsList className="bg-muted h-9">
            <TabsTrigger value="chat" className="text-xs px-4">
              💬 Bandeja
            </TabsTrigger>
            <TabsTrigger value="plantillas" className="text-xs px-4">
              📋 Plantillas
            </TabsTrigger>
            <TabsTrigger value="contactos" className="text-xs px-4">
              👥 Contactos
            </TabsTrigger>
          </TabsList>
          <ConnectionIndicator instanceId={instance.id} initialStatus={instance.status} />
        </div>

        <TabsContent
          value="chat"
          className="flex-1 min-h-0 m-0 border-none p-0 outline-none data-[state=inactive]:hidden flex flex-col"
        >
          <ChatInterface instance={instance as WhatsAppInstance} />
        </TabsContent>

        <TabsContent
          value="plantillas"
          className="flex-1 overflow-y-auto p-4 md:p-6 outline-none data-[state=inactive]:hidden"
        >
          <TemplatesTab instance={instance as WhatsAppInstance} />
        </TabsContent>

        <TabsContent
          value="contactos"
          className="flex-1 overflow-y-auto p-4 md:p-6 outline-none data-[state=inactive]:hidden"
        >
          <ContactsTab instance={instance as WhatsAppInstance} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
