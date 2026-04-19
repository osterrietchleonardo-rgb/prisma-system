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
    console.log("Generando embedding para texto de longitud:", cleanText.length);
    const embeddingArray = await generateEmbedding(cleanText);
    
    if (!embeddingArray || !Array.isArray(embeddingArray)) {
      throw new Error("La API de Google no devolvió un vector válido");
    }

    // Convert array to pgvector string format: "[0.1, 0.2, ...]"
    const vectorString = `[${embeddingArray.join(',')}]`;

    console.log("Actualizando Supabase para ID:", settingId);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("whatsapp_ai_settings")
      .update({
        knowledge_text: cleanText,
        knowledge_embedding: vectorString,
        updated_at: new Date().toISOString()
      })
      .eq("id", settingId)
      .select();

    if (error) {
      console.error("Supabase Update Error:", error);
      throw error;
    }

    console.log("Resultado Supabase:", data);

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
