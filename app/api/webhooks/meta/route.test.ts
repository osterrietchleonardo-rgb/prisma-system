import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * WEBHOOK DE META, adjuntos del cliente. Lo que se protege:
 *  - un audio que llega se baja de Meta y el mensaje queda con `metadata.media_url`
 *    (hasta el 11/9/2026 nunca se bajaba y el chat mostraba "Error");
 *  - si la descarga falla, el mensaje entra igual y a Meta se le responde 200;
 *  - un texto sigue entrando exactamente como antes, sin tocar Meta ni Storage.
 */

const db = {
  insertados: [] as Record<string, unknown>[],
  updatesMensajes: [] as Array<{ fila: Record<string, unknown>; id: unknown }>,
  subidas: [] as string[],
}

function builder(tabla: string) {
  const ops: Array<{ op: string; args: unknown[] }> = []
  let fila: Record<string, unknown> | null = null
  const b: Record<string, unknown> = {}
  for (const m of ["select", "eq", "order", "limit", "maybeSingle", "single"])
    b[m] = (...args: unknown[]) => { ops.push({ op: m, args }); return b }
  b.insert = (f: Record<string, unknown>) => { fila = f; ops.push({ op: "insert", args: [f] }); return b }
  b.update = (f: Record<string, unknown>) => { fila = f; ops.push({ op: "update", args: [f] }); return b }
  b.then = (resolve: (v: unknown) => void) => {
    const hizo = (op: string) => ops.some(o => o.op === op)
    if (tabla === "whatsapp_instances") return resolve({ data: { id: "inst1", agency_id: "ag1", token: "TOK" }, error: null })
    if (tabla === "wa_messages" && hizo("insert")) { db.insertados.push(fila!); return resolve({ data: { id: "msg1" }, error: null }) }
    if (tabla === "wa_messages" && hizo("update")) {
      db.updatesMensajes.push({ fila: fila!, id: ops.find(o => o.op === "eq")?.args[1] })
      return resolve({ error: null })
    }
    if (tabla === "wa_messages" && hizo("order")) return resolve({ data: [], error: null })
    if (tabla === "wa_messages") return resolve({ data: null, error: null }) // dedup: no existe
    if (tabla === "wa_conversations" && hizo("single")) return resolve({ data: { etiquetas: [], score: 0, status: "active" }, error: null })
    return resolve({ data: null, error: null })
  }
  return b
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (t: string) => builder(t),
    storage: {
      from: (bucket: string) => ({
        upload: async (ruta: string) => { db.subidas.push(`${bucket}/${ruta}`); return { error: null } },
        getPublicUrl: (ruta: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/documents/${ruta}` } }),
      }),
    },
  }),
}))
vi.mock("@/lib/whatsapp/gate-internos", () => ({ buscarInterno: async () => null, procesarMensajeInterno: vi.fn(), crearEnviadorTexto: vi.fn() }))
vi.mock("@/lib/whatsapp/delivery-status", () => ({ actualizarEstadoEntrega: vi.fn() }))
vi.mock("@/lib/whatsapp/n8nTrigger", () => ({ triggerN8nWithSafetyNet: vi.fn(async () => ({})) }))
vi.mock("@/lib/whatsapp/conversations", () => ({
  buscarOCrearConversacion: async () => ({ conv: { id: "conv1", bot_active: true, unread_count: 0, instance_id: "inst1" }, creada: false, error: null }),
}))

const { POST } = await import("./route")

function webhook(message: Record<string, unknown>) {
  return POST(new Request("http://x/api/webhooks/meta", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "pn1" }, contacts: [{ profile: { name: "Fabian" } }], messages: [message] } }] }],
    }),
  }))
}

const AUDIO = { id: "wamid.A", from: "5491100000000", type: "audio", audio: { id: "1665553564971481", voice: true, mime_type: "audio/ogg; codecs=opus" } }

let metaResponde = true
beforeEach(() => {
  db.insertados = []; db.updatesMensajes = []; db.subidas = []
  metaResponde = true
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (!metaResponde) return new Response("{}", { status: 404 })
    if (url.startsWith("https://graph.facebook.com/")) return Response.json({ url: "https://lookaside.fbsbx.com/x", mime_type: "audio/ogg", file_size: 4 })
    return new Response(Buffer.from([79, 103, 103, 83]), { status: 200 })
  }))
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co"
  process.env.SUPABASE_SERVICE_ROLE_KEY = "k"
})

describe("webhook de Meta — adjuntos del cliente", () => {
  it("un audio queda guardado en Storage y el mensaje con su link", async () => {
    const res = await webhook(AUDIO)
    expect(res.status).toBe(200)
    expect(db.insertados[0]).toMatchObject({ content: "Mensaje de voz recibido", message_type: "audio" })
    expect(db.subidas).toEqual(["documents/wa-inbound/ag1/conv1/1665553564971481.ogg"])
    expect(db.updatesMensajes).toHaveLength(1)
    expect(db.updatesMensajes[0].id).toBe("msg1")
    const meta = db.updatesMensajes[0].fila.metadata as Record<string, unknown>
    expect(meta.media_url).toBe("https://x.supabase.co/storage/v1/object/public/documents/wa-inbound/ag1/conv1/1665553564971481.ogg")
    expect(meta.audio).toEqual(AUDIO.audio) // no se pierde lo que mandó Meta
  })

  it("si Meta no entrega el archivo, el mensaje entra igual y se responde 200", async () => {
    metaResponde = false
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const res = await webhook(AUDIO)
    spy.mockRestore()
    expect(res.status).toBe(200)
    expect(db.insertados).toHaveLength(1)
    expect(db.subidas).toEqual([])
    expect(db.updatesMensajes).toEqual([])
  })

  it("un texto entra como siempre, sin llamar a Meta ni a Storage", async () => {
    const res = await webhook({ id: "wamid.T", from: "5491100000000", type: "text", text: { body: "hola" } })
    expect(res.status).toBe(200)
    expect(db.insertados[0]).toMatchObject({ content: "hola", message_type: "text" })
    expect(fetch).not.toHaveBeenCalled()
    expect(db.subidas).toEqual([])
  })
})
