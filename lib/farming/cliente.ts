// lib/farming/cliente.ts
//
// El fetch compartido de las dos pantallas de Farming (asesor y director): antes cada una
// tenía el suyo, y solo una tenía el `cache: "no-store"` que evita servir una lista vieja
// después de guardar (el bug real, visto en el asesor y arreglado ahí en un solo lado).

/** Un pedido a la API que, si viene 409, rechaza con los choques adentro. */
export async function pedir(url: string, init?: RequestInit) {
  const esGet = !init || !init.method
  const r = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    // Sin esto el navegador podía servir de caché una lista vieja después de guardar.
    ...(esGet ? { cache: "no-store" as const } : {}),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) {
    const e: any = new Error(d.error || "Algo salió mal")
    // El código de estado, siempre: quien llama puede necesitar distinguir un 409 (choque) de
    // cualquier otro error sin depender del texto exacto del mensaje del servidor.
    e.status = r.status
    if (r.status === 409) e.choques = d.choques
    throw e
  }
  return d
}
