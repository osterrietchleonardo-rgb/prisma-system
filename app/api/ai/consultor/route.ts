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
    console.log("Buscador IA Request:", { message, sessionId, agencyId });
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
          "operation": "venta" | "alquiler" | "ambas",
          "location_keywords": ["barrio o ciudad si se menciona, si no: []"],
          "type_keywords": ["tipo de propiedad si se menciona explícitamente, si no: []"],
          "amenity_keywords": ["lista de amenidades/características: parrilla, pileta, balcón, terraza, quincho, cochera, sum, gimnasio, jardín, etc. Si no hay: []"],
          "price_max": número si hay precio máximo en USD o ARS, null si no,
          "price_min": número si hay precio mínimo, null si no,
          "bedrooms": número si mencionan habitaciones/ambientes (en AR '3 ambientes' = 3), null si no,
          "bathrooms": número si mencionan baños, null si no
        }

        REGLAS CRÍTICAS:
        - "operation": Si dice "en alquiler" o "para alquilar" → "alquiler". Si dice "comprar" o "en venta" → "venta". Si no especifica → "ambas".
        - "piso" en Argentina = departamento que ocupa TODA LA PLANTA del edificio. Si dice "piso" → type_keywords: ["piso"]
        - "depto", "departamento", "departamentos" → type_keywords: ["departamento"]
        - "3 ambientes" → bedrooms: 3 (en AR los ambientes incluyen el living)
        - "menos de 100 mil" o "hasta 100.000" → price_max: 100000
        - location_keywords SOLO si menciona una zona/barrio/ciudad específica. Si no hay zona → []
        - amenity_keywords: extraé TODAS las características mencionadas
        - Si el mensaje es muy general ("qué tenés?", "mostrá propiedades") → intent: RETRIEVAL, todo null/[]/ambas
        - Si es saludo, charla o no busca propiedades → intent: GENERAL

        Mensaje: "${message}"` }]
      }]
    });

    const intentResText = intentCheck.response.text().replace(/```json|```/g, "").trim();
    let isRetrieval = false;
    let operation = "ambas";
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
      operation = parsed.operation || "ambas";
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

    console.log("Search params:", { isRetrieval, operation, locationKeywords, typeKeywords, amenityKeywords, priceMax, priceMin, bedroomsFilter, bathroomsFilter });
    let newMatchedProperties: any[] = [];
    let propertyContext = "";
    let pisoFallback = false; 

    if (isRetrieval) {
      const FULL_SELECT = 'id, title, address, city, property_type, price, currency, bedrooms, bathrooms, total_area, covered_area, status, images, description, tokko_data, assigned_agent_id, assigned_agent:profiles(full_name, email)';

      const { data: sessionData } = await supabase
        .from('consultor_chat_sessions')
        .select('metadata')
        .eq('id', currentSessionId)
        .single();
      const seenIds = (sessionData?.metadata as any)?.seen_property_ids || [];

      // ─── STRICT SQL FILTERING ───

      // 1. Properties (Own & Agency)
      let genQuery = supabase.from('properties')
        .select(FULL_SELECT)
        .eq('agency_id', agencyId);

      if (operation === 'venta') genQuery = genQuery.eq('status', 'Venta');
      else if (operation === 'alquiler') genQuery = genQuery.eq('status', 'Alquiler');

      if (priceMax) genQuery = genQuery.lte('price', priceMax);
      if (priceMin) genQuery = genQuery.gte('price', priceMin);
      if (bedroomsFilter) genQuery = genQuery.gte('bedrooms', bedroomsFilter);
      if (bathroomsFilter) genQuery = genQuery.gte('bathrooms', bathroomsFilter);

      if (locationKeywords.length > 0) {
        const locConditions = locationKeywords.map(k => `address.ilike.%${k}%,title.ilike.%${k}%,city.ilike.%${k}%`).join(',');
        genQuery = genQuery.or(locConditions);
      }

      if (typeKeywords.length > 0) {
        const isPisoSearch = typeKeywords.includes("piso");
        if (isPisoSearch) {
          genQuery = genQuery.or('title.ilike.%piso%,description.ilike.%piso completo%,description.ilike.%planta completa%');
        } else {
          const typeConditions = typeKeywords.map(t => `property_type.ilike.%${t}%,title.ilike.%${t}%`).join(',');
          genQuery = genQuery.or(typeConditions);
        }
      }

      const { data: dbPropsData } = await genQuery.order('updated_at', { ascending: false }).limit(200);
      let allProperties = (dbPropsData || []).filter((p: any) => !seenIds.includes(p.id));

      // 2. Roomix Properties
      let rmQuery = supabase.from('roomix_properties').select('*');
      
      if (operation === 'venta') rmQuery = rmQuery.eq('operation', 'sale');
      else if (operation === 'alquiler') rmQuery = rmQuery.eq('operation', 'rent');

      if (priceMax) rmQuery = rmQuery.lte('price', priceMax);
      if (priceMin) rmQuery = rmQuery.gte('price', priceMin);
      
      if (bedroomsFilter) {
        // Roomix often has null rooms, so we fallback to title and slug text match
        const amb = bedroomsFilter;
        const dorms = bedroomsFilter > 1 ? bedroomsFilter - 1 : 1;
        const dormWords = ['cero', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
        const dormWord = dormWords[dorms] || dorms.toString();
        rmQuery = rmQuery.or(
          `rooms.gte.${amb},bedrooms.gte.${amb},` +
          `title.ilike.%${amb} amb%,title.ilike.%${amb}amb%,` +
          `title.ilike.%${dorms} dorm%,title.ilike.%${dorms}dorm%,` +
          `title.ilike.%${dormWord} dorm%,` +
          `slug.ilike.%${amb}-ambientes%,slug.ilike.%${amb}-amb%,slug.ilike.%${dorms}-dorm%`
        );
      }
      if (bathroomsFilter) {
        rmQuery = rmQuery.or(`bathrooms.gte.${bathroomsFilter},title.ilike.%${bathroomsFilter} baño%,title.ilike.%${bathroomsFilter} bano%`);
      }

      if (locationKeywords.length > 0) {
        const rmLoc = locationKeywords.map(k => `neighborhood.ilike.%${k}%,address.ilike.%${k}%`).join(',');
        rmQuery = rmQuery.or(rmLoc);
      }

      if (typeKeywords.length > 0) {
        const isPisoSearch = typeKeywords.includes("piso");
        if (isPisoSearch) {
          rmQuery = rmQuery.or('title.ilike.%piso%,description.ilike.%piso completo%,description.ilike.%planta completa%');
        } else {
          // Translate Spanish types to Schema.org English types used by Roomix
          const roomixTypeMap: Record<string, string[]> = {
            'departamento': ['Apartment', 'Accommodation'],
            'casa': ['House', 'SingleFamilyResidence'],
            'oficina': ['Office'],
            'lote': ['Land'],
            'terreno': ['Land'],
            'local': ['Commercial', 'Store']
          };
          const allTypes = [...typeKeywords];
          typeKeywords.forEach(t => {
            const mapped = roomixTypeMap[t.toLowerCase()];
            if (mapped) allTypes.push(...mapped);
          });
          const rmType = allTypes.map(t => `property_type.ilike.%${t}%,title.ilike.%${t}%`).join(',');
          rmQuery = rmQuery.or(rmType);
        }
      }

      const { data: rmPropsData, error: rmError } = await rmQuery.order('lastmod', { ascending: false }).limit(200);
      if (rmError) console.error("Roomix Query Error:", rmError);
      console.log("Roomix Query match count:", rmPropsData?.length);
      let rawRoomix = (rmPropsData || []).map(p => ({ ...p, id: p.slug }));
      console.log("First Roomix matched:", rawRoomix[0]?.title);

      // --- Amenity scoring & ranking ---
      allProperties = allProperties.map((p: any) => {
        const { matched, missing } = matchAmenities(p, amenityKeywords);
        const score = amenityKeywords.length > 0 ? matched.length / amenityKeywords.length : 1;
        return { ...p, amenity_matches: { matched, missing }, amenity_score: score };
      });

      allProperties.sort((a: any, b: any) => {
        if ((b.amenity_score || 0) !== (a.amenity_score || 0)) return (b.amenity_score || 0) - (a.amenity_score || 0);
        return 0; // Maintain SQL recency ordering
      });

      // ─── Nivel 1 y 2: Propias y Agencia ───
      const propias = allProperties
        .filter((p: any) => p.assigned_agent_id === userId)
        .slice(0, 10)
        .map((p: any) => ({
          ...p,
          source: 'own',
          agent_name: p.assigned_agent?.full_name || 'Sin asignar',
          agent_email: p.assigned_agent?.email || ''
        }));

      const agencia = allProperties
        .filter((p: any) => p.assigned_agent_id !== userId)
        .slice(0, 10)
        .map((p: any) => ({
          ...p,
          source: 'agency',
          agent_name: p.assigned_agent?.full_name || 'Sin asignar',
          agent_email: p.assigned_agent?.email || ''
        }));

      // ─── Nivel 3: Red de Colaboración (Roomix) ───
      let roomix = rawRoomix.map((rp: any) => ({
        id: `roomix_${rp.id}`,
        title: rp.title,
        address: rp.address || rp.neighborhood || '',
        city: rp.neighborhood,
        property_type: rp.property_type || '',
        price: rp.price ? Number(rp.price) : 0,
        currency: rp.currency || 'USD',
        bedrooms: rp.bedrooms || rp.rooms || 0,
        bathrooms: rp.bathrooms || 0,
        total_area: rp.area_m2 ? Number(rp.area_m2) : 0,
        status: rp.operation === 'rent' ? 'Alquiler' : 'Venta',
        images: rp.images || [],
        description: rp.description || '',
        amenities: rp.amenities || [],
        source: 'roomix',
        roomix_agency_name: rp.roomix_agency_name || 'Inmobiliaria colaboradora',
        roomix_agency_logo: rp.roomix_agency_logo,
        roomix_agency_source_url: rp.roomix_agency_source_url,
        canonical_url: rp.canonical_url,
        agent_name: rp.roomix_agency_name || 'Inmobiliaria colaboradora',
        agent_email: '',
      }));

      roomix = roomix.map((p: any) => {
        const pSearchable = (p.amenities.join(' ') + ' ' + p.description).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const matched: string[] = [];
        const missing: string[] = [];
        if (amenityKeywords.length > 0) {
          for (const amenity of amenityKeywords) {
            const a = amenity.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const terms = AMENITY_SYNONYMS[amenity.toLowerCase()] || AMENITY_SYNONYMS[a] || [a];
            if (terms.some((term: string) => pSearchable.includes(term))) matched.push(amenity);
            else missing.push(amenity);
          }
        }
        const score = amenityKeywords.length > 0 ? matched.length / amenityKeywords.length : 1;
        return { ...p, amenity_matches: { matched, missing }, amenity_score: score };
      });

      roomix.sort((a: any, b: any) => {
        if ((b.amenity_score || 0) !== (a.amenity_score || 0)) return (b.amenity_score || 0) - (a.amenity_score || 0);
        return 0; // Maintain SQL recency ordering
      });

      roomix = roomix.slice(0, 10);

      newMatchedProperties = { propias, agencia, roomix } as any;
      const allNewProps = [...propias, ...agencia, ...roomix];

      // Update session seen IDs
      const updatedSeenIds = Array.from(new Set([...seenIds, ...allNewProps.map((p: any) => p.id)]));
      await supabase.from('consultor_chat_sessions')
        .update({ metadata: { seen_property_ids: updatedSeenIds }, updated_at: new Date().toISOString() })
        .eq('id', currentSessionId);

      // Build context for the AI (concise and instructional)
      const totalResults = allNewProps.length;
      propertyContext = totalResults > 0
        ? `Se encontraron ${totalResults} propiedades (${propias.length} propias, ${agencia.length} de la agencia, ${roomix.length} de colaboración Roomix). Se muestran agrupadas en 3 secciones en la UI.
${pisoFallback ? `AVISO IMPORTANTE: El usuario buscó un "piso" (depto planta completa) pero no se encontró ninguno. Se muestran departamentos como alternativa. Comunicale esto claramente al INICIO de tu respuesta.` : ''}
Respondé con un resumen MUY BREVE (2-4 oraciones): cuántas encontraste y ofrecé refinar la búsqueda.`
        : `No se encontraron propiedades con esos criterios.${pisoFallback ? ' Tampoco se encontraron departamentos.' : ''} Explicá cordialmente y sugerí alternativas concretas (ampliar zona, cambiar precio, quitar algún filtro).`;
    }

    // 5. Generate Assistant Response
    const systemPrompt = `Eres el "Buscador IA" de la inmobiliaria PRISMA. Sos el asistente experto para buscar propiedades en la cartera de la agencia.

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
