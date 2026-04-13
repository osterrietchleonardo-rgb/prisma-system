import { createClient } from "@/lib/supabase/server";
import { prismaIA } from "@/lib/gemini";
import { NextResponse } from "next/server";
import { IpcProfile, CopyType, CopyAngle, ConsciousnessLevel, TokkoProperty } from "@/types/marketing-ia";

export const dynamic = "force-dynamic";

interface CopyConfig {
  copy_type: CopyType;
  angle: CopyAngle;
  consciousness_level: ConsciousnessLevel;
  extra_context?: string;
}

const buildCopyPrompt = (ipc: IpcProfile, config: CopyConfig, property?: TokkoProperty | null): string => {
  const nivelDesc = {
    0: "El público no sabe que tiene el problema. Creá el problema en su mente antes de hablar de la solución.",
    1: "Siente que algo no funciona pero no identifica la causa. Ayudalo a ponerle nombre al dolor.",
    2: "Sabe que hay soluciones pero no nos conoce. Posicioná nuestra solución como la correcta.",
    3: "Nos conoce pero tiene dudas. Trabajá objeciones y usá prueba social.",
    4: "Está casi listo. Sé directo. Oferta clara. CTA fuerte."
  }[config.consciousness_level];

  const angleDesc = {
    pas:          "PAS: Problema → Agitación → Solución. Empezá por el dolor, amplifícalo, presentá la salida.",
    autoridad:    "Autoridad. Posicionate como referente con credenciales y resultados concretos.",
    transformacion:"Transformación. Mostrá el antes y el después. Hablá de identidad.",
    social_proof: "Prueba social. Testimonios, casos reales, resultados de clientes similares al IPC.",
    curiosidad:   "Curiosidad. Generá intriga. No des toda la información. Hacé que quieran saber más.",
    urgencia:     "Urgencia. Escasez, tiempo limitado, consecuencias de no actuar ahora.",
    aspiracional: "Aspiracional. Conectá con la identidad que el IPC quiere tener. Hablá de su yo ideal.",
    datos:        "Datos. Estadísticas y números concretos del mercado inmobiliario argentino."
  }[config.angle];

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
- Canales: ${fd.canal_formato?.join(", ")}
- NO PROMETER: ${fd.no_prometer}
- Resumen: ${fd.resumen_frase}
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
- Evidencia Necesaria: ${fd.evidencia_necesaria?.join(", ")}
- Ángulo de Venta: ${fd.angulo_copy}
- Tono: ${fd.tono}
- NO MOSTRAR/MENCIONAR: ${fd.no_mostrar}
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

  const base = `Sos un experto en copywriting para el sector inmobiliario argentino. Tu misión es persuadir al IPC detallado abajo.

${ipcCtx}

REGLAS ESTRATÉGICAS:
- ÁNGULO: ${angleDesc}
- NIVEL DE CONSCIENCIA: Nivel ${config.consciousness_level}/4 — ${nivelDesc}
${config.extra_context ? `- CONTEXTO EXTRA DEL USUARIO: ${config.extra_context}` : ''}

TONO: Usá un lenguaje 100% rioplatense (voseo), auténtico, empático y profesional. Nada de "un hogar para vos", hablá de "tu próxima casa" o "la venta de tu depto".
Respondé ÚNICAMENTE en JSON válido.`;

  if (config.copy_type === 'video') {
    return `${base}\n\nEstructura exacta:\n{"hook":"texto para captar atención en 3 segundos","problema":"conectar con el dolor/situación (2-3 frases)","agitacion":"intensificar el sentimiento/consecuencia (2-3 frases)","solucion":"presentar la solución/beneficio (2-4 frases)","cta":"llamada a la acción clara"}`;
  } else {
    return `${base}\n\nEstructura exacta:\n{"hook":"una frase de apertura demoledora","desarrollo":"3-5 párrafos cortos que construyan el deseo usando el ángulo ${config.angle}","cta":"llamada a la acción estratégica"}`;
  }
};

export async function POST(req: Request) {
  try {
    const { ipc_id, copy_type, angle, consciousness_level, extra_context } = await req.json();
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: ipc, error: ipcError } = await supabase
      .from('ipc_profiles')
      .select('*')
      .eq('id', ipc_id)
      .eq('user_id', user.id)
      .single();

    if (ipcError || !ipc) {
      return NextResponse.json({ error: "IPC not found" }, { status: 404 });
    }

    let propertyData: TokkoProperty | null = null;
    if (ipc.tipo_ipc === 'vender' && ipc.propiedad_tokko_id) {
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("agency_id")
          .eq("id", user.id)
          .single();

        if (profile?.agency_id) {
          const { data: agency } = await supabase
            .from("agencies")
            .select("tokko_api_key")
            .eq("id", profile.agency_id)
            .single();

          const TOKKO_API_KEY = agency?.tokko_api_key || process.env.TOKKO_API_KEY;
          if (TOKKO_API_KEY) {
            const tokkoRes = await fetch(`https://tokkobroker.com/api/v1/property/${ipc.propiedad_tokko_id}/?key=${TOKKO_API_KEY}&format=json`);
            if (tokkoRes.ok) {
              const p = await tokkoRes.json();
              propertyData = {
                id: p.id,
                reference_code: p.reference_code,
                title: p.publication_title || p.address,
                address: p.address,
                zone: p.location?.name || "",
                property_type: p.type?.name || "",
                operation_type: p.operations?.[0]?.operation_type || "",
                price: p.operations?.[0]?.prices?.[0]?.price || 0,
                currency: p.operations?.[0]?.prices?.[0]?.currency || "USD",
                surface_total: p.surface || 0,
                surface_covered: p.roofed_surface || 0,
                rooms: p.room_amount || 0,
                bathrooms: p.bathroom_amount || 0,
                description: p.description,
                photos: (p.photos || []).slice(0, 5).map((f: any) => ({
                  thumb: f.thumb,
                  image: f.image
                })),
                tags: (p.tags || []).map((t: any) => t.name)
              };
            }
          }
        }
      } catch (tokkoError) {
        console.error("Error fetching Tokko property for copy generation:", tokkoError);
      }
    }

    const prompt = buildCopyPrompt(ipc as any as IpcProfile, { copy_type, angle, consciousness_level, extra_context }, propertyData);

    const result = await prismaIA.generateContent(prompt);
    const rawResponse = result.response.text();
    const cleanJsonString = rawResponse.replace(/```json|```/g, '').trim();
    
    try {
      const copyContent = JSON.parse(cleanJsonString);
      return NextResponse.json(copyContent);
    } catch (parseError) {
      console.error("Failed to parse Gemini response:", rawResponse);
      return NextResponse.json({ error: "Invalid AI response structure" }, { status: 500 });
    }

  } catch (error: any) {
    console.error("Generate Copy Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
