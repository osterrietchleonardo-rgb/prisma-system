/**
 * Canon de voz del motor de contenido. La fuente de verdad del CONTENIDO
 * (canon, estructuras, escenas) es la tabla `marketing_recursos`; acá vive
 * el fallback mínimo y toda la lógica pura que no depende de la base.
 */

export type EtapaEmbudo = "tofu" | "mofu" | "bofu"

export type ClaveEstructura =
  | "confesion" | "concesion_vuelta" | "escena_campo" | "contraste"
  | "autopsia" | "mito_realidad" | "carta_director" | "numero_duele"

export type ClaveComentario =
  | "dato_crudo" | "opinion_filosa" | "matiz" | "micro_caso" | "pregunta_binaria"

export const CLAVES_ESTRUCTURA: readonly ClaveEstructura[] = [
  "confesion", "concesion_vuelta", "escena_campo", "contraste",
  "autopsia", "mito_realidad", "carta_director", "numero_duele",
] as const

export const CLAVES_COMENTARIO: readonly ClaveComentario[] = [
  "dato_crudo", "opinion_filosa", "matiz", "micro_caso", "pregunta_binaria",
] as const

/** Se usa solo si la tabla marketing_recursos está vacía o no responde. */
export const CANON_FALLBACK = `Escribís como alguien que está adentro del rubro inmobiliario.
1. Abrí con una escena concreta, nunca con una tesis abstracta.
2. Tomá posición: afirmá algo que alguien podría discutir.
3. Concedele la razón al lector y ahí dala vuelta.
4. Podés hablar desde el campo ("hablo con directores que me dicen..."), pero NUNCA inventes cifras ni casos con nombre.
5. Meté al menos dos detalles específicos: una hora, un día, un plazo, un tipo de propiedad.
6. Cerrá en la consecuencia, no en un pedido.
Español rioplatense natural. Segunda persona. Cero emojis. Viñetas con •.`

/**
 * Muletillas de IA. OJO: la fórmula "X no es Y" NO está y no debe agregarse
 * nunca — es la del post de mayor rendimiento histórico de Vakdor
 * ("Automatizar no es poner un bot", 3.280 impresiones).
 */
export const MULETILLAS: readonly string[] = [
  "en un mundo donde", "hoy más que nunca", "la realidad es que",
  "el secreto está en", "imaginá por un momento",
  "y acá está la clave", "spoiler", "déjame decirte", "aprovechar al máximo",
  "revolucionar", "potenciar", "sinergia", "qué opinás",
] as const

function normalizar(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

export function detectarMuletillas(texto: string): string[] {
  const plano = normalizar(texto)
  return MULETILLAS.filter((m) => plano.includes(normalizar(m)))
}

export function instruccionCta(etapa: EtapaEmbudo): string {
  switch (etapa) {
    case "tofu":
      return `CIERRE (TOFU · descubrimiento): el objetivo es que tome conciencia del problema.
No nombres el producto ni la empresa. No pidas reunión, no mandes a ningún lado.
Cerrá en la consecuencia de no hacer nada, o en una pregunta que lo deje pensando.
Sin links, ni en el cuerpo ni en el comentario.`
    case "mofu":
      return `CIERRE (MOFU · nutrición): el objetivo es que entienda el MECANISMO.
Explicá cómo se resuelve y por qué ese enfoque: sistematizar el conocimiento y los procesos (Método P-R-I-S-M-A).
Podés nombrar PRISMA como el camino, sin cierre agresivo y sin pedir reunión.
Sin links, ni en el cuerpo ni en el comentario.`
    case "bofu":
      return `CIERRE (BOFU · decisión): el objetivo es que vea la demostración.
Cerrá contando QUÉ va a ver en el video y QUÉ duda le resuelve, con una línea del estilo "lo mostré entero en el video de la demostración".
El link https://vakdor.com/demostracion va SOLO en el primer comentario, nunca en el cuerpo del post (LinkedIn baja el alcance de los posts con link externo).
Urgencia sin ruego: no supliques la visita.`
  }
}

export function instruccionComentario(clave: ClaveComentario, etapa: EtapaEmbudo): string {
  const cuerpos: Record<ClaveComentario, string> = {
    dato_crudo: "Un número real del negocio con el contexto que lo hace doler. No pidas nada. Dos o tres líneas.",
    opinion_filosa: "Una postura más dura que la del post, que el post no se animó a decir. Controversia sobre el negocio, nunca agravio a personas.",
    matiz: 'La excepción honesta: "esto no aplica si...". Demostrá que conocés los bordes del problema.',
    micro_caso: "La escena contada en tres líneas, sin moraleja ni cierre. Que el lector saque la conclusión.",
    pregunta_binaria: 'Una pregunta de dos opciones concretas del negocio. PROHIBIDO "¿y vos qué opinás?" y cualquier variante genérica.',
  }
  const link = etapa === "bofu"
    ? "Al final, en una línea aparte, el link: https://vakdor.com/demostracion"
    : "Sin links."
  return `PRIMER COMENTARIO (tipo: ${clave}). ${cuerpos[clave]} ${link}`
}

export const RUBRICA: readonly string[] = [
  "La primera línea es una escena o situación concreta, no una tesis abstracta.",
  "Hay una posición: se afirma algo que alguien podría discutir.",
  "Hay un giro (concesión y vuelta, o expectativa rota).",
  "Hay al menos dos detalles específicos (una hora, un día, un número, un tipo de propiedad, un plazo).",
  "No repite la apertura ni el argumento central de las piezas anteriores.",
  "El CTA corresponde a la etapa del embudo y el link está donde corresponde.",
  "No usa muletillas de IA.",
] as const

export function promptRevision(texto: string, etapa: EtapaEmbudo, hooksPrevios: string[]): string {
  return [
    `Sos el editor. Evaluá esta pieza (etapa del embudo: ${etapa.toUpperCase()}) contra la rúbrica.`,
    `RÚBRICA:\n${RUBRICA.map((r, i) => `${i + 1}. ${r}`).join("\n")}`,
    // Sin esto, el criterio 6 le pedía al juez que evaluara una regla que nunca le dijimos: la
    // instrucción de CTA por etapa iba solo al prompt de escritura. Acá va la hoja de respuestas.
    `REGLA DE CIERRE DE ESTA ETAPA (es la respuesta del criterio 6):\n${instruccionCta(etapa)}`,
    `Para el criterio 6 juzgá SOLO el cuerpo: el primer comentario no está incluido en la PIEZA y se revisa aparte. Que no haya link en el cuerpo NO es un fallo.`,
    hooksPrevios.length ? `APERTURAS YA USADAS (no puede parecerse a ninguna):\n${hooksPrevios.map((h) => `- ${h}`).join("\n")}` : "",
    `PIEZA:\n"""\n${texto}\n"""`,
    `Devolvé SOLO JSON: {"aprobado": true|false, "fallos": ["<nro de criterio>: <qué falla y en qué línea>"]}`,
    `Sé estricto con el criterio 1: si la primera línea es una generalidad, no aprueba.`,
  ].filter(Boolean).join("\n\n")
}
