import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * /api/n8n/reply con el bot APAGADO. Lo que se protege:
 *  - si lo apagó la derivación de Sofía en este mismo turno, su mensaje ("te derivo con...")
 *    SE ENVÍA al cliente (hasta el 16/9/2026 se descartaba: Elian, Mariana, Ines, Julia);
 *  - si lo apagó un asesor con el botón, la respuesta de n8n se sigue DESCARTANDO;
 *  - si el cliente ya volvió a escribir después de la derivación, se DESCARTA (otro turno).
 */

const estado = {
  botActive: true,
  recientes: [] as Array<{ role: string; content: string; created_at: string }>,
  insertados: [] as Record<string, unknown>[],
  envios: [] as string[],
}

function builder(tabla: string) {
  const ops: string[] = []
  let fila: Record<string, unknown> | null = null
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order', 'limit', 'single', 'maybeSingle']) b[m] = () => { ops.push(m); return b }
  b.insert = (f: Record<string, unknown>) => { fila = f; ops.push('insert'); return b }
  b.update = () => { ops.push('update'); return b }
  b.then = (resolve: (v: unknown) => void) => {
    if (tabla === 'wa_conversations' && ops.includes('single'))
      return resolve({ data: { id: 'conv1', agency_id: 'ag1', contact_phone: '5491163306871', bot_active: estado.botActive, instance_id: 'inst1', etiquetas: [], score: 0 }, error: null })
    if (tabla === 'whatsapp_instances')
      return resolve({ data: { token: 'TOK', phone_number_id: 'pn1', evo_instance_name: null, integration_type: 'meta' }, error: null })
    if (tabla === 'wa_messages' && ops.includes('insert')) { estado.insertados.push(fila!); return resolve({ error: null }) }
    if (tabla === 'wa_messages' && ops.includes('order')) return resolve({ data: estado.recientes, error: null })
    return resolve({ data: null, error: null })
  }
  return b
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (t: string) => builder(t),
    channel: () => ({ send: async () => ({}) }),
  }),
}))

const { POST } = await import('./route')

const hace = (seg: number) => new Date(Date.now() - seg * 1000).toISOString()
const MARCA = '⚠️ Handoff activado: El bot se ha desactivado.'

function responderDesdeN8n() {
  return POST(new Request('http://x/api/n8n/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversation_id: 'conv1', reply: 'Buenísimo, Elian. Te derivo con Micaela, la asesora a cargo.' }),
  }))
}

beforeEach(() => {
  estado.botActive = true
  estado.recientes = []
  estado.insertados = []
  estado.envios = []
  delete process.env.N8N_REPLY_SECRET
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    estado.envios.push(String(url))
    return new Response(JSON.stringify({ messages: [{ id: 'wamid.prueba' }] }), { status: 200 })
  }))
})

describe('/api/n8n/reply con el bot apagado', () => {
  it('lo apagó la derivación de Sofía en este turno → el mensaje SE ENVÍA al cliente', async () => {
    estado.botActive = false
    estado.recientes = [
      { role: 'internal', content: MARCA, created_at: hace(15) },
      { role: 'lead', content: 'queria consultarte si comparten comision con colegas', created_at: hace(84) },
    ]
    const r = await (await responderDesdeN8n()).json()
    expect(r.success).toBe(true)
    expect(estado.envios.some((u) => u.includes('graph.facebook.com'))).toBe(true)
    expect(estado.insertados).toHaveLength(1)
  })

  it('lo apagó un asesor con el botón (sin marca) → se DESCARTA, como siempre', async () => {
    estado.botActive = false
    estado.recientes = [{ role: 'lead', content: 'hola', created_at: hace(30) }]
    const r = await (await responderDesdeN8n()).json()
    expect(r.success).toBe(false)
    expect(r.message).toContain('respuesta descartada')
    expect(estado.envios).toHaveLength(0)
    expect(estado.insertados).toHaveLength(0)
  })

  it('el cliente volvió a escribir después de la derivación → se DESCARTA', async () => {
    estado.botActive = false
    estado.recientes = [
      { role: 'lead', content: 'hola? me contestan?', created_at: hace(10) },
      { role: 'internal', content: MARCA, created_at: hace(40) },
    ]
    const r = await (await responderDesdeN8n()).json()
    expect(r.success).toBe(false)
    expect(estado.envios).toHaveLength(0)
  })

  it('bot prendido → se envía normal, sin mirar la derivación', async () => {
    const r = await (await responderDesdeN8n()).json()
    expect(r.success).toBe(true)
    expect(estado.envios).toHaveLength(1)
  })
})
