import { generateContratoPDF, generatePDFFilename } from "./pdf-generator"
import { interpolateTemplate } from "./template-interpolator"
import { TIPO_CONTRATO_LABELS, FIRMANTES_POR_TIPO, type TipoContrato } from "@/types/contratos"
import { toast } from "sonner"
import type jsPDF from "jspdf"

/**
 * Intenta resolver el nombre del firmante desde el form_data probando varias
 * convenciones de placeholder (LOCADOR_NOMBRE_COMPLETO, OFERENTE_NOMBRE, etc.).
 */
function resolveFirmanteNombre(formData: Record<string, any>, rol: string): string | undefined {
  const ROL = rol.toUpperCase()
  const candidates = [
    `${ROL}_NOMBRE_COMPLETO`,
    `${ROL}_NOMBRE`,
    `${ROL}_RAZON_SOCIAL`,
  ]
  // Roles con nombres alternativos comunes en reserva/venta
  if (rol === "comprador") candidates.push("OFERENTE_NOMBRE", "OFERENTE_NOMBRE_COMPLETO")
  if (rol === "vendedor") candidates.push("PROPIETARIO_NOMBRE", "PROPIETARIO_NOMBRE_COMPLETO")
  for (const key of candidates) {
    const val = formData[key]
    if (val) return String(val)
  }
  return undefined
}

/**
 * Construye el documento PDF del contrato (interpolado + líneas de firma presencial).
 * Reutilizable para descargar o para subir a Storage.
 */
async function buildContratoDoc(contractId: string): Promise<{ doc: jsPDF; filename: string } | null> {
  // 1. Datos del contrato
  const res = await fetch(`/api/contratos/${contractId}`)
  if (!res.ok) throw new Error("Error al obtener los datos del contrato")
  const contract = await res.json()

  // 2. Plantilla
  let templateBody = ""
  if (contract.template_id) {
    const tRes = await fetch(`/api/contract-templates/${contract.template_id}`)
    if (tRes.ok) {
      const template = await tRes.json()
      templateBody = template.template_body
    }
  }
  if (!templateBody) {
    console.warn("No template body found, using raw form data summary")
    templateBody = JSON.stringify(contract.form_data, null, 2)
  }

  // 3. Interpolar
  const interpolatedBody = interpolateTemplate(templateBody, contract.form_data)

  // 4. Espacios de firma presencial según el tipo de contrato
  const firmanteSlots = (FIRMANTES_POR_TIPO[contract.tipo as TipoContrato] || []).map(f => ({
    label: f.label,
    nombre: resolveFirmanteNombre(contract.form_data || {}, f.rol),
  }))

  // 5. Generar PDF
  const apellido =
    contract.form_data?.["LOCATARIO_NOMBRE_COMPLETO"] ||
    contract.form_data?.["COMPRADOR_NOMBRE_COMPLETO"] ||
    contract.form_data?.["OFERENTE_NOMBRE"] ||
    "documento"

  const doc = generateContratoPDF({
    title: contract.nombre_referencia || TIPO_CONTRATO_LABELS[contract.tipo as TipoContrato] || "Contrato",
    body: interpolatedBody,
    firmanteSlots,
    fecha: contract.created_at ? new Date(contract.created_at).toLocaleDateString("es-AR") : undefined,
  })

  const filename = generatePDFFilename(contract.tipo, String(apellido))
  return { doc, filename }
}

/**
 * Orquesta la descarga del PDF de un contrato (generación en cliente).
 */
export async function downloadContractFromId(contractId: string) {
  try {
    const built = await buildContratoDoc(contractId)
    if (!built) return false
    built.doc.save(built.filename)
    return true
  } catch (error) {
    console.error("Download Error:", error)
    toast.error("Ocurrió un error al generar el PDF")
    return false
  }
}

/**
 * Genera el PDF en cliente y lo sube a Storage (queda accesible por link e historial).
 * Al modificar un contrato se reemplaza el PDF existente (mismo path).
 * Devuelve la URL pública o null si falló.
 */
export async function uploadContractPDF(contractId: string): Promise<string | null> {
  try {
    const built = await buildContratoDoc(contractId)
    if (!built) return null

    const blob = built.doc.output("blob")
    const formData = new FormData()
    formData.append("file", blob, built.filename)

    const res = await fetch(`/api/contratos/${contractId}/pdf`, {
      method: "POST",
      body: formData,
    })
    if (!res.ok) throw new Error("Error al guardar el PDF")
    const data = await res.json()
    return data.pdf_url || null
  } catch (error) {
    console.error("Upload PDF Error:", error)
    toast.error("No se pudo guardar el PDF en el servidor")
    return null
  }
}
