import { createClient } from "@/lib/supabase/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { generateEmbedding, prismaIA } from "@/lib/gemini";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { message, sessionId, agencyId } = await req.json();
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

    // 4. Intent Analysis & Search
    console.log("Generating embedding...");
    const queryEmbedding = await generateEmbedding(message);
    
    // Get seen property IDs from session metadata if exists
    const { data: sessionData } = await supabase
      .from('consultor_chat_sessions')
      .select('metadata')
      .eq('id', currentSessionId)
      .single();
    const seenIds = (sessionData?.metadata as any)?.seen_property_ids || [];

    console.log("Querying Supabase RPC match_properties...");
    const { data: matchedProperties, error: rpcError } = await supabase.rpc('match_properties', {
      query_embedding: queryEmbedding,
      match_threshold: 0.40, // Loosely match for intelligence/mapping (e.g. 13 -> Avenida 13)
      match_count: 10,        // Get more, we will pick the best 3 non-repeating
      p_agency_id: finalAgencyId
    });

    if (rpcError) {
      console.error("RPC Error:", rpcError);
      throw rpcError;
    }

    // Filter out seen properties to avoid repetition
    const filteredProperties = matchedProperties?.filter((p: any) => !seenIds.includes(p.id)) || [];
    
    // Intelligent Re-ranking: Boost properties with matching numbers/words in address/title
    const searchTerms = message.toLowerCase().split(/\s+/).filter((t: string) => t.length > 1);
    const rerankedProperties = filteredProperties.sort((a: any, b: any) => {
      const aScore = searchTerms.filter((t: string) => a.address?.toLowerCase().includes(t) || a.title?.toLowerCase().includes(t)).length;
      const bScore = searchTerms.filter((t: string) => b.address?.toLowerCase().includes(t) || b.title?.toLowerCase().includes(t)).length;
      if (aScore !== bScore) return bScore - aScore; // Boost by keyword matches
      return b.similarity - a.similarity; // Then by vector similarity
    });
    
    // Pick the top 3 from the reranked list
    const newMatchedProperties = rerankedProperties.slice(0, 3);
    
    // Update seen IDs
    const updatedSeenIds = Array.from(new Set([...seenIds, ...newMatchedProperties.map((p: any) => p.id)]));
    await supabase
      .from('consultor_chat_sessions')
      .update({ 
        metadata: { seen_property_ids: updatedSeenIds },
        updated_at: new Date().toISOString()
      })
      .eq('id', currentSessionId);

    console.log("New Matched Properties:", newMatchedProperties.length);

    // 5. Build Context for Gemini
    const propertyContext = newMatchedProperties.length > 0
      ? newMatchedProperties.map((p: any) => 
          `- ID: ${p.id}, Titulo: ${p.title}, Tipo: ${p.property_type}, Precio: ${p.currency} ${p.price}, Direccion: ${p.address}, Dormitorios: ${p.bedrooms}, Similarity: ${p.similarity.toFixed(2)}`
        ).join('\n')
      : "No se encontraron nuevas propiedades en esta consulta. Si el usuario pide más, intenta sugerir una búsqueda diferente.";

    // 6. Generate Assistant Response
    const systemPrompt = `Eres el "Consultor IA" de la inmobiliaria PRISMA. 
    Tu objetivo es ayudar al Director a encontrar propiedades que coincidan con su pedido.
    
    Tono: Profesional, experto, cálido. Hablas como un colega experimentado en Argentina.
    
    IMPORTANTE - REGLAS DE RESPUESTA:
    1. Menciona EXACTAMENTE las ${newMatchedProperties.length} propiedades que te proporciono a continuación. Ni una más, ni una menos.
    2. Si el número de propiedades es 0, informa que no hay nuevas coincidencias y sugiere ampliar la búsqueda.
    3. No inventes propiedades ni menciones ID de propiedades que no estén en la lista actual.
    4. El sistema ya filtró las que el usuario ya vio, así que estas ${newMatchedProperties.length} son todas RECOMENDACIONES NUEVAS.
    5. No digas "tengo 2" si te pasé 3. Sé exacto: ${newMatchedProperties.length}.
    
    PROPIEDADES COINCIDENTES (PARA ESTE MENSAJE):
    ${propertyContext}
    
    Responde en español de Argentina.`;

    const chatResult = await prismaIA.generateContent({
      contents: [{ role: 'user', parts: [{ text: `Usuario pregunta: ${message}\n\nContexto de propiedades encontradas:\n${propertyContext}` }] }],
      systemInstruction: systemPrompt
    });

    const assistantContent = chatResult.response.text();

    // 7. Save Assistant Message with Metadata
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
