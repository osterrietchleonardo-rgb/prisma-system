"use client"

import { useState, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CampaignState } from "./CampaignState"
import { ConnectionIndicator } from "./ConnectionIndicator"
import ChatInterface from "./ChatInterface"
import CampaignsTab from "./CampaignsTab"
import ContactsTab from "./ContactsTab"
import TemplatesTab from "./TemplatesTab"
import AiSettingsTab from "./AiSettingsTab"

interface WhatsAppTabsWrapperProps {
  instance: any;
}

export function WhatsAppTabsWrapper({ instance }: WhatsAppTabsWrapperProps) {
  const [activeTab, setActiveTab] = useState("chat")
  const [hasMountedCampanas, setHasMountedCampanas] = useState(false)

  useEffect(() => {
    const unsubscribe = CampaignState.subscribeToTab((tab) => {
      setActiveTab(tab)
      if (tab === "campanas") setHasMountedCampanas(true)
    })
    return unsubscribe
  }, [])

  const handleTabChange = (value: string) => {
    setActiveTab(value)
    CampaignState.setActiveTab(value)
    if (value === "campanas") setHasMountedCampanas(true)
  }

  return (
    <div className="flex-1 flex flex-col bg-background min-h-0">
      <Tabs 
        value={activeTab} 
        onValueChange={handleTabChange}
        className="flex-1 flex flex-col"
      >
        <div className="border-b px-2 md:px-6 py-2 bg-background flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
          <TabsList className="bg-muted h-9 flex-shrink-0">
            <TabsTrigger value="chat" className="text-[10px] md:text-xs px-2 md:px-4">💬 Chat</TabsTrigger>
            <TabsTrigger value="plantillas" className="text-[10px] md:text-xs px-2 md:px-4">📋 <span className="hidden md:inline">Plantillas</span><span className="md:hidden">Plant.</span></TabsTrigger>
            <TabsTrigger value="contactos" className="text-[10px] md:text-xs px-2 md:px-4">👥 <span className="hidden md:inline">Contactos</span><span className="md:hidden">Cont.</span></TabsTrigger>
            <TabsTrigger value="campanas" className="text-[10px] md:text-xs px-2 md:px-4">📣 <span className="hidden md:inline">Campañas</span><span className="md:hidden">Camp.</span></TabsTrigger>
            <TabsTrigger value="config" className="text-[10px] md:text-xs px-2 md:px-4">⚙️ <span className="hidden md:inline">Configuración IA</span><span className="md:hidden">IA</span></TabsTrigger>
          </TabsList>
          <div className="flex-shrink-0">
            <ConnectionIndicator instanceId={instance?.id || ""} initialStatus={instance?.status || "disconnected"} />
          </div>
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
          {hasMountedCampanas ? (
            <CampaignsTab instance={instance} />
          ) : (
            <div className="h-full flex items-center justify-center">
              <p className="text-sm text-muted-foreground">Seleccioná contactos desde la pestaña Contactos para iniciar.</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
