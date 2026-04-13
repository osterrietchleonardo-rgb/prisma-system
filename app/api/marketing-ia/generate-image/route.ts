import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { generateImage } from "@/lib/gemini";
import { GenerateImagePayload } from "@/types/marketing-ia";

const buildImagePrompt = (payload: GenerateImagePayload): string => {
  const dimensiones = {
    reels:   '1080x1920, formato vertical 9:16, optimizado para Instagram Reels',
    post:    '1080x1080, formato cuadrado 1:1, optimizado para Instagram Post',
    historia:'1080x1920, formato vertical 9:16, optimizado para Instagram Historia'
  }[payload.format];

  const estilos = {
    moderno:     'moderno y minimalista, paleta neutra con acentos cobre, tipografía sans-serif limpia',
    lujoso:      'lujoso y premium, tonos dorados y oscuros, iluminación elegante, acabados de alta gama',
    calido:      'cálido y familiar, colores terrosos, luz natural suave, ambiente acogedor',
    corporativo: 'corporativo y profesional, azules y grises, composición ordenada y confiable',
    vibrante:    'vibrante y colorido, alto contraste, energía positiva, scroll-stopping'
  }[payload.style];

  const propiedadCtx = payload.tokko_property
    ? `
PROPIEDAD A DESTACAR:
- Tipo: ${payload.tokko_property.property_type}
- Dirección: ${payload.tokko_property.address}, ${payload.tokko_property.zone}
- Precio: ${payload.tokko_property.currency} ${payload.tokko_property.price.toLocaleString()}
- Superficie: ${payload.tokko_property.surface_total}m²
- Ambientes: ${payload.tokko_property.rooms} | Baños: ${payload.tokko_property.bathrooms}
- Descripción: ${payload.tokko_property.description?.slice(0, 200)}
Componer la imagen destacando visualmente las características de esta propiedad.`
    : 'Imagen representativa del mercado inmobiliario argentino premium.';

  return `
Creá una imagen publicitaria profesional para redes sociales de una inmobiliaria argentina.

FORMATO: ${dimensiones}
ESTILO VISUAL: ${estilos}

TEXTO PRINCIPAL A INCLUIR EN LA IMAGEN:
"${payload.copy_content.hook}"

${propiedadCtx}

REGLAS DE COMPOSICIÓN:
- El hook del copy debe estar visible y legible en la imagen
- Composición profesional apta para Instagram y redes sociales
- Dejar espacio reservado en la esquina inferior para el logo de la inmobiliaria
- Sin elementos genéricos ni stock photos de baja calidad
- Resultado fotorrealista de alta calidad para uso comercial en Argentina

${payload.extra_prompt ? `INSTRUCCIONES ADICIONALES: ${payload.extra_prompt}` : ''}
  `.trim();
};

export async function POST(req: Request) {
  try {
    const payload: GenerateImagePayload = await req.json();
    const supabase = await createClient();
    const supabaseAdmin = createAdminClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const finalPrompt = buildImagePrompt(payload);
    const { draft_id, style, format, extra_prompt } = payload;

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: "Gemini API Key not configured" }, { status: 500 });
    }

    console.log('[DEBUG] Generating image with Gemini (Nano Banana) for draft:', draft_id);
    
    let imageBuffer: Buffer;
    try {
      // Use Nano Banana 2 (Standard/Flash) for efficiency or Pro for higher quality
      imageBuffer = await generateImage(finalPrompt, 'pro');
    } catch (apiError: any) {
      console.error("Gemini Image Generation Error:", apiError);
      
      const errorMessage = apiError.message || "";
      if (errorMessage.includes("429") || errorMessage.includes("quota")) {
        return NextResponse.json({ 
          error: "Cuota de generación excedida o requiere habilitar facturación en Google Cloud.",
          details: "La generación de imágenes con Gemini Imagen requiere un plan de pago habilitado."
        }, { status: 429 });
      }

      return NextResponse.json({ 
        error: "Error al generar imagen con la IA", 
        details: apiError.message 
      }, { status: 500 });
    }

    // Upload to Storage using Admin Client
    const fileName = `${user.id}/${draft_id}/${Date.now()}.jpg`;
    console.log('[DEBUG] Uploading to bucket: marketing-images, file:', fileName);
    
    const { error: uploadError } = await supabaseAdmin.storage
      .from('marketing-images')
      .upload(fileName, imageBuffer, {
        contentType: 'image/jpeg',
        cacheControl: '3600'
      });

    if (uploadError) {
      console.error("Storage Upload Error:", uploadError);
      return NextResponse.json({ 
        error: `Error al subir a Storage: ${uploadError.message}`,
        details: uploadError
      }, { status: 500 });
    }

    const { data: { publicUrl } } = supabase.storage
      .from('marketing-images')
      .getPublicUrl(fileName);

    // Get dimensions based on format
    const width = 1080;
    const height = format === 'post' ? 1080 : 1920;

    const { data: savedImage, error: dbError } = await supabaseAdmin
      .from('generated_images')
      .insert({
        user_id: user.id,
        draft_id,
        format,
        style,
        storage_path: fileName,
        public_url: publicUrl,
        width,
        height,
        extra_prompt
      })
      .select()
      .single();

    if (dbError) {
      console.error("Database Insert Error:", dbError);
    }

    return NextResponse.json({
      success: true,
      image_url: publicUrl,
      id: savedImage?.id
    });

  } catch (error: any) {
    console.error("Main Generate Image Route Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
