"use client"

import { useState, useCallback } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FileSignature, FilePlus, FileText, Layout } from "lucide-react"
import { TipoContratoSelector } from "./TipoContratoSelector"
import { ContratoWizard } from "./ContratoWizard"
import { PlantillasList } from "./PlantillasList"
import { ContratosGenerados } from "./ContratosGenerados"
import type { TipoContrato, ContractTemplate, ContratoWizardState, ContratoRow } from "@/types/contratos"
import { toast } from "sonner"
import { AiCreditBadge } from "@/components/ai-credit-badge"

const EMPTY_WIZARD: ContratoWizardState = {
  tipo: null,
  template: null,
  paso_actual: 0,
  pasos_total: 0,
  form_data: {},
  firmas: {},
  pdf_preview_url: null,
  contrato_guardado_id: null,
}

export function ContratosIAPage({ role = "director" }: { role?: "director" | "asesor" }) {
  const isDirector = role === "director"
  const [activeTab, setActiveTab] = useState("nuevo")
  const [wizardState, setWizardState] = useState<ContratoWizardState>(EMPTY_WIZARD)
  const [isEditing, setIsEditing] = useState(false)
  const [motivoEdicion, setMotivoEdicion] = useState("")

  const handleSelectTipo = useCallback((tipo: TipoContrato, template: ContractTemplate) => {
    setIsEditing(false)
    setMotivoEdicion("")
    setWizardState({ ...EMPTY_WIZARD, tipo, template })
  }, [])

  const handleBackToSelector = useCallback(() => {
    setIsEditing(false)
    setMotivoEdicion("")
    setWizardState(EMPTY_WIZARD)
  }, [])

  // Abrir el wizard en modo edición desde la tabla de contratos generados
  const handleEditContrato = useCallback(async (contrato: ContratoRow, motivo: string) => {
    try {
      let template: ContractTemplate | null = null
      if (contrato.template_id) {
        const res = await fetch(`/api/contract-templates/${contrato.template_id}`)
        if (res.ok) template = await res.json()
      }
      if (!template) {
        toast.error("No se encontró la plantilla original del contrato; no se puede editar.")
        return
      }
      setWizardState({
        ...EMPTY_WIZARD,
        tipo: contrato.tipo,
        template,
        form_data: contrato.form_data || {},
        contrato_guardado_id: contrato.id,
      })
      setMotivoEdicion(motivo)
      setIsEditing(true)
      setActiveTab("nuevo")
    } catch {
      toast.error("Error al abrir el contrato para editar")
    }
  }, [])

  // Al terminar (crear o editar) volver a la tabla de contratos
  const handleWizardDone = useCallback(() => {
    setIsEditing(false)
    setMotivoEdicion("")
    setWizardState(EMPTY_WIZARD)
    setActiveTab("contratos")
  }, [])

  return (
    <div className="w-full px-4 md:px-8 py-8 space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <FileSignature className="w-8 h-8 text-accent" />
            Contratos IA
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl">
            Genera contratos inmobiliarios profesionales, gestiona plantillas y descargá tus documentos.
          </p>
        </div>
        <AiCreditBadge className="w-fit" />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className={`grid w-full h-14 bg-muted/50 p-1 rounded-xl ${isDirector ? "grid-cols-3" : "grid-cols-2"}`}>
          <TabsTrigger value="nuevo" className="text-md font-bold data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg">
            <FilePlus className="w-4 h-4 mr-2" /> Nuevo Contrato
          </TabsTrigger>
          <TabsTrigger value="contratos" className="text-md font-bold data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg">
            <FileText className="w-4 h-4 mr-2" /> {isDirector ? "Contratos Generados" : "Mis Contratos"}
          </TabsTrigger>
          {isDirector && (
            <TabsTrigger value="plantillas" className="text-md font-bold data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg">
              <Layout className="w-4 h-4 mr-2" /> Mis Plantillas
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="nuevo" className="mt-8">
          {!wizardState.tipo ? (
            <TipoContratoSelector onSelect={handleSelectTipo} />
          ) : (
            <ContratoWizard
              wizardState={wizardState}
              setWizardState={setWizardState}
              onBack={handleBackToSelector}
              isEditing={isEditing}
              motivoEdicion={motivoEdicion}
              onSaved={handleWizardDone}
            />
          )}
        </TabsContent>

        <TabsContent value="contratos" className="mt-8">
          <ContratosGenerados role={role} onEdit={handleEditContrato} />
        </TabsContent>

        {isDirector && (
          <TabsContent value="plantillas" className="mt-8">
            <PlantillasList />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
