import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { generateEmbedding, prismaIA } from "@/lib/gemini"

export async function POST(req: NextRequest) {
  const supabase = createClient()
  
  try {
    const { data: { session: authSession } } = await supabase.auth.getSession()
    if (!authSession) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { message, history, sessionId } = await req.json()
    
    // 1. Get Agency ID
    const { data: profile } = await supabase.from("profiles").select("agency_id, role").eq("id", authSession.user.id).single()
    if (!profile?.agency_id) return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 })

    // 2. Session Management
    let currentSessionId = sessionId
    if (!currentSessionId) {
      const { data: newSession, error: sessionError } = await supabase
        .from("tutor_chat_sessions")
        .insert({
          user_id: authSession.user.id,
          agency_id: profile.agency_id,
          title: "Nueva Conversación"
        })
        .select()
        .single()
      
      if (sessionError) throw sessionError
      currentSessionId = newSession.id
    }

    // 3. Save User Message
    await supabase.from("tutor_chat_messages").insert({
      session_id: currentSessionId,
      role: "user",
      content: message
    })

    // 4. Intent Analysis: Should we fetch from knowledge base?
    const intentCheck = await prismaIA.generateContent({
      contents: [{ 
        role: "user", 
        parts: [{ text: `Analiza si el siguiente mensaje requiere buscar información específica en documentos técnicos o si es una charla general (saludo, agradecimiento, charla casual). 
        Responde SOLO con una palabra: 'RETRIEVAL' o 'GENERAL'.
        Mensaje: "${message}"` }]
      }]
    })
    const isRetrieval = intentCheck.response.text().includes("RETRIEVAL")

    let context = ""
    let documents = []

    if (isRetrieval) {
      const queryEmbedding = await generateEmbedding(message)
      const { data: dbDocs, error: rpcError } = await supabase.rpc("match_agency_documents", {
        query_embedding: queryEmbedding,
        match_threshold: 0.1,
        match_count: 5,
        p_agency_id: profile.agency_id
      })

      if (!rpcError && dbDocs) {
        documents = dbDocs
        context = dbDocs.map((d: any) => `[FUENTE: ${d.title}] (Tipo: ${d.type})\n${d.content_text}`).join("\n\n---\n\n")
      }
    }

    // 5. Generate Response with Gemini
    const systemPrompt = `Eres el "Tutor IA" de PRISMA, un asistente inteligente y mentor experto para directores de agencias inmobiliarias en Argentina.

TU PERSONALIDAD:
- Eres carismático, profesional y conversacional. 
- No actúas como un motor de búsqueda, sino como un colega experto.
- Saludas cálidamente, puedes bromear sanamente sobre el mercado y mantienes el hilo de la conversación.

INSTRUCCIONES DE USO DEL CONOCIMIENTO:
- SOLO si tienes información en la "BASE DE CONOCIMIENTO" de abajo, úsala para responder.
- Si la información es general del rubro, responde con tu experiencia sin inventar datos de la agencia.
- Si el contexto es vacío, responde de forma natural a la charla del usuario.

${context ? `BASE DE CONOCIMIENTO:\n${context}` : 'No se ha proporcionado contexto específico para este mensaje.'}

REGLAS DE ORO:
- Responde en español de Argentina.
- No uses prefijos robóticos como "Basándome en lo que encontré...". Di algo como "Che, estuve viendo el manual que subiste y dice que..." o "Mirá, sobre ese tema no tenemos nada en los archivos, pero por lo general se maneja así...".
- Mantén las respuestas fluidas.`;

    const result = await prismaIA.generateContent({
      contents: [
        { role: "user", parts: [{ text: systemPrompt }] },
        ...(history || []).map((m: any) => ({
          role: m.role === "user" ? "user" : "model",
          parts: [{ text: m.content }]
        })),
        { role: "user", parts: [{ text: message }] }
      ]
    })

    const responseText = result.response.text()

    // 6. Save Assistant Message
    await supabase.from("tutor_chat_messages").insert({
      session_id: currentSessionId,
      role: "assistant",
      content: responseText,
      metadata: { sources: documents.map((d: any) => ({ title: d.title, type: d.type })) }
    })

    // 7. Topic Summarization & Analytics (Strict Title Generation)
    const historyCount = (history || []).length
    if (historyCount === 0 || historyCount % 5 === 0) {
      const summaryPrompt = `Analiza este fragmento de chat y define un Título (tema principal) y un Resumen corto.
      IMPORTANTE: El título debe tener MÁXIMO 20 caracteres.
      Responde ÚNICAMENTE con el objeto JSON, sin Markdown ni explicaciones.
      Formato: { "title": "...", "summary": "..." }

      Chat:
      User: ${message}
      Assistant: ${responseText.substring(0, 500)}...`;

      try {
        const summaryResult = await prismaIA.generateContent(summaryPrompt);
        const summaryTextRaw = summaryResult.response.text().trim();
        // Remove potential markdown blocks
        const cleanedJson = summaryTextRaw.replace(/```json/g, "").replace(/```/g, "").trim();
        console.log("Tutor IA Summary Candidate:", cleanedJson);
        const summaryData = JSON.parse(cleanedJson);
        
        if (summaryData.title) {
          const { error: updateError } = await supabase
            .from("tutor_chat_sessions")
            .update({
              title: summaryData.title,
              summary: summaryData.summary || ""
            })
            .eq("id", currentSessionId);
          
          if (updateError) console.error("Database Update Error (Title):", updateError);
          else console.log("Tutor IA Title Updated:", summaryData.title);
        }
      } catch (e) {
        console.error("Error parsing or updating session summary:", e);
      }
    }

    return NextResponse.json({ 
      text: responseText,
      sources: documents.map((d: any) => ({ title: d.title, type: d.type, similarity: d.similarity })),
      sessionId: currentSessionId
    })

  } catch (error: any) {
    console.error("Tutor IA API Error:", error)
    return NextResponse.json({ error: error.message || "Error interno" }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get("sessionId")

  try {
    const { data: { session: authSession } } = await supabase.auth.getSession()
    if (!authSession) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    if (sessionId) {
      // Get messages for a session
      const { data: messages, error } = await supabase
        .from("tutor_chat_messages")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true })

      if (error) throw error
      return NextResponse.json({ messages })
    } else {
      // Get all sessions
      const { data: sessions, error } = await supabase
        .from("tutor_chat_sessions")
        .select("*")
        .eq("user_id", authSession.user.id)
        .order("updated_at", { ascending: false })

      if (error) throw error
      return NextResponse.json({ sessions })
    }

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const supabase = createClient()
  try {
    const { data: { session: authSession } } = await supabase.auth.getSession()
    if (!authSession) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { sessionId, title } = await req.json()
    if (!sessionId || !title) return NextResponse.json({ error: "Faltan datos" }, { status: 400 })

    const { error } = await supabase
      .from("tutor_chat_sessions")
      .update({ title })
      .eq("id", sessionId)
      .eq("user_id", authSession.user.id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const supabase = createClient()
  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get("sessionId")

  try {
    const { data: { session: authSession } } = await supabase.auth.getSession()
    if (!authSession) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    if (!sessionId) return NextResponse.json({ error: "Faltan datos" }, { status: 400 })

    const { error } = await supabase
      .from("tutor_chat_sessions")
      .delete()
      .eq("id", sessionId)
      .eq("user_id", authSession.user.id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
