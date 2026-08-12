import { spawn } from "node:child_process";
import { filtroDeColor } from "./grade.mjs";
import { filtroDeFormato, FORMATOS } from "./reframe.mjs";
import { filtroZoom, filtroEscalaFija, filtroWhipPan, filtroPush, elegirMultiplicador } from "./camera.mjs";
import { elegirEncoder } from "./encoder.mjs";

const MOVIMIENTOS_CON_DURACION = new Set(["zoomIn", "zoomOut", "push"]);

/** Parte la linea de tiempo en tramos: solo los que tienen movimiento pagan el sobre-muestreo. */
export function construirGrafo({ receta, info }) {
  const { ancho, alto } = FORMATOS[receta.formato];
  const formato = filtroDeFormato({
    anchoOrigen: info.width, altoOrigen: info.height, formato: receta.formato,
  });
  const color = filtroDeColor(receta.grade.preset, { vignette: receta.grade.vignette });

  const segundosConZoom = receta.camara
    .filter((c) => MOVIMIENTOS_CON_DURACION.has(c.fx))
    .reduce((a, c) => a + (c.dur ?? 3), 0);
  const multiplicador = elegirMultiplicador(segundosConZoom);

  // `duracionReal` es cuanto dura el TRAMO de verdad (puede ser mas corto que
  // `c.dur` si el segmento se recorto por superposicion o por el final del
  // video): el filtro tiene que rampear en esos frames, no en los pedidos,
  // o el zoom llega a un porcentaje distinto del pedido / a otra velocidad.
  const movimientoDe = (c, duracionReal) => {
    const comun = { fps: info.fps, ancho, alto };
    if (c.fx === "zoomIn" || c.fx === "zoomOut")
      return filtroZoom({ tipo: c.fx, pct: c.pct ?? 8, duracionSec: duracionReal, multiplicador, ...comun });
    if (c.fx === "push")
      return filtroPush({ pct: c.pct ?? 6, duracionSec: duracionReal, ...comun });
    if (c.fx === "jumpCutClose") return filtroEscalaFija({ escala: c.escala ?? 1.18, ancho, alto });
    if (c.fx === "jumpCutWide")  return filtroEscalaFija({ escala: c.escala ?? 0.88, ancho, alto });
    if (c.fx === "whipPan")      return filtroWhipPan({ fps: info.fps, ancho, alto, direccion: c.direccion ?? "der" });
    throw new Error(`Movimiento de camara desconocido: "${c.fx}".`);
  };

  // Tramos: los huecos entre movimientos pasan sin filtro de camara.
  // `receta.camara` ya viene ordenada por `t` (lo ordena cargarReceta), pero dos
  // movimientos pueden pedir tiempo superpuesto (p.ej. uno largo que ya cubre a
  // otro que arranca adentro). Por eso el "desde" real de cada tramo se recorta
  // a `cursor` (lo que ya quedo cubierto), y si eso deja el tramo vacio o negativo
  // se lo salta: sin esto, el segundo movimiento generaba un tramo propio que
  // se solapaba con el anterior y el video quedaba duplicado al concatenar.
  const tramos = [];
  const avisos = [];
  let cursor = 0;
  for (const c of receta.camara) {
    const dur = c.dur ?? (MOVIMIENTOS_CON_DURACION.has(c.fx) ? 3 : Math.max(0.5, info.durationSec - c.t));
    const desde = Math.max(c.t, cursor);
    const hasta = Math.min(c.t + dur, info.durationSec);
    if (hasta <= desde) {
      const razon = hasta <= cursor
        ? "el tramo ya estaba cubierto por un movimiento de camara anterior"
        : "cae justo en el limite del video y no le queda tiempo";
      avisos.push(`El movimiento "${c.fx}" pedido en el segundo ${c.t}s no se aplico: ${razon}.`);
      continue;
    }
    if (desde > cursor) tramos.push({ desde: cursor, hasta: desde, filtro: "" });
    tramos.push({ desde, hasta, filtro: movimientoDe(c, hasta - desde) });
    cursor = hasta;
  }
  if (cursor < info.durationSec) tramos.push({ desde: cursor, hasta: info.durationSec, filtro: "" });
  if (tramos.length === 0) tramos.push({ desde: 0, hasta: info.durationSec, filtro: "" });

  // `base` es lo que se le aplica a TODOS los tramos: formato + color.
  const filtroVideo = [formato, color].filter(Boolean).join(",");
  return { filtroVideo, tramos, multiplicador, avisos };
}

/** Ejecuta ffmpeg una sola vez. Separado para que `componer` no use un executor async. */
function correrFfmpeg(args, alSalir) {
  return new Promise((resolve, reject) => {
    const inicio = Date.now();
    const p = spawn("ffmpeg", args);
    let err = "";
    p.stderr.on("data", (d) => { err += d; if (alSalir) alSalir(String(d)); });
    p.on("error", (e) => reject(new Error(`No pude ejecutar ffmpeg: ${e.message}`)));
    p.on("close", (code) =>
      code === 0
        ? resolve({ segundos: (Date.now() - inicio) / 1000 })
        : reject(new Error(`ffmpeg fallo (codigo ${code}):\n${err.slice(-2000)}`)));
  });
}

/** Arma el filter_complex definitivo y hace UN solo encode. */
export async function componer({ entrada, salida, receta, info, encoder = null, alSalir = null }) {
  const { filtroVideo: base, tramos } = construirGrafo({ receta, info });
  const enc = encoder ?? (await elegirEncoder({
    calidad: receta.calidad === "max" ? "max" : "rapido",
  }));

  const partes = [];
  const etiquetas = [];
  tramos.forEach((t, i) => {
    const cadena = [
      `trim=start=${t.desde.toFixed(3)}:end=${t.hasta.toFixed(3)}`,
      "setpts=PTS-STARTPTS",
      base,
      t.filtro,
    ].filter(Boolean).join(",");
    partes.push(`[0:v]${cadena}[v${i}]`);
    etiquetas.push(`[v${i}]`);
  });
  partes.push(`${etiquetas.join("")}concat=n=${tramos.length}:v=1:a=0[vout]`);

  const args = [
    "-y", "-v", "error", "-stats", "-i", entrada,
    "-filter_complex", partes.join(";"),
    "-map", "[vout]", "-map", "0:a?",
    "-c:v", enc.nombre, ...enc.args,
    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
    "-movflags", "+faststart", salida,
  ];

  const r = await correrFfmpeg(args, alSalir);
  return { segundos: r.segundos, encoder: enc.nombre };
}
