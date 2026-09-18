/**
 * Chat web · Las métricas de las conversaciones (Leonardo, 17/9).
 *
 * "Todas las conversaciones tienen que estar analizadas y registradas, así luego se pueden ver
 * métricas: cuántos hablaron, cuántos avanzaron con la información de contacto, cuántos quedaron
 * en solo preguntas, cuántas por tipo de interés."
 *
 * No hace falta ninguna tabla nueva: cada conversación ya guarda su objetivo, lo que la persona
 * contó, su estado y lo que costó. Esto lo cuenta, y nada más.
 *
 * Dos decisiones que cambian los números y por eso están escritas acá:
 * 1. **Un solo mensaje no es una conversación.** Alguien que abre el chat, escribe "hola" y se va
 *    no habló con nadie. Si contara, la tasa de contacto se vería peor de lo que es.
 * 2. **El nombre solo no es un contacto.** Contacto es un teléfono o un email: algo con lo que se
 *    pueda volver a hablarle. Si no, el número miente hacia arriba.
 */

export interface FilaParaMetricas {
  objetivo: string | null
  datos: Record<string, string> | null
  estado: string
  mensajes_count: number
  costo_usd: number
  created_at: string
}

export interface ResumenChatWeb {
  total: number
  /** Los que intercambiaron al menos un ida y vuelta. */
  conversaron: number
  /** Los que dejaron teléfono o email. */
  dejaronContacto: number
  /** Conversaron pero no dejaron cómo contactarlos. */
  soloPreguntas: number
  derivadas: number
  /** De los que conversaron, qué porcentaje dejó contacto. Redondeado. */
  tasaContacto: number
  porObjetivo: Record<string, number>
  /** Conversaciones donde nunca se supo qué necesitaba la persona. */
  sinDefinir: number
  costoTotalUSD: number
  costoPromedioUSD: number
}

const OBJETIVOS = [
  "busca_propiedad",
  "vender_propiedad",
  "sumarse_equipo",
  "consulta_empresa",
  "reclamo",
] as const

function hayContacto(datos: Record<string, string> | null): boolean {
  const tel = String(datos?.telefono ?? "").replace(/\D/g, "")
  const email = String(datos?.email ?? "").trim()
  return (tel.length >= 10 && tel.length <= 15) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function resumirConversaciones(filas: FilaParaMetricas[]): ResumenChatWeb {
  const porObjetivo: Record<string, number> = Object.fromEntries(OBJETIVOS.map((o) => [o, 0]))
  let conversaron = 0
  let dejaronContacto = 0
  let soloPreguntas = 0
  let derivadas = 0
  let sinDefinir = 0
  let costoTotalUSD = 0

  for (const f of filas) {
    const mensajes = Number(f?.mensajes_count ?? 0)
    const costo = Number(f?.costo_usd ?? 0)
    costoTotalUSD += Number.isFinite(costo) ? costo : 0

    const hablo = Number.isFinite(mensajes) && mensajes >= 2
    if (hablo) conversaron++

    const contacto = hayContacto(f?.datos ?? null)
    if (contacto) dejaronContacto++
    else if (hablo) soloPreguntas++

    if (f?.estado === "derivada") derivadas++

    const objetivo = String(f?.objetivo ?? "")
    if (objetivo && objetivo in porObjetivo) porObjetivo[objetivo]++
    else sinDefinir++
  }

  return {
    total: filas.length,
    conversaron,
    dejaronContacto,
    soloPreguntas,
    derivadas,
    tasaContacto: conversaron ? Math.round((dejaronContacto / conversaron) * 100) : 0,
    porObjetivo,
    sinDefinir,
    costoTotalUSD,
    costoPromedioUSD: filas.length ? costoTotalUSD / filas.length : 0,
  }
}
