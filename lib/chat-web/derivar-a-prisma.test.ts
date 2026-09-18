import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * La derivación que se queda DENTRO de PRISMA. Lo que se vigila: que no se le robe el chat a otro
 * asesor, que no se apague un bot que estaba trabajando en un chat ajeno, y que si la plantilla no
 * está aprobada se diga el motivo en vez de dar por hecho que la persona recibió algo.
 */

const estado = {
  existente: null as null | { id: string; agent_id: string | null; bot_active: boolean },
  actualizaciones: [] as Array<Record<string, unknown>>,
  enviados: [] as Array<Record<string, unknown>>,
  resultadoEnvio: { resultado: "enviado", wamid: "wamid-1" as string | null, plantilla: "ag_web_primer_contacto" },
}

vi.mock("@/lib/whatsapp/conversations", () => ({
  buscarOCrearConversacion: async (_db: unknown, params: { nueva: Record<string, unknown> }) =>
    estado.existente
      ? { conv: estado.existente, creada: false, error: null }
      : { conv: { id: "nueva-1", agent_id: params.nueva.agent_id, bot_active: false }, creada: true, error: null },
}))

vi.mock("@/lib/whatsapp/enviar-plantilla", () => ({
  enviarPlantillaAlTelefono: async (_db: unknown, agencyId: string, envio: Record<string, unknown>) => {
    estado.enviados.push({ agencyId, ...envio })
    return estado.resultadoEnvio
  },
}))

const db = {
  from: () => ({
    update: (fila: Record<string, unknown>) => ({
      eq: async () => {
        estado.actualizaciones.push(fila)
        return { error: null }
      },
    }),
  }),
} as never

const { derivarDentroDePrisma, PLANTILLA_WEB } = await import("./derivar-a-prisma")

const datos = {
  agencyId: "ag-1",
  perfilId: "a-1",
  telefono: "+54 9 11 5928-9642",
  nombre: "Alicia",
  deQueConsulto: "querías sumarte al equipo.",
}

beforeEach(() => {
  estado.existente = null
  estado.actualizaciones = []
  estado.enviados = []
  estado.resultadoEnvio = { resultado: "enviado", wamid: "wamid-1", plantilla: "ag_web_primer_contacto" }
})

describe("derivarDentroDePrisma", () => {
  it("chat nuevo: queda asignado al asesor y se le escribe al visitante con la plantilla", async () => {
    const r = await derivarDentroDePrisma(db, datos)
    expect(r).toMatchObject({ conversationId: "nueva-1", asignado: true, yaEraDe: null, plantilla: "enviado" })
    expect(estado.enviados[0]).toMatchObject({
      plantilla: PLANTILLA_WEB,
      telefono: "5491159289642",
      variables: ["Alicia", "querías sumarte al equipo."],
    })
  })

  it("chat que existía sin dueño: se lo queda este asesor", async () => {
    estado.existente = { id: "c-9", agent_id: null, bot_active: true }
    const r = await derivarDentroDePrisma(db, datos)
    expect(r.asignado).toBe(true)
    expect(estado.actualizaciones[0]).toMatchObject({ agent_id: "a-1", bot_active: false })
  })

  it("chat que YA era de otro asesor: NO se le roba, y no se le apaga el bot", async () => {
    estado.existente = { id: "c-9", agent_id: "otro-asesor", bot_active: true }
    const r = await derivarDentroDePrisma(db, datos)
    expect(r.asignado).toBe(false)
    expect(r.yaEraDe).toBe("otro-asesor")
    expect(estado.actualizaciones).toHaveLength(0)
    // el aviso sale igual: el lead no se pierde
    expect(estado.enviados).toHaveLength(1)
  })

  it("si el chat ya era de este mismo asesor, no se toca nada", async () => {
    estado.existente = { id: "c-9", agent_id: "a-1", bot_active: false }
    const r = await derivarDentroDePrisma(db, datos)
    expect(r.asignado).toBe(true)
    expect(estado.actualizaciones).toHaveLength(0)
  })

  it("plantilla no aprobada: lo dice, en vez de dar por hecho que le llegó algo", async () => {
    estado.resultadoEnvio = { resultado: "omitido_plantilla_no_aprobada", wamid: null, plantilla: "x" }
    const r = await derivarDentroDePrisma(db, datos)
    expect(r.plantilla).toBe("omitido_plantilla_no_aprobada")
    expect(r.wamid).toBeNull()
    // pero el chat igual quedó creado y asignado: el asesor lo ve en su bandeja
    expect(r.conversationId).toBe("nueva-1")
  })

  it("sin un teléfono usable no se intenta nada", async () => {
    const r = await derivarDentroDePrisma(db, { ...datos, telefono: "1234" })
    expect(r).toMatchObject({ conversationId: null, plantilla: "omitido_sin_celular" })
    expect(estado.enviados).toHaveLength(0)
  })
})
