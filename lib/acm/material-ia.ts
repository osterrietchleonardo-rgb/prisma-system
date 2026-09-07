// ─────────────────────────────────────────────────────────────────────────────
// ACM · Los prompts que reparten el material de la agencia en las cuatro secciones,
// y el parseo de lo que devuelve la IA. Las dos reglas duras viven acá:
//   1. Si no encuentra material para una sección, la deja VACÍA. Nunca inventa.
//   2. Siempre responde en español rioplatense (hay material en inglés).
// ─────────────────────────────────────────────────────────────────────────────

import { SECCIONES, TOPES, type AcmSecciones, type ClaveSeccion } from "./material";

function seccionesVacias(): AcmSecciones {
  return { quienes_somos: "", como_comercializamos: "", como_preparar: "", roles_venta: "" };
}

const CATALOGO = SECCIONES.map(
  (s) => `- "${s.clave}" — ${s.titulo}. ${s.ayuda} Máximo ${s.tope} caracteres.`,
).join("\n");

export function promptReparto(textos: string[]): string {
  const material = textos
    .map((t, i) => `─── ARCHIVO ${i + 1} ───\n${t}`)
    .join("\n\n");

  return `Sos el asistente de una inmobiliaria. Recibís el texto de los documentos institucionales que la agencia le entrega a sus propietarios. Tu tarea es repartir ESE contenido en cuatro secciones que van a imprimirse dentro del informe de valuación (ACM) que recibe el dueño de la propiedad.

Las cuatro secciones son fijas:
${CATALOGO}

REGLAS QUE NO SE NEGOCIAN:
1. NO INVENTES. Si el material no dice nada sobre una sección, devolvé esa sección VACÍA (""). Es preferible una sección vacía a una sección verosímil pero falsa: este documento lo lee un propietario que va a tomar una decisión de dinero.
2. Escribí SIEMPRE en español rioplatense (vos, no tú), aunque el material original esté en inglés.
3. No copies datos de contacto, direcciones, teléfonos ni nombres de personas: la ficha ya los pone por su cuenta.
4. Hablale al propietario de usted o de vos, con frases cortas. Nada de mayúsculas sostenidas ni signos de exclamación.
5. Respetá el máximo de caracteres de cada sección.

Devolvé ÚNICAMENTE un JSON con esta forma, sin texto alrededor y sin backticks:
{"quienes_somos":"...","como_comercializamos":"...","como_preparar":"...","roles_venta":"..."}

MATERIAL:
${material}`;
}

export function promptAcomodar(clave: ClaveSeccion, texto: string): string {
  const meta = SECCIONES.find((s) => s.clave === clave)!;

  return `Sos el asistente de una inmobiliaria. El director escribió a mano el texto de la sección "${meta.titulo}", que se imprime dentro del informe de valuación que recibe el propietario. Acomodalo para que se lea bien.

REGLAS QUE NO SE NEGOCIAN:
1. NO AGREGUES información que él no haya escrito. No sumes servicios, cifras, premios ni promesas. Solo ordenás y redactás lo que ya está.
2. Español rioplatense, frases cortas, tono profesional y cercano.
3. Nada de mayúsculas sostenidas ni signos de exclamación.
4. Máximo ${meta.tope} caracteres.

Devolvé ÚNICAMENTE un JSON, sin backticks: {"texto":"..."}

TEXTO DEL DIRECTOR:
${texto}`;
}

/** Saca los backticks y se queda con el objeto JSON, que es como suele venir la respuesta. */
function aObjeto(respuesta: string): Record<string, unknown> | null {
  const limpio = respuesta.replace(/```json|```/g, "").trim();
  const desde = limpio.indexOf("{");
  const hasta = limpio.lastIndexOf("}");
  if (desde < 0 || hasta <= desde) return null;
  try {
    const parsed = JSON.parse(limpio.slice(desde, hasta + 1));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Una respuesta que no se entiende devuelve las cuatro secciones vacías, nunca una excepción:
 * el director ve que no salió nada y vuelve a intentar, en vez de una pantalla rota.
 */
export function parsearReparto(respuesta: string): AcmSecciones {
  const obj = aObjeto(respuesta);
  const out = seccionesVacias();
  if (!obj) return out;

  for (const s of SECCIONES) {
    const v = obj[s.clave];
    if (typeof v === "string") out[s.clave] = v.trim().slice(0, s.tope);
  }
  return out;
}

export function parsearAcomodado(respuesta: string, clave: ClaveSeccion): string {
  const obj = aObjeto(respuesta);
  const crudo = obj && typeof obj.texto === "string" ? obj.texto : respuesta;
  return crudo.replace(/```json|```/g, "").trim().slice(0, TOPES[clave]);
}
