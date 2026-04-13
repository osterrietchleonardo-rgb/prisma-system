import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { IpcManager } from "@/components/marketing-ia/ipc-manager"
import { CopyGeneratorFlow } from "@/components/marketing-ia/copy-generator-flow"
import { MarketingHistory } from "@/components/marketing-ia/marketing-history"
import { Bot, UserSearch, History, Sparkles } from "lucide-react"

export default function MarketingIAPage() {
  return (
    <div className="container mx-auto py-8 space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-black tracking-tight flex items-center gap-3 text-emerald-600">
          <Bot className="w-10 h-10" />
          Marketing IA <span className="text-muted-foreground/50">Asesor</span>
        </h1>
        <p className="text-muted-foreground text-lg max-w-2xl">
          Potencia tu marca personal. Genera copies de impacto y piezas visuales pro vinculadas a tus propiedades en Tokko.
        </p>
      </div>

      <Tabs defaultValue="copys" className="w-full">
        <TabsList className="grid w-full grid-cols-3 h-14 bg-muted/50 p-1 rounded-xl">
          <TabsTrigger value="copys" className="text-md font-bold data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg">
            <Sparkles className="w-4 h-4 mr-2" /> Crear Anuncio
          </TabsTrigger>
          <TabsTrigger value="ipcs" className="text-md font-bold data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg">
            <UserSearch className="w-4 h-4 mr-2" /> Clientes Ideales (IPC)
          </TabsTrigger>
          <TabsTrigger value="history" className="text-md font-bold data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg">
            <History className="w-4 h-4 mr-2" /> Mis Generaciones
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
      </Tabs>
    </div>
  )
}
