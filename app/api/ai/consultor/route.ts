import { createClient } from "@/lib/supabase/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { generateEmbedding } from "@/lib/gemini";
import { openaiIA } from "@/lib/openai";
import { NextResponse } from "next/server";
import { consumeAiCredits, requireTenant, updateAiTransactionCost } from "@/lib/auth/tenant-validation";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { message, sessionId, history } = await req.json();
    const { userId, agencyId } = await requireTenant();
    console.log("Consultor IA Request:", { message, sessionId, agencyId });
    const supabase = await createClient();

    // Consume credits before starting processing (returns txId for real cost tracking)
    const txId = await consumeAiCredits("consultor_ia", 1, `Consultor: ${message.substring(0, 50)}`);

    // 2. Manage Session
    let currentSessionId = sessionId;
    if (!currentSessionId) {
      const { data: session } = await supabase
        .from('consultor_chat_sessions')
        .insert({ user_id: userId, agency_id: agencyId })
        .select()
        .single();
      currentSessionId = session.id;
    }

    // 3. Save User Message
    await supabase
      .from('consultor_chat_messages')
      .insert({ session_id: currentSessionId, role: 'user', content: message });

    // 4. Intent Analysis: Is it property search or general chat?
    const intentCheck = await openaiIA.generateContent({
      contents: [{ 
        role: "user", 
        parts: [{ text: `Analiza el mensaje del usuario. Determina si requiere buscar propiedades en la base de datos ('RETRIEVAL') o es una charla general ('GENERAL').
        Si es RETRIEVAL, extrae las palabras clave de búsqueda (ej: barrios, ciudades, "departamento", "piso", "casa", "alquiler", "venta").
        Responde ÚNICAMENTE con un JSON con este formato exacto: {"intent": "RETRIEVAL" | "GENERAL", "keywords": ["palabra1", "palabra2"]}
        Mensaje: "${message}"` }]
      }]
    });
    
    const intentResText = intentCheck.response.text().replace(/```json|```/g, "").trim();
    let isRetrieval = false;
    let searchKeywords: string[] = [];
    try {
        const parsed = JSON.parse(intentResText);
        isRetrieval = parsed.intent === 'RETRIEVAL';
        searchKeywords = parsed.keywords || [];
    } catch(e) {
        isRetrieval = intentResText.toUpperCase().includes("RETRIEVAL");
    }

    let newMatchedProperties = [];
    let propertyContext = "";

    if (isRetrieval) {
      console.log("Generating embedding for search...");
      const queryEmbedding = await generateEmbedding(message);
      
      const { data: sessionData } = await supabase
        .from('consultor_chat_sessions')
        .select('metadata')
        .eq('id', currentSessionId)
        .single();
      const seenIds = (sessionData?.metadata as any)?.seen_property_ids || [];

      console.log("Querying Supabase match_properties RPC (Vector Search)...");
      const { data: matchedProperties, error: rpcError } = await supabase.rpc('match_properties', {
        query_embedding: queryEmbedding,
        match_threshold: 0.15, // Bajamos el threshold para traer más
        match_count: 20, // Subimos el límite
        p_agency_id: agencyId
      });

      if (rpcError) {
        console.error("RPC Error:", rpcError);
      }

      console.log("Querying Supabase Full Text Search (Fallback)...");
      let textMatchedProperties: any[] = [];
      const validKeywords = searchKeywords.filter(k => k.length > 2);
      if (validKeywords.length > 0) {
        let query = supabase.from('properties')
          .select('id, title, address, property_type, price, currency, bedrooms')
          .eq('agency_id', agencyId);
        
        const orConditions = validKeywords.map(k => `address.ilike.%${k}%,title.ilike.%${k}%,property_type.ilike.%${k}%`).join(',');
        const { data: keywordProps } = await query.or(orConditions).limit(20);
        if (keywordProps) textMatchedProperties = keywordProps;
      }

      // Merge and deduplicate
      const allPropsMap = new Map();
      (matchedProperties || []).forEach((p: any) => allPropsMap.set(p.id, p));
      textMatchedProperties.forEach((p: any) => {
        if (!allPropsMap.has(p.id)) {
            // Assign a fake similarity score so text matches don't get buried
            allPropsMap.set(p.id, { ...p, similarity: 0.5 });
        }
      });
      
      const allProperties = Array.from(allPropsMap.values());
      const filteredProperties = allProperties.filter((p: any) => !seenIds.includes(p.id));
      
      // Re-rank based on explicit keyword hits
      const rerankedProperties = filteredProperties.sort((a: any, b: any) => {
        const aScore = validKeywords.filter((t: string) => a.address?.toLowerCase().includes(t.toLowerCase()) || a.title?.toLowerCase().includes(t.toLowerCase()) || a.property_type?.toLowerCase().includes(t.toLowerCase())).length;
        const bScore = validKeywords.filter((t: string) => b.address?.toLowerCase().includes(t.toLowerCase()) || b.title?.toLowerCase().includes(t.toLowerCase()) || b.property_type?.toLowerCase().includes(t.toLowerCase())).length;
        if (aScore !== bScore) return bScore - aScore;
        return (b.similarity || 0) - (a.similarity || 0);
      });
      
      newMatchedProperties = rerankedProperties.slice(0, 10); // Return up to 10 as requested
      
      // Update metadata
      const updatedSeenIds = Array.from(new Set([...seenIds, ...newMatchedProperties.map((p: any) => p.id)]));
      await supabase
        .from('consultor_chat_sessions')
        .update({ 
          metadata: { seen_property_ids: updatedSeenIds },
          updated_at: new Date().toISOString()
        })
        .eq('id', currentSessionId);

      propertyContext = newMatchedProperties.length > 0
        ? newMatchedProperties.map((p: any) => {
            const agentName = p.assigned_agent?.name || "Sin asignar";
            return `- ID: ${p.id}, Titulo: ${p.title}, Tipo: ${p.property_type}, Precio: ${p.currency} ${p.price}, Direccion: ${p.address}, Dormitorios: ${p.bedrooms}, Agente: ${agentName}`;
          }).join('\n')
        : "No se encontraron nuevas propiedades coincidiendo exactamente. Informa esto amablemente y sugiere alternativas.";
    }

    // 5. Generate Assistant Response with Context & History
    const systemPrompt = `Eres el "Consultor IA" de la inmobiliaria PRISMA. Tu misión es ser el asistente ejecutivo corporativo para encontrar propiedades en la cartera de la agencia.
    
    PERSONALIDAD Y TONO:
    - Eres un consultor inmobiliario experto, formal y altamente profesional. Utilizas español de Argentina con respeto y seriedad (voseo formal).
    - Evita por completo coloquialismos ("che", "dale", "mirá", "onda"). Mantén una postura corporativa.
    - Tienes iniciativa ejecutiva. Si el usuario realiza una solicitud vaga, solicita con cortesía los detalles técnicos necesarios (zona, presupuesto, tipo de propiedad).
    - Utiliza introducciones formales como "He revisado la cartera de propiedades y he encontrado las siguientes opciones:" o "Para poder brindarte una mejor recomendación, por favor detalla...".

    INSTRUCCIONES DE USO:
    - Solo si el sistema te proporciona "PROPIEDADES ENCONTRADAS", utilízalas para tus recomendaciones.
    - Si no hay propiedades que coincidan en el contexto, informa cordialmente que actualmente no hay disponibilidad exacta y sugiere alternativas o ampliar los parámetros de búsqueda.
    - Mantén respuestas estructuradas, precisas y enfocadas en los negocios.

    ${isRetrieval ? `PROPIEDADES ENCONTRADAS:\n${propertyContext}` : 'Charla General: No se requiere búsqueda en este turno.'}
    
    Responde SIEMPRE con un nivel ejecutivo en español de Argentina.`;


    const chatResult = await openaiIA.generateContent({
      contents: [
        { role: 'user', parts: [{ text: systemPrompt }] },
        ...(history || []).map((m: any) => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.content }]
        })),
        { role: 'user', parts: [{ text: message }] }
      ]
    });

    const assistantContent = chatResult.response.text();

    // ─── Record real token usage (input + output) ─────────────────────────
    // openaiIA usa GPT-4.1-mini: $0.40/M input, $1.60/M output
    const consultor_usage = chatResult.response.usageMetadata;
    if (consultor_usage) {
      const inputTk = consultor_usage.promptTokenCount ?? 0;
      const outputTk = consultor_usage.candidatesTokenCount ?? 0;
      const usd = (inputTk / 1_000_000) * 0.40 + (outputTk / 1_000_000) * 1.60;
      updateAiTransactionCost(txId, inputTk, outputTk, usd);
    }

    // 6. Save Assistant Message with Metadata
    await supabase
      .from('consultor_chat_messages')
      .insert({ 
        session_id: currentSessionId, 
        role: 'assistant', 
        content: assistantContent,
        metadata: { matchedProperties: newMatchedProperties }
      });

    // 8. Background Analytics (Update title and summary)
    const { data: messages } = await supabase
      .from('consultor_chat_messages')
      .select('content, role')
      .eq('session_id', currentSessionId)
      .order('created_at', { ascending: true });

    const historyStr = messages?.map(m => `${m.role}: ${m.content}`).join('\n');
    
    // Non-blocking update
    (async () => {
      try {
        const analysisPrompt = `Analiza la conversación y devuelve un resumen JSON breve con:
        "title": un título de MÁXIMO 20 caracteres sobre la búsqueda.
        "summary": un resumen de los requerimientos del director (ej: "Busca oficinas en Palermo por menos de 200k").
        
        Conversación:
        ${historyStr}`;
        
        const analysisResult = await openaiIA.generateContent(analysisPrompt);
        const jsonStr = analysisResult.response.text().replace(/```json|```/g, "").trim();
        const analysis = JSON.parse(jsonStr);
        
        await supabase
          .from('consultor_chat_sessions')
          .update({ title: analysis.title, summary: analysis.summary })
          .eq('id', currentSessionId);
      } catch (err) {
        console.error("Analysis background error:", err);
      }
    })();

    return NextResponse.json({ 
      content: assistantContent, 
      reply: assistantContent, // Added for compatibility with Asesor frontend
      sessionId: currentSessionId,
      matchedProperties: newMatchedProperties 
    });

  } catch (error: any) {
    console.error("Consultor API error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('sessionId');
  const agencyId = searchParams.get('agencyId');
  const supabase = await createClient();

  if (sessionId) {
    const { data: messages } = await supabase
      .from('consultor_chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });
    return NextResponse.json(messages);
  }

  try {
    const { userId, agencyId: authAgencyId } = await requireTenant();

    const { data: sessions } = await supabase
      .from('consultor_chat_sessions')
      .select('*')
      .eq('agency_id', agencyId || authAgencyId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false }); // Usamos created_at como fallback más seguro

    return NextResponse.json(sessions);
  } catch (error: any) {
    console.error("Error fetching sessions:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('sessionId');
  if (!sessionId) return NextResponse.json({ error: "SessionId required" }, { status: 400 });

  try {
    const { userId } = await requireTenant();
    const supabase = await createClient();

    // First delete messages if there's no cascade
    await supabase.from('consultor_chat_messages').delete().eq('session_id', sessionId);
    
    const { error } = await supabase
      .from('consultor_chat_sessions')
      .delete()
      .eq('id', sessionId)
      .eq('user_id', userId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting session:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const { sessionId, title } = await req.json();
  const { userId } = await requireTenant();
  const supabase = await createClient();

  const { error } = await supabase
    .from('consultor_chat_sessions')
    .update({ title })
    .eq('id', sessionId)
    .eq('user_id', userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
