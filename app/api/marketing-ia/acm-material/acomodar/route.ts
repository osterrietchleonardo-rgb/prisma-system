// ACM · Toma lo que el director escribió a mano en UNA sección y lo deja redactado para el
// informe. No agrega información: solo ordena la que él puso. El resultado se le muestra para
// aceptar o descartar, nunca reemplaza su texto sin que lo vea.
import { NextResponse } from "next/server";
import {
  consumeAiCredits, requireTenant, updateAiTransactionCost,
} from "@/lib/auth/tenant-validation";
import { calculateCost, tokensFromUsage } from "@/utils/aiCostCalculator";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { SECCIONES } from "@/lib/acm/material";
import { promptAcomodar, parsearAcomodado } from "@/lib/acm/material-ia";

export const dynamic = "force-dynamic";

const MODELO = "gemini-3.5-flash";
/** Menos que esto no hay nada que acomodar, y no vale gastar un crédito. */
const MIN_TEXTO = 20;

export async function POST(req: Request) {
  try {
    const { role } = await requireTenant();
    if (role !== "director") {
      return NextResponse.json(
        { error: "Solo los directores pueden configurar el material del ACM." },
        { status: 403 },
      );
    }

    const { clave, texto } = (await req.json()) as { clave?: string; texto?: string };

    const meta = SECCIONES.find((s) => s.clave === clave);
    if (!meta) return NextResponse.json({ error: "Sección desconocida." }, { status: 400 });

    if (!texto || texto.trim().length < MIN_TEXTO) {
      return NextResponse.json(
        { error: "Escribí un poco más antes de acomodarlo." },
        { status: 400 },
      );
    }

    const txId = await consumeAiCredits("acm_material", 1, `Acomodar sección ${meta.clave}`);

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: MODELO });
    const result = await model.generateContent(promptAcomodar(meta.clave, texto.trim()));

    const usage = result.response.usageMetadata;
    if (usage) {
      const { inputTokens, outputTokens } = tokensFromUsage(usage);
      const { totalCostUSD } = calculateCost({ model: MODELO, inputTokens, outputTokens });
      updateAiTransactionCost(txId, inputTokens, outputTokens, totalCostUSD);
    }

    return NextResponse.json({
      texto: parsearAcomodado(result.response.text(), meta.clave),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    console.error("acm-material acomodar:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
