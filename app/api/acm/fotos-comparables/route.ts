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
import sharp from "sharp";
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
  type AtributosFotoIA,
} from "@/lib/acm/analisis-fotos";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Mismo motivo que HOSTS_PERMITIDOS de app/api/acm/analizar-fotos: `properties.images` y
// `roomix_properties.images` no las puebla un humano de confianza (sync de Tokko y crawler de
// roomix respectivamente), así que aunque el id ya venga scopeado por agencia (o sea la red de
// colaboración, sin scope), una URL corrupta u hostil colada en esas columnas igual llegaría a
// este `fetch()` sin este freno. `cdn.roomix.ai` es el CDN real de fotos de la red de
// colaboración (mismo host que ya está en la allowlist de `next/image`, next.config.mjs).
const HOSTS_PERMITIDOS = [/^static\.tokkobroker\.com$/, /\.supabase\.co$/, /^cdn\.roomix\.ai$/];
const MAX_BYTES_FOTO = 8 * 1024 * 1024; // por-foto, antes de re-achicar con sharp
const MAX_LADO = 1280;

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

function normalizarImagenes(images: any): string[] {
  if (!Array.isArray(images)) return [];
  return images
    .map((im: any) => (typeof im === "string" ? im : im?.url))
    .filter((u: any): u is string => typeof u === "string" && u.length > 0);
}

/** Primeras N URLs de `images` que pasan la allowlist de host, en el orden en que están guardadas
 *  (sin curar — es la misma política que se validó en la ronda de holdout de San Telmo). */
function primerasFotosPermitidas(images: string[], n: number): string[] {
  const out: string[] = [];
  for (const url of images) {
    if (out.length >= n) break;
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "https:" && HOSTS_PERMITIDOS.some((re) => re.test(parsed.hostname))) out.push(url);
    } catch {
      // URL inválida: se descarta, no corta el resto.
    }
  }
  return out;
}

function fotosHash(urls: string[]): string {
  return crypto.createHash("sha256").update(urls.join("|")).digest("hex").slice(0, 32);
}

/** Descarga una foto (ya validada contra la allowlist) y la re-achica al mismo formato que el
 *  resto del módulo de fotos+IA. */
async function descargarFoto(url: string): Promise<{ data: string; mimeType: string }> {
  // No seguir redirecciones: un host de la allowlist podría responder 302 hacia un destino
  // interno y `fetch` lo seguiría sin volver a pasar por el chequeo de host.
  const res = await fetch(url, { redirect: "error" });
  if (!res.ok) throw new Error(`no se pudo descargar (${res.status})`);

  const contentLength = Number(res.headers.get("content-length") || 0);
  if (contentLength > MAX_BYTES_FOTO) throw new Error("foto demasiado pesada");

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength > MAX_BYTES_FOTO) throw new Error("foto demasiado pesada");

  const contentType = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!contentType.startsWith("image/")) throw new Error("la URL no es una imagen");

  const resized = await sharp(buffer)
    .resize({ width: MAX_LADO, height: MAX_LADO, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
  return { data: resized.toString("base64"), mimeType: "image/jpeg" };
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
        : Promise.resolve({ data: [] as any[] }),
      roomixIds.length ? supabase.from("roomix_properties").select("id, images").in("id", roomixIds) : Promise.resolve({ data: [] as any[] }),
    ]);

    const imagenesPorId = new Map<string, string[]>(); // key: `${fuente}:${propertyId}`
    for (const p of carteraRes.data || []) imagenesPorId.set(`cartera:${p.id}`, normalizarImagenes(p.images));
    for (const r of roomixRes.data || []) imagenesPorId.set(`roomix:${r.id}`, Array.isArray(r.images) ? r.images.filter((u: any) => typeof u === "string") : []);

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
          const urls = primerasFotosPermitidas(imagenes, MAX_FOTOS_ANALISIS);
          if (urls.length === 0) {
            return { id: c.id, descripcion: null, atributos: null, cache: false, error: "Esta propiedad no tiene fotos para comparar." };
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
                fotos_muestran_interior: cacheado.fotos_muestran_interior,
                motivo_no_evaluable: cacheado.motivo_no_evaluable,
                estado_conservacion: cacheado.estado_conservacion as any,
                calidad_terminaciones: cacheado.calidad_terminaciones as any,
                luminosidad: cacheado.luminosidad as any,
              },
              cache: true,
              error: null,
            };
          }

          // ── Sin caché: descargar (server-side, nunca vía el cliente) y analizar ──
          const descargas = await Promise.allSettled(urls.map(descargarFoto));
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
