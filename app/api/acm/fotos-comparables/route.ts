// ACM · 3ra capa de comparación: analiza con Gemini (visión) las fotos de hasta 10 comparables
// (los de mayor match_pct, ≥90%) y devuelve, para cada uno, la misma descripción+clasificación
// que ya se le pide al sujeto — así el navegador puede mostrar las dos descripciones lado a
// lado y recalcular el ajuste ±5 sin volver a llamar a este endpoint cada vez que el asesor
// corrige el anclaje de su propia propiedad (ver lib/acm/analisis-fotos.ts).
//
// El navegador NUNCA manda URLs de fotos (mismo criterio que app/api/acm/analizar-fotos con las
// fotos de cartera): manda qué propiedad (id + fuente) y este endpoint resuelve las fotos él
// mismo, contra su propia lectura de `properties` (scopeada por agency_id) o `roomix_properties`
// (red de colaboración, sin scope de agencia — mismo criterio que /api/acm/comparables).
//
// CACHÉ POR PROPIEDAD (no por ACM, ver acm_fotos_analisis_cache): antes de gastar una llamada de
// visión se busca un análisis ya hecho para (fuente, property_id, hash de las fotos usadas). Las
// fotos de roomix se repiten entre ACM del mismo barrio, así que el segundo ACM de la zona
// reusa lo que ya se analizó en el primero.
//
// Las fotos NO se guardan en ningún lado (tampoco en el caché): lo que persiste es el veredicto
// (descripción + atributos) y el hash de las URLs usadas, nunca la imagen ni la URL en sí.
import { NextResponse } from "next/server";
import crypto from "crypto";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenant } from "@/lib/auth/tenant-validation";
import { sanearDescripcionIA, recortarAPalabra, MAX_DESC_IA } from "@/lib/acm/descripcion-ia";
import {
  construirPromptAnalisisFotos,
  contextoParaPrompt,
  extraerAnalisisFotos,
  SCHEMA_ANALISIS_FOTOS,
  MAX_FOTOS_ANALISIS,
  MAX_COMPARABLES_ANALISIS,
  coercionarEstado,
  coercionarTerminaciones,
  coercionarLuminosidad,
  type AtributosFotoIA,
} from "@/lib/acm/analisis-fotos";
import { descargarFotoValidada } from "@/lib/acm/fotos-descarga";
import { normalizarImagenes, primerasFotosPermitidas, HOSTS_CARTERA, HOSTS_ROOMIX } from "@/lib/acm/fotos-url";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Un comparable puede venir de la cartera propia (fotos de Tokko/Supabase) o de la red de
// colaboración (CDN de roomix): la allowlist combina los hosts de las dos fuentes porque acá no
// se sabe de antemano cuál va a resolver cada URL.
const HOSTS_PERMITIDOS = [...HOSTS_CARTERA, ...HOSTS_ROOMIX];

interface ComparableIn {
  id: string;
  source: "cartera" | "roomix";
  tipo?: string | null;
  zona?: string | null;
  m2?: number | null;
  dormitorios?: number | null;
  banos?: number | null;
}

interface ResultadoComparable {
  id: string;
  descripcion: string | null;
  atributos: AtributosFotoIA | null;
  cache: boolean;
  error: string | null;
}

function fotosHash(urls: string[]): string {
  return crypto.createHash("sha256").update(urls.join("|")).digest("hex").slice(0, 32);
}

export async function POST(req: Request) {
  try {
    const { agencyId } = await requireTenant();
    const body = await req.json();

    const comparablesIn = (Array.isArray(body.comparables) ? body.comparables : []).slice(0, MAX_COMPARABLES_ANALISIS) as ComparableIn[];
    const validos = comparablesIn.filter(
      (c) => c && typeof c.id === "string" && c.id.length > 0 && (c.source === "cartera" || c.source === "roomix")
    );
    if (validos.length === 0) {
      return NextResponse.json({ resultados: [] });
    }

    const supabase = await createClient();
    const admin = createAdminClient();

    // ── Resolver imágenes de cada fuente contra la propia base (nunca URLs desde el cliente) ──
    const carteraIds = validos.filter((c) => c.source === "cartera").map((c) => c.id);
    const roomixIds = validos.filter((c) => c.source === "roomix").map((c) => c.id.replace(/^roomix_/, ""));

    const [carteraRes, roomixRes] = await Promise.all([
      carteraIds.length
        ? supabase.from("properties").select("id, images").eq("agency_id", agencyId).in("id", carteraIds)
        : Promise.resolve({ data: [] as any[], error: null as any }),
      roomixIds.length
        ? supabase.from("roomix_properties").select("id, images").in("id", roomixIds)
        : Promise.resolve({ data: [] as any[], error: null as any }),
    ]);

    // Si la lectura de imágenes falla (cartera y/o roomix), NO hay que reportarlo como "esta
    // propiedad no tiene fotos" — eso es una afirmación sobre el DATO, y acá lo que falló es la
    // LECTURA. Sin esta distinción el asesor ve un mensaje factualmente falso en la tarjeta
    // (ver hallazgo I4 de la revisión final).
    if (carteraRes.error) console.error("ACM fotos-comparables: no se pudo leer fotos de cartera:", carteraRes.error);
    if (roomixRes.error) console.error("ACM fotos-comparables: no se pudo leer fotos de roomix:", roomixRes.error);
    const carteraLecturaFallo = Boolean(carteraRes.error);
    const roomixLecturaFallo = Boolean(roomixRes.error);

    const imagenesPorId = new Map<string, string[]>(); // key: `${fuente}:${propertyId}`
    for (const p of carteraRes.data || []) imagenesPorId.set(`cartera:${p.id}`, normalizarImagenes(p.images));
    for (const r of roomixRes.data || []) imagenesPorId.set(`roomix:${r.id}`, normalizarImagenes(r.images));

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({
      model: "gemini-3.5-flash",
      generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA_ANALISIS_FOTOS },
    });

    // Cada comparable se procesa independientemente (allSettled + try/catch propio): que UNO
    // falle (foto rota, Gemini caído puntualmente) nunca tira abajo a los demás — mismo
    // principio que "el ACM nunca se bloquea por la IA".
    const resultados = await Promise.all(
      validos.map(async (c): Promise<ResultadoComparable> => {
        const propId = c.source === "roomix" ? c.id.replace(/^roomix_/, "") : c.id;
        try {
          const imagenes = imagenesPorId.get(`${c.source}:${propId}`) || [];
          const urls = primerasFotosPermitidas(imagenes, MAX_FOTOS_ANALISIS, HOSTS_PERMITIDOS);
          if (urls.length === 0) {
            // Si la lectura de esta fuente falló, "no tiene fotos" sería una afirmación falsa
            // sobre el dato — acá no se sabe si tiene o no, solo que no se pudo averiguar.
            const lecturaFallo = c.source === "cartera" ? carteraLecturaFallo : roomixLecturaFallo;
            return {
              id: c.id,
              descripcion: null,
              atributos: null,
              cache: false,
              error: lecturaFallo
                ? "No se pudo leer las fotos de esta propiedad. Probá de nuevo."
                : "Esta propiedad no tiene fotos para comparar.",
            };
          }
          const hash = fotosHash(urls);

          // ── Caché por propiedad ──
          const { data: cacheado } = await admin
            .from("acm_fotos_analisis_cache")
            .select("descripcion, fotos_muestran_interior, motivo_no_evaluable, estado_conservacion, calidad_terminaciones, luminosidad")
            .eq("fuente", c.source)
            .eq("property_id", propId)
            .eq("fotos_hash", hash)
            .maybeSingle();

          if (cacheado) {
            return {
              id: c.id,
              descripcion: cacheado.descripcion,
              atributos: {
                fotos_muestran_interior: Boolean(cacheado.fotos_muestran_interior),
                motivo_no_evaluable: cacheado.motivo_no_evaluable,
                // Coercionado, no `as any`: las columnas son `text` nullable sin CHECK (ver
                // migración 20260812120000) — un valor null/corrupto acá indexaba a `undefined`
                // → `NaN%` en la tarjeta y desestabilizaba el comparador de orden (hallazgo M8
                // de la revisión final). `coercionar*` lo trata como "sin_evidencia", un valor
                // que el resto del código ya sabe manejar.
                estado_conservacion: coercionarEstado(cacheado.estado_conservacion),
                calidad_terminaciones: coercionarTerminaciones(cacheado.calidad_terminaciones),
                luminosidad: coercionarLuminosidad(cacheado.luminosidad),
              },
              cache: true,
              error: null,
            };
          }

          // ── Sin caché: descargar (server-side, nunca vía el cliente) y analizar ──
          const descargas = await Promise.allSettled(urls.map((url) => descargarFotoValidada(url, HOSTS_PERMITIDOS)));
          const fotos = descargas
            .filter((r): r is PromiseFulfilledResult<{ data: string; mimeType: string }> => r.status === "fulfilled")
            .map((r) => r.value);
          if (fotos.length === 0) {
            return { id: c.id, descripcion: null, atributos: null, cache: false, error: "No se pudieron leer las fotos de este comparable." };
          }

          const contexto = contextoParaPrompt({
            tipo_propiedad: c.tipo,
            barrio: c.zona,
            m2_cubiertos: c.m2,
            dormitorios: c.dormitorios,
            banos: c.banos,
          });
          const cuantas = fotos.length === 1 ? "la imagen" : `las ${fotos.length} imágenes`;
          const prompt = construirPromptAnalisisFotos({ cuantas, contexto });

          const result = await model.generateContent([...fotos.map((f) => ({ inlineData: { data: f.data, mimeType: f.mimeType } })), prompt]);
          const { descripcion: crudo, atributos } = extraerAnalisisFotos(result.response.text());
          if (!atributos) {
            return { id: c.id, descripcion: null, atributos: null, cache: false, error: "La IA no pudo clasificar las fotos de este comparable." };
          }
          const descripcion = recortarAPalabra(sanearDescripcionIA(crudo), MAX_DESC_IA);

          // Guardado en caché best-effort: si falla, el resultado igual se devuelve (no
          // bloquea al asesor por un problema de escritura del caché).
          try {
            await admin.from("acm_fotos_analisis_cache").upsert(
              {
                fuente: c.source,
                property_id: propId,
                fotos_hash: hash,
                descripcion,
                fotos_muestran_interior: atributos.fotos_muestran_interior,
                motivo_no_evaluable: atributos.motivo_no_evaluable,
                estado_conservacion: atributos.estado_conservacion,
                calidad_terminaciones: atributos.calidad_terminaciones,
                luminosidad: atributos.luminosidad,
              },
              { onConflict: "fuente,property_id,fotos_hash" }
            );
          } catch (e) {
            console.error("ACM fotos-comparables: no se pudo guardar en caché:", e);
          }

          return { id: c.id, descripcion, atributos, cache: false, error: null };
        } catch (e: any) {
          console.error("ACM fotos-comparables: fallo analizando", c.id, e);
          return { id: c.id, descripcion: null, atributos: null, cache: false, error: "No se pudo analizar las fotos de este comparable." };
        }
      })
    );

    return NextResponse.json({ resultados });
  } catch (e: any) {
    console.error("ACM fotos-comparables error:", e);
    if (e.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "No se pudo analizar las fotos de los comparables. Probá de nuevo en un momento." }, { status: 500 });
  }
}
