import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { generateEmbedding, extractTextFromDocument } from "@/lib/gemini"
import { consumeAiCredits, updateAiTransactionCost } from "@/lib/auth/tenant-validation"
import { YoutubeTranscript } from "youtube-transcript"
import mammoth from "mammoth"
import Papa from "papaparse"

export async function POST(req: NextRequest) {
  const supabase = createClient()
  
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const contentType = req.headers.get("content-type") || ""
    
    let title = ""
    let visibility = "asesor"
    let contentText = ""
    let fileUrl = ""
    let videoUrl = ""
    let type = "document"
    let folderId: string | null = null

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData()
      const file = formData.get("file") as File
      title = formData.get("title") as string
      visibility = formData.get("visibility") as string || "asesor"
      const agencyId = formData.get("agencyId") as string
      folderId = formData.get("folder_id") as string || null

      if (!file || !agencyId) {
        return NextResponse.json({ error: "Faltan datos requeridos" }, { status: 400 })
      }

      // 1. Upload to Storage
      const fileName = `${agencyId}/${Date.now()}-${file.name}`
      const { data: storageData, error: storageError } = await supabase.storage
        .from("documents")
        .upload(fileName, file)

      if (storageError) throw storageError
      fileUrl = storageData.path

      // 2. Extract Text
      const buffer = Buffer.from(await file.arrayBuffer())
      
      if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        const result = await mammoth.extractRawText({ buffer })
        contentText = result.value
      } else if (file.type === "text/csv") {
        const text = buffer.toString("utf-8")
        const parsed = Papa.parse(text, { header: true })
        contentText = JSON.stringify(parsed.data)
      } else {
        // Use Gemini for PDF, images, etc.
        contentText = await extractTextFromDocument(buffer, file.type)
      }
      
      type = "file"

    } else {
      const body = await req.json()
      videoUrl = body.youtubeUrl
      title = body.title
      visibility = body.visibility || "asesor"
      const agencyId = body.agencyId
      folderId = body.folder_id || null

      if (!videoUrl || !agencyId) {
        return NextResponse.json({ error: "Faltan datos requeridos" }, { status: 400 })
      }

      // 1. Get YouTube Transcript
      try {
        const transcriptItems = await YoutubeTranscript.fetchTranscript(videoUrl)
        contentText = transcriptItems.map(i => i.text).join(" ")
      } catch (err) {
        console.error("YouTube Transcript Error:", err)
        contentText = "No se pudo obtener la transcripción automáticamente. El contenido se analizará mediante metadatos."
      }
      type = "youtube"
    }

    // 3. Generate Embedding
    // ─── Embeddings: API solo cobra Input. Output = $0 (resultado son vectores, no texto)
    // gemini-embedding-001: $0.02/M input tokens
    const textForEmbedding = contentText.substring(0, 5000);
    const embeddingInputTokens = Math.ceil(textForEmbedding.length / 4); // est. ~4 chars/token
    const embeddingUsd = (embeddingInputTokens / 1_000_000) * 0.02;

    // Consume credit + get txId for documents_ia feature
    const txId = await consumeAiCredits("documentos_ia", 1, `Embed: ${title.substring(0, 50)}`);
    const embedding = await generateEmbedding(textForEmbedding);
    updateAiTransactionCost(txId, embeddingInputTokens, 0, embeddingUsd); // fire-and-forget

    // 4. Save to DB
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from("profiles").select("agency_id").eq("id", user?.id).single()

    const { error: dbError } = await supabase
      .from("agency_documents")
      .insert({
        agency_id: profile?.agency_id,
        uploaded_by: user?.id,
        title,
        type,
        file_url: fileUrl,
        video_url: videoUrl,
        content_text: contentText,
        embedding: embedding,
        visibility: visibility,
        folder_id: folderId,
        processing_status: "completed"
      })

    if (dbError) throw dbError

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error("Processing Error Details:", {
      message: error.message,
      stack: error.stack,
      error
    })
    return NextResponse.json({ 
      error: error.message || "Error interno",
      details: error.toString()
    }, { status: 500 })
  }
}
