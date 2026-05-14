"use client"

import { useState, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CampaignState } from "./CampaignState"
import { ConnectionIndicator } from "./ConnectionIndicator"
import dynamic from "next/dynamic"

const LoadingSpinner = () => (
  <div className="h-full flex items-center justify-center">
    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
)

const ChatInterface = dynamic(
  () => import("./ChatInterface").then((m) => m.default),
  {
    ssr: false,
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

const CampaignsTab = dynamic(
  () => import("./CampaignsTab").then((m) => m.default),
  { ssr: false, loading: () => <LoadingSpinner /> }
)

const TemplatesTab = dynamic(() => import("./TemplatesTab"), { ssr: false, loading: () => <LoadingSpinner /> })
const AiSettingsTab = dynamic(() => import("./AiSettingsTab"), { ssr: false, loading: () => <LoadingSpinner /> })

const ContactsTab = dynamic(
  () => import("./ContactsTab").then((m) => m.default),
  { ssr: false, loading: () => <LoadingSpinner /> }
)

interface WhatsAppTabsWrapperProps {
  instance: any;
}

export function WhatsAppTabsWrapper({ instance }: WhatsAppTabsWrapperProps) {
  const [activeTab, setActiveTab] = useState("chat")
  
  // Lazy mount guards: only logic, NO CSS CHANGES
  const [hasMountedChat, setHasMountedChat] = useState(true)
  const [hasMountedPlantillas, setHasMountedPlantillas] = useState(false)
  const [hasMountedContactos, setHasMountedContactos] = useState(false)
  const [hasMountedCampanas, setHasMountedCampanas] = useState(false)
  const [hasMountedConfig, setHasMountedConfig] = useState(false)

  useEffect(() => {
    const unsubscribe = CampaignState.subscribeToTab((tab) => {
      setActiveTab(tab)
      if (tab === "chat") setHasMountedChat(true)
      if (tab === "plantillas") setHasMountedPlantillas(true)
      if (tab === "contactos") setHasMountedContactos(true)
      if (tab === "campanas") setHasMountedCampanas(true)
      if (tab === "config") setHasMountedConfig(true)
    })
    return unsubscribe
  }, [])

  const handleTabChange = (value: string) => {
    setActiveTab(value)
    CampaignState.setActiveTab(value)
    if (value === "chat") setHasMountedChat(true)
    if (value === "plantillas") setHasMountedPlantillas(true)
    if (value === "contactos") setHasMountedContactos(true)
    if (value === "campanas") setHasMountedCampanas(true)
    if (value === "config") setHasMountedConfig(true)
  }

  return (
    <Tabs 
      value={activeTab} 
      onValueChange={handleTabChange}
      className="flex-1 flex flex-col h-full min-h-0 bg-background"
    >
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
        <div style={{color:'white', padding:'20px', backgroundColor: 'black', height: '100%'}}>CHAT CARGADO OK</div>
      </TabsContent>

      <TabsContent value="plantillas" className="flex-1 overflow-y-auto p-4 md:p-6 outline-none data-[state=inactive]:hidden">
        {hasMountedPlantillas && <TemplatesTab instance={instance} />}
      </TabsContent>

      <TabsContent value="config" className="flex-1 overflow-y-auto p-4 md:p-6 outline-none data-[state=inactive]:hidden">
        {hasMountedConfig && <AiSettingsTab instance={instance} />}
      </TabsContent>

      <TabsContent value="contactos" className="flex-1 overflow-y-auto p-4 md:p-6 outline-none data-[state=inactive]:hidden">
        {hasMountedContactos && <ContactsTab instance={instance} />}
      </TabsContent>

      <TabsContent value="campanas" className="flex-1 overflow-y-auto p-4 md:p-6 outline-none data-[state=inactive]:hidden">
        {hasMountedCampanas ? (
          <CampaignsTab instance={instance} />
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Seleccioná contactos desde la pestaña Contactos para iniciar.</p>
          </div>
        )}
      </TabsContent>
    </Tabs>
  )
}
