import { hookRepetido } from "./similitud.mjs";
import { detectarMuletillas, promptRevision } from "./voz.mjs";

const primeraLinea = (texto) => (texto || "").split("\n").map((l) => l.trim()).find((l) => l) ?? "";

/** Chequeos que no cuestan una llamada a la API. */
export function chequeosLocales(texto, hooksPrevios) {
  const fallos = [];
  const rep = hookRepetido(primeraLinea(texto), hooksPrevios);
  if (rep.repetido) fallos.push(`5: la apertura se parece demasiado a una ya publicada ("${rep.contra}")`);
  const muletillas = detectarMuletillas(texto);
  if (muletillas.length) fallos.push(`7: muletillas de IA detectadas: ${muletillas.join(", ")}`);
  return fallos;
}

/** El dominio del link de la demostración. En BOFU va SOLO en el primer comentario; en TOFU/MOFU no va. */
const DOMINIO_LINK = "vakdor.com";

/**
 * Chequeo determinista del criterio 6 (CTA por etapa del embudo). Es la mitad de la regla que el
 * juez NO puede ver: a `revisar` le llega solo el cuerpo, y dónde va el link se decide entre el
 * cuerpo y el primer comentario.
 *
 * `primerComentario` puede venir null/undefined/"" (pieza sin comentario todavía): en ese caso se
 * juzga solo el cuerpo, no se inventa un fallo por algo que no existe.
 *
 * OJO con la redacción de los fallos: alimentan el prompt de reescritura, que reescribe SOLO el
 * cuerpo. Por eso los fallos del comentario dicen explícitamente que el comentario se edita aparte
 * — si no, el modelo "corrige" metiendo el link en el cuerpo, que es justo lo que no queremos.
 */
export function chequeoCta(etapa, cuerpo, primerComentario) {
  const fallos = [];
  const enCuerpo = (cuerpo || "").toLowerCase().includes(DOMINIO_LINK);
  const hayComentario = typeof primerComentario === "string" && primerComentario.trim() !== "";
  const enComentario = hayComentario && primerComentario.toLowerCase().includes(DOMINIO_LINK);

  if (etapa === "bofu") {
    if (enCuerpo) {
      fallos.push(`6: el cuerpo lleva un link a ${DOMINIO_LINK} y en BOFU el link va SOLO en el primer comentario (LinkedIn baja el alcance de los posts con link externo). Sacá el link del cuerpo.`);
    }
    if (hayComentario && !enComentario) {
      fallos.push(`6: el primer comentario (se edita aparte, NO es parte de la PIEZA que estás reescribiendo) no lleva el link https://vakdor.com/demostracion, que en BOFU es obligatorio ahí. NO agregues el link al cuerpo.`);
    }
  } else {
    const ETAPA = String(etapa ?? "").toUpperCase();
    if (enCuerpo) {
      fallos.push(`6: en ${ETAPA} la pieza no lleva ningún link y el cuerpo tiene uno a ${DOMINIO_LINK}. Sacalo.`);
    }
    if (enComentario) {
      fallos.push(`6: en ${ETAPA} la pieza no lleva ningún link y el primer comentario (se edita aparte, NO es parte de la PIEZA que estás reescribiendo) tiene uno a ${DOMINIO_LINK}. No toques el cuerpo por esto.`);
    }
  }
  return fallos;
}

/** Falla suave: si el veredicto no parsea, se aprueba y se sigue con los chequeos locales. */
export function parsearVeredicto(raw) {
  try {
    const m = (raw || "").match(/\{[\s\S]*\}/);
    if (!m) return { aprobado: true, fallos: [] };
    const p = JSON.parse(m[0]);
    return { aprobado: p.aprobado !== false, fallos: Array.isArray(p.fallos) ? p.fallos : [] };
  } catch {
    return { aprobado: true, fallos: [] };
  }
}

/**
 * Defensa contra el modelo citando su propia reescritura: el prompt de reescritura marca
 * el texto de entrada con delimitadores `"""`, y a veces el modelo los ecoa en la respuesta
 * como si la estuviera citando. Saca una línea `"""` inicial/final (y las líneas en blanco
 * pegadas al borde) sin tocar nada del contenido real.
 */
export function limpiarComillasEnvolventes(texto) {
  const lineas = (texto || "").split("\n");
  while (lineas.length && lineas[0].trim() === "") lineas.shift();
  if (lineas.length && lineas[0].trim() === '"""') {
    lineas.shift();
    while (lineas.length && lineas[0].trim() === "") lineas.shift();
  }
  while (lineas.length && lineas[lineas.length - 1].trim() === "") lineas.pop();
  if (lineas.length && lineas[lineas.length - 1].trim() === '"""') {
    lineas.pop();
    while (lineas.length && lineas[lineas.length - 1].trim() === "") lineas.pop();
  }
  return lineas.join("\n").trim();
}

/**
 * Piso de longitud de una reescritura respecto del texto que reemplaza. Una pieza cortada por
 * `max_tokens` vuelve a medio escribir: no es falsy, así que sin este piso pisa silenciosamente
 * a una pieza completa. 0.6 deja margen para una reescritura legítimamente más apretada.
 */
export const PISO_REESCRITURA = 0.6;

/**
 * ¿La reescritura sirve para reemplazar al original? Se evalúa DESPUÉS de sanear, porque el
 * saneo es justamente lo que puede dejarla vacía (una respuesta que es solo `"""` sobrevive al
 * `|| texto` porque no es falsy, y recién `limpiarComillasEnvolventes` la reduce a "").
 */
export function reescrituraUsable(original, reescrito) {
  const nuevo = (reescrito || "").trim();
  if (!nuevo) return { usable: false, motivo: "quedó vacía después de sanear" };
  const previo = (original || "").trim();
  const piso = Math.floor(previo.length * PISO_REESCRITURA);
  if (nuevo.length < piso) {
    return { usable: false, motivo: `demasiado corta: ${nuevo.length} car contra un piso de ${piso} (el original tenía ${previo.length})` };
  }
  return { usable: true, motivo: null };
}

/**
 * `llamar(prompt)` hace la llamada al modelo. Máximo UNA reescritura:
 * la revisión señala fallos, no reescribe el texto entero en loop.
 *
 * Regla dura: una reescritura solo pisa al original si es usable. Si la llamada falla (p.ej.
 * `llamar` tira por `stop_reason: "max_tokens"`), si vuelve vacía, o si vuelve mutilada, se
 * conserva el texto original y queda registrado en `reescrituraDescartada`.
 */
export async function revisar(llamar, texto, etapa, hooksPrevios, primerComentario, { keyword } = {}) {
  const fallos = [
    ...chequeosLocales(texto, hooksPrevios),
    ...chequeoCta(etapa, texto, primerComentario),
  ];
  const veredicto = parsearVeredicto(await llamar(promptRevision(texto, etapa, hooksPrevios, { keyword })));
  if (!veredicto.aprobado) fallos.push(...veredicto.fallos);

  if (fallos.length === 0) return { texto, aprobado: true, reintentos: 0, fallos: [], reescrituraDescartada: false };

  const conservarOriginal = (motivo) => {
    console.error(`[revision] reescritura descartada (${motivo}) — se conserva el texto original`);
    return { texto, aprobado: false, reintentos: 1, fallos, reescrituraDescartada: true };
  };

  let corregido;
  try {
    corregido = await llamar([
      `Reescribí esta pieza corrigiendo SOLO los fallos listados. Mantené el argumento y la extensión.`,
      `FALLOS:\n${fallos.map((f) => `- ${f}`).join("\n")}`,
      `PIEZA:\n"""\n${texto}\n"""`,
      `Devolvé SOLO la pieza corregida, sin explicaciones. No envuelvas la respuesta entre comillas triples ni ningún otro delimitador: las comillas triples de arriba marcan dónde empieza y termina el texto de ENTRADA, no deben aparecer en tu respuesta.`,
    ].join("\n\n"));
  } catch (e) {
    return conservarOriginal(`la llamada falló: ${e.message}`);
  }

  const limpio = limpiarComillasEnvolventes((corregido || "").trim());
  const chequeo = reescrituraUsable(texto, limpio);
  if (!chequeo.usable) return conservarOriginal(chequeo.motivo);

  return { texto: limpio, aprobado: false, reintentos: 1, fallos, reescrituraDescartada: false };
}
