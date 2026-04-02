"use client"

import { useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Download, Save, Loader2 } from "lucide-react"
import { interpolateTemplate } from "@/lib/contratos/template-interpolator"
import { generateContratoPDF, generatePDFFilename } from "@/lib/contratos/pdf-generator"
import { TIPO_CONTRATO_LABELS } from "@/types/contratos"
import type { TipoContrato, FirmanteRol, ContractSignature } from "@/types/contratos"
import { toast } from "sonner"

interface ContratoPreviewProps {
  templateBody: string
  formData: Record<string, string | number>
  tipo: TipoContrato
  firmas: Partial<Record<FirmanteRol, ContractSignature>>
  onSave: () => Promise<void>
  saving: boolean
  saved: boolean
}

export function ContratoPreview({
  templateBody,
  formData,
  tipo,
  firmas,
  onSave,
  saving,
  saved,
}: ContratoPreviewProps) {
  const interpolatedText = useMemo(
    () => interpolateTemplate(templateBody, formData),
    [templateBody, formData]
  )

  const handleDownloadPDF = () => {
    try {
      const signaturesForPdf = Object.values(firmas)
        .filter((s): s is ContractSignature => !!s && !!s.firma_imagen_base64)
        .map(s => ({
          rol: s.firmante_rol,
          nombre: s.firmante_nombre,
          dni: s.firmante_dni || "",
          imagenBase64: s.firma_imagen_base64,
        }))

      const title = `CONTRATO DE ${TIPO_CONTRATO_LABELS[tipo].toUpperCase()}`
      const agencyName = String(formData["INMOBILIARIA_NOMBRE"] || "PRISMA System")

      const doc = generateContratoPDF({
        title,
        body: interpolatedText,
        agencyName,
        agencyMatricula: String(formData["INMOBILIARIA_MATRICULA"] || ""),
        signatures: signaturesForPdf,
      })

      const apellido = String(
        formData["LOCATARIO_NOMBRE_COMPLETO"]
        || formData["COMPRADOR_NOMBRE_COMPLETO"]
        || formData["OFERENTE_NOMBRE"]
        || "contrato"
      )
      const filename = generatePDFFilename(tipo, apellido)
      doc.save(filename)
      toast.success("PDF descargado exitosamente")
    } catch {
      toast.error("Error al generar el PDF")
    }
  }

  return (
    <div className="space-y-6">
      {/* Preview container */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-border p-8 max-h-[600px] overflow-y-auto shadow-inner">
        <div className="max-w-[700px] mx-auto">
          {/* Title */}
          <h2 className="text-center font-bold text-lg mb-6 tracking-wide">
            CONTRATO DE {TIPO_CONTRATO_LABELS[tipo].toUpperCase()}
          </h2>

          {/* Body */}
          <div className="text-sm leading-relaxed whitespace-pre-wrap font-serif text-foreground/90">
            {interpolatedText.split("\n").map((line, i) => {
              const isHeader = /^(PRIMERA|SEGUNDA|TERCERA|CUARTA|QUINTA|SEXTA|SÉPTIMA|OCTAVA|NOVENA|DÉCIMA|CLÁUSULA|TÍTULO)/i.test(line.trim())
              return (
                <p
                  key={i}
                  className={`mb-2 ${isHeader ? "font-bold text-foreground mt-4" : ""}`}
                >
                  {/* Highlight unfilled placeholders */}
                  {line.split(/(\{\{[A-Z_]+\}\})/).map((segment, j) =>
                    /^\{\{[A-Z_]+\}\}$/.test(segment) ? (
                      <span
                        key={j}
                        className="bg-accent/10 text-accent font-mono text-xs px-1 py-0.5 rounded border border-accent/20"
                      >
                        {segment}
                      </span>
                    ) : (
                      <span key={j}>{segment}</span>
                    )
                  )}
                </p>
              )
            })}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Button
          onClick={onSave}
          variant="outline"
          disabled={saving || saved}
        >
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          {saved ? "Guardado ✓" : "Guardar borrador"}
        </Button>
        <Button
          onClick={handleDownloadPDF}
          className="bg-accent hover:bg-accent/90 text-accent-foreground"
        >
          <Download className="w-4 h-4 mr-2" /> Descargar PDF
        </Button>
        <Button
          variant="ghost"
          onClick={() => toast.info("Funcionalidad próximamente")}
        >
          📧 Enviar por email
        </Button>
      </div>
    </div>
  )
}
