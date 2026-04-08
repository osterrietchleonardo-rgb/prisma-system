"use client"

import { useState, useCallback, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FileSignature, FilePlus, FileText, Layout, Download, Loader2 } from "lucide-react"
import { TipoContratoSelector } from "./TipoContratoSelector"
import { ContratoWizard } from "./ContratoWizard"
import { PlantillasList } from "./PlantillasList"
import type { TipoContrato, ContractTemplate, ContratoWizardState, FirmanteRol, ContractSignature } from "@/types/contratos"
import { interpolateTemplate } from "@/lib/contratos/template-interpolator"
import { generateContratoPDF, generatePDFFilename } from "@/lib/contratos/pdf-generator"
import { TIPO_CONTRATO_LABELS } from "@/types/contratos"
import { toast } from "sonner"

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
  const [contratos, setContratos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const loadContratos = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/contratos")
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) {
          setContratos(data)
        }
      }
    } catch (error) {
      console.error("Error loading contracts:", error)
      toast.error("Error al cargar la lista de contratos")
    } finally {
      setLoading(false)
      setLoaded(true)
    }
  }, [])

  const handleDownload = async (c: any) => {
    setDownloadingId(c.id)
    try {
      const { downloadContractFromId } = await import("@/lib/contratos/download-helper")
      await downloadContractFromId(c.id)
    } finally {
      setDownloadingId(null)
    }
  }

  useEffect(() => {
    if (!loaded) {
      loadContratos()
    }
  }, [loaded, loadContratos])

  const estadoColors: Record<string, string> = {
    borrador: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    pendiente_firma: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    firmado: "bg-green-500/10 text-green-500 border-green-500/20",
    anulado: "bg-red-500/10 text-red-500 border-red-500/20",
  }

  if (loading || !loaded) {
    return (
      <div className="grid gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-24 rounded-2xl bg-muted/50 animate-pulse border border-border" />
        ))}
      </div>
    )
  }

  if (contratos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center bg-muted/20 rounded-3xl border border-dashed border-muted">
        <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mb-6">
          <FileText className="w-10 h-10 text-muted-foreground opacity-30" />
        </div>
        <h3 className="text-2xl font-bold tracking-tight">Sin contratos generados</h3>
        <p className="text-muted-foreground max-w-sm mt-3 leading-relaxed">
          Todavía no generaste ningún contrato con IA.
          ¡Empezá ahora desde la pestaña &quot;Nuevo Contrato&quot;!
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      {contratos.map(c => {
        const date = c.created_at ? new Date(c.created_at) : new Date()
        const isValidDate = !isNaN(date.getTime())
        const displayDate = isValidDate ? date.toLocaleDateString("es-AR") : "---"

        return (
          <div key={c.id} className="group relative flex items-center justify-between p-6 rounded-2xl bg-card border border-border hover:border-accent/40 hover:shadow-xl hover:shadow-accent/5 transition-all duration-300">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                <FileText className="w-6 h-6 text-accent" />
              </div>
              <div className="flex flex-col gap-1">
                <p className="font-bold text-lg group-hover:text-accent transition-colors">
                  {c.nombre_referencia || `Contrato ${c.tipo}`}
                </p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Creado:</span>
                  <span className="font-medium text-foreground/80">{displayDate}</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <span className={`text-[10px] sm:text-xs font-black px-4 py-1.5 rounded-full border shadow-sm ${estadoColors[c.estado] || "bg-muted text-muted-foreground border-muted-foreground/20"}`}>
                {(c.estado || "borrador").replace("_", " ").toUpperCase()}
              </span>

              <button
                onClick={() => handleDownload(c)}
                disabled={downloadingId === c.id}
                className="p-2.5 rounded-xl bg-muted/50 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all duration-300 disabled:opacity-50 group/download"
                title="Descargar PDF"
              >
                {downloadingId === c.id ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Download className="w-5 h-5 group-hover/download:scale-110 transition-transform" />
                )}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
