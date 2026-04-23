"use client"

import { useState, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { IpcManager } from "@/components/marketing-ia/ipc-manager"
import { CopyGeneratorFlow } from "@/components/marketing-ia/copy-generator-flow"
import { MarketingHistory } from "@/components/marketing-ia/marketing-history"
import { AdGuide } from "@/components/marketing-ia/ad-guide"
import { Bot, UserSearch, History, Sparkles, BookOpen } from "lucide-react"

export default function MarketingIAPage() {
  const [activeTab, setActiveTab] = useState("copys")

  useEffect(() => {
    const handleGenComplete = (e: any) => {
      if (e.detail?.origin === 'copy-flow') {
        setActiveTab("history")
      }
    }
    window.addEventListener('generation-complete', handleGenComplete)
    return () => window.removeEventListener('generation-complete', handleGenComplete)
  }, [])

  return (
    <div className="w-full px-4 md:px-8 py-8 space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <Bot className="w-8 h-8 text-accent" />
          Marketing IA Pro
        </h2>
        <p className="text-muted-foreground text-lg max-w-2xl">
          Cree perfiles de cliente ideal, genere copies estratégicos y diseñe anuncios de alto impacto en segundos.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex md:grid md:grid-cols-4 h-14 bg-muted/50 p-1 rounded-xl overflow-x-auto scrollbar-none justify-start md:justify-center w-full">
          <TabsTrigger value="copys" className="flex-1 md:flex-none text-xs sm:text-md font-bold data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg whitespace-nowrap">
            <Sparkles className="w-4 h-4 mr-2" /> Crear Anuncio
          </TabsTrigger>
          <TabsTrigger value="ipcs" className="flex-1 md:flex-none text-xs sm:text-md font-bold data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg whitespace-nowrap">
            <UserSearch className="w-4 h-4 mr-2" /> Clientes Ideales (IPC)
          </TabsTrigger>
          <TabsTrigger value="history" className="flex-1 md:flex-none text-xs sm:text-md font-bold data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg whitespace-nowrap">
            <History className="w-4 h-4 mr-2" /> Historial / Galería
          </TabsTrigger>
          <TabsTrigger value="guia" className="flex-1 md:flex-none text-xs sm:text-md font-bold data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg whitespace-nowrap">
            <BookOpen className="w-4 h-4 mr-2" /> Guía Mágica
          </TabsTrigger>
        </TabsList>

        <TabsContent value="copys" className="mt-8">
           <CopyGeneratorFlow />
        </TabsContent>

        <TabsContent value="ipcs" className="mt-8">
           <IpcManager />
        </TabsContent>

        <TabsContent value="history" className="mt-8">
           <MarketingHistory />
        </TabsContent>

        <TabsContent value="guia" className="mt-8">
           <AdGuide />
        </TabsContent>
      </Tabs>
    </div>
  )
}
