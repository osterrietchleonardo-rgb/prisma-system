// ACM · Busca comparables reales de la propiedad sujeto en la cartera (properties)
// y en la red de colaboración (roomix_properties): filtros duros + embedding + % + checklist.
// El precio se devuelve aparte (NO entra en el %).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant } from "@/lib/auth/tenant-validation";
import { generateEmbedding } from "@/lib/gemini";
import { normalizarFotoRoomix } from "@/lib/acm/fotos-descarga";
import {
  sujetoAmbientes,
  sujetoDormitorios,
  sujetoAntiguedad,
  sujetoEstadoObra,
  obraAdmiteSinDato,
  sujetoM2,
  sujetoToEmbeddingText,
  propTypePatterns,
  roomixTypePatterns,
  locPatterns,
  amenityTokens,
  amenityLabels,
} from "@/lib/acm/subject";
import { buildChecklist, type SubScores } from "@/lib/acm/checklist";
import { TOPE_COMPARABLES } from "@/lib/tasacion/types";
import type { AcmComparable, Operacion, Sujeto } from "@/lib/tasacion/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const firstImage = (images: any): string | null => {
  if (!images) return null;
  if (Array.isArray(images)) {
    const f = images[0];
    return typeof f === "string" ? f : f?.url ?? null;
  }
  return null;
};

// Amenities del comparable (para mostrar en el checklist) desde tokko tags / array roomix.
function propAmenities(tokko_data: any): string[] {
  const tags = tokko_data?.tags;
  if (!Array.isArray(tags)) return [];
  return tags
    .filter((t: any) => t && t.name)
    .map((t: any) => String(t.name))
    .slice(0, 12);
}

export async function POST(req: Request) {
  try {
    const { userId, agencyId } = await requireTenant();
    const supabase = await createClient();

    const body = await req.json();
    const sujeto = (body.sujeto || {}) as Partial<Sujeto>;
    const operacion: Operacion = body.operacion === "alquiler" ? "alquiler" : "venta";
    const excludeId: string | null = body.exclude_id || null; // si el sujeto vino de la cartera
    // Considerar PH: por defecto SÍ (no cambia nada). Solo se excluyen los PH cuando el
    // sujeto es Casa Y el cliente destildó la casilla. Cualquier otro caso → false.
    const considerarPh = body.considerar_ph !== false;
    const excludePh = sujeto.tipo_propiedad === "casa" && considerarPh === false;
    // Zona: por defecto ESTRICTO (mismo barrio + sub-barrios). Los barrios limítrofes
    // (zona_score 50) solo entran si el asesor los pidió explícitamente. Viaja DENTRO de
    // `sujeto` (no aparte) para que quede persistido en acm_searches.sujeto y "Mis ACM"
    // pueda reabrir la búsqueda con el modo correcto. Si el campo no viene, se comporta
    // estricto: es el arreglo, nunca hereda el default 50 de la función SQL.
    const zonaMin = sujeto.incluir_linderos === true ? 50 : 70;
    // Sin límites artificiales: el gate de barrio ya acota el universo; traemos todos los
    // comparables del barrio (tope alto por performance del render, configurable por request).
    const limit = Math.min(Number(body.limit) || 50, TOPE_COMPARABLES);
    // Con una descripción real de la propiedad, la similitud descriptiva deja de ser
    // redundante con las dimensiones duras (tipo/m²/ambientes ya se puntúan aparte) y
    // pasa a aportar señal propia: de 10 a 20 puntos sobre ~130.
    const tieneDesc = Boolean((sujeto.descripcion_ia || "").trim());
    const pesoSemantica = tieneDesc ? 20 : 10;

    const m2 = sujetoM2(sujeto);
    const ambientes = sujetoAmbientes(sujeto);
    const dormitorios = sujetoDormitorios(sujeto);
    const antiguedad = sujetoAntiguedad(sujeto);
    // Estado de obra: a estrenar / en pozo solo comparan contra su mismo estado.
    const obra = sujetoEstadoObra(sujeto);
    const obraSinDato = obraAdmiteSinDato(operacion);
    const banos = sujeto.banos && sujeto.banos > 0 ? sujeto.banos : null;
    const loc = locPatterns(sujeto);
    const amen = amenityTokens(sujeto.amenidades);
    const sujetoAmenLabels = amenityLabels(sujeto.amenidades);
    const sujetoZona = sujeto.barrio || "";

    // Embedding del sujeto (RETRIEVAL_QUERY). Si falla → ranking estructural sin semántica.
    let embStr: string | null = null;
    try {
      const text = sujetoToEmbeddingText(sujeto);
      if (text.length > 3) {
        const emb = await generateEmbedding(text, "RETRIEVAL_QUERY");
        if (Array.isArray(emb) && emb.length > 0) embStr = `[${emb.join(",")}]`;
      }
    } catch (e) {
      console.error("ACM embedding fallo (sigo con ranking estructural):", e);
    }

    // RPC en paralelo: cartera + red de colaboración.
    const [carteraRes, roomixRes] = await Promise.all([
      supabase.rpc("acm_match_properties", {
        p_agency_id: agencyId,
        p_query_embedding: embStr,
        p_operation: operacion,
        p_type_patterns: propTypePatterns(sujeto.tipo_propiedad),
        p_m2: m2,
        p_rooms: ambientes,
        p_dormitorios: dormitorios,
        p_bathrooms: banos,
        p_antiguedad: antiguedad,
        p_loc_patterns: loc,
        p_amenities: amen,
        p_exclude_id: excludeId,
        p_exclude_ph: excludePh,
        p_obra: obra,
        p_obra_sin_dato: obraSinDato,
        p_barrio: sujetoZona,
        p_zona_niveles: true,
        p_zona_min: zonaMin,
        p_peso_semantica: pesoSemantica,
        p_m2_cubierta: true,
        p_limit: limit,
      }),
      supabase.rpc("acm_match_roomix", {
        p_query_embedding: embStr,
        p_operation: operacion,
        p_type_patterns: roomixTypePatterns(sujeto.tipo_propiedad),
        p_m2: m2,
        p_rooms: ambientes,
        p_dormitorios: dormitorios,
        p_bathrooms: banos,
        p_antiguedad: antiguedad,
        p_loc_patterns: loc,
        p_amenities: amen,
        p_exclude_ph: excludePh,
        p_obra: obra,
        p_obra_sin_dato: obraSinDato,
        p_barrio: sujetoZona,
        p_zona_niveles: true,
        p_zona_min: zonaMin,
        p_peso_semantica: pesoSemantica,
        p_m2_cubierta: true,
        p_dedup: true,
        p_excluir_sujeto: true,
        p_limit: limit,
      }),
    ]);

    // Si la búsqueda en cartera o en la red falla (ej. timeout de Postgres, statement_timeout
    // 8s en producción), NO hay que devolver "0 comparables" en silencio: para el asesor eso es
    // indistinguible de "esta zona realmente no tiene comparables". Se loguea el error real Y
    // se manda un flag en `meta` para que el front avise que el resultado está incompleto.
    if (carteraRes.error) console.error("acm_match_properties error:", carteraRes.error);
    if (roomixRes.error) console.error("acm_match_roomix error:", roomixRes.error);
    // `let`, no `const`: la segunda tanda de queries (re-traer las filas completas, más abajo)
    // puede fallar independientemente del RPC y también tiene que poder marcar el fallo — ver
    // hallazgo I3 de la revisión final.
    let carteraFallo = Boolean(carteraRes.error);
    let roomixFallo = Boolean(roomixRes.error);

    const carteraRanked = carteraRes.data || [];
    const roomixRanked = roomixRes.data || [];

    // Re-traer filas completas.
    const subById = (rows: any[]): Record<string, any> => {
      const map: Record<string, any> = {};
      for (const r of rows) map[r.id] = r;
      return map;
    };
    const carteraSub = subById(carteraRanked);
    const roomixSub = subById(roomixRanked);

    const carteraIds = carteraRanked.map((r: any) => r.id);
    const roomixIds = roomixRanked.map((r: any) => r.id);

    const [carteraFull, roomixFull] = await Promise.all([
      carteraIds.length
        ? supabase
            .from("properties")
            .select(
              "id, title, address, city, property_type, price, currency, bedrooms, bathrooms, total_area, covered_area, status, images, tokko_data, assigned_agent"
            )
            .in("id", carteraIds)
        : Promise.resolve({ data: [] as any[], error: null as any }),
      roomixIds.length
        ? supabase
            .from("roomix_properties")
            // Columnas puntuales, NO "*": un "*" trae también la columna `embedding` (768
            // dimensiones) para hasta 100 filas — un peso extra que es, de por sí, un candidato
            // plausible al mismo timeout que esta rama existe para dejar de esconder (hallazgo
            // I3 de la revisión final). Lista acotada a lo que efectivamente lee el `.map` de
            // abajo (líneas ~265-280).
            .select(
              "id, title, address, neighborhood, property_type, area_m2, bedrooms, bathrooms, price, currency, images, canonical_url, roomix_agency_name, date_posted, amenities"
            )
            .in("id", roomixIds)
        : Promise.resolve({ data: [] as any[], error: null as any }),
    ]);

    // Mismo motivo que el RPC de arriba: si esta segunda tanda falla, el resultado quedaría
    // vacío (`carteraFull.data || []` → `[]`) con un 200 limpio y CERO comparables — exactamente
    // el estado que este flag existe para evitar. Antes de este fix, `.error` acá nunca se leía.
    if (carteraFull.error) {
      console.error("ACM properties (full-row) error:", carteraFull.error);
      carteraFallo = true;
    }
    if (roomixFull.error) {
      console.error("ACM roomix_properties (full-row) error:", roomixFull.error);
      roomixFallo = true;
    }

    const tipoLabel = sujeto.tipo_propiedad || "—";
    // En el checklist el estado de obra pisa el número de años (fmtAnios: 0 = a estrenar, -1 = en pozo).
    const antiguedadLabel = sujeto.en_pozo ? -1 : sujeto.a_estrenar ? 0 : antiguedad;
    const sujetoForChecklist = { tipo: tipoLabel, zona: sujetoZona, m2, ambientes, dormitorios, banos, antiguedad: antiguedadLabel, amenities: sujetoAmenLabels };

    const cartera: AcmComparable[] = (carteraFull.data || [])
      .map((p: any): AcmComparable | null => {
        const sub = carteraSub[p.id];
        if (!sub) return null;
        const candM2 = sub.cand_m2 != null ? Number(sub.cand_m2) : p.total_area ? Number(p.total_area) : null;
        const candAmb = sub.cand_amb ?? null;
        const candDorm = sub.cand_dorm ?? (p.bedrooms != null && p.bedrooms > 0 ? p.bedrooms : null);
        const candAnt = sub.cand_ant ?? null;
        const compAmen = propAmenities(p.tokko_data);
        const subs: SubScores = sub;
        return {
          id: p.id,
          source: "cartera",
          match_pct: sub.match_pct ?? 0,
          checklist: buildChecklist({
            sub: subs,
            operacion,
            pesoSemantica,
            sujeto: sujetoForChecklist,
            comp: { tipo: p.property_type || "", zona: [p.city, p.address].filter(Boolean).join(" "), m2: candM2, ambientes: candAmb, dormitorios: candDorm, banos: p.bathrooms ?? null, antiguedad: candAnt, amenities: compAmen },
          }),
          titulo: p.title || "",
          direccion: p.address || "",
          zona: p.city || "",
          tipo: p.property_type || "",
          m2: candM2,
          ambientes: candAmb,
          dormitorios: candDorm,
          banos: p.bathrooms ?? null,
          precio: p.price ? Number(p.price) : null,
          moneda: p.currency || "USD",
          precio_m2: p.price && candM2 ? Math.round(Number(p.price) / candM2) : null,
          imagen: firstImage(p.images),
          url: p.tokko_data?.public_url || null,
          responsable: p.assigned_agent?.name || "Cartera propia",
          fecha_publicacion: null,
        };
      })
      .filter((x): x is AcmComparable => x !== null)
      .sort((a, b) => b.match_pct - a.match_pct);

    const roomix: AcmComparable[] = (roomixFull.data || [])
      .map((r: any): AcmComparable | null => {
        const sub = roomixSub[r.id];
        if (!sub) return null;
        const candM2 = sub.cand_m2 != null ? Number(sub.cand_m2) : r.area_m2 ? Number(r.area_m2) : null;
        const candAmb = sub.cand_amb ?? null;
        const candDorm = sub.cand_dorm ?? (r.bedrooms != null && r.bedrooms > 0 ? r.bedrooms : null);
        const candAnt = sub.cand_ant ?? null;
        const compAmen = Array.isArray(r.amenities) ? r.amenities.slice(0, 12) : [];
        const subs: SubScores = sub;
        return {
          id: `roomix_${r.id}`,
          source: "roomix",
          match_pct: sub.match_pct ?? 0,
          checklist: buildChecklist({
            sub: subs,
            operacion,
            pesoSemantica,
            sujeto: sujetoForChecklist,
            comp: { tipo: r.property_type || "", zona: [r.neighborhood, r.address].filter(Boolean).join(" "), m2: candM2, ambientes: candAmb, dormitorios: candDorm, banos: r.bathrooms ?? null, antiguedad: candAnt, amenities: compAmen },
          }),
          titulo: r.title || "",
          direccion: r.address || r.neighborhood || "",
          zona: r.neighborhood || "",
          tipo: r.property_type || "",
          m2: candM2,
          ambientes: candAmb,
          dormitorios: candDorm,
          banos: r.bathrooms ?? null,
          precio: r.price ? Number(r.price) : null,
          moneda: r.currency || "USD",
          precio_m2: r.price && candM2 ? Math.round(Number(r.price) / candM2) : null,
          // El `.webp` que publica roomix da 404 en su propio CDN el 12% de las veces y la
          // tarjeta queda con la foto rota (ver `normalizarFotoRoomix`).
          imagen: Array.isArray(r.images) && r.images[0] ? normalizarFotoRoomix(r.images[0]) : null,
          url: r.canonical_url || null,
          responsable: r.roomix_agency_name || "Inmobiliaria colaboradora",
          fecha_publicacion: r.date_posted || null,
        };
      })
      .filter((x): x is AcmComparable => x !== null)
      .sort((a, b) => b.match_pct - a.match_pct);

    // Historial "Mis ACM": guardamos la búsqueda con su snapshot de comparables para poder reabrirla.
    // Si falla, la búsqueda igual se devuelve (el historial no puede romper el ACM).
    let searchId: string | null = null;
    try {
      const { data: saved, error: saveErr } = await createAdminClient()
        .from("acm_searches")
        .insert({
          agency_id: agencyId,
          user_id: userId,
          operacion,
          sujeto,
          exclude_id: excludeId,
          // `cartera_fallo`/`roomix_fallo` viajan DENTRO de `resultados` (mismo criterio que
          // `con_semantica`, ya guardado acá): es el único campo de esta fila que
          // `/api/acm/searches/[id]` devuelve tal cual. Sin esto, reabrir una búsqueda que
          // falló parcialmente desde "Mis ACM" mostraba el resultado incompleto SIN el banner
          // rojo — exactamente el bug que 1a9d480 arregló para la búsqueda en vivo, resucitado
          // en el historial (hallazgo I2 de la revisión final).
          resultados: { cartera, roomix, con_semantica: Boolean(embStr), cartera_fallo: carteraFallo, roomix_fallo: roomixFallo },
          total_cartera: cartera.length,
          total_roomix: roomix.length,
        })
        .select("id")
        .single();
      if (saveErr) throw saveErr;
      searchId = saved?.id ?? null;
    } catch (e) {
      console.error("ACM: no se pudo guardar la búsqueda en el historial:", e);
    }

    return NextResponse.json({
      cartera,
      roomix,
      search_id: searchId,
      meta: {
        operacion,
        con_semantica: Boolean(embStr),
        total: cartera.length + roomix.length,
        // Sigue en 200 (hay resultados parciales aprovechables), pero marcado: el front tiene
        // que avisarle al asesor que la búsqueda no se completó del todo, nunca mostrar el
        // resultado parcial como si fuera completo.
        cartera_fallo: carteraFallo,
        roomix_fallo: roomixFallo,
      },
    });
  } catch (e: any) {
    console.error("ACM comparables error:", e);
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 500 });
  }
}
