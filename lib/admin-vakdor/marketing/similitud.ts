/**
 * Detección de aperturas repetidas por coeficiente de Dice sobre trigramas
 * de palabras. Sin costo de API: es la primera barrera contra el "ya dijiste esto".
 */

export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function trigramas(texto: string): Set<string> {
  const palabras = normalizar(texto).split(" ").filter(Boolean)
  const out = new Set<string>()
  if (palabras.length < 3) {
    if (palabras.length) out.add(palabras.join(" "))
    return out
  }
  for (let i = 0; i <= palabras.length - 3; i++) out.add(palabras.slice(i, i + 3).join(" "))
  return out
}

/** Coeficiente de Dice: 2·|A∩B| / (|A|+|B|). 0 = nada en común, 1 = idénticos. */
export function similitud(a: string, b: string): number {
  const A = trigramas(a)
  const B = trigramas(b)
  if (A.size === 0 || B.size === 0) return 0
  let comunes = 0
  for (const t of A) if (B.has(t)) comunes++
  return (2 * comunes) / (A.size + B.size)
}

export function hookRepetido(
  hook: string,
  previos: string[],
  umbral = 0.45,
): { repetido: boolean; contra: string | null; valor: number } {
  let mejor = { contra: null as string | null, valor: 0 }
  for (const p of previos) {
    const v = similitud(hook, p)
    if (v > mejor.valor) mejor = { contra: p, valor: v }
  }
  return { repetido: mejor.valor >= umbral, contra: mejor.valor >= umbral ? mejor.contra : null, valor: mejor.valor }
}
