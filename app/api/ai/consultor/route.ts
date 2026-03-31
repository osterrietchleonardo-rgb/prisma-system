import { createClient } from "@/lib/supabase/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { generateEmbedding, prismaIA } from "@/lib/gemini";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { message, sessionId, agencyId, history } = await req.json();
    console.log("Consultor IA Request:", { message, sessionId, agencyId });
    const supabase = await createClient();

    // 1. Get User Profile
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Fetch profile to get agencyId if missing
    let finalAgencyId = agencyId;
    if (!finalAgencyId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('agency_id')
        .eq('id', user.id)
        .single();
      finalAgencyId = profile?.agency_id;
    }

    if (!finalAgencyId) {
      return NextResponse.json({ error: "No se encontró el ID de la agencia." }, { status: 400 });
    }

    // 2. Manage Session
    let currentSessionId = sessionId;
    if (!currentSessionId) {
      const { data: session } = await supabase
        .from('consultor_chat_sessions')
        .insert({ user_id: user.id, agency_id: finalAgencyId })
        .select()
        .single();
      currentSessionId = session.id;
    }

    // 3. Save User Message
    await supabase
      .from('consultor_chat_messages')
      .insert({ session_id: currentSessionId, role: 'user', content: message });

    // 4. Intent Analysis: Is it property search or general chat?
    const intentCheck = await prismaIA.generateContent({
      contents: [{ 
        role: "user", 
        parts: [{ text: `Analiza si el siguiente mensaje requiere buscar o recomendar propiedades de una inmobiliaria o si es una charla general (saludo, agradecimiento, pregunta sobre el clima, charla casual).
        Responde SOLO con una palabra: 'RETRIEVAL' o 'GENERAL'.
        Mensaje: "${message}"` }]
      }]
    });
    const isRetrieval = intentCheck.response.text().toUpperCase().includes("RETRIEVAL");

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

      console.log("Querying Supabase match_properties RPC (lower threshold)...");
      const { data: matchedProperties, error: rpcError } = await supabase.rpc('match_properties', {
        query_embedding: queryEmbedding,
        match_threshold: 0.25, // Lowered for better recall
        match_count: 8,
        p_agency_id: finalAgencyId
      });

      if (rpcError) {
        console.error("RPC Error:", rpcError);
        throw rpcError;
      }

      // Filter and Re-rank
      const filteredProperties = matchedProperties?.filter((p: any) => !seenIds.includes(p.id)) || [];
      const searchTerms = message.toLowerCase().split(/\s+/).filter((t: string) => t.length > 2);
      
      const rerankedProperties = filteredProperties.sort((a: any, b: any) => {
        const aScore = searchTerms.filter((t: string) => a.address?.toLowerCase().includes(t) || a.title?.toLowerCase().includes(t)).length;
        const bScore = searchTerms.filter((t: string) => b.address?.toLowerCase().includes(t) || b.title?.toLowerCase().includes(t)).length;
        if (aScore !== bScore) return bScore - aScore;
        return b.similarity - a.similarity;
      });
      
      newMatchedProperties = rerankedProperties.slice(0, 3);
      
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
        ? newMatchedProperties.map((p: any) => 
            `- ID: ${p.id}, Titulo: ${p.title}, Tipo: ${p.property_type}, Precio: ${p.currency} ${p.price}, Direccion: ${p.address}, Dormitorios: ${p.bedrooms}`
          ).join('\n')
        : "No se encontraron nuevas propiedades coincidiendo exactamente. Sugiere alternativas.";
    }

    // 5. Generate Assistant Response with Context & History
    const systemPrompt = `Eres el "Consultor IA" de la inmobiliaria PRISMA. Tu misión es ser la mano derecha del Director para encontrar propiedades en la cartera de la agencia.
    
    PERSONALIDAD Y TONO:
    - Sos un colega experto, profesional pero cercano. Hablás en español de Argentina (usá voseo: "che", "mirá", "querés", "avisame", "tenés").
    - No sos un robot de búsqueda; sos un consultor. Si te saludan, saludás cálidamente y te ponés a disposición.
    - Tenés iniciativa. Si el usuario te pregunta algo vago, pedile detalles amablemente (zona, presupuesto, tipo de propiedad).
    - Evitá frases robóticas como "Entiendo que estás buscando...". Di cosas como "Dale, estuve chequeando la cartera y mirá lo que encontré que te puede servir:" o "Che, decime un poco más qué zona buscás así te ayudo mejor".

    INSTRUCCIONES DE USO:
    - Solo si el sistema te pasa "PROPIEDADES ENCONTRADAS", usalas para recomendar.
    - Si no hay propiedades encontradas en el contexto, explicá que por ahora no hay nada que coincida exacto y sugerí ampliar la búsqueda o charlá normalmente.
    - Mantené siempre un estilo fluido, como si estuvieras chateando por WhatsApp con un socio.

    ${isRetrieval ? `PROPIEDADES ENCONTRADAS:\n${propertyContext}` : 'Charla General: No se requiere búsqueda en este turno.'}
    
    Responde SIEMPRE en español de Argentina.`;


    const chatResult = await prismaIA.generateContent({
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
        
        const analysisResult = await prismaIA.generateContent(analysisPrompt);
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

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: sessions } = await supabase
    .from('consultor_chat_sessions')
    .select('*')
    .eq('agency_id', agencyId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false }); // Usamos created_at como fallback más seguro

  return NextResponse.json(sessions);
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('sessionId');
  if (!sessionId) return NextResponse.json({ error: "SessionId required" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // First delete messages if there's no cascade
  await supabase.from('consultor_chat_messages').delete().eq('session_id', sessionId);
  
  const { error } = await supabase
    .from('consultor_chat_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function PATCH(req: Request) {
  const { sessionId, title } = await req.json();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from('consultor_chat_sessions')
    .update({ title })
    .eq('id', sessionId)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
