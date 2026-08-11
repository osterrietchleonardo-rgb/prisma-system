// ACM · Analiza hasta 4 fotos de la propiedad sujeto con Gemini (visión) y devuelve una
// descripción presentable y veraz, que el asesor edita y que se usa para afinar la
// búsqueda de comparables por similitud descriptiva.
//
// Las fotos NO se guardan en ningún lado: entran por el body, van al modelo y se descartan.
import { NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { requireTenant } from "@/lib/auth/tenant-validation";
import { extraerDescripcion, sanearDescripcionIA, recortarAPalabra, MAX_DESC_IA } from "@/lib/acm/descripcion-ia";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MIMES_OK = ["image/jpeg", "image/png", "image/webp"];
const MAX_FOTOS = 4;
const MAX_BYTES_TOTAL = 6 * 1024 * 1024; // 6 MB ya redimensionadas en el navegador
const MAX_FOCO = 300;

export async function POST(req: Request) {
  try {
    await requireTenant();
    const body = await req.json();

    const fotos = Array.isArray(body.fotos) ? body.fotos : [];
    if (fotos.length === 0) {
      return NextResponse.json({ error: "Subí al menos una foto." }, { status: 400 });
    }
    if (fotos.length > MAX_FOTOS) {
      return NextResponse.json({ error: `Máximo ${MAX_FOTOS} fotos.` }, { status: 400 });
    }
    if (fotos.some((f: any) => !f?.data || !MIMES_OK.includes(f?.mimeType))) {
      return NextResponse.json({ error: "Formato no admitido. Usá JPG, PNG o WEBP." }, { status: 400 });
    }
    // base64 pesa ~4/3 del binario; alcanza para frenar un body desmedido.
    const bytes = fotos.reduce((a: number, f: any) => a + Math.floor(f.data.length * 0.75), 0);
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
    console.error("ACM analizar-fotos error:", e);
    const status = e.message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: e.message || "No se pudo analizar las fotos." }, { status });
  }
}
