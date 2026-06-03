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

    // Argentine real-estate slang mapper
    const SLANG_MAP: Record<string, string[]> = {
      piso:         ["piso"],          // En AR: depto que ocupa toda la planta del edificio
      depto:        ["departamento"],
      departamento: ["departamento"],
      duplex:       ["duplex"],
      ph:           ["ph"],
      monoambiente: ["monoambiente"],
      local:        ["local comercial", "local"],
      galpon:       ["galpón", "galpon"],
      terreno:      ["terreno", "lote"],
      lote:         ["lote", "terreno"],
      casa:         ["casa", "chalet"],
      chalet:       ["chalet", "casa"],
      oficina:      ["oficina"],
      cochera:      ["cochera", "garage"],
    };

    // Amenity synonyms for fuzzy matching against Tokko tags + description
    const AMENITY_SYNONYMS: Record<string, string[]> = {
      pileta:      ["pileta", "pool", "piscina", "nataci"],
      parrilla:    ["parrilla", "asador", "bbq"],
      quincho:     ["quincho", "parrilla", "asador"],
      "balcon":    ["balc"],
      "balcón":    ["balc"],
      terraza:     ["terraza", "solarium"],
      cochera:     ["cochera", "garage", "garaje"],
      sum:         ["sum ", "salon de usos", "salón usos", "salon usos"],
      gimnasio:    ["gimnasio", "gym"],
      vigilancia:  ["vigilancia", "seguridad", "portero"],
      laundry:     ["laundry", "lavanderia", "lavandería"],
      sauna:       ["sauna"],
      jardin:      ["jardin", "jardín"],
      "jardín":    ["jardin", "jardín"],
    };

    // Helper: match amenities against a property's Tokko tags + description + title
    const matchAmenities = (property: any, requested: string[]): { matched: string[], missing: string[] } => {
      if (requested.length === 0) return { matched: [], missing: [] };
      const tags: string[] = (property.tokko_data?.tags || []).map((t: any) => (t.name || '').toLowerCase());
      const searchable = [
        ...tags,
        (property.description || '').toLowerCase(),
        (property.title || '').toLowerCase(),
      ].join(' ');
      const matched: string[] = [];
      const missing: string[] = [];
      for (const amenity of requested) {
        const a = amenity.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const terms = AMENITY_SYNONYMS[amenity.toLowerCase()] || AMENITY_SYNONYMS[a] || [a];
        const found = terms.some(term => searchable.includes(term));
        if (found) matched.push(amenity);
        else missing.push(amenity);
      }
      return { matched, missing };
    };

    const intentCheck = await openaiIA.generateContent({
      contents: [{ 
        role: "user", 
        parts: [{ text: `Eres un analizador de búsquedas inmobiliarias para Argentina.
        Analiza el mensaje y responde ÚNICAMENTE con este JSON (sin texto extra):
        {
          "intent": "RETRIEVAL" | "GENERAL",
          "location_keywords": ["barrio o ciudad si se menciona, si no: []"],
          "type_keywords": ["tipo de propiedad si se menciona explícitamente, si no: []"],
          "amenity_keywords": ["lista de amenidades/características: parrilla, pileta, balcón, terraza, quincho, cochera, sum, gimnasio, jardín, etc. Si no hay: []"],
          "price_max": número si hay precio máximo en USD o ARS, null si no,
          "price_min": número si hay precio mínimo, null si no,
          "bedrooms": número si mencionan habitaciones/ambientes (en AR '3 ambientes' = 3), null si no,
          "bathrooms": número si mencionan baños, null si no
        }

        REGLAS CRÍTICAS:
        - "piso" en Argentina = departamento que ocupa TODA LA PLANTA del edificio (no es sinónimo de departamento genérico). Si dice "piso" → type_keywords: ["piso"]
        - "depto", "departamento", "departamentos" → type_keywords: ["departamento"]
        - "3 ambientes" → bedrooms: 3 (en AR los ambientes incluyen el living)
        - "menos de 100 mil" o "hasta 100.000" → price_max: 100000
        - location_keywords SOLO si menciona una zona/barrio/ciudad específica. Si no hay zona → []
        - amenity_keywords: extraé TODAS las características mencionadas
        - Si el mensaje es muy general ("qué tenés?", "mostrá propiedades", "tenés algo?") → intent: RETRIEVAL, todo null/[]
        - Si es saludo, charla o claramente no busca propiedades → intent: GENERAL

        Ejemplos:
        - "piso en Belgrano" → {"intent":"RETRIEVAL","location_keywords":["Belgrano"],"type_keywords":["piso"],"amenity_keywords":[],"price_max":null,"price_min":null,"bedrooms":null,"bathrooms":null}
        - "departamentos en Palermo" → {"intent":"RETRIEVAL","location_keywords":["Palermo"],"type_keywords":["departamento"],"amenity_keywords":[],"price_max":null,"price_min":null,"bedrooms":null,"bathrooms":null}
        - "qué tenés menos de 100 mil?" → {"intent":"RETRIEVAL","location_keywords":[],"type_keywords":[],"amenity_keywords":[],"price_max":100000,"price_min":null,"bedrooms":null,"bathrooms":null}
        - "deptos con parrilla y pileta" → {"intent":"RETRIEVAL","location_keywords":[],"type_keywords":["departamento"],"amenity_keywords":["parrilla","pileta"],"price_max":null,"price_min":null,"bedrooms":null,"bathrooms":null}
        - "3 ambientes con cochera en zona norte" → {"intent":"RETRIEVAL","location_keywords":["zona norte"],"type_keywords":[],"amenity_keywords":["cochera"],"price_max":null,"price_min":null,"bedrooms":3,"bathrooms":null}
        - "qué tenés?" → {"intent":"RETRIEVAL","location_keywords":[],"type_keywords":[],"amenity_keywords":[],"price_max":null,"price_min":null,"bedrooms":null,"bathrooms":null}

        Mensaje: "${message}"` }]
      }]
    });

    const intentResText = intentCheck.response.text().replace(/```json|```/g, "").trim();
    let isRetrieval = false;
    let locationKeywords: string[] = [];
    let typeKeywords: string[] = [];
    let amenityKeywords: string[] = [];
    let priceMax: number | null = null;
    let priceMin: number | null = null;
    let bedroomsFilter: number | null = null;
    let bathroomsFilter: number | null = null;

    try {
      const parsed = JSON.parse(intentResText);
      isRetrieval = parsed.intent === 'RETRIEVAL';
      locationKeywords = (parsed.location_keywords || []).filter((k: string) => k.length > 2);
      amenityKeywords = (parsed.amenity_keywords || []).map((a: string) => a.toLowerCase().trim());
      const rawTypes: string[] = parsed.type_keywords || [];
      typeKeywords = rawTypes.flatMap((t: string) => {
        const lower = t.toLowerCase().trim();
        return SLANG_MAP[lower] || [t];
      });
      priceMax = parsed.price_max || null;
      priceMin = parsed.price_min || null;
      bedroomsFilter = parsed.bedrooms || null;
      bathroomsFilter = parsed.bathrooms || null;
    } catch(e) {
      isRetrieval = intentResText.toUpperCase().includes("RETRIEVAL");
    }

    console.log("Search params:", { isRetrieval, locationKeywords, typeKeywords, amenityKeywords, priceMax, priceMin, bedroomsFilter, bathroomsFilter });
    let newMatchedProperties: any[] = [];
    let propertyContext = "";
    let pisoFallback = false; // Flag: searched for "piso" but fell back to departamentos

    if (isRetrieval) {
      // All fields needed by the frontend property card
      const FULL_SELECT = 'id, title, address, city, property_type, price, currency, bedrooms, bathrooms, total_area, covered_area, status, images, description, tokko_data';

      const { data: sessionData } = await supabase
        .from('consultor_chat_sessions')
        .select('metadata')
        .eq('id', currentSessionId)
        .single();
      const seenIds = (sessionData?.metadata as any)?.seen_property_ids || [];

      // --- Vector Search (Semantic) ---
      const queryEmbedding = await generateEmbedding(message);
      const { data: vectorProps } = await supabase.rpc('match_properties', {
        query_embedding: queryEmbedding,
        match_threshold: 0.12,
        match_count: 30,
        p_agency_id: agencyId
      });

      // --- Text / Filter Search (3 branches) ---
      let textProps: any[] = [];

      if (locationKeywords.length > 0) {
        // Branch A: Location-based search + optional attribute filters
        const locConditions = locationKeywords
          .map(k => `address.ilike.%${k}%,title.ilike.%${k}%,city.ilike.%${k}%`)
          .join(',');
        let locQuery = supabase.from('properties')
          .select(FULL_SELECT)
          .eq('agency_id', agencyId)
          .or(locConditions);
        if (priceMax)       locQuery = locQuery.lte('price', priceMax);
        if (priceMin)       locQuery = locQuery.gte('price', priceMin);
        if (bedroomsFilter) locQuery = locQuery.gte('bedrooms', bedroomsFilter);
        if (bathroomsFilter) locQuery = locQuery.gte('bathrooms', bathroomsFilter);
        const { data: lp } = await locQuery.limit(25);
        if (lp) textProps = lp;

      } else if (priceMax || priceMin || bedroomsFilter || bathroomsFilter || typeKeywords.length > 0 || amenityKeywords.length > 0) {
        // Branch B: No location, but has specific filters → broad DB query with those filters
        let genQuery = supabase.from('properties')
          .select(FULL_SELECT)
          .eq('agency_id', agencyId);
        if (priceMax)       genQuery = genQuery.lte('price', priceMax);
        if (priceMin)       genQuery = genQuery.gte('price', priceMin);
        if (bedroomsFilter) genQuery = genQuery.gte('bedrooms', bedroomsFilter);
        if (bathroomsFilter) genQuery = genQuery.gte('bathrooms', bathroomsFilter);
        const { data: gp } = await genQuery.limit(30);
        if (gp) textProps = gp;

      } else {
        // Branch C: Completely open query ("qué tenés?") → show latest from portfolio
        const { data: gp } = await supabase.from('properties')
          .select(FULL_SELECT)
          .eq('agency_id', agencyId)
          .order('updated_at', { ascending: false })
          .limit(20);
        if (gp) textProps = gp;
      }

      // --- Type filtering ---
      if (typeKeywords.length > 0 && textProps.length > 0) {
        const isPisoSearch = typeKeywords.includes("piso");

        if (isPisoSearch) {
          // "piso" in Tokko is stored as "Apartment" property_type, but should have "piso" in title/description
          const pisoMatches = textProps.filter((p: any) =>
            p.title?.toLowerCase().includes("piso") ||
            p.description?.toLowerCase().includes("piso completo") ||
            p.description?.toLowerCase().includes("planta completa")
          );
          if (pisoMatches.length > 0) {
            textProps = pisoMatches;
          } else {
            // Fallback: search for departamentos/apartments instead and flag it
            const deptMatches = textProps.filter((p: any) =>
              p.property_type?.toLowerCase().includes("apartment") ||
              p.property_type?.toLowerCase().includes("departamento") ||
              p.title?.toLowerCase().includes("departamento") ||
              p.title?.toLowerCase().includes("depto")
            );
            if (deptMatches.length > 0) {
              textProps = deptMatches;
              pisoFallback = true;
            }
            // If no depts either, keep all textProps (don't return empty)
          }
        } else {
          // Normal type filter: property_type, title or description
          const typeFiltered = textProps.filter((p: any) =>
            typeKeywords.some(t =>
              p.property_type?.toLowerCase().includes(t.toLowerCase()) ||
              p.title?.toLowerCase().includes(t.toLowerCase()) ||
              p.description?.toLowerCase().includes(t.toLowerCase())
            )
          );
          if (typeFiltered.length > 0) textProps = typeFiltered;
          // If no type match, keep all (don't be too restrictive)
        }
      }

      // --- Merge & Deduplicate (Vector + Text) ---
      const allPropsMap = new Map<string, any>();
      const vectorIds = (vectorProps || []).map((p: any) => p.id);
      let enrichedVector: any[] = [];
      if (vectorIds.length > 0) {
        const { data: enriched } = await supabase
          .from('properties')
          .select(FULL_SELECT)
          .in('id', vectorIds);
        enrichedVector = enriched || [];
      }
      const vectorSimilarityMap = new Map((vectorProps || []).map((p: any) => [p.id, p.similarity]));
      enrichedVector.forEach((p: any) => allPropsMap.set(p.id, { ...p, similarity: vectorSimilarityMap.get(p.id) || 0.3 }));
      textProps.forEach((p: any) => {
        if (!allPropsMap.has(p.id)) allPropsMap.set(p.id, { ...p, similarity: 0.6 });
        else {
          const existing = allPropsMap.get(p.id);
          allPropsMap.set(p.id, { ...existing, similarity: Math.min(1, (existing.similarity || 0) + 0.3) });
        }
      });

      let allProperties = Array.from(allPropsMap.values()).filter((p: any) => !seenIds.includes(p.id));

      // --- Amenity scoring & filtering ---
      if (amenityKeywords.length > 0) {
        allProperties = allProperties.map((p: any) => {
          const { matched, missing } = matchAmenities(p, amenityKeywords);
          const score = matched.length / amenityKeywords.length;
          return { ...p, amenity_matches: { matched, missing }, amenity_score: score };
        });
        // Sort: full match first → partial → no match
        allProperties.sort((a: any, b: any) => {
          if ((b.amenity_score || 0) !== (a.amenity_score || 0)) return (b.amenity_score || 0) - (a.amenity_score || 0);
          return (b.similarity || 0) - (a.similarity || 0);
        });
        // Show properties with at least one amenity match, if any exist
        const withSomeMatch = allProperties.filter((p: any) => (p.amenity_score || 0) > 0);
        if (withSomeMatch.length > 0) allProperties = withSomeMatch;
      } else {
        // No amenity filter → add empty amenity_matches and rank by location + similarity
        allProperties = allProperties.map((p: any) => ({ ...p, amenity_matches: { matched: [], missing: [] } }));
        allProperties.sort((a: any, b: any) => {
          const aLocScore = locationKeywords.filter(k =>
            a.address?.toLowerCase().includes(k.toLowerCase()) ||
            a.city?.toLowerCase().includes(k.toLowerCase()) ||
            a.title?.toLowerCase().includes(k.toLowerCase())
          ).length;
          const bLocScore = locationKeywords.filter(k =>
            b.address?.toLowerCase().includes(k.toLowerCase()) ||
            b.city?.toLowerCase().includes(k.toLowerCase()) ||
            b.title?.toLowerCase().includes(k.toLowerCase())
          ).length;
          if (aLocScore !== bLocScore) return bLocScore - aLocScore;
          return (b.similarity || 0) - (a.similarity || 0);
        });
      }

      newMatchedProperties = allProperties.slice(0, 10);

      // Update session seen IDs
      const updatedSeenIds = Array.from(new Set([...seenIds, ...newMatchedProperties.map((p: any) => p.id)]));
      await supabase.from('consultor_chat_sessions')
        .update({ metadata: { seen_property_ids: updatedSeenIds }, updated_at: new Date().toISOString() })
        .eq('id', currentSessionId);

      // Build context for the AI (concise and instructional)
      const fullAmenityCount  = amenityKeywords.length > 0 ? newMatchedProperties.filter((p: any) => p.amenity_score === 1).length : 0;
      const partialAmenityCount = amenityKeywords.length > 0 ? newMatchedProperties.filter((p: any) => (p.amenity_score || 0) > 0 && (p.amenity_score || 0) < 1).length : 0;

      propertyContext = newMatchedProperties.length > 0
        ? `Se encontraron ${newMatchedProperties.length} propiedades que se muestran como tarjetas en la UI.
${pisoFallback ? `AVISO IMPORTANTE: El usuario buscó un "piso" (depto planta completa) pero no se encontró ninguno. Se muestran departamentos como alternativa. Comunicale esto claramente al INICIO de tu respuesta.` : ''}
${amenityKeywords.length > 0 ? `Amenities solicitados: [${amenityKeywords.join(', ')}]. ${fullAmenityCount} propiedades los tienen TODOS. ${partialAmenityCount} tienen ALGUNOS (las tarjetas muestran badges ✓/✗ de qué tiene y qué falta cada propiedad).` : ''}
Respondé con un resumen MUY BREVE (2-4 oraciones): cuántas encontraste, destacá novedades sobre amenities o el fallback de piso, y ofrecé refinar la búsqueda.`
        : `No se encontraron propiedades con esos criterios.${pisoFallback ? ' Tampoco se encontraron departamentos.' : ''} Explicá cordialmente y sugerí alternativas concretas (ampliar zona, cambiar precio, quitar algún filtro).`;
    }

    // 5. Generate Assistant Response
    const systemPrompt = `Eres el "Consultor IA" de la inmobiliaria PRISMA. Sos el asistente experto para buscar propiedades en la cartera de la agencia.

    FORMATO DE RESPUESTA CRÍTICO:
    - Las propiedades encontradas se muestran automáticamente como tarjetas visuales con fotos, precio y detalles. NO las listes en texto.
    - Tu respuesta debe ser un resumen MUY BREVE y conversacional (2-4 oraciones cuando hay resultados).
    - Si hay pisoFallback activo: empezá diciendo que no encontraste pisos pero sí departamentos.
    - Si hay amenities parciales: mencionalo ("Encontré 5 propiedades, algunas con parrilla pero sin pileta — podés verlo en las tarjetas").
    - Si no hay resultados: explicá por qué y sugerí 2-3 alternativas concretas.
    - Si el usuario pide más detalle de una propiedad específica, ahí sí describí sus características.

    PERSONALIDAD:
    - Profesional y cálido. Voseo formal ("tenés", "podés", "encontré", "mirá").
    - Siempre ofrecé refinar la búsqueda al final de tu respuesta.

    CONTEXTO DE BÚSQUEDA ACTUAL:
    ${isRetrieval ? propertyContext : 'El usuario no está buscando propiedades. Respondé normalmente y preguntá en qué podés ayudar.'}

    Respondé SIEMPRE en español de Argentina.`;


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
