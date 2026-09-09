// ─────────────────────────────────────────────────────────────────────────────
// Documentos para clientes · qué imagen sirve de header o footer, y la guía al director.
// Las medidas se leen del archivo con sharp, nunca del nombre ni del tipo declarado: el
// navegador dice "image/png" de lo que sea que tenga esa extensión.
// ─────────────────────────────────────────────────────────────────────────────
import sharp from "sharp";

export const MAX_IMAGEN = 2 * 1024 * 1024;
export const ANCHO_MINIMO = 1600;

export const GUIA_IMAGEN =
  "Cómo tiene que ser la imagen: una franja apaisada de ancho completo, PNG o JPG, de al menos " +
  `${ANCHO_MINIMO} px de ancho y hasta 2 MB. Los logos, el teléfono, la web y la dirección de la ` +
  "inmobiliaria van adentro de la imagen, como vos los diseñes. Lo que NO tiene que tener: los datos " +
  "del asesor. Nombre, categoría, mail y celular los pone PRISMA por cada persona, con lo que escribas " +
  "en «Bloque del asesor». Si los dibujás en la imagen, salen fijos con los datos de uno solo.";

type Resultado =
  | { ok: true; ext: "png" | "jpg"; ancho: number; alto: number }
  | { ok: false; motivo: string };

export async function validarImagen(buffer: Buffer, mime: string): Promise<Resultado> {
  if (buffer.length > MAX_IMAGEN) {
    return { ok: false, motivo: "La imagen pasa los 2 MB. Exportala un poco más liviana." };
  }

  let meta: sharp.Metadata;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    return { ok: false, motivo: "No se pudo leer el archivo como imagen. Tiene que ser PNG o JPG." };
  }

  const ext = meta.format === "png" ? "png" : meta.format === "jpeg" ? "jpg" : null;
  if (!ext) {
    return { ok: false, motivo: `Tiene que ser PNG o JPG (este es ${meta.format ?? mime ?? "otro formato"}).` };
  }

  const ancho = meta.width ?? 0;
  const alto = meta.height ?? 0;
  if (ancho < ANCHO_MINIMO) {
    return {
      ok: false,
      motivo: `La imagen tiene ${ancho} px de ancho y necesita al menos ${ANCHO_MINIMO}: en la hoja saldría borrosa.`,
    };
  }

  return { ok: true, ext, ancho, alto };
}
