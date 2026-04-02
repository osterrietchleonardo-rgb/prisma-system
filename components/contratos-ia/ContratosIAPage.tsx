"use client"

import { useState, useCallback } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FileSignature, FilePlus, FileText, Layout } from "lucide-react"
import { TipoContratoSelector } from "./TipoContratoSelector"
import { ContratoWizard } from "./ContratoWizard"
import { PlantillasList } from "./PlantillasList"
import type { TipoContrato, ContractTemplate, ContratoWizardState } from "@/types/contratos"

export function ContratosIAPage() {
  const [activeTab, setActiveTab] = useState("nuevo")
  const [wizardState, setWizardState] = useState<ContratoWizardState>({
    tipo: null,
    template: null,
    paso_actual: 0,
    pasos_total: 0,
    form_data: {},
    firmas: {},
    pdf_preview_url: null,
    contrato_guardado_id: null,
  })

  const handleSelectTipo = useCallback((tipo: TipoContrato, template: ContractTemplate) => {
    setWizardState({
      tipo,
      template,
      paso_actual: 0,
      pasos_total: 0,
      form_data: {},
      firmas: {},
      pdf_preview_url: null,
      contrato_guardado_id: null,
    })
  }, [])

  const handleBackToSelector = useCallback(() => {
    setWizardState(prev => ({ ...prev, tipo: null, template: null, paso_actual: 0 }))
  }, [])

  return (
    <div className="container mx-auto py-8 space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-black tracking-tight flex items-center gap-3">
          <FileSignature className="w-10 h-10 text-accent" />
          Contratos <span className="text-accent">IA</span>
        </h1>
        <p className="text-muted-foreground text-lg max-w-2xl">
          Genera contratos inmobiliarios profesionales, gestiona plantillas y firma digitalmente tus documentos.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 h-14 bg-muted/50 p-1 rounded-xl">
          <TabsTrigger value="nuevo" className="text-md font-bold data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg">
            <FilePlus className="w-4 h-4 mr-2" /> Nuevo Contrato
          </TabsTrigger>
          <TabsTrigger value="contratos" className="text-md font-bold data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg">
            <FileText className="w-4 h-4 mr-2" /> Mis Contratos
          </TabsTrigger>
          <TabsTrigger value="plantillas" className="text-md font-bold data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg">
            <Layout className="w-4 h-4 mr-2" /> Mis Plantillas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="nuevo" className="mt-8">
          {!wizardState.tipo ? (
            <TipoContratoSelector onSelect={handleSelectTipo} />
          ) : (
            <ContratoWizard
              wizardState={wizardState}
              setWizardState={setWizardState}
              onBack={handleBackToSelector}
            />
          )}
        </TabsContent>

        <TabsContent value="contratos" className="mt-8">
          <MisContratos />
        </TabsContent>

        <TabsContent value="plantillas" className="mt-8">
          <PlantillasList />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function MisContratos() {
  const [contratos, setContratos] = useState<Array<{ id: string; tipo: string; nombre_referencia: string | null; estado: string; created_at: string }>>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const loadContratos = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/contratos")
      if (res.ok) {
        const data = await res.json()
        setContratos(data)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
      setLoaded(true)
    }
  }, [])

  if (!loaded) {
    loadContratos()
  }

  const estadoColors: Record<string, string> = {
    borrador: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    pendiente_firma: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    firmado: "bg-green-500/10 text-green-500 border-green-500/20",
    anulado: "bg-red-500/10 text-red-500 border-red-500/20",
  }

  if (loading) {
    return (
      <div className="grid gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-20 rounded-xl bg-muted/50 animate-pulse" />
        ))}
      </div>
    )
  }

  if (contratos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center bg-muted/20 rounded-3xl border border-dashed border-muted">
        <FileText className="w-12 h-12 text-muted-foreground mb-4 opacity-20" />
        <h3 className="text-xl font-bold">Sin contratos generados</h3>
        <p className="text-muted-foreground max-w-sm mt-2">
          Creá tu primer contrato desde la pestaña &quot;Nuevo Contrato&quot;.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {contratos.map(c => (
        <div key={c.id} className="flex items-center justify-between p-4 rounded-xl bg-card border border-border hover:border-accent/30 transition-colors">
          <div>
            <p className="font-semibold">{c.nombre_referencia || `Contrato ${c.tipo}`}</p>
            <p className="text-sm text-muted-foreground">{new Date(c.created_at).toLocaleDateString("es-AR")}</p>
          </div>
          <span className={`text-xs font-bold px-3 py-1 rounded-full border ${estadoColors[c.estado] || ""}`}>
            {c.estado.replace("_", " ").toUpperCase()}
          </span>
        </div>
      ))}
    </div>
  )
}
