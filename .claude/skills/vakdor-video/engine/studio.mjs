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
import { createHash } from "node:crypto";
import { probe } from "./lib/probe.mjs";
import { cargarReceta, CALIDADES, RECETA_DEFAULT, cargarJsonDeArchivo } from "./lib/recipe.mjs";
import { construirGrafo, componer } from "./lib/compose.mjs";
import { elegirEncoder } from "./lib/encoder.mjs";
import { FORMATOS } from "./lib/reframe.mjs";
import { cortarConCache } from "./lib/cut.mjs";
import { transcribirConCache } from "./lib/transcribe.mjs";
import { NIVELES_LIMPIEZA, estabilizar } from "./lib/enhance.mjs";

// Nombre de la carpeta de cache del corte/transcripcion, siempre al lado del --out.
const CACHE_DIRNAME = ".studio-cache";

/**
 * Clave deterministica para el cache de corte/transcripcion: combina la ruta resuelta
 * del archivo, su mtime (si el archivo de origen cambia, la clave cambia sola — no hace
 * falta invalidar nada a mano) y cualquier parametro extra que afecte el resultado (los
 * de corte: db/min/pad; el idioma de transcripcion). A proposito NO es un randomUUID: acá
 * se necesita la MISMA clave entre corridas para poder reusar, lo opuesto de lib/cut.mjs
 * y lib/enhance.mjs (esos SI usan randomUUID, porque sus temporales nunca se reusan).
 */
function claveDeCache(archivo, extra = "") {
  const st = fs.statSync(archivo);
  const firma = `${path.resolve(archivo)}|${st.mtimeMs}|${extra}`;
  return createHash("sha1").update(firma).digest("hex").slice(0, 16);
}

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
    console.error("Uso: node studio.mjs --in=crudo.mp4 --out=final.mp4 [--receta=receta.json] [--check] [--preview=SEG] [--sin-corte] [--srt=archivo.srt] [--limpiar=suave|normal|fuerte] [--estabilizar] [--rehacer]");
    process.exit(1);
  }
  if (args.srt && !fs.existsSync(args.srt)) {
    console.error(`No existe el archivo de subtitulos: ${args.srt}`);
    process.exit(1);
  }

  const infoOriginal = await probe(args.in);
  console.log(`Entrada: ${path.basename(args.in)} — ${infoOriginal.width}x${infoOriginal.height} @ ${infoOriginal.fps}fps, ${infoOriginal.durationSec.toFixed(1)}s`);

  // El bloque "corte" de la receta se lee ACA, antes de cortar, con el parser crudo de
  // recipe.mjs (no el `cargarReceta` completo: ese todavia no puede correr porque
  // necesita la duracion POST-corte). Si no se lee aca, un `"corte": {"pad": 0.3}` en el
  // receta.json queda escrito pero nunca llega a `cortarSilencios` — un control que
  // aparenta existir y no hace nada.
  const crudaReceta = args.receta ? args.receta : {};
  const recetaCruda = typeof crudaReceta === "string" ? cargarJsonDeArchivo(crudaReceta) : crudaReceta;
  const corteCfg = { ...RECETA_DEFAULT.corte, ...(recetaCruda.corte ?? {}) };
  const paramsCorte = `db=${corteCfg.db}, min=${corteCfg.min}s, pad=${corteCfg.pad}s`;
  const cacheDir = path.join(path.dirname(args.out), CACHE_DIRNAME);

  // Temporales EFIMEROS (estabilizacion, preview): se borran SIEMPRE en el finally de
  // abajo, exito o error. El corte y la transcripcion NO entran aca cuando van al cache
  // (mas abajo): esos tienen que SOBREVIVIR a esta corrida para que la proxima corrida
  // los pueda reusar. --rehacer los ignora, pero los vuelve a escribir en el MISMO
  // lugar (no crea basura nueva, solo pisa lo que ya habia).
  const temporales = [];
  try {
    // --check es una validacion rapida y gratuita de la receta: nunca corta ni
    // transcribe (cortar tarda, transcribir pega a una API que cuesta plata).
    let entradaTrabajo = args.in;
    let info = infoOriginal;
    let palabras = [];
    let estabilizado = false;

    if (!args.check) {
      // --- Paso 0: estabilizar (si se pide) ---
      // Corre ANTES que todo lo demas (incluso antes de cortar silencios): vidstab
      // necesita analizar el archivo entero de una sola pasada, y el resto del
      // pipeline (corte, transcripcion, compose) tiene que trabajar ya sobre el
      // video estabilizado, no sobre el crudo con temblor. Por eso el corte se
      // cachea por el contenido de `entradaTrabajo` en ESE momento (ya estabilizado
      // si corresponde), no por `args.in`: si no, --estabilizar reusaria por error
      // un corte hecho sobre el video SIN estabilizar.
      if (args.estabilizar) {
        const salidaEstab = path.join(path.dirname(args.out), `.studio-estab-${process.pid}-${Date.now()}.mp4`);
        temporales.push(salidaEstab);
        const re = await estabilizar({ entrada: entradaTrabajo, salida: salidaEstab });
        entradaTrabajo = re.salida;
        estabilizado = true;
        console.log("Estabilizacion: aplicada (vidstab, 2 pasadas).");
      } else {
        console.log("Estabilizacion: no.");
      }

      // --- Paso 1: sacar silencios (con cache atomico + lock entre procesos) ---
      if (args["sin-corte"]) {
        console.log("Corte: salteado (--sin-corte).");
      } else {
        fs.mkdirSync(cacheDir, { recursive: true });
        const claveCorte = claveDeCache(entradaTrabajo, `${corteCfg.db}|${corteCfg.min}|${corteCfg.pad}`);
        const salidaCache = path.join(cacheDir, `corte-${claveCorte}.mp4`);
        const lockCorte = path.join(cacheDir, `.lock-corte-${claveCorte}`);

        const resultado = await cortarConCache({
          entrada: entradaTrabajo, salidaCache, lockPath: lockCorte,
          db: corteCfg.db, min: corteCfg.min, pad: corteCfg.pad, rehacer: Boolean(args.rehacer),
        });
        entradaTrabajo = resultado.salida;
        // Si no se publico (tramos fallidos), el resultado sigue siendo un archivo
        // valido para ESTA corrida, pero es efimero: no queda en el cache para la
        // proxima, asi que se limpia como cualquier otro temporal.
        if (!resultado.publicado) temporales.push(resultado.salida);
        info = await probe(entradaTrabajo);

        if (resultado.yaEstaba) {
          console.log(`Corte: reusando el corte de una corrida anterior (cache). Duracion: ${(info.durationSec / 60).toFixed(1)} min. Parametros: ${paramsCorte}.`);
        } else {
          const rc = resultado.rc;
          const antesMin = infoOriginal.durationSec / 60;
          const despuesMin = rc.duracionFinal / 60;
          // Math.max(0, ...): el re-encode del corte puede dar una duracion final
          // MICROSCOPICAMENTE mas larga que la original (redondeo de frames), lo que
          // sin este clamp mostraba un confuso "-0.0 min de silencios" en clips sin
          // silencio real.
          const minutosDeSilencio = Math.max(0, antesMin - despuesMin);
          console.log(`Corte: de ${antesMin.toFixed(1)} min a ${despuesMin.toFixed(1)} min (${minutosDeSilencio.toFixed(1)} min de silencios). Parametros: ${paramsCorte}.`);

          // Un tramo que fallo al recortar desaparece del video final: eso NO puede
          // pasar sin que quede bien visible en el reporte (footage perdido en
          // silencio es peor que un corte que tarda mas o que falla entero).
          if (rc.tramosFallidos.length) {
            const segsPerdidos = rc.tramosFallidos.reduce((a, t) => a + (t.hasta - t.desde), 0);
            console.log(`AVISO: ${rc.tramosFallidos.length} tramo(s) de corte FALLARON y se perdieron del video final (~${segsPerdidos.toFixed(1)}s de metraje). Revisa el video de origen en esos rangos:`);
            for (const t of rc.tramosFallidos) {
              const ultimaLinea = t.error.split("\n").filter(Boolean).slice(-1)[0] || t.error;
              console.log(`  - ${t.desde.toFixed(1)}s a ${t.hasta.toFixed(1)}s: ${ultimaLinea}`);
            }
            // Sin esto, la PRIMERA corrida avisa el problema y CUALQUIER corrida
            // siguiente reusaria en silencio ese mismo archivo con footage perdido
            // (cortarConCache ya decidio no publicarlo — esta linea explica por que).
            console.log("AVISO: por los tramos fallidos, este corte NO se guarda en el cache. La proxima corrida va a volver a cortar de cero (no va a reusar un video con footage perdido).");
          }
        }
      }

      // --- Paso 2: transcribir (para anclar efectos a la palabra hablada; con cache
      // atomico + lock entre procesos, mismo mecanismo que el corte) ---
      if (args.srt) {
        console.log(`Transcripcion: se usa el SRT provisto (${args.srt}). ADVERTENCIA: un .srt no trae tiempos por palabra, asi que esta corrida queda SIN anclaje por palabra.`);
      } else if (process.env.GROQ_API_KEY) {
        fs.mkdirSync(cacheDir, { recursive: true });
        const clavePalabras = claveDeCache(entradaTrabajo, "palabras-es");
        const palabrasCache = path.join(cacheDir, `palabras-${clavePalabras}.json`);
        const lockPalabras = path.join(cacheDir, `.lock-palabras-${clavePalabras}`);

        const resultado = await transcribirConCache({
          entrada: entradaTrabajo, palabrasCache, lockPath: lockPalabras,
          apiKey: process.env.GROQ_API_KEY, idioma: "es", rehacer: Boolean(args.rehacer),
        });
        palabras = resultado.palabras;
        console.log(resultado.yaEstaba
          ? `Transcripcion: reusando la transcripcion de una corrida anterior (cache). ${palabras.length} palabras.`
          : (palabras.length
              ? `Transcripcion: ${palabras.length} palabras.`
              : "Transcripcion: Groq no devolvio tiempos por palabra. Sigo sin anclaje por palabra."));
      } else {
        console.log("Transcripcion: no hay GROQ_API_KEY. Sigo sin transcribir y sin anclaje por palabra (pasa --srt o definila).");
      }
    }

    const { receta, avisos } = cargarReceta(crudaReceta, { durationSec: info.durationSec, palabras });
    if (args.formato) receta.formato = args.formato;
    if (args.calidad) receta.calidad = args.calidad;
    if (args.limpiar) receta.limpieza = args.limpiar;

    // cargarReceta valida formato/calidad ANTES de que --formato/--calidad los
    // pisen. Si no se revalida aca, un typo como --formato=9x16 llega crudo a
    // construirGrafo (que revienta con un TypeError de JS, sin decir cual es el
    // problema) y un typo como --calidad=turbo no revienta nunca: se vuelve
    // "rapido" en silencio y el reporte final no lo menciona. Mismo trato para
    // --limpiar: NIVELES_LIMPIEZA no la conoce "cargarReceta" (no es parte de su
    // esquema), asi que "no" es valido ademas de los 3 niveles.
    if (!FORMATOS[receta.formato])
      throw new Error(`El formato "${receta.formato}" no existe. Validos: ${Object.keys(FORMATOS).join(", ")}.`);
    if (!CALIDADES.includes(receta.calidad))
      throw new Error(`La calidad "${receta.calidad}" no existe. Validas: ${CALIDADES.join(", ")}.`);
    if (receta.limpieza && receta.limpieza !== "no" && !NIVELES_LIMPIEZA[receta.limpieza])
      throw new Error(`El nivel de limpieza "${receta.limpieza}" no existe. Validos: ${Object.keys(NIVELES_LIMPIEZA).join(", ")}, no.`);

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
      // --check no corta ni transcribe (es una validacion rapida y gratuita, no un
      // render), asi que no puede prometer mas certeza de la que tiene: la duracion
      // usada aca es la del video SIN cortar, y el anclaje por palabra nunca se
      // resuelve. Esto tiene que quedar dicho en criollo, no dado por sabido — es
      // el texto que lee alguien no tecnico para decidir si su receta esta bien.
      console.log("\nAviso de --check: esta validacion se hizo SIN cortar silencios y SIN transcribir.");
      console.log(`  - La duracion usada fue la del video ORIGINAL (${infoOriginal.durationSec.toFixed(1)}s), no la del video final (que va a ser mas corto si hay silencios). Un efecto que valida bien aca podria caer fuera del video final una vez que se corten los silencios de verdad.`);
      console.log("  - No se transcribio: cualquier efecto anclado por PALABRA figura aca como \"no encontrado\", aunque una corrida real (sin --check) probablemente lo resuelva.");
      console.log("\n--check: la receta es valida y el grafo se puede construir. No renderice nada.");
      return;
    }

    let entrada = entradaTrabajo, recorte = null;
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
          "-ss", String(saltoRapido), "-i", entradaTrabajo,
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
        reportarFinal({ args, r, receta, recetaEfectiva, avisos: todosLosAvisos, recorte, estabilizado });
      } finally {
        // Se borra siempre, incluso si el corte o el render fallaron a mitad de camino:
        // un preview no tiene que dejar basura en la carpeta de salida.
        fs.rmSync(tmp, { force: true });
      }
      return;
    }

    const r = await componer({ entrada, salida: args.out, receta: recetaEfectiva, info: infoEfectiva, encoder });
    reportarFinal({ args, r, receta, recetaEfectiva, avisos: todosLosAvisos, recorte, estabilizado });
  } finally {
    for (const f of temporales) fs.rmSync(f, { force: true });
  }
}

/** Imprime el reporte final. Cada numero se calcula por separado: nunca se
 * mezclan avisos de camara/efectos/b-roll bajo una sola cuenta ambigua, y los
 * efectos que quedaron afuera de la ventana de preview se cuentan aparte de
 * los avisos de la receta (son cosas distintas, con causas distintas). */
function reportarFinal({ args, r, receta, recetaEfectiva, avisos, recorte, estabilizado }) {
  console.log(`\nListo: ${args.out}`);
  console.log(`Tardo ${r.segundos.toFixed(1)} segundos con el encoder ${r.encoder}.`);

  const limpieza = receta.limpieza && receta.limpieza !== "no" ? receta.limpieza : "no";
  console.log(`Limpieza: ${limpieza}. Estabilizacion: ${estabilizado ? "si" : "no"}.`);

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
