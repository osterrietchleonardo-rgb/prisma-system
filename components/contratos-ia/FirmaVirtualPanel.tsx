"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Check, Loader2, PenTool } from "lucide-react"
import { FIRMANTES_POR_TIPO } from "@/types/contratos"
import type { TipoContrato, FirmanteRol, ContractSignature } from "@/types/contratos"
import { FirmaCanvas } from "./FirmaCanvas"

interface FirmaVirtualPanelProps {
  tipo: TipoContrato
  formData: Record<string, string | number>
  firmas: Partial<Record<FirmanteRol, ContractSignature>>
  onSign: (rol: FirmanteRol, signature: ContractSignature) => void
  onFinalize: () => Promise<void>
  saving: boolean
}

// Map roles to form data fields for auto-completion
const ROL_FIELDS: Record<FirmanteRol, { nombre: string; dni: string }> = {
  locador: { nombre: "LOCADOR_NOMBRE_COMPLETO", dni: "LOCADOR_DNI_CUIT" },
  locatario: { nombre: "LOCATARIO_NOMBRE_COMPLETO", dni: "LOCATARIO_DNI_CUIT" },
  garante: { nombre: "GARANTE_NOMBRE_COMPLETO", dni: "GARANTE_DNI_CUIT" },
  vendedor: { nombre: "VENDEDOR_NOMBRE_COMPLETO", dni: "VENDEDOR_DNI_CUIT" },
  comprador: { nombre: "COMPRADOR_NOMBRE_COMPLETO", dni: "COMPRADOR_DNI_CUIT" },
}

export function FirmaVirtualPanel({
  tipo,
  formData,
  firmas,
  onSign,
  onFinalize,
  saving,
}: FirmaVirtualPanelProps) {
  const firmantes = FIRMANTES_POR_TIPO[tipo]
  
  const allObligatorySigned = firmantes
    .filter(f => f.obligatorio)
    .every(f => !!firmas[f.rol]?.firma_imagen_base64)

  const handleSign = (rol: FirmanteRol, imageBase64: string) => {
    const fields = ROL_FIELDS[rol]
    onSign(rol, {
      id: "",
      contrato_id: "",
      firmante_rol: rol,
      firmante_nombre: String(formData[fields.nombre] || ""),
      firmante_dni: String(formData[fields.dni] || ""),
      firma_imagen_base64: imageBase64,
      firmado_at: new Date().toISOString(),
      ip_address: null,
    })
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {firmantes.map(({ rol, label, obligatorio }) => {
          const fields = ROL_FIELDS[rol]
          const nombre = String(formData[fields.nombre] || "")
          const dni = String(formData[fields.dni] || "")
          const firma = firmas[rol]
          const isSigned = !!firma?.firma_imagen_base64

          // Skip optional signers with no name
          if (!obligatorio && !nombre) return null

          return (
            <Card key={rol} className={`border ${isSigned ? "border-green-500/30 bg-green-500/5" : "border-border"}`}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-base">
                  <div className="flex items-center gap-2">
                    <PenTool className="w-4 h-4 text-accent" />
                    {label}
                    {obligatorio && <Badge variant="outline" className="text-[10px]">Obligatorio</Badge>}
                  </div>
                  {isSigned && (
                    <Badge className="bg-green-600 text-white">
                      <Check className="w-3 h-3 mr-1" /> Firmado
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm">
                  <p><span className="text-muted-foreground">Nombre:</span> {nombre || "-"}</p>
                  <p><span className="text-muted-foreground">DNI:</span> {dni || "-"}</p>
                </div>

                {isSigned ? (
                  <div className="border rounded-xl p-3 bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={firma.firma_imagen_base64 || ""}
                      alt={`Firma de ${nombre}`}
                      className="max-h-[100px] mx-auto"
                    />
                  </div>
                ) : (
                  <FirmaCanvas
                    onConfirm={(base64) => handleSign(rol, base64)}
                    width={350}
                    height={120}
                  />
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-border">
        <Button
          onClick={onFinalize}
          className="bg-green-600 hover:bg-green-700 text-white"
          disabled={!allObligatorySigned || saving}
        >
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Finalizar y generar PDF firmado
        </Button>
      </div>
    </div>
  )
}
