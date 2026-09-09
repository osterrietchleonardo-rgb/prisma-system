/**
 * Decidir si dos direcciones escritas a mano son la misma propiedad.
 *
 * Hace falta porque las direcciones de las actividades son texto libre y cada
 * asesor escribe como quiere: "ESPINOSA 3166 - CABA", "Espinosa 3166",
 * "espinosa 3166 caba". Comparar por igualdad no encuentra nunca nada.
 *
 * Se usa para avisarle al segundo asesor que carga una punta que otro ya cargó
 * un cierre en esa dirección, así las dos filas quedan enlazadas y la operación
 * no se cuenta dos veces en el volumen.
 *
 * La precisión importa MÁS que la cobertura, y por una razón concreta: el aviso
 * que ve el asesor es a ciegas (no le decimos quién ni cuándo, para no abrirle
 * los cierres de sus compañeros). Con menos información para juzgar, un falso
 * positivo es más peligroso que un falso negativo: enlazar dos ventas distintas
 * hace desaparecer plata del volumen. Perder un enlace solo deja el volumen
 * inflado, que además el director puede corregir después.
 *
 * Por eso la regla es doble: se parecen en el texto Y comparten al menos un
 * número exacto.
 */

/**
 * Deja la dirección comparable: sin acentos, sin mayúsculas, sin puntuación y
 * sin espacios de más. "ESPINOSA 3166 - CABA" → "espinosa 3166 caba".
 */
export function normalizarDireccion(texto: string | null | undefined): string {
  if (!texto) return "";
  return texto
    .normalize("NFD")
    // Saca los acentos: NFD separa la marca diacrítica de la letra, y `\p{M}`
    // son justamente esas marcas sueltas. Escrito así y no como un rango de
    // caracteres literales, que en el editor se ven como nada y se pierden al
    // copiar el archivo.
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    // Cualquier cosa que no sea letra o número pasa a ser un espacio: así
    // "2450 5B", "2450-5B" y "2450, 5b" terminan iguales.
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Los números que aparecen en la dirección: la altura, el piso, el
 * departamento. "espinosa 3166 caba" → ["3166"].
 *
 * Son la parte que de verdad identifica una propiedad. Dos direcciones de la
 * misma calle sin un número en común no son la misma casa.
 */
export function numerosDe(texto: string | null | undefined): string[] {
  const normalizado = normalizarDireccion(texto);
  return normalizado.match(/\d+/g) ?? [];
}

/**
 * Cuán parecidos son dos textos ya normalizados, de 0 a 1, comparando por
 * grupos de tres caracteres (la misma idea que el `pg_trgm` de Postgres, pero
 * acá porque el volumen de cierres de una inmobiliaria es chico y conviene
 * poder probarlo sin base de datos).
 */
function similitud(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const trigramas = (s: string): Set<string> => {
    const conBordes = `  ${s} `;
    const set = new Set<string>();
    for (let i = 0; i < conBordes.length - 2; i++) set.add(conBordes.slice(i, i + 3));
    return set;
  };

  const ta = trigramas(a);
  const tb = trigramas(b);
  let comunes = 0;
  for (const t of ta) if (tb.has(t)) comunes++;
  // Jaccard: los que comparten sobre el total de los distintos.
  return comunes / (ta.size + tb.size - comunes);
}

/**
 * Las "unidades" de una dirección ya normalizada: los pedazos que mezclan
 * número y letra, como "5b", "8a" o "3d". Son el departamento, y distinguen dos
 * propiedades que comparten todo lo demás.
 *
 * Un "pb" no cuenta (no tiene número) ni un "2450" suelto (no tiene letra): esos
 * ya los cubren los otros dos filtros.
 */
export function unidadesDe(textoNormalizado: string): string[] {
  return textoNormalizado
    .split(" ")
    .filter((t) => /\d/.test(t) && /[a-z]/.test(t));
}

/** Debajo de esto dos textos no se consideran la misma dirección. */
const SIMILITUD_MINIMA = 0.45;

/**
 * Cuántos caracteres tiene que haber escrito el asesor para que valga la pena
 * buscar. Con menos, cualquier cosa se parece a cualquier cosa — y además evita
 * que alguien escriba una letra y vaya tanteando hasta descubrir en qué
 * direcciones cerró un compañero.
 */
export const MINIMO_PARA_BUSCAR = 6;

/**
 * Si dos direcciones escritas a mano son, con confianza razonable, la misma
 * propiedad.
 */
export function direccionesCoinciden(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const na = normalizarDireccion(a);
  const nb = normalizarDireccion(b);
  if (na.length < MINIMO_PARA_BUSCAR || nb.length < MINIMO_PARA_BUSCAR) return false;

  // Primer filtro, y el que hace casi todo el trabajo: los números.
  //
  // No alcanza con que compartan alguno. "Av. Cordoba 2450 5B" y
  // "Av. Cordoba 2450 8A" comparten el 2450 y como texto son casi idénticas,
  // pero son dos departamentos distintos del mismo edificio: enlazarlos haría
  // desaparecer una venta entera del volumen. Y es justo el caso que el asesor
  // NO puede detectar, porque el aviso que ve no le dice cuál es la otra.
  //
  // La regla que sí funciona: los números de una tienen que estar TODOS en la
  // otra. Así "Av. Cordoba 2450" (alguien que no escribió el piso) sigue
  // coincidiendo con "Av. Cordoba 2450 5B", pero 5B y 8A se rechazan entre sí.
  const numerosA = new Set(numerosDe(a));
  const numerosB = new Set(numerosDe(b));

  if (numerosA.size === 0 && numerosB.size === 0) {
    // Ninguna tiene números: una casa con nombre, un barrio. Decide el texto.
  } else if (numerosA.size === 0 || numerosB.size === 0) {
    // Una tiene y la otra no: falta justamente el dato que identifica.
    return false;
  } else {
    const [chico, grande] = numerosA.size <= numerosB.size ? [numerosA, numerosB] : [numerosB, numerosA];
    for (const n of chico) if (!grande.has(n)) return false;
  }

  // Segundo filtro: la unidad. Un "5B" y un "5A" del mismo edificio tienen los
  // mismos números (2450 y 5) y un texto casi idéntico, así que los dos filtros
  // que rodean a este los dejarían pasar. Son dos departamentos distintos.
  //
  // Si una de las dos no escribió la unidad, no se rechaza: falta el dato, no
  // se contradice. Eso lo confirma la persona.
  const unidadesA = unidadesDe(na);
  const unidadesB = unidadesDe(nb);
  if (unidadesA.length > 0 && unidadesB.length > 0) {
    const compartenUnidad = unidadesA.some((u) => unidadesB.includes(u));
    if (!compartenUnidad) return false;
  }

  // Tercer filtro: el texto tiene que parecerse. Comparten el 3166 pero una
  // dice "Espinosa" y la otra "Rivadavia"? No es la misma.
  return similitud(na, nb) >= SIMILITUD_MINIMA;
}

/**
 * Si alguno de los textos donde puede estar escrita la dirección de una
 * actividad coincide con lo que el asesor está escribiendo.
 *
 * Son dos: la referencia en texto (que también se autocompleta cuando se elige
 * una propiedad de Tokko) y la propiedad en colaboración, que es donde queda la
 * dirección cuando la propiedad es de otra inmobiliaria.
 */
export function actividadCoincideConDireccion(
  actividad: { propiedad_ref?: string | null; metadata?: { propiedad_colaboracion?: unknown } | null },
  direccion: string
): boolean {
  const colaboracion = actividad.metadata?.propiedad_colaboracion;
  const candidatos = [
    actividad.propiedad_ref,
    typeof colaboracion === "string" ? colaboracion : null,
  ];
  return candidatos.some((c) => direccionesCoinciden(c, direccion));
}
