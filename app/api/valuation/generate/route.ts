import { NextRequest, NextResponse } from "next/server"
import { prismaIA } from "@/lib/gemini"
import { createClient } from "@/lib/supabase/server"
import { rateLimit, LIMITS } from "@/lib/rate-limiter"
import { z } from "zod"

const schema = z.object({
  type: z.string().min(1, "Tipo de propiedad es requerido"),
  location: z.string().min(1, "Ubicación es requerida"),
  sqm: z.number().positive("Metros cuadrados debe ser positivo"),
  rooms: z.number().default(1),
  condition: z.string().min(1, "Estado es requerido"),
  extra: z.string().optional(),
  agency_id: z.string().uuid("ID de agencia inválido")
})

export async function POST(req: NextRequest) {
  const supabase = createClient()
  
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const body = await req.json()
    const validation = schema.safeParse(body)
    
    if (!validation.success) {
      return NextResponse.json({ 
        error: "Datos de propiedad inválidos", 
        details: validation.error.flatten().fieldErrors 
      }, { status: 400 })
    }

    const propertyInfo = validation.data

    // Rate Limiting (20 req/hora por agencyId)
    const rl = await rateLimit(propertyInfo.agency_id, LIMITS.VALUATION)
    if (!rl.success) {
      return NextResponse.json({ error: rl.errorMessage }, { status: 429 })
    }

    const prompt = `
      Eres un tasador inmobiliario experto en el mercado Argentino.
      Realiza una TASACIÓN ESTIMATIVA (AVM) para la siguiente propiedad:
      
      DATOS:
      Tipo: ${propertyInfo.type}
      Ubicación: ${propertyInfo.location}
      Metros Cuadrados: ${propertyInfo.sqm} m2
      Ambientes: ${propertyInfo.rooms}
      Estado: ${propertyInfo.condition}
      Detalles extra: ${propertyInfo.extra || "Ninguno"}

      OBJETIVO:
      Proporcionar un rango de precio de mercado realista y un precio sugerido de publicación.
      
      RESPONDE ÚNICAMENTE EN FORMATO JSON:
      {
        "estimated_value_range": { "min": 0, "max": 0 },
        "suggested_price": 0,
        "price_per_sqm": 0,
        "market_analysis": "Análisis detallado de la zona y mercado actual",
        "comparable_traits": "Características similares valoradas hoy",
        "confidence_score": 0.85,
        "disclaimer": "Esta es una estimación generada por IA y no reemplaza la visita técnica de un profesional."
      }
    `

    const aiResult = await prismaIA.generateContent(prompt)
    const analysis = JSON.parse(aiResult.response.text().replace(/```json|```/g, "").trim())

    // Update in DB
    const { data: valuation, error } = await supabase
      .from("valuations")
      .insert({
        agency_id: propertyInfo.agency_id,
        property_type: propertyInfo.type,
        location: propertyInfo.location,
        sqm: propertyInfo.sqm,
        result_data: analysis,
        status: "completed"
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(valuation)

  } catch (err) {
    console.error("Valuation Error:", err)
    return NextResponse.json({ error: "Error interno al generar tasación" }, { status: 500 })
  }
}
