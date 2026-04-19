import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";
import mammoth from "mammoth";
import { generateEmbedding } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const settingId = formData.get("settingId") as string;

    if (!file || !settingId) {
      return NextResponse.json({ error: "Archivo o ID de configuración faltante" }, { status: 400 });
    }

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extract text from DOCX
    const { value: text } = await mammoth.extractRawText({ buffer });
    
    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: "No se pudo extraer texto del documento" }, { status: 400 });
    }

    // Clean text (basic)
    const cleanText = text.replace(/\s+/g, ' ').trim();

    // Generate Embedding using Gemini (768 dimensions)
    // For now, we embed the whole text or a major part since it's typically a small business profile
    // If it's too large, we should chunk it, but the user asked for "en una columna"
    const embedding = await generateEmbedding(cleanText);

    const supabase = createClient();
    const { error } = await supabase
      .from("whatsapp_ai_settings")
      .update({
        knowledge_text: cleanText,
        knowledge_embedding: embedding,
        updated_at: new Date().toISOString()
      })
      .eq("id", settingId);

    if (error) throw error;

    return NextResponse.json({ 
      success: true, 
      message: "Conocimiento actualizado correctamente",
      size: cleanText.length 
    });

  } catch (error: any) {
    console.error("Knowledge Upload Error:", error);
    return NextResponse.json({ error: error.message || "Error al procesar el documento" }, { status: 500 });
  }
}
