/**
 * PRUEBA MANUAL (17/9): busca de verdad en las páginas de vakdor.com ya guardadas.
 * SOLO LECTURA. NO se commitea.
 * Correr: BUSCAR_MANUAL=1 npx vitest run lib/chat-web/manual-buscar
 */
import fs from "node:fs"
import path from "node:path"
import { describe, it, expect } from "vitest"

const activo = process.env.BUSCAR_MANUAL === "1"
for (const archivo of [".env", ".env.local"]) {
  const ruta = path.resolve(process.cwd(), archivo)
  if (!fs.existsSync(ruta)) continue
  for (const linea of fs.readFileSync(ruta, "utf8").split("\n")) {
    const m = linea.match(/^([A-Z_0-9]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "")
  }
}

const PREGUNTAS = [
  "hola, quiero ver una demostración del sistema",
  "cómo hago para que mi inmobiliaria deje de depender de mí",
  "quién está detrás de esto, con quién estoy hablando",
  "cuánto sale un alquiler de 2 ambientes en Caballito",
]

describe.skipIf(!activo)("buscar en el sitio guardado", () => {
  it("responde con la página correcta y su link", async () => {
    const { createAdminClient } = await import("@/lib/supabase/admin")
    const { generateEmbedding } = await import("@/lib/gemini")
    const { buscarPaginas } = await import("./almacen-supabase")
    const { armarContexto, resumenParaElAgente } = await import("./buscar")

    const db = createAdminClient()
    const { data: w } = await db.from("web_widgets").select("id, sitio").eq("sitio", "https://vakdor.com/").single()
    expect(w?.id, "no está el widget de prueba").toBeTruthy()

    for (const pregunta of PREGUNTAS) {
      const t0 = Date.now()
      const vector = await generateEmbedding(pregunta, "RETRIEVAL_QUERY")
      const r = await buscarPaginas(w!.id as string, vector, 3)
      console.log(`\n"${pregunta}"  (${Date.now() - t0} ms)  [${r.estado}]`)
      console.log(`   ${resumenParaElAgente(r)}`)
      for (const p of r.paginas) console.log(`   ${p.parecido.toFixed(3)} · ${p.titulo.slice(0, 48).padEnd(48)} · ${p.url}`)
    }

    const vector = await generateEmbedding(PREGUNTAS[0], "RETRIEVAL_QUERY")
    const ctx = armarContexto((await buscarPaginas(w!.id as string, vector, 3)).paginas, 2500)
    console.log(`\n--- así lo ve el asistente (${ctx.length} caracteres) ---\n${ctx.slice(0, 700)}\n`)
  }, 300_000)
})
