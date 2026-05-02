"use client"

import { useState, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CampaignState } from "./CampaignState"
import { ConnectionIndicator } from "./ConnectionIndicator"
import dynamic from "next/dynamic"
import TemplatesTab from "./TemplatesTab"
import AiSettingsTab from "./AiSettingsTab"
import CampaignsTab from "./CampaignsTab"
import ContactsTab from "./ContactsTab"

const ChatInterface = dynamic(
  () => import("./ChatInterface").then((m) => m.default),
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

interface WhatsAppTabsWrapperProps {
  instance: any;
}

export function WhatsAppTabsWrapper({ instance }: WhatsAppTabsWrapperProps) {
  const [activeTab, setActiveTab] = useState("chat")

  useEffect(() => {
    // Sync with CampaignState
    const unsubscribe = CampaignState.subscribeToTab((tab) => {
      setActiveTab(tab)
    })
    return unsubscribe
  }, [])

  const handleTabChange = (value: string) => {
    setActiveTab(value)
    CampaignState.setActiveTab(value)
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
  )
}
