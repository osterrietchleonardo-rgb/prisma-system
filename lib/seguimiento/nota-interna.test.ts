import { describe, it, expect, vi } from "vitest"
import { MARCADOR_HANDOFF, notaPosterior, coincideTelefono, contextoRegistro, semillaVeredicto, VeredictoNotaSchema, armarAvisoRegistro, procesarNotaDelCaso } from "./nota-interna"
import type { PerfilEquipo } from "./avisos"

/** Fake mínimo: cada from() devuelve una cadena donde todo método se encadena y
 *  maybeSingle() resuelve la primera fila que el test le dio para esa tabla. */
function dbDeUnaTabla(filaMaybeSingle: unknown) {
  const chain: Record<string, unknown> = {}
  for (const m of ["select", "eq", "not", "gt", "gte", "order", "limit", "contains", "in", "lt"])
    chain[m] = () => chain
  chain.maybeSingle = async () => ({ data: filaMaybeSingle })
  return { from: () => chain } as never
}

describe("notaPosterior", () => {
  it("devuelve la nota interna posterior a t0", async () => {
    const fila = { id: "n-1", content: "Ya lo llamé, visita el viernes", created_at: "2026-09-03T21:20:00Z" }
    const nota = await notaPosterior(dbDeUnaTabla(fila), "conv-1", "2026-09-03T20:09:00Z")
    expect(nota).toEqual(fila)
  })
  it("sin nota devuelve null", async () => {
    expect(await notaPosterior(dbDeUnaTabla(null), "conv-1", "2026-09-03T20:09:00Z")).toBeNull()
  })
  it("el marcador automático de handoff existe y arranca con el warning", () => {
    expect(MARCADOR_HANDOFF).toBe("⚠️ Handoff activado")
  })
})

describe("coincideTelefono: últimos 8 dígitos, sin importar el formato", () => {
  it("matchea +54 1150458476 con 5491150458476", () => {
    expect(coincideTelefono("+54 1150458476", "5491150458476")).toBe(true)
  })
  it("no matchea números distintos ni vacíos", () => {
    expect(coincideTelefono("+5491151175948", "5491154054949")).toBe(false)
    expect(coincideTelefono("", "5491154054949")).toBe(false)
  })
})

describe("contextoRegistro", () => {
  // Fake por tabla: from(tabla) elige la respuesta que el test cargó.
  // `gtes` recoge los argumentos de cada .gte(): el fake no filtra, así que la única forma
  // de probar el corte por fecha es mirar con qué valor se consultó.
  function dbPorTabla(tablas: Record<string, unknown>, gtes: Array<[string, unknown]> = []) {
    return {
      from(tabla: string) {
        const respuesta = tablas[tabla]
        const chain: Record<string, unknown> = {}
        for (const m of ["select", "eq", "not", "gt", "order", "limit", "in", "lt"])
          chain[m] = () => chain
        chain.gte = (col: string, val: unknown) => { gtes.push([col, val]); return chain }
        chain.maybeSingle = async () => ({ data: Array.isArray(respuesta) ? respuesta[0] ?? null : respuesta })
        chain.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: respuesta ?? [] }).then(res)
        return chain
      },
    } as never
  }
  const c = { agency_id: "ag-1", contact_phone: "5491136299626", visit_scheduled_at: null }
  const ahora = Date.parse("2026-09-04T12:00:00-03:00")

  it("sin visita en la conversación ni en scheduled_visits ⇒ no registrada; sin contacto ⇒ sin actividades", async () => {
    const r = await contextoRegistro(dbPorTabla({ scheduled_visits: [], wa_contacts: null }), c, ahora)
    expect(r).toEqual({ visitaRegistrada: false, actividades: [] })
  })
  it("una visita futura de scheduled_visits con el mismo teléfono (otro formato) cuenta como registrada", async () => {
    const r = await contextoRegistro(
      dbPorTabla({ scheduled_visits: [{ telefono: "+54 1136299626", fecha_visita: "2026-09-05" }], wa_contacts: null }),
      c, ahora
    )
    expect(r.visitaRegistrada).toBe(true)
  })
  it("visit_scheduled_at en la conversación alcanza solo", async () => {
    const r = await contextoRegistro(dbPorTabla({ scheduled_visits: [], wa_contacts: null }),
      { ...c, visit_scheduled_at: "2026-09-05T15:00:00Z" }, ahora)
    expect(r.visitaRegistrada).toBe(true)
  })
  it("a las 22:30 AR (que en UTC ya es mañana) el corte de visitas usa el día argentino", async () => {
    // 22:30 del 4/9 en Argentina = 01:30 UTC del 5/9. Con el corte en UTC, la visita de HOY
    // (4/9) quedaba afuera y el asesor recibía un pedido de registrar algo ya registrado.
    const gtes: Array<[string, unknown]> = []
    const r = await contextoRegistro(
      dbPorTabla(
        { scheduled_visits: [{ telefono: "+54 1136299626", fecha_visita: "2026-09-04" }], wa_contacts: null },
        gtes
      ),
      c, Date.parse("2026-09-04T22:30:00-03:00")
    )
    expect(gtes.find(([col]) => col === "fecha_visita")?.[1]).toBe("2026-09-04")
    expect(r.visitaRegistrada).toBe(true)
  })
  it("con wa_contact las actividades de performance_logs vuelven", async () => {
    const acts = [{ type: "prospeccion", fecha_actividad: "2026-09-02", propiedad_ref: "Av San Martin 2300" }]
    const r = await contextoRegistro(
      dbPorTabla({ scheduled_visits: [], wa_contacts: { id: "wc-1" }, performance_logs: acts }), c, ahora)
    expect(r.actividades).toEqual(acts)
  })
})

describe("semillaVeredicto: todo lo que la IA necesita, nada inventado", () => {
  const base = {
    nota: { id: "n-1", content: "Ya estamos en contacto, visita el viernes", created_at: "2026-09-03T21:20:00Z" },
    mensajes: "[2026-09-03 17:09] [lead] dale. Le consulto y te aviso",
    visitaRegistrada: false,
    actividades: [],
    propiedadInteres: "Av San Martin al 2300",
    ahoraISO: "2026-09-04 12:00",
  }
  it("incluye la nota, la conversación, la propiedad y el estado del registro", () => {
    const s = semillaVeredicto(base)
    expect(s).toContain("«Ya estamos en contacto, visita el viernes»")
    expect(s).toContain("dale. Le consulto y te aviso")
    expect(s).toContain("Av San Martin al 2300")
    expect(s).toContain("Visita registrada en el calendario de PRISMA: NO")
    expect(s).toContain("(ninguna)")
  })
  it("con visita registrada y actividades lo dice", () => {
    const s = semillaVeredicto({
      ...base, visitaRegistrada: true,
      actividades: [{ type: "prospeccion", fecha_actividad: "2026-09-02", propiedad_ref: "San Martin 2300" }],
    })
    expect(s).toContain("Visita registrada en el calendario de PRISMA: SÍ")
    expect(s).toContain("prospeccion")
    expect(s).toContain("San Martin 2300")
  })
  it("sin propiedad de interés lo dice sin inventar", () => {
    expect(semillaVeredicto({ ...base, propiedadInteres: null })).toContain("sin dato")
  })
})

describe("VeredictoNotaSchema", () => {
  it("acepta el veredicto completo y rechaza el incompleto", () => {
    expect(VeredictoNotaSchema.safeParse({
      atendido: true, pedir_registro_chat: true, pedir_registro_visita: true,
      pedir_registro_actividad: false, razon: "La nota dice que ya lo llamó",
    }).success).toBe(true)
    expect(VeredictoNotaSchema.safeParse({ atendido: true }).success).toBe(false)
  })
})

describe("armarAvisoRegistro: un solo aviso, tono de ayuda, solo los pedidos que aplican", () => {
  const eric: PerfilEquipo = { id: "p-1", full_name: "Eric Zambrana", role: "asesor", email: "e@x.com", phone: "549115..." }
  const conv = { id: "conv-1", contact_phone: "5491136299626", metricas: { nombre: "Nicolás" } }
  const nota = { id: "n-1", content: "Ya estamos en contacto con el cliente, se coordinó una visita para el Viernes", created_at: "2026-09-03T21:20:00Z" }
  const APP = "https://prisma.vakdor.com"

  it("con los tres pedidos: reconoce la gestión, frena la escalera y lista chat + visita + tracking", () => {
    const a = armarAvisoRegistro(eric, conv, nota, {
      atendido: true, pedir_registro_chat: true, pedir_registro_visita: true,
      pedir_registro_actividad: true, razon: "La nota dice que ya lo llamó y coordinó visita",
    }, APP, "Central")
    expect(a.plantilla).toBe("asesor_registro_pendiente")
    expect(a.html).toContain("Perfecto que ya lo estés atendiendo")
    expect(a.html).toContain("se frenaron para este caso")
    expect(a.html).toContain("chat de PRISMA")
    expect(a.html).toContain("calendario")
    expect(a.html).toContain("tracking")
    expect(a.link).toBe("https://prisma.vakdor.com/asesor/leads-whatsapp/conv-1")
    expect(a.variables).toHaveLength(3)
    expect(a.variables[0]).toBe("Eric")
  })
  it("solo el pedido que aplica: sin visita ni tracking no los menciona", () => {
    const a = armarAvisoRegistro(eric, conv, nota, {
      atendido: true, pedir_registro_chat: true, pedir_registro_visita: false,
      pedir_registro_actividad: false, razon: "Gestión telefónica",
    }, APP, "Central")
    expect(a.html).toContain("chat de PRISMA")
    expect(a.html).not.toContain("calendario")
    expect(a.html).not.toContain("tracking")
  })
})

describe("procesarNotaDelCaso", () => {
  const nota = { id: "n-1", content: "Ya lo llamé, visita el viernes", created_at: "2026-09-03T21:20:00Z" }
  const c = { id: "conv-1", agency_id: "ag-1", contact_phone: "5491136299626",
    metricas: { nombre: "Nicolás", propiedad_interes: "San Martin 2300" }, visit_scheduled_at: null }
  const asesor: PerfilEquipo = { id: "p-1", full_name: "Eric Zambrana", role: "asesor", email: "e@x.com", phone: null }
  const t0 = "2026-09-03T20:09:43Z"
  const ahoraMs = Date.parse("2026-09-04T12:00:00-03:00")

  /**
   * Fake con inserts observables. tablas[nombre] puede ser fila (maybeSingle) o lista (then).
   * SÍ respeta `.contains("datos", {...})`: es lo único que distingue las DOS consultas a
   * `lead_eventos` (¿ya hubo veredicto atendido para este caso? vs. ¿esta nota ya se evaluó?).
   * `erroresInsert[tabla]` hace que el insert de esa tabla devuelva `{ error: { message } }`.
   */
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
          return { select: () => ({ single: async () => ({ data: { id: "x" }, error }) }), then: (r: (v: unknown) => unknown) => Promise.resolve({ error }).then(r) }
        }
        return chain
      },
    }
    return { db: db as never, inserts }
  }
  const opciones = (extra: Record<string, unknown> = {}) => ({
    modo: "activo", asesor, appUrl: "https://prisma.vakdor.com", nombreAgencia: "Central", ahoraMs, ...extra,
  })

  it("sin nota: 'sin_nota' y NO llama a la IA", async () => {
    const { db } = armarDb({ wa_messages: null })
    const llamar = async () => { throw new Error("no debería llamar a la IA") }
    expect(await procesarNotaDelCaso(db, c, t0, opciones({ llamar }))).toBe("sin_nota")
  })

  it("nota ya evaluada como atendida: usa el veredicto guardado, sin IA y sin re-aviso", async () => {
    const { db, inserts } = armarDb({
      wa_messages: [nota],
      lead_eventos: [{ datos: { nota_id: "n-1", atendido: true } }],
    })
    const llamar = async () => { throw new Error("no debería re-evaluar") }
    expect(await procesarNotaDelCaso(db, c, t0, opciones({ llamar }))).toBe("atendido_sin_aviso")
    expect(inserts).toHaveLength(0)
  })

  it("nota ya evaluada como NO atendida: la escalera sigue, sin volver a llamar a la IA", async () => {
    const { db, inserts } = armarDb({
      wa_messages: [nota],
      lead_eventos: [{ datos: { nota_id: "n-1", t0, atendido: false } }],
    })
    const llamar = async () => { throw new Error("no debería re-evaluar") }
    expect(await procesarNotaDelCaso(db, c, t0, opciones({ llamar }))).toBe("escalera_sigue")
    expect(inserts).toHaveLength(0)
  })

  it("'atendido' es pegajoso: una segunda nota inofensiva NO re-arma la escalera", async () => {
    // El caso ya tuvo un veredicto atendido (nota n-1). Llega una nota nueva ("ojo, pregunta
    // por cochera"): no se re-evalúa nada y la escalera sigue frenada para este mismo t0.
    const notaB = { id: "n-2", content: "Ojo que pregunta por cochera", created_at: "2026-09-03T22:40:00Z" }
    const { db, inserts } = armarDb({
      wa_messages: [notaB],
      lead_eventos: [{ datos: { nota_id: "n-1", t0, atendido: true } }],
    })
    const llamar = async () => { throw new Error("no debería llamar a la IA") }
    expect(await procesarNotaDelCaso(db, c, t0, opciones({ llamar }))).toBe("atendido_sin_aviso")
    expect(inserts).toHaveLength(0)
  })

  it("si el marcador nota_evaluada no se puede guardar, NO se manda el aviso (si no, se reenvía en cada barrida)", async () => {
    const errores = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      const { db } = armarDb(
        { wa_messages: [nota], lead_eventos: [], scheduled_visits: [], wa_contacts: null },
        { lead_eventos: "boom" }
      )
      const enviados: unknown[] = []
      const enviar = (async (..._args: unknown[]) => { enviados.push(_args[2]); return { email: "enviado", whatsapp: "omitido_plantilla_no_aprobada" } }) as never
      const llamar = async () => ({
        atendido: true, pedir_registro_chat: true, pedir_registro_visita: false,
        pedir_registro_actividad: false, razon: "Gestión telefónica",
      })
      expect(await procesarNotaDelCaso(db, c, t0, opciones({ llamar, enviar }))).toBe("atendido_sin_aviso")
      expect(enviados).toHaveLength(0)
      expect(errores).toHaveBeenCalled()
    } finally {
      errores.mockRestore()
    }
  })

  it("si el marcador falla pero el veredicto era NO atendido, la escalera sigue (nunca frena a un lead que espera)", async () => {
    const errores = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      const { db } = armarDb(
        { wa_messages: [nota], lead_eventos: [], scheduled_visits: [], wa_contacts: null },
        { lead_eventos: "boom" }
      )
      const llamar = async () => ({
        atendido: false, pedir_registro_chat: false, pedir_registro_visita: false,
        pedir_registro_actividad: false, razon: "Es solo un recordatorio",
      })
      expect(await procesarNotaDelCaso(db, c, t0, opciones({ llamar }))).toBe("escalera_sigue")
    } finally {
      errores.mockRestore()
    }
  })

  it("veredicto atendido con pedidos: registra nota_evaluada y manda el aviso (enviar inyectado)", async () => {
    const { db, inserts } = armarDb({
      wa_messages: [nota], lead_eventos: [], scheduled_visits: [], wa_contacts: null,
    })
    const enviados: unknown[] = []
    const enviar = (async (..._args: unknown[]) => { enviados.push(_args[2]); return { email: "enviado", whatsapp: "omitido_plantilla_no_aprobada" } }) as never
    const llamar = async () => ({
      atendido: true, pedir_registro_chat: true, pedir_registro_visita: true,
      pedir_registro_actividad: true, razon: "Gestión telefónica con visita",
    })
    const r = await procesarNotaDelCaso(db, c, t0, opciones({ llamar, enviar }))
    expect(r).toBe("atendido_avisado")
    expect(enviados).toHaveLength(1)
    const evento = inserts.find((i) => i.tabla === "lead_eventos" && (i.fila.tipo as string) === "nota_evaluada")
    expect(evento?.fila.datos).toMatchObject({ nota_id: "n-1", t0, atendido: true })
  })

  it("veredicto NO atendido (nota-recordatorio): la escalera sigue", async () => {
    const { db } = armarDb({ wa_messages: [nota], lead_eventos: [], scheduled_visits: [], wa_contacts: null })
    const llamar = async () => ({
      atendido: false, pedir_registro_chat: false, pedir_registro_visita: false,
      pedir_registro_actividad: false, razon: "Es solo un recordatorio",
    })
    expect(await procesarNotaDelCaso(db, c, t0, opciones({ llamar }))).toBe("escalera_sigue")
  })

  it("en sombra no manda: registra el simulado", async () => {
    const { db, inserts } = armarDb({ wa_messages: [nota], lead_eventos: [], scheduled_visits: [], wa_contacts: null })
    const llamar = async () => ({
      atendido: true, pedir_registro_chat: true, pedir_registro_visita: false,
      pedir_registro_actividad: false, razon: "Ya atendido",
    })
    expect(await procesarNotaDelCaso(db, c, t0, opciones({ modo: "sombra", llamar }))).toBe("atendido_simulado")
    expect(inserts.some((i) => (i.fila.tipo as string) === "aviso_registro_simulado")).toBe(true)
  })

  it("si la IA falla: 'error_ia', evento nota_error, y la escalera sigue como hoy", async () => {
    const { db, inserts } = armarDb({ wa_messages: [nota], lead_eventos: [], scheduled_visits: [], wa_contacts: null })
    const llamar = async () => { throw new Error("API caída") }
    expect(await procesarNotaDelCaso(db, c, t0, opciones({ llamar }))).toBe("error_ia")
    expect(inserts.some((i) => (i.fila.tipo as string) === "nota_error")).toBe(true)
  })
})
