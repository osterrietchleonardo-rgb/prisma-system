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

  return {
    durationSec: Number(datos.format?.duration ?? video.duration ?? 0),
    fps: Number.isInteger(fps) ? fps : Math.round(fps * 1000) / 1000,
    width: Number(video.width),
    height: Number(video.height),
    hasAudio: datos.streams.some((s) => s.codec_type === "audio"),
  };
}
