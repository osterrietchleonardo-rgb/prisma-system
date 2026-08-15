import { createClient } from "@/lib/supabase/server";
import { prismaIA } from "@/lib/gemini";
import { NextResponse } from "next/server";
import { consumeAiCredits, requireTenant, updateAiTransactionCost } from "@/lib/auth/tenant-validation";
import { calculateCost, tokensFromUsage } from "@/utils/aiCostCalculator";
import { AdvisorOperation, EstructuraId, IpcProfile, CopyType, CopyAngle, ConsciousnessLevel, TokkoProperty } from "@/types/marketing-ia";
import { buildPropertyDirective } from "@/lib/marketing-ia/property-context";
import { buildOperacionDirective } from "@/lib/marketing-ia/operacion-context";
import { nivelDesdeIpc, NIVEL_DESCRIPCION } from "@/lib/marketing-ia/niveles";
import { ESTRUCTURAS, resolverEstructura, esquemaJsonGuion, guiaBloquesParaPrompt } from "@/lib/marketing-ia/estructuras";

export const dynamic = "force-dynamic";

interface GenerateBatchPayload {
  ipc_id: string;
  copy_type: CopyType;
  consciousness_level?: ConsciousnessLevel;
  extra_context?: string;
  propiedad_tokko_id?: number | null;
  estructura?: EstructuraId | "sugerida";
}

const buildBatchCopyPrompt = (
  ipc: IpcProfile,
  config: GenerateBatchPayload,
  property?: TokkoProperty | null,
  directive?: string,
  operacion?: string,
  estructuraId: EstructuraId = "pas"
): string => {
  const nivelDesc = NIVEL_DESCRIPCION[config.consciousness_level ?? 1];

  let ipcCtx = "";

  if (ipc.tipo_ipc === 'captar') {
    const fd = ipc.flow_data as any;
    ipcCtx = `
PERFIL: CAPTAR PROPIETARIOS
- Nombre: ${ipc.nombre_perfil}
- Objetivo: ${ipc.objetivo}
- Tipo Propietario: ${fd.tipo_propietario}
- Motivo Venta: ${fd.motivo_venta}
- Etapa Actual: ${fd.etapa_hoy}
- Urgencia: ${fd.urgencia_necesidad}
- Depende de venta para comprar: ${fd.dependencia_venta}
- Preocupaciones: ${fd.preocupaciones?.join(", ")}
- Objeción Principal: ${fd.objecion_principal}
- Freno Hoy: ${fd.freno_hoy}
- Miedo Frecuente: ${fd.miedo_frecuente}
- Logro Esperado: ${fd.logro_esperado}
- Prioridad Sugerida: ${fd.valor_prioridad}
- Inmobiliaria que confía: ${fd.tipo_inmobiliaria_confia}
- Prueba necesaria: ${fd.prueba_confianza?.join(", ")}
- Ángulo Recomendado: ${fd.angulo_marketing}
- Tono Sugerido: ${fd.tono_comunicacion}
- Promesa Central: ${fd.promesa_central}
- CTA Sugerido: ${fd.cta_recomendado}`;
  } else {
    const fd = ipc.flow_data as any;
    ipcCtx = `
PERFIL: VENDER PROPIEDAD
- Nombre: ${ipc.nombre_perfil}
- Comprador Ideal: ${fd.tipo_comprador_ideal}
- Situación Vida: ${fd.situacion_vida}
- Necesidad: ${fd.necesidad_concreta}
- Problema que resuelve el inmueble: ${fd.problema_resolver}
- Resultado Querido: ${fd.resultado_querido}
- Atractivos Propiedad: ${fd.atractivo_propiedad?.join(", ")}
- Factores Duda / Frenos: ${fd.factores_duda?.join(", ")}
- Objeción Común: ${fd.objecion_comun}
- Ángulo de Venta: ${fd.angulo_copy}
- Promesa: ${fd.promesa_creible}
- Mensaje Central: ${fd.mensaje_central}
- CTA: ${fd.cta}`;
  }

  const base = `Sos un experto en copywriting para el sector inmobiliario argentino. Tu misión es persuadir al IPC detallado abajo creando 3 VARIACIONES ÚNICAS del copy basándote en 3 ángulos diferentes.

${ipcCtx}
${operacion ?? ""}

NIVEL DE CONSCIENCIA PARA LAS 3 VARIANTES: Nivel ${config.consciousness_level ?? 1}/4 — ${nivelDesc}
${config.extra_context ? `- CONTEXTO EXTRA DEL USUARIO: ${config.extra_context}` : ''}
${directive?.trim() ? `DIRECTIVA CREATIVA DE LA AGENCIA (OBLIGATORIO RESPETAR EN LAS 3 VARIANTES): ${directive.trim()}` : ''}

REGLA DE ORO / INSTRUCCIÓN CRÍTICA 1:
¡Las 3 variantes DEBEN seguir estrictamente las definiciones del IPC! Respetar el ángulo de marketing/copy recomendado, el tono sugerido, la promesa central, las objeciones y el dolor principal definidos en el perfil. Las variantes son solo diferentes formas de presentar este mismo mensaje sin alterar la identidad y el tono elegido.
TONO: Lenguaje 100% rioplatense (voseo), auténtico, empático y profesional. Nada de "un hogar para vos", hablá de "tu próxima casa", adaptándose a lo que dice el perfil de IPC.

${buildPropertyDirective(property, { variants: true })}

INSTRUCCIÓN CRÍTICA 2:
Debes generar exactamente 3 variaciones estructurando la narrativa sobre los siguientes 3 esquemas, SIEMPRE aplicando las definiciones del IPC arriba:
1. "pas": Problema -> Agitación -> Solución. Enfocado en el dolor del IPC.
2. "transformacion": Emocional. Mostrá el antes y el después, el deseo y la identidad del IPC.
3. "autoridad" o "datos": Lógico, demostrando credibilidad, o respondiendo directamente a la objeción/freno principal del IPC.

Respondé ÚNICAMENTE en JSON válido. El JSON debe ser estrictamente un ARRAY de 3 objetos.`;

  if (config.copy_type === 'video') {
    const estructura = ESTRUCTURAS[estructuraId];
    return `${base}

ESTRUCTURA OBLIGATORIA DEL GUION — "${estructura.label}".
Las 3 variantes usan ESTA estructura, en este orden exacto de bloques:
${guiaBloquesParaPrompt(estructura)}

ESTO ES UN GUION PARA HABLAR A CÁMARA, no un texto para leer en pantalla:
- "texto" es lo que el asesor dice en voz alta, en criollo, listo para leer de corrido. Sin acotaciones adentro del texto.
- "segundos" es cuánto dura ese bloque dicho a ritmo normal (el guion completo tiene que dar entre 30 y 60 segundos).
- "indicacion" es cómo decirlo (tono, ritmo, gesto), en menos de 12 palabras.
- "por_que" explica al asesor por qué ese bloque va en ese lugar de la fórmula, en una frase.

Estructura exacta del ARRAY JSON: 3 objetos, con "angle" distinto cada uno ("pas", "transformacion", "datos"), y cada "content" con esta forma exacta:
[
  {
    "angle": "pas",
    "content": ${esquemaJsonGuion(estructura)}
  }
]
Devolvé los 3 objetos completos, no solo el del ejemplo.`;
  } else {
    return `${base}\n\nEstructura exacta del ARRAY JSON:\n[
  {
    "angle": "pas",
    "content": {"hook":"frase de apertura","desarrollo":"cuerpo usando el ángulo pas","cta":"llamada a la acción"}
  },
  {
    "angle": "transformacion",
    "content": {"hook":"frase de apertura","desarrollo":"cuerpo usando el ángulo transformacion","cta":"llamada a la acción"}
  },
  {
    "angle": "autoridad",
    "content": {"hook":"frase de apertura","desarrollo":"cuerpo usando el ángulo de autoridad o datos","cta":"llamada a la acción"}
  }
]`;
  }
};

export async function POST(req: Request) {
  try {
    const payload: GenerateBatchPayload = await req.json();
    const { userId, agencyId } = await requireTenant();
    const supabase = await createClient();

    // Consume AI Credits (returns transaction ID for cost tracking)
    const txId = await consumeAiCredits("marketing_ia", 1, `Generate Batch: ${payload.copy_type}`);

    const { data: ipc, error: ipcError } = await supabase
      .from('ipc_profiles')
      .select('*')
      .eq('id', payload.ipc_id)
      .eq('user_id', userId)
      .single();

    if (ipcError || !ipc) {
      return NextResponse.json({ error: "IPC not found" }, { status: 404 });
    }

    // Fetch agency config (Tokko key + creative directive set by the director)
    let creativeDirective = "";
    let agencyTokkoKey: string | null = null;
    if (agencyId) {
      const { data: agency } = await supabase
        .from("agencies")
        .select("tokko_api_key, marketing_ai_config")
        .eq("id", agencyId)
        .single();
      agencyTokkoKey = agency?.tokko_api_key ?? null;
      creativeDirective = agency?.marketing_ai_config?.creative_directive ?? "";
    }

    // Forma real de trabajar del asesor (oferta irresistible + datos duros). Si no cargó nada, queda vacío.
    const { data: operacion } = await supabase
      .from("advisor_operations")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    let propertyData: TokkoProperty | null = null;
    const propertyId = payload.propiedad_tokko_id || ipc.propiedad_tokko_id || (ipc.flow_data as any).propiedad_tokko_id;

    if (propertyId) {
      try {
        if (agencyId) {
          const TOKKO_API_KEY = agencyTokkoKey || process.env.TOKKO_API_KEY;
          if (TOKKO_API_KEY) {
            const tokkoRes = await fetch(`https://tokkobroker.com/api/v1/property/${propertyId}/?key=${TOKKO_API_KEY}&format=json`);
            if (tokkoRes.ok) {
              const p = await tokkoRes.json();
              propertyData = {
                id: p.id,
                reference_code: p.reference_code,
                title: p.publication_title || p.address,
                address: p.address,
                zone: p.location?.name || "",
                property_type: p.type?.name || "",
                price: p.operations?.[0]?.prices?.[0]?.price || 0,
                currency: p.operations?.[0]?.prices?.[0]?.currency || "USD",
                surface_total: p.surface || 0,
                surface_covered: p.roofed_surface || 0,
                rooms: p.room_amount || 0,
                bathrooms: p.bathroom_amount || 0,
                description: p.description,
                tags: (p.tags || []).map((t: any) => t.name)
              } as TokkoProperty;
            }
          }
        }
      } catch (e) {
        console.error("Tokko fetch failed", e);
      }
    }

    // El nivel sale del perfil de IPC (antes se asumía siempre 1) y de ahí se sugiere la estructura.
    const nivel = payload.consciousness_level ?? nivelDesdeIpc(ipc.flow_data);
    const estructuraId = resolverEstructura(payload.estructura, nivel);
    const operacionDirective = buildOperacionDirective(
      operacion as AdvisorOperation | null,
      ipc.tipo_ipc === "vender" ? "vender" : "captar"
    );

    console.log('[DEBUG] Generating copy batch', { nivel, estructuraId, conOperacion: Boolean(operacionDirective) });
    const prompt = buildBatchCopyPrompt(
      ipc as any as IpcProfile,
      { ...payload, consciousness_level: nivel },
      propertyData,
      creativeDirective,
      operacionDirective,
      estructuraId
    );
    
    // We can use pro model for better complex JSON adherence
    const result = await prismaIA.generateContent(prompt);
    const rawResponse = result.response.text();

    // ─── Record real token usage ───────────────────────────────
    // Precio tomado de la tabla central (utils/aiCostCalculator) según el modelo real.
    const usage = result.response.usageMetadata;
    if (usage) {
      const { inputTokens: inputTk, outputTokens: outputTk } = tokensFromUsage(usage);
      const { totalCostUSD } = calculateCost({ model: "gemini-3.5-flash", inputTokens: inputTk, outputTokens: outputTk });
      updateAiTransactionCost(txId, inputTk, outputTk, totalCostUSD);
    }
    
    let cleanResponse = rawResponse;
    const jsonMatch = rawResponse.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      cleanResponse = jsonMatch[0];
    } else {
      cleanResponse = rawResponse.replace(/```json|```/g, '').trim();
    }

    try {
      const generatedBatch = JSON.parse(cleanResponse);
      if (!Array.isArray(generatedBatch)) {
        throw new Error("El resultado no es un array");
      }

      // La estructura y la duración las sella el servidor: el modelo no suma bien y no tiene por qué elegirlas.
      if (payload.copy_type === "video") {
        for (const item of generatedBatch) {
          if (!item?.content) continue;
          item.content.estructura = estructuraId;
          const bloques = Array.isArray(item.content.bloques) ? item.content.bloques : [];
          item.content.duracion_estimada = bloques.reduce(
            (total: number, b: any) => total + (Number(b?.segundos) || 0), 0
          );
        }
      }

      return NextResponse.json(generatedBatch);
    } catch (parseError) {
      console.error('[DEBUG] Failed to parse batch JSON:', cleanResponse);
      return NextResponse.json({ error: "Error parsing AI response" }, { status: 500 });
    }

  } catch (error: any) {
    console.error("Generate Copy Batch Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
