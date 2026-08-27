import { describe, it, expect, vi } from "vitest"
import { aplicarSinEnvio, ejecutarDecision, inicioDelDiaAR } from "./ejecutor"
import type { Candidato, ConfigAgencia, Decision } from "./tipos"

const config: ConfigAgencia = {
  agency_id: "a1", modo: "activo", silencio_minimo_horas: 20, max_intentos: 3,
  max_mensajes_dia: 50, escalamiento_horas: 2, max_escalamientos_dia: 3,
}
const base: Candidato = {
  id: "c1", agency_id: "a1", contact_phone: "5491155550000", contact_name: "Belu 🌸",
  funnel_status: "open", visit_status: "none", visit_scheduled_at: null, visit_address: null,
  follow_ups_sent: 0, next_follow_up_at: "2026-08-20T10:00:00Z", last_message_at: "2026-08-20T10:00:00Z",
  metricas: { nombre: "Laura", zona: "Caballito" }, follow_ups_history: [], requires_follow_up: true,
  bot_active: true, opt_out: false,
}
const decision: Decision = {
  accion: "contactar", plantilla: "seg_f1_seguimiento", frase_cierre: "¿Seguís buscando en Caballito?",
  proximo_intento_horas: 72, razon: "Lleva 6 días sin responder y preguntó por Caballito", confianza: 0.9,
}

/** Mock mínimo del cliente de Supabase: encadena todo, resuelve lo que le digan. */
function dbMock(conversacionActual: unknown, opts: { enviadosHoy?: number } = {}) {
  const updates: Array<{ tabla: string; payload: unknown }> = []
  const inserts: Array<{ tabla: string; payload: unknown }> = []
  const from = vi.fn((tabla: string) => {
    const b: Record<string, unknown> = {}
    const self = () => b
    for (const m of ["select", "eq", "gte", "lt", "in", "order", "limit"]) b[m] = vi.fn(self)
    b.update = vi.fn((payload: unknown) => { updates.push({ tabla, payload }); return b })
    b.insert = vi.fn((payload: unknown) => { inserts.push({ tabla, payload }); return b })
    b.single = vi.fn(async () => ({ data: tabla === "wa_conversations" ? conversacionActual : null, error: null }))
    b.maybeSingle = b.single
    b.then = (resolve: (v: unknown) => void) => resolve({ count: opts.enviadosHoy ?? 0, data: null, error: null })
    return b
  })
  return { db: { from } as never, updates, inserts }
}

function fetchOk(body: unknown) {
  return vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body })
}
const OPTS = { origen: "https://prisma.vakdor.com/", dispatchSecret: "s3cret", bypassSecret: "byp4ss" }

describe("ejecutarDecision", () => {
  it("relee la conversación y aborta si entró un mensaje nuevo (no llama al dispatch)", async () => {
    const f = fetchOk({ success: true, wamid: "w1" })
    const { db } = dbMock({ ...base, last_message_at: "2026-08-22T10:00:00Z" })
    const r = await ejecutarDecision(db, decision, base, config, "d1", { ...OPTS, fetchFn: f })
    expect(r.resultado).toBe("bloqueada_conversacion_cambio")
    expect(f).not.toHaveBeenCalled()
  })

  it("con todo OK llama al dispatch con plantilla, nombre de metricas y frase; suma el intento", async () => {
    const f = fetchOk({ success: true, wamid: "wamid.1" })
    const { db, updates } = dbMock({ ...base })
    const r = await ejecutarDecision(db, decision, base, config, "d1", { ...OPTS, fetchFn: f })
    expect(r).toEqual({ resultado: "enviada", wamid: "wamid.1" })
    const [url, init] = f.mock.calls[0]
    expect(url).toBe("https://prisma.vakdor.com/api/whatsapp/dispatch")
    expect(init.headers["x-api-key"]).toBe("s3cret")
    expect(init.headers["x-vercel-protection-bypass"]).toBe("byp4ss")
    const body = JSON.parse(init.body)
    expect(body.template_name).toBe("seg_f1_seguimiento")
    expect(body.variables).toEqual(["Laura", "¿Seguís buscando en Caballito?"])
    expect(body.contact_phone).toBe("5491155550000")
    const conv = updates.find((u) => u.tabla === "wa_conversations")?.payload as Record<string, unknown>
    expect(conv.follow_ups_sent).toBe(1)
    expect(conv.recovery_stage).toBe("follow_up")
    const dec = updates.filter((u) => u.tabla === "seguimiento_decisiones").pop()?.payload
    expect(dec).toEqual({ resultado: "enviada", ejecutada: true })
  })

  it("si el dispatch salta la ventana horaria, queda bloqueada y NO cuenta intento", async () => {
    const f = fetchOk({ success: false, skipped: "fuera_de_ventana_horaria", ventana: "6:00 a 23:00" })
    const { db, updates } = dbMock({ ...base })
    const r = await ejecutarDecision(db, decision, base, config, "d1", { ...OPTS, fetchFn: f })
    expect(r.resultado).toBe("bloqueada_fuera_de_ventana_horaria")
    expect(updates.find((u) => u.tabla === "wa_conversations")).toBeUndefined()
  })

  it("el dispatch responde error ⇒ error_dispatch_<status>, sin tocar el lead", async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => ({ error: "Meta Error: (#132000)" }) })
    const { db, updates } = dbMock({ ...base })
    const r = await ejecutarDecision(db, decision, base, config, "d1", { ...OPTS, fetchFn: f })
    expect(r.resultado).toBe("error_dispatch_502")
    expect(updates.find((u) => u.tabla === "wa_conversations")).toBeUndefined()
  })

  it("OK sin wamid NO es éxito (la lección del 26/8)", async () => {
    const f = fetchOk({ success: true })
    const { db } = dbMock({ ...base })
    const r = await ejecutarDecision(db, decision, base, config, "d1", { ...OPTS, fetchFn: f })
    expect(r.resultado).toBe("error_sin_wamid")
  })

  it("sin nombre válido en metricas no se manda nada (jamás el nombre de WhatsApp)", async () => {
    const f = fetchOk({ success: true, wamid: "w" })
    const c = { ...base, metricas: {} }
    const { db } = dbMock({ ...c })
    const r = await ejecutarDecision(db, decision, c, config, "d1", { ...OPTS, fetchFn: f })
    expect(r.resultado).toBe("bloqueada_sin_nombre")
    expect(f).not.toHaveBeenCalled()
  })

  it("los guardrails de envío frenan antes del dispatch (confianza baja, presupuesto agotado)", async () => {
    const f = fetchOk({ success: true, wamid: "w" })
    const { db } = dbMock({ ...base })
    expect((await ejecutarDecision(db, { ...decision, confianza: 0.3 }, base, config, "d1", { ...OPTS, fetchFn: f })).resultado).toBe("bloqueada_confianza_baja")
    const lleno = dbMock({ ...base }, { enviadosHoy: 50 })
    expect((await ejecutarDecision(lleno.db, decision, base, config, "d1", { ...OPTS, fetchFn: f })).resultado).toBe("bloqueada_presupuesto_diario_agotado")
    expect(f).not.toHaveBeenCalled()
  })

  it("escalar con seg_pendiente: se manda aunque el lead esté en handoff y NO suma intento", async () => {
    const f = fetchOk({ success: true, wamid: "wamid.2" })
    const c = { ...base, metricas: { nombre: "Laura", fue_derivado_a_humano: "true" } }
    const { db, updates } = dbMock({ ...c })
    const esc: Decision = { accion: "escalar", plantilla: "seg_pendiente", frase_cierre: "estoy hablando con el asesor responsable para que te contacte a la brevedad", proximo_intento_horas: 48, razon: "Pidió visita y nadie respondió", confianza: 0.9 }
    const r = await ejecutarDecision(db, esc, c, config, "d2", { ...OPTS, fetchFn: f })
    expect(r.resultado).toBe("enviada")
    const conv = updates.find((u) => u.tabla === "wa_conversations")?.payload as Record<string, unknown>
    expect(conv.follow_ups_sent).toBeUndefined()
    expect(conv.next_follow_up_at).toBeTruthy()
  })

  it("una decisión sin plantilla no manda nada", async () => {
    const f = fetchOk({ success: true, wamid: "w" })
    const { db } = dbMock({ ...base })
    const r = await ejecutarDecision(db, { ...decision, accion: "posponer", plantilla: null, frase_cierre: null }, base, config, "d1", { ...OPTS, fetchFn: f })
    expect(r.resultado).toBe("bloqueada_sin_plantilla")
    expect(f).not.toHaveBeenCalled()
  })
})

describe("aplicarSinEnvio", () => {
  it("posponer mueve next_follow_up_at y marca la decisión ejecutada", async () => {
    const { db, updates } = dbMock({ ...base })
    const r = await aplicarSinEnvio(db, { ...decision, accion: "posponer", plantilla: null, frase_cierre: null, proximo_intento_horas: 48 }, base, "d1")
    expect(r).toBe("pospuesta")
    const conv = updates.find((u) => u.tabla === "wa_conversations")?.payload as Record<string, unknown>
    expect(Date.parse(String(conv.next_follow_up_at)) - Date.now()).toBeGreaterThan(47 * 3600e3)
  })
  it("abandonar apaga el seguimiento pero NUNCA cierra como perdido", async () => {
    const { db, updates } = dbMock({ ...base })
    const r = await aplicarSinEnvio(db, { ...decision, accion: "abandonar", plantilla: null, frase_cierre: null }, base, "d1")
    expect(r).toBe("abandonada")
    const conv = updates.find((u) => u.tabla === "wa_conversations")?.payload as Record<string, unknown>
    expect(conv.requires_follow_up).toBe(false)
    expect(conv.funnel_status).toBeUndefined()
  })
})

describe("inicioDelDiaAR", () => {
  it("a las 01:00 UTC del 27/8 el día argentino todavía es el 26/8", () => {
    expect(inicioDelDiaAR(new Date("2026-08-27T01:00:00Z"))).toBe("2026-08-26T03:00:00.000Z")
  })
})
