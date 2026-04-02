"use client"

import { useState, useCallback, useMemo } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Upload, Loader2, Save, AlertTriangle, Check } from "lucide-react"
import { TIPO_CONTRATO_LABELS } from "@/types/contratos"
import type { TipoContrato, ConvertTemplateResponse } from "@/types/contratos"
import { toast } from "sonner"

interface UploadContratoModalProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
}

type ConvertStep = "upload" | "processing" | "review"

export function UploadContratoModal({ open, onClose, onSaved }: UploadContratoModalProps) {
  const [step, setStep] = useState<ConvertStep>("upload")
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<ConvertTemplateResponse | null>(null)
  const [editedBody, setEditedBody] = useState("")
  const [tipoOverride, setTipoOverride] = useState<TipoContrato | "otro" | "">("")
  const [nombre, setNombre] = useState("")
  const [saving, setSaving] = useState(false)

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const ext = f.name.toLowerCase()
    if (!ext.endsWith(".docx") && !ext.endsWith(".pdf")) {
      toast.error("Solo se aceptan archivos .docx o .pdf")
      return
    }
    if (f.size > 5 * 1024 * 1024) {
      toast.error("El archivo no puede superar los 5MB")
      return
    }
    setFile(f)
  }, [])

  const handleUpload = useCallback(async () => {
    if (!file) return
    setStep("processing")

    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch("/api/contratos/convert-template", {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Error al procesar")
      }

      const data: ConvertTemplateResponse = await res.json()
      setResult(data)
      setEditedBody(data.template_body)
      setTipoOverride(data.tipo_contrato_detectado)
      setNombre(`Plantilla importada - ${file.name.replace(/\.(docx|pdf)$/i, "")}`)
      setStep("review")
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error desconocido"
      toast.error(message)
      setStep("upload")
    }
  }, [file])

  const handleSave = useCallback(async () => {
    if (!tipoOverride || tipoOverride === "otro") {
      toast.error("Seleccioná un tipo de contrato válido")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/contract-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre,
          tipo: tipoOverride,
          template_body: editedBody,
          campos_schema: [],
          is_active: false,
        }),
      })
      if (res.ok) {
        toast.success("Plantilla guardada exitosamente")
        onSaved()
        handleReset()
      } else {
        throw new Error("Error al guardar")
      }
    } catch {
      toast.error("Error al guardar la plantilla")
    } finally {
      setSaving(false)
    }
  }, [tipoOverride, nombre, editedBody, onSaved])

  const handleReset = () => {
    setStep("upload")
    setFile(null)
    setResult(null)
    setEditedBody("")
    setTipoOverride("")
    setNombre("")
  }

  const highlightedPreview = useMemo(() => {
    if (!editedBody) return ""
    return editedBody.replace(
      /\{\{([A-Z_]+)\}\}/g,
      '<span style="background-color: rgba(184, 115, 51, 0.15); color: #b87333; font-weight: 600; padding: 1px 4px; border-radius: 3px;">{{$1}}</span>'
    )
  }, [editedBody])

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); handleReset() } }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-accent" />
            Subir contrato y convertir a plantilla con IA
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-6 py-4">
            <div className="border-2 border-dashed border-accent/30 rounded-xl p-8 text-center hover:border-accent/50 transition-colors">
              <Upload className="w-10 h-10 mx-auto text-accent/50 mb-3" />
              <p className="text-sm text-muted-foreground mb-4">
                Arrastrá o seleccioná un archivo .docx o .pdf (máx. 5MB)
              </p>
              <Input
                type="file"
                accept=".docx,.pdf"
                onChange={handleFileChange}
                className="max-w-xs mx-auto"
              />
              {file && (
                <p className="text-sm font-medium mt-3 text-accent">{file.name}</p>
              )}
            </div>
            <div className="flex justify-end">
              <Button
                onClick={handleUpload}
                disabled={!file}
                className="bg-accent hover:bg-accent/90 text-accent-foreground"
              >
                Convertir con IA
              </Button>
            </div>
          </div>
        )}

        {step === "processing" && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="w-10 h-10 text-accent animate-spin" />
            <p className="text-muted-foreground">Procesando archivo con IA...</p>
            <p className="text-xs text-muted-foreground">Esto puede tomar unos segundos</p>
          </div>
        )}

        {step === "review" && result && (
          <div className="space-y-6 py-4">
            {/* Info badges */}
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-accent/30 text-accent">
                Tipo detectado: {TIPO_CONTRATO_LABELS[result.tipo_contrato_detectado as TipoContrato] || result.tipo_contrato_detectado}
              </Badge>
              <Badge variant="outline">
                {result.placeholders_detectados.length} placeholders
              </Badge>
            </div>

            {/* Warnings */}
            {result.advertencias.length > 0 && (
              <Card className="border-yellow-500/30 bg-yellow-500/5">
                <CardContent className="p-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-yellow-500">Advertencias</p>
                      <ul className="text-xs text-muted-foreground mt-1 space-y-1">
                        {result.advertencias.map((a, i) => (
                          <li key={i}>• {a}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Type override */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Nombre de la plantilla</Label>
                <Input value={nombre} onChange={e => setNombre(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Tipo de contrato</Label>
                <Select value={tipoOverride} onValueChange={v => setTipoOverride(v as TipoContrato)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TIPO_CONTRATO_LABELS) as TipoContrato[]).map(t => (
                      <SelectItem key={t} value={t}>{TIPO_CONTRATO_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Preview */}
            <div>
              <Label>Vista previa (placeholders resaltados)</Label>
              <Card className="mt-2 bg-white dark:bg-slate-900 max-h-[300px] overflow-y-auto">
                <CardContent className="p-4">
                  <div
                    className="text-xs whitespace-pre-wrap leading-relaxed font-mono"
                    dangerouslySetInnerHTML={{ __html: highlightedPreview }}
                  />
                </CardContent>
              </Card>
            </div>

            {/* Placeholders list */}
            <div>
              <Label>Placeholders detectados</Label>
              <div className="flex flex-wrap gap-1 mt-2">
                {result.placeholders_detectados.map(p => (
                  <Badge key={p} variant="outline" className="text-[10px] font-mono border-accent/20 text-accent">
                    {`{{${p}}}`}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-border pt-4">
              <Button variant="outline" onClick={() => { onClose(); handleReset() }}>
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                className="bg-accent hover:bg-accent/90 text-accent-foreground"
                disabled={saving}
              >
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Guardar como plantilla
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
