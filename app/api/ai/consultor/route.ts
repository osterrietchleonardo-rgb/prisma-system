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

    // Sinónimos de amenities/servicios para matchear contra tags Tokko + descripción + título.
    // Cada clave es lo que extrae la IA; el array son las grafías/sinónimos que se buscan en el texto.
    // Términos concretos (NO subjetivos como "luminoso/moderno": eso lo captura el embedding).
    const AMENITY_SYNONYMS: Record<string, string[]> = {
      // Exteriores / verde
      pileta:      ["pileta", "pool", "piscina", "nataci", "climatizada"],
      parrilla:    ["parrilla", "asador", "bbq"],
      quincho:     ["quincho", "parrilla", "asador"],
      "balcon":    ["balc"],
      "balcón":    ["balc"],
      terraza:     ["terraza", "azotea", "rooftop"],
      solarium:    ["solarium", "solárium", "solar"],
      jardin:      ["jardin", "jardín"],
      "jardín":    ["jardin", "jardín"],
      patio:       ["patio"],
      // Cochera / guardado
      cochera:     ["cochera", "garage", "garaje", "estacionamiento", "auto"],
      baulera:     ["baulera", "bauleras", "guardado"],
      // Espacios comunes / amenities
      sum:         ["sum ", "s.u.m", "salon de usos", "salón usos", "salon usos", "salon de fiestas"],
      amenities:   ["amenities", "amenidades", "espacios comunes", "espacio comun", "areas comunes", "áreas comunes", "espacios verdes"],
      gimnasio:    ["gimnasio", "gym", "fitness"],
      coworking:   ["coworking", "cowork", "business center", "sala de reunion", "sala de reuniones", "espacio de trabajo"],
      microcine:   ["microcine", "micro cine", "cine", "sala de cine"],
      spa:         ["spa", "wellness"],
      sauna:       ["sauna", "finlandes"],
      hidromasaje: ["hidromasaje", "jacuzzi", "yacuzzi"],
      laundry:     ["laundry", "lavanderia", "lavandería", "lavadero"],
      // Servicios del edificio
      vigilancia:  ["vigilancia", "seguridad", "portero", "porteria", "portería", "vigilador", "24 hs", "24hs", "24 horas"],
      ascensor:    ["ascensor"],
      // Confort interior (concretos)
      "aire acondicionado": ["aire acondicionado", "split", "climatizacion", "climatización", "aire frio calor"],
      calefaccion: ["calefaccion", "calefacción", "losa radiante", "radiadores"],
      dependencia: ["dependencia", "cuarto de servicio", "dormitorio de servicio", "toilette de servicio"],
      vestidor:    ["vestidor", "walking closet", "walk in closet"],
      // Uso
      "apto profesional": ["apto profesional", "uso profesional", "apto comercial", "apto oficina"],
      "apto mascota":     ["pet friendly", "pet-friendly", "apto mascota", "apto mascotas", "acepta mascotas"],
      amoblado:    ["amoblado", "amueblado", "equipado"],
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
          "amenity_keywords": ["TODOS los servicios/amenities/espacios comunes CONCRETOS que pida: cochera, baulera, pileta, parrilla, quincho, balcón, terraza, solarium, jardín, patio, sum, amenities, gimnasio, coworking, microcine, spa, sauna, hidromasaje, laundry, seguridad/vigilancia, ascensor, aire acondicionado, calefacción, dependencia, vestidor, apto profesional, apto mascota, amoblado, etc. Si no hay: []"],
          "agency_keywords": ["nombre de inmobiliaria/agencia puntual si la mencionan, si no: []"],
          "price_max": número o null,
          "price_min": número o null,
          "price_currency": "USD" | "ARS" | null,
          "rooms": número o null,
          "bedrooms": número o null,
          "bathrooms": número o null,
          "floor_preference": "alto" | "bajo" | "medio" | null,
          "free_text_keywords": ["características concretas que NO entran en los filtros de arriba: ej 'frente', 'contrafrente', 'a estrenar', 'apto crédito', 'pozo/en construcción', 'reciclado', 'luminoso', 'al río', 'esquina', nombre de barrio cerrado/edificio, etc. Si no hay: []"]
        }

        REGLAS CRÍTICAS:
        - MANTENÉ EL CONTEXTO: si antes pidió "3 ambientes en La Plata" y ahora dice "que tengan pileta", el resultado debe incluir location La Plata, rooms 3 y amenity pileta.
        - "operation": "en alquiler"/"alquilar" → "alquiler"; "comprar"/"en venta" → "venta"; si no especifica → "ambas".
        - "piso" tiene DOS sentidos, NO los confundas:
            a) TIPO de propiedad (departamento de planta completa) → SOLO cuando dicen "un piso", "busco piso/pisos", "tipo piso" sin más → type_keywords: ["piso"].
            b) NIVEL del departamento en el edificio → cuando dicen "piso alto/bajo", "planta alta/baja", "un 7° piso", "piso 8", "que esté arriba/abajo" → floor_preference (NO lo metas en type_keywords).
        - "floor_preference": ALTO = del 6° piso para arriba (después del 5°). BAJO/MEDIO = de planta baja (0) hasta el 5° piso. "piso alto"/"bien arriba"/"última planta" → "alto". "piso bajo"/"planta baja"/"primeros pisos" → "bajo". "piso intermedio"/"ni muy alto ni muy bajo" → "medio". Si no hablan del nivel → null.
        - "free_text_keywords": cualquier característica puntual que NO sea operación, tipo, zona, ambientes, baños, precio, ni un amenity del listado. Va literal y en minúsculas (ej: "frente", "apto crédito", "a estrenar", "pozo"). Estas se buscan como texto en TODA la ficha (título, descripción, dirección, etc.), no descartan resultados: solo ayudan a priorizar.
        - "depto"/"departamento" → ["departamento"].
        - AMBIENTES vs DORMITORIOS (¡NO los mezcles, es el error más caro!): "2 ambientes"/"2 amb"/"2 amb." → rooms: 2 (un ambiente = living/cocina + cada dormitorio). "2 dormitorios"/"2 cuartos"/"2 habitaciones"/"2 hab" → bedrooms: 2. Si solo dice "ambientes", llená rooms y dejá bedrooms en null (y viceversa).
        - "menos de 100 mil"/"hasta 100.000" → price_max: 100000.
        - price_currency: inferí la moneda. Venta suele ser USD; alquiler suele ser ARS. "dólares"/"USD" → "USD"; "pesos"/"$" → "ARS"; sin precio → null.
        - agency_keywords: SOLO si menciona una inmobiliaria/agencia puntual (ej: "propiedades de Cocucci", "las de RE/MAX"). Si no → [].
        - location_keywords SOLO si menciona zona/barrio/ciudad. Si no → [].
        - amenity_keywords: SOLO cosas concretas/verificables (cochera, pileta, sum, seguridad, balcón...). Adjetivos subjetivos ("luminoso", "moderno", "a estrenar", "amplio") NO van acá (esos se buscan por significado, no como filtro).
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
    let roomsFilter: number | null = null;
    let bedroomsFilter: number | null = null;
    let bathroomsFilter: number | null = null;
    let floorPreference: string | null = null;
    let freeTextKeywords: string[] = [];

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
      roomsFilter = parsed.rooms || null;
      bedroomsFilter = parsed.bedrooms || null;
      bathroomsFilter = parsed.bathrooms || null;
      const fp = (parsed.floor_preference || "").toString().toLowerCase().trim();
      floorPreference = ["alto", "bajo", "medio"].includes(fp) ? fp : null;
      freeTextKeywords = (parsed.free_text_keywords || [])
        .filter((k: string) => typeof k === "string" && k.trim().length > 1)
        .map((k: string) => k.toLowerCase().trim());
    } catch(e) {
      isRetrieval = intentResText.toUpperCase().includes("RETRIEVAL");
    }

    // Red de seguridad: si el usuario habló de "ambientes" pero el modelo lo metió en dormitorios,
    // lo corregimos por código (no dependemos solo del LLM para no volver a confundir las unidades).
    const mentionsAmbientes = /\bambient|\bamb\.?\b/i.test(message || "");
    if (mentionsAmbientes && !roomsFilter && bedroomsFilter) {
      roomsFilter = bedroomsFilter;
      bedroomsFilter = null;
    }

    // Red de seguridad de OPERACIÓN: si el usuario dijo claramente "venta/comprar" o "alquiler/alquilar"
    // en ESTE mensaje, lo respetamos por código aunque el modelo lo haya devuelto distinto o haya fallado
    // el JSON (en ese caso 'operation' quedaba en "ambas" y se mezclaban venta y alquiler).
    const msgLower = (message || "").toLowerCase();
    const saysVenta = /\b(venta|en venta|comprar|compra|comprando|adquirir)\b/.test(msgLower);
    const saysAlquiler = /\b(alquiler|alquilar|alquilando|renta|rentar|locaci[oó]n|locar)\b/.test(msgLower);
    if (saysVenta && !saysAlquiler) operation = "venta";
    else if (saysAlquiler && !saysVenta) operation = "alquiler";

    // Red de seguridad de PISO/NIVEL: si nombran nivel del depto en este mensaje, fijamos la preferencia
    // por código (sin pisar el tipo "piso planta completa"). Solo aplica si el modelo no la detectó.
    if (!floorPreference) {
      if (/\bpiso\s*alto|planta\s*alta|bien\s*arriba|[úu]ltim[oa]\s*piso|pisos?\s*altos\b/.test(msgLower)) floorPreference = "alto";
      else if (/\bpiso\s*bajo|planta\s*baja|primeros?\s*pisos|pisos?\s*bajos\b/.test(msgLower)) floorPreference = "bajo";
      else if (/\bpiso\s*(intermedio|medio)|nivel\s*medio\b/.test(msgLower)) floorPreference = "medio";
    }

    // Traducción de la preferencia de piso a una banda numérica (alto = 6+, bajo/medio = 0..5).
    let floorMin: number | null = null;
    let floorMax: number | null = null;
    if (floorPreference === "alto") { floorMin = 6; floorMax = null; }
    else if (floorPreference === "bajo" || floorPreference === "medio") { floorMin = 0; floorMax = 5; }

    console.log("Search params:", { isRetrieval, operation, locationKeywords, typeKeywords, amenityKeywords, agencyKeywords, priceMax, priceMin, priceCurrency, roomsFilter, bedroomsFilter, bathroomsFilter, floorPreference, freeTextKeywords });

    // ─── COMPUERTA DE DATOS MÍNIMOS ───────────────────────────────────────────
    // Antes de buscar/mostrar, exigimos los datos clave para que la consulta a la herramienta
    // salga con la mayor cantidad de info posible: operación, tipo, zona, ambientes y presupuesto.
    // Si falta alguno, NO se busca: el asistente pregunta primero (acumula el contexto entre turnos).
    const missingRequired: string[] = [];
    if (operation === "ambas") missingRequired.push("la operación (compra o alquiler)");
    if (typeKeywords.length === 0) missingRequired.push("el tipo de propiedad (depto, casa, PH, etc.)");
    if (locationKeywords.length === 0) missingRequired.push("la zona o barrio");
    if (!roomsFilter && !bedroomsFilter) missingRequired.push("la cantidad de ambientes o dormitorios");
    if (!priceMax && !priceMin) missingRequired.push("el presupuesto y la moneda (USD o ARS)");
    // Salida de escape: si el usuario pide ver igual, no lo bloqueamos.
    const wantsAnyway = /\b(mostr[aá](me)?\s+igual|lo que tengas|sin importar|de una|busc[aá] igual|igual mostr|ver(las)?\s+igual|d[ae]le igual)\b/.test(msgLower);
    const needsMoreInfo = isRetrieval && missingRequired.length > 0 && !wantsAnyway;

    let newMatchedProperties: any[] = [];
    let propertyContext = "";
    let pisoFallback = false;

    if (isRetrieval && !needsMoreInfo) {
      const FULL_SELECT = 'id, title, address, city, property_type, price, currency, bedrooms, bathrooms, total_area, covered_area, status, images, description, tokko_data, assigned_agent_id, assigned_agent, agent_profile:profiles(full_name, email)';

      // ─── ESTRATEGIA "Cartera_Propiedades" (paridad con n8n): filtros duros + embeddings + % match, todo en SQL ───
      // Funciones SQL: match_properties_ia (cartera propia/agencia) y match_roomix_ia (red de colaboración).
      // Hacen el filtro duro (operación, tipo, ambientes ±1, presupuesto ×1.20, zona) sobre TODAS las filas
      // (sin el viejo límite de 400), rankean por embedding (Gemini) y devuelven el % de coincidencia.
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

      // ── Patrones ILIKE para las funciones SQL ──
      const ilike = (arr: string[]) => arr.map((t) => `%${t}%`);
      let propTypePatterns: string[] = [];
      let rmxTypePatterns: string[] = [];
      if (typeKeywords.length > 0) {
        if (isPisoSearch) {
          propTypePatterns = ['%piso%', '%departamento%'];
          rmxTypePatterns = ['%piso%', '%apartment%', '%accommodation%'];
        } else {
          propTypePatterns = ilike(typeKeywords);
          const allTypes = [...typeKeywords];
          typeKeywords.forEach((t: string) => { const m = roomixTypeMap[t.toLowerCase()]; if (m) allTypes.push(...m); });
          rmxTypePatterns = ilike(Array.from(new Set(allTypes)));
        }
      }
      const locPatterns = ilike(locationKeywords);

      // Amenities → patrón regex (alternancia de sinónimos) por cada amenity pedida (lo evalúa SQL con ~*)
      const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const amenityPatterns = amenityKeywords.map((a: string) => {
        const aN = a.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        const terms = AMENITY_SYNONYMS[a.toLowerCase()] || AMENITY_SYNONYMS[aN] || [aN];
        return terms.map(escapeRe).join('|');
      });

      // Free-text → patrón regex literal por cada característica suelta (la SQL la busca con ~* en TODA la ficha,
      // sin descartar filas: solo prioriza las que la contienen). Acentos normalizados para matchear con/sin tilde.
      const freeTextPatterns = freeTextKeywords.map((t: string) =>
        escapeRe(t.normalize('NFD').replace(/[̀-ͯ]/g, '')));

      // Inmobiliaria externa puntual → solo red de colaboración filtrada por nombre
      const norm = (s: any) => (s ?? '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
      const alnum = (s: any) => norm(s).replace(/[^a-z0-9]/g, '');
      const ownAlnum = alnum(ownAgencyName);
      const askingExternalAgency = agencyKeywords.length > 0 && !agencyKeywords.some((k: string) => {
        const kk = alnum(k);
        return kk.length > 1 && (ownAlnum.includes(kk) || kk.includes(ownAlnum));
      });
      const agencyNamePatterns = askingExternalAgency ? ilike(agencyKeywords) : [];

      // ── Embedding de la consulta (RETRIEVAL_QUERY). Si falla, las funciones caen a ranking estructural. ──
      let queryEmbeddingStr: string | null = null;
      try {
        const emb = await generateEmbedding(message, 'RETRIEVAL_QUERY');
        if (Array.isArray(emb) && emb.length > 0) queryEmbeddingStr = `[${emb.join(',')}]`;
      } catch (embErr) {
        console.error('Query embedding fallo (se usa ranking estructural):', embErr);
      }

      // ── 1+2) PROPERTIES: dos llamadas (propias / agencia) ──
      const propArgs = {
        p_query_embedding: queryEmbeddingStr,
        p_operation: operation,
        p_type_patterns: propTypePatterns,
        p_rooms: roomsFilter,
        p_bedrooms: bedroomsFilter,
        p_bathrooms: bathroomsFilter,
        p_price_max: priceMax,
        p_price_min: priceMin,
        p_currency: priceCurrency,
        p_loc_patterns: locPatterns,
        p_amenity_patterns: amenityPatterns,
        p_floor_min: floorMin,
        p_floor_max: floorMax,
        p_free_text_patterns: freeTextPatterns,
      };
      let propiasRanked: any[] = [];
      let agenciaRanked: any[] = [];
      if (!askingExternalAgency) {
        const [ownRes, agRes] = await Promise.all([
          supabase.rpc('match_properties_ia', { ...propArgs, p_agency_id: agencyId, p_include_agent: userId, p_limit: 10 }),
          supabase.rpc('match_properties_ia', { ...propArgs, p_agency_id: agencyId, p_exclude_agent: userId, p_limit: 10 }),
        ]);
        if (ownRes.error) console.error('match_properties_ia (propias) error:', ownRes.error);
        if (agRes.error) console.error('match_properties_ia (agencia) error:', agRes.error);
        propiasRanked = ownRes.data || [];
        agenciaRanked = agRes.data || [];
      }

      // ── 3) ROOMIX: una llamada (sobre las 54k, sin límite de 400) ──
      const { data: rmxRanked, error: rmxErr } = await supabase.rpc('match_roomix_ia', {
        p_query_embedding: queryEmbeddingStr,
        p_operation: operation,
        p_type_patterns: rmxTypePatterns,
        p_rooms: roomsFilter,
        p_bedrooms: bedroomsFilter,
        p_bathrooms: bathroomsFilter,
        p_price_max: priceMax,
        p_price_min: priceMin,
        p_currency: priceCurrency,
        p_loc_patterns: locPatterns,
        p_amenity_patterns: amenityPatterns,
        p_agency_name_patterns: agencyNamePatterns,
        p_floor_min: floorMin,
        p_floor_max: floorMax,
        p_free_text_patterns: freeTextPatterns,
        p_limit: 10,
      });
      if (rmxErr) console.error('match_roomix_ia error:', rmxErr);
      console.log('RPC counts → propias:', propiasRanked.length, 'agencia:', agenciaRanked.length, 'roomix:', (rmxRanked || []).length);

      // ── Re-traer filas completas de properties por id (preserva join de perfil) y adjuntar match_pct ──
      const propIds = [...propiasRanked, ...agenciaRanked].map((r: any) => r.id);
      const propRowsById: Record<string, any> = {};
      if (propIds.length > 0) {
        const { data: fullRows } = await supabase.from('properties').select(FULL_SELECT).in('id', propIds);
        for (const row of (fullRows || [])) propRowsById[(row as any).id] = row;
      }
      const mapProp = (r: any, source: 'own' | 'agency') => {
        const p = propRowsById[r.id];
        if (!p) return null;
        return {
          ...p,
          source,
          match_pct: r.match_pct ?? null,
          similarity: r.match_pct ?? 0,
          agent_name: p.agent_profile?.full_name || p.assigned_agent?.name || 'Sin asignar',
          agent_email: p.agent_profile?.email || p.assigned_agent?.email || '',
          public_url: p.tokko_data?.public_url || null,
        };
      };
      const propias = propiasRanked.map((r: any) => mapProp(r, 'own')).filter(Boolean);
      const agencia = agenciaRanked.map((r: any) => mapProp(r, 'agency')).filter(Boolean);

      // ── Re-traer filas completas de roomix por id y mapear a la forma unificada (orden = ranking SQL) ──
      const rmxIds = (rmxRanked || []).map((r: any) => r.id);
      const rmxRowsById: Record<string, any> = {};
      if (rmxIds.length > 0) {
        const { data: fullRmx } = await supabase.from('roomix_properties').select('*').in('id', rmxIds);
        for (const row of (fullRmx || [])) rmxRowsById[(row as any).id] = row;
      }
      const roomix = (rmxRanked || []).map((r: any) => {
        const rp = rmxRowsById[r.id];
        if (!rp) return null;
        return {
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
          match_pct: r.match_pct ?? null,
          similarity: r.match_pct ?? 0,
          roomix_agency_name: rp.roomix_agency_name || 'Inmobiliaria colaboradora',
          roomix_agency_logo: rp.roomix_agency_logo,
          roomix_agency_source_url: rp.roomix_agency_source_url,
          canonical_url: rp.canonical_url,
          agent_name: rp.roomix_agency_name || 'Inmobiliaria colaboradora',
          agent_email: '',
        };
      }).filter(Boolean);

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

      // ─── Aviso sobre el piso/nivel: el dato está poco cargado, así que es un filtro SUAVE (no descarta) ───
      if (floorPreference) {
        const banda = floorPreference === "alto" ? "piso alto (6° o más)" : floorPreference === "bajo" ? "piso bajo (planta baja al 5°)" : "piso intermedio";
        propertyContext += `\nNOTA SOBRE EL PISO: El usuario pidió ${banda}. Prioricé las que tienen ese nivel confirmado, pero MUCHAS fichas no especifican el piso, así que también pueden aparecer sin dato (no las descarté). Aclarale brevemente que conviene confirmar el piso de las que no lo informan.`;
      }

      // ─── Conversacional: detectar qué datos clave faltan para sugerir 1-2 preguntas naturales ───
      const faltantes: string[] = [];
      if (operation === "ambas") faltantes.push("si es para venta o alquiler");
      if (locationKeywords.length === 0) faltantes.push("la zona/barrio");
      if (!priceMax && !priceMin) faltantes.push("el presupuesto y la moneda (USD/ARS)");
      if (!roomsFilter && !bedroomsFilter) faltantes.push("cuántos ambientes o dormitorios necesita");
      if (faltantes.length > 0) {
        propertyContext += `\nPARA AFINAR (importante, hacelo sonar natural y humano): Todavía no sabés ${faltantes.join(", ")}. Cerrá tu respuesta preguntando 1 o 2 de estas cosas (NO todas de golpe), de forma cálida y profesional, para acotar mejor la próxima búsqueda. Si hay un cliente detrás, preguntá pensando en él.`;
      }

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

    PERSONALIDAD Y ESTILO CONVERSACIONAL:
    - Profesional y cálido, 100% humano. Voseo formal ("tenés", "podés", "encontré", "mirá"). Nada robótico ni acartonado.
    - Sos un asesor experto que ASESORA, no un buscador que tira resultados. Mostrá criterio inmobiliario.
    - INDAGÁ para afinar: si faltan datos clave (operación, zona, presupuesto, ambientes), preguntá de forma natural 1 o 2 cosas por vez (nunca un interrogatorio). Si el contexto dice "PARA AFINAR", seguilo.
    - Cuando tenga sentido, preguntá pensando en el cliente final del asesor ("¿el cliente prioriza estar en piso alto o le importa más la zona?").
    - Siempre ofrecé refinar la búsqueda al final de tu respuesta.

    MEMORIA DE LA CONVERSACIÓN:
    - Tenés memoria de TODO este chat. Seguí el hilo: no repitas propiedades ya mostradas ni vuelvas a preguntar lo ya respondido.
    - Si el usuario refina ("y con pileta", "más barato", "en otra zona"), entendelo como ajuste sobre la búsqueda previa, no como una búsqueda nueva desde cero.

    CONTEXTO DE BÚSQUEDA ACTUAL:
    ${needsMoreInfo
      ? `TODAVÍA NO BUSQUÉS NI MUESTRES PROPIEDADES. El usuario quiere buscar pero faltan datos clave para traerle lo mejor. Faltan: ${missingRequired.join("; ")}.
Tu tarea AHORA: pedile esos datos de forma natural, cálida y profesional (como un asesor experto que quiere entender bien la necesidad antes de mostrar). Reconocé lo que YA te dijo para no repreguntarlo. Podés agrupar 2-3 preguntas en una sola intervención fluida (no como formulario). Explicale en una frase por qué te sirve (para acotar y no hacerle perder tiempo). NO inventes ni menciones propiedades: todavía no hay resultados.`
      : isRetrieval
        ? propertyContext
        : 'El usuario no está buscando propiedades. Respondé normalmente y, si corresponde, retomá lo conversado.'}

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
    // openaiIA usa GPT-5.4-mini. Precio desde la tabla central (utils/aiCostCalculator).
    const consultor_usage = chatResult.response.usageMetadata;
    if (consultor_usage) {
      const inputTk = consultor_usage.promptTokenCount ?? 0;
      const outputTk = consultor_usage.candidatesTokenCount ?? 0;
      const { totalCostUSD } = calculateCost({ model: "gpt-5.4-mini", inputTokens: inputTk, outputTokens: outputTk });
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
