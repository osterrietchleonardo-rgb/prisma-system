import { spawn } from "node:child_process";

/** Encoders en orden de preferencia. `calidad` es "max" | "rapido". */
export const ENCODERS = [
  { nombre: "h264_amf",   esGpu: true,
    args: (c) => c === "max"
      ? ["-quality", "quality", "-rc", "cqp", "-qp_i", "16", "-qp_p", "16"]
      : ["-quality", "balanced", "-rc", "cqp", "-qp_i", "20", "-qp_p", "20"] },
  { nombre: "h264_nvenc", esGpu: true,
    args: (c) => ["-preset", c === "max" ? "p7" : "p4", "-rc", "constqp",
                  "-qp", c === "max" ? "16" : "20"] },
  { nombre: "h264_qsv",   esGpu: true,
    args: (c) => ["-global_quality", c === "max" ? "16" : "22"] },
  { nombre: "libx264",    esGpu: false,
    args: (c) => ["-preset", c === "max" ? "slow" : "veryfast",
                  "-crf", c === "max" ? "16" : "20"] },
];

/** Encodea 1 frame de verdad. Es la unica forma honesta de saber si anda. */
export function probarEncoder(nombre) {
  return new Promise((resolve) => {
    const p = spawn("ffmpeg", [
      "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=1:duration=1",
      "-frames:v", "1", "-c:v", nombre, "-f", "null", "-",
    ]);
    p.on("error", () => resolve(false));
    p.on("close", (code) => resolve(code === 0));
  });
}

export async function elegirEncoder({ forzar, calidad = "rapido" } = {}) {
  if (forzar) {
    const e = ENCODERS.find((x) => x.nombre === forzar);
    if (!e) throw new Error(`El encoder "${forzar}" no esta disponible.`);
    if (!(await probarEncoder(forzar)))
      throw new Error(`El encoder "${forzar}" no funciona en esta maquina.`);
    return { nombre: e.nombre, esGpu: e.esGpu, args: e.args(calidad) };
  }
  for (const e of ENCODERS) {
    if (await probarEncoder(e.nombre))
      return { nombre: e.nombre, esGpu: e.esGpu, args: e.args(calidad) };
  }
  throw new Error("Ningun encoder de video funciona en esta maquina. Revisa la instalacion de ffmpeg.");
}
