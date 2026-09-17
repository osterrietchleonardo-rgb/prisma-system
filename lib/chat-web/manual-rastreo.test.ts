/**
 * PRUEBA MANUAL (feat/chat-web-rastreo, 16/9): rastrea un sitio REAL y muestra lo que leería el
 * asistente. SOLO LECTURA: no escribe en la base ni en ningún lado. NO se commitea.
 * Correr: RASTREO_MANUAL=1 npx vitest run lib/chat-web/manual-rastreo
 *         RASTREO_MANUAL=1 SITIO=otrositio.com npx vitest run lib/chat-web/manual-rastreo
 */
import { describe, it, expect } from "vitest"
import { rastrearSitio } from "./rastreo"

const activo = process.env.RASTREO_MANUAL === "1"
const SITIO = process.env.SITIO ?? "vakdor.com"

describe.skipIf(!activo)("rastreo de un sitio real (solo lectura)", () => {
  it(`lee ${SITIO} y muestra qué encontró`, async () => {
    const t0 = Date.now()
    const r = await rastrearSitio({ sitio: SITIO })
    const segundos = ((Date.now() - t0) / 1000).toFixed(1)

    console.log(`\nsitio: ${SITIO} · ${segundos}s · ${r.desdeSitemap ? "por sitemap" : "recorriendo desde la home"}` +
      ` · páginas leídas: ${r.urlsLeidas} · pedazos guardados: ${r.paginas.length}` +
      `${r.truncado ? " · CORTADO por el tope" : ""}${r.motivo ? ` · motivo: ${r.motivo}` : ""}\n`)

    const porUrl = new Map<string, { titulo: string; caracteres: number; pedazos: number }>()
    for (const p of r.paginas) {
      const previo = porUrl.get(p.url) ?? { titulo: p.titulo, caracteres: 0, pedazos: 0 }
      porUrl.set(p.url, { titulo: p.titulo, caracteres: previo.caracteres + p.texto.length, pedazos: previo.pedazos + 1 })
    }
    for (const [url, d] of porUrl) {
      console.log(`${String(d.caracteres).padStart(6)} car · ${String(d.pedazos)} pedazo(s) · ${d.titulo.slice(0, 45).padEnd(45)} · ${url}`)
    }

    const primera = r.paginas[0]
    if (primera) console.log(`\n--- así lo ve el asistente (primeros 400 caracteres de "${primera.titulo}") ---\n${primera.texto.slice(0, 400)}\n`)

    expect(r.motivo, `no se pudo leer el sitio: ${r.motivo}`).toBeNull()
    expect(r.paginas.length).toBeGreaterThan(0)
  }, 300_000)
})
