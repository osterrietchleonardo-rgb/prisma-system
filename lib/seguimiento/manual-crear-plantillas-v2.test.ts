/**
 * ONE-OFF (Task 12b Step 2): crea las 5 plantillas v2 en la WABA de UNA agencia existente,
 * por el mismo camino que `injectCoreTemplates` (Graph API + fila PENDING en wa_templates).
 * ESCRIBE EN META. Correr solo con OK: SEGUIMIENTO_CREAR_PLANTILLAS=<agency_id> npx vitest run lib/seguimiento/manual-crear-plantillas-v2
 * NO se commitea.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"
import { plantillasV2, plantillasEquipo, plantillasWeb } from "@/lib/whatsapp/plantillas-v2"

const agencyId = process.env.SEGUIMIENTO_CREAR_PLANTILLAS

function cargarEnv() {
  for (const l of readFileSync(".env", "utf8").split("\n")) {
    const i = l.indexOf("=")
    if (i > 0 && !l.trim().startsWith("#")) {
      const k = l.slice(0, i).trim()
      const v = l.slice(i + 1).trim().replace(/^["']|["']$/g, "")
      if (v && !process.env[k]) process.env[k] = v
    }
  }
}

describe.skipIf(!agencyId)("crear plantillas v2 en Meta para una agencia", () => {
  it("crea las 5 (o informa cuáles ya existen) y las deja PENDING en wa_templates", { timeout: 300_000 }, async () => {
    cargarEnv()
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

    const { data: agencia } = await db.from("agencies").select("id, name").eq("id", agencyId!).single()
    const { data: inst } = await db.from("whatsapp_instances").select("business_id, token").eq("agency_id", agencyId!).single()
    expect(agencia?.name, "agencia no encontrada").toBeTruthy()
    expect(inst?.business_id && inst?.token, "la instancia no tiene business_id/token").toBeTruthy()

    const prefix = `ag${agencyId!.replace(/-/g, "").substring(0, 6)}`
    const { data: existentes } = await db.from("wa_templates").select("template_name, status").eq("agency_id", agencyId!)
    const ya = new Map((existentes ?? []).map((t) => [t.template_name, t.status]))

    console.log(`\nAgencia: ${agencia!.name} · prefijo ${prefix} · business_id ${String(inst!.business_id).slice(0, 6)}…`)
    const catalogo = process.env.SEGUIMIENTO_CATALOGO ?? "clientes"
    const lista =
      catalogo === "equipo" ? plantillasEquipo(prefix)
      : catalogo === "web" ? plantillasWeb(prefix, agencia!.name)
      : catalogo === "todo" ? [...plantillasV2(prefix, agencia!.name), ...plantillasEquipo(prefix), ...plantillasWeb(prefix, agencia!.name)]
      : plantillasV2(prefix, agencia!.name)
    console.log(`catálogo: ${catalogo} (${lista.length} plantillas)`)
    for (const tpl of lista) {
      if (ya.has(tpl.template_name)) { console.log(`- ${tpl.template_name}: ya existe (${ya.get(tpl.template_name)}) — no se toca`); continue }
      const components = [{ type: "BODY", text: tpl.body, example: { body_text: [tpl.body_examples] } }]
      const res = await fetch(`https://graph.facebook.com/v19.0/${inst!.business_id}/message_templates`, {
        method: "POST",
        headers: { Authorization: `Bearer ${inst!.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: tpl.template_name, category: tpl.category, language: tpl.language, components }),
      })
      const result = await res.json()
      if (!res.ok) { console.log(`- ${tpl.template_name}: META RECHAZÓ → ${result.error?.message} | detalle: ${result.error?.error_user_msg ?? result.error?.error_user_title ?? ""} | ${JSON.stringify(result.error?.error_data ?? {}).slice(0, 200)}`); continue }
      const { error } = await db.from("wa_templates").insert({
        agency_id: agencyId, template_name: tpl.template_name, category: tpl.category,
        language: tpl.language, components, status: result.status ?? "PENDING", meta_template_id: result.id,
      })
      console.log(`- ${tpl.template_name}: creada en Meta (id ${result.id}, status ${result.status ?? "PENDING"}, categoría ${result.category ?? tpl.category})${error ? " · ERROR guardando en wa_templates: " + error.message : " · guardada"}`)
    }
  })
})
