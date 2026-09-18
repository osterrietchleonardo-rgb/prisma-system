/**
 * Chat web · Partir la respuesta en mensajes, como escribe una persona (Leonardo, 17/9).
 *
 * Un párrafo largo que aparece de golpe se lee como un robot. Una persona manda una idea, después
 * otra, y entre medio se ve "escribiendo…". Es la misma idea del formateador del bot de WhatsApp.
 *
 * Reglas que importan y por eso están probadas:
 * - se corta por punto y aparte primero (son ideas distintas), y recién después por oraciones;
 * - NUNCA se parte un link al medio: el visitante tiene que poder tocarlo;
 * - no se manda una catarata de burbujas ni una huérfana de dos palabras.
 */

/** Más que esto es una catarata: cansa y se nota que es automático. */
export const MAX_PARTES = 4
/**
 * A partir de acá conviene cortar; más corto, se manda entero. 180 es lo que se lee de un vistazo
 * en un globito de chat: con 240 quedaban parrafos que en el celular ocupan media pantalla.
 */
const LARGO_COMODO = 180
/** Una burbuja más corta que esto se pega a la anterior. */
const MINIMO_BURBUJA = 40

/** Corta un texto en oraciones sin romper links ni abreviaturas comunes. */
function enOraciones(texto: string): string[] {
  const partes: string[] = []
  let actual = ""
  for (const pedazo of texto.split(/(?<=[.!?…])\s+/)) {
    // Si lo que viene arrastra un link cortado, se pega al anterior.
    actual = actual ? `${actual} ${pedazo}` : pedazo
    const abierto = /https?:\/\/\S*$/.test(actual)
    if (!abierto && actual.length >= MINIMO_BURBUJA) {
      partes.push(actual)
      actual = ""
    }
  }
  if (actual) {
    if (partes.length && actual.length < MINIMO_BURBUJA) partes[partes.length - 1] += ` ${actual}`
    else partes.push(actual)
  }
  return partes
}

export function partirEnMensajes(texto: string): string[] {
  const limpio = String(texto ?? "").trim()
  if (!limpio) return []

  // 1. Punto y aparte: ideas distintas.
  const bloques = limpio
    .split(/\n{2,}/)
    .map((b) => b.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean)

  // 2. Los bloques largos se cortan por oraciones.
  const partes: string[] = []
  for (const bloque of bloques) {
    if (bloque.length <= LARGO_COMODO) partes.push(bloque)
    else partes.push(...enOraciones(bloque))
  }

  // 3. Si quedaron demasiadas, se juntan las últimas: mejor un mensaje largo que una catarata.
  while (partes.length > MAX_PARTES) {
    const ultima = partes.pop() as string
    partes[partes.length - 1] += ` ${ultima}`
  }

  return partes.map((p) => p.trim()).filter(Boolean)
}

/**
 * Cuánto tarda alguien en escribir eso. No es decoración: sin la pausa, tres burbujas seguidas
 * aparecen todas juntas y el efecto es peor que un párrafo largo.
 */
export function demoraDeEscritura(texto: string): number {
  return Math.min(2500, Math.max(400, 300 + String(texto ?? "").length * 18))
}
