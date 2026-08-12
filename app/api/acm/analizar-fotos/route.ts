// ACM · Analiza hasta 4 fotos de la propiedad sujeto con Gemini (visión) y devuelve una
// descripción presentable y veraz, que el asesor edita y que se usa para afinar la
// búsqueda de comparables por similitud descriptiva.
//
// Las fotos NO se guardan en ningún lado: entran por el body, van al modelo y se descartan.
//
// Dos formas de mandar una foto (se pueden mezclar en el mismo request):
//  - Subida a mano: { data, mimeType } en base64, ya achicada en el navegador.
//  - Elegida de la cartera: { propertyId, index }. El navegador NUNCA manda la URL de la
//    foto acá (sería un proxy para pedir cualquier URL, un SSRF barato): manda qué propiedad
//    y qué índice, y ESTE endpoint resuelve la URL contra su propia lectura de `properties`,
//    scopeada por agency_id. Si el índice no existe o la propiedad no es de esta agencia, se
//    rechaza el request entero.
import { NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { requireTenant } from "@/lib/auth/tenant-validation";
import { extraerDescripcion, sanearDescripcionIA, recortarAPalabra, MAX_DESC_IA } from "@/lib/acm/descripcion-ia";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MIMES_OK = ["image/jpeg", "image/png", "image/webp"];
const MAX_FOTOS = 4;
const MAX_LADO = 1280; // mismo tope que `achicar()` en el navegador (fotos-ia.tsx)
// Vercel corta el body de la request en 4.5 MB (docs/interno/TECNICO-PRISMA.md §10.8) ANTES
// de que este handler corra: un tope acá por encima de eso nunca se alcanza, porque la
// plataforma ya devolvió un 413 no-JSON y el asesor ve el fallback genérico en vez de este
// mensaje. Con 4 fotos a 1280px / calidad 0.82 el body real ronda 1.5 MB, así que 3.5 MB deja
// margen real y sigue por debajo del techo de la plataforma. Las fotos de cartera se achican
// server-side al mismo tamaño antes de sumar contra este mismo tope.
const MAX_BYTES_TOTAL = 3.5 * 1024 * 1024;
const MAX_FOCO = 300;

/** Normaliza `properties.images` (jsonb): array de strings o de {url}. */
function normalizarImagenes(images: any): string[] {
  if (!Array.isArray(images)) return [];
  return images
    .map((im: any) => (typeof im === "string" ? im : im?.url))
    .filter((u: any): u is string => typeof u === "string" && u.length > 0);
}

// `properties.images` no la escribe un humano de confianza: la puebla el sync de Tokko desde
// una API externa (lib/tokko-sync.ts:71, `p.photos.map(f => f.image)`). Aunque el propertyId +
// index ya vienen scopeados por agencia (nunca hay URL en el body del cliente), una URL corrupta
// o hostil colada en esa columna igual llegaría a este `fetch()` sin este freno — mismo host
// que ya está en la allowlist de `next/image` (next.config.mjs) porque son los mismos orígenes
// reales de fotos de propiedad en todo el sistema.
const HOSTS_PERMITIDOS = [/^static\.tokkobroker\.com$/, /\.supabase\.co$/];
const MAX_BYTES_FOTO_CARTERA = 8 * 1024 * 1024; // por-foto, antes de re-achicar con sharp

/** Descarga una foto de la cartera y la re-achica al mismo formato que las subidas a mano. */
async function resolverFotoCartera(url: string | undefined): Promise<{ data: string; mimeType: string }> {
  if (!url) throw new Error("foto de cartera inexistente");

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("URL de foto inválida");
  }
  if (parsed.protocol !== "https:" || !HOSTS_PERMITIDOS.some((re) => re.test(parsed.hostname))) {
    throw new Error("host de foto no permitido");
  }

  // No seguir redirecciones: un host de la allowlist podría responder 302 hacia un destino
  // interno y `fetch` lo seguiría sin volver a pasar por el chequeo de arriba.
  const res = await fetch(parsed, { redirect: "error" });
  if (!res.ok) throw new Error(`no se pudo descargar (${res.status})`);

  const contentLength = Number(res.headers.get("content-length") || 0);
  if (contentLength > MAX_BYTES_FOTO_CARTERA) throw new Error("foto de cartera demasiado pesada");

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength > MAX_BYTES_FOTO_CARTERA) throw new Error("foto de cartera demasiado pesada");

  // El content-type se valida DESPUÉS de descargar (no evita la descarga en sí, la allowlist de
  // host de arriba es la que hace ese trabajo) — queda como defensa adicional contra un host
  // permitido sirviendo algo que no es una imagen.
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

    const fotosCrudas = Array.isArray(body.fotos) ? body.fotos : [];
    if (fotosCrudas.length === 0) {
      return NextResponse.json({ error: "Subí al menos una foto." }, { status: 400 });
    }
    if (fotosCrudas.length > MAX_FOTOS) {
      return NextResponse.json({ error: `Máximo ${MAX_FOTOS} fotos.` }, { status: 400 });
    }

    const esSubida = (f: any) => Boolean(f?.data) && MIMES_OK.includes(f?.mimeType);
    const esCartera = (f: any) =>
      typeof f?.propertyId === "string" && f.propertyId.length > 0 && Number.isInteger(f?.index) && f.index >= 0;
    if (fotosCrudas.some((f: any) => !esSubida(f) && !esCartera(f))) {
      return NextResponse.json({ error: "Formato no admitido. Usá JPG, PNG o WEBP." }, { status: 400 });
    }

    // Resuelve las fotos de cartera contra la propia lectura de `properties`, filtrada por
    // agency_id: así una propiedad de otra agencia (o un id inventado) nunca resuelve a nada.
    const idsCartera = Array.from(new Set(fotosCrudas.filter(esCartera).map((f: any) => f.propertyId)));
    const imagenesPorPropiedad = new Map<string, string[]>();
    if (idsCartera.length > 0) {
      const supabase = await createClient();
      const { data: props, error: propsError } = await supabase
        .from("properties")
        .select("id, images")
        .eq("agency_id", agencyId)
        .in("id", idsCartera);
      if (propsError) throw propsError;
      for (const p of props || []) imagenesPorPropiedad.set(p.id, normalizarImagenes(p.images));
    }

    let fotos: { data: string; mimeType: string }[];
    try {
      fotos = await Promise.all(
        fotosCrudas.map((f: any) =>
          esSubida(f)
            ? Promise.resolve({ data: f.data as string, mimeType: f.mimeType as string })
            : resolverFotoCartera(imagenesPorPropiedad.get(f.propertyId)?.[f.index])
        )
      );
    } catch {
      return NextResponse.json(
        { error: "No se pudo obtener una de las fotos de la cartera. Probá de nuevo o elegí otra." },
        { status: 400 }
      );
    }

    // base64 pesa ~4/3 del binario; alcanza para frenar un body desmedido.
    const bytes = fotos.reduce((a: number, f) => a + Math.floor(f.data.length * 0.75), 0);
    if (bytes > MAX_BYTES_TOTAL) {
      return NextResponse.json({ error: "Las fotos pesan demasiado. Probá con menos o más chicas." }, { status: 400 });
    }

    const foco = String(body.foco || "").slice(0, MAX_FOCO).trim();
    const s = body.sujeto || {};
    const contexto = [
      s.tipo_propiedad && `Tipo: ${s.tipo_propiedad}`,
      s.barrio && `Barrio: ${s.barrio}`,
      s.m2_cubiertos && `Superficie cubierta: ${s.m2_cubiertos} m²`,
      s.dormitorios && `Dormitorios: ${s.dormitorios}`,
      s.banos && `Baños: ${s.banos}`,
    ].filter(Boolean).join(" · ");

    // OJO: la cantidad de fotos se interpola. Si el prompt afirma que hay más de las que
    // hay, el modelo completa el hueco y describe ambientes que nunca vio.
    const cuantas = fotos.length === 1 ? "la imagen" : `las ${fotos.length} imágenes`;

    const prompt = `Sos un redactor inmobiliario argentino. Vas a describir una propiedad a partir de sus fotos.

Análisis visual previo: Observá detenidamente ${cuantas} buscando indicadores de luminosidad (fuentes de luz natural, sombras), estado de conservación (pisos, paredes, humedad) y distribución espacial.

Describí únicamente lo que se ve en las fotos basándote en el análisis anterior. Si algo no se ve, no lo afirmes.

Nunca contradigas los datos cargados de la propiedad.${contexto ? `\nDatos cargados: ${contexto}` : ""}

Tono de aviso profesional argentino, español rioplatense. Sin superlativos vacíos ("espectacular", "único", "soñado"), sin signos de exclamación.

No omitas ni disimules lo que está deteriorado, pero decilo con honestidad y sin castigar: "cocina original, con posibilidad de actualización" en lugar de "cocina vieja" o de no mencionarla.

Sin precio, sin datos de contacto, sin nombre de inmobiliaria.

Entre 400 y 600 caracteres, en un solo párrafo corrido.
${foco ? `\nEl asesor pidió enfocarse en: ${foco}. Priorizalo sin ignorar el resto de las características clave.` : ""}

FORMATO DE SALIDA: devolvé un JSON con dos campos. En "analisis" va el análisis visual previo (es un paso interno, nadie lo ve). En "descripcion" va únicamente el párrafo final, sin encabezados, sin viñetas, sin repetir las consignas, sin prefijos como "Análisis:" o "Descripción:" y sin markdown.`;

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    // Salida estructurada: el análisis previo tiene su propio campo, así que no puede
    // colarse en el párrafo final. Sin esto habría que adivinar, mirando texto corrido,
    // qué oración es razonamiento y cuál es contenido — y "análisis", "se observa" o
    // "como resultado" son palabras normales de un aviso inmobiliario. Se probó y falla
    // en las dos direcciones: filtra andamiaje y borra descripciones buenas.
    const model = genAI.getGenerativeModel({
      model: "gemini-3.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            analisis: { type: SchemaType.STRING },
            descripcion: { type: SchemaType.STRING },
          },
          required: ["analisis", "descripcion"],
        },
      },
    });

    const result = await model.generateContent([
      ...fotos.map((f: any) => ({ inlineData: { data: f.data, mimeType: f.mimeType } })),
      prompt,
    ]);

    // `analisis` se descarta acá: existe para darle al modelo dónde poner el razonamiento,
    // no para mostrarlo.
    const crudo = extraerDescripcion(result.response.text());
    const descripcion = recortarAPalabra(sanearDescripcionIA(crudo), MAX_DESC_IA);
    if (!descripcion) {
      return NextResponse.json({ error: "La IA no devolvió texto. Probá de nuevo." }, { status: 500 });
    }

    return NextResponse.json({ descripcion });
  } catch (e: any) {
    // Log completo solo del lado del servidor. El error crudo más probable acá es un
    // 429/503 de Gemini, que trae texto en inglés con el modelo y el endpoint de Google
    // adentro: no le sirve al asesor y de paso expone de más. Al navegador SIEMPRE un
    // mensaje fijo en español, salvo el 401 (que ya viene controlado desde requireTenant).
    console.error("ACM analizar-fotos error:", e);
    if (e.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "No se pudo analizar las fotos. Probá de nuevo en un momento." }, { status: 500 });
  }
}
