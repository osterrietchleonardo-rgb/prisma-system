import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const dirTemporal = () =>
  fs.mkdtempSync(path.join(os.tmpdir(), "vakdor-studio-"));

export function crearClipDePrueba({
  segundos = 3,
  ancho = 1920,
  alto = 1080,
  conAudio = true,
  salida,
}) {
  const args = ["-y", "-v", "error",
    "-f", "lavfi", "-i", `testsrc2=size=${ancho}x${alto}:rate=30:duration=${segundos}`];
  if (conAudio) args.push("-f", "lavfi", "-i", `sine=frequency=440:duration=${segundos}`);
  args.push("-c:v", "libx264", "-crf", "24", "-pix_fmt", "yuv420p");
  if (conAudio) args.push("-c:a", "aac", "-shortest");
  args.push(salida);

  const r = spawnSync("ffmpeg", args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`No pude crear el clip de prueba: ${r.stderr}`);
  return salida;
}
