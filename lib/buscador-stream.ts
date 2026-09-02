/**
 * Consumidor del stream NDJSON del Buscador IA (y del Tutor): lee la respuesta línea por
 * línea y despacha cada evento. Corre en el navegador. Si la respuesta no es un stream
 * (server viejo, proxy raro), devuelve `null` y el que llama cae al camino JSON de siempre.
 */

export type EventoStream =
  | { tipo: "paso"; texto: string }
  | { tipo: "delta"; texto: string }
  | { tipo: "final"; [k: string]: unknown }
  | { tipo: "error"; error: string }

export async function consumirStreamIA(
  response: Response,
  onEvento: (e: EventoStream) => void,
): Promise<"consumido" | null> {
  const contentType = response.headers.get("content-type") ?? ""
  if (!contentType.includes("ndjson") || !response.body) return null

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let resto = ""
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    resto += decoder.decode(value, { stream: true })
    let corte = resto.indexOf("\n")
    while (corte >= 0) {
      const linea = resto.slice(0, corte).trim()
      resto = resto.slice(corte + 1)
      if (linea) {
        try {
          onEvento(JSON.parse(linea) as EventoStream)
        } catch {
          // una línea partida o basura no tira abajo el chat
        }
      }
      corte = resto.indexOf("\n")
    }
  }
  const cola = resto.trim()
  if (cola) {
    try { onEvento(JSON.parse(cola) as EventoStream) } catch { /* ídem */ }
  }
  return "consumido"
}
