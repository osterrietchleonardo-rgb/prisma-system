import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const dirTemporal = () =>
  fs.mkdtempSync(path.join(os.tmpdir(), "vakdor-studio-"));

/**
 * Borra un directorio de pruebas TOLERANDO el EPERM de Windows.
 *
 * En Windows, borrar un arbol recien escrito por ffmpeg falla a veces con EPERM aunque
 * ya no lo use nadie: el antivirus o el indexador todavia tienen el handle abierto unos
 * milisegundos. `force: true` no cubre ese caso (solo ignora "no existe"), asi que sin
 * reintento la limpieza tira un error dentro del hook `after` y ensucia una corrida que
 * en realidad paso entera. Se reintenta un par de veces y, si igual no se puede, se
 * deja el temporal: el sistema operativo lo limpia solo y no vale la pena romper la
 * suite por basura en el directorio temporal.
 */
export function borrarDirDePrueba(dir) {
  for (let intento = 0; intento < 3; intento++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      return;
    } catch (e) {
      if (e.code !== "EPERM" && e.code !== "EBUSY") throw e;
    }
  }
}

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
