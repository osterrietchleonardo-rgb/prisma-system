// Marketing IA · Lo que el servidor le sella al modelo en el texto de un post.
//
// POR QUE EXISTE: hasta el 16-sep-2026 al modelo se le pedia "desarrollo" como un texto suelto
// y salia un bloque de 89 palabras sin un salto de linea ni un emoji (copy_drafts 30b0f771, del
// 10-sep). Pegado en Meta se lee como un ladrillo. Ahora se le pide una LISTA de parrafos, que
// es algo que el servidor puede contar; un "pone renglones en blanco" adentro del prompt no se
// puede verificar, y ese error ya se pago caro con el tamano de las placas (ver formatos.ts).
//
// Y los emojis se limitan ACA y no en el prompt, por la misma razon.

/**
 * Los emojis de verdad, sin llevarse puestos los simbolos tipograficos.
 *
 * Matchea secuencias COMPLETAS de emojis (base + selector de variación + modificador de tono +
 * cadenas ZWJ), no puntos de código individuales. Por qué: un emoji comido a mitad (por ej. si
 * solo capturamos el U+26A0 de ⚠️ y dejamos el U+FE0F) llega a un renderer de placa como un
 * U+FE0F huérfano, se dibuja como .notdef (nada), y queda un fantasma invisible en el HTML.
 *
 * `\p{Extended_Pictographic}` agarra los pictogramas (🏡 🔑 ⚠️) pero NO agarra el guion largo,
 * las comillas, el simbolo de grado ni el ² de "45 m²", que Inter si sabe dibujar y que el copy
 * inmobiliario usa todo el tiempo.
 */
const EMOJI = /\p{Extended_Pictographic}(️|\p{Emoji_Modifier}|⃣)?(‍\p{Extended_Pictographic}️?)*/gu;

/** Deja el texto sin un solo emoji. Lo que va dibujado sobre la placa pasa siempre por acá. */
export function sinEmojis(texto: string): string {
  return (texto || "").replace(EMOJI, "").replace(/\s+/g, " ").trim();
}

/**
 * Como mucho un emoji por parrafo, y se conserva el ULTIMO.
 *
 * El ultimo es el de la posicion que se busca: el ejemplo que mando Maximiliano tiene el emoji
 * cerrando el parrafo, nunca en el medio de la frase.
 */
export function unEmojiPorParrafo(parrafo: string): string {
  const encontrados = (parrafo || "").match(EMOJI);
  if (!encontrados || encontrados.length <= 1) return (parrafo || "").trim();

  const ultimo = encontrados[encontrados.length - 1];
  let vistos = 0;
  const total = encontrados.length;
  const limpio = parrafo.replace(EMOJI, (m) => {
    vistos++;
    return vistos === total ? m : "";
  });
  // El reemplazo puede dejar espacios dobles donde habia un emoji en el medio.
  return limpio.replace(/\s+/g, " ").trim() || ultimo;
}

/**
 * Convierte lo que devolvio el modelo en el campo `desarrollo` de siempre.
 *
 * Acepta un string por las dudas: la forma de `copy_drafts.content` no cambia, y si algun dia el
 * modelo vuelve a mandar un bloque suelto la app tiene que seguir funcionando.
 */
export function armarDesarrollo(parrafos: unknown): string {
  if (typeof parrafos === "string") return parrafos.trim();
  if (!Array.isArray(parrafos)) return "";

  return parrafos
    .map((p) => (typeof p === "string" ? unEmojiPorParrafo(p) : ""))
    .filter((p) => p.length > 0)
    .join("\n\n");
}

/** Cuantos parrafos tiene un desarrollo ya armado. Es lo que mide la prueba de regresion. */
export function contarParrafos(desarrollo: string): number {
  return (desarrollo || "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0).length;
}
