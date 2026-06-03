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

    // 4. Intent Analysis + Keyword Extraction
    // Argentine real-estate slang mapper — always resolved BEFORE searching
    const SLANG_MAP: Record<string, string[]> = {
      piso:         ["departamento", "apartment"],
      depto:        ["departamento"],
      duplex:       ["duplex", "departamento"],
      ph:           ["PH", "planta baja"],
      monoambiente: ["monoambiente", "departamento"],
      local:        ["local comercial", "comercial"],
      galpon:       ["galpón", "industrial"],
      terreno:      ["terreno", "lote"],
      lote:         ["terreno", "lote"],
      casa:         ["casa", "chalet"],
      chalet:       ["casa", "chalet"],
      oficina:      ["oficina"],
    };

    const intentCheck = await openaiIA.generateContent({
      contents: [{ 
        role: "user", 
        parts: [{ text: `Eres un analizador de búsquedas inmobiliarias para Argentina.
        Analiza el mensaje y responde ÚNICAMENTE con un JSON con este formato:
        {
          "intent": "RETRIEVAL" | "GENERAL",
          "location_keywords": ["barrio1", "ciudad2"],
          "type_keywords": ["tipo de propiedad si se menciona"],
          "price_max": número o null,
          "price_min": número o null,
          "bedrooms": número o null
        }
        IMPORTANTE: "piso", "depto", "propiedad" son jergas genéricas, NO las pongas en type_keywords a menos que sea muy específico.
        Si el usuario dice "piso en Belgrano" → location_keywords: ["Belgrano"], type_keywords: ["departamento"].
        Si dice "departamentos en Palermo" → location_keywords: ["Palermo"], type_keywords: ["departamento"].
        Si dice "algo en zona norte" → location_keywords: ["zona norte"], type_keywords: [].
        Mensaje: "${message}"` }]
      }]
    });
    
    const intentResText = intentCheck.response.text().replace(/```json|```/g, "").trim();
    let isRetrieval = false;
    let locationKeywords: string[] = [];
    let typeKeywords: string[] = [];
    let priceMax: number | null = null;
    let priceMin: number | null = null;
    let bedroomsFilter: number | null = null;

    try {
        const parsed = JSON.parse(intentResText);
        isRetrieval = parsed.intent === 'RETRIEVAL';
        locationKeywords = (parsed.location_keywords || []).filter((k: string) => k.length > 2);
        // Expand slang type keywords to real values
        const rawTypes: string[] = parsed.type_keywords || [];
        typeKeywords = rawTypes.flatMap((t: string) => {
          const lower = t.toLowerCase().trim();
          return SLANG_MAP[lower] || [t];
        });
        priceMax = parsed.price_max || null;
        priceMin = parsed.price_min || null;
        bedroomsFilter = parsed.bedrooms || null;
    } catch(e) {
        isRetrieval = intentResText.toUpperCase().includes("RETRIEVAL");
    }

    console.log("Search params:", { isRetrieval, locationKeywords, typeKeywords, priceMax, priceMin, bedroomsFilter });

    let newMatchedProperties: any[] = [];
    let propertyContext = "";

    if (isRetrieval) {
      // --- Vector Search (Semantic) ---
      const queryEmbedding = await generateEmbedding(message);
      
      const { data: sessionData } = await supabase
        .from('consultor_chat_sessions')
        .select('metadata')
        .eq('id', currentSessionId)
        .single();
      const seenIds = (sessionData?.metadata as any)?.seen_property_ids || [];

      const { data: vectorProps } = await supabase.rpc('match_properties', {
        query_embedding: queryEmbedding,
        match_threshold: 0.12,
        match_count: 30,
        p_agency_id: agencyId
      });

      // --- Full Text Search on location (most reliable for barrio/ciudad) ---
      // Fetch full fields needed by the property card UI
      const FULL_SELECT = 'id, title, address, property_type, price, currency, bedrooms, bathrooms, total_area, status, images, description';
      let textProps: any[] = [];
      if (locationKeywords.length > 0) {
        // Build OR conditions only for address/title/neighborhood using LOCATION keywords
        const locConditions = locationKeywords
          .map(k => `address.ilike.%${k}%,title.ilike.%${k}%`)
          .join(',');
        let locQuery = supabase.from('properties')
          .select(FULL_SELECT)
          .eq('agency_id', agencyId)
          .or(locConditions);
        if (priceMax) locQuery = locQuery.lte('price', priceMax);
        if (priceMin) locQuery = locQuery.gte('price', priceMin);
        if (bedroomsFilter) locQuery = locQuery.gte('bedrooms', bedroomsFilter);
        const { data: lp } = await locQuery.limit(20);
        if (lp) textProps = lp;
      }

      // If we have type keywords too, do an additional cross-filter on type inside the location results
      if (typeKeywords.length > 0 && textProps.length > 0) {
        const typeFiltered = textProps.filter((p: any) =>
          typeKeywords.some(t => p.property_type?.toLowerCase().includes(t.toLowerCase()) || p.title?.toLowerCase().includes(t.toLowerCase()))
        );
        // Only restrict to type filter if results still exist; otherwise keep all location results
        if (typeFiltered.length > 0) textProps = typeFiltered;
      }

      // --- Merge & Deduplicate ---
      const allPropsMap = new Map<string, any>();
      // Enrich vector results with missing full fields by fetching them
      const vectorIds = (vectorProps || []).map((p: any) => p.id);
      let enrichedVector: any[] = [];
      if (vectorIds.length > 0) {
        const { data: enriched } = await supabase
          .from('properties')
          .select(FULL_SELECT)
          .in('id', vectorIds);
        enrichedVector = enriched || [];
      }
      // Map vector similarity scores onto enriched data
      const vectorSimilarityMap = new Map((vectorProps || []).map((p: any) => [p.id, p.similarity]));
      enrichedVector.forEach((p: any) => allPropsMap.set(p.id, { ...p, similarity: vectorSimilarityMap.get(p.id) || 0.3 }));
      textProps.forEach((p: any) => {
        if (!allPropsMap.has(p.id)) allPropsMap.set(p.id, { ...p, similarity: 0.6 }); // Text match is very confident
        else {
          // Boost score for properties found in both searches
          const existing = allPropsMap.get(p.id);
          allPropsMap.set(p.id, { ...existing, similarity: Math.min(1, (existing.similarity || 0) + 0.3) });
        }
      });

      const allProperties = Array.from(allPropsMap.values()).filter((p: any) => !seenIds.includes(p.id));

      // --- Re-rank: Location hits first, then by similarity ---
      const reranked = allProperties.sort((a: any, b: any) => {
        const aLocScore = locationKeywords.filter(k =>
          a.address?.toLowerCase().includes(k.toLowerCase()) || a.title?.toLowerCase().includes(k.toLowerCase())
        ).length;
        const bLocScore = locationKeywords.filter(k =>
          b.address?.toLowerCase().includes(k.toLowerCase()) || b.title?.toLowerCase().includes(k.toLowerCase())
        ).length;
        if (aLocScore !== bLocScore) return bLocScore - aLocScore;
        return (b.similarity || 0) - (a.similarity || 0);
      });

      newMatchedProperties = reranked.slice(0, 10);

      // Update session seen IDs
      const updatedSeenIds = Array.from(new Set([...seenIds, ...newMatchedProperties.map((p: any) => p.id)]));
      await supabase.from('consultor_chat_sessions')
        .update({ metadata: { seen_property_ids: updatedSeenIds }, updated_at: new Date().toISOString() })
        .eq('id', currentSessionId);

      propertyContext = newMatchedProperties.length > 0
        ? `Se encontraron ${newMatchedProperties.length} propiedades. Las tarjetas se mostrarán automáticamente en la UI. Haz un resumen conversacional breve indicando cuántas encontraste y en qué zonas, sin listarlas en texto ya que el usuario las verá en las tarjetas de abajo.`
        : "No se encontraron propiedades con esos criterios. Informa cordialmente y sugiere ampliar la búsqueda (zona más amplia, otro tipo de propiedad, rango de precio).";
    }

    // 5. Generate Assistant Response
    const systemPrompt = `Eres el "Consultor IA" de la inmobiliaria PRISMA. Sos el asistente experto para buscar propiedades en la cartera de la agencia.

    IMPORTANTE: Cuando el sistema te informe que se encontraron propiedades, las tarjetas visuales con fotos, precio y detalles se muestran automáticamente en la interfaz. 
    Por eso:
    - NO listes las propiedades en texto (no pongas "- Dirección: X", "- Precio: Y", etc.).
    - SÍ hacé un resumen conversacional breve: cuántas encontraste, en qué zona, y si el usuario quiere filtrar más.
    - Si el usuario pide más detalles de una propiedad específica, ahí sí podés describirla.

    PERSONALIDAD Y TONO:
    - Profesional y cordial. Voseo formal ("tenés", "podés", "mirá"), sin coloquialismos excesivos.
    - Siempre mostrarte dispuesto a refinar la búsqueda: por precio, ambientes, amenities, etc.
    - Si no se encontró nada, explicá por qué puede ser y sugerí alternativas concretas.

    CONTEXTO DE BÚSQUEDA ACTUAL:
    ${isRetrieval ? propertyContext : 'El usuario no está buscando propiedades en este mensaje.'}

    Responde SIEMPRE en español de Argentina.`;


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
