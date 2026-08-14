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
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@/lib/supabase/server";
import { requireTenant } from "@/lib/auth/tenant-validation";
import { sanearDescripcionIA, recortarAPalabra, MAX_DESC_IA } from "@/lib/acm/descripcion-ia";
import {
  construirPromptAnalisisFotos,
  contextoParaPrompt,
  extraerAnalisisFotos,
  SCHEMA_ANALISIS_FOTOS,
} from "@/lib/acm/analisis-fotos";
import { normalizarImagenes, descargarFotoValidada, HOSTS_CARTERA } from "@/lib/acm/fotos-descarga";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MIMES_OK = ["image/jpeg", "image/png", "image/webp"];
const MAX_FOTOS = 4;
// Vercel corta el body de la request en 4.5 MB (docs/interno/TECNICO-PRISMA.md §10.8) ANTES
// de que este handler corra: un tope acá por encima de eso nunca se alcanza, porque la
// plataforma ya devolvió un 413 no-JSON y el asesor ve el fallback genérico en vez de este
// mensaje. Con 4 fotos a 1280px / calidad 0.82 el body real ronda 1.5 MB, así que 3.5 MB deja
// margen real y sigue por debajo del techo de la plataforma. Las fotos de cartera se achican
// server-side al mismo tamaño antes de sumar contra este mismo tope.
const MAX_BYTES_TOTAL = 3.5 * 1024 * 1024;
const MAX_FOCO = 300;

/** Descarga una foto de la cartera y la re-achica al mismo formato que las subidas a mano.
 *  Wrapper fino sobre el helper compartido (`lib/acm/fotos-descarga.ts`, ver comentario ahí de
 *  por qué está centralizado): acá solo se agrega el chequeo de "índice/propiedad inexistente",
 *  específico de este endpoint. `properties.images` no la escribe un humano de confianza (la
 *  puebla el sync de Tokko desde una API externa, `lib/tokko-sync.ts:71`), así que aunque el
 *  propertyId + index ya vienen scopeados por agencia (nunca hay URL en el body del cliente),
 *  una URL corrupta u hostil colada en esa columna igual necesita la allowlist de host del
 *  helper. */
async function resolverFotoCartera(url: string | undefined): Promise<{ data: string; mimeType: string }> {
  if (!url) throw new Error("foto de cartera inexistente");
  return descargarFotoValidada(url, HOSTS_CARTERA);
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
    const contexto = contextoParaPrompt(s);

    // OJO: la cantidad de fotos se interpola. Si el prompt afirma que hay más de las que
    // hay, el modelo completa el hueco y describe ambientes que nunca vio.
    const cuantas = fotos.length === 1 ? "la imagen" : `las ${fotos.length} imágenes`;

    // Mismo prompt (y mismo schema) que usa app/api/acm/fotos-comparables para cada
    // comparable: es lo que permite mostrar las dos descripciones lado a lado con el mismo
    // criterio, y lo que le da al asesor el anclaje de condición de SU propiedad (Feature B,
    // 3ra capa de comparación) — ver lib/acm/analisis-fotos.ts.
    const prompt = construirPromptAnalisisFotos({ cuantas, contexto, foco });

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
        responseSchema: SCHEMA_ANALISIS_FOTOS,
      },
    });

    const result = await model.generateContent([
      ...fotos.map((f: any) => ({ inlineData: { data: f.data, mimeType: f.mimeType } })),
      prompt,
    ]);

    const crudo = result.response.text();
    // `analisis` se descarta acá: existe para darle al modelo dónde poner el razonamiento,
    // no para mostrarlo.
    const { descripcion: crudoDescripcion, atributos } = extraerAnalisisFotos(crudo);
    const descripcion = recortarAPalabra(sanearDescripcionIA(crudoDescripcion), MAX_DESC_IA);
    if (!descripcion) {
      return NextResponse.json({ error: "La IA no devolvió texto. Probá de nuevo." }, { status: 500 });
    }

    // `atributos`: la clasificación interna (estado_conservacion, luminosidad, etc.) que
    // ancla la 3ra capa de comparación (fotos contra fotos). Puede venir null si el JSON no
    // trajo ese bloque — el asesor sigue viendo su descripción igual, simplemente esa capa
    // no tiene con qué arrancar hasta que la corrija a mano (ver fotos-ia.tsx).
    return NextResponse.json({ descripcion, atributos });
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
