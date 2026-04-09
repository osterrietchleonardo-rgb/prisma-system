import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { IpcManager } from "@/components/marketing-ia/ipc-manager"
import { CopyGeneratorFlow } from "@/components/marketing-ia/copy-generator-flow"
import { Bot, UserSearch, History, Sparkles } from "lucide-react"

export default function MarketingIAPage() {
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

      <Tabs defaultValue="copys" className="w-full">
        <TabsList className="flex md:grid md:grid-cols-3 h-14 bg-muted/50 p-1 rounded-xl overflow-x-auto scrollbar-none justify-start md:justify-center w-full">
          <TabsTrigger value="copys" className="flex-1 md:flex-none text-xs sm:text-md font-bold data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg whitespace-nowrap">
            <Sparkles className="w-4 h-4 mr-2" /> Crear Anuncio
          </TabsTrigger>
          <TabsTrigger value="ipcs" className="flex-1 md:flex-none text-xs sm:text-md font-bold data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg whitespace-nowrap">
            <UserSearch className="w-4 h-4 mr-2" /> Clientes Ideales (IPC)
          </TabsTrigger>
          <TabsTrigger value="history" className="flex-1 md:flex-none text-xs sm:text-md font-bold data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg whitespace-nowrap">
            <History className="w-4 h-4 mr-2" /> Historial / Galería
          </TabsTrigger>
        </TabsList>

        <TabsContent value="copys" className="mt-8">
           <CopyGeneratorFlow />
        </TabsContent>

        <TabsContent value="ipcs" className="mt-8">
           <IpcManager />
        </TabsContent>

        <TabsContent value="history" className="mt-8">
          <div className="flex flex-col items-center justify-center p-20 text-center bg-muted/20 rounded-3xl border border-dashed border-muted">
             <History className="w-12 h-12 text-muted-foreground mb-4 opacity-20" />
             <h3 className="text-xl font-bold">Próximamente: Historial y Galería</h3>
             <p className="text-muted-foreground max-w-sm mt-2">Estamos construyendo la vista para que puedas ver todos tus anuncios y perfiles generados.</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
