// Análisis de performance del agente IA principal (PRISMA), server-side.
// Trae el prompt vigente desde n8n (solo lectura) + una muestra representativa de las
// conversaciones actuales desde Supabase, y le pide a Gemini que evalúe: fortalezas,
// desvíos vs el prompt (marcando si ya están cubiertos por la última actualización) y
// correcciones óptimas. Se guarda como snapshot scope='agente'.
import { GoogleGenerativeAI } from "@google/generative-ai"
import { getAdminDb } from "@/lib/admin-vakdor/logger"
import { n8nGetAuth } from "./sources/n8n"
import type { AuditSnapshot, Semaforo } from "./types"

const PRISMA_WF = "aNowZdPO_xMlGwKRb54ir"
const AGENT_NODE = "Agente IA CEO"

/** Prompt vigente del agente + fecha de última actualización del workflow. */
async function getAgentPrompt(): Promise<{ prompt: string; updatedAt: string } | null> {
  try {
    const wf = await n8nGetAuth(`/workflows/${PRISMA_WF}`)
    const node = (wf?.nodes ?? []).find((n: any) => n.name === AGENT_NODE)
    const prompt: string = node?.parameters?.options?.systemMessage ?? ""
    if (!prompt) return null
    return { prompt, updatedAt: wf?.updatedAt ?? "" }
  } catch {
    return null
  }
}

/** Muestra representativa: las N conversaciones más recientes con sus mensajes. */
async function getSampleConversations(limite = 8): Promise<{ texto: string; total: number; usadas: number }> {
  const db = getAdminDb()
  const { data: convs } = await db
    .from("wa_conversations")
    .select("id, contact_name, metricas, last_message_at")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(limite)
  const { count: total } = await db.from("wa_conversations").select("*", { count: "exact", head: true })

  const ids = (convs ?? []).map((c) => c.id)
  if (!ids.length) return { texto: "", total: total ?? 0, usadas: 0 }

  const { data: msgs } = await db
    .from("wa_messages")
    .select("conversation_id, role, content, created_at")
    .in("conversation_id", ids)
    .in("role", ["lead", "bot", "human"])
    .order("created_at", { ascending: true })

  // Agrupar por conversación en orden cronológico.
  const porConv = new Map<string, string[]>()
  for (const m of msgs ?? []) {
    const linea = `${m.role === "lead" ? "CLIENTE" : m.role === "human" ? "ASESOR" : "BOT"}: ${String(m.content ?? "").slice(0, 280)}`
    const arr = porConv.get(m.conversation_id as string) ?? []
    arr.push(linea)
    porConv.set(m.conversation_id as string, arr)
  }
  const bloques: string[] = []
  for (const c of convs ?? []) {
    const nombre = (c as any).contact_name ?? "s/n"
    const etapa = (c as any).metricas?.etapa ?? "?"
    const lineas = porConv.get(c.id as string) ?? []
    if (lineas.length) bloques.push(`### Conversación con ${nombre} (etapa: ${etapa})\n${lineas.join("\n")}`)
  }
  return { texto: bloques.join("\n\n"), total: total ?? 0, usadas: bloques.length }
}

const FALLBACK: AuditSnapshot = {
  experto: "whatsapp",
  scope: "agente",
  semaforo: "gris",
  resumen: "No se pudo generar el análisis del agente en esta corrida.",
  metricas: {},
}

export async function auditarAgente(): Promise<AuditSnapshot> {
  try {
    const [promptData, sample] = await Promise.all([getAgentPrompt(), getSampleConversations()])
    if (!promptData || !sample.usadas) return FALLBACK

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return FALLBACK
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" })

    const fechaPrompt = promptData.updatedAt ? promptData.updatedAt.slice(0, 10) : "desconocida"
    const pct = sample.total ? Math.round((sample.usadas / sample.total) * 100) : 0

    const instrucciones = `Sos un auditor de calidad del agente de IA de WhatsApp de una inmobiliaria (PRISMA / Vakdor).
Te doy (A) el PROMPT vigente del agente (última actualización: ${fechaPrompt}) y (B) una muestra de ${sample.usadas} conversaciones reales recientes (~${pct}% del total).
Evaluá qué tan bien el agente cumple SU PROPIO prompt en esas charlas.

Devolvé SOLO un JSON con esta forma exacta (sin texto extra, sin markdown):
{
  "semaforo": "verde|amarillo|rojo",
  "resumen": "2-4 oraciones en español rioplatense, sobrio, sin emojis",
  "fortalezas": ["...", "..."],
  "desvios": [
    {"severidad":"alto|medio|bajo","estado":"abierto|corregido","titulo":"...","detalle":"...","ejemplo":"cita breve de la muestra"}
  ],
  "mejoras": ["...", "..."]
}
Reglas:
- "estado":"corregido" SOLO si el desvío ya está cubierto por una regla que HOY figura en el prompt (la actualización es del ${fechaPrompt}); si el prompt no lo cubre, "abierto".
- semaforo: rojo si hay desvíos altos abiertos; amarillo si hay medios/bajos; verde si cumple bien.
- Sé concreto y honesto; citá ejemplos reales de la muestra. Máximo 5 fortalezas, 5 desvíos, 5 mejoras.

=== A) PROMPT VIGENTE DEL AGENTE ===
${promptData.prompt}

=== B) MUESTRA DE CONVERSACIONES ===
${sample.texto}`

    const res = await model.generateContent(instrucciones)
    const txt = res.response.text().trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim()
    const parsed = JSON.parse(txt)

    const semaforo: Semaforo = ["verde", "amarillo", "rojo"].includes(parsed.semaforo) ? parsed.semaforo : "amarillo"

    return {
      experto: "whatsapp",
      scope: "agente",
      semaforo,
      resumen: parsed.resumen ?? "",
      metricas: {
        muestra: `${sample.usadas} conversaciones (~${pct}% de las actuales)`,
        prompt_ref: `Nodo "${AGENT_NODE}" del workflow PRISMA · última actualización ${fechaPrompt}`,
        nota: `El prompt se actualizó por última vez el ${fechaPrompt}. La muestra son las conversaciones más recientes; los desvíos marcados "corregido" ya están en el prompt vigente y se revalidan en charlas nuevas.`,
        fortalezas: Array.isArray(parsed.fortalezas) ? parsed.fortalezas : [],
        desvios: Array.isArray(parsed.desvios) ? parsed.desvios : [],
        mejoras: Array.isArray(parsed.mejoras) ? parsed.mejoras : [],
      },
    }
  } catch {
    return FALLBACK
  }
}
