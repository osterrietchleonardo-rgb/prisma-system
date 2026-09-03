import { describe, it, expect } from "vitest"
import {
  armarAvisoAsesorEscalera, armarAvisoDirectorSinRespuesta, casoCuenta, correrEscalamiento, esperandoHumano, horasTexto, nivelQueToca,
} from "./escalamiento"
import type { PerfilEquipo } from "./avisos"

const asesor: PerfilEquipo = { id: "p-asesor", full_name: "Martín Pérez", role: "asesor", email: "m@x.com", phone: "5491100000001" }
const director: PerfilEquipo = { id: "p-dir", full_name: "Víctor López", role: "director", email: "v@x.com", phone: "5491100000009" }
const conv = { id: "conv-1", contact_phone: "5491155550000", metricas: { nombre: "Laura Gómez" } }
const APP = "https://prisma.vakdor.com"
const contexto = { busca: "venta, casa en La Plata", ultimoMensaje: { texto: "¿Se puede visitar el sábado?", fechaAR: "26/8 12:37" } }

describe("esperandoHumano: los dos casos de handoff", () => {
  it("bot apagado (un humano tomó el chat)", () => {
    expect(esperandoHumano({ bot_active: false, metricas: {} })).toBe(true)
  })
  it("bot activo pero derivado / etapa handoff / pidió humano", () => {
    expect(esperandoHumano({ bot_active: true, metricas: { fue_derivado_a_humano: "true" } })).toBe(true)
    expect(esperandoHumano({ bot_active: true, metricas: { etapa: "handoff" } })).toBe(true)
    expect(esperandoHumano({ bot_active: true, metricas: { solicito_hablar_con_humano: "true" } })).toBe(true)
  })
  it("bot activo y sin derivación ⇒ no está esperando a nadie", () => {
    expect(esperandoHumano({ bot_active: true, metricas: { etapa: "calificacion", fue_derivado_a_humano: "false" } })).toBe(false)
  })
})

describe("nivelQueToca: 2 h → 5 h → 10 h → 20 h, cada uno una vez, sin ráfagas", () => {
  it("antes de las 2 h no toca nada", () => expect(nivelQueToca(1.5, [])).toBeNull())
  it("a las 2 h toca el 2; ya mandado, nada hasta las 5", () => {
    expect(nivelQueToca(2.1, [])).toBe(2)
    expect(nivelQueToca(3, [2])).toBeNull()
    expect(nivelQueToca(5, [2])).toBe(5)
  })
  it("si el reloj se perdió niveles, manda solo el más alto alcanzado", () => {
    expect(nivelQueToca(6, [])).toBe(5)
    expect(nivelQueToca(11, [2, 5])).toBe(10)
    expect(nivelQueToca(25, [])).toBe(20)
  })
  it("después del 20 no hay más: el director decide", () => {
    expect(nivelQueToca(30, [2, 5, 10, 20])).toBeNull()
    expect(nivelQueToca(30, [20])).toBeNull()
  })
})

describe("armarAvisoAsesorEscalera", () => {
  it("2 h: plantilla 'cliente esperando' con qué pasa, contexto y link del asesor", () => {
    const a = armarAvisoAsesorEscalera(asesor, conv, { nivel: 2, horas: 2.2, esAsignado: true, contexto }, APP, "Central")
    expect(a.plantilla).toBe("asesor_cliente_esperando")
    expect(a.variables[0]).toBe("Martín")
    expect(a.variables[1]).toBe("Laura Gómez (+5491155550000) lleva 2 horas esperando que lo atiendas. Busca: venta, casa en La Plata. Último mensaje del cliente (26/8 12:37): «¿Se puede visitar el sábado?».")
    expect(a.variables[2]).toBe("https://prisma.vakdor.com/asesor/leads-whatsapp/conv-1")
    expect(a.html).toContain("Qué busca:")
    expect(a.html).toContain("«No lo puedo tomar»")
  })
  it("5 h: avisa que el director también recibe el aviso", () => {
    const a = armarAvisoAsesorEscalera(asesor, conv, { nivel: 5, horas: 5, esAsignado: true }, APP, "C")
    expect(a.variables[1]).toContain("El director también recibe este aviso.")
  })
  it("10 h: plantilla 'sigue esperando' con sus 4 variables", () => {
    const a = armarAvisoAsesorEscalera(asesor, conv, { nivel: 10, horas: 10.4, esAsignado: true, contexto }, APP, "C")
    expect(a.plantilla).toBe("asesor_sigue_esperando")
    expect(a.variables).toEqual(["Martín", "Laura Gómez (+5491155550000), que busca venta, casa en La Plata", "10 horas", "https://prisma.vakdor.com/asesor/leads-whatsapp/conv-1"])
  })
  it("sin asesor asignado va al director con la ruta del director", () => {
    const a = armarAvisoAsesorEscalera(director, conv, { nivel: 2, horas: 2, esAsignado: false }, APP, "C")
    expect(a.link).toBe("https://prisma.vakdor.com/director/leads-whatsapp/conv-1")
    expect(a.html).toContain("no tiene asesor asignado")
  })
})

describe("armarAvisoDirectorSinRespuesta", () => {
  it("trae el dato, el tiempo, el contexto y la acción sugerida", () => {
    const a = armarAvisoDirectorSinRespuesta(director, conv, { asesorNombre: "Martín", horas: 5.2, contexto }, APP, "Central")
    expect(a.asunto).toBe("Laura Gómez lleva 5 horas sin respuesta — Central")
    expect(a.plantilla).toBe("director_asesor_sin_respuesta")
    expect(a.variables[1]).toBe("Martín lleva 5 horas sin responderle a Laura Gómez (+5491155550000), que quedó esperando a un humano. Busca: venta, casa en La Plata. Último mensaje del cliente (26/8 12:37): «¿Se puede visitar el sábado?»")
    expect(a.html).toMatch(/reasignarlo, tomarlo vos o darle más tiempo/)
  })
  it("sin asesor asignado lo dice", () => {
    const a = armarAvisoDirectorSinRespuesta(director, conv, { asesorNombre: null, horas: 20 }, APP, "C")
    expect(a.variables[1]).toBe("Laura Gómez (+5491155550000) lleva 20 horas esperando a un humano y no tiene asesor asignado")
  })
})

describe("horasTexto", () => {
  it("horas hasta 47, después días", () => {
    expect(horasTexto(1)).toBe("1 hora")
    expect(horasTexto(5.4)).toBe("5 horas")
    expect(horasTexto(72)).toBe("3 días")
  })
})

describe("casoCuenta: el reloj arranca el día que se enciende", () => {
  it("sin fecha de encendido cuenta todo (sombra)", () => expect(casoCuenta("2026-08-01T10:00:00Z", null)).toBe(true))
  it("un caso anterior al encendido es backlog: no se persigue", () => {
    expect(casoCuenta("2026-08-26T10:00:00Z", "2026-08-27T12:00:00Z")).toBe(false)
  })
  it("un caso posterior sí", () => expect(casoCuenta("2026-08-27T15:00:00Z", "2026-08-27T12:00:00Z")).toBe(true))
})

describe("correrEscalamiento: nada de madrugada (Kevin, 2/9)", () => {
  // Un instante en hora ARGENTINA (UTC-3 fijo).
  const ar = (iso: string) => Date.parse(iso + "-03:00")

  it("fuera de 6-23 AR no toca ni la base y lo dice", async () => {
    const dbQueNoSePuedeUsar = new Proxy({}, {
      get() { throw new Error("la corrida de madrugada no debería tocar la base") },
    }) as never
    const r = await correrEscalamiento(dbQueNoSePuedeUsar, { ahoraMs: ar("2026-09-03T03:30:00") })
    expect(r).toEqual({ esperando: 0, atendidos: 0, avisos: 0, simulados: 0, fueraDeVentana: true })
  })

  it("a las 23:00 en punto tampoco (la ventana cierra 22:59)", async () => {
    const db = new Proxy({}, { get() { throw new Error("no debería") } }) as never
    const r = await correrEscalamiento(db, { ahoraMs: ar("2026-09-03T23:00:00") })
    expect(r.fueraDeVentana).toBe(true)
  })
})

describe("los niveles se miden en horas hábiles (la noche no corre)", () => {
  // Verificación de la matemática que usa la corrida: un lead de las 3 am NO alcanza el
  // nivel 2 a las 6:30 (0,5 h hábiles) y SÍ a las 8 (2 h); el director (5 h) recién a las 11.
  it("lead de las 3 am: asesor a las 8, director a las 11", async () => {
    const { horasHabiles } = await import("@/lib/whatsapp/sending-window")
    const ar = (iso: string) => Date.parse(iso + "-03:00")
    const t0 = ar("2026-09-03T03:00:00")
    expect(nivelQueToca(horasHabiles(t0, ar("2026-09-03T06:30:00")), [])).toBeNull()
    expect(nivelQueToca(horasHabiles(t0, ar("2026-09-03T08:00:00")), [])).toBe(2)
    expect(nivelQueToca(horasHabiles(t0, ar("2026-09-03T11:00:00")), [2])).toBe(5)
  })
  it("lead de las 22:00: 1 h antes de dormir + 1 h a la mañana = nivel 2 a las 7:00", async () => {
    const { horasHabiles } = await import("@/lib/whatsapp/sending-window")
    const ar = (iso: string) => Date.parse(iso + "-03:00")
    const t0 = ar("2026-09-03T22:00:00")
    expect(nivelQueToca(horasHabiles(t0, ar("2026-09-04T06:45:00")), [])).toBeNull()
    expect(nivelQueToca(horasHabiles(t0, ar("2026-09-04T07:00:00")), [])).toBe(2)
  })
})
