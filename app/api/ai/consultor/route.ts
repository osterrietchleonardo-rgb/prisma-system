import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { generateEmbedding } from "@/lib/gemini";
import { openaiIA } from "@/lib/openai";
import { NextResponse } from "next/server";
import { consumeAiCredits, requireTenant, updateAiTransactionCost } from "@/lib/auth/tenant-validation";
import { normalizarImagenes, urlsFotoRed } from "@/lib/acm/fotos-url";
import { poligonoParaSql } from "@/lib/mapa/poligono-sql";
import { fusionarFiltrosDeZona } from "@/lib/mapa/filtros-de-zona";
import { calculateCost, tokensFromUsage } from "@/utils/aiCostCalculator";

export const dynamic = "force-dynamic";

/**
 * Cuántas propiedades vuelven por sección (propias, agencia, red de colaboración).
 *
 * Eran 10 y quedaba corto: en un barrio grande hay cientos que cumplen, y el asesor
 * necesita la lista para elegir, no una muestra. Las tarjetas van dentro de un contenedor
 * con scroll propio, así el chat no se vuelve infinito (ver consultor-results.tsx).
 *
 * El costo no está en rankear —la función SQL puntúa TODAS las filas igual, el tope solo
 * recorta el final— sino en traer las fichas completas y guardarlas en el historial del
 * chat. Por eso 100 y no 500.
 */
const TOPE_POR_SECCION = 100;

/**
 * Cuántas candidatas junta la red antes de frenar, sin ordenarlas.
 *
 * Para "3 ambientes en Belgrano" hay 6.739 avisos que coinciden. La función vieja los leía
 * TODOS para poder ordenarlos por parecido: 140 MB de disco y 15 s la primera vez. Frenando en
 * 8.000 el resultado es idéntico —se verificó propiedad por propiedad en cinco zonas— y pone un
 * techo: ningún barrio puede costar más, por grande que sea.
 */
const CANDIDATAS_ANTES_DE_FRENAR = 8000;

/**
 * Lo mismo, pero cuando el asesor acotó a una zona que dibujó a mano.
 *
 * Se frena mucho antes y es a propósito. Un dibujo del tamaño de un barrio puede tener miles
 * adentro ("zona prueba": 8.856), y leerlas todas para ordenarlas cuesta lo mismo que una
 * búsqueda por barrio: 17,8 s la primera vez, medido. Con 1.500 son 134 ms.
 *
 * Se resigna algo: entre las 8.856 de adentro, las 100 que se muestran salen de las primeras
 * 1.500 que encuentra, no de todas. Vale la pena porque acá el filtro fuerte YA es la zona —
 * el asesor marcó el área justamente para no tener que elegir entre miles— y porque Leonardo
 * lo pidió así: "que muestre las 100, lo más fácil".
 */
const CANDIDATAS_CON_ZONA = 1500;

/** Debajo de esto, un filtro de amenities se afloja solo y se le avisa al asesor. */
const MINIMO_ANTES_DE_AFLOJAR = 20;

export async function POST(req: Request) {
  try {
    const { message, sessionId, history } = await req.json();
    const { userId, agencyId } = await requireTenant();
    console.log("Buscador IA Request:", { message, sessionId, agencyId });

    // ─── Cronómetro por etapa ───
    // Sin esto, un pedido de 13 s es una caja negra: no se distingue el SQL de la espera al
    // modelo. Cada etapa deja su medición en el log, en milisegundos.
    const t0 = Date.now();
    const tramos: Record<string, number> = {};
    let ultimo = t0;
    const marcar = (etapa: string) => { const ahora = Date.now(); tramos[etapa] = ahora - ultimo; ultimo = ahora; };
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
      .select('role, content, metadata')
      .eq('session_id', currentSessionId)
      .order('created_at', { ascending: true });
    // Turnos previos = todo menos el mensaje actual (último insertado). Limitamos a los últimos 12.
    const priorTurns = (convoRows || []).slice(0, -1).slice(-12);

    // ─── Qué propiedades ya vio el asesor en esta búsqueda ───
    // No hace falta guardarlas en ningún lado nuevo: cada respuesta del asistente ya deja las
    // que mostró en su `metadata`. Se juntan todas las de la sesión para que, cuando pida
    // "mostrame otras", no le vuelvan las mismas.
    // El `metadata` viejo (chats anteriores a las tres secciones) es un array suelto: se
    // contempla para que el historial no se rompa.
    const yaMostradas = new Set<string>();      // cartera propia y de la agencia
    const yaMostradasRed = new Set<string>();   // red de colaboración, con el id de la tabla
    for (const fila of (convoRows || [])) {
      const mp: any = (fila as any).metadata?.matchedProperties;
      if (!mp) continue;
      const grupos = Array.isArray(mp) ? [mp] : [mp.propias, mp.agencia, mp.roomix];
      for (const g of grupos) for (const prop of (g || [])) {
        if (prop?.id) yaMostradas.add(String(prop.id));
        if (prop?.roomix_id) yaMostradasRed.add(String(prop.roomix_id));
      }
    }

    // ─── Las zonas que el usuario dibujo y guardo en el mapa ───
    // PRIVADAS: se filtra por user_id y no por agencia. Ni el director ve las de un asesor —
    // asi esta escrito en /api/mapa/zonas y asi tiene que seguir. Se consulta con el cliente
    // de servicio (que saltea RLS), por eso el filtro explicito no es opcional.
    let zonasDelUsuario: { id: string; nombre: string; geojson: any; filtros: any }[] = [];
    try {
      const { data: zonas } = await createAdminClient()
        .from("mapa_zonas")
        .select("id, nombre, geojson, filtros")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(200);
      zonasDelUsuario = (zonas || []) as any;
    } catch (zonaErr) {
      console.error("No se pudieron cargar las zonas del mapa:", zonaErr);
    }

    // 4. Intent Analysis + Keyword Extraction

    // Argentine real-estate slang mapper
    const SLANG_MAP: Record<string, string[]> = {
      piso:         ["piso"],          // En AR: depto que ocupa toda la planta del edificio
      depto:        ["departamento"],
      departamento: ["departamento"],
      duplex:       ["duplex"],
      // Tokko guarda los PH como tipo "Condo" en la cartera propia → incluimos ambos para no perderlos
      // (además del título, que suele decir "PH"). En roomix el patrón %condo% también matchea su tipo Condo.
      ph:           ["ph", "condo"],
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
      // Jerga: "espacio aéreo" / "expansión" / "aire libre" = CUALQUIER espacio exterior (balcón, terraza, patio, jardín, azotea).
      // Se matchea si está presente cualquiera → ideal para pedidos tipo "patio o balcón" sin penalizar por tener solo uno.
      "espacio aereo": ["balc", "terraza", "azotea", "patio", "jardin", "jardín", "expansion", "expansión", "aire libre", "solarium", "rooftop"],
      expansion:       ["balc", "terraza", "azotea", "patio", "jardin", "jardín", "expansion", "expansión", "aire libre", "solarium", "rooftop"],
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


    // Las zonas del asesor van al extractor para que pueda reconocer cual nombro. Solo los
    // nombres: el dibujo en si son cientos de coordenadas que no le sirven para nada al modelo
    // y costarian una fortuna en tokens.
    const zonasContext = zonasDelUsuario.length > 0
      ? `\n\nZONAS QUE ESTE USUARIO DIBUJO Y GUARDO EN EL MAPA (son suyas, nadie mas las ve):\n${zonasDelUsuario.map((z) => `- "${z.nombre}"`).join("\n")}\n`
      : '';

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
          "free_text_keywords": ["características concretas que NO entran en los filtros de arriba: ej 'frente', 'contrafrente', 'a estrenar', 'apto crédito', 'pozo/en construcción', 'reciclado', 'luminoso', 'al río', 'esquina', nombre de barrio cerrado/edificio, etc. Si no hay: []"],
          "search_summary": "frase corta en lenguaje natural que describe la búsqueda ACUMULADA del usuario (tipo, zona, ambientes, operación, presupuesto y matices subjetivos como 'luminoso', 'para una familia', 'a estrenar'). Ej: 'departamento 2 ambientes luminoso a estrenar en venta en Almagro hasta 120000 usd'. Si todavía no hay criterios concretos: ''",
          "force_search": false,
          "pedir_mas": false,
          "zona_dibujada": "el NOMBRE EXACTO, de la lista de abajo, de la zona que nombró; si no nombró ninguna: null"
        }

        REGLAS CRÍTICAS:
        - MANTENÉ EL CONTEXTO: si antes pidió "3 ambientes en La Plata" y ahora dice "que tengan pileta", el resultado debe incluir location La Plata, rooms 3 y amenity pileta.
        - "operation": "en alquiler"/"alquilar" → "alquiler"; "comprar"/"en venta" → "venta"; si no especifica → "ambas".
        - "piso" tiene DOS sentidos, NO los confundas:
            a) TIPO de propiedad (departamento de planta completa) → SOLO cuando dicen "un piso", "busco piso/pisos", "tipo piso" sin más → type_keywords: ["piso"].
            b) NIVEL del departamento en el edificio → cuando dicen "piso alto/bajo", "planta alta/baja", "un 7° piso", "piso 8", "que esté arriba/abajo" → floor_preference (NO lo metas en type_keywords).
        - "floor_preference": SOLO acepta "alto" | "bajo" | "medio" | null (nivel del depto). ALTO = del 6° piso para arriba (después del 5°). BAJO/MEDIO = de planta baja (0) hasta el 5° piso. "piso alto"/"bien arriba"/"última planta" → "alto". "piso bajo"/"planta baja"/"primeros pisos" → "bajo". "piso intermedio"/"ni muy alto ni muy bajo" → "medio". Si no hablan del nivel → null. OJO: "frente"/"al frente"/"contrafrente"/"lateral" NO son niveles (son orientación) → van a free_text_keywords, NUNCA a floor_preference.
        - "free_text_keywords": cualquier característica puntual que NO sea operación, tipo, zona, ambientes, baños, precio, ni un amenity del listado. Va literal y en minúsculas (ej: "frente", "apto crédito", "a estrenar", "pozo"). Estas se buscan como texto en TODA la ficha (título, descripción, dirección, etc.), no descartan resultados: solo ayudan a priorizar.
        - "depto"/"departamento" → ["departamento"].
        - AMBIENTES vs DORMITORIOS (¡NO los mezcles, es el error más caro!): "2 ambientes"/"2 amb"/"2 amb." → rooms: 2 (un ambiente = living/cocina + cada dormitorio). "2 dormitorios"/"2 cuartos"/"2 habitaciones"/"2 hab" → bedrooms: 2. Si solo dice "ambientes", llená rooms y dejá bedrooms en null (y viceversa).
        - "menos de 100 mil"/"hasta 100.000" → price_max: 100000.
        - price_currency: inferí la moneda. Venta suele ser USD; alquiler suele ser ARS. "dólares"/"USD" → "USD"; "pesos"/"$" → "ARS"; sin precio → null.
        - agency_keywords: SOLO si menciona una inmobiliaria/agencia puntual (ej: "propiedades de Cocucci", "las de RE/MAX"). Si no → [].
        - location_keywords SOLO si menciona zona/barrio/ciudad. Si no → [].
        - amenity_keywords: SOLO cosas concretas/verificables (cochera, pileta, sum, seguridad, balcón...). Adjetivos subjetivos ("luminoso", "moderno", "a estrenar", "amplio") NO van acá (esos se buscan por significado, no como filtro).
        - ESPACIO EXTERIOR (importante): si piden espacio al aire libre de forma genérica o con "o" (ej "patio o balcón", "balcón o terraza", "espacio aéreo", "aire libre", "con expansión", "algo afuera/al exterior", "espacio verde propio") → poné UN SOLO amenity: "espacio aereo" (NO listes patio y balcón por separado: así matchea si tiene CUALQUIERA y no se penaliza por tener solo uno). Listá el específico (ej solo "balcón", solo "patio") únicamente cuando pidan ESE puntual y excluyente.
        - JERGA INMOBILIARIA AR (traducí a los campos): "espacio aéreo/expansión/aire libre" → amenity "espacio aereo". "a estrenar/sin estrenar/nuevo/recién terminado" → free_text "a estrenar". "pozo/en pozo/del pozo/en construcción/preventa/desde pozo" → free_text "pozo". "apto crédito/apto banco/apto hipotecario" → free_text "apto credito". "apto profesional/uso profesional/apto oficina" → amenity "apto profesional". "semipiso" → type "departamento" + free_text "semipiso". "monoambiente/mono" → type "monoambiente". "dúplex/tríplex" → type "duplex". "PH" → type "ph". "frente/contrafrente/lateral" → free_text con ese término. "reciclado/a reciclar/a refaccionar/a remodelar" → free_text con ese término. "categoría/premium/de lujo/alta gama/super luxe" → free_text "categoria". "fondo/parque/jardín propio" → amenity "jardin". "cochera fija/cubierta/descubierta" → amenity "cochera". Términos subjetivos puros ("luminoso", "amplio", "moderno", "para la familia") NO van a filtros: van SOLO en search_summary (los captura el significado).
        - search_summary: SIEMPRE redactalo acumulando todo lo dicho (incluí los matices subjetivos). Es la base de la búsqueda por significado; nunca lo dejes vacío si ya hay aunque sea un criterio.
        - "zona_dibujada": el asesor tiene zonas que dibujó a mano en el mapa y les puso nombre. Si nombra una —"en BUSQUEDA MAXI", "dentro de la zona de Maxi", "en mi zona guardada", "la que dibujé ayer"— devolvé su NOMBRE EXACTO tal cual figura en la lista. Tolerá que la escriba distinto, en minúsculas o incompleta: "busqueda maxi", "la de maxi" y "MAXI" son la misma. Si no nombra ninguna, o si el nombre que dice no se parece a ninguna de la lista, devolvé null (nunca inventes uno). Si dos de la lista podrían ser, elegí null: después se le pregunta.
        - "pedir_mas": true SOLO cuando el usuario pide MÁS OPCIONES DE LO MISMO, sin cambiar ningún criterio: "mostrame más", "otras", "hay más?", "no me gustan, mostrame otras", "seguí", "más opciones", "y qué más tenés". Es false si CAMBIA o AGREGA algo (ahí es una búsqueda nueva, aunque diga "mostrame"): "ahora con cochera" → false, "mostrame en Núñez" → false, "más barato" → false. La diferencia importa: con true no se le repiten las propiedades que ya vio; con false se busca de nuevo desde cero.
        - "force_search": tu JUICIO sobre si el usuario quiere ver resultados YA con lo que haya, AUNQUE falten datos. Poné true si de CUALQUIER forma (no hay frase fija) da a entender que no tiene/no quiere dar más datos o que avancés: "mostrame igual", "dale mostrame", "quiero ver lo que hay", "no tengo más", "no importa", "lo que sea", "buscá ya", "avanzá", "así está bien", "no me preguntes más", "ya está", etc. Poné false si todavía está respondiendo/dando datos o pregunta otra cosa. Interpretá la intención humana, no busques palabras exactas.
        - Mensaje general ("qué tenés?", "mostrá propiedades") → intent: RETRIEVAL con todo []/null/ambas.
        - Saludo/charla → intent: GENERAL.
        ${zonasContext}${convoContext}
        ÚLTIMO MENSAJE DEL USUARIO: "${message}"` }]
      }]
    });

    marcar("1-modelo-extrae-filtros");
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
    let searchSummary = "";
    let forceSearch = false;
    /** El usuario pide MÁS de lo mismo: no se le repiten las que ya vio. */
    let pedirMas = false;
    /** Nombre de la zona dibujada que nombró, tal como figura en su lista. */
    let zonaPedida: string | null = null;

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
      searchSummary = typeof parsed.search_summary === "string" ? parsed.search_summary.trim() : "";
      forceSearch = parsed.force_search === true || parsed.force_search === "true";
      pedirMas = parsed.pedir_mas === true || parsed.pedir_mas === "true";
      zonaPedida = typeof parsed.zona_dibujada === "string" && parsed.zona_dibujada.trim() ? parsed.zona_dibujada.trim() : null;
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

    // Red de seguridad de "MOSTRAME OTRAS": si el modelo no lo marco pero el mensaje es
    // claramente un pedido de mas de lo mismo, se toma igual.
    //
    // Solo se aplica a mensajes CORTOS, y es a proposito: "mostrame otras" es pedir mas;
    // "mostrame otras en Nunez con cochera" es una busqueda nueva. Donde hay criterios nuevos
    // manda el modelo, que sabe distinguirlos; este regex solo cubre el caso en que el JSON
    // del extractor falle.
    if (!pedirMas) {
      const palabras = msgLower.trim().split(/\s+/).length;
      const pideMasSuelto =
        /\b(m[aá]s|otras?|otros?)\b/.test(msgLower) &&
        /\b(mostr\w*|ten[eé]s|hay|dame|ver|segu[ií]\w*)\b/.test(msgLower);
      if (palabras <= 6 && pideMasSuelto) pedirMas = true;
    }

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

    // Blindaje MONOAMBIENTE: en Tokko/roomix se guardan como Departamento/Apartment con 1 ambiente
    // (room_amount=1, sin dormitorio) y NO siempre lo dicen en el título. Si pidió SOLO monoambiente y no
    // dio cantidad, fijamos 1 ambiente: así se suman los que no escriben "monoambiente" (además del match
    // por título/descripción) y de paso ya no preguntamos "cuántos ambientes".
    const onlyMonoambiente = typeKeywords.length > 0 && typeKeywords.every((t: string) => t === "monoambiente");
    if (onlyMonoambiente && !roomsFilter && !bedroomsFilter) roomsFilter = 1;

    console.log("Search params:", { isRetrieval, operation, locationKeywords, typeKeywords, amenityKeywords, agencyKeywords, priceMax, priceMin, priceCurrency, roomsFilter, bedroomsFilter, bathroomsFilter, floorPreference, freeTextKeywords });

    // ─── La zona dibujada que nombró, convertida a algo que Postgres entienda ───
    // El modelo devuelve el nombre tal cual figura en la lista del usuario; acá se busca por
    // nombre normalizado (sin acentos ni mayúsculas) para tolerar cómo lo escribió.
    let zonaElegida: { nombre: string; poligono: string; filtros: any } | null = null;
    if (zonaPedida) {
      const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
      const z = zonasDelUsuario.find((x) => norm(x.nombre) === norm(zonaPedida!))
        || zonasDelUsuario.find((x) => norm(x.nombre).includes(norm(zonaPedida!)));
      const poligono = z ? poligonoParaSql(z.geojson) : null;
      if (z && poligono) {
        zonaElegida = { nombre: z.nombre, poligono, filtros: z.filtros || null };
      } else {
        // Se nombró una zona que no existe o cuyo dibujo está roto. NO se busca en todos lados
        // como si nada: el asesor acotó a propósito y merece saber que no se pudo.
        console.warn("Zona pedida sin resolver:", zonaPedida, z ? "(dibujo inválido)" : "(no está en su lista)");
      }
    }
    // ─── Los filtros con los que guardó la zona rellenan lo que no dijo hoy ───
    // Cuando dibujó el área tenía puestos operación, tipo, ambientes y presupuesto, y la zona
    // los guardó junto con el trazo. Volvérselos a preguntar es hacerle repetir lo que ya
    // definió. Gana siempre lo que dice en la conversación: la zona solo completa los huecos.
    let deLaZona: string[] = [];
    if (zonaElegida?.filtros) {
      const fusion = fusionarFiltrosDeZona(
        { operation, typeKeywords, roomsFilter, bedroomsFilter, priceMax, priceMin, priceCurrency },
        zonaElegida.filtros,
      );
      operation = fusion.criterios.operation;
      // El tipo guardado por el mapa pasa por el mismo traductor de jerga que usa el chat: sin
      // esto, una zona guardada como "PH" no encontraría los que Tokko guarda como "Condo".
      typeKeywords = fusion.criterios.typeKeywords.flatMap((t: string) => SLANG_MAP[t.toLowerCase().trim()] || [t]);
      roomsFilter = fusion.criterios.roomsFilter;
      bedroomsFilter = fusion.criterios.bedroomsFilter;
      priceMax = fusion.criterios.priceMax;
      priceMin = fusion.criterios.priceMin;
      priceCurrency = fusion.criterios.priceCurrency;
      deLaZona = fusion.tomadoDeLaZona;
      if (deLaZona.length) console.log("De los filtros guardados con la zona se tomó:", deLaZona.join(" · "));
    }

    console.log("Zona:", { zonaPedida, resuelta: zonaElegida?.nombre || null, tiene: zonasDelUsuario.length });

    // ─── COMPUERTA DE DATOS MÍNIMOS ───────────────────────────────────────────
    // Pedimos los 5 datos clave (operación, tipo, zona, ambientes, presupuesto) para que la búsqueda
    // salga con la mayor info posible. Mientras falte alguno, NO se busca: el asistente pregunta
    // (acumulando el contexto entre turnos). Si el usuario dice "no tengo más datos" / "buscá con
    // eso", se busca YA con lo que haya — pero solo de los DESEABLES, ver abajo.
    //
    // Los datos van en dos grupos, y la diferencia no es de gusto: es lo que evita que la consulta
    // se caiga. Sin zona, `match_roomix_ia` no tiene ningún índice que enganchar y termina leyendo
    // las 356.314 filas de roomix_properties: 25 s medidos contra el statement_timeout de 8 s del
    // rol authenticated. La búsqueda se corta y el asesor recibe "no encontré resultados", que es
    // falso. Por eso operación, zona y ambientes NO se saltean ni cuando el usuario pide ver igual:
    // sin ellos la búsqueda no falla "un poco", falla entera. La migración
    // 20260821191200_buscador_ia_timeout_roomix.sql tiene los números.
    //
    // El tipo y el presupuesto sí se saltean: acotan el resultado, pero su ausencia no rompe nada.

    /** Sin estos la consulta escanea la tabla entera y se cae por timeout. No son negociables. */
    const missingCritical: string[] = [];
    if (operation === "ambas") missingCritical.push("la operación (compra o alquiler)");
    // Una zona dibujada ES la ubicación, y de las buenas: se resuelve por índice geográfico en
    // 12 ms. Pedirle además el barrio a quien ya marcó el área en el mapa sería absurdo — y el
    // motivo por el que la zona era obligatoria (sin ella la consulta escaneaba la tabla entera
    // y moría por timeout) acá no aplica.
    if (locationKeywords.length === 0 && !zonaElegida) missingCritical.push("la zona o barrio");
    // Los ambientes tampoco se exigen cuando hay una zona dibujada, y por el mismo motivo que la
    // zona: eran obligatorios para que la consulta no escanease la tabla entera. Un dibujo la
    // acota a un puñado de manzanas por índice geográfico. Pedirle los ambientes a quien dijo
    // "mostrame lo que hay en mi zona" es ponerle un trámite sin razón.
    if (!roomsFilter && !bedroomsFilter && !zonaElegida) missingCritical.push("la cantidad de ambientes o dormitorios");

    /** Estos mejoran el resultado, pero si el usuario dice "mostrame lo que haya", se busca igual. */
    const missingNiceToHave: string[] = [];
    if (typeKeywords.length === 0) missingNiceToHave.push("el tipo de propiedad (depto, casa, PH, etc.)");
    if (!priceMax && !priceMin) missingNiceToHave.push("el presupuesto y la moneda (USD o ARS)");

    // Señal principal: el MODELO interpreta (force_search) si el usuario quiere ver YA con lo que haya,
    // dicho de cualquier forma (no hay frase detonadora fija). El regex queda SOLO de respaldo por si el
    // JSON del extractor falla (en ese caso forceSearch quedó en false y al menos cubrimos lo más común).
    const wantsAnywayRegex = /\b(mostr[aá]|busc[aá]|dame|d[ae]le|quiero ver|a ver|ver opcione|opcione|resultado)\b|\b(lo que (tengas|haya|hay|sea)|sin (m[aá]s|importar)|no tengo (m[aá]s|nada)|es lo que hay|con eso|igual mostr|mostr[aá]\s+igual|d[ae]le igual)\b/.test(msgLower);
    const wantsAnyway = forceSearch || wantsAnywayRegex;

    // Falta algo crítico → se pregunta, diga lo que diga el usuario. Falta solo algo deseable →
    // se pregunta salvo que haya pedido ver igual.
    // Con una zona dibujada tampoco se le pide el presupuesto ni el tipo antes de mostrar. El
    // asesor marcó un área en el mapa y preguntó qué hay adentro: eso es un pedido completo, no
    // uno a medias. Se le muestra y después se le ofrece afinar, que es el orden natural.
    const needsMoreInfo =
      isRetrieval && (missingCritical.length > 0 || (missingNiceToHave.length > 0 && !wantsAnyway && !zonaElegida));

    // Qué se le pide. Si ya dijo "mostrame lo que haya", no tiene sentido insistirle con el
    // presupuesto: se le piden SOLO los críticos, que son los que impiden buscar.
    const missingRequired = wantsAnyway ? missingCritical : [...missingCritical, ...missingNiceToHave];

    let newMatchedProperties: any[] = [];
    let propertyContext = "";
    let pisoFallback = false;

    // Queda en el log qué faltó y de qué grupo: sin esto, un "no encontré resultados" en
    // producción no se distingue de una búsqueda que ni siquiera llegó a correr.
    console.log("Compuerta:", { needsMoreInfo, wantsAnyway, missingCritical, missingNiceToHave, pedirMas, yaVistas: yaMostradas.size });

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
          // Monoambiente: ampliamos el tipo a Departamento/Apartment para agarrar también los que NO escriben
          // "monoambiente" en el título (ya quedan acotados a 1 ambiente por el filtro de ambientes de arriba).
          if (onlyMonoambiente) {
            propTypePatterns = Array.from(new Set([...propTypePatterns, '%departamento%']));
            rmxTypePatterns = Array.from(new Set([...rmxTypePatterns, '%apartment%', '%accommodation%', '%studio%']));
          }
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
      // CLAVE: NO embebemos el último mensaje suelto (en turnos de refinamiento puede ser "Comprar", "sí",
      // "dale" → vector sin sentido que hace colapsar el escaneo vectorial sobre las 356k filas de roomix).
      // Embebemos una consulta ACUMULADA: criterios estructurados + el resumen en lenguaje natural (que
      // captura también los matices subjetivos tipo "luminoso"). Fallback al mensaje crudo solo si no hay nada.
      const canonicalQuery = [
        operation !== "ambas" ? (operation === "venta" ? "en venta" : "en alquiler") : "",
        typeKeywords.length ? typeKeywords.join(" o ") : "",
        roomsFilter ? `${roomsFilter} ambientes` : "",
        bedroomsFilter ? `${bedroomsFilter} dormitorios` : "",
        locationKeywords.length ? `en ${locationKeywords.join(", ")}` : "",
        amenityKeywords.length ? `con ${amenityKeywords.join(", ")}` : "",
        freeTextKeywords.length ? freeTextKeywords.join(", ") : "",
        priceMax ? `hasta ${priceMax} ${priceCurrency || ""}`.trim() : "",
      ].filter(Boolean).join(" ");
      const embeddingText = [canonicalQuery, searchSummary]
        .map((s) => (s || "").trim())
        .filter((s) => s.length > 0)
        .join(". ")
        .trim() || message;
      console.log("Embedding query text:", embeddingText);

      marcar("2-preparar-busqueda");
      let queryEmbeddingStr: string | null = null;
      try {
        const emb = await generateEmbedding(embeddingText, 'RETRIEVAL_QUERY');
        if (Array.isArray(emb) && emb.length > 0) queryEmbeddingStr = `[${emb.join(',')}]`;
      } catch (embErr) {
        console.error('Query embedding fallo (se usa ranking estructural):', embErr);
      }

      marcar("3-embedding-de-la-consulta");
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
        // El dibujo de la zona, si nombró una. En null la función busca en todos lados, igual
        // que siempre.
        p_poligono: zonaElegida?.poligono ?? null,
      };
      let propiasRanked: any[] = [];
      let agenciaRanked: any[] = [];
      if (!askingExternalAgency) {
        const [ownRes, agRes] = await Promise.all([
          supabase.rpc('match_properties_ia', { ...propArgs, p_agency_id: agencyId, p_include_agent: userId, p_limit: TOPE_POR_SECCION }),
          supabase.rpc('match_properties_ia', { ...propArgs, p_agency_id: agencyId, p_exclude_agent: userId, p_limit: TOPE_POR_SECCION }),
        ]);
        if (ownRes.error) console.error('match_properties_ia (propias) error:', ownRes.error);
        if (agRes.error) console.error('match_properties_ia (agencia) error:', agRes.error);
        propiasRanked = ownRes.data || [];
        agenciaRanked = agRes.data || [];
        // `match_properties_ia` no sabe excluir, así que las ya vistas se sacan acá. Son 100
        // filas como mucho: filtrarlas en memoria no cuesta nada y evita tocar esa función,
        // que también usa el ACM.
        if (pedirMas) {
          propiasRanked = propiasRanked.filter((r: any) => !yaMostradas.has(String(r.id)));
          agenciaRanked = agenciaRanked.filter((r: any) => !yaMostradas.has(String(r.id)));
        }
      }

      marcar("4-sql-cartera-propia-y-agencia");
      // ── 3) ROOMIX: una llamada (sobre las 54k, sin límite de 400) ──
      const rmxArgs = {
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
        // Cuántas candidatas junta antes de frenar. Con 8.000 devuelve exactamente las mismas
        // 100 que la función vieja (verificado en Belgrano, Palermo, Retiro, Villa Ortúzar y
        // Puerto Madero) y en los barrios grandes tarda menos de la mitad. Ver la migración
        // 20260826030000_buscador_red_frena_y_rankea.sql.
        p_poligono: zonaElegida?.poligono ?? null,
        p_candidatas: zonaElegida ? CANDIDATAS_CON_ZONA : CANDIDATAS_ANTES_DE_FRENAR,
        // Cuando pide "mostrame otras", las que ya vio quedan afuera de la búsqueda. Los ids
        // de la red vienen con el prefijo `roomix_` en la pantalla; en la tabla no lo llevan.
        p_excluir_ids: pedirMas ? [...yaMostradasRed] : [],
        p_limit: TOPE_POR_SECCION,
      };

      // ─── La red se consulta con el cliente de servicio, no con la sesión del usuario ───
      // El tope de 8 s que cortaba la búsqueda NO es de la base: lo pone el rol `authenticator`
      // con el que entra PostgREST, y del que heredan `anon` y `authenticated`. `service_role`
      // no tiene tope propio, así que por este camino la consulta puede terminar (Belgrano tarda
      // 4,9 s en frío; Rosario y Córdoba pasan de 8 s y hasta ahora morían siempre).
      //
      // Que esto NO abre ninguna puerta: `roomix_properties` es de lectura pública — su única
      // política de seguridad es SELECT para `public` con condición `true` (verificado en
      // pg_policies el 25-ago-2026). Es la misma tabla que ya podía leer cualquier sesión; lo
      // único que cambia es el tiempo que se le permite tardar. La cartera propia y la de la
      // agencia SIGUEN yendo por la sesión del usuario, que es donde el aislamiento importa.
      const redDb = createAdminClient();
      let { data: rmxRanked, error: rmxErr } = await redDb.rpc('buscar_roomix', rmxArgs);

      // ─── Si los amenities dejaron muy poco, se afloja el filtro y se avisa ───
      // Los amenities ahora DESCARTAN (antes solo sumaban puntos: pedías cochera y te mostraba
      // igual las que no tienen). El riesgo es quedarse en cero: "3 ambientes en Coghlan con
      // pileta y parrilla" puede no existir. Entonces, si con el filtro estricto quedan menos de
      // 20, se busca de nuevo sin los amenities y se le dice al asesor cuántas los cumplen de
      // verdad. Es la misma idea que ya se usa cuando se pide un "piso" y no hay ninguno.
      let redAflojada: { pedidos: string[]; estrictas: number } | null = null;
      if (!rmxErr && amenityPatterns.length > 0 && (rmxRanked || []).length < MINIMO_ANTES_DE_AFLOJAR) {
        const estrictas = (rmxRanked || []).length;
        const sinAmenities = await redDb.rpc('buscar_roomix', { ...rmxArgs, p_amenity_patterns: [] });
        if (!sinAmenities.error && (sinAmenities.data || []).length > estrictas) {
          rmxRanked = sinAmenities.data;
          redAflojada = { pedidos: amenityKeywords, estrictas };
          console.log(`Red: con ${amenityKeywords.join(' + ')} solo ${estrictas}; se aflojó a ${(rmxRanked || []).length}`);
        }
      }

      // ─── Un solo reintento cuando la red se corta por tiempo ───
      // La consulta de la red vive contra el techo de 8 s del rol `authenticated`: medido el
      // 25-ago-2026 contra producción, la MISMA búsqueda tarda entre 2,3 s y 9,6 s según si los
      // datos ya están en memoria. Cuando se pasa, el intento fallido igual dejó calientes las
      // páginas que alcanzó a leer, y el segundo pasa cómodo: 297 ms, 373 ms y 246 ms medidos
      // en las tres corridas siguientes a un timeout.
      // Por eso se reintenta UNA vez y solo ante 57014 (statement timeout). No es el arreglo de
      // fondo —ese es que la consulta no tarde 9 s— pero le devuelve al asesor las propiedades
      // de la red en vez de un "no encontré nada" que es falso.
      if (rmxErr && (rmxErr as any).code === '57014') {
        console.warn('buscar_roomix se cortó por tiempo; reintentando una vez');
        const reintento = await redDb.rpc('buscar_roomix', rmxArgs);
        rmxRanked = reintento.data;
        rmxErr = reintento.error;
        console.log('Reintento de la red →', rmxErr ? 'falló de nuevo' : `${(rmxRanked || []).length} propiedades`);
      }

      // Si la red de colaboración FALLA (típicamente 57014: se cortó por el statement_timeout de 8 s
      // del rol authenticated), la RPC devuelve null y hasta ahora eso se contaba como "0 propiedades".
      // No es lo mismo: "no hay nada publicado" y "no pudimos preguntar" son dos respuestas distintas,
      // y la primera es falsa. Medido el 25-ago-2026: de 16 búsquedas del día, 8 volvieron con 0 de la
      // red teniendo la red propiedades (Belgrano: 14.593 avisos). El asistente terminó diciéndole a una
      // asesora "no tengo acceso a propiedades fuera de la cartera de PRISMA" y se fue a Zonaprop.
      const redFallo = !!rmxErr;
      if (rmxErr) console.error('buscar_roomix error:', rmxErr);
      console.log('RPC counts → propias:', propiasRanked.length, 'agencia:', agenciaRanked.length, 'roomix:', (rmxRanked || []).length, redFallo ? '(LA RED FALLÓ)' : '');

      marcar("5-sql-red-de-colaboracion");
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
        const { data: fullRmx } = await redDb.from('roomix_properties').select('*').in('id', rmxIds);
        for (const row of (fullRmx || [])) rmxRowsById[(row as any).id] = row;
      }
      const roomix = (rmxRanked || []).map((r: any) => {
        const rp = rmxRowsById[r.id];
        if (!rp) return null;
        return {
          id: `roomix_${rp.slug}`,
          // El id de la pantalla lleva el prefijo y el slug, no el de la tabla. Se guarda el
          // real aparte para poder excluir con exactitud las que el asesor ya vio cuando pide
          // "mostrame otras".
          roomix_id: rp.id,
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
          // El `.webp` que publica roomix da 404 en su propio CDN el 12% de las veces
          // y la foto queda rota (ver `normalizarFotoRoomix`).
          images: urlsFotoRed(normalizarImagenes(rp.images)),
          description: rp.description || '',
          amenities: rp.amenities || [],
          source: 'roomix',
          match_pct: r.match_pct ?? null,
          similarity: r.match_pct ?? 0,
          roomix_agency_name: rp.roomix_agency_name?.trim() || 'Inmobiliaria colaboradora',
          roomix_agency_logo: rp.roomix_agency_logo,
          roomix_agency_source_url: rp.roomix_agency_source_url,
          canonical_url: rp.canonical_url,
          // Link al aviso puntual (no al listado de la inmobiliaria) y contacto del colega:
          // estaban en la tabla y nunca llegaban a la pantalla, así que el asesor veía la
          // propiedad pero no tenía cómo coordinar la visita.
          source_listing_url: rp.source_listing_url,
          roomix_agency_phone: rp.phone,
          roomix_agency_whatsapp: rp.whatsapp,
          agent_name: rp.roomix_agency_name?.trim() || 'Inmobiliaria colaboradora',
          agent_email: '',
        };
      }).filter(Boolean);

      marcar("6-traer-fichas-completas");
      newMatchedProperties = { propias, agencia, roomix } as any;
      const allNewProps = [...propias, ...agencia, ...roomix];

      // ─── Notas del director: lista de recomendadas (con su inmobiliaria) para que la IA pueda cruzarlas ───
      // Solo las mejores de cada sección: la pantalla muestra hasta 100 por sección, pero
      // mandarle las 300 al modelo serían miles de tokens en cada mensaje y las notas se cruzan
      // igual de bien contra las que encabezan el ranking, que son las que el asesor va a mirar.
      const TOPE_PARA_LA_IA = 12;
      let recommendedListStr = "";
      if (buscadorNotes) {
        const fmt = (p: any, tag: string) => `- [${tag}] "${p.title}"${p.address ? `, ${p.address}` : ""}`;
        recommendedListStr = [
          ...propias.slice(0, TOPE_PARA_LA_IA).map((p: any) => fmt(p, "propia")),
          ...agencia.slice(0, TOPE_PARA_LA_IA).map((p: any) => fmt(p, "agencia")),
          ...roomix.slice(0, TOPE_PARA_LA_IA).map((p: any) => fmt(p, `inmobiliaria: ${p.roomix_agency_name || "externa"}`)),
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

      // ─── Se buscó adentro de un dibujo: decirlo, y decir con qué criterios ───
      // Va PEGADO ADELANTE del contexto y no agregado al final, por dos razones. La primera es
      // que acá `propertyContext` recién se asignó con `=`: cualquier cosa escrita antes de esta
      // línea se pierde (me pasó, y el aviso nunca llegó al modelo). La segunda es que puesto al
      // final, entre las demás notas, el modelo lo pasaba por arriba y contestaba "encontré 100
      // propiedades en la zona" sin nombrarla. Las dos cosas, verificadas en el navegador.
      if (zonaElegida) {
        const conQue = deLaZona.length > 0
          ? ` Y NO le preguntaste nada porque esos criterios (${deLaZona.join(", ")}) salieron de los filtros con los que ÉL MISMO guardó esa zona: decile cuáles usaste, en la misma frase, y ofrecele cambiarlos si hoy busca otra cosa.`
          : "";
        propertyContext = `ARRANCÁ TU RESPUESTA POR ESTO, es lo primero que tiene que leer: todo lo que sigue está DENTRO de la zona que el asesor dibujó y guardó como "${zonaElegida.nombre}". Nombrala con esas palabras exactas para que sepa que se respetó su dibujo.${conQue}\n\n` + propertyContext;
      } else if (zonaPedida) {
        // Nombró una zona que no se pudo resolver. Lo peor sería buscar en todos lados y
        // mostrarle 100 propiedades como si nada: acotó a propósito.
        propertyContext = `OJO — NOMBRÓ UNA ZONA QUE NO ENCONTRÉ: dijo "${zonaPedida}" y no coincide con ninguna de las zonas que tiene dibujadas${zonasDelUsuario.length ? ` (las suyas son: ${zonasDelUsuario.map((z) => z.nombre).join(", ")})` : " (no tiene ninguna guardada todavía)"}. Lo de abajo se buscó SIN esa zona. Decíselo antes que nada y preguntale cuál quiso decir.\n\n` + propertyContext;
      }

      // Pidió más: que el modelo lo diga como lo que es, una tanda nueva, y no como si
      // hubiera vuelto a buscar de cero.
      if (pedirMas) {
        propertyContext += `
SON PROPIEDADES NUEVAS: el asesor pidió ver más y estas NO se le mostraron antes en este chat (se excluyeron las ${yaMostradas.size} que ya vio). Decíselo en una frase para que sepa que no son las mismas.`;
      }

      // El asesor pidió amenities y no alcanzaban: se le muestra más, pero se le dice la verdad.
      if (redAflojada) {
        propertyContext += `
SOBRE LO QUE PEDISTE DE MÁS (${redAflojada.pedidos.join(", ")}): en la red solo ${redAflojada.estrictas === 0 ? "no hay ninguna" : `hay ${redAflojada.estrictas}`} que lo cumpla en esta zona con el resto de los criterios. Para que el asesor tenga con qué comparar se agregaron propiedades que NO lo tienen. Decíselo en una frase, sin vueltas, al principio de tu respuesta.`;
      }

      // La red no contestó: hay que DECIRLO. Si no, el resumen sale como "encontré 10" (las de
      // la agencia) y el asesor se queda pensando que afuera no hay nada.
      if (redFallo) {
        propertyContext += `\nAVISO OBLIGATORIO — LA RED DE COLABORACIÓN NO RESPONDIÓ: la búsqueda en la red de colaboración (los avisos publicados por otras inmobiliarias) se cortó por un problema técnico, así que lo que ves arriba NO la incluye. NO digas ni des a entender que afuera de la agencia no hay propiedades: no lo sabemos. Decíselo en una frase corta y ofrecele reintentar en un momento.`;
      }

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
    const systemPrompt = `Eres el "Buscador IA" de la inmobiliaria PRISMA. Sos el asistente experto para buscar propiedades.

    DÓNDE BUSCÁS (importante, es lo que más se malinterpreta):
    Cada búsqueda tuya mira TRES lugares a la vez, y los resultados se muestran en tres secciones separadas:
    1. PROPIAS: las propiedades cargadas por el propio asesor.
    2. DE LA AGENCIA: las del resto de la inmobiliaria.
    3. RED DE COLABORACIÓN: avisos publicados por OTRAS inmobiliarias, tomados de los portales. Son cientos de miles y cubren todo el país. NO son de la agencia: son de afuera.
    - Por eso, cuando el usuario pide "buscá fuera de la oficina", "afuera", "en otras inmobiliarias", "algo que no sea nuestro" o similar, la respuesta NO es que no podés: la red de colaboración es exactamente eso, y ya la buscaste. Contale qué apareció en esa sección.
    - REGLA ANTI-ERROR (no negociable): NUNCA digas "no tengo acceso a propiedades fuera de la cartera de PRISMA", "solo puedo ver la cartera de la agencia" ni nada parecido. Es FALSO y hace que el asesor se vaya a buscar a un portal.
    - Lo único que NO podés hacer es consultar un portal EN VIVO (Zonaprop, Argenprop, MercadoLibre) en este momento. Si te lo piden por nombre, aclará esa diferencia sin negar la red: los avisos de esos portales que ya están relevados sí los ves, en la sección Red de colaboración.
    - Si el contexto dice que la red de colaboración NO respondió, decilo tal cual: se cortó, no es que afuera no haya nada.

    FORMATO DE RESPUESTA CRÍTICO:
    - Las propiedades encontradas se muestran automáticamente como tarjetas visuales con fotos, precio y detalles. NO las listes en texto.
    - Tu respuesta debe ser un resumen MUY BREVE y conversacional (2-4 oraciones cuando hay resultados).
    - Si hay pisoFallback activo: empezá diciendo que no encontraste pisos pero sí departamentos.
    - Si hay amenities parciales: mencionalo ("Encontré 5 propiedades, algunas con parrilla pero sin pileta — podés verlo en las tarjetas").
    - Si no hay resultados: explicá por qué y sugerí 2-3 alternativas concretas.
    - Si el usuario pide más detalle de una propiedad específica, ahí sí describí sus características.
    - REGLA ANTI-ERROR (no negociable): NUNCA digas "mirá las tarjetas de abajo", "te muestro las opciones" ni des a entender que hay propiedades en pantalla si NO se encontró ninguna o si todavía no buscaste. Solo mencionás tarjetas/resultados cuando el contexto confirma que SÍ hay propiedades.

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
Tu tarea AHORA: pedile esos datos de forma natural, cálida y profesional (como un asesor experto que quiere entender bien la necesidad antes de mostrar). Reconocé lo que YA te dijo para no repreguntarlo. Podés agrupar 2-3 preguntas en una sola intervención fluida (no como formulario). Explicale en una frase por qué te sirve (para acotar y no hacerle perder tiempo). NO inventes ni menciones propiedades, y NO digas "mirá las tarjetas", "te muestro las opciones" ni nada que sugiera que hay resultados en pantalla: TODAVÍA NO HAY.${
          wantsAnyway
            ? `
OJO: el usuario YA te pidió ver resultados igual, y aun así le estás preguntando. Reconocé ese pedido antes que nada ("dale, vamos") y pedile SOLO lo que falta de arriba, que es lo mínimo indispensable para poder buscar — sin eso no hay búsqueda posible, no es que quede peor. Una sola pregunta corta y al hueso. No le pidas nada que no esté en esa lista, y no suene a que lo estás frenando.`
            : ""
        }`
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

    marcar("7-modelo-escribe-la-respuesta");
    console.log("Tiempos (ms):", { ...tramos, TOTAL: Date.now() - t0 });
    const assistantContent = chatResult.response.text();

    // ─── Record real token usage (input + output) ─────────────────────────
    // openaiIA usa GPT-5.4-mini. Precio desde la tabla central (utils/aiCostCalculator).
    const consultor_usage = chatResult.response.usageMetadata;
    if (consultor_usage) {
      const { inputTokens: inputTk, outputTokens: outputTk } = tokensFromUsage(consultor_usage);
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
