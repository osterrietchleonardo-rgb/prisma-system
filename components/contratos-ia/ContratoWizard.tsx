"use client"

import { useMemo, useCallback, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, ArrowRight, Check, Eye, Loader2 } from "lucide-react"
import { getGruposOrdenados, getCamposPorGrupo } from "@/lib/contratos/placeholder-helpers"
import { CampoFormularioDinamico } from "./CampoFormularioDinamico"
import { ContratoPreview } from "./ContratoPreview"
import { FirmaVirtualPanel } from "./FirmaVirtualPanel"
import type { ContratoWizardState, CampoFormulario, FirmanteRol, ContractSignature } from "@/types/contratos"
import { TIPO_CONTRATO_LABELS, FIRMANTES_POR_TIPO } from "@/types/contratos"
import { toast } from "sonner"

interface ContratoWizardProps {
  wizardState: ContratoWizardState
  setWizardState: React.Dispatch<React.SetStateAction<ContratoWizardState>>
  onBack: () => void
}

export function ContratoWizard({ wizardState, setWizardState, onBack }: ContratoWizardProps) {
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const campos = wizardState.template?.campos_schema || []
  const grupos = useMemo(() => getGruposOrdenados(campos), [campos])
  
  // Add "Preview" and "Firmas" as final steps
  const allSteps = useMemo(() => [...grupos, "PREVIEW", "FIRMAS"], [grupos])
  const currentStep = wizardState.paso_actual
  const currentStepName = allSteps[currentStep] || grupos[0]

  const currentCampos = useMemo(() => {
    if (currentStepName === "PREVIEW" || currentStepName === "FIRMAS") return []
    return getCamposPorGrupo(campos, currentStepName)
  }, [campos, currentStepName])

  const handleFieldChange = useCallback((nombre: string, value: string | number) => {
    setWizardState(prev => ({
      ...prev,
      form_data: { ...prev.form_data, [nombre]: value },
    }))
    setErrors(prev => {
      const next = { ...prev }
      delete next[nombre]
      return next
    })
  }, [setWizardState])

  const validateCurrentStep = useCallback((): boolean => {
    if (currentStepName === "PREVIEW" || currentStepName === "FIRMAS") return true
    
    const newErrors: Record<string, string> = {}
    for (const campo of currentCampos) {
      if (campo.requerido) {
        const val = wizardState.form_data[campo.nombre]
        if (val === undefined || val === null || val === "") {
          newErrors[campo.nombre] = campo.validacion?.mensaje_error || "Este campo es obligatorio"
        }
      }
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [currentStepName, currentCampos, wizardState.form_data])

  const handleNext = useCallback(() => {
    if (!validateCurrentStep()) {
      toast.error("Completá todos los campos obligatorios antes de avanzar")
      return
    }
    setWizardState(prev => ({
      ...prev,
      paso_actual: Math.min(prev.paso_actual + 1, allSteps.length - 1),
    }))
  }, [validateCurrentStep, setWizardState, allSteps.length])

  const handlePrev = useCallback(() => {
    setWizardState(prev => ({
      ...prev,
      paso_actual: Math.max(prev.paso_actual - 1, 0),
    }))
  }, [setWizardState])

  const handleSignature = useCallback((rol: FirmanteRol, sig: ContractSignature) => {
    setWizardState(prev => ({
      ...prev,
      firmas: { ...prev.firmas, [rol]: sig },
    }))
  }, [setWizardState])

  const handleSaveContrato = useCallback(async () => {
    if (!wizardState.tipo) return
    setSaving(true)
    try {
      // Determine nombre_referencia
      const apellido = String(
        wizardState.form_data["LOCATARIO_NOMBRE_COMPLETO"]
        || wizardState.form_data["COMPRADOR_NOMBRE_COMPLETO"]
        || wizardState.form_data["OFERENTE_NOMBRE"]
        || ""
      )
      const direccion = String(wizardState.form_data["INMUEBLE_DIRECCION"] || "")
      const nombreRef = `${TIPO_CONTRATO_LABELS[wizardState.tipo]} - ${apellido} - ${direccion}`.substring(0, 300)

      const res = await fetch("/api/contratos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_id: wizardState.template?.id?.startsWith("fallback-") ? null : wizardState.template?.id,
          tipo: wizardState.tipo,
          nombre_referencia: nombreRef,
          form_data: wizardState.form_data,
          estado: "borrador",
        }),
      })

      if (!res.ok) throw new Error("Error al guardar")
      const data = await res.json()
      setWizardState(prev => ({ ...prev, contrato_guardado_id: data.id }))
      toast.success("Contrato guardado como borrador")
    } catch {
      toast.error("Error al guardar el contrato")
    } finally {
      setSaving(false)
    }
  }, [wizardState, setWizardState])

  const handleFinalize = useCallback(async () => {
    if (!wizardState.contrato_guardado_id) {
      await handleSaveContrato()
    }

    setSaving(true)
    try {
      const signaturesData = Object.values(wizardState.firmas)
        .filter((s): s is ContractSignature => !!s)
        .map(s => ({
          firmante_rol: s.firmante_rol,
          firmante_nombre: s.firmante_nombre,
          firmante_dni: s.firmante_dni,
          firma_imagen_base64: s.firma_imagen_base64,
        }))

      await fetch("/api/contratos/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contrato_id: wizardState.contrato_guardado_id,
          signatures: signaturesData,
        }),
      })

      toast.success("Contrato finalizado exitosamente")
      
      // Auto-download PDF
      const { downloadContractFromId } = await import("@/lib/contratos/download-helper")
      await downloadContractFromId(wizardState.contrato_guardado_id!)
    } catch {
      toast.error("Error al finalizar")
    } finally {
      setSaving(false)
    }
  }, [wizardState, handleSaveContrato])

  return (
    <div className="space-y-6">
      {/* Header with back button */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Volver
        </Button>
        <div>
          <h2 className="text-2xl font-bold">{wizardState.tipo ? TIPO_CONTRATO_LABELS[wizardState.tipo] : ""}</h2>
          <p className="text-sm text-muted-foreground">Plantilla: {wizardState.template?.nombre}</p>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {allSteps.map((step, idx) => (
          <div key={step} className="flex items-center">
            <button
              onClick={() => {
                if (idx < currentStep) {
                  setWizardState(prev => ({ ...prev, paso_actual: idx }))
                }
              }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                idx === currentStep
                  ? "bg-accent text-accent-foreground"
                  : idx < currentStep
                    ? "bg-accent/20 text-accent cursor-pointer"
                    : "bg-muted/50 text-muted-foreground"
              }`}
            >
              {idx < currentStep ? (
                <Check className="w-3 h-3" />
              ) : (
                <span className="w-4 h-4 rounded-full bg-current/20 flex items-center justify-center text-[10px]">
                  {idx + 1}
                </span>
              )}
              {step}
            </button>
            {idx < allSteps.length - 1 && (
              <div className={`w-4 h-0.5 mx-1 ${idx < currentStep ? "bg-accent" : "bg-muted"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {currentStepName === "PREVIEW" ? (
              <><Eye className="w-5 h-5 text-accent" /> Vista previa del contrato</>
            ) : currentStepName === "FIRMAS" ? (
              <><Check className="w-5 h-5 text-accent" /> Firmas</>
            ) : (
              currentStepName
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {currentStepName === "PREVIEW" ? (
            <ContratoPreview
              templateBody={wizardState.template?.template_body || ""}
              formData={wizardState.form_data}
              tipo={wizardState.tipo!}
              firmas={wizardState.firmas}
              onSave={handleSaveContrato}
              saving={saving}
              saved={!!wizardState.contrato_guardado_id}
            />
          ) : currentStepName === "FIRMAS" ? (
            <FirmaVirtualPanel
              tipo={wizardState.tipo!}
              formData={wizardState.form_data}
              firmas={wizardState.firmas}
              onSign={handleSignature}
              onFinalize={handleFinalize}
              saving={saving}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {currentCampos.map(campo => (
                <CampoFormularioDinamico
                  key={campo.id}
                  campo={campo}
                  value={wizardState.form_data[campo.nombre]}
                  onChange={(val) => handleFieldChange(campo.nombre, val)}
                  error={errors[campo.nombre]}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={handlePrev}
          disabled={currentStep === 0}
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Anterior
        </Button>
        {currentStep < allSteps.length - 1 && (
          <Button
            onClick={handleNext}
            className="bg-accent hover:bg-accent/90 text-accent-foreground"
          >
            Siguiente <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        )}
        {currentStep === allSteps.length - 1 && (
          <Button
            onClick={handleFinalize}
            className="bg-green-600 hover:bg-green-700 text-white"
            disabled={saving}
          >
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Finalizar y generar PDF firmado
          </Button>
        )}
      </div>
    </div>
  )
}
