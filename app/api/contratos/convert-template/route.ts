import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { NextResponse } from "next/server"
import { consumeAiCredits, requireTenant, updateAiTransactionCost } from "@/lib/auth/tenant-validation"
import { calculateCost, tokensFromUsage } from "@/utils/aiCostCalculator"
import { GoogleGenerativeAI } from "@google/generative-ai"
import mammoth from "mammoth"

export const dynamic = "force-dynamic"

// Bucket de Storage para contratos (originales subidos y PDFs generados)
const CONTRATOS_BUCKET = "contratos"
// Límite de tamaño: el peso se delega a Storage, pero se mantiene un tope práctico.
const MAX_FILE_SIZE = 25 * 1024 * 1024

const SYSTEM_PROMPT = `Eres un asistente jurídico especializado en contratos inmobiliarios argentinos. 
Recibirás el texto de un contrato real. Tu tarea es convertirlo en una plantilla 
reutilizable reemplazando TODOS los datos específicos de las partes, el inmueble, 
fechas, montos y cualquier dato variable por placeholders en formato {{NOMBRE_PLACEHOLDER}}.

Reglas para los placeholders:
- Usar MAYÚSCULAS_CON_GUIÓN_BAJO
- Prefijos: LOCADOR_, LOCATARIO_, GARANTE_, VENDEDOR_, COMPRADOR_, INMUEBLE_, 
  CONTRATO_, PRECIO_, FIRMA_, OFERENTE_, PROPIETARIO_, PROFESIONAL_
- Ejemplos: {{LOCADOR_NOMBRE_COMPLETO}}, {{INMUEBLE_DIRECCION}}, {{CONTRATO_FECHA_INICIO}},
  {{PRECIO_TOTAL}}
- NO modificar el texto jurídico, cláusulas, ni el estilo del contrato original.
- Solo reemplazar los datos variables, dejando el resto intacto.
- IMPORTANTE: Reconocé los campos a completar aunque vengan vacíos, con rayas (___, ____),
  con puntos suspensivos (……) o con marcadores tipo "[ ]", "[COMPLETAR]", "XXXX".
  Convertí cada uno de esos espacios en blanco en el placeholder {{...}} que corresponda
  según el contexto de la cláusula.
- Detectá TODAS las variables: no dejes ningún dato de las partes, inmueble, fechas ni montos
  sin convertir en placeholder.
- Al final, devolver un JSON con:
  {
    "template_body": "<texto con placeholders>",
    "placeholders_detectados": ["lista", "de", "placeholders"],
    "tipo_contrato_detectado": "locacion_habitacional|locacion_comercial|boleto_compraventa|reserva_venta|otro",
    "advertencias": ["lista de cláusulas que pueden necesitar revisión manual"]
  }
Responde ÚNICAMENTE con el JSON, sin texto adicional ni backticks.`

export async function POST(req: Request) {
  try {
    const { userId, agencyId } = await requireTenant()

    const formData = await req.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "El archivo excede el límite de 25MB" }, { status: 400 })
    }

    const fileName = file.name.toLowerCase()
    const ext = fileName.endsWith(".docx") ? "docx" : fileName.endsWith(".pdf") ? "pdf" : null
    if (!ext) {
      return NextResponse.json({ error: "Formato no soportado. Use .docx o .pdf" }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    let extractedText = ""

    if (ext === "docx") {
      const result = await mammoth.extractRawText({ buffer })
      extractedText = result.value
    } else {
      // Dynamic import for pdf-parse-fork (CommonJS module)
      const pdfParse = (await import("pdf-parse-fork")).default
      const pdfData = await pdfParse(buffer)
      extractedText = pdfData.text
    }

    if (!extractedText || extractedText.trim().length < 100) {
      return NextResponse.json({ error: "No se pudo extraer suficiente texto del archivo" }, { status: 400 })
    }

    // Subir el archivo original a Storage (el peso ya no importa, queda guardado).
    let archivo_original_url: string | null = null
    try {
      const supabaseAdmin = createAdminClient()
      const storagePath = `${agencyId}/originales/${crypto.randomUUID()}.${ext}`
      const contentType = ext === "docx"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/pdf"
      const { error: uploadError } = await supabaseAdmin.storage
        .from(CONTRATOS_BUCKET)
        .upload(storagePath, buffer, { contentType, upsert: true })
      if (!uploadError) {
        archivo_original_url = supabaseAdmin.storage.from(CONTRATOS_BUCKET).getPublicUrl(storagePath).data.publicUrl
      } else {
        console.error("Error subiendo original a Storage:", uploadError.message)
      }
    } catch (e) {
      console.error("Storage upload (original) falló:", e)
    }

    // Consume AI Credits (returns txId for real-cost tracking)
    const txId = await consumeAiCredits("contratos_ia", 1, `Convert template: ${fileName}`);

    // Call Gemini
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" })

    const result = await model.generateContent([
      SYSTEM_PROMPT,
      `\n\nTexto del contrato:\n${extractedText.substring(0, 30000)}`
    ])

    const responseText = result.response.text()

    // ─── Record real token usage ───────────────────────────────────────
    // Precio tomado de la tabla central (utils/aiCostCalculator) según el modelo real.
    const contratos_usage = result.response.usageMetadata;
    if (contratos_usage) {
      const { inputTokens: inputTk, outputTokens: outputTk } = tokensFromUsage(contratos_usage);
      const { totalCostUSD } = calculateCost({ model: "gemini-3.5-flash", inputTokens: inputTk, outputTokens: outputTk });
      updateAiTransactionCost(txId, inputTk, outputTk, totalCostUSD);
    }
    const cleanJson = responseText.replace(/```json|```/g, "").trim()

    try {
      const parsed = JSON.parse(cleanJson)
      return NextResponse.json({ ...parsed, archivo_original_url })
    } catch {
      return NextResponse.json({ error: "Error al procesar la respuesta de IA" }, { status: 500 })
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("Convert template error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
