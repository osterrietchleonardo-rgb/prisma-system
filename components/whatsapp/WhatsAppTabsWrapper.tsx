"use client"

import { useState, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CampaignState } from "./CampaignState"
import { ConnectionIndicator } from "./ConnectionIndicator"
// import ChatInterface from "./ChatInterface"
// import CampaignsTab from "./CampaignsTab"
// import ContactsTab from "./ContactsTab"
// import TemplatesTab from "./TemplatesTab"
// import AiSettingsTab from "./AiSettingsTab"

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
    <div className="flex-1 flex flex-col bg-background min-h-[500px] p-10">
      <div className="bg-purple-600 p-4 text-white text-sm font-bold text-center rounded-lg shadow-lg">
        ¡VIOLETA OK! EL COMPONENTE SE MONTÓ.<br/>
        ID: {instance?.id}
      </div>
      <p className="text-center text-muted-foreground mt-4">
        Si ves esto, React está funcionando. El problema es una de las pestañas.
      </p>
    </div>
  )
}
