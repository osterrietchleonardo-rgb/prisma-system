// Espejo de lib/admin-vakdor/marketing/voz.ts en la app: si cambia uno, cambian los dos.
// El diseño descansa en sincronización manual; mantenlos juntos.

/**
 * Canon de voz del motor de contenido. La fuente de verdad del CONTENIDO
 * (canon, estructuras, escenas) es la tabla `marketing_recursos`; acá vive
 * el fallback mínimo y toda la lógica pura que no depende de la base.
 */

/**
 * Set conocido. NO es un validador: si lo fuera, una estructura insertada en la base
 * se descartaria en silencio. La validacion real la hace `claveValida` contra las
 * claves activas de la base, para que ampliar el banco sea SQL y no codigo.
 */
export const CLAVES_ESTRUCTURA = [
  "confesion", "concesion_vuelta", "escena_campo", "contraste",
  "autopsia", "mito_realidad", "carta_director", "numero_duele",
  "framework_pasos",
]

export const CLAVES_COMENTARIO = [
  "dato_crudo", "opinion_filosa", "matiz", "micro_caso", "pregunta_binaria",
]

export const CLAVES_PROPOSITO = [
  "convencer", "ensenar", "mostrar_detras", "probar_con_dato", "reflexionar",
]

export const MOMENTOS = ["dolor", "intento_fallido", "resuelto"]

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
export const MULETILLAS = [
  "en un mundo donde", "hoy más que nunca", "la realidad es que",
  "el secreto está en", "imaginá por un momento",
  "y acá está la clave", "spoiler", "déjame decirte", "aprovechar al máximo",
  "revolucionar", "potenciar", "sinergia", "qué opinás",
]

function normalizar(texto) {
  return texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

export function detectarMuletillas(texto) {
  const plano = normalizar(texto)
  return MULETILLAS.filter((m) => plano.includes(normalizar(m)))
}

export function instruccionCta(etapa) {
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

/**
 * Cada etapa del embudo tira de un momento distinto de la escena. Antes las tres
 * sorteaban de la misma bolsa de dolor y BOFU improvisaba el "asi se ve resuelto".
 */
export function momentoDeEtapa(etapa) {
  switch (etapa) {
    case "tofu": return "dolor"
    case "mofu": return "intento_fallido"
    case "bofu": return "resuelto"
    default: return "intento_fallido"
  }
}

/**
 * El proposito NO dicta la forma: restringe que estructuras pueden sortearse.
 * Si el filtro deja el pool vacio devuelve todas — una estructura menos afin es
 * mejor que ninguna, y bloquear la generacion no es una opcion.
 */
export function estructurasCompatibles(estructuras, proposito) {
  if (!proposito) return estructuras
  const afines = estructuras.filter((e) => (e.propositos ?? []).includes(proposito))
  return afines.length ? afines : estructuras
}

/** Valida una clave contra las que existen HOY en la base, no contra una lista de codigo. */
export function claveValida(claves, candidata) {
  if (typeof candidata !== "string") return null
  const limpia = candidata.trim().toLowerCase()
  return claves.includes(limpia) ? limpia : null
}

/**
 * `detalle` es el texto que vive en la fila de marketing_recursos. Si no viene (o viene
 * vacio) se cae al texto de aca, con el mismo criterio de falla suave que canonDeVoz.
 */
export function instruccionComentario(clave, etapa, detalle) {
  const cuerpos = {
    dato_crudo: "Un número real del negocio con el contexto que lo hace doler. No pidas nada. Dos o tres líneas.",
    opinion_filosa: "Una postura más dura que la del post, que el post no se animó a decir. Controversia sobre el negocio, nunca agravio a personas.",
    matiz: 'La excepción honesta: "esto no aplica si...". Demostrá que conocés los bordes del problema.',
    micro_caso: "La escena contada en tres líneas, sin moraleja ni cierre. Que el lector saque la conclusión.",
    pregunta_binaria: 'Una pregunta de dos opciones concretas del negocio. PROHIBIDO "¿y vos qué opinás?" y cualquier variante genérica.',
  }
  const cuerpo = (detalle ?? "").trim() || cuerpos[clave]
  const link = etapa === "bofu"
    ? "Al final, en una línea aparte, el link: https://vakdor.com/demostracion"
    : "Sin links."
  return `PRIMER COMENTARIO (tipo: ${clave}). ${cuerpo} ${link}`
}

export const RUBRICA = [
  "La primera línea es una escena o situación concreta, no una tesis abstracta.",
  "Hay una posición: se afirma algo que alguien podría discutir.",
  "Hay un giro (concesión y vuelta, o expectativa rota).",
  "Hay al menos dos detalles específicos (una hora, un día, un número, un tipo de propiedad, un plazo).",
  "No repite la apertura ni el argumento central de las piezas anteriores.",
  "El CTA corresponde a la etapa del embudo y el link está donde corresponde.",
  "No usa muletillas de IA.",
]

export function promptRevision(texto, etapa, hooksPrevios) {
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
