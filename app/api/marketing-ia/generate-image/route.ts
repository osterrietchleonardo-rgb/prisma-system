import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { generateImage } from "@/lib/gemini";
import { consumeAiCredits, requireTenant, updateAiTransactionCost } from "@/lib/auth/tenant-validation";
import { calculateImageCost } from "@/utils/aiCostCalculator";
import { GenerateImagePayload, TokkoProperty } from "@/types/marketing-ia";
import sharp from "sharp";
import type { OverlayOptions } from "sharp";
import { armarFranjaLegal } from "@/lib/marketing-ia/aviso-legal";
import { formatoDe } from "@/lib/marketing-ia/formatos";
import { halodeContraste, prepararLogo } from "@/lib/marketing-ia/logo";
import { urlDelLogo } from "@/lib/marketing-ia/logo-variante";
import { armarPlacaConFoto, type ContenidoPanel } from "@/lib/marketing-ia/placa-con-foto";
import { sinEmojis } from "@/lib/marketing-ia/parrafos";

/**
 * Los datos de la propiedad, buscados EN EL SERVIDOR.
 *
 * La pantalla manda el id y no los datos: hasta el 16-sep-2026 mandaba
 * `flow_data.tokko_property_details`, que está vacío en los perfiles reales (verificado en
 * `ipc_profiles`), así que la placa no recibía nada y caía en "imagen representativa del
 * mercado inmobiliario argentino premium".
 */
async function traerPropiedad(
  tokkoId: number | string | null | undefined,
  claveAgencia: string | null
): Promise<TokkoProperty | null> {
  if (!tokkoId) return null;
  // El id viaja a una URL de Tokko CON la clave de la agencia adentro. No confiamos en que
  // llegue numerico solo porque el tipo dice `number | string`: un string cualquiera ahi
  // adentro viaja con la credencial en un pedido saliente. Nunca se pudo explotar (Tokko
  // devuelve 404 con basura), pero un valor sin validar no debe llegar a una URL con una
  // credencial adentro — se corta antes.
  if (!/^\d+$/.test(String(tokkoId))) {
    console.error("[PLACA] propiedad_tokko_id invalido, no es un id numerico:", tokkoId);
    return null;
  }
  const clave = claveAgencia || process.env.TOKKO_API_KEY;
  if (!clave) return null;
  try {
    const res = await fetch(`https://tokkobroker.com/api/v1/property/${tokkoId}/?key=${clave}&format=json`);
    if (!res.ok) return null;
    const p = await res.json();
    return {
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
      tags: (p.tags || []).map((t: any) => t.name),
    } as TokkoProperty;
  } catch (e) {
    console.error("[PLACA] No se pudo traer la propiedad de Tokko:", e);
    return null;
  }
}

/** El contenido del panel, armado con los datos reales. Sin emojis: acá no se pueden dibujar. */
function contenidoDelPanel(hook: string, p: TokkoProperty | null): ContenidoPanel {
  const ubicacion = [p?.address, p?.zone].filter(Boolean).join(", ");
  const precio = p?.price
    ? `${p.currency || "USD"} ${Number(p.price).toLocaleString("es-AR")}`
    : undefined;
  const datos = [
    p?.rooms ? `${p.rooms} ${p.rooms === 1 ? "ambiente" : "ambientes"}` : null,
    p?.surface_total ? `${p.surface_total} m²` : null,
    p?.bathrooms ? `${p.bathrooms} ${p.bathrooms === 1 ? "baño" : "baños"}` : null,
    ...(p?.tags ?? []).slice(0, 3),
  ].filter(Boolean) as string[];

  return {
    titulo: sinEmojis(hook),
    bajada: ubicacion ? sinEmojis(ubicacion) : undefined,
    precio: precio ? sinEmojis(precio) : undefined,
    datos: datos.map(sinEmojis),
  };
}

/**
 * Baja el logo (HTTP, con fallback a Supabase Storage) y lo deja preparado al ancho de la placa.
 * Devuelve null si no hay logoUrl o si no se pudo conseguir el archivo — en cualquiera de los
 * dos casos ya deja loggeado el motivo.
 *
 * Comun a los dos caminos (junto con `capasDelLogo` de abajo) para que no puedan volver a
 * divergir: hasta el 16-sep-2026 el camino con foto tenia su propia copia recortada de esta
 * logica, sin el fallback a Storage y sin loguear nada si el logo no se conseguia.
 */
async function bajarYPrepararLogo(
  logoUrl: string | null | undefined,
  imgWidth: number,
  logoSize: string | undefined,
  supabaseAdmin: ReturnType<typeof createAdminClient>
): Promise<Awaited<ReturnType<typeof prepararLogo>> | null> {
  console.log('[DEBUG] Logo URL detected:', logoUrl);
  if (!logoUrl) {
    console.warn('[WARN] No logo_url found in marketing_ai_config or agency record');
    return null;
  }

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

  if (!logoRawBuffer) {
    console.warn('[WARN] Could not retrieve logo buffer for overlay. logoUrl:', logoUrl);
    return null;
  }

  try {
    return await prepararLogo(logoRawBuffer, imgWidth, logoSize);
  } catch (e) {
    console.error("[ERROR] No se pudo preparar el logo:", e);
    return null;
  }
}

/**
 * Donde va el logo y, si hace falta, el halo de contraste detras: las capas para pasarle a
 * sharp junto con lo demas. No compone nada — el que llama decide el orden con la franja legal
 * en una sola pasada.
 *
 * `imageBuffer` tiene que ser la imagen TAL COMO VA A QUEDAR debajo del logo (la de Gemini ya
 * recortada, o la placa con la foto ya armada): el halo se mide contra esos pixeles, no contra
 * un fondo generico.
 */
async function capasDelLogo(
  logoListo: Awaited<ReturnType<typeof prepararLogo>>,
  imgWidth: number,
  imgHeight: number,
  franjaLegal: Awaited<ReturnType<typeof armarFranjaLegal>>,
  marketingConfig: any,
  imageBuffer: Buffer
): Promise<OverlayOptions[]> {
  try {
    const resizedLogoBuffer = logoListo.png;
    const logoW = logoListo.ancho;
    const logoH = logoListo.alto;

    const margin = Math.round(imgWidth * 0.04); // 4% margin

    // Si hay aviso legal, el logo se apoya arriba de la franja usando su alto REAL.
    const bottomOffset = (franjaLegal?.alto ?? 0) + logoH + margin;

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

    // Antes del logo va el halo, si es que hace falta: se mide el logo contra el pedazo
    // de foto donde cae. Si ya contrasta, esto no agrega nada.
    const contraste = await halodeContraste(imageBuffer, logoListo, { left, top });
    const capas: OverlayOptions[] = [
      ...contraste.capas,
      { input: resizedLogoBuffer, top: Math.round(top), left: Math.round(left) },
    ];

    console.log(`[DEBUG] Logo: ${logoW}x${logoH} (${marketingConfig.logo_size || 'medium'}${logoListo.recorto ? ', se le recorto el vacio' : ''}), ${position} en [${Math.round(left)}, ${Math.round(top)}]`);
    console.log(`[DEBUG] Logo contraste: marca ${logoListo.claridad.toFixed(0)} vs fondo ${contraste.claridadFondo.toFixed(0)} = ${contraste.contraste.toFixed(0)} -> ${contraste.halo ? 'halo ' + contraste.halo : 'sin halo'}`);

    return capas;
  } catch (logoOverlayError) {
    console.error("[ERROR] Sharp composite failed:", logoOverlayError);
    return [];
  }
}

const buildImagePrompt = (payload: GenerateImagePayload, branding?: any, propiedad?: TokkoProperty | null): string => {
  // El tamano ya NO depende de que el modelo lea bien esta linea: va por parametro
  // (imageConfig.aspectRatio) y despues se recorta a la medida exacta con sharp. Esto queda solo
  // como contexto de encuadre, para que componga pensando en vertical o en cuadrado.
  const f = formatoDe(payload.format);
  const dimensiones = `${f.ancho}x${f.alto}, formato ${f.ratio}, para ${f.destino}`;

  let brandingCtx = '';
  if (branding) {
    const colors = branding.brand_colors?.length > 0 
      ? `PALETA DE COLORES DE MARCA: ${branding.brand_colors.join(', ')}. Usar estos colores para elementos gráficos, acentos y armonía visual.` 
      : '';
    
    const logoArea = urlDelLogo(branding, payload.logo_variant)
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

  // El aviso legal NO se le pide al modelo: lo dibuja el codigo despues, con la letra de
  // verdad (ver lib/marketing-ia/aviso-legal.ts). Aca solo se le avisa que deje limpia la
  // franja de abajo para que no meta nada donde va a ir el texto.
  const legalNotice = branding?.legal_notice?.trim()
    ? `
FRANJA INFERIOR RESERVADA:
Dejar la franja inferior de la imagen (aproximadamente el 18% de abajo) limpia y sin texto ni elementos importantes: ahi se sobreimprime despues un aviso legal. La fotografia igual debe llegar hasta el borde.`
    : '';

  const estilos = {
    moderno:     'moderno y minimalista, paleta neutra con acentos cobre, tipografía sans-serif limpia',
    lujoso:      'lujoso y premium, tonos dorados y oscuros, iluminación elegante, acabados de alta gama',
    calido:      'cálido y familiar, colores terrosos, luz natural suave, ambiente acogedor',
    corporativo: 'corporativo y profesional, azules y grises, composición ordenada y confiable',
    vibrante:    'vibrante y colorido, alto contraste, energía positiva, scroll-stopping'
  }[payload.style];

  // La propiedad que busco el servidor manda por sobre la que mando la pantalla en el payload:
  // esa ultima es la que hasta el 16-sep-2026 llegaba vacia (flow_data.tokko_property_details).
  const prop = propiedad ?? payload.tokko_property;
  const propiedadCtx = prop
    ? `
PROPIEDAD A DESTACAR:
- Tipo: ${prop.property_type}
- Dirección: ${prop.address}, ${prop.zone}
- Precio: ${prop.currency} ${prop.price.toLocaleString()}
- Superficie: ${prop.surface_total}m²
- Ambientes: ${prop.rooms} | Baños: ${prop.bathrooms}
- Descripción: ${prop.description?.slice(0, 200)}
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
- NO escribir textos legales, matrículas ni datos de contacto: eso se sobreimprime después.

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
    // Ruling A: se agrega tokko_api_key. Sin esto, una agencia con clave propia caia sola en la
    // clave global (TOKKO_API_KEY) y traia otra propiedad, o ninguna.
    const { data: agency } = await supabaseAdmin
      .from("agencies")
      .select("logo_url, marketing_ai_config, tokko_api_key")
      .eq("id", agencyId)
      .single();

    const marketingConfig = agency?.marketing_ai_config || {};
    const { draft_id, style, format, extra_prompt } = payload;
    const especificacion = formatoDe(format);

    // La propiedad la busca EL SERVIDOR, con la clave de Tokko de la agencia (o la global si no
    // cargo una propia). Sirve para los dos caminos: el de la foto real y, arreglando el bug de
    // paso, tambien el de Gemini (antes usaba payload.tokko_property, que llegaba vacio).
    const propiedad = await traerPropiedad(payload.propiedad_tokko_id, agency?.tokko_api_key ?? null);

    let imageBuffer: Buffer;
    let txId: string | null = null;

    if (!payload.foto_url) {
      // ─── Camino sin foto: como siempre, la imagen la inventa Gemini ──────────────────
      const finalPrompt = buildImagePrompt(payload, marketingConfig, propiedad);

      // Consume AI Credits (returns transaction ID for cost tracking)
      txId = await consumeAiCredits("marketing_ia", 2, `Generate Image: ${payload.format} ${payload.style}`);

      console.log('[DEBUG] Generating image with Gemini for draft:', draft_id);

      try {
        // Generate clean base image with Gemini AI (without prompt imageParts to avoid logo hallucinations)
        imageBuffer = await generateImage(finalPrompt, 'pro', [], {
          aspectRatio: especificacion.ratio,
          // 2K en vez de lo que salga: en gemini-3-pro-image 1K y 2K cuestan lo mismo
          // (utils/aiCostCalculator.ts), y sin pedirlo las placas venian de 768 px de ancho.
          imageSize: '2K',
        });

        // ─── La placa se lleva a la medida exacta ANTES de dibujarle nada encima ─────────
        // El orden importa: el aviso legal y el logo se miden contra el alto de la imagen, asi que
        // recortar despues dejaria el texto legal reescalado y borroso.
        // Y el recorte hace falta aunque el formato se pida por parametro, porque los buckets de
        // Gemini son aproximados: pidiendole 4:5 devuelve 0.8056 y pidiendole 9:16 devuelve 0.5581.
        // Sin esto, Instagram recibe una placa que no es del formato que dice ser y la recorta sola.
        const medidaGemini = await sharp(imageBuffer).metadata();
        imageBuffer = await sharp(imageBuffer)
          .resize(especificacion.ancho, especificacion.alto, { fit: 'cover', position: 'centre' })
          .toBuffer();
        console.log(`[DEBUG] Placa ${format}: Gemini devolvio ${medidaGemini.width}x${medidaGemini.height}, recortada a ${especificacion.ancho}x${especificacion.alto}`);

        // ─── Lo que dibujamos nosotros sobre la imagen de Gemini ────────
        // Primero el aviso legal, despues el logo apoyado arriba de esa franja. Van juntos en una
        // sola pasada de sharp para no recomprimir la imagen dos veces.
        const capas: OverlayOptions[] = [];
        // Ya no hay que adivinar: la placa acaba de quedar exactamente de esta medida.
        const imgWidth = especificacion.ancho;
        const imgHeight = especificacion.alto;

        const franjaLegal = await armarFranjaLegal(marketingConfig.legal_notice || '', imgWidth, imgHeight);
        if (franjaLegal) {
          capas.push({ input: franjaLegal.png, top: franjaLegal.top, left: 0 });
          console.log(`[DEBUG] Aviso legal: ${franjaLegal.renglones} renglones, cuerpo ${franjaLegal.cuerpo}px, franja ${franjaLegal.alto}px (${((franjaLegal.alto / imgHeight) * 100).toFixed(1)}% del alto)`);
          if (franjaLegal.letrasSinDibujo > 0) {
            // Nunca deberia pasar. Si pasa, el aviso legal de la placa NO dice lo que escribio el
            // director, y eso hay que verlo en el log y no descubrirlo en una placa publicada.
            console.error(`[ERROR] Aviso legal: ${franjaLegal.letrasSinDibujo} letras no se pudieron dibujar`);
          }
        }

        // ─── Deterministic Logo Overlay via Sharp ──────────────────────
        // Cual de los dos logos de la agencia (estandar / lujo) lo eligio la persona al generar.
        // Si pidio lujo y la agencia no lo cargo, urlDelLogo devuelve el estandar: la placa nunca
        // se queda sin logo por esta eleccion. Ver lib/marketing-ia/logo-variante.ts.
        const logoUrl = urlDelLogo(marketingConfig, payload.logo_variant) || agency?.logo_url;
        const logoListo = await bajarYPrepararLogo(logoUrl, imgWidth, marketingConfig.logo_size, supabaseAdmin);
        if (logoListo) {
          capas.push(...(await capasDelLogo(logoListo, imgWidth, imgHeight, franjaLegal, marketingConfig, imageBuffer)));
        }

        if (capas.length > 0) {
          imageBuffer = await sharp(imageBuffer).composite(capas).toBuffer();
        }

        // ─── Record image cost ──────────────────────────────────────────
        const promptTokensEst = Math.ceil(finalPrompt.length / 4);
        // Se pide 2K siempre (arriba), asi que se cobra 2K siempre. Antes esto era una suposicion
        // sobre un tamano que nunca se habia pedido. En este modelo 1k y 2k valen igual: no cambia
        // lo que se gasta, cambia que ahora sea cierto.
        const imageRes = '2k';
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
    } else {
      // ─── Camino con foto real: no se llama a Gemini y no se gastan créditos ──────────
      // La foto tiene que llegar bit a bit a la placa: si pasara por el modelo, redibujaría el
      // inmueble y la publicidad mostraría una propiedad que no es la que se vende.
      if (!payload.propiedad_tokko_id) {
        return NextResponse.json(
          { error: "Falta el id de la propiedad para verificar que la foto le pertenece" },
          { status: 400 }
        );
      }

      // Antes de bajar nada, se verifica que la foto sea de VERDAD de esta propiedad y de esta
      // agencia. Esto cierra dos agujeros con una sola consulta: sin el filtro por agency_id, un
      // tenant autenticado podria pasar el tokko_id de una propiedad de OTRA agencia y publicar
      // su foto bajo su propio logo; y sin comparar despues contra la columna `images`, foto_url
      // seria cualquier URL que mando el navegador y el servidor haria fetch() a ciegas (un SSRF,
      // ya que podria apuntar a un recurso interno en vez de a una foto). El mismo filtro por
      // agency_id + tokko_id que ya usa app/api/marketing-ia/fotos-propiedad/route.ts. Con esto,
      // la placa muestra SIEMPRE una foto de la propiedad que se esta vendiendo, que es lo que
      // todo este diseño promete.
      const { data: propRow } = await supabase
        .from("properties")
        .select("images")
        .eq("agency_id", agencyId)
        .eq("tokko_id", payload.propiedad_tokko_id)
        .maybeSingle();

      const fotosDeLaPropiedad: string[] = Array.isArray(propRow?.images)
        ? propRow.images.map((im: any) => (typeof im === "string" ? im : im?.url)).filter(Boolean)
        : [];

      if (!fotosDeLaPropiedad.includes(payload.foto_url)) {
        return NextResponse.json(
          { error: "La foto no pertenece a esta propiedad de tu agencia" },
          { status: 400 }
        );
      }

      const resFoto = await fetch(payload.foto_url);
      if (!resFoto.ok) {
        return NextResponse.json(
          { error: `No se pudo descargar la foto de la propiedad (${resFoto.status})` },
          { status: 502 }
        );
      }
      const fotoBruta = Buffer.from(await resFoto.arrayBuffer());

      // El logo y el aviso legal se miden PRIMERO: el panel no puede invadir su lugar.
      const franjaLegal = await armarFranjaLegal(
        marketingConfig.legal_notice || "",
        especificacion.ancho,
        especificacion.alto
      );
      // Mismo bajado y preparado que el camino de Gemini (bajarYPrepararLogo): antes esto era
      // una copia recortada que solo intentaba HTTP, sin el fallback a Supabase Storage.
      const logoUrl = urlDelLogo(marketingConfig, payload.logo_variant) || agency?.logo_url;
      const logoListo = await bajarYPrepararLogo(
        logoUrl,
        especificacion.ancho,
        marketingConfig.logo_size,
        supabaseAdmin
      );
      const margen = Math.round(especificacion.ancho * 0.04);
      const reservadoAbajo = (franjaLegal?.alto ?? 0) + (logoListo?.alto ?? 0) + margen * 2;

      const placa = await armarPlacaConFoto({
        foto: fotoBruta,
        ancho: especificacion.ancho,
        alto: especificacion.alto,
        reservadoAbajo,
        contenido: contenidoDelPanel(payload.copy_content.hook, propiedad),
        colorAcento: marketingConfig.brand_colors?.[0],
      });
      imageBuffer = placa.imagen;

      console.log(
        `[PLACA] Con foto real: ${especificacion.ancho}x${especificacion.alto}, foto ${placa.altoFoto}px ` +
          `(escala ${placa.escalaFoto}x), titulo ${placa.renglonesTitulo} renglones cuerpo ${placa.cuerpoTitulo}, ` +
          `${placa.datosDibujados} casillas`
      );
      if (placa.letrasSinDibujo > 0) {
        // Nunca deberia pasar: el hook ya sale sin emojis de sellarContenidoPost y aca pasa otra
        // vez por sinEmojis. Si igual llega uno, la placa dice algo distinto de lo que se escribio.
        console.error(`[ERROR] Placa: ${placa.letrasSinDibujo} letras no se pudieron dibujar`);
      }
      if (placa.desborda) {
        // Ver el comentario de `desborda` en lib/marketing-ia/placa-con-foto.ts: ni soltando
        // casillas y bajada, ni achicando el titulo, ni bajando la foto a su piso minimo alcanzo.
        console.error(`[ERROR] Placa: el panel desbordo el hueco reservado (${reservadoAbajo}px)`);
      }
      if (placa.escalaFoto > 1.5) {
        console.warn(`[WARN] Placa: la foto se agrandó ${placa.escalaFoto}x, va a salir poco nítida`);
      }

      // El logo y el aviso legal encima, en el hueco reservado. Mismo `capasDelLogo` que el
      // camino de Gemini: honra `logo_position` (antes esto era siempre bottom-right a mano) y
      // calcula el halo de contraste contra la placa ya armada (antes no lo calculaba, asi que
      // un logo oscuro sobre el panel oscuro (#12161c) podia quedar invisible sin ningun log).
      const capasFoto: OverlayOptions[] = [];
      if (franjaLegal) capasFoto.push({ input: franjaLegal.png, top: franjaLegal.top, left: 0 });
      if (logoListo) {
        capasFoto.push(
          ...(await capasDelLogo(
            logoListo,
            especificacion.ancho,
            especificacion.alto,
            franjaLegal,
            marketingConfig,
            imageBuffer
          ))
        );
      }
      if (capasFoto.length > 0) imageBuffer = await sharp(imageBuffer).composite(capasFoto).toBuffer();
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

    // La medida se MIDE sobre el archivo que se acaba de subir; no se deduce del formato. Hasta
    // el 3-sep-2026 aca se escribia 1080x1920 a mano y la ficha mentia: los archivos reales
    // median 768x1376. Si algun dia el recorte falla, se ve en la base y no en Instagram.
    const medidaFinal = await sharp(imageBuffer).metadata();
    const width = medidaFinal.width ?? especificacion.ancho;
    const height = medidaFinal.height ?? especificacion.alto;

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

