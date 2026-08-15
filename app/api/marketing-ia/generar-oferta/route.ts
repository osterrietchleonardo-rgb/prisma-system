import { createClient } from "@/lib/supabase/server";
import { prismaIA } from "@/lib/gemini";
import { NextResponse } from "next/server";
import { consumeAiCredits, requireTenant, updateAiTransactionCost } from "@/lib/auth/tenant-validation";
import { calculateCost, tokensFromUsage } from "@/utils/aiCostCalculator";
import {
  CAMPOS_PERFIL, CAMPOS_CAPTACION, CAMPOS_VENTA, operacionCompleta, type CampoOperacion,
} from "@/lib/marketing-ia/campos-operacion";

export const dynamic = "force-dynamic";

const bloqueDatos = (valores: Record<string, unknown>, campos: CampoOperacion[]): string =>
  campos
    .filter((c) => typeof valores?.[c.name] === "string" && (valores[c.name] as string).trim().length > 0)
    .map((c) => `- ${c.etiquetaPrompt}: ${(valores[c.name] as string).trim()}`)
    .join("\n");

const buildOfertaPrompt = (
  op: { perfil: Record<string, unknown>; captacion: Record<string, unknown>; venta: Record<string, unknown> },
  directive: string
): string => {
  const noPrometer = typeof op.perfil?.no_prometer === "string" ? op.perfil.no_prometer.trim() : "";
  return `Sos un experto en copywriting inmobiliario de alto nivel, especialista en la Fórmula de Valor de Alex Hormozi:
Valor = (Resultado Soñado x Probabilidad de Éxito) / (Retraso Temporal x Esfuerzo y Sacrificio).

Tu tarea es analizar los datos operativos REALES de un asesor inmobiliario argentino y escribir exactamente DOS ofertas irresistibles:
1) CAPTACIÓN, para dueños que quieren vender su propiedad.
2) VENTA, para personas que quieren comprar.

PERFIL PROFESIONAL DEL ASESOR:
${bloqueDatos(op.perfil, CAMPOS_PERFIL.filter((c) => c.name !== "no_prometer")) || "- (no cargado)"}

DATOS DE CAPTACIÓN:
${bloqueDatos(op.captacion, CAMPOS_CAPTACION)}

DATOS DE VENTA:
${bloqueDatos(op.venta, CAMPOS_VENTA)}
${directive ? `\nDIRECTIVA CREATIVA DE LA AGENCIA (obligatorio respetarla): ${directive}` : ""}

REGLAS:
1. Cada oferta es un párrafo conciso, directo y de alto impacto (4 a 6 frases).
2. Incluí explícitamente los números y diferenciales de arriba: son los que elevan la Probabilidad de Éxito.
3. Redactá de forma que quede claro que el Esfuerzo y el Sacrificio los carga el ASESOR, no el cliente.
4. Bajá el Retraso Temporal: nombrá los tiempos concretos que el asesor declaró.
5. PROHIBIDO inventar cifras, plazos, testimonios, premios o garantías que no estén en los datos de arriba.${noPrometer ? `\n6. PROHIBIDO prometer, insinuar o dar a entender lo siguiente: ${noPrometer}` : ""}
7. Español rioplatense (voseo), profesional y sin marketinerías vacías. Nada de "tu hogar soñado".
8. No escribas títulos, saludos ni explicaciones: solo los dos textos.

Respondé ÚNICAMENTE en JSON válido con esta forma exacta:
{"oferta_captacion":"...","oferta_venta":"..."}`;
};

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const objetivo: "ambas" | "captacion" | "venta" = body?.objetivo ?? "ambas";
    const { userId, agencyId } = await requireTenant();
    const supabase = await createClient();

    const { data: op } = await supabase
      .from("advisor_operations")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (!op) {
      return NextResponse.json(
        { error: "Todavía no cargaste tu forma de trabajar. Completá el formulario y guardalo." },
        { status: 404 }
      );
    }

    if (!operacionCompleta({ perfil: op.perfil ?? {}, captacion: op.captacion ?? {}, venta: op.venta ?? {} })) {
      return NextResponse.json(
        { error: "Completá los pasos de Captación y Venta antes de generar tus ofertas." },
        { status: 400 }
      );
    }

    // Directiva creativa de la agencia (la define el director en Configuración IA)
    let creativeDirective = "";
    if (agencyId) {
      const { data: agency } = await supabase
        .from("agencies").select("marketing_ai_config").eq("id", agencyId).single();
      creativeDirective = agency?.marketing_ai_config?.creative_directive ?? "";
    }

    // Recién acá se cobra: nunca cobrar por una validación fallida.
    const txId = await consumeAiCredits("marketing_ia", 1, "Generar ofertas irresistibles");

    const prompt = buildOfertaPrompt(
      { perfil: op.perfil ?? {}, captacion: op.captacion ?? {}, venta: op.venta ?? {} },
      creativeDirective
    );

    const result = await prismaIA.generateContent(prompt);
    const rawResponse = result.response.text();

    // ─── Costo real (tabla central de precios según el modelo) ───
    const usage = result.response.usageMetadata;
    if (usage) {
      const { inputTokens, outputTokens } = tokensFromUsage(usage);
      const { totalCostUSD } = calculateCost({ model: "gemini-3.5-flash", inputTokens, outputTokens });
      updateAiTransactionCost(txId, inputTokens, outputTokens, totalCostUSD);
    }

    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    const clean = jsonMatch ? jsonMatch[0] : rawResponse.replace(/```json|```/g, "").trim();

    let ofertas: { oferta_captacion?: string; oferta_venta?: string };
    try {
      ofertas = JSON.parse(clean);
    } catch {
      console.error("[generar-oferta] JSON inválido:", clean);
      return NextResponse.json({ error: "La IA devolvió un formato inesperado. Probá de nuevo." }, { status: 500 });
    }

    const patch: Record<string, unknown> = {
      ofertas_generadas_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (objetivo !== "venta" && ofertas.oferta_captacion) {
      patch.oferta_captacion = ofertas.oferta_captacion;
      patch.oferta_captacion_editada = false;
    }
    if (objetivo !== "captacion" && ofertas.oferta_venta) {
      patch.oferta_venta = ofertas.oferta_venta;
      patch.oferta_venta_editada = false;
    }

    const { data: actualizado, error: updateError } = await supabase
      .from("advisor_operations")
      .update(patch)
      .eq("user_id", userId)
      .select("oferta_captacion, oferta_venta, ofertas_generadas_at, oferta_captacion_editada, oferta_venta_editada")
      .single();

    if (updateError) throw updateError;

    return NextResponse.json(actualizado);
  } catch (error: any) {
    console.error("Generar Oferta Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
