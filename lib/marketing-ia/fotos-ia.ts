/**
 * Motor de retoque de fotos de propiedades.
 *
 * Todo lo de acá está verificado contra fotos reales de la cartera (22 y 24 de
 * agosto de 2026, 29 generaciones). Las decisiones que parecen raras lo son
 * porque la alternativa obvia falla; están comentadas donde corresponde.
 *
 * Las tres reglas que sostienen el resto:
 *   1. Los tres modos se aplican EN SECUENCIA, nunca todos juntos: pedir mucho
 *      de una vez hace que el modelo reinterprete el ambiente en lugar de
 *      editarlo (inventó un arco, cambió el piso y movió las paredes).
 *   2. MEJORAR va primero. El inventario se lee de la foto, y sobre una foto
 *      oscura lee mal (6 elementos en vez de 8, granito confundido con madera).
 *      Mejorar es el único modo que no mueve nada, así que puede ir antes.
 *   3. Nada se entrega sin pasar por el control, y el control no se le muestra
 *      al asesor: si rechaza, se corrige y se regenera solo.
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import sharp from "sharp";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const flash = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });
const imagen = genAI.getGenerativeModel({ model: "gemini-3-pro-image-preview" });

const parteImagen = (b: Buffer) => ({
  inlineData: { data: b.toString("base64"), mimeType: "image/jpeg" },
});
const leerJson = (t: string) => JSON.parse(t.replace(/```json|```/g, "").trim());

/** Saca el "7. " del principio: si vuelve numerado, el modelo lo pinta en la foto. */
const sinNumero = (t: string) => String(t).replace(/^\s*\d+[.)]\s*/, "").trim();

export type Peso = "grave" | "menor";
export type Elemento = { que: string; peso: Peso };
export type Relevamiento = {
  geometria: string;
  piso: string;
  defectos?: string[];
  inventario: Elemento[];
  muebles_existentes: string[];
};
export type Veredicto = {
  faltantes_graves?: string[];
  faltantes_menores?: string[];
  tapados?: string[];
  inventados?: string[];
  marcas_dibujadas?: string[];
  piso_alterado?: string[];
  defectos_disimulados?: string[];
  veredicto: "aprobado" | "rechazado";
};

// ─────────────────────────────────────────────────────────────────────
// 1 · Relevar: qué tiene el ambiente, antes de tocarlo
// ─────────────────────────────────────────────────────────────────────
const PROMPT_RELEVAR = `Sos un relevador de obra. Mirá esta foto de un ambiente y devolvé SOLO JSON, sin markdown:
{
 "geometria": "cada pared de izq a der con su ancho aparente en % del ancho de la foto; cada abertura con dónde empieza y termina y su alto; altura del techo respecto del ancho",
 "piso": "material exacto, forma y tamaño aparente de la pieza, dirección de las juntas, color y veteado",
 "defectos": ["manchas, humedades, grietas, descascarados, baldosas rotas, desgastes y marcas de uso visibles, con dónde están"],
 "inventario": [{"que":"descripción literal del elemento y dónde está","peso":"grave|menor"}],
 "muebles_existentes": ["muebles sueltos y objetos del dueño que hoy están en la foto; vacío si no hay"]
}

En "piso" sé muy concreto: no alcanza con "cerámico gris". Decí si son baldosas cuadradas o rectangulares, de qué tamaño aparente, si las juntas van paralelas a las paredes o en diagonal, y de qué color y veteado es (granito con puntos oscuros, símil madera, calcáreo, porcelanato liso, etc).

En "inventario" incluí SIN EXCEPCIÓN: ventanas y sus rejas, puertas y aberturas, bocas de luz y artefactos de iluminación (aclarando si la boca está PELADA sin artefacto), llaves de luz, tomas, zócalos (con su material), estufas y calefactores, aires acondicionados, rejillas, cortineros o rieles, columnas, vigas, nichos, escalones, revestimientos, cámaras, muebles bajo mesada y alacenas si es una cocina, sanitarios si es un baño.

"peso" es "grave" para lo que cambia lo que el comprador cree que compra: ventanas, puertas, aberturas, estufas, aires, artefactos de iluminación, muebles fijos de cocina, sanitarios, revestimientos, columnas.
"peso" es "menor" para lo chico que un mueble podría tapar: llaves, tomas, zócalos, rejillas.

En "defectos" anotá lo que está roto o gastado tal como se ve, sin suavizarlo. No es para arreglarlo: es para que después se pueda comprobar que sigue ahí.

Sé literal: si hay una boca de luz sin lámpara, escribí "boca de luz PELADA sin artefacto". No la llames lámpara. Nunca uses valores de ejemplo: describí lo que ves en ESTA foto.`;

export async function relevar(foto: Buffer): Promise<Relevamiento> {
  const r = await flash.generateContent({
    contents: [{ role: "user", parts: [{ text: PROMPT_RELEVAR }, parteImagen(foto)] }],
  });
  return leerJson(r.response.text());
}

// ─────────────────────────────────────────────────────────────────────
// 2 · Las reglas, armadas a partir de lo relevado
// ─────────────────────────────────────────────────────────────────────
export function reglas(rel: Relevamiento): string {
  const inventario = rel.inventario.map((e, i) => `  ${i + 1}. [${e.peso}] ${e.que}`).join("\n");
  return `
════ RELEVAMIENTO DEL AMBIENTE — respetalo al pie de la letra ════
GEOMETRÍA: ${rel.geometria}
PISO: ${rel.piso}

INVENTARIO DE ELEMENTOS DEL INMUEBLE (${rel.inventario.length}):
${inventario}
══════════════════════════════════════════════════════════════════

REGLA CERO — EL INVENTARIO ES OBLIGATORIO Y CERRADO:
A. Los ${rel.inventario.length} elementos de arriba TIENEN que aparecer en el resultado, en la misma posición, del mismo tamaño y con el mismo aspecto. No omitas ninguno. Los marcados [grave] no pueden quedar tapados por un mueble.
B. Si un elemento está descripto como PELADO o sin artefacto, dejalo así. NO le agregues una lámpara, ni un artefacto, ni lo "mejores".
C. NO agregues ningún elemento del inmueble que no esté en la lista: ni lámpara colgante, ni aplique, ni spot, ni ventana, ni puerta, ni nicho, ni viga, ni molduras, ni artefactos de cocina o baño.
D. Lo único que podés sumar son los MUEBLES SUELTOS que se piden.

REGLA DEL PISO Y LAS SUPERFICIES — ES LO QUE MÁS DELATA UNA FOTO FALSA:
E. El piso queda EXACTAMENTE como el relevamiento lo describe: mismo material, misma forma y mismo tamaño de pieza, misma dirección de juntas, mismo color y mismo veteado. No lo cambies por otro más lindo, no lo pulas, no lo emparejes, no le cambies el tono.
F. Las líneas de junta del piso son las líneas de fuga del ambiente: no las corras ni las reorientes. Sea cual sea el material que dice el relevamiento, en el resultado sigue siendo ese mismo material.
G. Lo mismo vale para paredes, techos, revestimientos, aberturas y carpinterías: quedan con la textura, el color y la terminación que tienen hoy.

REGLA DE LOS DEFECTOS — LA PROPIEDAD SE MUESTRA COMO ES:
H. Las manchas, humedades, grietas, descascarados, desgastes, baldosas rotas o saltadas, diferencias de tono y marcas de uso son parte de la propiedad real. TIENEN que quedar donde están, tal como están.
I. NO los arregles, no los tapes, no los disimules y no los pintes por tu cuenta. Que la foto quede prolija NUNCA justifica hacer desaparecer un defecto.
J. Un defecto se corrige SOLO si te lo piden explícitamente en el pedido de más arriba, y solo ese.

REGLA DE SALIDA — LA FOTO SALE LIMPIA:
K. NUNCA escribas ni dibujes sobre la imagen: ni números, ni etiquetas, ni nombres de elementos, ni flechas, ni recuadros, ni leyendas, ni marcas de agua, ni logos. Las listas y numeraciones de este pedido son SOLO para que sepas qué respetar: no se dibujan.
L. El resultado es UNA FOTOGRAFÍA LIMPIA del ambiente, como la sacaría un fotógrafo. Nada más.

REGLAS DE GEOMETRÍA:
1. NO alargues, acortes ni corras ninguna pared. El ancho aparente de cada una queda igual.
2. Las aberturas quedan COMPLETAMENTE LIBRES Y VISIBLES, del mismo ancho y alto. Ningún mueble las tapa ni se apoya delante.
3. Las ventanas conservan posición, ancho, alto y rejas.
4. No cambies la altura del techo ni la línea donde el techo encuentra las paredes.
5. Mismo encuadre, misma perspectiva y misma distancia de cámara.

REGLAS DE ESCALA:
6. Ningún mueble puede ser más ancho que la pared contra la que se apoya. Si no entra, poné uno más chico.
7. Los muebles se apoyan en el piso respetando las líneas de fuga y proyectan sombra coherente con la luz real.
8. Dejá circulación libre entre las aberturas.
9. Poné POCOS muebles. Mejor que sobre espacio a que se vea apretado.
10. Ante la duda entre que quede lindo y que quede fiel: gana fiel.`;
}

// ─────────────────────────────────────────────────────────────────────
// 3 · Generar. Sin imageConfig vuelve en 1365x768, más chica que la original.
// ─────────────────────────────────────────────────────────────────────
export async function generar(pedido: string, rel: Relevamiento, foto: Buffer): Promise<Buffer> {
  const r = await imagen.generateContent({
    contents: [{ role: "user", parts: [{ text: `${pedido}\n${reglas(rel)}` }, parteImagen(foto)] }],
    generationConfig: {
      // @ts-ignore — modalidades e imageConfig del modelo de imagen 2026
      responseModalities: ["IMAGE"],
      imageConfig: { imageSize: "2K" },
    },
  });
  const parte = r.response.candidates?.[0]?.content?.parts?.find((p: any) =>
    p.inlineData?.mimeType?.startsWith("image/")
  );
  if (!parte?.inlineData) throw new Error("La IA no devolvió una imagen");
  return Buffer.from(parte.inlineData.data, "base64");
}

// ─────────────────────────────────────────────────────────────────────
// 4 · Controlar. Distingue "tapado por un mueble" de "borrado".
// ─────────────────────────────────────────────────────────────────────
export async function controlar(
  rel: Relevamiento,
  antes: Buffer,
  despues: Buffer
): Promise<Veredicto> {
  const lista = rel.inventario.map((e, i) => `${i + 1}. [${e.peso}] ${e.que}`).join("\n");
  const texto = `Te doy DOS fotos del mismo ambiente. La primera es el ORIGINAL. La segunda es el mismo ambiente después de que una IA lo editara.

Control de calidad. Para cada elemento clasificá su estado en la segunda foto:
${lista}

Estados posibles:
- "presente": se ve, en el mismo lugar y con el mismo aspecto
- "tapado": no se ve porque un mueble nuevo lo cubre, pero nada indica que lo hayan borrado. Esto NO es un error para los [menor].
- "faltante": debería verse y no está, o cambió de lugar, tamaño o aspecto

Revisá TAMBIÉN estas tres cosas:
a) Si la IA AGREGÓ algún elemento del INMUEBLE que no estaba (lámparas colgantes, apliques, spots, ventanas, puertas, vigas, molduras, alacenas, sanitarios). Los muebles sueltos, alfombras, cuadros, plantas y cortinas NO cuentan como agregados.
b) Si la foto tiene números, etiquetas, nombres de elementos, flechas, recuadros, leyendas o marcas de agua dibujados encima. Es un defecto grave.
c) EL PISO Y LAS SUPERFICIES. En la primera foto el piso es: ${rel.piso}. ¿Sigue siendo el mismo material, la misma forma y tamaño de pieza, la misma dirección de juntas y el mismo color y veteado? ¿Y las paredes, techos y revestimientos conservan su textura y terminación? Si cambió cualquiera de esas cosas, es un defecto grave.
d) LOS DEFECTOS DE LA PROPIEDAD. En la primera foto se ven estos: ${rel.defectos?.length ? rel.defectos.join("; ") : "(no se relevó ninguno)"}. La propiedad se muestra como es: si alguno fue arreglado, tapado, pintado o disimulado sin que se lo pidieran, anotalo. Que la segunda foto se vea más prolija NO es una mejora: es un defecto grave.

Devolvé SOLO JSON, sin markdown:
{"faltantes_graves":[],"faltantes_menores":[],"tapados":[],"inventados":[],"marcas_dibujadas":[],"piso_alterado":[],"defectos_disimulados":[],"veredicto":"aprobado|rechazado"}

El veredicto es "rechazado" si hay algo en faltantes_graves, en inventados, en marcas_dibujadas, en piso_alterado o en defectos_disimulados.
Un [menor] tapado por un mueble no rechaza nada.`;

  const r = await flash.generateContent({
    contents: [{ role: "user", parts: [{ text: texto }, parteImagen(antes), parteImagen(despues)] }],
  });
  return leerJson(r.response.text());
}

const defectos = (v: Veredicto) =>
  (v.faltantes_graves?.length || 0) +
  (v.inventados?.length || 0) +
  (v.marcas_dibujadas?.length || 0) +
  (v.piso_alterado?.length || 0) +
  (v.defectos_disimulados?.length || 0);

/** El texto que se le devuelve al modelo cuando el control rechaza. Sin numerar. */
function correccion(v: Veredicto): string {
  const l: string[] = [];
  if (v.marcas_dibujadas?.length)
    l.push("- DIBUJASTE texto o marcas sobre la foto. La foto sale LIMPIA: sin números, etiquetas, flechas ni leyendas de ningún tipo.");
  if (v.piso_alterado?.length)
    l.push("- CAMBIASTE el piso o las superficies y no se tocan: " + v.piso_alterado.map(sinNumero).join("; "));
  if (v.defectos_disimulados?.length)
    l.push("- TAPASTE defectos de la propiedad sin que te lo pidieran. Tienen que verse igual que en la foto original: " + v.defectos_disimulados.map(sinNumero).join("; "));
  if (v.inventados?.length)
    l.push("- AGREGASTE estos elementos y NO existen en la foto original. No los pongas de nuevo: " + v.inventados.map(sinNumero).join("; "));
  if (v.faltantes_graves?.length)
    l.push("- BORRASTE o corriste estos elementos y TIENEN que estar, iguales y en su lugar: " + v.faltantes_graves.map(sinNumero).join("; "));
  if (!l.length) return "";
  return [
    "",
    "",
    "════ CORRECCIÓN — el intento anterior fue rechazado por el control ════",
    l.join("\n"),
    "Corregí exactamente eso. El resto del pedido no cambia.",
    "═══════════════════════════════════════════════════════════════════════",
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────────────
// 5 · Generar hasta que salga bien. El asesor nunca ve un rechazo.
// ─────────────────────────────────────────────────────────────────────
export type Resultado = {
  foto: Buffer;
  veredicto: Veredicto;
  intentos: number;
  aprobado: boolean;
  generaciones: number;
};

export async function generarOptimo(opciones: {
  pedido: string;
  foto: Buffer;
  rel: Relevamiento;
  referencia?: Buffer;
  maxIntentos?: number;
}): Promise<Resultado> {
  const { pedido, foto, rel, referencia = foto, maxIntentos = 3 } = opciones;
  let mejor: { foto: Buffer; v: Veredicto; def: number } | null = null;
  let extra = "";
  let generaciones = 0;

  for (let i = 1; i <= maxIntentos; i++) {
    const salida = await generar(pedido + extra, rel, foto);
    generaciones++;
    const v = await controlar(rel, referencia, salida);
    const def = defectos(v);
    if (!mejor || def < mejor.def) mejor = { foto: salida, v, def };
    if (v.veredicto === "aprobado")
      return { foto: salida, veredicto: v, intentos: i, aprobado: true, generaciones };
    extra = correccion(v);
  }
  // Ninguno aprobado: se entrega el que menos defectos tuvo. Nunca un error.
  return {
    foto: mejor!.foto,
    veredicto: mejor!.v,
    intentos: maxIntentos,
    aprobado: false,
    generaciones,
  };
}

// ─────────────────────────────────────────────────────────────────────
// 6 · Los tres modos
// ─────────────────────────────────────────────────────────────────────
export const ESTILOS = {
  moderno: "Estilo moderno y sobrio, paleta neutra.",
  calido: "Estilo cálido y familiar, con maderas y textiles en tonos tierra.",
  nordico: "Estilo nórdico: maderas claras, blancos, texturas suaves y alguna planta.",
  clasico: "Estilo clásico y elegante, muebles de líneas tradicionales y tonos apagados.",
} as const;
export type EstiloId = keyof typeof ESTILOS;

export const PEDIDOS = {
  mejorar:
    "Corregí la luz y el color: el ambiente tiene que verse luminoso y natural, con blancos limpios y sin dominante amarillenta, y con detalle recuperado en las zonas oscuras. Si es una foto exterior con el cielo blanco o cerrado, pasala a un día soleado con cielo celeste y luz cálida coherente en toda la escena. Que quede natural, no sobreexpuesto ni con aspecto de HDR forzado. NO muevas, agregues ni saques absolutamente nada: solo la luz y el color.",
  limpiar:
    "Sacá los objetos sueltos y personales que hay en el ambiente: adornos, cuadros, portarretratos, electrodomésticos viejos, flores artificiales, manteles, carpetas, ropa, juguetes, cables a la vista y los muebles del dueño. El ambiente queda despejado y las paredes limpias.",
  ambientar: (estilo: string) =>
    `Amoblalo de forma fotorrealista, como una foto de inmobiliaria. ${estilo} Poné POCOS muebles: mejor que sobre espacio a que se vea apretado.`,
} as const;

export type Modo = "mejorar" | "limpiar" | "ambientar";

/** El orden validado. Mejorar primero porque el inventario se lee de la foto. */
export const ORDEN: Modo[] = ["mejorar", "limpiar", "ambientar"];
