import { generateContratoPDF, generatePDFFilename } from "./pdf-generator"
import { interpolateTemplate } from "./template-interpolator"
import { TIPO_CONTRATO_LABELS, type TipoContrato } from "@/types/contratos"
import { toast } from "sonner"

/**
 * Orchestrates the download of a contract PDF.
 * Fetches all necessary data and triggers the browser download.
 */
export async function downloadContractFromId(contractId: string) {
  try {
    // 1. Fetch Contract data
    const res = await fetch(`/api/contratos/${contractId}`)
    if (!res.ok) throw new Error("Error al obtener los datos del contrato")
    const contract = await res.json()

    // 2. Fetch Template data
    let templateBody = ""
    if (contract.template_id) {
      const tRes = await fetch(`/api/contract-templates/${contract.template_id}`)
      if (tRes.ok) {
        const template = await tRes.json()
        templateBody = template.template_body
      }
    }

    // fallback if no template or error
    if (!templateBody) {
      // In a real app, you might fetch fallback templates or show error
      console.warn("No template body found, using raw form data summary")
      templateBody = JSON.stringify(contract.form_data, null, 2)
    }

    // 3. Fetch Signatures
    const sRes = await fetch(`/api/contratos/${contractId}/signatures`)
    let signatures = []
    if (sRes.ok) {
      const sigsData = await sRes.json()
      signatures = sigsData.map((s: any) => ({
        rol: s.firmante_rol,
        nombre: s.firmante_nombre,
        dni: s.firmante_dni,
        imagenBase64: s.firma_imagen_base64
      }))
    }

    // 4. Interpolate Template
    const interpolatedBody = interpolateTemplate(templateBody, contract.form_data)

    // 5. Generate PDF
    const apellido = contract.form_data["LOCATARIO_NOMBRE_COMPLETO"] 
                   || contract.form_data["COMPRADOR_NOMBRE_COMPLETO"]
                   || contract.form_data["OFERENTE_NOMBRE"]
                   || "documento"

    const doc = generateContratoPDF({
      title: contract.nombre_referencia || TIPO_CONTRATO_LABELS[contract.tipo as TipoContrato] || "Contrato",
      body: interpolatedBody,
      signatures: signatures,
      fecha: contract.created_at ? new Date(contract.created_at).toLocaleDateString('es-AR') : undefined
    })

    // 6. Download
    const filename = generatePDFFilename(contract.tipo, String(apellido))
    doc.save(filename)
    
    return true
  } catch (error) {
    console.error("Download Error:", error)
    toast.error("Ocurrió un error al generar el PDF")
    return false
  }
}
