/**
 * Chat web · La paleta del chat a partir de la marca de la inmobiliaria.
 *
 * El color lo carga el director en Marketing IA → Configuración, y el chat lo TOMA de ahí: no
 * se copia a ningún lado, así que cambiarlo allá lo cambia acá sin que nadie sincronice nada.
 *
 * Pero un color de marca no se puede usar tal cual en una interfaz. Hay marcas amarillas que
 * sobre blanco no se leen, marcas negras que desaparecen sobre un sitio oscuro, y fondos que
 * pintados con el color de marca a pantalla completa marean. Así que acá está el análisis:
 *
 * 1. Los fondos son NEUTROS con un toque del tono de la marca. El color fuerte se gasta en
 *    tres lugares (el botón flotante, el globito del visitante y los links) y nada más.
 * 2. El texto sobre un color se elige midiendo: blanco o casi negro, el que se lea.
 * 3. Si un color no llega al contraste mínimo, se lo mueve SOLO en luminosidad, nunca en tono:
 *    el cobre sigue siendo cobre, apenas más oscuro.
 * 4. El botón flotante vive en el sitio del cliente, que suele ser blanco: si la marca casi no
 *    se despega del blanco, se la oscurece hasta que se vea.
 *
 * Los mínimos son los de la norma de accesibilidad (WCAG 2.1 AA): 4,5 para texto.
 */

/** Contraste mínimo para cualquier cosa que se lea. */
export const MINIMO_TEXTO = 4.5
/** Contraste mínimo del texto dentro del botón flotante. */
export const MINIMO_BOTON = 4.5
/** Cuánto se tiene que despegar el botón del blanco del sitio del cliente. */
const MINIMO_DESPEGUE = 2.2

/** El gris de PRISMA, para cuando la agencia no cargó ningún color. */
const NEUTRO = "#334155"
/** El "negro" de la interfaz: negro puro cansa la vista. */
const TINTA = "#101828"
const BLANCO = "#ffffff"

export interface Hsl {
  /** 0-360 */
  h: number
  /** 0-100 */
  s: number
  /** 0-100 */
  l: number
}

/** Lo que viene de la configuración puede estar escrito de cualquier forma. */
export function leerColor(entrada: string): string | null {
  const texto = String(entrada ?? "").trim().replace(/^#/, "").toLowerCase()
  if (/^[0-9a-f]{3}$/.test(texto)) return `#${texto[0]}${texto[0]}${texto[1]}${texto[1]}${texto[2]}${texto[2]}`
  if (/^[0-9a-f]{6}$/.test(texto)) return `#${texto}`
  return null
}

function aRgb(hex: string): [number, number, number] {
  const c = leerColor(hex) ?? NEUTRO
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]
}

/** Luminancia relativa según la norma: cuánta luz emite el color para el ojo. */
function luminancia(hex: string): number {
  const [r, g, b] = aRgb(hex).map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** La cuenta que dice si un texto se lee sobre un fondo. Va de 1 (invisible) a 21. */
export function contraste(a: string, b: string): number {
  const la = luminancia(a)
  const lb = luminancia(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

export function aHsl(hex: string): Hsl {
  const [r, g, b] = aRgb(hex).map((v) => v / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l: l * 100 }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return { h: h * 360, s: s * 100, l: l * 100 }
}

export function aHex({ h, s, l }: Hsl): string {
  const sn = Math.min(100, Math.max(0, s)) / 100
  const ln = Math.min(100, Math.max(0, l)) / 100
  const hn = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * ln - 1)) * sn
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1))
  const m = ln - c / 2
  const tramo = Math.floor(hn / 60) % 6
  const [r, g, b] = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
  ][tramo]
  const canal = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0")
  return `#${canal(r)}${canal(g)}${canal(b)}`
}

/** Blanco o casi negro: el que se lea sobre este fondo. */
export function textoSobre(fondo: string): string {
  return contraste(BLANCO, fondo) >= contraste(TINTA, fondo) ? BLANCO : TINTA
}

/**
 * Mueve el color SOLO en luminosidad hasta que se lea sobre el fondo, y lo mueve lo menos
 * posible. Si ya se lee, no lo toca. El tono y la saturación quedan intactos: por eso el
 * cobre de la marca sigue siendo cobre.
 */
export function acercarHastaContraste(color: string, fondo: string, minimo: number): string {
  const base = leerColor(color) ?? NEUTRO
  if (contraste(base, fondo) >= minimo) return base
  const { h, s, l } = aHsl(base)
  let masOscuro: string | null = null
  let masClaro: string | null = null
  for (let paso = 1; paso <= 100; paso++) {
    if (masOscuro === null && l - paso >= 0) {
      const candidato = aHex({ h, s, l: l - paso })
      if (contraste(candidato, fondo) >= minimo) masOscuro = candidato
    }
    if (masClaro === null && l + paso <= 100) {
      const candidato = aHex({ h, s, l: l + paso })
      if (contraste(candidato, fondo) >= minimo) masClaro = candidato
    }
    // El primero que aparece es el que menos se alejó del color original.
    if (masOscuro || masClaro) return (masOscuro ?? masClaro) as string
  }
  // No debería llegar acá: contra cualquier fondo, el negro o el blanco alcanzan.
  return textoSobre(fondo)
}

/** Lo que el director elige en Marketing IA → Configuración. */
export type FuenteMarca = "sans" | "serif" | "script" | "display"

export interface Fuentes {
  /** El nombre de la inmobiliaria arriba del chat: acá sí puede lucirse la marca. */
  titulo: string
  /** La conversación. Siempre legible, pase lo que pase. */
  cuerpo: string
}

// Ninguna se descarga: son las que ya tiene la máquina del visitante. Una fuente de internet
// agregaría medio segundo de carga al sitio del cliente y otro permiso que pedirle.
const PILA_SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
const PILA_SERIF = 'Georgia, "Times New Roman", Times, serif'
const PILA_MANUSCRITA = '"Segoe Script", "Brush Script MT", "Snell Roundhand", cursive'

/**
 * La tipografía de la marca, con un límite: una manuscrita o una de cartel se ve bien en un
 * título de dos palabras y es ilegible en una conversación de veinte mensajes. Esas quedan
 * arriba nada más; el cuerpo del chat va siempre en una fuente de lectura.
 */
export function fuentesDelChat(brandFont: unknown): Fuentes {
  const f = String(brandFont ?? "").toLowerCase()
  if (f === "serif") return { titulo: PILA_SERIF, cuerpo: PILA_SERIF }
  if (f === "script") return { titulo: PILA_MANUSCRITA, cuerpo: PILA_SANS }
  if (f === "display") return { titulo: PILA_SERIF, cuerpo: PILA_SANS }
  return { titulo: PILA_SANS, cuerpo: PILA_SANS }
}

export interface Paleta {
  /** true si el color salió de la configuración de la agencia; false si es el gris de PRISMA. */
  heredado: boolean
  /** Fondo del panel del chat. Neutro con un toque del tono de la marca. */
  fondo: string
  texto: string
  /** Para la hora, el "escribiendo…", las aclaraciones. */
  textoSuave: string
  borde: string
  /** El botón flotante, que vive en el sitio del cliente. */
  botonFondo: string
  botonTexto: string
  /** El globito de lo que escribe la persona: acá va el color de la marca. */
  visitanteFondo: string
  visitanteTexto: string
  /** El globito del asistente: neutro, para que se lea de corrido. */
  agenteFondo: string
  agenteTexto: string
  link: string
}

export interface OpcionesPaleta {
  /** El color de marca de Marketing IA → Configuración. */
  primario: string
  /** Lo que el director quiso pisar SOLO para el chat. Si está, manda. */
  acento?: string
  tema: "claro" | "oscuro"
}

export function paletaDelChat({ primario, acento, tema }: OpcionesPaleta): Paleta {
  const elegido = leerColor(acento ?? "") ?? leerColor(primario ?? "")
  const base = elegido ?? NEUTRO
  const { h, s } = aHsl(base)
  // Un gris no tiene tono que prestar: sus fondos quedan grises de verdad.
  const tinte = s < 5 ? 0 : Math.min(s, 12)

  const claro = tema === "claro"
  const fondo = aHex({ h, s: tinte, l: claro ? 97 : 10 })
  const texto = aHex({ h, s: Math.min(tinte, 8), l: claro ? 12 : 96 })
  const textoSuave = aHex({ h, s: Math.min(tinte, 8), l: claro ? 40 : 72 })
  const borde = aHex({ h, s: tinte, l: claro ? 86 : 24 })
  const agenteFondo = aHex({ h, s: tinte, l: claro ? 93 : 17 })

  // El botón vive en el sitio del cliente, que casi siempre es blanco: si la marca no se
  // despega del blanco, se la oscurece hasta que se vea.
  const botonFondo = acercarHastaContraste(base, BLANCO, MINIMO_DESPEGUE)

  return {
    heredado: elegido !== null,
    fondo,
    texto,
    textoSuave,
    borde,
    botonFondo,
    botonTexto: textoSobre(botonFondo),
    visitanteFondo: botonFondo,
    visitanteTexto: textoSobre(botonFondo),
    agenteFondo,
    agenteTexto: texto,
    link: acercarHastaContraste(base, fondo, MINIMO_TEXTO),
  }
}
