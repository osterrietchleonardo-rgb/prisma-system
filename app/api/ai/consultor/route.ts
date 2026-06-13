import { createClient } from "@/lib/supabase/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { generateEmbedding } from "@/lib/gemini";
import { openaiIA } from "@/lib/openai";
import { NextResponse } from "next/server";
import { consumeAiCredits, requireTenant, updateAiTransactionCost } from "@/lib/auth/tenant-validation";
import { calculateCost } from "@/utils/aiCostCalculator";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { message, sessionId, history } = await req.json();
    const { userId, agencyId } = await requireTenant();
    console.log("Buscador IA Request:", { message, sessionId, agencyId });
    const supabase = await createClient();

    // ─── Notas/directivas del Buscador IA cargadas por el director (texto libre, la IA las interpreta) ───
    let buscadorNotes = "";
    let ownAgencyName = "";
    try {
      const { data: agencyCfg } = await supabase
        .from("agencies")
        .select("name, buscador_ia_config")
        .eq("id", agencyId)
        .single();
      ownAgencyName = agencyCfg?.name || "";
      const cfg = (agencyCfg?.buscador_ia_config as any) || {};
      buscadorNotes = typeof cfg.notes === "string" ? cfg.notes.trim() : "";
    } catch (cfgErr) {
      console.error("No se pudo cargar buscador_ia_config:", cfgErr);
    }

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

    // ─── Memoria del chat: historial completo de la sesión (para mantener el hilo y no repetir) ───
    const { data: convoRows } = await supabase
      .from('consultor_chat_messages')
      .select('role, content')
      .eq('session_id', currentSessionId)
      .order('created_at', { ascending: true });
    // Turnos previos = todo menos el mensaje actual (último insertado). Limitamos a los últimos 12.
    const priorTurns = (convoRows || []).slice(0, -1).slice(-12);

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

    const convoContext = priorTurns.length > 0
      ? `\n\nCONVERSACIÓN PREVIA (mantené el hilo: arrastrá los filtros ya mencionados salvo que el usuario los cambie):\n${priorTurns.map((m: any) => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content}`).join('\n')}\n`
      : '';

    const intentCheck = await openaiIA.generateContent({
      contents: [{
        role: "user",
        parts: [{ text: `Eres un analizador de búsquedas inmobiliarias para Argentina.
        A partir del ÚLTIMO mensaje del usuario y de la conversación previa, devolvé los criterios de búsqueda ACUMULADOS y vigentes (mantené los filtros anteriores que sigan aplicando, cambiá los que el usuario modifique y agregá los nuevos).
        Respondé ÚNICAMENTE con este JSON (sin texto extra):
        {
          "intent": "RETRIEVAL" | "GENERAL",
          "operation": "venta" | "alquiler" | "ambas",
          "location_keywords": ["barrio/ciudad/zona si se menciona, si no: []"],
          "type_keywords": ["tipo de propiedad si se menciona, si no: []"],
          "amenity_keywords": ["amenidades/servicios: parrilla, pileta, balcón, terraza, quincho, cochera, sum, gimnasio, jardín, seguridad, etc. Si no hay: []"],
          "agency_keywords": ["nombre de inmobiliaria/agencia puntual si la mencionan, si no: []"],
          "price_max": número o null,
          "price_min": número o null,
          "price_currency": "USD" | "ARS" | null,
          "bedrooms": número o null,
          "bathrooms": número o null
        }

        REGLAS CRÍTICAS:
        - MANTENÉ EL CONTEXTO: si antes pidió "3 ambientes en La Plata" y ahora dice "que tengan pileta", el resultado debe incluir location La Plata, bedrooms 3 y amenity pileta.
        - "operation": "en alquiler"/"alquilar" → "alquiler"; "comprar"/"en venta" → "venta"; si no especifica → "ambas".
        - "piso" en Argentina = departamento de planta completa → type_keywords: ["piso"].
        - "depto"/"departamento" → ["departamento"]; "3 ambientes" → bedrooms: 3 (incluye el living).
        - "menos de 100 mil"/"hasta 100.000" → price_max: 100000.
        - price_currency: inferí la moneda. Venta suele ser USD; alquiler suele ser ARS. "dólares"/"USD" → "USD"; "pesos"/"$" → "ARS"; sin precio → null.
        - agency_keywords: SOLO si menciona una inmobiliaria/agencia puntual (ej: "propiedades de Cocucci", "las de RE/MAX"). Si no → [].
        - location_keywords SOLO si menciona zona/barrio/ciudad. Si no → [].
        - Mensaje general ("qué tenés?", "mostrá propiedades") → intent: RETRIEVAL con todo []/null/ambas.
        - Saludo/charla → intent: GENERAL.
        ${convoContext}
        ÚLTIMO MENSAJE DEL USUARIO: "${message}"` }]
      }]
    });

    const intentResText = intentCheck.response.text().replace(/```json|```/g, "").trim();
    let isRetrieval = false;
    let operation = "ambas";
    let locationKeywords: string[] = [];
    let typeKeywords: string[] = [];
    let amenityKeywords: string[] = [];
    let agencyKeywords: string[] = [];
    let priceMax: number | null = null;
    let priceMin: number | null = null;
    let priceCurrency: string | null = null;
    let bedroomsFilter: number | null = null;
    let bathroomsFilter: number | null = null;

    try {
      const parsed = JSON.parse(intentResText);
      isRetrieval = parsed.intent === 'RETRIEVAL';
      operation = parsed.operation || "ambas";
      locationKeywords = (parsed.location_keywords || []).filter((k: string) => typeof k === 'string' && k.trim().length > 2);
      amenityKeywords = (parsed.amenity_keywords || []).map((a: string) => a.toLowerCase().trim());
      agencyKeywords = (parsed.agency_keywords || []).filter((k: string) => typeof k === 'string' && k.trim().length > 1).map((k: string) => k.trim());
      const rawTypes: string[] = parsed.type_keywords || [];
      typeKeywords = rawTypes.flatMap((t: string) => {
        const lower = t.toLowerCase().trim();
        return SLANG_MAP[lower] || [t];
      });
      priceMax = parsed.price_max || null;
      priceMin = parsed.price_min || null;
      priceCurrency = parsed.price_currency || null;
      bedroomsFilter = parsed.bedrooms || null;
      bathroomsFilter = parsed.bathrooms || null;
    } catch(e) {
      isRetrieval = intentResText.toUpperCase().includes("RETRIEVAL");
    }

    console.log("Search params:", { isRetrieval, operation, locationKeywords, typeKeywords, amenityKeywords, agencyKeywords, priceMax, priceMin, priceCurrency, bedroomsFilter, bathroomsFilter });
    let newMatchedProperties: any[] = [];
    let propertyContext = "";
    let pisoFallback = false; 

    if (isRetrieval) {
      const FULL_SELECT = 'id, title, address, city, property_type, price, currency, bedrooms, bathrooms, total_area, covered_area, status, images, description, tokko_data, assigned_agent_id, assigned_agent, agent_profile:profiles(full_name, email)';

      // ─── FILTRO DURO (SQL): SOLO operación + tipo de propiedad (los grandes reductores) ───
      // El resto (zona, presupuesto, ambientes, amenities, inmobiliaria) se interpreta en memoria
      // sobre el conjunto de columnas, para máxima precisión sin perder coincidencias válidas.
      const isPisoSearch = typeKeywords.includes('piso');

      // Tipos en español (properties) → Schema.org en inglés (roomix)
      const roomixTypeMap: Record<string, string[]> = {
        departamento: ['Apartment', 'Accommodation', 'Condo'],
        duplex: ['Apartment', 'House'],
        ph: ['Apartment', 'House', 'Accommodation'],
        monoambiente: ['Apartment', 'Accommodation', 'Studio'],
        casa: ['House', 'SingleFamilyResidence'],
        chalet: ['House'],
        oficina: ['Office'],
        lote: ['Land'],
        terreno: ['Land'],
        local: ['Commercial', 'Store'],
        galpon: ['Warehouse', 'Industrial'],
      };

      // 1) PROPERTIES (propias + agencia) — filtro duro: operación + tipo
      let genQuery = supabase.from('properties').select(FULL_SELECT).eq('agency_id', agencyId);
      if (operation === 'venta') genQuery = genQuery.eq('status', 'Venta');
      else if (operation === 'alquiler') genQuery = genQuery.in('status', ['Alquiler', 'Temporary rent']);
      if (typeKeywords.length > 0) {
        if (isPisoSearch) {
          genQuery = genQuery.or('title.ilike.%piso%,description.ilike.%piso%,property_type.ilike.%departamento%');
        } else {
          const cond = typeKeywords.flatMap((t: string) => [`property_type.ilike.%${t}%`, `title.ilike.%${t}%`]).join(',');
          genQuery = genQuery.or(cond);
        }
      }
      const { data: dbPropsData } = await genQuery.order('updated_at', { ascending: false }).limit(400);

      // 2) ROOMIX — filtro duro: operación + tipo (traducido a inglés)
      let rmQuery = supabase.from('roomix_properties').select('*');
      if (operation === 'venta') rmQuery = rmQuery.eq('operation', 'sale');
      else if (operation === 'alquiler') rmQuery = rmQuery.eq('operation', 'rent');
      if (typeKeywords.length > 0) {
        if (isPisoSearch) {
          rmQuery = rmQuery.or('title.ilike.%piso%,property_type.ilike.%apartment%,property_type.ilike.%accommodation%');
        } else {
          const allTypes = [...typeKeywords];
          typeKeywords.forEach((t: string) => { const m = roomixTypeMap[t.toLowerCase()]; if (m) allTypes.push(...m); });
          const cond = Array.from(new Set(allTypes)).flatMap((t: string) => [`property_type.ilike.%${t}%`, `title.ilike.%${t}%`]).join(',');
          rmQuery = rmQuery.or(cond);
        }
      }
      const { data: rmPropsData, error: rmError } = await rmQuery.order('lastmod', { ascending: false }).limit(400);
      if (rmError) console.error('Roomix Query Error:', rmError);
      console.log('Roomix hard-filter count:', rmPropsData?.length, '| Properties hard-filter count:', dbPropsData?.length);

      // ─── INTERPRETACIÓN EN MEMORIA sobre el conjunto de columnas ───
      // Prioridad: tipo + operación (SQL duro) → zona/barrio (estricto) → presupuesto/ambientes/amenities/inmobiliaria.
      const norm = (s: any) => (s ?? '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

      // Zona/barrio: filtro fuerte por prioridad. Si pidió zona, debe aparecer en sus campos de ubicación (no se escapa otra ciudad).
      const locOk = (locText: string) =>
        locationKeywords.length === 0 || locationKeywords.some((k: string) => locText.includes(norm(k)));

      // Presupuesto con conciencia de moneda. Si la moneda no coincide con la pedida, no excluimos (lo aclara el modelo).
      const budgetOk = (price: number, cur: string) => {
        if (!price || price <= 0) return true;
        if (priceCurrency && cur && norm(cur) !== norm(priceCurrency)) return true;
        if (priceMax && price > priceMax * 1.05) return false;
        if (priceMin && price < priceMin * 0.95) return false;
        return true;
      };

      // Ambientes/baños: tolerante (ambientes ≈ dormitorios + 1). Sin dato, no excluye.
      const roomsOk = (beds: number | null | undefined) => {
        if (!bedroomsFilter) return true;
        if (beds && beds > 0) return beds >= bedroomsFilter - 1;
        return true;
      };
      const bathOk = (baths: number | null | undefined) => {
        if (!bathroomsFilter) return true;
        if (baths && baths > 0) return baths >= bathroomsFilter;
        return true;
      };

      // Inmobiliaria: si piden una puntual, filtramos colaboración por nombre (fuzzy, ignorando puntuación/espacios).
      const alnum = (s: any) => norm(s).replace(/[^a-z0-9]/g, '');
      const agencyMatch = (name: any) => {
        if (agencyKeywords.length === 0) return true;
        const a = alnum(name);
        return !!a && agencyKeywords.some((k: string) => {
          const kk = alnum(k);
          return kk.length > 1 && (a.includes(kk) || kk.includes(a));
        });
      };
      // Si la inmobiliaria pedida NO es la propia agencia, es externa → solo mostramos colaboración.
      const askingExternalAgency = agencyKeywords.length > 0 && !agencyMatch(ownAgencyName);

      // PROPERTIES (propias + agencia): interpretación sobre columnas + scoring de amenities
      const propLocText = (p: any) => norm([p.city, p.address, p.title, p?.tokko_data?.location?.name].join(' '));
      let propsFiltered: any[] = (dbPropsData || [])
        .filter((p: any) => locOk(propLocText(p)))
        .filter((p: any) => budgetOk(Number(p.price) || 0, p.currency))
        .filter((p: any) => roomsOk(p.bedrooms))
        .filter((p: any) => bathOk(p.bathrooms));
      if (askingExternalAgency) propsFiltered = []; // pidió una inmobiliaria externa específica
      propsFiltered = propsFiltered.map((p: any) => {
        const { matched, missing } = matchAmenities(p, amenityKeywords);
        const score = amenityKeywords.length > 0 ? matched.length / amenityKeywords.length : 1;
        return { ...p, amenity_matches: { matched, missing }, amenity_score: score };
      });
      propsFiltered.sort((a: any, b: any) => (b.amenity_score || 0) - (a.amenity_score || 0));

      // ─── Nivel 1 y 2: Propias y Agencia ───
      const propias = propsFiltered
        .filter((p: any) => p.assigned_agent_id === userId)
        .slice(0, 10)
        .map((p: any) => ({
          ...p,
          source: 'own',
          agent_name: p.agent_profile?.full_name || p.assigned_agent?.name || 'Sin asignar',
          agent_email: p.agent_profile?.email || p.assigned_agent?.email || '',
          public_url: p.tokko_data?.public_url || null
        }));

      const agencia = propsFiltered
        .filter((p: any) => p.assigned_agent_id !== userId)
        .slice(0, 10)
        .map((p: any) => ({
          ...p,
          source: 'agency',
          agent_name: p.agent_profile?.full_name || p.assigned_agent?.name || 'Sin asignar',
          agent_email: p.agent_profile?.email || p.assigned_agent?.email || '',
          public_url: p.tokko_data?.public_url || null
        }));

      // ─── Nivel 3: Red de Colaboración (Roomix): interpretación sobre columnas ───
      const rmxLocText = (rp: any) => norm([rp.neighborhood, rp.address, rp.title].join(' '));
      let roomix: any[] = (rmPropsData || [])
        .filter((rp: any) => locOk(rmxLocText(rp)))
        .filter((rp: any) => budgetOk(Number(rp.price) || 0, rp.currency))
        .filter((rp: any) => roomsOk(rp.bedrooms ?? rp.rooms))
        .filter((rp: any) => bathOk(rp.bathrooms))
        .filter((rp: any) => agencyMatch(rp.roomix_agency_name))
        .map((rp: any) => ({
          id: `roomix_${rp.slug}`,
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

      // ─── Notas del director: lista de recomendadas (con su inmobiliaria) para que la IA pueda cruzarlas ───
      let recommendedListStr = "";
      if (buscadorNotes) {
        const fmt = (p: any, tag: string) => `- [${tag}] "${p.title}"${p.address ? `, ${p.address}` : ""}`;
        recommendedListStr = [
          ...propias.map((p: any) => fmt(p, "propia")),
          ...agencia.map((p: any) => fmt(p, "agencia")),
          ...roomix.map((p: any) => fmt(p, `inmobiliaria: ${p.roomix_agency_name || "externa"}`)),
        ].join("\n");
      }

      // Marca de actividad de la sesión (sin esconder propiedades: el refinamiento debe poder re-mostrar coincidencias)
      await supabase.from('consultor_chat_sessions')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', currentSessionId);

      // Build context for the AI (concise and instructional)
      const totalResults = allNewProps.length;
      propertyContext = totalResults > 0
        ? `Se encontraron ${totalResults} propiedades (${propias.length} propias, ${agencia.length} de la agencia, ${roomix.length} de la red de colaboración). Se muestran agrupadas en 3 secciones en la UI.
${pisoFallback ? `AVISO IMPORTANTE: El usuario buscó un "piso" (depto planta completa) pero no se encontró ninguno. Se muestran departamentos como alternativa. Comunicale esto claramente al INICIO de tu respuesta.` : ''}
Respondé con un resumen MUY BREVE (2-4 oraciones): cuántas encontraste y ofrecé refinar la búsqueda.`
        : `No se encontraron propiedades con esos criterios.${pisoFallback ? ' Tampoco se encontraron departamentos.' : ''} Explicá cordialmente y sugerí alternativas concretas (ampliar zona, cambiar precio, quitar algún filtro).`;

      // Conocimiento extra del director (notas) + lista de recomendadas para cruzar
      if (buscadorNotes && totalResults > 0) {
        propertyContext += `

NOTAS Y DIRECTIVAS INTERNAS DE LA DIRECCIÓN (interpretalas con criterio):
"""
${buscadorNotes}
"""
PROPIEDADES RECOMENDADAS EN ESTA RESPUESTA (para cruzar con las notas):
${recommendedListStr}
INSTRUCCIÓN SOBRE NOTAS: Interpretá las notas y directivas de arriba. Si alguna propiedad recomendada, o su inmobiliaria, coincide o se relaciona con algo de esas notas, comunicáselo al asesor/director como una consideración o nota a tener en cuenta, citando lo relevante de forma breve. Es la única excepción a la regla de no describir propiedades en el texto.`;
      }
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

    MEMORIA DE LA CONVERSACIÓN:
    - Tenés memoria de TODO este chat. Seguí el hilo: no repitas propiedades ya mostradas ni vuelvas a preguntar lo ya respondido.
    - Si el usuario refina ("y con pileta", "más barato", "en otra zona"), entendelo como ajuste sobre la búsqueda previa, no como una búsqueda nueva desde cero.

    CONTEXTO DE BÚSQUEDA ACTUAL:
    ${isRetrieval ? propertyContext : 'El usuario no está buscando propiedades. Respondé normalmente y, si corresponde, retomá lo conversado.'}

    Respondé SIEMPRE en español de Argentina.`;


    const chatResult = await openaiIA.generateContent({
      contents: [
        { role: 'user', parts: [{ text: systemPrompt }] },
        ...priorTurns.map((m: any) => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.content }]
        })),
        { role: 'user', parts: [{ text: message }] }
      ]
    });

    const assistantContent = chatResult.response.text();

    // ─── Record real token usage (input + output) ─────────────────────────
    // openaiIA usa GPT-4.1-mini. Precio desde la tabla central (utils/aiCostCalculator).
    const consultor_usage = chatResult.response.usageMetadata;
    if (consultor_usage) {
      const inputTk = consultor_usage.promptTokenCount ?? 0;
      const outputTk = consultor_usage.candidatesTokenCount ?? 0;
      const { totalCostUSD } = calculateCost({ model: "gpt-4.1-mini", inputTokens: inputTk, outputTokens: outputTk });
      updateAiTransactionCost(txId, inputTk, outputTk, totalCostUSD);
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
