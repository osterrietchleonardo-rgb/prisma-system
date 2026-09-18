/**
 * Chat web · Lo que el director carga en la tarjeta del widget, revisado antes de guardarlo.
 *
 * Dos criterios acá:
 * 1. **Lo que se pueda deducir, no se pregunta.** Los dominios desde los que el widget puede
 *    hablar salen del sitio: si se los pidiéramos aparte, el día que alguien escriba mal uno el
 *    chat deja de funcionar en su propia web y nadie entiende por qué.
 * 2. **Los errores vuelven todos juntos y en castellano.** El director corrige una vez, no
 *    cinco veces de a un campo.
 */
import { leerColor } from "./estilo"
import { normalizarSitio } from "./rastreo"

/** Leer un sitio entero cuesta tiempo y vectores: no se relee a los dos minutos. */
export const MINUTOS_ENTRE_RASTREOS = 10

/**
 * Los cinco tipos de consulta que puede traer el chat, y que se reparten entre el contacto
 * principal y el asesor elegido. Son los mismos cinco caminos del asistente (lib/chat-web/agente).
 */
export const OBJETIVOS_RUTEABLES = [
  "busca_propiedad",
  "vender_propiedad",
  "sumarse_equipo",
  "consulta_empresa",
  "reclamo",
] as const
export type ObjetivoRuteable = (typeof OBJETIVOS_RUTEABLES)[number]

/** A dónde va cada tipo de consulta. Uno solo por tipo: no hay forma de que se repita. */
export type Destino = "externo" | "asesor"
export type Ruteo = Record<ObjetivoRuteable, Destino>

export interface Seccion {
  nombre: string
  url: string
  resumen: string
}

export interface ConfiguracionWidget {
  sitio: string
  dominios: string[]
  whatsapp_destino: string
  /** El canal que no depende de que Meta apruebe una plantilla: es el que funciona primero. */
  email_destino: string
  /** La persona de PRISMA que recibe lo que el director le haya asignado. Null = nadie. */
  perfil_equipo_id: string | null
  /**
   * El reparto. Se guarda en la columna `destinos_por_objetivo` (antes guardaba números de
   * teléfono sueltos; nunca llegó a usarse así).
   */
  ruteo: Ruteo
  secciones: Seccion[]
  acento: string | null
  activo: boolean
}

export type Validacion =
  | { ok: true; valor: ConfiguracionWidget }
  | { ok: false; errores: Record<string, string> }

const ES_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ES_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Los formatos reales vienen de todas las formas: se guarda solo con números. */
function soloNumeros(entrada: unknown): string {
  return String(entrada ?? "").replace(/\D/g, "")
}

function esTelefonoPosible(digitos: string): boolean {
  // Un número con código de país entra en esta banda; menos que eso no es un WhatsApp.
  return digitos.length >= 10 && digitos.length <= 15
}

export function validarConfiguracion(entrada: unknown): Validacion {
  const e = (entrada ?? {}) as Record<string, unknown>
  const errores: Record<string, string> = {}

  const sitio = normalizarSitio(String(e.sitio ?? ""))
  if (!sitio) errores.sitio = "Esa no parece una dirección de sitio web. Ejemplo: micasa.com.ar"

  const whatsapp = soloNumeros(e.whatsapp_destino)
  if (!esTelefonoPosible(whatsapp)) {
    errores.whatsapp_destino =
      "Poné el WhatsApp que va a recibir los contactos, con código de país. Ejemplo: +54 9 11 5060-4928"
  }

  const email = String(e.email_destino ?? "").trim().toLowerCase()
  if (!ES_EMAIL.test(email))
    errores.email_destino =
      "Poné el email que va a recibir los contactos. Ejemplo: leads@tuinmobiliaria.com.ar"

  // La persona del equipo se elige de una lista, así que acá solo puede venir un id o nada.
  const perfilCrudo = String(e.perfil_equipo_id ?? "").trim()
  const perfilEquipo = !perfilCrudo || perfilCrudo === "ninguno" ? null : perfilCrudo
  if (perfilEquipo && !ES_ID.test(perfilEquipo))
    errores.perfil_equipo_id = "Elegí a alguien de la lista del equipo."

  // El reparto: cada tipo de consulta a UN destino. Lo que no se diga, al contacto principal;
  // un destino que no existe también cae ahí, en vez de desviar el lead a la nada.
  const pedido = (e.ruteo ?? e.destinos_por_objetivo ?? {}) as Record<string, unknown>
  const ruteo = Object.fromEntries(
    OBJETIVOS_RUTEABLES.map((o) => [o, pedido[o] === "asesor" ? "asesor" : "externo"])
  ) as Ruteo
  const leTocaAlAsesor = Object.values(ruteo).some((d) => d === "asesor")
  if (leTocaAlAsesor && !perfilEquipo)
    errores.perfil_equipo_id =
      "Marcaste consultas para un asesor pero no elegiste a ninguno: esos contactos no le llegarían a nadie."

  // Una sección incompleta no frena el guardado: se descarta y el director la ve faltar.
  const secciones: Seccion[] = []
  for (const s of (Array.isArray(e.secciones) ? e.secciones : []) as Array<Record<string, unknown>>) {
    const nombre = String(s?.nombre ?? "").trim()
    const url = String(s?.url ?? "").trim()
    if (!nombre || !url) continue
    let limpia: URL
    try {
      limpia = new URL(url)
    } catch {
      continue
    }
    if (limpia.protocol !== "http:" && limpia.protocol !== "https:") continue
    secciones.push({ nombre, url: limpia.toString(), resumen: String(s?.resumen ?? "").trim().slice(0, 300) })
  }

  const acentoCrudo = String(e.acento ?? "").trim()
  const acento = acentoCrudo ? leerColor(acentoCrudo) : null
  if (acentoCrudo && !acento) errores.acento = "El color tiene que ser un código tipo #b87333."

  if (Object.keys(errores).length) return { ok: false, errores }

  return {
    ok: true,
    valor: {
      sitio: sitio!.origen,
      dominios: sitio!.dominios,
      whatsapp_destino: whatsapp,
      email_destino: email,
      perfil_equipo_id: perfilEquipo,
      ruteo,
      secciones,
      acento,
      // Nace apagado siempre: un widget recién creado no atiende a nadie hasta que el director
      // lo mire, lo pruebe y lo prenda.
      activo: e.activo === true,
    },
  }
}

/**
 * ¿Se puede volver a leer el sitio? Sin esta espera, apretar el botón diez veces seguidas son
 * diez rastreos y diez tandas de vectores pagos.
 */
export function puedeRastrearDeNuevo(
  ultimoISO: string | null | undefined,
  ahoraMs: number
): { puede: true } | { puede: false; faltanMinutos: number } {
  if (!ultimoISO) return { puede: true }
  const ultimo = Date.parse(ultimoISO)
  if (!Number.isFinite(ultimo)) return { puede: true } // una fecha rota no bloquea para siempre
  const minutos = (ahoraMs - ultimo) / 60_000
  if (minutos >= MINUTOS_ENTRE_RASTREOS) return { puede: true }
  return { puede: false, faltanMinutos: Math.max(1, Math.ceil(MINUTOS_ENTRE_RASTREOS - minutos)) }
}
