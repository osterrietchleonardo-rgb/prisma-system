// ============================================================================
// mercado-sync/plan.mjs — el plan de gasto de Apify, en un solo lugar
//
// Apify se cobra por aviso devuelto (US$ 0,001 con memo23/zonaprop-scraper, el
// más barato del mercado: los otros cobran US$ 0,0075 a 0,01). El presupuesto es
// de US$ 100 por mes; pasarse obliga a saltar de plan. Medido el 15-sep-2026:
//
//   descubrimiento diario (CABA publica 1.277-1.543/día) .. US$ 42-46/mes
//   refresco de las 48 zonas, TODAS cada mes ............... ~67.000 avisos = US$ 67
//   verificación de bajas ................................. ~US$ 8
//                                                            ----------------------
//                                                            ~US$ 120/mes → NO ENTRA
//
// El descubrimiento no se puede achicar sin perder avisos: son los que se
// publican, y hay que pagarlos una vez. Lo que sí se puede es no pagarlos DOS.
// Medido el 8-sep (corrida de las 11:19 AR): trajo 1.182 publicados el día
// anterior + 315 de ese mismo día; esos 315 se vuelven a pagar al día siguiente.
// Por eso el descubrimiento corre a la medianoche argentina: la repetición baja
// de ~300 avisos por día a casi nada (~US$ 10/mes).
//
// Y el refresco se parte en dos turnos (abajo): cada mes se relee la mitad de la
// ciudad, así que TODO CABA queda al día cada 2 meses y ningún barrio queda
// afuera. Resultado: ~US$ 79/mes (descubrimiento ~42 + turno ~33 + verificación
// ~4), con la guardia de `hayPresupuesto` frenando antes de tocar el techo.
//
// PENDIENTE que puede cambiar todo esto (16-sep): ZonaProp publica un sitemap
// GRATIS que lista avisos uno por uno con `lastmod` (fecha de modificación).
// Bajado y medido: 48.785 avisos con fechas de los últimos 8 días, y de 300
// cruzados con la base, 26 estaban publicados hace más de un mes pero figuran
// modificados esta semana. SI esa fecha es confiable, el refresco pasa de releer
// 67.000 avisos (US$ 67) a releer solo los que cambiaron (~US$ 1,40) y entonces
// se puede refrescar TODO todos los meses, o todas las semanas. Falta probarlo:
// releer 200 avisos con lastmod nuevo y 200 con lastmod viejo (US$ 0,40) y ver
// cuáles cambiaron de verdad. Dos avisos: el sitemap NO es el censo completo del
// portal (~100.000 de ~700.000), así que la ausencia NO prueba que se vendió; y
// el portal bloquea (403) si se le piden muchas páginas seguidas.
// ============================================================================

/**
 * LAS 48 ZONAS DE CABA, EN DOS TURNOS PAREJOS por inventario (33.458 y 33.454
 * avisos al 15-sep-2026). Cada mes corre uno: ningún barrio queda afuera y
 * TODOS se releen cada 2 meses, incluidos los de la cartera del cliente.
 *
 * Decisión de Leonardo (16-sep), sobre la alternativa de refrescar los 7 barrios
 * del cliente todos los meses y el resto cada 3: prefirió que no quede ningún
 * barrio sin actualizar. Sale más barato, además (~US$ 79 contra ~US$ 89).
 *
 * Es una red de seguridad, no la última palabra: si la prueba del sitemap de
 * ZonaProp sale bien (ver el comentario de arriba), el refresco pasa a costar
 * centavos y esto se revisa entero.
 */
export const ZONAS_POR_TURNO = [
  [
    'balvanera', 'barracas', 'boedo', 'caballito', 'chacarita', 'colegiales',
    'constitucion', 'flores', 'floresta', 'monserrat', 'monte-castro',
    'nueva-pompeya', 'nunez', 'palermo', 'parque-avellaneda', 'parque-chacabuco',
    'parque-chas', 'san-cristobal', 'san-telmo', 'velez-sarsfield', 'versalles',
    'villa-lugano', 'villa-ortuzar', 'villa-riachuelo',
  ],
  [
    'agronomia', 'almagro', 'belgrano', 'coghlan', 'la-boca', 'la-paternal',
    'liniers', 'mataderos', 'parque-patricios', 'puerto-madero', 'recoleta',
    'retiro', 'saavedra', 'san-nicolas', 'villa-crespo', 'villa-del-parque',
    'villa-devoto', 'villa-general-mitre', 'villa-luro', 'villa-pueyrredon',
    'villa-real', 'villa-santa-rita', 'villa-soldati', 'villa-urquiza',
  ],
]

/**
 * Fuera de CABA o con otro tipo de propiedad: llevan su propio slug de búsqueda
 * porque el default `departamentos-venta-<zona>` no aplica. Son chicas (Don
 * Torcuato: 141 avisos ≈ US$ 0,14), así que van todos los meses.
 */
export const ZONAS_EXTRA = [
  { zona: 'don-torcuato', base: 'terrenos-venta-don-torcuato', hasta: 60 },
]

/**
 * El cajón de los huérfanos. ZonaProp escribe barrios que no son ninguna de las
 * 48 zonas: Barrio Norte (134), Centro / Microcentro (109), Once (47), Congreso
 * (34), Abasto (20), Tribunales (18)… 608 avisos al 15-sep (0,9% de la base) que
 * NADIE verificaba, así que podían estar vendidos y seguir figurando como
 * disponibles. No se refrescan (no hay slug de búsqueda que los traiga), pero se
 * verifican todos los meses.
 */
export const ZONA_SIN_BARRIO = 'otros-sin-zona'

/**
 * Cuando el barrio de la base no se escribe igual que la zona. La zona manda: a
 * la izquierda el slug de la zona, a la derecha cómo puede venir escrito.
 */
const ALIAS = {
  'nueva-pompeya': ['Pompeya', 'Nueva Pompeya'],
  'villa-general-mitre': ['Villa Gral. Mitre', 'Villa General Mitre'],
}

const TECHO_PAGINAS_CABA = 220   // el techo de paginación de ZonaProp es ~210; el barrido corta solo al agotar el inventario

/** Todas las zonas que el plan conoce (las de CABA más las de afuera). */
function zonasConocidas() {
  return new Set([
    ...ZONAS_POR_TURNO.flat(),
    ...ZONAS_EXTRA.map((e) => e.zona), ZONA_SIN_BARRIO,
  ])
}

/** Nombre de barrio → texto comparable: sin acentos, sin mayúsculas, sin puntuación. */
export function slugDeBarrio(barrio) {
  if (!barrio) return ''
  return String(barrio)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** A qué zona pertenece un barrio de la base, o null si no es de ninguna. */
function zonaDeBarrio(barrio) {
  const s = slugDeBarrio(barrio)
  if (!s) return null
  for (const [zona, nombres] of Object.entries(ALIAS)) {
    if (nombres.some((n) => slugDeBarrio(n) === s)) return zona
  }
  return zonasConocidas().has(s) ? s : null
}

/**
 * Qué barrios de la base le tocan a una zona.
 *
 * Antes esto era una tabla escrita a mano con SIETE barrios dentro de
 * verificacion.mjs: para las otras 41 zonas el script cortaba con error y las
 * bajas no se marcaban en casi toda CABA (al 15-sep: 70.129 avisos "activos",
 * 0 caídos en la última semana). Ahora sale de los nombres reales de la base.
 *
 * Una zona que la base todavía no conoce devuelve lista vacía (no hay nada que
 * verificar). Una zona que no está en ningún grupo es un error: significa que
 * alguien la agregó al workflow y se olvidó del plan.
 */
export function barriosDeZona(zona, barriosDeLaBase) {
  if (!zonasConocidas().has(zona)) {
    throw new Error(`zona desconocida: ${zona} (agregarla a un grupo en mercado-sync/plan.mjs)`)
  }
  const limpios = (barriosDeLaBase || []).filter((b) => typeof b === 'string' && b.trim())
  if (zona === ZONA_SIN_BARRIO) return limpios.filter((b) => zonaDeBarrio(b) === null)
  return limpios.filter((b) => zonaDeBarrio(b) === zona)
}

/** Día calendario en hora de Argentina (UTC-3), que es con la que publica ZonaProp. */
function diaAR(fecha) {
  const t = fecha instanceof Date ? fecha : new Date(fecha)
  return Math.floor((t.getTime() - 3 * 3600000) / 86400000)
}

/**
 * Cuántos días hacia atrás pedirle al actor.
 *
 * La ventana del actor NO son días completos hacia atrás: medido el 8-sep, una
 * corrida con ventana 2 trajo 1.182 avisos publicados el día anterior y 315 del
 * propio día. Es "el día anterior entero + lo que va de hoy". Por eso 2 es el
 * PISO: con 1 se perdería todo lo que ZonaProp publique después de la corrida.
 *
 * Lo que sube la ventana a 3 es que FALTE una corrida (el 9, 10, 11, 14 y 15 de
 * septiembre el descubrimiento falló y esos días no los recuperó nadie). Más
 * atrás no se va: lo que quede afuera lo levanta el refresco, que relee el
 * inventario completo del barrio.
 */
export function ventanaDescubrimiento(ultimaCorridaOk, ahora = new Date()) {
  if (!ultimaCorridaOk) return 3
  const t = ultimaCorridaOk instanceof Date ? ultimaCorridaOk : new Date(ultimaCorridaOk)
  if (Number.isNaN(t.getTime())) return 3
  const dias = diaAR(ahora) - diaAR(t)
  return Math.min(3, Math.max(2, dias + 1))
}

/**
 * La guardia del presupuesto. `usado` viene de la cuenta de Apify; si no se pudo
 * leer, se deja correr: la guardia no es quien tiene que romper el día.
 */
export function hayPresupuesto(usado, tope) {
  if (usado == null) return true
  return usado < tope
}

/**
 * Qué zonas refrescar y cuáles verificar este mes.
 *
 * Devuelve una entrada por zona, lista para ser la matriz del workflow:
 *   { zona, base, hasta, refrescar, verificar }
 */
export function matrizDelMes(fecha = new Date()) {
  const mes = (fecha instanceof Date ? fecha : new Date(fecha)).getUTCMonth() + 1
  const turno = ZONAS_POR_TURNO[(mes - 1) % ZONAS_POR_TURNO.length]
  const deCaba = [...turno].map((zona) => ({
    zona, base: `departamentos-venta-${zona}`, hasta: TECHO_PAGINAS_CABA,
    refrescar: true, verificar: true,
  }))
  const extra = ZONAS_EXTRA.map((e) => ({ ...e, refrescar: true, verificar: true }))
  return [
    ...deCaba,
    ...extra,
    // base vacío (no null): la matriz de GitHub Actions no acepta nulos.
    { zona: ZONA_SIN_BARRIO, base: '', hasta: 0, refrescar: false, verificar: true },
  ]
}
