/**
 * PRUEBA MANUAL de punta a punta (17/9): conversa DE VERDAD contra el endpoint del chat web,
 * con el asistente pensando y las herramientas reales, usando el widget de la agencia de PRUEBA
 * (PRISMAIA - VAKDOR). Prende el widget al empezar y lo deja como estaba al terminar.
 * Gasta unos centavos de la cuenta de Anthropic. NO se commitea.
 *
 * Necesita el servidor local andando (npm run dev).
 * Correr: ENDPOINT_MANUAL=1 npx vitest run lib/chat-web/manual-endpoint
 */
import fs from "node:fs"
import path from "node:path"
import { describe, it, expect } from "vitest"

const activo = process.env.ENDPOINT_MANUAL === "1"
const BASE = process.env.CHAT_BASE_URL || "http://localhost:3000"
const ORIGEN_BUENO = "https://www.vakdor.com"

for (const archivo of [".env", ".env.local"]) {
  const ruta = path.resolve(process.cwd(), archivo)
  if (!fs.existsSync(ruta)) continue
  for (const linea of fs.readFileSync(ruta, "utf8").split("\n")) {
    const m = linea.match(/^([A-Z_0-9]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "")
  }
}

describe.skipIf(!activo)("el chat web, de punta a punta", () => {
  it("atiende desde la web de la agencia y rechaza al resto", async () => {
    const { createAdminClient } = await import("@/lib/supabase/admin")
    const db = createAdminClient()

    const { data: w } = await db.from("web_widgets").select("id, activo, dominios").eq("sitio", "https://vakdor.com/").single()
    expect(w?.id, "falta el widget de prueba").toBeTruthy()
    const widgetId = w!.id as string
    const estabaActivo = w!.activo as boolean

    await db.from("web_widgets").update({ activo: true }).eq("id", widgetId)
    const visitanteId = `prueba-${Date.now()}`

    const escribir = async (texto: string, origen = ORIGEN_BUENO) => {
      const t0 = Date.now()
      const r = await fetch(`${BASE}/api/chat-web/mensaje`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origen },
        body: JSON.stringify({ widgetId, visitanteId, texto, paginaOrigen: "https://www.vakdor.com/demostracion" }),
      })
      const cuerpo = await r.json().catch(() => ({}))
      return { estado: r.status, cuerpo, ms: Date.now() - t0 }
    }

    try {
      // 1. Desde otra web: no se atiende ni se cuenta nada.
      const ajeno = await escribir("hola", "https://sitio-de-otro.com")
      console.log(`\ndesde otra web → ${ajeno.estado} ${JSON.stringify(ajeno.cuerpo)}`)
      expect(ajeno.estado).toBe(403)

      // 2. Una conversación real, de tres mensajes.
      for (const texto of [
        "hola, quiero ver una demostración del sistema",
        "soy dueño de una inmobiliaria con 12 asesores en La Plata",
        "dale, mi tel es 11 5060 4928 y me llamo Leo",
      ]) {
        const r = await escribir(texto)
        console.log(`\n[visitante] ${texto}`)
        console.log(`[asistente] (${r.ms} ms) ${r.cuerpo.texto ?? JSON.stringify(r.cuerpo)}`)
        expect(r.estado).toBe(200)
        expect(String(r.cuerpo.texto ?? "").length).toBeGreaterThan(0)
      }

      // 3. Contra la base: qué quedó guardado.
      const { data: conv } = await db
        .from("web_conversaciones")
        .select("id, objetivo, datos, estado, mensajes_count, costo_usd, derivada_a")
        .eq("widget_id", widgetId)
        .eq("visitante_id", visitanteId)
        .single()
      console.log(`\nconversación guardada: ${JSON.stringify(conv, null, 2)}`)

      const { data: msgs } = await db
        .from("web_mensajes")
        .select("rol, texto, pasos, costo_usd")
        .eq("conversacion_id", conv!.id)
        .order("created_at")
      console.log(`mensajes: ${msgs?.length}`)
      for (const m of msgs ?? []) {
        const pasos = Array.isArray(m.pasos) ? (m.pasos as Array<{ herramienta?: string }>).map((p) => p.herramienta).filter(Boolean) : []
        console.log(`  [${m.rol}] ${String(m.texto).slice(0, 90)}${pasos.length ? `  · usó: ${pasos.join(", ")}` : ""}`)
      }
      const costo = Number(conv!.costo_usd ?? 0)
      console.log(`\ncosto de la conversación: US$${costo.toFixed(4)}`)

      expect(msgs!.length).toBeGreaterThanOrEqual(6)
      expect(conv!.objetivo).toBeTruthy()
      expect(costo).toBeGreaterThan(0)
    } finally {
      await db.from("web_widgets").update({ activo: estabaActivo }).eq("id", widgetId)
      console.log(`\nwidget devuelto a activo=${estabaActivo}`)
    }
  }, 300_000)
})
