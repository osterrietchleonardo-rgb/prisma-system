"use client"

import { useMemo, useCallback, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, ArrowRight, Check, Eye, Loader2, Sparkles, Save } from "lucide-react"
import { getGruposOrdenados, getCamposPorGrupo } from "@/lib/contratos/placeholder-helpers"
import { CampoFormularioDinamico } from "./CampoFormularioDinamico"
import { ContratoPreview } from "./ContratoPreview"
import type { ContratoWizardState } from "@/types/contratos"
import { TIPO_CONTRATO_LABELS } from "@/types/contratos"
import { uploadContractPDF, downloadContractFromId } from "@/lib/contratos/download-helper"
import { toast } from "sonner"

interface ContratoWizardProps {
  wizardState: ContratoWizardState
  setWizardState: React.Dispatch<React.SetStateAction<ContratoWizardState>>
  onBack: () => void
  /** En modo edición se actualiza un contrato existente (PUT) en vez de crear uno nuevo. */
  isEditing?: boolean
  /** Motivo de la modificación (requerido en modo edición, lo ve el director). */
  motivoEdicion?: string
  /** Callback al terminar de editar correctamente. */
  onSaved?: () => void
}

export function ContratoWizard({ wizardState, setWizardState, onBack, isEditing = false, motivoEdicion, onSaved }: ContratoWizardProps) {
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const campos = wizardState.template?.campos_schema || []
  const grupos = useMemo(() => getGruposOrdenados(campos), [campos])

  // El paso final es la vista previa (la firma es presencial, en papel)
  const allSteps = useMemo(() => [...grupos, "PREVIEW"], [grupos])
  const currentStep = wizardState.paso_actual
  const currentStepName = allSteps[currentStep] || grupos[0]

  const currentCampos = useMemo(() => {
    if (currentStepName === "PREVIEW") return []
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
    if (currentStepName === "PREVIEW") return true

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

  const buildNombreRef = useCallback(() => {
    const apellido = String(
      wizardState.form_data["LOCATARIO_NOMBRE_COMPLETO"]
      || wizardState.form_data["COMPRADOR_NOMBRE_COMPLETO"]
      || wizardState.form_data["OFERENTE_NOMBRE"]
      || ""
    )
    const direccion = String(wizardState.form_data["INMUEBLE_DIRECCION"] || "")
    return `${TIPO_CONTRATO_LABELS[wizardState.tipo!]} - ${apellido} - ${direccion}`.substring(0, 300)
  }, [wizardState.form_data, wizardState.tipo])

  // Guardar como borrador (modo creación)
  const handleSaveContrato = useCallback(async (): Promise<string | null> => {
    if (!wizardState.tipo) return null
    setSaving(true)
    try {
      const res = await fetch("/api/contratos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_id: wizardState.template?.id?.startsWith("fallback-") ? null : wizardState.template?.id,
          tipo: wizardState.tipo,
          nombre_referencia: buildNombreRef(),
          form_data: wizardState.form_data,
          estado: "borrador",
        }),
      })

      if (!res.ok) throw new Error("Error al guardar")
      const data = await res.json()
      setWizardState(prev => ({ ...prev, contrato_guardado_id: data.id }))
      toast.success("Contrato guardado como borrador")
      return data.id as string
    } catch {
      toast.error("Error al guardar el contrato")
      return null
    } finally {
      setSaving(false)
    }
  }, [wizardState, setWizardState, buildNombreRef])

  // Finalizar (creación): guarda, consume créditos, genera y sube el PDF
  const handleFinalize = useCallback(async () => {
    if (!validateCurrentStep()) {
      toast.error("Revisá los campos obligatorios antes de generar el contrato")
      return
    }
    setSaving(true)
    try {
      let contratoId = wizardState.contrato_guardado_id
      if (!contratoId) {
        contratoId = await handleSaveContrato()
        if (!contratoId) return
      }

      // Consume créditos y marca el contrato como generado (firma presencial)
      await fetch("/api/contratos/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contrato_id: contratoId }),
      })

      // Genera el PDF en cliente y lo guarda en Storage (queda accesible por link)
      await uploadContractPDF(contratoId)

      toast.success("Contrato generado exitosamente")
      window.dispatchEvent(new CustomEvent("prisma-refresh-credits"))

      // Descarga automática para el usuario
      await downloadContractFromId(contratoId)
      onSaved?.()
    } catch {
      toast.error("Error al generar el contrato")
    } finally {
      setSaving(false)
    }
  }, [wizardState, handleSaveContrato, validateCurrentStep, onSaved])

  // Guardar cambios (modo edición): PUT con motivo + reemplaza el PDF
  const handleUpdate = useCallback(async () => {
    if (!validateCurrentStep()) {
      toast.error("Revisá los campos obligatorios antes de guardar")
      return
    }
    if (!wizardState.contrato_guardado_id) return
    setSaving(true)
    try {
      const res = await fetch(`/api/contratos/${wizardState.contrato_guardado_id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          form_data: wizardState.form_data,
          nombre_referencia: buildNombreRef(),
          motivo_gestion: motivoEdicion || "Modificación de datos",
        }),
      })
      if (!res.ok) throw new Error("Error al actualizar")

      // Reemplaza el PDF guardado por la nueva versión
      await uploadContractPDF(wizardState.contrato_guardado_id)

      toast.success("Contrato modificado correctamente")
      onSaved?.()
    } catch {
      toast.error("Error al modificar el contrato")
    } finally {
      setSaving(false)
    }
  }, [wizardState, motivoEdicion, buildNombreRef, validateCurrentStep, onSaved])

  const isLastStep = currentStep === allSteps.length - 1

  return (
    <div className="space-y-6">
      {/* Header with back button */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Volver
        </Button>
        <div>
          <h2 className="text-2xl font-bold">
            {isEditing ? "Modificar: " : ""}{wizardState.tipo ? TIPO_CONTRATO_LABELS[wizardState.tipo] : ""}
          </h2>
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
              {step === "PREVIEW" ? "Vista previa" : step}
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
              onSave={isEditing ? undefined : handleSaveContrato}
              saving={saving}
              saved={!!wizardState.contrato_guardado_id}
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

        {!isLastStep && (
          <Button
            onClick={handleNext}
            className="bg-accent hover:bg-accent/90 text-accent-foreground"
          >
            Siguiente <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        )}

        {isLastStep && isEditing && (
          <Button
            onClick={handleUpdate}
            className="bg-accent hover:bg-accent/90 text-accent-foreground"
            disabled={saving}
          >
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Guardar cambios
          </Button>
        )}

        {isLastStep && !isEditing && (
          <div className="flex flex-col items-end gap-1">
            <Button
              onClick={handleFinalize}
              className="bg-green-600 hover:bg-green-700 text-white"
              disabled={saving}
            >
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Finalizar y generar PDF
            </Button>
            <p className="text-[10px] text-muted-foreground/50 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Esta acción consume <span className="font-semibold">5 créditos IA</span>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
