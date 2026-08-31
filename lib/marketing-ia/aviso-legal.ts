// Marketing IA · La franja del aviso legal de las placas.
//
// POR QUE LO DIBUJA EL CODIGO Y NO GEMINI: hasta el 31-ago-2026 el aviso legal se le pedia al
// modelo de imagen dentro del prompt ("inclui este texto en una franja inferior"). El modelo lo
// escribe a mano adentro de la foto, asi que con un texto largo y lleno de numeros —matriculas,
// leyes, decretos— sale ilegible o, peor, con los numeros cambiados. Un aviso legal con la
// matricula equivocada expone mas que no tener ninguno. Aca el texto se dibuja de verdad: sale
// exacto, del largo que sea.
//
// POR QUE LAS LETRAS SON FORMAS Y NO TEXTO: el runtime de Vercel no tiene fuentes instaladas,
// asi que un <text> de SVG sale como cuadraditos vacios (medido contra produccion). Cada letra
// se convierte a su contorno con opentype.js y viaja como <path>. No hay ninguna fuente que
// resolver en el servidor.
// Import con nombre y no por defecto: opentype.js no tiene export por defecto en su build
// ESM, que es el que usa el runtime del servidor de Next. Con `import opentype from ...` el
// objeto llega undefined y revienta recien al generar la primera placa, no al compilar.
import { parse as leerFuente } from "opentype.js";
import type { Font, Glyph } from "opentype.js";
import { INTER_REGULAR_WOFF } from "./fuente-inter";

// Todo se mide contra un ancho de referencia de 1080 px (el lado de una placa de Instagram) y
// despues se escala, asi la franja se ve igual en un post cuadrado que en una historia.
const ANCHO_REF = 1080;

// De mayor a menor: se usa el cuerpo mas grande que entre en el alto disponible. Abajo de 13 no
// se baja, porque deja de leerse.
const CUERPOS_REF = [22, 21, 20, 19, 18, 17, 16, 15, 14, 13];

const INTERLINEA = 1.3;          // alto de renglon, en cuerpos
const MARGEN_LATERAL_REF = 34;   // aire a los costados
const MARGEN_VERTICAL_REF = 14;  // aire arriba y abajo del bloque de texto

// Cuanto puede ocupar la franja. Se mide contra el ANCHO y no contra el alto porque la cantidad
// de renglones depende de cuantas letras entran a lo ancho, no de si la placa es cuadrada o
// vertical. El segundo tope es una red por si alguna vez llega una imagen muy baja.
const TOPE_POR_ANCHO = 0.17;
const TOPE_POR_ALTO = 0.22;

const COLOR_FRANJA = "#000000";
const OPACIDAD_FRANJA = 0.62;
const COLOR_TEXTO = "#ffffff";
const OPACIDAD_TEXTO = 0.93;

let fuenteCache: Font | null = null;

function fuente(): Font {
  if (!fuenteCache) {
    const b = INTER_REGULAR_WOFF;
    fuenteCache = leerFuente(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  }
  return fuenteCache;
}

// Se arma glifo por glifo en vez de usar font.getPath(). El motor de shaping de opentype.js se
// cuelga con las tablas de Inter ("substFormat: 2 is not yet supported") y con las fuentes
// variables devuelve coordenadas NaN que rompen el dibujo entero. Letra por letra no se toca
// nada de eso, y para un texto legal en castellano no hace falta shaping.
function anchoDe(texto: string, cuerpo: number): number {
  const f = fuente();
  const escala = cuerpo / f.unitsPerEm;
  let x = 0;
  let previo: Glyph | null = null;
  for (const ch of texto) {
    const g = f.charToGlyph(ch);
    if (previo) x += f.getKerningValue(previo, g) * escala;
    x += (g.advanceWidth ?? 0) * escala;
    previo = g;
  }
  return x;
}

function pathDe(texto: string, x0: number, y: number, cuerpo: number): string {
  const f = fuente();
  const escala = cuerpo / f.unitsPerEm;
  let x = x0;
  let previo: Glyph | null = null;
  const partes: string[] = [];
  for (const ch of texto) {
    const g = f.charToGlyph(ch);
    if (previo) x += f.getKerningValue(previo, g) * escala;
    const d = g.getPath(x, y, cuerpo).toPathData(2);
    if (d) partes.push(d);
    x += (g.advanceWidth ?? 0) * escala;
    previo = g;
  }
  return partes.join(" ");
}

// Respeta los saltos de linea que haya escrito el director (suelen separar el aviso de la firma
// de la agencia) y acomoda cada parrafo dentro del ancho disponible.
function repartirEnRenglones(texto: string, cuerpo: number, anchoUtil: number): string[] {
  const renglones: string[] = [];

  for (const parrafo of texto.replace(/\r\n?/g, "\n").split("\n")) {
    const limpio = parrafo.trim().replace(/\s+/g, " ");
    if (!limpio) continue;

    let actual = "";
    for (const palabra of limpio.split(" ")) {
      const tentativa = actual ? `${actual} ${palabra}` : palabra;
      if (anchoDe(tentativa, cuerpo) <= anchoUtil) {
        actual = tentativa;
        continue;
      }
      if (actual) renglones.push(actual);

      // Una sola palabra mas larga que el renglon (una URL, por ejemplo): se parte a lo bruto.
      if (anchoDe(palabra, cuerpo) > anchoUtil) {
        let trozo = "";
        for (const ch of palabra) {
          if (anchoDe(trozo + ch, cuerpo) > anchoUtil && trozo) {
            renglones.push(trozo);
            trozo = ch;
          } else {
            trozo += ch;
          }
        }
        actual = trozo;
      } else {
        actual = palabra;
      }
    }
    if (actual) renglones.push(actual);
  }

  return renglones;
}

export type FranjaLegal = {
  /** El SVG listo para componer sobre la imagen, del mismo tamaño que la imagen. */
  svg: Buffer;
  /** Alto real de la franja en px. Lo necesita el logo para no quedar encima. */
  alto: number;
  /** Cuerpo de letra que entro, en px de la imagen final. Para poder registrarlo en el log. */
  cuerpo: number;
  renglones: number;
  /** Los renglones tal como quedaron repartidos. Sirve para comprobar que no se perdio nada. */
  texto: string[];
};

/**
 * Arma la franja del aviso legal para una imagen de `ancho` x `alto`.
 * Devuelve null si no hay texto que poner.
 */
export function armarFranjaLegal(texto: string, ancho: number, alto: number): FranjaLegal | null {
  const limpio = (texto || "").trim();
  if (!limpio) return null;

  const escala = ancho / ANCHO_REF;
  const margenX = MARGEN_LATERAL_REF * escala;
  const margenY = MARGEN_VERTICAL_REF * escala;
  const anchoUtil = ancho - margenX * 2;
  const topeAlto = Math.min(ancho * TOPE_POR_ANCHO, alto * TOPE_POR_ALTO);

  let cuerpo = CUERPOS_REF[CUERPOS_REF.length - 1] * escala;
  let renglones: string[] = [];
  let altoFranja = 0;

  for (const ref of CUERPOS_REF) {
    const c = ref * escala;
    const rs = repartirEnRenglones(limpio, c, anchoUtil);
    const h = rs.length * c * INTERLINEA + margenY * 2;
    // El mas chico se acepta siempre, aunque se pase del tope: antes que recortar un texto
    // legal —que lo dejaria diciendo otra cosa— es preferible una franja mas alta.
    if (h <= topeAlto || ref === CUERPOS_REF[CUERPOS_REF.length - 1]) {
      cuerpo = c;
      renglones = rs;
      altoFranja = h;
      break;
    }
  }

  if (!renglones.length) return null;

  const y0 = alto - altoFranja;
  const paths = renglones
    .map((r, i) => pathDe(r, margenX, y0 + margenY + cuerpo * INTERLINEA * i + cuerpo * 0.82, cuerpo))
    .filter(Boolean)
    .join(" ");

  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}">` +
      `<rect x="0" y="${y0.toFixed(1)}" width="${ancho}" height="${(altoFranja + 1).toFixed(1)}" ` +
      `fill="${COLOR_FRANJA}" fill-opacity="${OPACIDAD_FRANJA}"/>` +
      `<path d="${paths}" fill="${COLOR_TEXTO}" fill-opacity="${OPACIDAD_TEXTO}"/>` +
      `</svg>`
  );

  return {
    svg,
    alto: Math.round(altoFranja),
    cuerpo: Math.round(cuerpo),
    renglones: renglones.length,
    texto: renglones,
  };
}
