import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Cadena MEDIDA con VMAF sobre video comprimido tipo WhatsApp (11-ago-2026, 8s del VSL
 * recomprimido a 500 kbps):
 *   sin tratar 77,47 | solo cas 78,13 | hqdn3d+cas+unsharp 83,48 (+6,0 puntos)
 * `nlmeans` da mejor denoise pero tardo mas de 2 min para 8 s: descartado para produccion.
 * A proposito NO se reintroduce: si aparece por error, la prueba "NO nlmeans" lo agarra.
 */
export const NIVELES_LIMPIEZA = {
  suave:  { hqdn3d: "2:1.5:4:4", cas: 0.3, unsharp: "5:5:0.4:5:5:0.0" },
  normal: { hqdn3d: "3:3:6:6",   cas: 0.4, unsharp: "5:5:0.6:5:5:0.0" },
  fuerte: { hqdn3d: "5:4:9:9",   cas: 0.6, unsharp: "5:5:0.9:5:5:0.0" },
};

/** Cadena de filtros de limpieza (pura, no ejecuta ffmpeg). `nivel` null o "no" la apaga. */
export function filtroDeLimpieza(nivel) {
  if (!nivel || nivel === "no") return "";
  const n = NIVELES_LIMPIEZA[nivel];
  if (!n) {
    throw new Error(
      `El nivel de limpieza "${nivel}" no existe. Validos: ${Object.keys(NIVELES_LIMPIEZA).join(", ")}, no.`
    );
  }
  return [`hqdn3d=${n.hqdn3d}`, `cas=strength=${n.cas}`, `unsharp=${n.unsharp}`].join(",");
}

const correr = (args) =>
  new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args);
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => reject(new Error(`No pude ejecutar ffmpeg: ${e.message}`)));
    p.on("close", (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg fallo (${c}):\n${err.slice(-1500)}`))));
  });

// `:` y `\` son sintaxis del parser de filtros de ffmpeg (separador de opcion y escape),
// asi que una ruta de Windows como "C:\Users\..." metida CRUDA dentro de una opcion de
// filtro (vidstabdetect=result=..., vidstabtransform=input=...) se rompe: el parser se
// come el "C:" como si fuera otra opcion. Se descubrio corriendo esta misma prueba en
// Windows (ver reporte de la Task 10) — no es teorico. Hacen falta LAS TRES cosas a la
// vez (probado a mano, ver reporte): pasar "\" a "/", escapar el ":" que queda (el de la
// letra de unidad) como "\:", y ENVOLVER TODO en comillas simples — escapar el ":" sin
// las comillas simples sigue rompiendo el parser.
const escaparRutaDeFiltro = (p) => `'${p.replace(/\\/g, "/").replace(/:/g, "\\:")}'`;

/**
 * Estabilizacion vidstab en 2 pasadas (deteccion + transformacion). Es la EXCEPCION del
 * modulo: a diferencia de `filtroDeLimpieza`, si ejecuta ffmpeg, porque vidstab necesita
 * su propio archivo de analisis (.trf) entre pasada y pasada — no se puede expresar como
 * una sola cadena de filtro en el grafo principal. Por eso corre ANTES de `compose`, sobre
 * el archivo entero (compose ya no vuelve a tocar esto).
 *
 * El nombre del .trf lleva un `randomUUID()` (no solo un timestamp) para que dos corridas
 * concurrentes sobre la misma carpeta de salida nunca escriban al mismo archivo.
 */
export async function estabilizar({ entrada, salida, suavizado = 30 }) {
  const trf = path.join(path.dirname(salida), `.vidstab-${randomUUID()}.trf`);
  const trfEnFiltro = escaparRutaDeFiltro(trf);
  try {
    await correr(["-y", "-v", "error", "-i", entrada,
      "-vf", `vidstabdetect=shakiness=5:accuracy=15:result=${trfEnFiltro}`, "-f", "null", "-"]);
    await correr(["-y", "-v", "error", "-i", entrada,
      "-vf", `vidstabtransform=input=${trfEnFiltro}:smoothing=${suavizado}:zoom=1,unsharp=5:5:0.5`,
      "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", "-c:a", "copy", salida]);
    return { salida };
  } finally {
    // force:true: no importa si la 1ra pasada nunca llego a escribir el .trf (fallo
    // antes), o si ya no existe; nunca puede tirar por "no existe".
    fs.rmSync(trf, { force: true });
  }
}
