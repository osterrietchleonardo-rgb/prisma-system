import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { prismaIA } from "@/lib/gemini";
import { NextResponse } from "next/server";
import {
  consumeAiCredits,
  requireTenant,
  updateAiTransactionCost,
} from "@/lib/auth/tenant-validation";
import { calculateCost, tokensFromUsage } from "@/utils/aiCostCalculator";

export const dynamic = "force-dynamic";

const AI_MODEL = "gemini-3.5-flash";

// ─────────────────────────────────────────────────────────────
// Arma el contexto COMPLETO de la propiedad para el prompt.
// Toma columnas + todo lo relevante de tokko_data sin inventar nada.
// ─────────────────────────────────────────────────────────────
function buildPropertyContext(p: any): string {
  const tokko = p.tokko_data || {};
  const tags = (tokko.tags || []).map((t: any) => t?.name).filter(Boolean);
  const fullLocation =
    tokko.location?.full_location ||
    [p.address, p.city].filter(Boolean).join(", ");

  const lines: string[] = [
    `- Título actual: ${p.title || "(sin título)"}`,
    `- Tipo: ${p.property_type || "?"}`,
    `- Operación: ${p.status || "?"}`,
    `- Precio: ${p.price ? `${p.price} ${p.currency || ""}`.trim() : "consultar"}`,
    tokko.expenses > 0 ? `- Expensas: ${tokko.expenses} ${p.currency || ""}`.trim() : "",
    `- Ubicación: ${fullLocation || "?"}`,
    `- Dirección: ${p.address || "?"}${p.city ? `, ${p.city}` : ""}`,
    p.bedrooms != null ? `- Dormitorios/Ambientes: ${p.bedrooms}` : "",
    p.bathrooms != null ? `- Baños: ${p.bathrooms}` : "",
    p.total_area ? `- Superficie total: ${p.total_area} m²` : "",
    p.covered_area ? `- Superficie cubierta: ${p.covered_area} m²` : "",
    tokko.age != null ? `- Antigüedad: ${tokko.age > 0 ? `${tokko.age} años` : "a estrenar"}` : "",
    tokko.orientation ? `- Orientación: ${tokko.orientation}` : "",
    tokko.disposition ? `- Disposición: ${tokko.disposition}` : "",
    tags.length ? `- Servicios y características: ${tags.join(", ")}` : "",
    p.description ? `- Descripción original (de Tokko, como referencia de datos, NO copiar el estilo):\n"""${p.description}"""` : "",
  ];

  return lines.filter(Boolean).join("\n");
}

const ESTILO = `Escribí una descripción de venta/alquiler para esta propiedad inmobiliaria en Argentina. Requisitos OBLIGATORIOS:

ESTRATEGIA Y EMOCIÓN
- Storytelling: que el cliente ideal se sienta identificado, se visualice viviendo ahí y sienta que esta propiedad es para él/ella.
- Conectá con los deseos y anhelos profundos que el inmueble puede satisfacer (pertenencia, seguridad, crecimiento familiar, independencia, tranquilidad, estatus, cercanía a lo que importa). Inferí esos deseos a partir del TIPO de propiedad, la ZONA y sus características reales. PROHIBIDO inventar datos, hechos o atributos que no estén en la información provista: la emoción se construye interpretando lo que SÍ existe, nunca agregando lo que no está.
- Tono 100% humano y natural (voseo rioplatense), cálido y aspiracional pero profesional; cero robótico, cero "IA".

SEO + GEO (posicionamiento en Google y en motores de IA como ChatGPT, Gemini o Perplexity)
- Integrá de forma orgánica las frases clave de búsqueda: tipo de propiedad, barrio/zona/ciudad, operación (venta/alquiler) y atributos diferenciales. Nada de listas forzadas de keywords.
- Redactá afirmaciones claras y autocontenidas (que se entiendan solas, fuera de contexto): los motores de IA citan mejor ese tipo de frases. Nombrá entidades concretas (barrio, ciudad, tipo de operación).

ESTRUCTURA (en este orden; sin emojis y sin signos de exclamación excesivos)
1. Apertura que enganche emocionalmente.
2. 2 a 3 párrafos cortos de desarrollo (la propiedad, su día a día, su entorno).
3. Pocas viñetas SUTILES (guion "-") con características concretas, solo si aporta claridad.
4. Un bloque titulado "Preguntas frecuentes" con 3 a 4 preguntas y respuestas breves, pensadas para buscadores y asistentes de IA. Cada respuesta debe basarse EXCLUSIVAMENTE en los datos provistos; si un dato no está, no inventes la respuesta: elegí una pregunta cuya respuesta SÍ surja de los datos, o invitá amablemente a consultarlo. Formato: la pregunta en una línea (empezando con "¿") y la respuesta en la línea siguiente.
5. Cierre con una invitación sutil a coordinar una visita.

REGLAS DURAS
- Sin emojis. Sin promesas falsas. Usá SOLO la información provista; ante la duda, omití.
- Devolvé SOLO el texto final, sin títulos como "Descripción:", sin comillas envolventes ni comentarios tuyos.`;

function buildV1Prompt(p: any): string {
  return `Sos un copywriter inmobiliario experto del mercado argentino.

DATOS DE LA PROPIEDAD:
${buildPropertyContext(p)}

${ESTILO}`;
}

function buildV2Prompt(p: any, v1: string, suggestion: string): string {
  return `Sos un copywriter inmobiliario experto del mercado argentino.

DATOS DE LA PROPIEDAD:
${buildPropertyContext(p)}

PRIMERA VERSIÓN YA GENERADA:
"""${v1}"""

SUGERENCIA DEL ASESOR PARA MEJORARLA (aplicala manteniendo la calidad y veracidad de los datos):
"""${suggestion || "Mejorá la fluidez, el impacto emocional y el posicionamiento SEO/GEO sin cambiar los datos."}"""

Reescribí la descripción incorporando la sugerencia. ${ESTILO}`;
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const propertyId = params.id;
    const body = await req.json().catch(() => ({}));
    const version: 1 | 2 = body?.version === 2 ? 2 : 1;
    const suggestion: string = (body?.suggestion || "").toString().slice(0, 600);

    const { agencyId } = await requireTenant();
    const supabase = createClient();

    // Traemos la propiedad respetando RLS (asesor/director solo ven las de su agencia)
    const { data: property, error: propError } = await supabase
      .from("properties")
      .select("*")
      .eq("id", propertyId)
      .single();

    if (propError || !property) {
      return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
    }

    // Defensa extra de aislamiento por agencia
    if (property.agency_id !== agencyId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const current = (property.ai_description as any) || {};

    // ── Tope estricto: solo v1 y v2 por propiedad ──
    if (version === 1 && current.v1) {
      return NextResponse.json(
        { error: "Esta propiedad ya tiene una versión 1 generada." },
        { status: 409 }
      );
    }
    if (version === 2) {
      if (!current.v1) {
        return NextResponse.json(
          { error: "Primero generá la versión 1." },
          { status: 409 }
        );
      }
      if (current.v2) {
        return NextResponse.json(
          { error: "Esta propiedad ya tiene una versión 2 generada." },
          { status: 409 }
        );
      }
    }

    // ── Cobro de crédito (devuelve id de transacción para registrar costo real) ──
    const txId = await consumeAiCredits(
      "propiedades_descripcion",
      1,
      `Descripción IA v${version} — ${property.title || propertyId}`
    );

    const prompt =
      version === 2
        ? buildV2Prompt(property, current.v1, suggestion)
        : buildV1Prompt(property);

    const result = await prismaIA.generateContent(prompt);
    const text = result.response.text().trim();

    // ── Registrar costo real (tokens) ──
    const usage = result.response.usageMetadata;
    if (usage) {
      const { inputTokens: inputTk, outputTokens: outputTk } = tokensFromUsage(usage);
      const { totalCostUSD } = calculateCost({
        model: AI_MODEL,
        inputTokens: inputTk,
        outputTokens: outputTk,
      });
      updateAiTransactionCost(txId, inputTk, outputTk, totalCostUSD);
    }

    if (!text) {
      return NextResponse.json(
        { error: "La IA no devolvió contenido. Intentá de nuevo." },
        { status: 502 }
      );
    }

    // ── Guardar (cliente admin: el asesor no tiene UPDATE por RLS, pero ya validamos agencia) ──
    const now = new Date().toISOString();
    const updated = {
      ...current,
      model: AI_MODEL,
      ...(version === 1
        ? { v1: text, v1_at: now }
        : { v2: text, suggestion, v2_at: now }),
    };

    const admin = createAdminClient();
    const { error: saveError } = await admin
      .from("properties")
      .update({ ai_description: updated })
      .eq("id", propertyId);

    if (saveError) {
      console.error("Error guardando ai_description:", saveError);
      return NextResponse.json(
        { error: "Se generó pero falló el guardado. Intentá de nuevo." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ai_description: updated, version });
  } catch (error: any) {
    const msg = error?.message || "Error inesperado";
    const status = msg.includes("Insufficient AI credits") ? 402 : 500;
    console.error("AI description error:", error);
    return NextResponse.json({ error: msg }, { status });
  }
}
