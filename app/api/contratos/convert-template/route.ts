import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { GoogleGenerativeAI } from "@google/generative-ai"
import mammoth from "mammoth"

export const dynamic = "force-dynamic"

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
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const formData = await req.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "El archivo excede el límite de 5MB" }, { status: 400 })
    }

    const fileName = file.name.toLowerCase()
    let extractedText = ""

    if (fileName.endsWith(".docx")) {
      const buffer = Buffer.from(await file.arrayBuffer())
      const result = await mammoth.extractRawText({ buffer })
      extractedText = result.value
    } else if (fileName.endsWith(".pdf")) {
      const buffer = Buffer.from(await file.arrayBuffer())
      // Dynamic import for pdf-parse-fork (CommonJS module)
      const pdfParse = (await import("pdf-parse-fork")).default
      const pdfData = await pdfParse(buffer)
      extractedText = pdfData.text
    } else {
      return NextResponse.json({ error: "Formato no soportado. Use .docx o .pdf" }, { status: 400 })
    }

    if (!extractedText || extractedText.trim().length < 100) {
      return NextResponse.json({ error: "No se pudo extraer suficiente texto del archivo" }, { status: 400 })
    }

    // Call Gemini
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" })

    const result = await model.generateContent([
      SYSTEM_PROMPT,
      `\n\nTexto del contrato:\n${extractedText.substring(0, 30000)}`
    ])

    const responseText = result.response.text()
    const cleanJson = responseText.replace(/```json|```/g, "").trim()

    try {
      const parsed = JSON.parse(cleanJson)
      return NextResponse.json(parsed)
    } catch {
      return NextResponse.json({ error: "Error al procesar la respuesta de IA" }, { status: 500 })
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("Convert template error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
