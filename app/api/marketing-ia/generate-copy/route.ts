import { createClient } from "@/lib/supabase/server";
import { prismaIA } from "@/lib/gemini";
import { NextResponse } from "next/server";
import { IpcProfile, CopyType, CopyAngle, ConsciousnessLevel } from "@/types/marketing-ia";

export const dynamic = "force-dynamic";

interface CopyConfig {
  copy_type: CopyType;
  angle: CopyAngle;
  consciousness_level: ConsciousnessLevel;
  extra_context?: string;
}

const buildCopyPrompt = (ipc: IpcProfile, config: CopyConfig): string => {
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

  const ipcCtx = `
PERFIL DEL CLIENTE IDEAL:
- Nombre: ${ipc.nombre_perfil} | Edad: ${ipc.rango_edad} | Género: ${ipc.genero}
- Zona: ${ipc.zona_geografica} | Rol: ${ipc.rol_sector}
- Problema principal: ${ipc.problema_principal}
- Mayor frustración: ${ipc.mayor_frustracion}
- Lo que le hace perder tiempo/dinero: ${ipc.pierde_tiempo_dinero}
- Mayor estrés: ${ipc.mayor_estres}
- Miedos: ${JSON.stringify(ipc.mayor_miedo)}
- Freno para avanzar: ${ipc.freno_para_avanzar}
- Objeciones: ${ipc.objeciones}
- Meta 12 meses: ${ipc.meta_12_meses}
- Negocio ideal: ${ipc.negocio_ideal}
- Vida transformada: ${ipc.vida_transformada}
- Lo que lo mueve a decidir: ${JSON.stringify(ipc.motiva_decision)}
- Valora en proveedor: ${ipc.valora_en_proveedor}
- Trigger de decisión: ${ipc.trigger_decision}
- Redes sociales: ${JSON.stringify(ipc.redes_sociales)}`.trim();

  const base = `Sos un experto en copywriting para el sector inmobiliario argentino.

${ipcCtx}

ÁNGULO: ${angleDesc}
NIVEL DE CONSCIENCIA: Nivel ${config.consciousness_level}/4 — ${nivelDesc}
${config.extra_context ? `CONTEXTO ADICIONAL: ${config.extra_context}` : ''}

Usá lenguaje coloquial rioplatense, directo, auténtico. Nada genérico.
Cada sección debe conectar directamente con los datos del IPC.
Respondé ÚNICAMENTE en JSON válido, sin texto adicional ni backticks.`;

  if (config.copy_type === 'video') {
    return `${base}\n\nEstructura exacta:\n{"hook":"texto para primeros 3 segundos","problema":"2-3 frases sobre el dolor","agitacion":"consecuencias de no resolver (2-3 frases)","solucion":"presentación de la solución (2-4 frases)","cta":"llamada a la acción (1-2 frases)"}`;
  } else {
    return `${base}\n\nEstructura exacta:\n{"hook":"primera línea que frena el scroll (1 oración impactante)","desarrollo":"3-5 párrafos cortos conectados al IPC con la estructura del ángulo","cta":"llamada a la acción directa (1-2 frases)"}`;
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

    const prompt = buildCopyPrompt(ipc as any as IpcProfile, { copy_type, angle, consciousness_level, extra_context });

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
