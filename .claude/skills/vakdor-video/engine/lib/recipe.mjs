import fs from "node:fs";
import path from "node:path";
import { FORMATOS } from "./reframe.mjs";
import { PRESETS_COLOR } from "./grade.mjs";

export const RECETA_DEFAULT = {
  formato: "16:9",
  estilo: "autoridad",
  calidad: "auto",
  corte: { db: -30, min: 0.6, pad: 0.15 },
  // Default deliberado: "como salio de la camara, un poco mejor". El grade `natural`
  // no baja el brillo ni pone viñeta (ver lib/grade.mjs: `cinematic` cerraba a la
  // mitad el lado de la cara donde no da la luz), y la calidad la aporta la limpieza
  // `suave`, que esta MEDIDA con VMAF sobre video recomprimido tipo red social
  // (+6 puntos, ver lib/enhance.mjs) en vez de ser una impresion.
  grade: { preset: "natural", vignette: null },
  limpieza: "suave",
  // "auto": si el video viene en HDR (celular moderno), se lo baja a SDR antes de
  // gradear. "no" apaga esa conversion — solo para probar, porque sin ella un HDR
  // sale oscuro y amarillento (ver lib/hdr.mjs).
  hdr: "auto",
  subtitulos: { modo: "karaoke", posicion: "inferior" },
  camara: [],
  fx: [],
  broll: [],
};

const ESTILOS = ["autoridad", "dinamico", "demo"];
const MODOS_HDR = ["auto", "no"];
// Exportada: studio.mjs la reusa para validar --calidad ANTES de que el valor
// pisado por CLI llegue a construirGrafo/componer (que ya no lo revalidan).
export const CALIDADES = ["auto", "max", "rapido"];
const MODOS_SUBS = ["karaoke", "premium", "simple", "no"];

/** Saca acentos y pasa a minusculas, para que el anclaje no falle por tipeo. */
const normalizar = (s) =>
  String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]/gu, "");

function resolverTiempo(item, palabras, avisos, etiqueta) {
  if (typeof item.t === "number") return item.t;
  if (!item.palabra) {
    avisos.push(`Un efecto de ${etiqueta} no tiene ni "t" ni "palabra". Lo salteo.`);
    return null;
  }
  const buscada = normalizar(item.palabra);
  const cuales = palabras.filter((p) => normalizar(p.texto) === buscada);
  const n = item.ocurrencia ?? 1;
  if (!Number.isInteger(n) || n < 1) {
    avisos.push(
      `La ocurrencia "${item.ocurrencia}" pedida para la palabra "${item.palabra}" no es valida (tiene que ser un numero entero de 1 en adelante). Salteo ese efecto de ${etiqueta}.`
    );
    return null;
  }
  if (cuales.length < n) {
    avisos.push(
      cuales.length === 0
        ? `No encontre la palabra "${item.palabra}" en lo que decis. Salteo ese efecto de ${etiqueta}.`
        : `La palabra "${item.palabra}" aparece ${cuales.length} vez/veces, pediste la numero ${n}. Salteo ese efecto.`
    );
    return null;
  }
  return cuales[n - 1].inicioSec;
}

// Exportada: studio.mjs necesita leer el bloque `corte` de la receta ANTES de tener
// la duracion post-corte (que a su vez necesita para llamar a `cargarReceta` completo),
// asi que lee el JSON crudo por su cuenta con esta misma funcion en vez de duplicar el
// parseo (y su mensaje de error) a mano.
export function cargarJsonDeArchivo(ruta) {
  const texto = fs.readFileSync(ruta, "utf8");
  try {
    return JSON.parse(texto);
  } catch (e) {
    throw new Error(`La receta "${ruta}" tiene un error de formato en el JSON: ${e.message}`);
  }
}

export function cargarReceta(origen, { durationSec, palabras = [] }) {
  const cruda = typeof origen === "string"
    ? cargarJsonDeArchivo(origen)
    : (origen ?? {});
  const baseDir = typeof origen === "string" ? path.dirname(origen) : process.cwd();

  const receta = {
    ...RECETA_DEFAULT, ...cruda,
    corte: { ...RECETA_DEFAULT.corte, ...(cruda.corte ?? {}) },
    grade: { ...RECETA_DEFAULT.grade, ...(cruda.grade ?? {}) },
    subtitulos: { ...RECETA_DEFAULT.subtitulos, ...(cruda.subtitulos ?? {}) },
  };
  const avisos = [];

  // --- Errores duros: no tiene sentido renderizar y descubrirlo al final ---
  if (!FORMATOS[receta.formato])
    throw new Error(`El formato "${receta.formato}" no existe. Validos: ${Object.keys(FORMATOS).join(", ")}.`);
  if (!ESTILOS.includes(receta.estilo))
    throw new Error(`El estilo "${receta.estilo}" no existe. Validos: ${ESTILOS.join(", ")}.`);
  if (!CALIDADES.includes(receta.calidad))
    throw new Error(`La calidad "${receta.calidad}" no existe. Validas: ${CALIDADES.join(", ")}.`);
  if (!MODOS_HDR.includes(receta.hdr))
    throw new Error(`El modo de HDR "${receta.hdr}" no existe. Validos: ${MODOS_HDR.join(", ")}.`);
  if (!MODOS_SUBS.includes(receta.subtitulos.modo))
    throw new Error(`El modo de subtitulos "${receta.subtitulos.modo}" no existe. Validos: ${MODOS_SUBS.join(", ")}.`);
  // "ninguno" es vocabulario valido de la receta (sin grade): filtroDeColor ya lo maneja devolviendo cadena vacia.
  if (receta.grade.preset && receta.grade.preset !== "ninguno" && !PRESETS_COLOR[receta.grade.preset])
    throw new Error(`El preset de color "${receta.grade.preset}" no existe. Validos: ${Object.keys(PRESETS_COLOR).join(", ")}.`);

  for (const b of receta.broll) {
    const ruta = path.isAbsolute(b.src) ? b.src : path.join(baseDir, b.src);
    if (!fs.existsSync(ruta)) throw new Error(`El b-roll no existe: ${ruta}`);
    b.src = ruta;
  }

  // --- Avisos: se saltea el efecto, el render sigue ---
  const resolverLista = (lista, etiqueta) =>
    lista.map((item) => {
      const t = resolverTiempo(item, palabras, avisos, etiqueta);
      if (t === null) return null;
      if (t < 0 || t > durationSec) {
        avisos.push(`El efecto de ${etiqueta} en el segundo ${t} cae fuera del video (dura ${durationSec.toFixed(1)}s). Lo salteo.`);
        return null;
      }
      return { ...item, t };
    }).filter(Boolean).sort((a, b) => a.t - b.t);

  receta.camara = resolverLista(receta.camara, "camara");
  receta.fx = resolverLista(receta.fx, "efectos");
  receta.broll = resolverLista(receta.broll, "b-roll");

  return { receta, avisos };
}
