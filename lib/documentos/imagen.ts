// ─────────────────────────────────────────────────────────────────────────────
// Documentos para clientes · qué imagen sirve de header o footer, y la guía al director.
// Las medidas se leen del archivo con sharp, nunca del nombre ni del tipo declarado: el
// navegador dice "image/png" de lo que sea que tenga esa extensión.
// SOLO SERVIDOR (sharp). Las reglas y la guía están en ./imagen-reglas.ts, que sí va al navegador.
// ─────────────────────────────────────────────────────────────────────────────
import sharp, { type Metadata } from "sharp";

import { MAX_IMAGEN, ANCHO_MINIMO, GUIA_IMAGEN } from "./imagen-reglas";
export { MAX_IMAGEN, ANCHO_MINIMO, GUIA_IMAGEN };

type Resultado =
  | { ok: true; ext: "png" | "jpg"; ancho: number; alto: number }
  | { ok: false; motivo: string };

export async function validarImagen(buffer: Buffer, mime: string): Promise<Resultado> {
  if (buffer.length > MAX_IMAGEN) {
    return { ok: false, motivo: "La imagen pasa los 2 MB. Exportala un poco más liviana." };
  }

  let meta: Metadata;
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
