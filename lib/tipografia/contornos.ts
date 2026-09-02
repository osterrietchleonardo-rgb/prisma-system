// Escribir texto adentro de una imagen que arma el servidor.
//
// POR QUE LAS LETRAS SON FORMAS Y NO TEXTO: el runtime de Vercel NO tiene ninguna fuente
// instalada. Un `<text>` de SVG rasterizado con sharp sale como una fila de cuadraditos vacios
// —medido contra produccion el 31-ago-2026 sobre el credito de OpenStreetMap del mapa del ACM,
// que salio asi durante meses sin que nadie lo viera—. Aca cada letra se convierte a su contorno
// con opentype.js y viaja como <path>: no hay ninguna fuente que resolver del otro lado.
//
// Import con nombre y no por defecto: opentype.js no tiene export por defecto en su build ESM,
// que es el que usa el runtime del servidor de Next. Con `import opentype from ...` el objeto
// llega undefined y revienta recien en la primera imagen, no al compilar.
import { parse as leerFuente } from "opentype.js";
import type { Font, Glyph } from "opentype.js";
import { INTER_REGULAR_WOFF } from "./fuente-inter";

let fuenteCache: Font | null = null;

function fuente(): Font {
  if (!fuenteCache) {
    const b = INTER_REGULAR_WOFF;
    fuenteCache = leerFuente(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  }
  return fuenteCache;
}

/**
 * Cuanto mide el texto a lo ancho, en px, con ese cuerpo de letra.
 * Sirve para centrar, alinear a la derecha o decidir si entra en un renglon.
 */
export function anchoDelTexto(texto: string, cuerpo: number): number {
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

export type Contornos = {
  /** Un contorno por letra. Cada uno va en SU PROPIO <path> (ver abajo por que). */
  paths: string[];
  /** Cuanto ocupo el texto a lo ancho. */
  ancho: number;
  /**
   * Cuantas letras salieron rotas y no se pudieron dibujar. Tiene que ser SIEMPRE 0; quien
   * llame tiene que registrarlo si no lo es, porque significa que la imagen dice otra cosa.
   */
  letrasRotas: number;
};

/**
 * Convierte un texto en contornos, listos para meter en un SVG.
 *
 * `x` es donde arranca el texto e `y` es la linea de base (el piso de las letras, sin contar
 * las colas de la "p" o la "g").
 *
 * REGLA QUE NO SE NEGOCIA: `cuerpo` TIENE que ser un numero entero. Con un cuerpo fraccionario
 * —16,11852 px, que es lo que salia de escalar 17 px a una imagen de 1024— opentype.js devuelve
 * coordenadas NaN en algunas letras, y el rasterizador abandona el <path> apenas ve una: todo lo
 * que viene despues desaparece sin ningun error. Asi salio a produccion un aviso legal cortado a
 * mitad de palabra el 31-ago-2026. Por eso el cuerpo se redondea aca mismo, y ademas la letra
 * chica se ve mas nitida.
 *
 * Cada letra va en su propio contorno a proposito: si alguna vez vuelve a aparecer un NaN, se
 * lleva puesta como mucho a si misma y no al resto del texto.
 */
export function contornosDeTexto(texto: string, x0: number, y: number, cuerpo: number): Contornos {
  const f = fuente();
  const cuerpoEntero = Math.max(1, Math.round(cuerpo));
  const escala = cuerpoEntero / f.unitsPerEm;
  let x = x0;
  let previo: Glyph | null = null;
  const paths: string[] = [];
  let letrasRotas = 0;

  for (const ch of texto) {
    const g = f.charToGlyph(ch);
    if (previo) x += f.getKerningValue(previo, g) * escala;
    // Un decimal alcanza y sobra para una letra chica, y achica el archivo un 20%.
    const d = g.getPath(x, y, cuerpoEntero).toPathData(1);
    if (d && d.includes("NaN")) letrasRotas++;
    else if (d) paths.push(d);
    x += (g.advanceWidth ?? 0) * escala;
    previo = g;
  }

  return { paths, ancho: x - x0, letrasRotas };
}

/** Envuelve los contornos en elementos <path> con un color. */
export function comoPaths(paths: string[], fill: string, opacidad = 1): string {
  return paths
    .map((d) => `<path d="${d}" fill="${fill}"${opacidad < 1 ? ` fill-opacity="${opacidad}"` : ""}/>`)
    .join("");
}
