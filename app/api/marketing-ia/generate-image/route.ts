import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const prompt = buildImagePrompt(payload);
    const dims = { reels: [1080, 1920], post: [1080, 1080], historia: [1080, 1920] }[payload.format];

    if (!process.env.NANO_BANANA_API_KEY) {
      return NextResponse.json({ error: "Nano Banana API Key not configured" }, { status: 500 });
    }

    const response = await fetch('https://api.nanobanana.ai/v2/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.NANO_BANANA_API_KEY}`
      },
      body: JSON.stringify({
        model: 'nano-banana-pro-2',
        prompt: prompt,
        width: dims[0],
        height: dims[1],
        quality: 'hd',
        output_format: 'png'
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Nano Banana API Error:", err);
      return NextResponse.json({ error: "Failed to generate image" }, { status: response.status });
    }

    const data = await response.json();
    const imageUrl = data.image_url;

    if (!imageUrl) {
      return NextResponse.json({ error: "No image URL returned" }, { status: 500 });
    }

    // Download image
    const imageRes = await fetch(imageUrl);
    const imageBlob = await imageRes.blob();

    // Upload to Supabase Storage
    const storagePath = `${user.id}/${payload.draft_id}/${Date.now()}.png`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('marketing-images')
      .upload(storagePath, imageBlob, { contentType: 'image/png', upsert: false });

    if (uploadError) {
      console.error("Storage Upload Error:", uploadError);
      return NextResponse.json({ error: "Failed to upload image to storage" }, { status: 500 });
    }

    const publicUrl = supabase.storage
      .from('marketing-images')
      .getPublicUrl(uploadData.path).data.publicUrl;

    // Save to Database
    const { data: generatedImage, error: dbError } = await supabase
      .from('generated_images')
      .insert({
        user_id: user.id,
        draft_id: payload.draft_id,
        format: payload.format,
        style: payload.style,
        storage_path: storagePath,
        public_url: publicUrl,
        width: dims[0],
        height: dims[1],
        extra_prompt: payload.extra_prompt
      })
      .select()
      .single();

    if (dbError) {
      console.error("Database Insert Error:", dbError);
      return NextResponse.json({ error: "Failed to save image record" }, { status: 500 });
    }

    return NextResponse.json(generatedImage);

  } catch (error: any) {
    console.error("Generate Image Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
