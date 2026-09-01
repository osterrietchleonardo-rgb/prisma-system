"use client"

import { useState, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { IpcManager } from "@/components/marketing-ia/ipc-manager"
import { CopyGeneratorFlow } from "@/components/marketing-ia/copy-generator-flow"
import { MarketingHistory } from "@/components/marketing-ia/marketing-history"
import { AdGuide } from "@/components/marketing-ia/ad-guide"
import { FormaTrabajoForm } from "@/components/marketing-ia/forma-trabajo-form"
import { FotosIA } from "@/components/marketing-ia/fotos-ia"
import { Bot, UserSearch, History, Sparkles, BookOpen, Briefcase, Camera } from "lucide-react"
import { AiCreditBadge } from "@/components/ai-credit-badge"

export default function MarketingIAPage() {
  const [activeTab, setActiveTab] = useState("copys")

  useEffect(() => {
    const handleGenComplete = (e: any) => {
      if (e.detail?.origin === 'copy-flow') {
        setActiveTab("history")
      }
    }
    // Desde la galería del Historial se puede seguir editando una foto:
    // el evento trae la foto y acá solo hay que traer la solapa al frente.
    const handleRetomarFoto = () => setActiveTab("fotos")

    window.addEventListener('generation-complete', handleGenComplete)
    window.addEventListener('retomar-foto-ia', handleRetomarFoto)
    return () => {
      window.removeEventListener('generation-complete', handleGenComplete)
      window.removeEventListener('retomar-foto-ia', handleRetomarFoto)
    }
  }, [])

  return (
    <div id="marketing-ia-page" className="container mx-auto py-8 space-y-8 animate-in fade-in duration-700">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
              <Bot className="w-8 h-8 text-accent" />
              Marketing IA <span className="text-muted-foreground/50 text-xl font-medium">Asesor</span>
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl">
              Potencia tu marca personal. Genera copies de impacto y piezas visuales pro vinculadas a tus propiedades en Tokko.
            </p>
          </div>
          <AiCreditBadge className="w-fit" />
        </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-6 h-14 bg-muted/50 p-1 rounded-xl overflow-x-auto scrollbar-none">
          <TabsTrigger value="copys" className="text-xs sm:text-md font-bold data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg whitespace-nowrap">
            <Sparkles className="w-4 h-4 mr-2" /> Crear Anuncio
          </TabsTrigger>
          <TabsTrigger value="fotos" className="text-xs sm:text-md font-bold data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg whitespace-nowrap">
            <Camera className="w-4 h-4 mr-2" /> Fotos
          </TabsTrigger>
          <TabsTrigger value="ipcs" className="text-xs sm:text-md font-bold data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg whitespace-nowrap">
            <UserSearch className="w-4 h-4 mr-2" /> Clientes Ideales (IPC)
          </TabsTrigger>
          <TabsTrigger value="forma-trabajo" className="text-xs sm:text-md font-bold data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg whitespace-nowrap">
            <Briefcase className="w-4 h-4 mr-2" /> Mi ADN
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs sm:text-md font-bold data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg whitespace-nowrap">
            <History className="w-4 h-4 mr-2" /> Mis Generaciones
          </TabsTrigger>
          <TabsTrigger value="guia" className="text-xs sm:text-md font-bold data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg whitespace-nowrap">
            <BookOpen className="w-4 h-4 mr-2" /> Guía Mágica
          </TabsTrigger>
        </TabsList>

        <TabsContent value="copys" className="mt-8">
           <CopyGeneratorFlow />
        </TabsContent>

        <TabsContent value="fotos" className="mt-8">
           <FotosIA />
        </TabsContent>

        <TabsContent value="ipcs" className="mt-8">
          <IpcManager />
        </TabsContent>

        <TabsContent value="forma-trabajo" className="mt-8">
          <FormaTrabajoForm />
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
