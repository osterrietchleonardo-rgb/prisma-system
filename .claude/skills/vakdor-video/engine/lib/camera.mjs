/**
 * Movimientos de camara, todos en ffmpeg.
 * La tecnica del zoom esta MEDIDA en la §12 del spec: zoompan con sobre-muestreo 3x
 * da 0 frames congelados; scale con eval=frame daba 35 de 89. No cambiar sin volver a medir.
 */
export const MULTIPLICADOR_DEFAULT = 3;
export const SEGUNDOS_PARA_BAJAR_A_2X = 360;

/** 3x es mas suave pero cuesta 0,76x tiempo real. Con mucho zoom, 2x (1,96x tiempo real). */
export const elegirMultiplicador = (segundosConZoom) =>
  segundosConZoom > SEGUNDOS_PARA_BAJAR_A_2X ? 2 : MULTIPLICADOR_DEFAULT;

const centrado = "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'";

export function filtroZoom({ tipo, pct, duracionSec, fps, ancho, alto, multiplicador = MULTIPLICADOR_DEFAULT }) {
  if (tipo !== "zoomIn" && tipo !== "zoomOut")
    throw new Error(`Tipo de zoom desconocido: "${tipo}". Usa "zoomIn" o "zoomOut".`);

  const frames = Math.max(1, Math.round(duracionSec * fps));
  const factor = 1 + pct / 100;
  // `on` es el numero de frame de salida.
  const z = tipo === "zoomIn"
    ? `1+${(pct / 100).toFixed(4)}*on/${frames}`
    : `${factor.toFixed(4)}-${(pct / 100).toFixed(4)}*on/${frames}`;

  const W = ancho * multiplicador, H = alto * multiplicador;
  return [
    `scale=${W}:${H}:flags=bilinear`,
    `zoompan=z='${z}':d=1:${centrado}:s=${ancho}x${alto}:fps=${fps}`,
    "setsar=1",
  ].join(",");
}

/** Cambio de plano sin movimiento: recorta y vuelve a escalar. */
export function filtroEscalaFija({ escala, ancho, alto }) {
  if (escala <= 0) throw new Error(`La escala tiene que ser mayor que 0, vino ${escala}.`);
  if (escala === 1) return `scale=${ancho}:${alto},setsar=1`;
  const W = Math.round((ancho * escala) / 2) * 2;
  const H = Math.round((alto * escala) / 2) * 2;
  return [`scale=${W}:${H}:flags=lanczos`, `crop=${ancho}:${alto}`, "setsar=1"].join(",");
}

/**
 * Barrido rapido de camara: desplazamiento horizontal + desenfoque horizontal.
 * DOS COSAS MEDIDAS que no hay que "simplificar":
 *  - `gblur` NO acepta expresiones en `sigma`, por eso el desenfoque va en 3
 *    escalones con `enable=between(n,...)`.
 *  - El crop necesita LUGAR para moverse. Con `crop=w=iw` ffmpeg clampea la x a 0
 *    y el paneo no existe (verificado: x=0 y x=500 dan el mismo md5). Por eso se
 *    escala 1.3x proporcional antes y se recorta de vuelta al tamano original.
 */
export function filtroWhipPan({ fps, ancho, alto, direccion = "der", desenfoque = true }) {
  const frames = Math.max(4, Math.round(fps * 0.27)); // ~8 frames a 30fps
  const a = Math.max(1, Math.round(frames * 0.25));
  const b = Math.max(a + 1, Math.round(frames * 0.65));
  const op = direccion === "izq" ? "-" : "+";

  const W = Math.round((ancho * 1.3) / 2) * 2;
  const H = Math.round((alto * 1.3) / 2) * 2;
  const x = `(iw-ow)/2${op}(iw-ow)/2*if(lt(n,${frames}),sin(PI*n/${frames}),0)`;

  const partes = [`scale=${W}:${H}:flags=bilinear`];
  if (desenfoque) {
    partes.push(
      `gblur=sigma=8:sigmaV=0:enable='between(n,1,${a})'`,
      `gblur=sigma=22:sigmaV=0:enable='between(n,${a + 1},${b})'`,
      `gblur=sigma=8:sigmaV=0:enable='between(n,${b + 1},${frames})'`
    );
  }
  partes.push(`crop=${ancho}:${alto}:x='${x}':y='(ih-oh)/2':exact=1`, "setsar=1");
  return partes.join(",");
}

/** Empuje corto y firme para entrar a una idea fuerte. */
export function filtroPush({ pct, duracionSec, fps, ancho, alto }) {
  return filtroZoom({ tipo: "zoomIn", pct, duracionSec, fps, ancho, alto, multiplicador: 2 });
}

/**
 * Flotacion sutil, tipo camara en mano. Tres senos de periodo distinto y primo entre si
 * para que el ciclo no se note repetirse.
 *
 * DETERMINISTA a proposito: nada de azar. Si usara random(), dos renders del mismo video
 * no darian el mismo archivo y no se podria reproducir un resultado ni comparar dos
 * versiones. La prueba lo verifica.
 *
 * No usa `zoompan`, asi que NO paga el sobre-muestreo caro del zoom: solo agranda un 10%
 * para tener margen donde flotar sin mostrar bordes negros.
 */
export function filtroDrift({ ancho, alto, intensidad = 0.5 }) {
  const amp = Math.max(0, Math.min(1, intensidad));
  const ax = (18 * amp).toFixed(2);
  const ax2 = (9 * amp).toFixed(2);
  const ay = (12 * amp).toFixed(2);
  const W = Math.round((ancho * 1.1) / 2) * 2;
  const H = Math.round((alto * 1.1) / 2) * 2;
  return [
    `scale=${W}:${H}:flags=bilinear`,
    `crop=${ancho}:${alto}:x='(iw-ow)/2+${ax}*sin(2*PI*n/210)+${ax2}*sin(2*PI*n/97)':y='(ih-oh)/2+${ay}*sin(2*PI*n/173)':exact=1`,
    "setsar=1",
  ].join(",");
}

/**
 * Acercamiento o alejamiento continuo. Es el zoom con nombre de cine: mismo mecanismo
 * medido (zoompan con sobre-muestreo), distinto uso narrativo.
 * `duracionSec` tiene que ser la duracion REAL del tramo, no la pedida en la receta.
 */
export function filtroDolly({ pct, duracionSec, fps, ancho, alto, direccion = "in", multiplicador }) {
  return filtroZoom({
    tipo: direccion === "out" ? "zoomOut" : "zoomIn",
    pct, duracionSec, fps, ancho, alto,
    multiplicador: multiplicador ?? MULTIPLICADOR_DEFAULT,
  });
}
