// Los textos que el cliente va a leer en la ficha, y lo que hay que mirar antes de mandarlos.
//
// EL PROBLEMA: el aviso de la red trae la descripción tal como la escribió la inmobiliaria
// que publica, y ahí adentro suele venir su propia identidad. Medido sobre los 60.278 avisos
// de la vista: 33.368 (55%) dicen matrícula / CUCICBA / corredor / martillero, 25.489 (42%)
// traen el nombre del publicador y 4.390 (7%) invitan a contactarlo. Si eso viaja a la ficha,
// el cliente termina hablando con el colega — que es exactamente lo que la ficha evita.
//
// POR QUÉ NO SE LIMPIA SOLO: medido sobre 400 avisos, el nombre del publicador cae en el
// MEDIO del texto en el 65% de los casos, y los formatos no se parecen entre sí. Peor: en un
// aviso "Goyena Bienes Raíces" matcheaba con "Av. Pedro Goyena 1600", que es la CALLE de la
// propiedad. Una regla que borre lo suficiente rompe descripciones legítimas; una que no
// rompa nada deja pasar fugas.
//
// LA SALIDA: dos niveles, y ninguno borra por su cuenta.
//   - `fragmentosSeguros`: frases con matrícula/corredor/martillero/invitación a contactar.
//     Son inequívocas. El asesor las saca con un toque, si quiere.
//   - `menciones`: apariciones del nombre del publicador. SOLO se señalan — nunca entran en
//     el sacado de un toque, justamente por el caso Goyena.
// La máquina señala; la persona decide.

/**
 * Frases que identifican a la inmobiliaria que publica o invitan a contactarla.
 * Van sobre la FRASE entera, no sobre la palabra suelta: sacar "CUCICBA" y dejar
 * "Martillero responsable Ricardo Tiscornia 6020" no sirve de nada.
 */
const PATRONES_SEGUROS: RegExp[] = [
  /matr[ií]cula/i,
  // Sin borde de palabra al final: la matrícula viene pegada al organismo el 0,6% de las
  // veces ("CMCPSI5675", "CUCICBA6421"), y `\b` no matchea entre una letra y un número.
  /\bcucicba/i,
  /\bcmcpsi/i,
  /\bcopropi/i,
  /corredor(a)?\s+inmobiliari/i,
  /martiller[oa]/i,
  /no\s+ejerce\s+el\s+corretaje/i,
  /\bxintel\b/i,
  /cont[áa]ctanos|contactanos|cont[áa]ctenos|llamanos|ll[áa]manos|escribinos/i,
  /consultas?\s+al\s+(tel|wh?ats)/i,
  // "Contacto: Fulana de Tal" al empezar la frase. Encontrado mirando una ficha real: el
  // aviso arrancaba con "Corredor Responsable: … / Contacto: Guadalupe Cabrera", o sea que
  // lo primero que leía el cliente eran los datos del colega. Anclado al principio a
  // propósito, para no confundirlo con "en contacto con la naturaleza".
  /^contacto\s*:/i,
  /^(tel[eé]fono|whatsapp|cel(ular)?)\s*:/i,
]

/** Un nombre más corto que esto no distingue nada ("SUM", "AR"). */
const LARGO_MINIMO_NOMBRE = 4

/**
 * Corta el texto en frases. Se parte por salto de línea y por punto seguido, conservando
 * el punto: la frase se tiene que poder volver a encontrar tal cual dentro del texto para
 * poder sacarla después.
 */
function enFrases(texto: string): string[] {
  return texto
    .split(/\n+/)
    .flatMap((linea) => linea.split(/(?<=\.)\s+/))
    .map((f) => f.trim())
    .filter(Boolean)
}

/** Las frases que contienen algún dato inequívoco de la inmobiliaria que publica. */
export function fragmentosSeguros(texto: string): string[] {
  if (!texto) return []
  const encontradas = enFrases(texto).filter((f) => PATRONES_SEGUROS.some((p) => p.test(f)))
  return Array.from(new Set(encontradas))
}

/**
 * Saca las frases indicadas y deja el texto legible: sin líneas vacías de más ni espacios
 * dobles donde antes había una frase.
 */
export function sacarFragmentos(texto: string, fragmentos: string[]): string {
  if (!texto || fragmentos.length === 0) return texto
  const fuera = new Set(fragmentos)
  return texto
    .split(/\n/)
    .map((linea) =>
      linea
        .split(/(?<=\.)\s+/)
        .filter((f) => !fuera.has(f.trim()))
        .join(" ")
        .trim(),
    )
    .filter(Boolean)
    .join("\n")
}

/**
 * Apariciones del nombre de la inmobiliaria que publica dentro del texto.
 *
 * Se usa SOLO para avisarle al asesor dónde mirar. No se borra nada con esto: el nombre
 * puede ser el de la calle (ver el caso Goyena arriba), y esa diferencia la ve una persona,
 * no una expresión regular.
 */
export function menciones(texto: string, nombrePublicador: string | null | undefined): string[] {
  if (!texto || !nombrePublicador) return []
  const palabras = nombrePublicador
    .split(/[\s,.\-/]+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= LARGO_MINIMO_NOMBRE && !PALABRAS_GENERICAS.has(p.toLowerCase()))

  const halladas = palabras.filter((p) => new RegExp(`\\b${escapar(p)}\\b`, "i").test(texto))
  return Array.from(new Set(halladas))
}

/** Palabras del nombre que no distinguen a nadie y aparecerían en media base. */
const PALABRAS_GENERICAS = new Set([
  "propiedades",
  "inmobiliaria",
  "inmobiliarias",
  "bienes",
  "raices",
  "raíces",
  "negocios",
  "grupo",
  "estate",
  "real",
  "servicios",
  "sociedad",
  "hnos",
  "asociados",
])

function escapar(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
