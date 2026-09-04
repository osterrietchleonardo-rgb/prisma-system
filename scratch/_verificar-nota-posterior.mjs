// Verificación C1 (review final 4/9): la query EXACTA de notaPosterior contra producción,
// con supabase-js (PostgREST), no con SQL. Solo lectura.
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"

const env = Object.fromEntries(
  readFileSync(".env", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const MARCADOR_HANDOFF = "⚠️ Handoff activado"
const conv = "4bae807b-0b9f-4575-afda-d7c9896da9f2"
const t0 = "2026-09-03T20:09:43.817958+00:00"

// 1) La query tal cual está en nota-interna.ts
const r1 = await db.from("wa_messages").select("id, content, created_at")
  .eq("conversation_id", conv).eq("role", "internal")
  .not("content", "like", `${MARCADOR_HANDOFF}%`)
  .gt("created_at", t0)
  .order("created_at", { ascending: false }).limit(1).maybeSingle()
console.log("notaPosterior →", JSON.stringify(r1))

// 2) Control: sin el filtro del marcador, ¿aparece el marcador? (debe existir en esa conversación)
const r2 = await db.from("wa_messages").select("id, content")
  .eq("conversation_id", conv).eq("role", "internal").gt("created_at", t0)
console.log("todas las internal posteriores →", JSON.stringify(r2.data?.map((m) => m.content.slice(0, 40))), r2.error ?? "")

// 3) Control: el filtro excluye al marcador en una conversación que SOLO tiene el marcador
const r3 = await db.from("wa_messages").select("id, content")
  .eq("conversation_id", "c2f40da4-13f1-4dc1-bd03-ee8a317d134a").eq("role", "internal")
  .not("content", "like", `${MARCADOR_HANDOFF}%`)
console.log("conv solo-marcador, filtrada →", JSON.stringify(r3.data), r3.error ?? "")
