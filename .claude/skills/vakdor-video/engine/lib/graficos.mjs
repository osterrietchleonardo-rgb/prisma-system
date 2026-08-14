// lib/graficos.mjs — la capa de graficos del Studio: agrupa la transcripcion en
// frases cortas, arma el spec de tarjetas y construye el fragmento de ffmpeg que
// las estampa.
//
// Arquitectura (la misma del spec): ffmpeg mueve los pixeles, otra cosa dibuja.
// Las tarjetas las dibuja `tools/tarjetas.py` (PIL) como PNG con transparencia, y
// aca se arma el `overlay ... enable='between(t,a,b)'` que las pega en el momento
// justo. Cada tarjeta entra con un fundido y una subida de unos pixeles: aparecer
// de golpe se lee barato.

const SIN_ACENTOS = (s) =>
  String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Palabra que merece cobre: numeros, porcentajes y las que carguen el mensaje. */
export function esClave(palabra, clavesExtra = []) {
  const limpia = SIN_ACENTOS(palabra).replace(/[^a-z0-9%]/g, "");
  if (!limpia) return false;
  if (/^\d+%?$/.test(limpia)) return true;
  return clavesExtra.some((k) => SIN_ACENTOS(k) === limpia);
}

/**
 * Agrupa palabras en frases cortas de subtitulo.
 *
 * Corta por tres motivos, en este orden: se paso de `maxChars`, hubo una pausa
 * larga (respira: cortar ahi es lo que hace que el subtitulo siga al habla y no
 * al reves), o se acabaron las palabras. `maxChars` bajo a proposito: en vertical
 * una linea larga obliga a mover los ojos y se pierde la cara.
 */
export function agruparEnFrases(palabras, { maxChars = 30, pausaSeg = 0.45 } = {}) {
  const frases = [];
  let actual = [];

  const cerrar = () => {
    if (!actual.length) return;
    frases.push({
      palabras: actual,
      desde: actual[0].inicioSec,
      hasta: actual[actual.length - 1].finSec ?? actual[actual.length - 1].inicioSec + 0.4,
    });
    actual = [];
  };

  for (let i = 0; i < palabras.length; i++) {
    const p = palabras[i];
    const largo = actual.reduce((a, w) => a + w.texto.length + 1, 0) + p.texto.length;
    if (actual.length && largo > maxChars) cerrar();
    actual.push(p);

    const sig = palabras[i + 1];
    const fin = p.finSec ?? p.inicioSec;
    if (sig && sig.inicioSec - fin >= pausaSeg) cerrar();
  }
  cerrar();
  return frases;
}

/** Convierte frases en specs de tarjeta de subtitulo, con las claves en cobre. */
export function specDeSubtitulos(frases, { claves = [], px = 46, prefijo = "sub" } = {}) {
  return frases.map((f, i) => ({
    id: `${prefijo}${String(i).padStart(2, "0")}`,
    tipo: "subtitulo",
    px,
    desde: f.desde,
    hasta: f.hasta,
    partes: f.palabras.map((w, j) => ({
      txt: (j ? " " : "") + w.texto,
      clave: esClave(w.texto, claves),
    })),
  }));
}

/**
 * Convierte frases en TITULARES: tipografia grande sobre el video, sin caja, con
 * la palabra que carga la frase mas grande y en cobre.
 *
 * Es el lenguaje de los reels con autoridad: el subtitulo en cajita se lee como
 * transcripcion, el titular se lee como afirmacion. Se parte en dos lineas
 * equilibradas porque una linea larga en vertical obliga a barrer con la vista y
 * se pierde la cara.
 */
export function specDeTitulares(frases, { claves = [], px = 66, prefijo = "ti" } = {}) {
  return frases.map((f, i) => {
    const ws = f.palabras;
    // Se parte donde el ancho acumulado pasa la mitad: dos lineas parejas.
    const total = ws.reduce((a, w) => a + w.texto.length + 1, 0);
    let acum = 0;
    let corte = ws.length;
    for (let j = 0; j < ws.length; j++) {
      acum += ws[j].texto.length + 1;
      if (acum >= total / 2) { corte = j + 1; break; }
    }
    const bloques = ws.length <= 3 ? [ws] : [ws.slice(0, corte), ws.slice(corte)];

    return {
      id: `${prefijo}${String(i).padStart(2, "0")}`,
      tipo: "titular",
      px,
      desde: f.desde,
      hasta: f.hasta,
      lineas: bloques.filter((b) => b.length).map((b) =>
        b.map((w, j) => ({
          txt: (j ? " " : "") + w.texto,
          fuerte: esClave(w.texto, claves),
        }))
      ),
    };
  });
}

/**
 * Arma los inputs y el filter_complex para estampar las tarjetas.
 *
 * Devuelve `{ inputs, filtro, etiquetaFinal }`. `inputs` son los `-loop 1 -t D -i
 * archivo.png` que hay que anteponer; `filtro` encadena un overlay por tarjeta.
 *
 * Cada tarjeta:
 *  - `fade ... alpha=1` de entrada y salida sobre su propio canal alfa;
 *  - `y` con una subida de `subida` px durante la entrada;
 *  - `enable='between(t,desde,hasta)'`, para que solo exista en su tramo.
 */
export function construirOverlays(tarjetas, { indiceBase = 1, subida = 14, fundido = 0.28, fps = 30 } = {}) {
  const inputs = [];
  const pasos = [];
  let etiqueta = "[base]";

  tarjetas.forEach((t, i) => {
    const idx = indiceBase + i;
    const dur = Math.max(0.4, t.hasta - t.desde);

    if (t.secuencia) {
      // Una tarjeta ANIMADA es una secuencia de PNG, uno por frame. Se entra con
      // `-framerate`, no con `-loop 1 -t`: la duracion sale de cuantos frames hay.
      inputs.push("-framerate", String(fps), "-i", t.archivo);
    } else {
      inputs.push("-loop", "1", "-t", dur.toFixed(3), "-i", t.archivo);
    }

    const fOut = Math.max(0, dur - fundido);
    pasos.push(
      `[${idx}:v]format=rgba,` +
      `fade=t=in:st=0:d=${fundido}:alpha=1,` +
      `fade=t=out:st=${fOut.toFixed(3)}:d=${fundido}:alpha=1,` +
      `setpts=PTS-STARTPTS+${t.desde.toFixed(3)}/TB[t${idx}]`
    );

    const y = `${t.y}+${subida}*(1-min(1,(t-${t.desde.toFixed(3)})/${fundido}))`;
    const sig = i === tarjetas.length - 1 ? "[conGraficos]" : `[o${idx}]`;
    pasos.push(
      `${etiqueta}[t${idx}]overlay=x=${t.x}:y='${y}':` +
      `enable='between(t,${t.desde.toFixed(3)},${t.hasta.toFixed(3)})':eof_action=pass${sig}`
    );
    etiqueta = sig;
  });

  return { inputs, filtro: pasos.join(";"), etiquetaFinal: etiqueta };
}

/**
 * PANEL DIVIDIDO: durante su ventana, el video se achica a la franja de abajo y
 * arriba queda la zona de explicacion.
 *
 * Son dos overlays encadenados sobre la misma base: primero el panel (que tapa
 * todo el cuadro), despues el video reducido encima. El video reducido sale de
 * un `split` de la misma base, asi que no hay que volver a decodificar nada.
 *
 * `recorteY` es desde donde se recorta el video original antes de achicarlo:
 * sirve para que quede encuadrada la cara y no el pecho.
 */
export function construirPanel({
  indice, panel, desde, hasta, ancho = 1080, alto = 1920,
  altoZona = 740, recorteY = 340, entrada = "[base]", salida = "[conPanel]",
}) {
  const altoVideo = alto - altoZona;
  const inputs = ["-loop", "1", "-t", (hasta - desde).toFixed(3), "-i", panel];
  const ventana = `between(t,${desde.toFixed(3)},${hasta.toFixed(3)})`;

  const filtro = [
    // una copia de la base para achicar
    `${entrada}split=2[paraPanel][paraChico]`,
    `[paraChico]crop=${ancho}:${altoVideo}:0:${recorteY},setpts=PTS-STARTPTS[chico]`,
    `[${indice}:v]format=rgba,fade=t=in:st=0:d=0.25:alpha=1,` +
      `fade=t=out:st=${Math.max(0, hasta - desde - 0.25).toFixed(3)}:d=0.25:alpha=1,` +
      `setpts=PTS-STARTPTS+${desde.toFixed(3)}/TB[panelFx]`,
    `[paraPanel][panelFx]overlay=0:0:enable='${ventana}':eof_action=pass[conFondo]`,
    `[conFondo][chico]overlay=0:${altoZona}:enable='${ventana}':eof_action=pass${salida}`,
  ].join(";");

  return { inputs, filtro, etiquetaFinal: salida };
}

/**
 * Ubica una tarjeta centrada horizontalmente. `ancla` es la Y del CENTRO, no del
 * borde: pensar en "a que altura del cuadro va" es mas natural que calcular el
 * borde superior, y ademas evita que una tarjeta mas alta que otra baile.
 */
export function centrar(tarjeta, anchoVideo, ancla) {
  return {
    ...tarjeta,
    x: Math.round((anchoVideo - tarjeta.w) / 2),
    y: Math.round(ancla - tarjeta.h / 2),
  };
}
