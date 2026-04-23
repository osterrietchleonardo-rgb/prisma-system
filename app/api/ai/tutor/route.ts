import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { generateEmbedding } from "@/lib/gemini"
import { openaiIA } from "@/lib/openai"

export const dynamic = "force-dynamic";

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
    const intentAnalysisPrompt = `Analiza el mensaje del usuario y determina su intención.
    
    MENSAJE: "${message}"
    
    INTENCIONES POSIBLES:
    - 'RETRIEVAL': El usuario hace una pregunta técnica, busca información sobre procesos, documentos, manuales o videos de la inmobiliaria.
    - 'GENERAL': Es un saludo, una charla casual, un agradecimiento, una broma o una despedida. No requiere buscar en documentos.
    
    Responde ÚNICAMENTE con la palabra de la intención.`;

    const intentCheck = await openaiIA.generateContent({
      contents: [{ role: "user", parts: [{ text: intentAnalysisPrompt }] }]
    })
    const isRetrieval = intentCheck.response.text().toUpperCase().includes("RETRIEVAL")

    let context = ""
    let documents = []

    if (isRetrieval) {
      const queryEmbedding = await generateEmbedding(message)
      const { data: dbDocs, error: rpcError } = await supabase.rpc("match_agency_documents", {
        query_embedding: queryEmbedding,
        match_threshold: 0.15, // Un poco más estricto pero efectivo
        match_count: 5,
        p_agency_id: profile.agency_id
      })

      if (!rpcError && dbDocs) {
        documents = dbDocs
        context = dbDocs.map((d: any) => `[FUENTE: ${d.title}] (Tipo: ${d.type})\n${d.content_text}`).join("\n\n---\n\n")
      }
    }

    // 5. Generate Response with Gemini
    const systemPrompt = `Eres el "Tutor de PRISMA", un mentor experto y mano derecha para el equipo de una inmobiliaria en Argentina. 
    Tu objetivo es ayudar a los asesores y directores a entender sus procesos, manuales y herramientas basándote en la información que han subido.

    TU PERSONALIDAD Y TONO:
    - Hablás en español rioplatense (voseo: "che", "mirá", "tenés", "viste").
    - Sos un colega copado, experto y con mucha cancha. No sos un bot rígido.
    - Si te saludan, respondé con onda. Si te preguntan algo técnico, sé preciso pero explicá como si estuvieras tomando un café con alguien.
    - Tenés iniciativa. Si ves que el usuario tiene dudas, ofrecé evaluarlo o explicarle algo relacionado.
    
    MANEJO DEL CONOCIMIENTO:
    - SOLO si hay información en la "BASE DE CONOCIMIENTO" de abajo, usala como fuente principal.
    - Si no hay información específica sobre la agencia en el contexto, explicá que "en los manuales de la agencia no encontré eso específicamente", pero aportá según tu conocimiento general del rubro inmobiliario en Argentina.
    - NUNCA inventes nombres de departamentos o personas que no estén en el contexto.

    BASE DE CONOCIMIENTO (CONTEXTO):
    ${context ? context : 'No se encontró información específica de la agencia para esta consulta. Respondé de forma general y profesional.'}

    REGLAS CLAVE:
    - No uses frases robóticas tipo "Según los documentos proporcionados...".
    - Usá un estilo fluido. 
    - Sé proactivo. Ejemplo: "Che, mirá que en el manual de ingresos dice que... ¿Querés que repasemos eso o preferís que te tome una pruebita?"
    - Si el usuario te pide que lo evalúes ("handleEvaluate"), hacé preguntas directas y desafiantes sobre los procesos.`;

    const chatHistory = (history || []).map((m: any) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }]
    }))

    const result = await openaiIA.generateContent({
      contents: [
        { role: "user", parts: [{ text: systemPrompt }] },
        ...chatHistory,
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

    // 7. Topic Summarization (Asynchronous)
    const historyCount = (history || []).length
    if (historyCount === 0 || (historyCount + 1) % 4 === 0) {
      // Background promise to not block the main response
      (async () => {
        try {
          const summaryPrompt = `Resume este chat en un título (máx 22 carac.) y un resumen corto (1 frase). 
          Responde SOLO JSON: {"title": "...", "summary": "..."}
          Chat: "${message}" - Assistant: "${responseText.substring(0, 100)}"`;
          const summaryRes = await openaiIA.generateContent(summaryPrompt);
          const rawText = summaryRes.response.text().trim();
          const cleanJson = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
          const { title, summary } = JSON.parse(cleanJson);
          
          await supabase.from("tutor_chat_sessions").update({ title, summary }).eq("id", currentSessionId);
        } catch (e) {
          console.error("Async Summary Error:", e);
        }
      })();
    }

    return NextResponse.json({ 
      text: responseText,
      reply: responseText, // Added for compatibility with ChatInterface
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
