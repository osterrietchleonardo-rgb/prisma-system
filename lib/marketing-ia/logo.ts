// Marketing IA · El logo de la agencia sobre la placa.
//
// POR QUE EXISTE: el 3-sep-2026 el cliente aviso que su logo salia "muy chiquito y clarito, casi
// ni se ve". Medido sobre su archivo y sus placas reales, eran dos cosas distintas sumadas:
//
//   1. CHIQUITO. Su PNG es un lienzo de 500x500 donde la marca ocupa 411x135: el 73% del alto es
//      transparente. El codigo agrandaba el lienzo ENTERO al 16% del ancho de la placa, asi que
//      la marca visible terminaba en 13,2% en vez de 16%. El director elegia un tamano y recibia
//      otro, y cuanto mas vacio tuviera el archivo, mas chico le salia.
//
//   2. CLARITO. Su logo es blanco (claridad 243 sobre 255) y se pegaba sin nada detras. Los
//      estilos que genera la IA piden "luminoso", "luz natural", "cielo celeste": un logo blanco
//      sobre una foto clara desaparece.
//
// COMO SE RESUELVE, SIN ATARLO A NINGUN LOGO: no hay ningun valor sacado de la marca de ese
// cliente. Se recorta el vacio de CUALQUIER archivo (si no tiene, no le pasa nada), y el halo se
// decide midiendo en el momento la claridad del logo contra la del pedazo de foto donde cae. Un
// logo negro sobre una foto de noche tiene el mismo problema que uno blanco sobre una clara, y
// recibe el tratamiento opuesto. Si el logo ya contrasta, no se le toca nada.

import sharp from "sharp";
import type { OverlayOptions } from "sharp";

/** Cuanto del ancho de la placa ocupa la marca, segun lo que eligio el director. */
const PORCENTAJE_POR_TAMANO: Record<string, number> = {
  small: 0.12,
  medium: 0.16,
  large: 0.22,
};

/**
 * Diferencia de claridad (0-255) por debajo de la cual el logo se confunde con la foto.
 * 60 salio de mirar los casos reales: con el logo blanco de Central sobre una foto clara da 25
 * (hay que ayudarlo) y sobre una foto oscura da 178 (no hace falta).
 */
export const UMBRAL_CONTRASTE = 60;

export interface LogoPreparado {
  png: Buffer;
  ancho: number;
  alto: number;
  /** 0 = negro, 255 = blanco. Solo de los pixeles opacos. */
  claridad: number;
  /** Para el log: cuanto se recorto de vacio. */
  recorto: boolean;
}

/** Claridad promedio de lo que se VE del logo (los pixeles transparentes no cuentan). */
async function claridadDeLaMarca(logo: Buffer): Promise<number> {
  const { data } = await sharp(logo).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let n = 0;
  let suma = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 200) {
      suma += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      n++;
    }
  }
  return n ? suma / n : 128;
}

/** Claridad promedio de un recorte de la placa. */
async function claridadDelFondo(placa: Buffer, caja: { left: number; top: number; width: number; height: number }) {
  const { data } = await sharp(placa).extract(caja).removeAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  let suma = 0;
  for (let i = 0; i < data.length; i += 3) {
    suma += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return suma / (data.length / 3);
}

/**
 * Deja el logo listo para pegar: le saca el vacio de alrededor y lo lleva al tamano elegido.
 *
 * El recorte es lo que hace que el porcentaje signifique algo. Sin el, dos agencias que eligen
 * "mediano" reciben tamanos distintos solo porque una exporto el logo con mas aire que la otra.
 */
export async function prepararLogo(
  original: Buffer,
  anchoPlaca: number,
  tamano?: string,
): Promise<LogoPreparado> {
  const porcentaje = PORCENTAJE_POR_TAMANO[tamano ?? ""] ?? PORCENTAJE_POR_TAMANO.medium;
  const anchoObjetivo = Math.round(anchoPlaca * porcentaje);

  const medidaOriginal = await sharp(original).metadata();
  let base = original;
  let recorto = false;
  try {
    // threshold 1 = recorta solo lo totalmente transparente/uniforme del borde.
    const recortado = await sharp(original).trim({ threshold: 1 }).toBuffer();
    const m = await sharp(recortado).metadata();
    // Si trim deja algo degenerado (un logo de un color plano puede quedar en nada), no se usa.
    if ((m.width ?? 0) > 0 && (m.height ?? 0) > 0) {
      recorto = (m.width !== medidaOriginal.width) || (m.height !== medidaOriginal.height);
      base = recortado;
    }
  } catch {
    // Un archivo raro no puede tumbar la generacion entera: se sigue con el original.
  }

  const png = await sharp(base)
    .resize({ width: anchoObjetivo, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const m = await sharp(png).metadata();

  return {
    png,
    ancho: m.width ?? anchoObjetivo,
    alto: m.height ?? anchoObjetivo,
    claridad: await claridadDeLaMarca(png),
    recorto,
  };
}

export interface ResultadoContraste {
  /** Las capas del halo, listas para composite. Vacio si no hace falta. */
  capas: OverlayOptions[];
  claridadFondo: number;
  contraste: number;
  halo: "claro" | "oscuro" | null;
}

/**
 * Mira que hay debajo del logo y, si se pierde contra la foto, arma un halo del color contrario.
 * Las capas que devuelve van ANTES del logo en el composite.
 */
export async function halodeContraste(
  placa: Buffer,
  logo: LogoPreparado,
  posicion: { left: number; top: number },
): Promise<ResultadoContraste> {
  const meta = await sharp(placa).metadata();
  const anchoPlaca = meta.width ?? 0;
  const altoPlaca = meta.height ?? 0;

  // La caja se recorta contra los bordes: extract() de sharp tira si se sale aunque sea un pixel.
  const left = Math.max(0, Math.min(Math.round(posicion.left), anchoPlaca - 1));
  const top = Math.max(0, Math.min(Math.round(posicion.top), altoPlaca - 1));
  const width = Math.max(1, Math.min(logo.ancho, anchoPlaca - left));
  const height = Math.max(1, Math.min(logo.alto, altoPlaca - top));

  let claridadFondo: number;
  try {
    claridadFondo = await claridadDelFondo(placa, { left, top, width, height });
  } catch {
    // Sin poder medir el fondo no se inventa un halo: se deja como estaba.
    return { capas: [], claridadFondo: -1, contraste: -1, halo: null };
  }

  const contraste = Math.abs(logo.claridad - claridadFondo);
  if (contraste >= UMBRAL_CONTRASTE) {
    return { capas: [], claridadFondo, contraste, halo: null };
  }

  // Logo claro -> halo oscuro. Logo oscuro -> halo claro.
  const esLogoClaro = logo.claridad > 128;
  const tono = esLogoClaro ? 0 : 255;
  const radio = Math.max(2, Math.round(logo.ancho * 0.03));
  const pad = radio * 3;

  const silueta = await sharp(logo.png)
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extractChannel("alpha")
    .blur(radio)
    .toBuffer();

  const halo = await sharp({
    create: {
      width: logo.ancho + pad * 2,
      height: logo.alto + pad * 2,
      channels: 3,
      background: { r: tono, g: tono, b: tono },
    },
  }).joinChannel(silueta).png().toBuffer();

  // Dos pasadas: le dan cuerpo al halo sin que el borde se note como un recuadro.
  const donde = { top: Math.round(posicion.top) - pad, left: Math.round(posicion.left) - pad };
  return {
    capas: [{ input: halo, ...donde }, { input: halo, ...donde }],
    claridadFondo,
    contraste,
    halo: esLogoClaro ? "oscuro" : "claro",
  };
}
