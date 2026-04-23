import { createClient } from "@/lib/supabase/server";
import { prismaIA } from "@/lib/gemini";
import { NextResponse } from "next/server";
import { IpcProfile, CopyType, CopyAngle, ConsciousnessLevel, TokkoProperty } from "@/types/marketing-ia";

export const dynamic = "force-dynamic";

interface GenerateBatchPayload {
  ipc_id: string;
  copy_type: CopyType;
  consciousness_level?: ConsciousnessLevel;
  extra_context?: string;
  propiedad_tokko_id?: number | null;
}

const buildBatchCopyPrompt = (ipc: IpcProfile, config: GenerateBatchPayload, property?: TokkoProperty | null): string => {
  const nivelDesc = {
    0: "El público no sabe que tiene el problema. Creá el problema en su mente antes de hablar de la solución.",
    1: "Siente que algo no funciona pero no identifica la causa. Ayudalo a ponerle nombre al dolor.",
    2: "Sabe que hay soluciones pero no nos conoce. Posicioná nuestra solución como la correcta.",
    3: "Nos conoce pero tiene dudas. Trabajá objeciones y usá prueba social.",
    4: "Está casi listo. Sé directo. Oferta clara. CTA fuerte."
  }[config.consciousness_level ?? 1];

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

    if (property) {
      ipcCtx += `\n\nDATOS TÉCNICOS DE LA PROPIEDAD (CONTEXTO REAL):
- Título: ${property.title}
- Dirección/Zona: ${property.address}, ${property.zone}
- Tipo: ${property.property_type}
- Precio: ${property.currency} ${property.price.toLocaleString()}
- Superficie: ${property.surface_total}m2 (${property.surface_covered}m2 cubiertos)
- Ambientes: ${property.rooms} | Baños: ${property.bathrooms}
- Descripción: ${property.description}`;
    }
  }

  const base = `Sos un experto en copywriting para el sector inmobiliario argentino. Tu misión es persuadir al IPC detallado abajo creando 3 VARIACIONES ÚNICAS del copy basándote en 3 ángulos diferentes.

${ipcCtx}

NIVEL DE CONSCIENCIA PARA LAS 3 VARIANTES: Nivel ${config.consciousness_level ?? 1}/4 — ${nivelDesc}
${config.extra_context ? `- CONTEXTO EXTRA DEL USUARIO: ${config.extra_context}` : ''}

REGLA DE ORO / INSTRUCCIÓN CRÍTICA 1:
¡Las 3 variantes DEBEN seguir estrictamente las definiciones del IPC! Respetar el ángulo de marketing/copy recomendado, el tono sugerido, la promesa central, las objeciones y el dolor principal definidos en el perfil. Las variantes son solo diferentes formas de presentar este mismo mensaje sin alterar la identidad y el tono elegido.
TONO: Lenguaje 100% rioplatense (voseo), auténtico, empático y profesional. Nada de "un hogar para vos", hablá de "tu próxima casa", adaptándose a lo que dice el perfil de IPC.

INSTRUCCIÓN CRÍTICA 2:
Debes generar exactamente 3 variaciones estructurando la narrativa sobre los siguientes 3 esquemas, SIEMPRE aplicando las definiciones del IPC arriba:
1. "pas": Problema -> Agitación -> Solución. Enfocado en el dolor del IPC.
2. "transformacion": Emocional. Mostrá el antes y el después, el deseo y la identidad del IPC.
3. "autoridad" o "datos": Lógico, demostrando credibilidad, o respondiendo directamente a la objeción/freno principal del IPC.

Respondé ÚNICAMENTE en JSON válido. El JSON debe ser estrictamente un ARRAY de 3 objetos.`;

  if (config.copy_type === 'video') {
    return `${base}\n\nEstructura exacta del ARRAY JSON:\n[
  {
    "angle": "pas",
    "content": {"hook":"texto para captar atención","problema":"...","agitacion":"...","solucion":"...","cta":"..."}
  },
  {
    "angle": "transformacion",
    "content": {"hook":"texto para captar atención","problema":"...","agitacion":"...","solucion":"...","cta":"..."}
  },
  {
    "angle": "datos",
    "content": {"hook":"texto para captar atención","problema":"...","agitacion":"...","solucion":"...","cta":"..."}
  }
]`;
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
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: ipc, error: ipcError } = await supabase
      .from('ipc_profiles')
      .select('*')
      .eq('id', payload.ipc_id)
      .eq('user_id', user.id)
      .single();

    if (ipcError || !ipc) {
      return NextResponse.json({ error: "IPC not found" }, { status: 404 });
    }

    let propertyData: TokkoProperty | null = null;
    const propertyId = payload.propiedad_tokko_id || ipc.propiedad_tokko_id || (ipc.flow_data as any).propiedad_tokko_id;

    if (propertyId) {
      try {
        const { data: profile } = await supabase.from("profiles").select("agency_id").eq("id", user.id).single();
        if (profile?.agency_id) {
          const { data: agency } = await supabase.from("agencies").select("tokko_api_key").eq("id", profile.agency_id).single();
          const TOKKO_API_KEY = agency?.tokko_api_key || process.env.TOKKO_API_KEY;
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
                description: p.description
              } as TokkoProperty;
            }
          }
        }
      } catch (e) {
        console.error("Tokko fetch failed", e);
      }
    }

    console.log('[DEBUG] Generating copy batch');
    const prompt = buildBatchCopyPrompt(ipc as any as IpcProfile, payload, propertyData);
    
    // We can use pro model for better complex JSON adherence
    const result = await prismaIA.generateContent(prompt);
    const rawResponse = result.response.text();
    
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
