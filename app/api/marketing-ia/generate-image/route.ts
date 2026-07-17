import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { generateImage } from "@/lib/gemini";
import { consumeAiCredits, requireTenant, updateAiTransactionCost } from "@/lib/auth/tenant-validation";
import { calculateImageCost } from "@/utils/aiCostCalculator";
import { GenerateImagePayload } from "@/types/marketing-ia";
import sharp from "sharp";

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
    
    const logoArea = branding.logo_url 
      ? `COMPOSICIÓN DE MARCA: La fotografía debe abarcar todo el lienzo de forma continua. NO dibujar recuadros blancos, cajas ni parches geométricos vacíos.`
      : '';
    
    const fonts = {
      sans: 'estilo moderno y minimalista (Sans-serif)',
      serif: 'estilo elegante y sofisticado (Serif)',
      script: 'estilo manuscrito o artístico (Script/Handwritten)',
      display: 'estilo de impacto y audaz (Bold/Display)'
    }[branding.brand_font as 'sans' | 'serif' | 'script' | 'display'] || 'moderno';

    const directive = branding.creative_directive?.trim()
      ? `DIRECTIVA CREATIVA DE LA AGENCIA (OBLIGATORIO RESPETAR): ${branding.creative_directive.trim()}`
      : '';

    brandingCtx = `
IDENTIDAD DE MARCA (OBLIGATORIO):
${colors}
${logoArea}
TIPOGRAFÍA PREFERIDA: Usar una tipografía de ${fonts} para cualquier texto en la imagen.
${directive}
`;
  }

  const legalNotice = branding?.legal_notice?.trim()
    ? `
AVISO LEGAL (OBLIGATORIO):
Incluir el siguiente texto legal en una franja sutil en la parte INFERIOR de la imagen, en letra PEQUEÑA pero perfectamente LEGIBLE, con buen contraste sobre el fondo:
"${branding.legal_notice.trim()}"`
    : '';

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
${legalNotice}

REGLAS DE COMPOSICIÓN:
- El hook del copy debe estar visible y legible en la imagen
- Composición profesional apta para Instagram y redes sociales
- Fotografía limpia y fotorrealista ocupando el encuadre completo. NO agregar recuadros blancos, cajas ni bloques de color artificiales sobre la foto.
- Sin elementos genéricos ni stock photos de baja calidad
- Resultado fotorrealista de alta calidad para uso comercial en Argentina
- Si se especificaron colores de marca, el diseño debe ser coherente con ellos.
- Si se especificó un aviso legal, incluirlo únicamente en la franja inferior en letra pequeña y legible.

${payload.extra_prompt ? `INSTRUCCIONES ADICIONALES: ${payload.extra_prompt}` : ''}
  `.trim();
};

export async function POST(req: Request) {
  try {
    const payload: GenerateImagePayload = await req.json();
    const { userId, agencyId } = await requireTenant();
    const supabase = await createClient();
    const supabaseAdmin = createAdminClient();
    
    // Fetch agency branding configuration from Configuración IA + fallback to general agency logo
    const { data: agency } = await supabaseAdmin
      .from("agencies")
      .select("logo_url, marketing_ai_config")
      .eq("id", agencyId)
      .single();

    const marketingConfig = agency?.marketing_ai_config || {};
    const finalPrompt = buildImagePrompt(payload, marketingConfig);
    const { draft_id, style, format, extra_prompt } = payload;

    // Consume AI Credits (returns transaction ID for cost tracking)
    const txId = await consumeAiCredits("marketing_ia", 2, `Generate Image: ${payload.format} ${payload.style}`);

    console.log('[DEBUG] Generating image with Gemini for draft:', draft_id);
    
    let imageBuffer: Buffer;
    try {
      // Generate clean base image with Gemini AI (without prompt imageParts to avoid logo hallucinations)
      imageBuffer = await generateImage(finalPrompt, 'pro', []);

      // ─── Deterministic Logo Overlay via Sharp ──────────────────────
      const logoUrl = marketingConfig.logo_url || agency?.logo_url;
      console.log('[DEBUG] Logo URL detected:', logoUrl);

      if (logoUrl) {
        try {
          let logoRawBuffer: Buffer | null = null;
          
          // 1. Try HTTP fetch
          try {
            const logoRes = await fetch(logoUrl);
            if (logoRes.ok) {
              logoRawBuffer = Buffer.from(await logoRes.arrayBuffer());
              console.log('[DEBUG] Logo fetched successfully via HTTP');
            } else {
              console.warn(`[WARN] Logo HTTP fetch status: ${logoRes.status}`);
            }
          } catch (httpErr) {
            console.error("[ERROR] Logo HTTP fetch error:", httpErr);
          }

          // 2. Fallback to Supabase Storage direct download if HTTP fetch failed
          if (!logoRawBuffer && logoUrl.includes('marketing-images')) {
            try {
              const storagePath = logoUrl.split('marketing-images/')[1];
              if (storagePath) {
                const { data: fileData, error: storageErr } = await supabaseAdmin.storage
                  .from('marketing-images')
                  .download(storagePath);
                if (fileData && !storageErr) {
                  logoRawBuffer = Buffer.from(await fileData.arrayBuffer());
                  console.log('[DEBUG] Logo downloaded successfully via Supabase Storage fallback');
                } else if (storageErr) {
                  console.error('[ERROR] Storage download error:', storageErr);
                }
              }
            } catch (stErr) {
              console.error("[ERROR] Logo Storage download exception:", stErr);
            }
          }

          if (logoRawBuffer) {
            // Read real base image dimensions from Gemini imageBuffer
            const baseMeta = await sharp(imageBuffer).metadata();
            const imgWidth = baseMeta.width || 1080;
            const imgHeight = baseMeta.height || (format === 'post' ? 1080 : 1920);
            console.log(`[DEBUG] Gemini base image dimensions: ${imgWidth}x${imgHeight}`);

            // Target logo width scale (small: 12%, medium: 16%, large: 22% of image width)
            const sizePercent = {
              small: 0.12,
              medium: 0.16,
              large: 0.22
            }[marketingConfig.logo_size as 'small' | 'medium' | 'large'] || 0.16;

            const targetLogoWidth = Math.round(imgWidth * sizePercent);

            // Resize logo maintaining aspect ratio and transparent PNG intact
            const resizedLogoBuffer = await sharp(logoRawBuffer)
              .resize({ width: targetLogoWidth, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
              .toBuffer();

            const logoMeta = await sharp(resizedLogoBuffer).metadata();
            const logoW = logoMeta.width || targetLogoWidth;
            const logoH = logoMeta.height || Math.round(targetLogoWidth * 0.5);

            const margin = Math.round(imgWidth * 0.04); // 4% margin
            const hasLegalNotice = Boolean(marketingConfig.legal_notice?.trim());

            // Bottom offset: if legal notice is present, place logo above the legal notice bar (~12% of imgHeight)
            const bottomOffset = hasLegalNotice 
              ? Math.round(imgHeight * 0.11) + logoH + 15
              : logoH + margin;

            const position = marketingConfig.logo_position || 'bottom-right';
            let left = margin;
            let top = margin;

            switch (position) {
              case 'top-left':
                left = margin;
                top = margin;
                break;
              case 'top-right':
                left = imgWidth - logoW - margin;
                top = margin;
                break;
              case 'bottom-left':
                left = margin;
                top = imgHeight - bottomOffset;
                break;
              case 'bottom-right':
              default:
                left = imgWidth - logoW - margin;
                top = imgHeight - bottomOffset;
                break;
            }

            // Clamping inside image bounds
            left = Math.max(margin, Math.min(left, imgWidth - logoW - margin));
            top = Math.max(margin, Math.min(top, imgHeight - logoH - margin));

            imageBuffer = await sharp(imageBuffer)
              .composite([
                {
                  input: resizedLogoBuffer,
                  top: Math.round(top),
                  left: Math.round(left),
                }
              ])
              .toBuffer();

            console.log(`[DEBUG] Sharp logo overlay SUCCESS (${position}, size: ${marketingConfig.logo_size || 'medium'}, pos: [${Math.round(left)}, ${Math.round(top)}])`);
          } else {
            console.warn('[WARN] Could not retrieve logo buffer for overlay. logoUrl:', logoUrl);
          }
        } catch (logoOverlayError) {
          console.error("[ERROR] Sharp composite failed:", logoOverlayError);
        }
      } else {
        console.warn('[WARN] No logo_url found in marketing_ai_config or agency record');
      }

      // ─── Record image cost ──────────────────────────────────────────
      const promptTokensEst = Math.ceil(finalPrompt.length / 4);
      const imageRes = payload.format === 'post' ? '1k' : '2k';
      const { totalCostUSD } = calculateImageCost({ model: "gemini-3-pro-image", imageCount: 1, resolution: imageRes });
      updateAiTransactionCost(txId, promptTokensEst, 0, totalCostUSD);
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

