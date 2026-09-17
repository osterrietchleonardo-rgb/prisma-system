//
// Farming · las reglas de la tarjeta de la caminata, sin base de datos en el medio.
//
// La mayoría de lo que el asesor releva NO está publicado en ningún portal: `mercado_avisos` es
// una ayuda, no la fuente. Por eso la tarjeta se crea desde cero y lo único que se le exige es
// la calle y el tipo — está parado en la vereda con el teléfono en la mano.

export type TipoDireccion = "edificio" | "casa" | "ph" | "local" | "oficina" | "lote" | "otro"
export type EtapaDireccion =
  | "relevado" | "presentado" | "en_secuencia" | "respondio" | "tasacion" | "captada" | "descartada"
export type Vinculo = "propietario" | "inquilino" | "encargado" | "familiar" | "otro"

export const TIPOS: { clave: TipoDireccion; etiqueta: string }[] = [
  { clave: "edificio", etiqueta: "Edificio" },
  { clave: "casa", etiqueta: "Casa" },
  { clave: "ph", etiqueta: "PH" },
  { clave: "local", etiqueta: "Local" },
  { clave: "oficina", etiqueta: "Oficina" },
  { clave: "lote", etiqueta: "Lote" },
  { clave: "otro", etiqueta: "Otro" },
]

/** Las seis columnas del tablero, más «descartada» al costado. El orden es el del spec. */
export const ETAPAS: { clave: EtapaDireccion; etiqueta: string }[] = [
  { clave: "relevado", etiqueta: "Relevado" },
  { clave: "presentado", etiqueta: "Presentado" },
  { clave: "en_secuencia", etiqueta: "En secuencia" },
  { clave: "respondio", etiqueta: "Respondió" },
  { clave: "tasacion", etiqueta: "Tasación" },
  { clave: "captada", etiqueta: "Captada" },
  { clave: "descartada", etiqueta: "Descartada" },
]

export const VINCULOS: { clave: Vinculo; etiqueta: string }[] = [
  { clave: "propietario", etiqueta: "Propietario" },
  { clave: "inquilino", etiqueta: "Inquilino" },
  { clave: "encargado", etiqueta: "Encargado" },
  { clave: "familiar", etiqueta: "Familiar" },
  { clave: "otro", etiqueta: "Otro" },
]

export interface EntradaDireccion {
  calle: string
  altura?: string | null
  tipo: TipoDireccion
  tramo?: string | null
  pisos?: number | null
  unidades_por_piso?: number | null
  unidades_manual?: number | null
  encargado_nombre?: string | null
  encargado_turno?: string | null
  encargado_notas?: string | null
  lat?: number | null
  lng?: number | null
  a_la_venta?: boolean
  cartel?: "dueno" | "inmobiliaria" | "sin_cartel" | null
  inmobiliaria_cartel?: string | null
  precio_pedido?: number | null
  moneda?: "USD" | "ARS" | null
  observaciones?: string | null
  relevada_en?: string | null
  /** «Qué sigue» y para cuándo. La tarjeta lo muestra como línea visible, nunca en un globito:
   *  es lo que el asesor necesita leer de un vistazo antes de volver a esa puerta. */
  proxima_accion?: string | null
  proxima_accion_en?: string | null
}

export function etiquetaDe(etapa: EtapaDireccion): string {
  return ETAPAS.find((e) => e.clave === etapa)?.etiqueta ?? etapa
}

/** Regla de las slides: las unidades NO se cargan a mano. */
export function unidadesTotales(
  e: Pick<EntradaDireccion, "pisos" | "unidades_por_piso" | "unidades_manual">,
): number | null {
  if (e.pisos && e.unidades_por_piso) {
    const total = e.pisos * e.unidades_por_piso
    return total > 0 ? total : null
  }
  const manual = e.unidades_manual ?? null
  return manual != null && manual > 0 ? manual : null
}

/**
 * La dirección comparable. Tiene que dar lo mismo que `farming_direccion_normalizada` en la
 * base, que es la que sostiene el índice único: acá sirve para avisarle al asesor ANTES de
 * mandar el formulario, pero el candado de verdad es el de Postgres.
 */
export function normalizarDireccion(calle: string, altura?: string | null): string {
  // Los mismos tres pasos, en el mismo orden, que `farming_direccion_normalizada` en la base.
  // El segundo —tirar todo lo que no sea letra, número o espacio— es el que hace que
  // «Av. Ejemplo» y «Av Ejemplo» sean la misma puerta.
  return `${(calle || "").trim()} ${(altura || "").trim()}`
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Parte `aviso.direccion` (un solo string de `mercado_avisos`, ej. «Conde 900») en `calle` y
 * `altura` para precargar la tarjeta cuando el asesor convierte un aviso en Relevamiento.
 *
 * Regex simple, a propósito: todo lo que NO sea el número final es la calle. Si el número no
 * está pegado al final (por ejemplo «Conde 900 piso 3», con texto después de la altura), el
 * final de verdad es ese último número («3»), y «Conde 900 piso» —altura incluida— queda
 * adentro de la calle. No es un parser de direcciones: es la extracción rápida para no dejar
 * la tarjeta en blanco; el asesor la corrige a mano si hace falta.
 *
 * Caso conocido que parte mal, a propósito no cubierto: las direcciones rurales tipo «Ruta 8
 * km 45» quedan con el «45» como altura (el "45" de "km 45" es el último número). Se corrige a
 * mano desde la tarjeta, igual que cualquier otro caso que esta regex simple no acierta.
 */
export function partirDireccion(direccion: string | null): { calle: string; altura: string | null } {
  const d = (direccion || "").trim()
  if (!d) return { calle: "", altura: null }

  const m = d.match(/^(.*?)\s*(\d+)$/)
  if (!m) return { calle: d, altura: null }

  const calle = m[1].trim()
  // Si el número se traga toda la calle (ej.: la dirección es solo "1200"), no hay calle que
  // separar: se deja el string entero como calle antes que perder el dato.
  if (!calle) return { calle: d, altura: null }

  return { calle, altura: m[2] }
}

/**
 * El tipo de propiedad que trae `mercado_avisos` mapeado a las siete claves cerradas de
 * `TIPOS`.
 *
 * LOS NOMBRES SON LOS DE LA BASE, NO INVENTADOS. El vocabulario real de `mercado_avisos.tipo`
 * está escrito en `lib/mapa/tipos-propiedad.ts` (que es quien arma los filtros del mapa contra
 * esos mismos valores) y contado en producción el 16-sep-2026 sobre 67.577 avisos:
 *
 *   Departamento 64.644 · PH 852 · Casa 506 · Terrenos 490 · Local comercial 464 ·
 *   Cochera 261 · Oficina comercial 236 · Edificio 38 · Depósito 27 ·
 *   Fondo de comercio 22 · Bodega-Galpon 20 · Consultorio 10
 *
 * Se escribe "Terrenos" (plural), "Local comercial" y "Oficina comercial" porque así vienen:
 * con "Terreno", "Local" y "Oficina" a secas, esos 1.190 avisos caían en "Otro" y la tarjeta le
 * pedía al asesor «Unidades» en vez de pisos × unidades.
 *
 * Lo que cae en "otro" cae a propósito: Cochera, Depósito, Bodega-Galpon, Consultorio y Fondo
 * de comercio NO son puertas a las que golpear —no hay un propietario viviendo ahí para
 * captar—, así que no merecen una clave propia en la caminata. Y cualquier valor nuevo que el
 * portal invente mañana también cae ahí: nunca se inventa un tipo.
 */
export function tipoDesdeAviso(tipo: string | null): TipoDireccion {
  switch (tipo) {
    case "Departamento": return "edificio"
    case "Casa": return "casa"
    case "PH": return "ph"
    case "Terrenos": return "lote"
    case "Local comercial": return "local"
    case "Oficina comercial": return "oficina"
    case "Edificio": return "edificio"
    default: return "otro"
  }
}

/**
 * La misma condición, carácter por carácter, que el `where` del índice parcial
 * `farming_direcciones_sin_repetir_idx`: sin esto, una puerta "s/n" (o vacía) terminaría
 * chocando contra cualquier otra de la misma calle, que es justo lo que el índice evita.
 *
 * Vive acá, y no adentro de un `route.ts`, porque la usan el ALTA y la EDICIÓN de una tarjeta:
 * dos copias del mismo `if` se separan sin que nadie se entere.
 */
export function tieneAlturaComparable(altura?: string | null): boolean {
  const a = (altura || "").trim()
  if (!a) return false
  return !["s/n", "sn", "s.n."].includes(a.toLowerCase())
}

const CLAVES_TIPO = TIPOS.map((t) => t.clave) as string[]

const CARTELES_VALIDOS = ["dueno", "inmobiliaria", "sin_cartel"] as const
const MONEDAS_VALIDAS = ["USD", "ARS"] as const

/** Los mismos topes que los `check` de la migración: un valor afuera de esto ni siquiera
 *  llegaría a Postgres sin romper con un 23514 crudo. Acá se corta antes, con un mensaje. */
const RANGOS = {
  pisos: [1, 200],
  unidades_por_piso: [1, 200],
  unidades_manual: [1, 5000],
} as const

/**
 * Lo que NO PUEDE EXISTIR: un valor fuera de la lista cerrada o del rango que la base acepta
 * (los mismos `check` de la migración). Separado de `validarDireccion` porque el PATCH manda
 * datos parciales: un cuerpo sin calle es legítimo cuando se está corrigiendo un solo campo,
 * pero `moneda: "EUR"` no lo es nunca — esté o no la calle, esté o no el tipo. Por eso cada
 * chequeo acá solo mira el campo si VINO en `e` (`!= null`): ausente no es lo mismo que
 * imposible.
 */
export function valoresImposibles(e: Partial<EntradaDireccion>): string[] {
  const errores: string[] = []

  if (e.tipo != null && !CLAVES_TIPO.includes(e.tipo)) errores.push("Elegí qué tipo de propiedad es.")

  if (e.pisos != null && (!Number.isFinite(e.pisos) || e.pisos < RANGOS.pisos[0] || e.pisos > RANGOS.pisos[1])) {
    errores.push(`Los pisos van de ${RANGOS.pisos[0]} a ${RANGOS.pisos[1]}.`)
  }
  if (
    e.unidades_por_piso != null &&
    (!Number.isFinite(e.unidades_por_piso) ||
      e.unidades_por_piso < RANGOS.unidades_por_piso[0] ||
      e.unidades_por_piso > RANGOS.unidades_por_piso[1])
  ) {
    errores.push(`Las unidades por piso van de ${RANGOS.unidades_por_piso[0]} a ${RANGOS.unidades_por_piso[1]}.`)
  }
  if (
    e.unidades_manual != null &&
    (!Number.isFinite(e.unidades_manual) ||
      e.unidades_manual < RANGOS.unidades_manual[0] ||
      e.unidades_manual > RANGOS.unidades_manual[1])
  ) {
    errores.push(`Las unidades van de ${RANGOS.unidades_manual[0]} a ${RANGOS.unidades_manual[1]}.`)
  }

  if (e.moneda != null && !MONEDAS_VALIDAS.includes(e.moneda as any)) {
    errores.push("La moneda tiene que ser USD o pesos.")
  }

  if (e.cartel != null && !CARTELES_VALIDOS.includes(e.cartel as any)) {
    errores.push("Ese tipo de cartel no existe.")
  }

  // LA FORMA, no solo el valor. `lat`, `lng` y `precio_pedido` son columnas numéricas sin
  // `check` en la migración: un `lat: "abc"` no rompe ninguna regla de negocio, rompe el CAST
  // de Postgres (22P02) y vuelve como un 500 en inglés. Se corta acá, que es el único lugar
  // que miran las DOS puertas —el alta y la edición— así que las dos contestan lo mismo.
  // No se controla el RANGO (que la latitud caiga entre -90 y 90): la migración no lo pide, y
  // esta función es el espejo de sus `check`, ni más ni menos.
  const numeroRoto = (v: unknown) => typeof v !== "number" || !Number.isFinite(v)
  if (e.lat != null && numeroRoto(e.lat)) errores.push("La latitud tiene que ser un número.")
  if (e.lng != null && numeroRoto(e.lng)) errores.push("La longitud tiene que ser un número.")
  if (e.precio_pedido != null && numeroRoto(e.precio_pedido)) errores.push("El precio tiene que ser un número.")

  return errores
}

/**
 * Validación en dos niveles: lo que bloquea la guardia y lo que avisa.
 *
 * `errores` vacío = se puede guardar. Nunca vacío = no se guarda: son los obligatorios que
 * faltan (calle y tipo) más los valores IMPOSIBLES (`valoresImposibles`).
 * `avisos` nunca bloquean: el asesor está en la vereda con el teléfono, no llena todo de una —
 * son datos INCOMPLETOS, que se completan después.
 */
export function validarDireccion(e: Partial<EntradaDireccion>): { errores: string[]; avisos: string[] } {
  const avisos: string[] = []

  // Obligatorios: la calle y el tipo. Lo demás se completa después. Un tipo PRESENTE pero
  // inválido no es "falta el tipo": eso es un valor imposible, y lo corta valoresImposibles.
  // `== null` y no `!e.tipo`: un tipo falsy-pero-no-nulo ("", 0) tiene que caer SOLO en
  // valoresImposibles (presente pero inválido), nunca acá también — si no, el mismo mensaje
  // sale duplicado (ausente + presente-inválido a la vez, contradictorio).
  const errores: string[] = []
  if (!e.calle?.trim()) errores.push("Falta la calle.")
  if (e.tipo == null) errores.push("Elegí qué tipo de propiedad es.")

  // Si carga pisos, hace falta el otro número: si no, el total queda en blanco y el indicador
  // de «unidades potenciales» miente. Pero no bloquea la guardia.
  if (e.pisos && !e.unidades_por_piso) avisos.push("Pusiste los pisos: falta cuántas unidades hay por piso.")
  if (e.unidades_por_piso && !e.pisos) avisos.push("Pusiste las unidades por piso: faltan los pisos.")

  if (e.precio_pedido != null && !e.moneda) avisos.push("Un precio sin moneda no dice nada: elegí USD o pesos.")
  if (e.cartel === "inmobiliaria" && !e.inmobiliaria_cartel?.trim()) {
    avisos.push("Decinos de qué inmobiliaria es el cartel.")
  }

  errores.push(...valoresImposibles(e))

  return { errores, avisos }
}
