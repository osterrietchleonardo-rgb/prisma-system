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
 * Barrido rapido de camara: ~8 frames de desplazamiento + desenfoque horizontal.
 * PROBADO: `gblur` NO acepta expresiones en `sigma` (da "Unable to parse sigma option value").
 * Por eso el desenfoque se hace en 3 escalones con `enable=between(n,...)`, que si funciona.
 * `crop` en cambio SI evalua `n` por frame en x/y — ahi va el desplazamiento continuo.
 */
export function filtroWhipPan({ fps, ancho, direccion = "der" }) {
  const frames = Math.max(4, Math.round(fps * 0.27)); // ~8 frames a 30fps
  const signo = direccion === "izq" ? "-" : "";
  const a = Math.max(1, Math.round(frames * 0.25));
  const b = Math.max(a + 1, Math.round(frames * 0.65));
  const desplazamiento = `${signo}(${ancho}*0.35)*if(lt(n,${frames}),sin(PI*n/${frames}),0)`;
  return [
    `gblur=sigma=8:sigmaV=0:enable='between(n,1,${a})'`,
    `gblur=sigma=22:sigmaV=0:enable='between(n,${a + 1},${b})'`,
    `gblur=sigma=8:sigmaV=0:enable='between(n,${b + 1},${frames})'`,
    `crop=w=iw:h=ih:x='${desplazamiento}':y=0:exact=1`,
    "setsar=1",
  ].join(",");
}

/** Empuje corto y firme para entrar a una idea fuerte. */
export function filtroPush({ pct, duracionSec, fps, ancho, alto }) {
  return filtroZoom({ tipo: "zoomIn", pct, duracionSec, fps, ancho, alto, multiplicador: 2 });
}
