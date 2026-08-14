import { spawn } from "node:child_process";
import fs from "node:fs";

const correr = (cmd, args) =>
  new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", () => reject(new Error(`No encontre "${cmd}" en el PATH. Instalalo o agregalo al PATH.`)));
    p.on("close", (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${cmd} fallo (codigo ${code}): ${err.trim()}`)));
  });

/** Lee los datos tecnicos de un video. */
export async function probe(ruta) {
  if (!fs.existsSync(ruta)) throw new Error(`El archivo no existe: ${ruta}`);

  const salida = await correr("ffprobe", [
    "-v", "error", "-show_streams", "-show_format", "-of", "json", ruta,
  ]);
  const datos = JSON.parse(salida);
  const video = datos.streams.find((s) => s.codec_type === "video");
  if (!video) throw new Error(`El archivo no tiene pista de video: ${ruta}`);

  const [num, den] = String(video.avg_frame_rate || "30/1").split("/").map(Number);
  const fps = den ? Math.round((num / den) * 1000) / 1000 : 30;

  // ROTACION: un celular que graba en vertical guarda los pixeles apaisados (ej.
  // 3840x2160) y anota "rotation=-90" aparte. ffmpeg la aplica solo al decodificar,
  // asi que el video SE VE 2160x3840 aunque el stream diga lo contrario. Sin esto,
  // todo lo que decide encuadre corriente abajo (filtroDeFormato) cree que un reel
  // vertical es horizontal y lo recorta al reves. Encontrado usando la skill con un
  // .mov real de celular, no en teoria.
  const rot = Math.abs(
    Number(video.side_data_list?.find((s) => s.rotation !== undefined)?.rotation ??
           video.tags?.rotate ?? 0)
  ) % 180;
  const rotado = rot === 90;

  return {
    durationSec: Number(datos.format?.duration ?? video.duration ?? 0),
    fps: Number.isInteger(fps) ? fps : Math.round(fps * 1000) / 1000,
    width: Number(rotado ? video.height : video.width),
    height: Number(rotado ? video.width : video.height),
    rotacion: rot,
    hasAudio: datos.streams.some((s) => s.codec_type === "audio"),
  };
}
