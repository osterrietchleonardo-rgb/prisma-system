// Marketing IA · La franja del aviso legal de las placas.
//
// POR QUE LO DIBUJA EL CODIGO Y NO GEMINI: hasta el 31-ago-2026 el aviso legal se le pedia al
// modelo de imagen dentro del prompt ("inclui este texto en una franja inferior"). El modelo lo
// escribe a mano adentro de la foto, asi que con un texto largo y lleno de numeros —matriculas,
// leyes, decretos— sale ilegible o, peor, con los numeros cambiados. Un aviso legal con la
// matricula equivocada expone mas que no tener ninguno. Aca el texto se dibuja de verdad: sale
// exacto, del largo que sea.
//
// Como se dibujan las letras (y por que no son texto) esta en lib/tipografia/contornos.ts.
import sharp from "sharp";
import { anchoDelTexto, comoPaths, contornosDeTexto } from "@/lib/tipografia/contornos";

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

const OPACIDAD_FRANJA = 0.62;
const COLOR_TEXTO = "#ffffff";
const OPACIDAD_TEXTO = 0.93;

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
      if (anchoDelTexto(tentativa, cuerpo) <= anchoUtil) {
        actual = tentativa;
        continue;
      }
      if (actual) renglones.push(actual);

      // Una sola palabra mas larga que el renglon (una URL, por ejemplo): se parte a lo bruto.
      if (anchoDelTexto(palabra, cuerpo) > anchoUtil) {
        let trozo = "";
        for (const ch of palabra) {
          if (anchoDelTexto(trozo + ch, cuerpo) > anchoUtil && trozo) {
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
  /** La franja ya dibujada, lista para pegar. */
  png: Buffer;
  /** A que altura pegarla (el borde de arriba de la franja). */
  top: number;
  alto: number;
  /** Cuerpo de letra que entro, en px de la imagen final. Para poder registrarlo en el log. */
  cuerpo: number;
  renglones: number;
  /**
   * Cuantas letras salieron rotas (coordenadas NaN) y no se pudieron dibujar. Tiene que ser
   * SIEMPRE 0: si no lo es, el aviso legal que ve el cliente dice algo distinto del que
   * escribio el director. Se registra en el log de la ruta.
   */
  letrasSinDibujo: number;
  /** Los renglones tal como quedaron repartidos. Sirve para comprobar que no se perdio nada. */
  texto: string[];
};

/**
 * Arma la franja del aviso legal para una imagen de `ancho` x `alto`.
 * Devuelve null si no hay texto que poner.
 */
export async function armarFranjaLegal(
  texto: string,
  ancho: number,
  alto: number
): Promise<FranjaLegal | null> {
  const limpio = (texto || "").trim();
  if (!limpio) return null;

  const escala = ancho / ANCHO_REF;
  const margenX = MARGEN_LATERAL_REF * escala;
  const margenY = MARGEN_VERTICAL_REF * escala;
  const anchoUtil = ancho - margenX * 2;
  const topeAlto = Math.min(ancho * TOPE_POR_ANCHO, alto * TOPE_POR_ALTO);

  // POR QUE EL CUERPO ES ENTERO: con un cuerpo fraccionario (16,11852 px, que es lo que sale de
  // 17 px escalados a una imagen de 1024) opentype.js devuelve coordenadas NaN en algunas
  // letras. El rasterizador corta el dibujo ahi y el resto del aviso no se dibuja, sin error ni
  // aviso: la banda oscura sale entera y el texto muere a mitad de una palabra. Asi salio a
  // produccion el 31-ago-2026. Con cuerpos enteros no aparece ni un NaN, y ademas la letra
  // chica se ve mas nitida. Medido: 1.449 pixeles de letra con 16,11852 contra 3.677 con 16.
  let cuerpo = Math.max(12, Math.round(CUERPOS_REF[CUERPOS_REF.length - 1] * escala));
  let renglones: string[] = [];
  let altoFranja = 0;

  for (const ref of CUERPOS_REF) {
    const c = Math.max(12, Math.round(ref * escala));
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

  let letrasRotas = 0;

  const altoSvg = Math.ceil(altoFranja);
  const altoRenglon = Math.ceil(cuerpo * INTERLINEA);

  // POR QUE UN DIBUJO POR RENGLON Y NO UNO SOLO PARA TODA LA FRANJA:
  // el rasterizador se queda a mitad de camino con un dibujo grande y el aviso sale cortado sin
  // avisar — con las 841 letras de Central en un solo <path> sobre el lienzo de la imagen
  // entera se dibujaban 1.142 pixeles de letra en vez de 20.200, o sea las primeras 45 letras.
  // Lo peor es que la banda oscura SI se dibujaba entera, asi que de lejos parecia que andaba.
  // Un lienzo chico por renglon (1024 x 21 px) siempre se dibuja completo. Medido el 31-ago-2026
  // contra produccion y en local.
  // Cada renglon se convierte a imagen ACA, uno por uno, y recien despues se pegan. Pasarle los
  // SVG directo a composite() deja renglones incompletos.
  const capas = await Promise.all(
    renglones.map(async (r, i) => {
      const c = contornosDeTexto(r, margenX, cuerpo * 0.82, cuerpo);
      letrasRotas += c.letrasRotas;
      const paths = comoPaths(c.paths, COLOR_TEXTO, OPACIDAD_TEXTO);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${altoRenglon}">${paths}</svg>`;
      return {
        input: await sharp(Buffer.from(svg)).png().toBuffer(),
        top: Math.round(margenY + cuerpo * INTERLINEA * i),
        left: 0,
      };
    })
  );

  const png = await sharp({
    create: {
      width: ancho,
      height: altoSvg,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: OPACIDAD_FRANJA },
    },
  })
    .composite(capas)
    .png()
    .toBuffer();

  return {
    png,
    top: alto - altoSvg,
    alto: altoSvg,
    cuerpo,
    renglones: renglones.length,
    letrasSinDibujo: letrasRotas,
    texto: renglones,
  };
}
