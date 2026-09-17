/**
 * PRUEBA MANUAL de punta a punta (17/9): rastrea vakdor.com de verdad, le saca los vectores con
 * Gemini y lo guarda en producción, en la agencia de PRUEBA (PRISMAIA - VAKDOR). Nunca toca la
 * agencia del cliente. NO se commitea.
 *
 * Correr: GUARDAR_MANUAL=1 npx vitest run lib/chat-web/manual-guardar
 */
import fs from "node:fs"
import path from "node:path"
import { describe, it, expect } from "vitest"

const activo = process.env.GUARDAR_MANUAL === "1"
const AGENCIA_DE_PRUEBA = "PRISMAIA - VAKDOR"

// .env a mano: vitest no lo carga solo.
for (const archivo of [".env", ".env.local"]) {
  const ruta = path.resolve(process.cwd(), archivo)
  if (!fs.existsSync(ruta)) continue
  for (const linea of fs.readFileSync(ruta, "utf8").split(/\r?\n/)) {
    const m = linea.match(/^([A-Z_0-9]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
  }
}

describe.skipIf(!activo)("guardar el sitio rastreado (producción, agencia de prueba)", () => {
  it("rastrea vakdor.com, saca los vectores y lo deja guardado", async () => {
    const { createAdminClient } = await import("@/lib/supabase/admin")
    const { rastrearSitio } = await import("./rastreo")
    const { guardarRastreo } = await import("./guardar")
    const { almacenSupabase } = await import("./almacen-supabase")
    const { generateEmbedding } = await import("@/lib/gemini")

    const db = createAdminClient()
    const { data: agencia } = await db.from("agencies").select("id, name").eq("name", AGENCIA_DE_PRUEBA).single()
    expect(agencia?.id, `no encontré la agencia de prueba ${AGENCIA_DE_PRUEBA}`).toBeTruthy()
    const agencyId = agencia!.id as string

    // El widget de prueba: apagado, para que no atienda a nadie.
    const { data: widget, error: eWidget } = await db
      .from("web_widgets")
      .upsert(
        { agency_id: agencyId, sitio: "https://vakdor.com/", dominios: ["vakdor.com", "www.vakdor.com"], activo: false },
        { onConflict: "agency_id" }
      )
      .select("id")
      .single()
    expect(eWidget, `no se pudo crear el widget: ${eWidget?.message}`).toBeNull()
    const widgetId = widget!.id as string

    const t0 = Date.now()
    const rastreo = await rastrearSitio({ sitio: "https://vakdor.com/" })
    const tRastreo = ((Date.now() - t0) / 1000).toFixed(1)
    console.log(`\nrastreo: ${rastreo.paginas.length} pedazos de ${rastreo.urlsLeidas} páginas en ${tRastreo}s`)

    const t1 = Date.now()
    const resumen = await guardarRastreo({
      almacen: almacenSupabase(),
      widgetId,
      agencyId,
      resultado: rastreo,
      embeder: (texto) => generateEmbedding(texto, "RETRIEVAL_DOCUMENT"),
    })
    console.log(`guardado: ${JSON.stringify(resumen)} en ${((Date.now() - t1) / 1000).toFixed(1)}s\n`)

    // Contra la base, no contra lo que dice el resumen.
    const { data: filas } = await db
      .from("web_paginas")
      .select("url, titulo, orden, excluida, embedding")
      .eq("widget_id", widgetId)
      .order("url")
    const conVector = (filas ?? []).filter((f) => f.embedding).length
    console.log(`en la base: ${filas?.length} filas, ${conVector} con vector`)
    for (const f of (filas ?? []).slice(0, 5)) console.log(`  ${f.titulo.slice(0, 50).padEnd(50)} · ${f.url}`)

    const { data: w } = await db.from("web_widgets").select("rastreo_estado, rastreo_paginas, rastreo_truncado, rastreo_en").eq("id", widgetId).single()
    console.log(`widget: ${JSON.stringify(w)}`)

    expect(resumen.estado).toBe("ok")
    expect(filas!.length).toBe(rastreo.paginas.length)
    expect(conVector).toBe(filas!.length)
  }, 600_000)
})
