#!/usr/bin/env node
/**
 * studio.mjs — el comando unico del Vakdor Video Studio.
 *
 *   node studio.mjs --in=crudo.mp4 --out=final.mp4 --receta=receta.json
 *   node studio.mjs --in=crudo.mp4 --out=final.mp4 --check
 *   node studio.mjs --in=crudo.mp4 --out=final.mp4 --preview=125
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { probe } from "./lib/probe.mjs";
import { cargarReceta, CALIDADES } from "./lib/recipe.mjs";
import { construirGrafo, componer } from "./lib/compose.mjs";
import { elegirEncoder } from "./lib/encoder.mjs";
import { FORMATOS } from "./lib/reframe.mjs";

export function parsearArgs(argv) {
  return Object.fromEntries(argv.map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true];
  }));
}

const VENTANA_PREVIEW = 20;
// Margen del "seek rapido": el primer -ss (antes de -i) salta cerca del punto
// pedido, al keyframe mas cercano ANTERIOR (rapido, sin decodificar); el segundo
// -ss (despues de -i) decodifica el resto para llegar EXACTO al segundo pedido.
// Sin el segundo -ss, "-ss + -c copy" corta en ese keyframe anterior, no en el
// punto pedido, y como los efectos de camara se corren por el punto pedido
// (no por donde arranco de verdad el archivo), quedaban desfasados.
const MARGEN_SEEK_RAPIDO = 5;

async function main() {
  const args = parsearArgs(process.argv.slice(2));
  if (!args.in || !args.out) {
    console.error("Uso: node studio.mjs --in=crudo.mp4 --out=final.mp4 [--receta=receta.json] [--check] [--preview=SEG]");
    process.exit(1);
  }

  const info = await probe(args.in);
  console.log(`Entrada: ${path.basename(args.in)} — ${info.width}x${info.height} @ ${info.fps}fps, ${info.durationSec.toFixed(1)}s`);

  const crudaReceta = args.receta ? args.receta : {};
  const { receta, avisos } = cargarReceta(crudaReceta, { durationSec: info.durationSec, palabras: [] });
  if (args.formato) receta.formato = args.formato;
  if (args.calidad) receta.calidad = args.calidad;

  // cargarReceta valida formato/calidad ANTES de que --formato/--calidad los
  // pisen. Si no se revalida aca, un typo como --formato=9x16 llega crudo a
  // construirGrafo (que revienta con un TypeError de JS, sin decir cual es el
  // problema) y un typo como --calidad=turbo no revienta nunca: se vuelve
  // "rapido" en silencio y el reporte final no lo menciona.
  if (!FORMATOS[receta.formato])
    throw new Error(`El formato "${receta.formato}" no existe. Validos: ${Object.keys(FORMATOS).join(", ")}.`);
  if (!CALIDADES.includes(receta.calidad))
    throw new Error(`La calidad "${receta.calidad}" no existe. Validas: ${CALIDADES.join(", ")}.`);

  const { filtroVideo, tramos, multiplicador, avisos: avisosGrafo } = construirGrafo({ receta, info });
  const todosLosAvisos = [...avisos, ...avisosGrafo];
  console.log(`Receta: formato ${receta.formato}, estilo ${receta.estilo}, color ${receta.grade.preset}`);
  console.log(`Grafo: ${tramos.length} tramo(s), sobre-muestreo ${multiplicador}x`);
  if (process.env.STUDIO_DEBUG) console.log(filtroVideo);

  if (todosLosAvisos.length) {
    console.log("\nAvisos:");
    for (const a of todosLosAvisos) console.log(`  - ${a}`);
  }

  if (args.check) {
    console.log("\n--check: la receta es valida y el grafo se puede construir. No renderice nada.");
    return;
  }

  let entrada = args.in, recorte = null;
  if (args.preview !== undefined) {
    const centro = Number(args.preview) || 0;
    const desde = Math.max(0, centro - VENTANA_PREVIEW / 2);
    recorte = { desde, dur: Math.min(VENTANA_PREVIEW, info.durationSec - desde) };
    console.log(`\nPreview: ${recorte.desde.toFixed(1)}s a ${(recorte.desde + recorte.dur).toFixed(1)}s`);
  }

  const encoder = await elegirEncoder({
    forzar: typeof args.encoder === "string" ? args.encoder : undefined,
    calidad: receta.calidad === "max" ? "max" : "rapido",
  });
  console.log(`Encoder: ${encoder.nombre}${encoder.esGpu ? " (GPU)" : " (CPU)"}`);

  const infoEfectiva = recorte ? { ...info, durationSec: recorte.dur } : info;
  const recetaEfectiva = recorte
    ? { ...receta,
        camara: receta.camara.filter((c) => c.t >= recorte.desde && c.t < recorte.desde + recorte.dur)
                             .map((c) => ({ ...c, t: c.t - recorte.desde })) }
    : receta;

  if (recorte) {
    const tmp = path.join(path.dirname(args.out), `.preview-fuente-${process.pid}-${Date.now()}.mp4`);
    try {
      const saltoRapido = Math.max(0, recorte.desde - MARGEN_SEEK_RAPIDO);
      const saltoFino = recorte.desde - saltoRapido;
      // Reencodeo corto (solo la ventana pedida) en vez de "-c copy": asi el
      // recorte arranca exacto donde se pide y el corrimiento de los efectos
      // de camara cae exacto, no aproximado al keyframe mas cercano.
      const corte = spawnSync("ffmpeg", [
        "-y", "-v", "error",
        "-ss", String(saltoRapido), "-i", args.in,
        "-ss", String(saltoFino), "-t", String(recorte.dur),
        "-map", "0:v:0", "-map", "0:a?",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac",
        tmp,
      ], { encoding: "utf8" });
      if (corte.status !== 0) {
        const detalle = corte.error ? corte.error.message : corte.stderr;
        throw new Error(`No pude recortar la ventana de preview: ${detalle}`);
      }
      entrada = tmp;

      const r = await componer({ entrada, salida: args.out, receta: recetaEfectiva, info: infoEfectiva, encoder });
      reportarFinal({ args, r, receta, recetaEfectiva, avisos: todosLosAvisos, recorte });
    } finally {
      // Se borra siempre, incluso si el corte o el render fallaron a mitad de camino:
      // un preview no tiene que dejar basura en la carpeta de salida.
      fs.rmSync(tmp, { force: true });
    }
    return;
  }

  const r = await componer({ entrada, salida: args.out, receta: recetaEfectiva, info: infoEfectiva, encoder });
  reportarFinal({ args, r, receta, recetaEfectiva, avisos: todosLosAvisos, recorte });
}

/** Imprime el reporte final. Cada numero se calcula por separado: nunca se
 * mezclan avisos de camara/efectos/b-roll bajo una sola cuenta ambigua, y los
 * efectos que quedaron afuera de la ventana de preview se cuentan aparte de
 * los avisos de la receta (son cosas distintas, con causas distintas). */
function reportarFinal({ args, r, receta, recetaEfectiva, avisos, recorte }) {
  console.log(`\nListo: ${args.out}`);
  console.log(`Tardo ${r.segundos.toFixed(1)} segundos con el encoder ${r.encoder}.`);

  const aplicados = recetaEfectiva.camara.length;
  const fueraDeVentana = recorte ? receta.camara.length - recetaEfectiva.camara.length : 0;
  const detalleVentana = recorte ? ` Fuera de la ventana de preview (no se aplicaron): ${fueraDeVentana}.` : "";
  console.log(`Efectos de camara aplicados: ${aplicados}.${detalleVentana}`);
  // "Avisos totales" cubre la receta COMPLETA (camara + efectos + b-roll: lo que
  // valida cargarReceta) mas los que agrega construirGrafo (camara tapada por
  // otro movimiento). Esta fase solo RENDERIZA los de camara, por eso se aclara:
  // que la receta tenga avisos de efectos/b-roll no significa que se hayan aplicado.
  console.log(`Avisos totales de la receta: ${avisos.length} (esta fase solo aplica los movimientos de camara).`);
}

// Guard de punto de entrada: `studio.mjs` se importa desde el test para probar
// `parsearArgs` sin ejecutar nada (asi lo pide el brief). Sin este guard, un
// simple `import { parsearArgs } from "../studio.mjs"` dispara `main()` con el
// argv del proceso que esta importando (p.ej. el test runner) y lo mata con
// `process.exit(1)` apenas falta --in/--out.
const esPuntoDeEntrada = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (esPuntoDeEntrada) {
  main().catch((e) => { console.error(`\nError: ${e.message}`); process.exit(1); });
}
