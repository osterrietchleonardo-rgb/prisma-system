import { NextRequest, NextResponse } from "next/server"
import { prismaIA } from "@/lib/gemini"
import { parseWhatsAppChat } from "@/lib/whatsapp-parser"
import { createClient } from "@/lib/supabase/server"
import { rateLimit, LIMITS } from "@/lib/rate-limiter"
import { z } from "zod"

// Schema de validación
const schema = z.object({
  chatText: z.string().min(10, "El chat es demasiado corto para ser analizado").max(50000, "El chat excede el límite permitido"),
})

export async function POST(req: NextRequest) {
  const supabase = createClient()
  
  try {
    // 1. Auth check
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    // 2. Rate limiting (30 req/hora por userId)
    const rl = await rateLimit(session.user.id, LIMITS.AI)
    if (!rl.success) {
      return NextResponse.json({ error: rl.errorMessage }, { status: 429 })
    }

    // 3. Validation & Sanitization
    const body = await req.json()
    const result_zod = schema.safeParse(body)
    
    if (!result_zod.success) {
      return NextResponse.json({ 
        error: "Entrada inválida", 
        details: result_zod.error.flatten().fieldErrors 
      }, { status: 400 })
    }

    const chatText = result_zod.data.chatText
    const cleanedChat = parseWhatsAppChat(chatText)

    // 4. Gemini Prompt
    const prompt = `
      Eres un experto analista comercial inmobiliario para el mercado Argentino.
      Analiza el siguiente fragmento de chat de WhatsApp entre un asesor y un lead.
      
      OBJETIVO:
      Extraer datos clave y evaluar la calidad de la atención.
      
      ETAPAS COMERCIALES DEFINIDAS:
      1. Nuevo contacto, 2. Primer contacto realizado, 3. Calificado, 4. Visita agendada, 
      5. Visita realizada, 6. Propuesta enviada, 7. Negociación, 8. Cerrado, 9. Perdido.

      CHAT:
      ${cleanedChat}

      RESPONDE ÚNICAMENTE EN FORMATO JSON CON ESTA ESTRUCTURA:
      {
        "lead_name": "Nombre (si se menciona)",
        "phone": "Teléfono (si aparece)",
        "search_intent": "Breve descripción de qué busca (tipo de propiedad, zona, presupuesto)",
        "response_time_eval": "Evaluación de cuánto tardó el asesor en responder inicialmente",
        "lead_attitude": "interesado" | "dudoso" | "frio",
        "commercial_process_eval": "Breve análisis de si el asesor siguió bien el proceso",
        "summary": "Resumen ejecutivo de 2 líneas",
        "next_step": "Acción concreta recomendada"
      }
    `

    const aiResult = await prismaIA.generateContent(prompt)
    const responseText = aiResult.response.text()
    
    // Clean potential markdown and parse
    const jsonString = responseText.replace(/```json|```/g, "").trim()
    const analysis = JSON.parse(jsonString)

    return NextResponse.json(analysis)

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("AI Analysis Error:", message)
    return NextResponse.json({ error: "Error interno al procesar el chat" }, { status: 500 })
  }
}
