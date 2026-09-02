import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { consumeAiCredits, requireTenant, updateAiTransactionCost } from "@/lib/auth/tenant-validation"
import { calculateCost, tokensFromUsage } from "@/utils/aiCostCalculator"
import { generateEmbedding } from "@/lib/gemini"
import { openaiIA } from "@/lib/openai"

export const dynamic = "force-dynamic";

type EventoTutor =
  | { tipo: "paso"; texto: string }
  | { tipo: "delta"; texto: string }
  | { tipo: "final"; [k: string]: unknown }
  | { tipo: "error"; error: string }

export async function POST(req: NextRequest) {
  const body = await req.json()

  // Modo clásico (sin stream): exactamente la respuesta JSON de siempre.
  if (!body.stream) {
    try {
      return NextResponse.json(await procesarTutor(body, () => {}))
    } catch (error: any) {
      console.error("Tutor IA API Error:", error)
      return NextResponse.json({ error: error.message || "Error interno" }, { status: 500 })
    }
  }

  // Modo en vivo: NDJSON — pasos, texto a medida que se escribe, y el final.
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const emitir = (e: EventoTutor) => {
        try { controller.enqueue(encoder.encode(JSON.stringify(e) + "\n")) } catch { /* cliente cortó */ }
      }
      try {
        emitir({ tipo: "final", ...(await procesarTutor(body, emitir)) })
      } catch (error: any) {
        console.error("Tutor IA API Error (stream):", error)
        emitir({ tipo: "error", error: error?.message ?? String(error) })
      } finally {
        try { controller.close() } catch { /* ya cerrado */ }
      }
    },
  })
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" },
  })
}

async function procesarTutor(
  entrada: { message: string; history?: unknown[]; sessionId?: string | null; stream?: boolean },
  emitir: (e: EventoTutor) => void,
) {
  const supabase = createClient()

  {
    const { userId, agencyId, role } = await requireTenant();

    const { message, history, sessionId } = entrada
    const enVivo = Boolean(entrada.stream)

    // Consume credits before processing (returns transaction ID for real-cost tracking)
    const txId = await consumeAiCredits("tutor_ia", 1, `Tutor Message: ${message.substring(0, 50)}`);

    // 2. Session Management
    let currentSessionId = sessionId
    if (!currentSessionId) {
      const { data: newSession, error: sessionError } = await supabase
        .from("tutor_chat_sessions")
        .insert({
          user_id: userId,
          agency_id: agencyId,
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

    emitir({ tipo: "paso", texto: "Leyendo tu pregunta…" })
    const intentCheck = await openaiIA.generateContent({
      contents: [{ role: "user", parts: [{ text: intentAnalysisPrompt }] }]
    })
    const isRetrieval = intentCheck.response.text().toUpperCase().includes("RETRIEVAL")

    let context = ""
    let documents = []

    if (isRetrieval) {
      emitir({ tipo: "paso", texto: "Buscando en los manuales y documentos de tu agencia…" })
      const queryEmbedding = await generateEmbedding(message)
      const { data: dbDocs, error: rpcError } = await supabase.rpc("match_agency_documents", {
        query_embedding: queryEmbedding,
        match_threshold: 0.15, // Un poco más estricto pero efectivo
        match_count: 5,
        p_agency_id: agencyId,
        p_user_role: role
      })

      if (!rpcError && dbDocs) {
        documents = dbDocs
        context = dbDocs.map((d: any) => `[FUENTE: ${d.title}] (Tipo: ${d.type})\n${d.content_text}`).join("\n\n---\n\n")
      }
    }

    // 5. Generate Response with Gemini
    const systemPrompt = `Eres el "Tutor de PRISMA", un mentor experto y corporativo para el equipo de una inmobiliaria en Argentina. 
    Tu objetivo es ayudar a los asesores y directores a entender sus procesos, manuales y herramientas basándote en la información que han subido.

    TU PERSONALIDAD Y TONO:
    - Sos un mentor con experiencia real en inmobiliarias: cercano, claro y con ganas de que la persona aprenda. Voseo rioplatense natural ("mirá", "tenés", "dale"), cálido sin perder precisión.
    - REACCIONÁ a lo que te cuentan antes de explicar: si alguien dice "me trabé con esto" o "es mi primera semana", acusá recibo en media frase — que se note que escuchaste — y recién ahí andá al contenido.
    - VARIÁ la forma: no empieces dos respuestas seguidas igual ni cierres siempre con la misma fórmula. A veces cerrás con una pregunta para chequear que se entendió, a veces con un ejemplo, a veces con nada.
    - Explicá como se explica en persona: primero la idea en una frase simple, después el detalle. Viñetas solo cuando de verdad ordenan.
    - Tenés iniciativa: si notás dudas, ofrecé profundizar o tomar una mini-evaluación — con tus palabras, no siempre la misma frase.
    - Frases PROHIBIDAS por robóticas: "¡Claro!", "Por supuesto", "¿En qué más puedo ayudarte?", "No dudes en", "Estoy aquí para", "Como asistente".
    
    MANEJO DEL CONOCIMIENTO:
    - SOLO si hay información en la "BASE DE CONOCIMIENTO" de abajo, usala como fuente principal.
    - Si no hay información específica sobre la agencia en el contexto, explica que "En la documentación actual no se encuentra esta información de forma explícita", pero aporta según tu conocimiento general del rubro inmobiliario.
    - NUNCA inventes nombres de departamentos o personas que no estén en el contexto.

    BASE DE CONOCIMIENTO (CONTEXTO):
    ${context ? context : 'No se encontró información específica de la agencia para esta consulta. Responde de forma general y profesional.'}

    REGLAS CLAVE:
    - No uses frases cliché de bots como "Como modelo de lenguaje...".
    - Usa viñetas y formato claro para explicaciones largas.
    - Sé proactivo. Ejemplo: "Noté que esta información está en el manual de ingresos. ¿Deseas que repasemos los puntos clave o prefieres una breve evaluación al respecto?"
    - Si el usuario te pide que lo evalúes ("handleEvaluate"), haz preguntas directas y profesionales sobre los procesos.`;

    const chatHistory = (history || []).map((m: any) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }]
    }))

    emitir({ tipo: "paso", texto: "Escribiendo la respuesta…" })
    const contenidos = {
      contents: [
        { role: "user", parts: [{ text: systemPrompt }] },
        ...chatHistory,
        { role: "user", parts: [{ text: message }] }
      ]
    }
    // En vivo, el texto va saliendo al chat a medida que el modelo lo escribe.
    const result = enVivo
      ? await openaiIA.generateContentStream(contenidos, (delta) => emitir({ tipo: "delta", texto: delta }))
      : await openaiIA.generateContent(contenidos)

    const responseText = result.response.text()

    // ─── Record real token usage (input + output) ──────────────────────────
    // openaiIA usa GPT-5.4-mini. Precio desde la tabla central (utils/aiCostCalculator).
    const tutor_usage = result.response.usageMetadata;
    if (tutor_usage) {
      const { inputTokens: inputTk, outputTokens: outputTk } = tokensFromUsage(tutor_usage);
      const { totalCostUSD } = calculateCost({ model: "gpt-5.4-mini", inputTokens: inputTk, outputTokens: outputTk });
      updateAiTransactionCost(txId, inputTk, outputTk, totalCostUSD);
    }

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

    return {
      text: responseText,
      reply: responseText, // Added for compatibility with ChatInterface
      sources: documents.map((d: any) => ({ title: d.title, type: d.type, similarity: d.similarity })),
      sessionId: currentSessionId,
    }
  }
}

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get("sessionId")

  try {
    const { userId } = await requireTenant();

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
      // Get all sessions for the current user
      const { data: sessions, error } = await supabase
        .from("tutor_chat_sessions")
        .select("*")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })

      if (error) throw error
      return NextResponse.json({ sessions })
    }

  } catch (error: any) {
    console.error("Tutor IA GET Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const supabase = createClient()
  try {
    const { userId } = await requireTenant();

    const { sessionId, title } = await req.json()
    if (!sessionId || !title) return NextResponse.json({ error: "Faltan datos" }, { status: 400 })

    const { error } = await supabase
      .from("tutor_chat_sessions")
      .update({ title })
      .eq("id", sessionId)
      .eq("user_id", userId)

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
    const { userId } = await requireTenant();

    if (!sessionId) return NextResponse.json({ error: "Faltan datos" }, { status: 400 })

    const { error } = await supabase
      .from("tutor_chat_sessions")
      .delete()
      .eq("id", sessionId)
      .eq("user_id", userId)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
