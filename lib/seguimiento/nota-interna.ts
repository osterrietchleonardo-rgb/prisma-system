import type { SupabaseClient } from "@supabase/supabase-js"
import Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"
import { MODELO } from "@/lib/admin-vakdor/marketing/claude"

/** El sistema escribe este marcador con role='internal' al apagarse el bot: NO es una nota del asesor. */
export const MARCADOR_HANDOFF = "⚠️ Handoff activado"

export interface NotaInterna {
  id: string
  content: string
  created_at: string
}

/** La última nota interna REAL del asesor posterior a t0 (excluye el marcador automático). */
export async function notaPosterior(
  db: SupabaseClient,
  conversationId: string,
  t0ISO: string
): Promise<NotaInterna | null> {
  const { data } = await db
    .from("wa_messages")
    .select("id, content, created_at")
    .eq("conversation_id", conversationId)
    .eq("role", "internal")
    .not("content", "like", `${MARCADOR_HANDOFF}%`)
    .gt("created_at", t0ISO)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as NotaInterna | null) ?? null
}

/** Los formatos reales mezclan "+54 11...", "+549..." y "549...": comparamos los últimos 8 dígitos. */
export function coincideTelefono(a: string, b: string): boolean {
  const da = a.replace(/\D/g, "").slice(-8)
  const db_ = b.replace(/\D/g, "").slice(-8)
  return da.length === 8 && da === db_
}

export interface ActividadTracking {
  type: string
  fecha_actividad: string | null
  propiedad_ref: string | null
}

const DIAS_TRACKING = 14

/**
 * Lo que el veredicto necesita saber del registro en PRISMA:
 * - visita registrada = `visit_scheduled_at` en la conversación O una fila futura en
 *   `scheduled_visits` de la agencia cuyo teléfono coincida (últimos 8 dígitos).
 * - actividades del tracking = `performance_logs` del contacto (vía wa_contacts por
 *   teléfono exacto), últimos 14 días. Sin contacto que matchee: lista vacía.
 */
export async function contextoRegistro(
  db: SupabaseClient,
  c: { agency_id: string; contact_phone: string; visit_scheduled_at: string | null },
  ahoraMs: number
): Promise<{ visitaRegistrada: boolean; actividades: ActividadTracking[] }> {
  const hoy = new Date(ahoraMs).toISOString().slice(0, 10)
  const { data: visitas } = await db
    .from("scheduled_visits")
    .select("telefono, fecha_visita")
    .eq("agency_id", c.agency_id)
    .gte("fecha_visita", hoy)
    .limit(50)
  const enCalendario = (visitas ?? []).some((v: { telefono: string | null }) =>
    coincideTelefono(String(v.telefono ?? ""), c.contact_phone))
  const visitaRegistrada = Boolean(c.visit_scheduled_at) || enCalendario

  let actividades: ActividadTracking[] = []
  const { data: contacto } = await db
    .from("wa_contacts").select("id")
    .eq("agency_id", c.agency_id).eq("phone", c.contact_phone).maybeSingle()
  if (contacto?.id) {
    const desde = new Date(ahoraMs - DIAS_TRACKING * 24 * 3600e3).toISOString()
    const { data: acts } = await db
      .from("performance_logs")
      .select("type, fecha_actividad, propiedad_ref")
      .eq("wa_contact_id", contacto.id)
      .gte("created_at", desde)
      .limit(20)
    actividades = (acts ?? []) as ActividadTracking[]
  }
  return { visitaRegistrada, actividades }
}

export const VeredictoNotaSchema = z.object({
  atendido: z.boolean(),
  pedir_registro_chat: z.boolean(),
  pedir_registro_visita: z.boolean(),
  pedir_registro_actividad: z.boolean(),
  razon: z.string().min(1),
})
export type VeredictoNota = z.infer<typeof VeredictoNotaSchema>
export type LlamarVeredicto = (semilla: string) => Promise<VeredictoNota>

/** Decisión de Leonardo (4/9): la nota NO se interpreta con reglas — la lee la IA. */
const PROMPT_NOTA = `Sos el intérprete de notas internas del agente de seguimiento de una inmobiliaria argentina. El sistema escala avisos cuando un cliente queda esperando a un asesor; una nota interna del asesor puede indicar que en realidad ya lo está atendiendo por otro canal. Leé la nota y la conversación y emití un veredicto honesto:
- atendido: true SOLO si la nota indica que el asesor ya está gestionando a ESTE cliente (lo llamó, coordinó una visita, le está resolviendo algo, o pide explícitamente que no se le dé seguimiento). Un recordatorio o un detalle ("ojo que pregunta por cochera") NO es atención.
- pedir_registro_chat: true si la gestión ocurrió fuera de PRISMA (teléfono, presencial) y no quedó registrada en el chat.
- pedir_registro_visita: true SOLO si la nota menciona una visita coordinada Y el dato dice que NO está registrada en el calendario.
- pedir_registro_actividad: true SOLO si la gestión que cuenta la nota no aparece reflejada en las actividades del tracking (mirá tipo, fecha y propiedad de cada actividad contra lo que la nota cuenta y la propiedad consultada).
- razon: una o dos frases en castellano citando la nota; la puede leer el asesor.
Si la nota es ambigua, atendido=false: la escalera existe para que ningún cliente quede sin atender, y un aviso de más molesta menos que un cliente perdido.`

const HERRAMIENTA_VEREDICTO = {
  name: "emitir_veredicto",
  description: "Emití tu veredicto sobre la nota interna.",
  input_schema: {
    type: "object",
    properties: {
      atendido: { type: "boolean" },
      pedir_registro_chat: { type: "boolean" },
      pedir_registro_visita: { type: "boolean" },
      pedir_registro_actividad: { type: "boolean" },
      razon: { type: "string" },
    },
    required: ["atendido", "pedir_registro_chat", "pedir_registro_visita", "pedir_registro_actividad", "razon"],
    additionalProperties: false,
  },
} as const

export function semillaVeredicto(input: {
  nota: NotaInterna
  mensajes: string
  visitaRegistrada: boolean
  actividades: ActividadTracking[]
  propiedadInteres: string | null
  ahoraISO: string
}): string {
  const acts = input.actividades.length
    ? input.actividades.map((a) => `  - ${a.type} · ${a.fecha_actividad ?? "sin fecha"} · ${a.propiedad_ref ?? "sin propiedad"}`).join("\n")
    : "  (ninguna)"
  return [
    `Fecha y hora actual (Argentina): ${input.ahoraISO}`,
    `NOTA INTERNA del asesor (el cliente NO la ve): «${input.nota.content}»`,
    `Propiedad de interés del cliente según sus datos: ${input.propiedadInteres ?? "(sin dato)"}`,
    `Visita registrada en el calendario de PRISMA: ${input.visitaRegistrada ? "SÍ" : "NO"}`,
    `Actividades del asesor en el tracking para este cliente (últimos 14 días):\n${acts}`,
    `Conversación real ([internal] son notas del equipo; el cliente no las ve):\n${input.mensajes}`,
    `Emití tu veredicto con emitir_veredicto.`,
  ].join("\n\n")
}

/** Una sola llamada, tool forzado, sin thinking (incompatible con tool_choice forzado). */
export function crearLlamadaVeredicto(): LlamarVeredicto {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY")
  const client = new Anthropic({ apiKey })
  return async (semilla) => {
    const res = await client.messages.create({
      model: MODELO,
      max_tokens: 1000,
      system: PROMPT_NOTA,
      tools: [HERRAMIENTA_VEREDICTO] as unknown as Anthropic.Messages.ToolUnion[],
      tool_choice: { type: "tool", name: "emitir_veredicto" },
      messages: [{ role: "user", content: semilla }],
    })
    const uso = res.content.find((b) => b.type === "tool_use")
    if (!uso || uso.type !== "tool_use") throw new Error("la IA no emitió veredicto")
    return VeredictoNotaSchema.parse(uso.input)
  }
}
