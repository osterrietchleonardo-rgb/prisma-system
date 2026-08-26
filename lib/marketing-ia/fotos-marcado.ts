/**
 * Marcado sobre la foto: retocar zonas puntuales y proteger lo que no se toca.
 *
 * Dos cosas verificadas que no son obvias:
 *
 * 1. Se manda UNA sola imagen, la marcada. Mandarle la original junto con la
 *    marcada, explicando cuál es cuál, es lo que uno haría — y falla: el modelo
 *    no edita nada y encima mueve el resto.
 *
 * 2. Las marcas van por COLOR, nunca numeradas. El modelo copia a la imagen
 *    cualquier texto que ve dibujado: cuando se le pasó el inventario numerado,
 *    pintó los números sobre la foto.
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import sharp from "sharp";
import { controlar, type Relevamiento, type Veredicto } from "./fotos-ia";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const flash = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });
const imagen = genAI.getGenerativeModel({ model: "gemini-3-pro-image-preview" });

const parteImagen = (b: Buffer) => ({
  inlineData: { data: b.toString("base64"), mimeType: "image/jpeg" },
});
const leerJson = (t: string) => JSON.parse(t.replace(/```json|```/g, "").trim());
const sinNumero = (t: string) => String(t).replace(/^\s*\d+[.)]\s*/, "").trim();

export type Zona = { left: number; top: number; width: number; height: number };
export type Cambio = { zona: Zona; pedido: string };

export const PALETA = [
  { nombre: "ROJA", hex: "#FF0000", relleno: "rgba(255,0,0,0.26)" },
  { nombre: "AZUL", hex: "#0066FF", relleno: "rgba(0,102,255,0.26)" },
  { nombre: "VERDE", hex: "#00C000", relleno: "rgba(0,192,0,0.26)" },
  { nombre: "AMARILLA", hex: "#FFD000", relleno: "rgba(255,208,0,0.26)" },
  { nombre: "VIOLETA", hex: "#A000E0", relleno: "rgba(160,0,224,0.26)" },
] as const;

/** Dibuja un óvalo de color por cada zona. El color es la etiqueta. */
export async function marcar(foto: Buffer, zonas: Zona[]): Promise<Buffer> {
  if (!zonas.length) return foto;
  const { width: W, height: H } = await sharp(foto).metadata();
  const formas = zonas
    .map((z, i) => {
      const p = PALETA[i % PALETA.length];
      return `<ellipse cx="${z.left + z.width / 2}" cy="${z.top + z.height / 2}" rx="${z.width / 2}" ry="${z.height / 2}" fill="${p.relleno}" stroke="${p.hex}" stroke-width="7"/>`;
    })
    .join("");
  return sharp(foto)
    .composite([{ input: Buffer.from(`<svg width="${W}" height="${H}">${formas}</svg>`) }])
    .jpeg({ quality: 95 })
    .toBuffer();
}

// ─────────────────────────────────────────────────────────────────────
// Re-versión: varios cambios de una vez sobre una foto ya generada
// ─────────────────────────────────────────────────────────────────────
function prompt(cambios: Cambio[], suelto: string, inventario: string, extra: string) {
  const lista = cambios
    .map((c, i) => `- ZONA ${PALETA[i % PALETA.length].nombre}: ${c.pedido}`)
    .join("\n");
  return `Esta foto ya está bien y solo hay que RETOCARLA. Te la doy con algunas zonas señaladas con óvalos de colores.

LO PRIMERO Y MÁS IMPORTANTE: los óvalos de colores NO son parte de la foto. Son una señal para vos, como un dedo que apunta. En el resultado NO puede quedar ni un rastro: ni el contorno, ni el relleno, ni un halo de color. Si en el resultado se ve un óvalo, la foto no sirve.

CAMBIOS PEDIDOS:
${lista}${suelto ? `\n- EN TODA LA FOTO: ${suelto}` : ""}

REGLAS:
1. Hacé ESOS cambios y nada más. Todo lo que no está señalado queda EXACTAMENTE igual: mismos muebles, misma posición, misma luz, mismo encuadre.
2. Si te piden SACAR algo, sacá SOLO esa cosa. Lo que estaba detrás o al lado tiene que quedar A LA VISTA, no borrado: si detrás de una planta hay una estufa, al sacar la planta la estufa se ve.
3. NUNCA escribas ni dibujes texto, números, etiquetas, flechas, recuadros ni leyendas sobre la imagen. El resultado es una fotografía limpia.
4. El PISO y las SUPERFICIES no se tocan: mismo material, misma forma y tamaño de pieza, misma dirección de juntas, mismo color y veteado; y paredes, techos y revestimientos con su textura y terminación de hoy.
4b. Las manchas, humedades, grietas, descascarados y baldosas rotas son parte de la propiedad real: quedan tal cual. Solo se arregla el defecto que te pidan explícitamente arriba, y solo ese.
5. Lo que agregues o cambies se apoya en el piso o se cuelga de la pared con la perspectiva correcta, y proyecta sombra coherente con la luz que ya hay.
${inventario}${extra}`;
}

function correccion(v: Veredicto): string {
  const l: string[] = [];
  if (v.marcas_dibujadas?.length)
    l.push("- DEJASTE los óvalos de color dibujados en la foto. Tienen que desaparecer por completo: son una señal, no parte de la imagen.");
  if (v.piso_alterado?.length)
    l.push("- CAMBIASTE el piso o las superficies y no se tocan: " + v.piso_alterado.map(sinNumero).join("; "));
  if (v.defectos_disimulados?.length)
    l.push("- TAPASTE defectos de la propiedad sin que te lo pidieran: " + v.defectos_disimulados.map(sinNumero).join("; "));
  if (v.faltantes_graves?.length)
    l.push("- BORRASTE estos elementos del inmueble y TIENEN que estar, iguales y en su lugar: " + v.faltantes_graves.map(sinNumero).join("; "));
  if (v.inventados?.length)
    l.push("- AGREGASTE estos elementos del inmueble y no existen: " + v.inventados.map(sinNumero).join("; "));
  if (!l.length) return "";
  return [
    "",
    "",
    "════ CORRECCIÓN — el intento anterior fue rechazado ════",
    l.join("\n"),
    "Corregí exactamente eso. Los cambios pedidos arriba siguen valiendo igual.",
    "════════════════════════════════════════════════════════",
  ].join("\n");
}

export async function reversionar(opciones: {
  foto: Buffer;
  cambios: Cambio[];
  pedidoSuelto?: string;
  rel: Relevamiento;
  referencia: Buffer;
  maxIntentos?: number;
}) {
  const { foto, cambios: crudos, pedidoSuelto = "", rel, referencia, maxIntentos = 3 } = opciones;
  const marcada = await marcar(foto, crudos.map((c) => c.zona));

  // Lo que escribió el asesor se completa antes de llegar al modelo de imagen.
  // Puede haber escrito dos palabras o nada: el resultado tiene que ser el mismo.
  const traducido = await interpretarPedidos({
    marcada,
    crudos: crudos.map((c) => c.pedido),
    sueltoCrudo: pedidoSuelto,
    piso: rel.piso,
  });
  const cambios: Cambio[] = crudos.map((c, i) => ({ ...c, pedido: traducido.zonas[i] }));
  const suelto = traducido.suelto;
  const inventario =
    "\n6. La arquitectura NO se toca. Estos elementos del inmueble tienen que seguir iguales y en su lugar:\n" +
    rel.inventario.map((e) => `   - ${e.que}`).join("\n") +
    `\n   - El piso: ${rel.piso}`;

  let mejor: { foto: Buffer; v: Veredicto; def: number } | null = null;
  let extra = "";
  let generaciones = 0;

  for (let i = 1; i <= maxIntentos; i++) {
    const r = await imagen.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt(cambios, suelto, inventario, extra) }, parteImagen(marcada)],
        },
      ],
      generationConfig: {
        // @ts-ignore
        responseModalities: ["IMAGE"],
        imageConfig: { imageSize: "2K" },
      },
    });
    generaciones++;
    const parte = r.response.candidates?.[0]?.content?.parts?.find((p: any) =>
      p.inlineData?.mimeType?.startsWith("image/")
    );
    if (!parte?.inlineData) throw new Error("La IA no devolvió una imagen");
    const salida = Buffer.from(parte.inlineData.data, "base64");

    const v = await controlar(rel, referencia, salida);
    const def =
      (v.faltantes_graves?.length || 0) +
      (v.inventados?.length || 0) +
      (v.marcas_dibujadas?.length || 0) +
      (v.piso_alterado?.length || 0) +
      (v.defectos_disimulados?.length || 0);
    if (!mejor || def < mejor.def) mejor = { foto: salida, v, def };
    if (v.veredicto === "aprobado")
      return { foto: salida, veredicto: v, intentos: i, aprobado: true, generaciones, marcada, interpretado: traducido };
    extra = correccion(v);
  }
  return {
    foto: mejor!.foto,
    veredicto: mejor!.v,
    intentos: maxIntentos,
    aprobado: false,
    generaciones,
    marcada,
    interpretado: traducido,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Textos: encontrarlos solos y devolverlos intactos al final
// ─────────────────────────────────────────────────────────────────────
export type TextoDetectado = { que: string; caja: number[]; importa: "alta" | "media" | "baja" };

export async function detectarTextos(foto: Buffer): Promise<TextoDetectado[]> {
  const texto = `Encontrá en esta foto TODO lo que tenga texto, números o símbolos legibles y que un comprador podría necesitar leer o verificar: carteles de venta o alquiler, números de casa, chapas de calle, nombres de comercios, patentes, marcas de artefactos, precios, teléfonos.

Para cada uno devolvé la caja AJUSTADA AL PANEL O A LA CHAPA, sin pasto, cielo ni pared de sobra alrededor.

Devolvé SOLO JSON, sin markdown:
{"textos":[{"que":"qué dice o de qué es","caja":[ymin,xmin,ymax,xmax],"importa":"alta|media|baja"}]}
Las cajas van normalizadas de 0 a 1000. "importa" es alta si el dato es verificable y comprometido (teléfonos, números de casa, precios).
Si no hay ningún texto legible, devolvé {"textos":[]}.`;
  try {
    const r = await flash.generateContent({
      contents: [{ role: "user", parts: [{ text: texto }, parteImagen(foto)] }],
    });
    return leerJson(r.response.text()).textos || [];
  } catch {
    return []; // que no se caiga la edición por no poder leer los carteles
  }
}

/**
 * Vuelve a pegar las zonas protegidas desde la foto original.
 * La zona va AJUSTADA al objeto: con fondo adentro se nota el recuadro.
 */
export async function protegerZonas(opciones: {
  original: Buffer;
  editada: Buffer;
  zonas: Zona[];
  pad?: number;
}): Promise<Buffer> {
  const { original, editada, zonas, pad = 5 } = opciones;
  if (!zonas.length) return editada;

  const meta = await sharp(original).metadata();
  const W = meta.width!;
  const H = meta.height!;
  const base = await sharp(original).resize(W, H, { fit: "fill" }).toBuffer();
  let salida = await sharp(editada).resize(W, H, { fit: "fill" }).toBuffer();

  for (const P of zonas) {
    const Z = {
      left: Math.max(0, P.left - pad),
      top: Math.max(0, P.top - pad),
      width: P.width + pad * 2,
      height: P.height + pad * 2,
    };
    if (Z.width < 10 || Z.height < 10) continue;
    if (Z.left + Z.width > W || Z.top + Z.height > H) continue;

    let parche = await sharp(base).extract(Z).toBuffer();
    // igualar brillo y color al entorno ya editado, si no el parche se nota
    const medias = async (b: Buffer) => (await sharp(b).stats()).channels.map((c) => c.mean);
    const a = await medias(parche);
    const b = await medias(await sharp(salida).extract(Z).toBuffer());
    parche = await sharp(parche)
      .linear(b.map((v, i) => v / (a[i] || 1)), [0, 0, 0])
      .toBuffer();

    const mascara = await sharp(
      Buffer.from(
        `<svg width="${Z.width}" height="${Z.height}"><rect x="${pad}" y="${pad}" width="${P.width}" height="${P.height}" rx="4" fill="#fff"/></svg>`
      )
    )
      .blur(Math.max(1, pad / 2.5))
      .greyscale()
      .raw()
      .toBuffer();

    const conAlpha = await sharp(parche)
      .ensureAlpha()
      .joinChannel(mascara, { raw: { width: Z.width, height: Z.height, channels: 1 } })
      .png()
      .toBuffer();

    salida = await sharp(salida)
      .composite([{ input: conAlpha, left: Z.left, top: Z.top }])
      .toBuffer();
  }
  return sharp(salida).jpeg({ quality: 94 }).toBuffer();
}

export const cajaAPixeles = (c: number[], W: number, H: number): Zona => ({
  left: Math.max(0, Math.round((c[1] / 1000) * W)),
  top: Math.max(0, Math.round((c[0] / 1000) * H)),
  width: Math.round(((c[3] - c[1]) / 1000) * W),
  height: Math.round(((c[2] - c[0]) / 1000) * H),
});

// ─────────────────────────────────────────────────────────────────────
// Traductor: lo que escribe el asesor -> un pedido completo
//
// El asesor no tiene por qué explicar bien. Puede escribir "el perchero",
// "sacar", "esto molesta" — o nada. Antes de llegar al modelo de imagen, un
// modelo barato mira la foto marcada, entiende qué hay en cada zona y arma la
// instrucción completa, con lo que hay que reconstruir detrás incluido.
// Así un pedido de dos palabras rinde igual que uno bien redactado.
// ─────────────────────────────────────────────────────────────────────
export async function interpretarPedidos(opciones: {
  marcada: Buffer;
  crudos: string[];
  sueltoCrudo?: string;
  piso?: string;
}): Promise<{ zonas: string[]; suelto: string }> {
  const { marcada, crudos, sueltoCrudo = "", piso = "" } = opciones;
  const listado = crudos
    .map((t, i) => `- ZONA ${PALETA[i % PALETA.length].nombre}: "${t.trim() || "(no escribió nada)"}"`)
    .join("\n");

  const texto = `En esta foto hay zonas señaladas con óvalos de colores. Un asesor inmobiliario escribió, para cada una, qué quiere hacer ahí. Escribe apurado y corto: tu trabajo es convertir eso en una instrucción completa y sin ambigüedad para un editor de imágenes.

Lo que escribió:
${listado}${sueltoCrudo ? `\n- PARA TODA LA FOTO: "${sueltoCrudo.trim()}"` : ""}

Reglas para redactar cada instrucción:
1. Mirá qué hay realmente dentro de cada óvalo y nombralo con precisión, aunque el asesor lo haya nombrado mal o no lo haya nombrado.
2. Si no escribió nada, o solo dice "sacar", "esto", "molesta" o algo igual de vago: asumí que quiere SACAR lo que está dentro del óvalo.
3. Cuando se saca algo, agregá siempre qué hay que reconstruir detrás: la pared, el zócalo, el piso, el mueble o lo que corresponda según lo que se ve alrededor.${piso ? ` El piso de este ambiente es: ${piso}.` : ""}
4. Cuando se agrega o se cambia algo, aclará que tiene que apoyarse con la perspectiva correcta y proyectar sombra coherente con la luz que ya hay.
5. Nunca inventes pedidos que el asesor no hizo. Si dice "sacá la planta", no agregues nada en su lugar.
5b. Si dentro del óvalo hay una mancha, humedad, grieta o rotura y el asesor NO pidió arreglarla, no la incluyas en la instrucción: la propiedad se muestra como es.
6. Escribí en español rioplatense, en una sola oración por zona, directa y concreta.

Devolvé SOLO JSON, sin markdown:
{"zonas":["instrucción para la zona ${PALETA[0].nombre.toLowerCase()}", "..."], "suelto":"instrucción para toda la foto, o cadena vacía"}
El array "zonas" tiene que tener exactamente ${crudos.length} elementos, en el mismo orden.`;

  try {
    const r = await flash.generateContent({
      contents: [{ role: "user", parts: [{ text: texto }, parteImagen(marcada)] }],
    });
    const out = leerJson(r.response.text());
    const zonas: string[] = Array.isArray(out.zonas) ? out.zonas : [];
    return {
      // si el traductor devuelve de menos, se cae al texto original
      zonas: crudos.map((c, i) => (zonas[i] || "").trim() || c.trim() || "sacá lo que está dentro de la zona marcada y reconstruí lo que queda detrás"),
      suelto: (out.suelto || "").trim() || sueltoCrudo.trim(),
    };
  } catch {
    return {
      zonas: crudos.map((c) => c.trim() || "sacá lo que está dentro de la zona marcada y reconstruí lo que queda detrás"),
      suelto: sueltoCrudo,
    };
  }
}
