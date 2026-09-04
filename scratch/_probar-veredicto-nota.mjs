// Prueba en seco del veredicto de "notas internas" (Task 8, feat/notas-internas-ia).
// Llama UNA VEZ a la API real de Anthropic con los datos REALES del caso Nicolás Bellia
// (nota 93d75166 de la conversación 4bae807b-0b9f-4575-afda-d7c9896da9f2, verificados el
// 4/9 con scratch/_sa-query.mjs). CERO escrituras: ni a Supabase ni a ningún lado.
//
// Uso:
//   node scratch/_probar-veredicto-nota.mjs                 -> nota real de Eric
//   node scratch/_probar-veredicto-nota.mjs --recordatorio  -> nota inventada, mismo caso
//
// PROMPT_NOTA, la herramienta y el armado de semilla están copiados VERBATIM de
// lib/seguimiento/nota-interna.ts (no se puede importar TS desde un .mjs suelto). Si se
// edita el prompt allá, hay que re-copiarlo acá.
import { readFileSync } from "node:fs"

const env = Object.fromEntries(
  readFileSync(".env", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
)
const apiKey = env.ANTHROPIC_API_KEY
if (!apiKey) { console.error("falta ANTHROPIC_API_KEY en .env"); process.exit(1) }

const MODELO = "claude-sonnet-5"

// ---- copiado VERBATIM de lib/seguimiento/nota-interna.ts (4/9) --------------------------
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
}

function semillaVeredicto(input) {
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
// ---- fin copia verbatim -------------------------------------------------------------------

// ---- datos REALES del caso (verificados 4/9 con scratch/_sa-query.mjs) -------------------
// SELECT id, content, created_at FROM wa_messages WHERE id='93d75166-1dcf-42f4-a81d-503eb92cd4bd'
const NOTA_REAL = {
  id: "93d75166-1dcf-42f4-a81d-503eb92cd4bd",
  content: "Ya estamos en contacto con el cliente, se coordino una visita para el Viernes .-",
  created_at: "2026-09-03 21:20:32.352611+00",
}
const NOTA_RECORDATORIO = {
  id: NOTA_REAL.id, // inventada, misma conversación — solo cambia el texto
  content: "ojo: pregunta siempre por cochera",
  created_at: NOTA_REAL.created_at,
}

// SELECT role, content, created_at FROM wa_messages WHERE conversation_id='4bae807b-0b9f-4575-afda-d7c9896da9f2' ORDER BY created_at
const MENSAJES_CRUDOS = [
  { role: "lead", content: "Hola, vi en Argenprop este Departamento en Venta en Paternal y quiero más información por WhatsApp. https://www.argenprop.com/departamento-en-venta-en-paternal-2-ambientes--20341773", created_at: "2026-09-03 19:59:25.027051+00" },
  { role: "bot", content: "Hola, gracias por contactarte con nosotros. Soy Sofía, asistente de CENTRAL REAL ESTATE ARGENTINA. Ya me fijo en la propiedad que me pasaste. ¿Con quién tengo el gusto?", created_at: "2026-09-03 20:00:33.693426+00" },
  { role: "lead", content: "hola!", created_at: "2026-09-03 20:03:07.484016+00" },
  { role: "lead", content: "con nicolas", created_at: "2026-09-03 20:03:08.25896+00" },
  { role: "bot", content: "Hola Nico, ya tengo la ficha de la propiedad que me pasaste.", created_at: "2026-09-03 20:04:57.427876+00" },
  { role: "bot", content: "Av San martin al 2300 - 118.000 USD\n2 amb, 1 dorm, 1 baño · 4 años\nOrientación Noreste · Estado: Excelente\nApto crédito: Sí · Apto mascotas\nCocheras: 1 (0 cubierta/s)\nDisponible para entrar\nMuy buena opción si buscás algo listo para escriturar, con balcón, cochera y en un edificio de categoría.\nFicha completa: https://ficha.info/p/eCQowdyDAoi2Da", created_at: "2026-09-03 20:05:00.744357+00" },
  { role: "bot", content: "Para ubicarte mejor con opciones parecidas, ¿en qué presupuesto aproximado te estás manejando?", created_at: "2026-09-03 20:05:09.93206+00" },
  { role: "lead", content: "Mensaje de voz recibido", created_at: "2026-09-03 20:06:51.257684+00" },
  { role: "bot", content: "Hola, bien por suerte, gracias. Sí, en la ficha figura con 1 cochera.", created_at: "2026-09-03 20:08:13.991337+00" },
  { role: "bot", content: "Y perfecto, si a Carlos le interesa verlo el sábado, decime en qué franja horaria le queda cómodo y se lo paso al asesor para que coordine.", created_at: "2026-09-03 20:08:22.035694+00" },
  { role: "lead", content: "dale. Le consulto y te aviso", created_at: "2026-09-03 20:09:43.817958+00" },
  { role: "bot", content: "Dale, perfecto. Cuando lo tengan, pasame días y franjas horarias y se lo paso al asesor para que coordine.", created_at: "2026-09-03 20:10:53.879133+00" },
  { role: "internal", content: NOTA_REAL.content, created_at: "2026-09-03 21:20:32.352611+00" },
]

// SELECT metricas->>'propiedad_interes' AS p, metricas->>'propiedad_consultada' AS pc FROM wa_conversations WHERE id='4bae807b-0b9f-4575-afda-d7c9896da9f2'
const PROPIEDAD_INTERES = "Av San martin al 2300"

// Verificado en producción el 4/9: sin visit_scheduled_at, sin fila futura en scheduled_visits
// para +5491136299626, sin performance_logs para ese contacto.
const VISITA_REGISTRADA = false
const ACTIVIDADES = []

// Misma que usa lib/seguimiento/herramientas.ts: FECHA_HORA_AR
const FECHA_HORA_AR = (d) =>
  new Date(d).toLocaleString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }).slice(0, 16)

function formatearMensajes(mensajes) {
  return (
    "(horas en Argentina)\n" +
    mensajes.map((m) => `[${FECHA_HORA_AR(m.created_at)}] [${m.role}] ${String(m.content).slice(0, 400)}`).join("\n")
  )
}

// ---- armado del caso, según flag -----------------------------------------------------------
const esRecordatorio = process.argv.includes("--recordatorio")
const nota = esRecordatorio ? NOTA_RECORDATORIO : NOTA_REAL
// La transcripción tiene que ser CONSISTENTE con la nota que se está evaluando: se
// reemplaza el texto de la última nota interna por el mismo texto que va en NOTA INTERNA.
const mensajesConNota = MENSAJES_CRUDOS.map((m, i) =>
  i === MENSAJES_CRUDOS.length - 1 ? { ...m, content: nota.content } : m
)

const semilla = semillaVeredicto({
  nota,
  mensajes: formatearMensajes(mensajesConNota),
  visitaRegistrada: VISITA_REGISTRADA,
  actividades: ACTIVIDADES,
  propiedadInteres: PROPIEDAD_INTERES,
  ahoraISO: "2026-09-04 12:00",
})

console.log("=".repeat(80))
console.log(`CASO: ${esRecordatorio ? "nota-recordatorio (inventada)" : "nota real de Eric (Nicolás Bellia)"}`)
console.log("=".repeat(80))
console.log("\n--- SEMILLA ENVIADA ---\n")
console.log(semilla)

const res = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  },
  body: JSON.stringify({
    model: MODELO,
    max_tokens: 1000,
    system: PROMPT_NOTA,
    tools: [HERRAMIENTA_VEREDICTO],
    tool_choice: { type: "tool", name: "emitir_veredicto" },
    messages: [{ role: "user", content: semilla }],
  }),
})
const data = await res.json()
if (!res.ok) { console.error("ERROR", res.status, JSON.stringify(data, null, 1)); process.exit(1) }

const uso = (data.content ?? []).find((b) => b.type === "tool_use")
console.log("\n--- RESPUESTA CRUDA DE LA API ---\n")
console.log(JSON.stringify(data, null, 1))
console.log("\n--- VEREDICTO (tool_use.input) ---\n")
console.log(JSON.stringify(uso?.input ?? null, null, 1))
