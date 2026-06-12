import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { generateImage } from "@/lib/gemini";
import { consumeAiCredits, requireTenant, updateAiTransactionCost } from "@/lib/auth/tenant-validation";
import { GenerateImagePayload } from "@/types/marketing-ia";

const buildImagePrompt = (payload: GenerateImagePayload, branding?: any): string => {
  const dimensiones = {
    reels:   '1080x1920, formato vertical 9:16, optimizado para Instagram Reels',
    post:    '1080x1080, formato cuadrado 1:1, optimizado para Instagram Post',
    historia:'1080x1920, formato vertical 9:16, optimizado para Instagram Historia'
  }[payload.format];

  let brandingCtx = '';
  if (branding) {
    const colors = branding.brand_colors?.length > 0 
      ? `PALETA DE COLORES DE MARCA: ${branding.brand_colors.join(', ')}. Usar estos colores para elementos gráficos, acentos y armonía visual.` 
      : '';
    
    const logo = branding.logo_url 
      ? `INCORPORACIÓN DE LOGO: Se ha adjuntado una imagen del logo real de la inmobiliaria. ES OBLIGATORIO integrar EXACTAMENTE este logo en la imagen generada, respetando sus colores y diseño. 
Posición deseada: ${branding.logo_position}
Tamaño deseado: ${branding.logo_size}
Asegurate de que el logo se vea nítido y profesional, como una superposición de marca real.`
      : '';
    
    const fonts = {
      sans: 'estilo moderno y minimalista (Sans-serif)',
      serif: 'estilo elegante y sofisticado (Serif)',
      script: 'estilo manuscrito o artístico (Script/Handwritten)',
      display: 'estilo de impacto y audaz (Bold/Display)'
    }[branding.brand_font as 'sans' | 'serif' | 'script' | 'display'] || 'moderno';

    brandingCtx = `
IDENTIDAD DE MARCA (OBLIGATORIO):
${colors}
${logo}
TIPOGRAFÍA PREFERIDA: Usar una tipografía de ${fonts} para cualquier texto en la imagen.
`;
  }

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

${brandingCtx}

FORMATO: ${dimensiones}
ESTILO VISUAL: ${estilos}

TEXTO PRINCIPAL A INCLUIR EN LA IMAGEN:
"${payload.copy_content.hook}"

${propiedadCtx}

REGLAS DE COMPOSICIÓN:
- El hook del copy debe estar visible y legible en la imagen
- Composición profesional apta para Instagram y redes sociales
- Dejar espacio reservado en la esquina indicada para el logo de la inmobiliaria
- Sin elementos genéricos ni stock photos de baja calidad
- Resultado fotorrealista de alta calidad para uso comercial en Argentina
- Si se especificaron colores de marca, el diseño debe ser coherente con ellos.

${payload.extra_prompt ? `INSTRUCCIONES ADICIONALES: ${payload.extra_prompt}` : ''}
  `.trim();
};

export async function POST(req: Request) {
  try {
    const payload: GenerateImagePayload = await req.json();
    const { userId, agencyId } = await requireTenant();
    const supabase = await createClient();
    const supabaseAdmin = createAdminClient();
    
    // Fetch agency branding configuration
    const { data: agency } = await supabaseAdmin
      .from("agencies")
      .select("marketing_ai_config")
      .eq("id", agencyId)
      .single();

    const finalPrompt = buildImagePrompt(payload, agency?.marketing_ai_config);
    const { draft_id, style, format, extra_prompt } = payload;

    // Consume AI Credits (returns transaction ID for cost tracking)
    // Images cost is per-image, not per-token. We record prompt tokens as input,
    // output_tokens = 0 (it's an image, not text), and USD = cost per image.
    const txId = await consumeAiCredits("marketing_ia", 2, `Generate Image: ${payload.format} ${payload.style}`);

    console.log('[DEBUG] Generating image with Gemini (Nano Banana) for draft:', draft_id);
    
    let imageBuffer: Buffer;
    try {
      const imageParts: { data: Buffer, mimeType: string }[] = [];
      
      // If there's a logo, fetch it and add as reference
      if (agency?.marketing_ai_config?.logo_url) {
        try {
          const logoRes = await fetch(agency.marketing_ai_config.logo_url);
          if (logoRes.ok) {
            const logoBuffer = Buffer.from(await logoRes.arrayBuffer());
            const contentType = logoRes.headers.get('content-type') || 'image/png';
            imageParts.push({ data: logoBuffer, mimeType: contentType });
            console.log('[DEBUG] Logo added as reference image part');
          }
        } catch (logoFetchError) {
          console.error("Error fetching logo for prompt reference:", logoFetchError);
        }
      }

      // Use Nano Banana 2 (Standard/Flash) for efficiency or Pro for higher quality
      imageBuffer = await generateImage(finalPrompt, 'pro', imageParts);

      // ─── Record image cost ──────────────────────────────────────────
      // Imagen 3 Pro @ 1024x1024: ~$0.04/image (standard) / ~$0.06/image (pro)
      // We store prompt length as input_tokens (approx), output_tokens = 0
      const promptTokensEst = Math.ceil(finalPrompt.length / 4); // ~4 chars/token
      const imageUsd = 0.06; // pro quality
      updateAiTransactionCost(txId, promptTokensEst, 0, imageUsd);
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
    const fileName = `${userId}/${draft_id}/${Date.now()}.jpg`;
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
        user_id: userId,
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
      ...savedImage
    });

  } catch (error: any) {
    console.error("Main Generate Image Route Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
