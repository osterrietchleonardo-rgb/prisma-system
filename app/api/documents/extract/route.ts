import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { rateLimit, LIMITS } from "@/lib/rate-limiter"

export async function POST(req: NextRequest) {
  const supabase = createClient()
  
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    // Rate Limiting (10 req/hora por userId)
    const rl = await rateLimit(session.user.id, LIMITS.DOCUMENTS)
    if (!rl.success) {
      return NextResponse.json({ error: rl.errorMessage }, { status: 429 })
    }

    const formData = await req.formData()
    const file = formData.get("file") as File
    
    if (!file) {
      return NextResponse.json({ error: "No se proporcionó ningún archivo" }, { status: 400 })
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "Solo se permiten archivos PDF" }, { status: 400 })
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      return NextResponse.json({ error: "El archivo es demasiado grande (máximo 10MB)" }, { status: 400 })
    }

    // Placeholder for PDF extraction results
    return NextResponse.json({ 
      text: `[CONTENIDO DEL PDF: ${file.name}] - El motor de extracción se activará tras la estabilización del build de producción.`,
      pages: 1,
      info: { Title: file.name }
    })

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("PDF Extraction Error:", message)
    return NextResponse.json({ error: "Error interno al extraer texto del PDF" }, { status: 500 })
  }
}
