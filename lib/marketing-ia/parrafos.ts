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
 * Tres familias:
 *
 * 1. EMOJIS DE TECLA (keycaps): `1️⃣` `#️⃣` `*️⃣`. La base es ASCII (dígito, #, *), así que
 *    Extended_Pictographic no los agarra y el U+FE0F + U+20E3 llegan a la placa como invisibles.
 *    "3️⃣ razones para invertir" es un titular plausible.
 *
 * 2. BANDERAS: Dos regional indicators (p.ej. 🇦🇷 = U+1F1E6 U+1F1F7). Extended_Pictographic
 *    tampoco las ve. "Invertí en Argentina 🇦🇷" es común en la red.
 *
 * 3. SECUENCIAS GENERALES (extended pictographics con variantes): base + selector de variación +
 *    modificador de tono + cadenas ZWJ. Un emoji comido a mitad (p.ej. solo U+26A0 de ⚠️, dejando
 *    el U+FE0F) se dibuja como .notdef invisible.
 *
 * EXCEPCIÓN: ©®™ se preservan. Medido contra la fuente Inter incrustada (515 glifos): existen
 * como copyright, registered, trademark. Pero ★ NO existe en Inter, así que se saca.
 *
 * CRÍTICO: Esta es la ÚNICA línea del repo cuyo trabajo es sacar caracteres invisibles. Los
 * invisibles (U+FE0F, U+20E3, U+200D) y las marcas (©®™) se escriben SOLO con escapes \uXXXX
 * y \xXX, nunca como caracteres literales. Por qué: una re-guardada en otro encoding o un paste
 * por un canal con pérdida corrompe los literales sin dejar rastro visible en el diff.
 */
const EMOJI = /[0-9#*]\uFE0F?\u20E3|[\u{1F1E6}-\u{1F1FF}]{2}|(?![\xA9\xAE\u2122])\p{Extended_Pictographic}(\uFE0F|\p{Emoji_Modifier}|\u20E3)?(\u200D\p{Extended_Pictographic}\uFE0F?)*/gu;

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

/**
 * Las reglas de forma del texto de un post, en un solo lugar.
 *
 * Viven acá y no adentro de cada ruta porque hasta el 16-sep-2026 habia DOS prompts que decian
 * cosas distintas —generate-copy pedia "3-5 parrafos cortos" y generate-batch no pedia nada— y
 * solo corria el que no pedia nada. Un solo texto compartido hace imposible que vuelvan a
 * separarse.
 */
export const REGLAS_POST = `FORMA DEL TEXTO (esto se pega tal cual en Instagram y Facebook):
- "parrafos" es una LISTA de 6 a 8 párrafos. Cada párrafo, de 1 a 3 renglones. Nunca un bloque largo.
- Emoji: como mucho UNO al final de ALGUNOS párrafos, jamás en todos y jamás en el medio de una frase. Es un remate visual, no una decoración.
- El "hook" va SIN emoji: se dibuja adentro de la placa y ahí los emojis no existen.
- El "cta" sí puede cerrar con un emoji.`;

/**
 * Lo que devuelve el modelo, convertido a lo que se guarda en `copy_drafts.content`.
 *
 * Sale SIEMPRE con la forma {hook, desarrollo, cta}: la base y la pantalla ya leen eso, y los
 * borradores viejos tienen que seguir abriéndose.
 */
export function sellarContenidoPost(content: any): any {
  // Un guion de video NO se sella: su contenido son bloques, no párrafos. Si alguna vez alguien
  // mueve esta llamada fuera del `else` del copy_type, sin esto el guion se convertiría en
  // {hook, desarrollo: "", cta: ""} y el asesor se quedaría con un teleprompter vacío, sin
  // ningún error. Las rutas ya llaman a esto solo en la rama de post; esto es el cinturón.
  if (Array.isArray((content as any)?.bloques)) return content;

  return {
    // EN LA IMAGEN NO VA NINGUN EMOJI (Leonardo, 16-sep-2026). El hook es lo que se dibuja
    // sobre la placa, asi que se limpia acá y no se confia en que el modelo obedezca.
    hook: sinEmojis(content?.hook ?? ""),
    desarrollo: armarDesarrollo(content?.parrafos ?? content?.desarrollo),
    cta: (content?.cta ?? "").trim(),
  };
}
