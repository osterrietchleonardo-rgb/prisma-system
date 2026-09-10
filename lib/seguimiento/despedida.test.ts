import { describe, it, expect } from "vitest"
import { VeredictoDespedidaSchema, semillaDespedida, procesarDespedidaDelCaso } from "./despedida"

describe("VeredictoDespedidaSchema", () => {
  it("acepta el veredicto completo y rechaza el incompleto", () => {
    expect(VeredictoDespedidaSchema.parse({ requiere_respuesta: false, razon: "Cerró con un gracias" })).toEqual({
      requiere_respuesta: false, razon: "Cerró con un gracias",
    })
    expect(() => VeredictoDespedidaSchema.parse({ requiere_respuesta: true })).toThrow()
    expect(() => VeredictoDespedidaSchema.parse({ requiere_respuesta: "no", razon: "x" })).toThrow()
  })
})

describe("semillaDespedida: la conversación entera y la hora, nada inventado", () => {
  it("incluye la fecha, la conversación y el pedido del veredicto", () => {
    const s = semillaDespedida({
      mensajes: "(horas en Argentina)\n[2026-09-06 10:00] [human] te habla Micaela\n[2026-09-06 10:01] [lead] Gracias!!",
      ahoraISO: "2026-09-06 12:31",
      botApagadoDesde: null,
    })
    expect(s).toContain("2026-09-06 12:31")
    expect(s).toContain("[lead] Gracias!!")
    expect(s).toContain("emitir_veredicto")
    expect(s).toContain("ENCENDIDO")
  })
  it("con el bot apagado lo dice y desde cuándo (Alex, 7/9: un asesor tomó el chat sin escribir)", () => {
    const s = semillaDespedida({ mensajes: "[lead] Mi nombre es alex", ahoraISO: "2026-09-07 12:01", botApagadoDesde: "2026-09-04 15:14", nombreBot: "Lara" })
    expect(s).toContain("APAGADO desde 2026-09-04 15:14")
    expect(s).not.toContain("ENCENDIDO")
    // el nombre del bot viene de la agencia (Lara en PRISMAIA), nunca a mano
    expect(s).toContain("Bot (Lara) en este chat")
    expect(s).not.toContain("Sofía")
  })
})

describe("procesarDespedidaDelCaso", () => {
  const c = { id: "conv-1", agency_id: "ag-1", contact_phone: "5491170637789", metricas: { nombre: "Agustins" }, bot_active: false }
  const t0 = "2026-09-06T13:01:00Z"
  const ahoraMs = Date.parse("2026-09-06T12:31:00-03:00")

  /** Fake por tabla con inserts observables; respeta `.contains("datos", {...})` para que el
   *  marcador `despedida_evaluada` se busque por t0 de verdad. */
  function armarDb(tablas: Record<string, unknown>, erroresInsert: Record<string, string> = {}) {
    const inserts: Array<{ tabla: string; fila: Record<string, unknown> }> = []
    const db = {
      from(tabla: string) {
        const respuesta = tablas[tabla]
        let filtroDatos: Record<string, unknown> | null = null
        const filas = (): Array<Record<string, unknown>> => {
          const lista = Array.isArray(respuesta)
            ? (respuesta as Array<Record<string, unknown>>)
            : respuesta == null ? [] : [respuesta as Record<string, unknown>]
          if (!filtroDatos) return lista
          const f = filtroDatos
          return lista.filter((fila) => {
            const d = (fila.datos ?? {}) as Record<string, unknown>
            return Object.entries(f).every(([k, v]) => d[k] === v)
          })
        }
        const chain: Record<string, unknown> = {}
        for (const m of ["select", "eq", "not", "gt", "gte", "order", "limit", "in", "lt"])
          chain[m] = () => chain
        chain.contains = (col: string, val: Record<string, unknown>) => {
          if (col === "datos") filtroDatos = val
          return chain
        }
        chain.maybeSingle = async () => ({ data: filas()[0] ?? null })
        chain.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: filas() }).then(res)
        chain.insert = (fila: Record<string, unknown>) => {
          inserts.push({ tabla, fila })
          const error = erroresInsert[tabla] ? { message: erroresInsert[tabla] } : null
          return { then: (r: (v: unknown) => unknown) => Promise.resolve({ error }).then(r) }
        }
        return chain
      },
    }
    return { db: db as never, inserts }
  }
  const mensajes = [
    { role: "human", content: "te habla Micaela", created_at: "2026-09-06T12:59:00Z" },
    { role: "lead", content: "Gracias!!", created_at: "2026-09-06T13:01:00Z" },
  ]

  it("la IA dice que NO requiere respuesta: 'despedida', queda el marcador con t0 y la razón", async () => {
    const { db, inserts } = armarDb({ wa_messages: mensajes, lead_eventos: [] })
    const llamar = async () => ({ requiere_respuesta: false, razon: "Cerró con «Gracias!!» tras la respuesta de Micaela" })
    const r = await procesarDespedidaDelCaso(db, c, t0, { ahoraMs, llamar })
    expect(r).toEqual({ resultado: "despedida", llamoIA: true })
    const marca = inserts.find((i) => i.tabla === "lead_eventos")!
    expect(marca.fila.tipo).toBe("despedida_evaluada")
    expect(marca.fila.datos).toEqual({ t0, requiere_respuesta: false, razon: "Cerró con «Gracias!!» tras la respuesta de Micaela" })
    expect(String(marca.fila.descripcion)).toContain("no espera respuesta")
  })

  it("la IA dice que SÍ requiere respuesta: 'requiere_respuesta' y la escalera sigue", async () => {
    const { db, inserts } = armarDb({ wa_messages: mensajes, lead_eventos: [] })
    const llamar = async () => ({ requiere_respuesta: true, razon: "Pregunta por la dirección" })
    const r = await procesarDespedidaDelCaso(db, c, t0, { ahoraMs, llamar })
    expect(r).toEqual({ resultado: "requiere_respuesta", llamoIA: true })
    expect(inserts.find((i) => i.tabla === "lead_eventos")!.fila.tipo).toBe("despedida_evaluada")
  })

  it("una evaluación por caso: con marcador previo para este t0 usa lo guardado y NO llama a la IA", async () => {
    const { db, inserts } = armarDb({
      wa_messages: mensajes,
      lead_eventos: [
        { datos: { t0: "2026-09-01T10:00:00Z", requiere_respuesta: true } }, // otro caso, no cuenta
        { datos: { t0, requiere_respuesta: false } },
      ],
    })
    const llamar = async () => { throw new Error("no debería llamar a la IA") }
    const r = await procesarDespedidaDelCaso(db, c, t0, { ahoraMs, llamar })
    expect(r).toEqual({ resultado: "despedida", llamoIA: false })
    expect(inserts).toHaveLength(0)
  })

  it("el marcador previo que dijo 'requiere respuesta' también se respeta sin IA", async () => {
    const { db } = armarDb({ wa_messages: mensajes, lead_eventos: [{ datos: { t0, requiere_respuesta: true } }] })
    const llamar = async () => { throw new Error("no debería llamar a la IA") }
    expect(await procesarDespedidaDelCaso(db, c, t0, { ahoraMs, llamar })).toEqual({ resultado: "requiere_respuesta", llamoIA: false })
  })

  it("la semilla le cuenta a la IA que el bot está apagado y desde cuándo (último evento bot_apagado)", async () => {
    const { db } = armarDb({ wa_messages: mensajes, lead_eventos: [{ tipo: "bot_apagado", ts: "2026-09-04T18:14:00Z" }] })
    let semilla = ""
    const llamar = async (s: string) => { semilla = s; return { requiere_respuesta: true, razon: "Lo tomó un asesor y no escribió" } }
    await procesarDespedidaDelCaso(db, c, t0, { ahoraMs, llamar })
    expect(semilla).toContain("APAGADO desde 2026-09-04 15:14")
  })

  it("con el bot encendido la semilla lo dice y no consulta el apagado", async () => {
    const { db } = armarDb({ wa_messages: mensajes, lead_eventos: [] })
    let semilla = ""
    const llamar = async (s: string) => { semilla = s; return { requiere_respuesta: true, razon: "x" } }
    await procesarDespedidaDelCaso(db, { ...c, bot_active: true }, t0, { ahoraMs, llamar })
    expect(semilla).toContain("ENCENDIDO")
  })

  it("si la IA falla: 'error_ia', evento despedida_error, y la escalera sigue como hoy", async () => {
    const { db, inserts } = armarDb({ wa_messages: mensajes, lead_eventos: [] })
    const llamar = async () => { throw new Error("API caída") }
    const r = await procesarDespedidaDelCaso(db, c, t0, { ahoraMs, llamar })
    expect(r).toEqual({ resultado: "error_ia", llamoIA: true })
    const ev = inserts.find((i) => i.tabla === "lead_eventos")!
    expect(ev.fila.tipo).toBe("despedida_error")
    expect(ev.fila.datos).toEqual({ t0 })
  })

  it("si el marcador no se pudo guardar, el veredicto igual manda (no se avisa a nadie por una despedida)", async () => {
    const { db } = armarDb({ wa_messages: mensajes, lead_eventos: [] }, { lead_eventos: "RLS" })
    const llamar = async () => ({ requiere_respuesta: false, razon: "Cerró con un gracias" })
    expect(await procesarDespedidaDelCaso(db, c, t0, { ahoraMs, llamar })).toEqual({ resultado: "despedida", llamoIA: true })
  })
})
