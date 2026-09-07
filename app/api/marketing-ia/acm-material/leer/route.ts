// ACM · Relee TODOS los archivos de la lista y propone las cuatro secciones.
// No guarda nada: la propuesta se le muestra al director al lado de lo que ya tenía, y él
// acepta sección por sección. Así reemplazar un archivo nunca pisa un texto corregido a mano.
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  consumeAiCredits, requireTenant, updateAiTransactionCost,
} from "@/lib/auth/tenant-validation";
import { calculateCost, tokensFromUsage } from "@/utils/aiCostCalculator";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { extensionDe, extraerTexto } from "@/lib/acm/material-extraer";
import { esRutaDeLaAgencia } from "@/lib/acm/material";
import { promptReparto, parsearReparto } from "@/lib/acm/material-ia";

export const dynamic = "force-dynamic";

const BUCKET = "acm-material";
const MODELO = "gemini-3.5-flash";
/** Tope por archivo: más que esto no aporta y encarece la llamada. */
const MAX_TEXTO = 30000;

export async function POST(req: Request) {
  try {
    const { agencyId, role } = await requireTenant();
    if (role !== "director") {
      return NextResponse.json(
        { error: "Solo los directores pueden configurar el material del ACM." },
        { status: 403 },
      );
    }

    const { paths } = (await req.json()) as { paths?: string[] };
    // El listado llega del navegador, así que se exige la forma exacta que arma la subida.
    // Un startsWith no alcanza: `A/../B/ajeno.pdf` también empieza con el id propio.
    const propios = (paths ?? []).filter((p) => esRutaDeLaAgencia(p, agencyId));
    if (propios.length === 0) {
      return NextResponse.json({ error: "No hay archivos para leer." }, { status: 400 });
    }

    const admin = createAdminClient();
    const textos: string[] = [];
    for (const path of propios) {
      const { data, error } = await admin.storage.from(BUCKET).download(path);
      if (error || !data) {
        console.error("acm-material: no se pudo bajar", path, error?.message);
        continue;
      }
      const ext = extensionDe(path);
      if (!ext) continue;
      const buffer = Buffer.from(await data.arrayBuffer());
      const texto = await extraerTexto(buffer, ext);
      if (texto.trim().length > 0) textos.push(texto.slice(0, MAX_TEXTO));
    }

    if (textos.length === 0) {
      return NextResponse.json(
        { error: "No se pudo leer texto de esos archivos. Puede que sean imágenes escaneadas." },
        { status: 400 },
      );
    }

    const txId = await consumeAiCredits(
      "acm_material", 1, `Leer material ACM (${textos.length} archivo/s)`,
    );

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: MODELO });
    const result = await model.generateContent(promptReparto(textos));

    const usage = result.response.usageMetadata;
    if (usage) {
      const { inputTokens, outputTokens } = tokensFromUsage(usage);
      const { totalCostUSD } = calculateCost({ model: MODELO, inputTokens, outputTokens });
      updateAiTransactionCost(txId, inputTokens, outputTokens, totalCostUSD);
    }

    return NextResponse.json({ secciones: parsearReparto(result.response.text()) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    console.error("acm-material leer:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
