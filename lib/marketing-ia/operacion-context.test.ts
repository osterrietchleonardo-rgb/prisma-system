import { describe, it, expect } from "vitest"
import { buildOperacionDirective } from "./operacion-context"
import type { AdvisorOperation } from "@/types/marketing-ia"

const base: AdvisorOperation = {
  id: "op-1",
  user_id: "user-1",
  perfil: {
    anios_experiencia: "8 años",
    casos_reales: "Un PH en Flores parado 11 meses, vendido en 34 dias",
    no_prometer: "Nunca prometer un plazo exacto de venta",
    zona_dominio: "",
    especialidad: "",
    operaciones_cerradas: "",
    servicio_incluye: "",
  },
  captacion: {
    propiedades_vendidas_6m: "14",
    porcentaje_acm: "96% del ACM",
    diferencial_confianza: "ACM escrito con comparables reales",
    compradores_activos: "240 compradores",
    tiempo_entrega_acm: "48 horas",
    tiempo_primera_oferta: "21 dias",
    diferencial_esfuerzo: "Pago las fotos y hago los tramites",
  },
  venta: {
    diferencial_confianza: "Le muestro el ACM antes de ofertar",
    rebaja_promedio: "7% promedio",
    exclusivas_offmarket: "18 exclusivas",
    tiempo_primera_seleccion: "24 horas",
    semanas_hasta_reserva: "6 semanas",
    diferencial_esfuerzo: "Consigo planos y verifico deudas",
  },
  oferta_captacion: "Te entrego el ACM en 48 horas y no pagas nada hasta la firma.",
  oferta_venta: "Te mando la primera seleccion en 24 horas y negocio yo la rebaja.",
  oferta_captacion_editada: false,
  oferta_venta_editada: false,
  ofertas_generadas_at: "2026-08-13T10:00:00Z",
  created_at: "2026-08-13T10:00:00Z",
  updated_at: "2026-08-13T10:00:00Z",
}

describe("buildOperacionDirective", () => {
  it("devuelve vacío cuando el asesor no cargó nada (el prompt queda como hoy)", () => {
    expect(buildOperacionDirective(null, "captar")).toBe("")
    expect(buildOperacionDirective(undefined, "vender")).toBe("")
  })

  it("devuelve vacío cuando la fila existe pero está toda vacía", () => {
    const vacia = {
      ...base,
      perfil: {}, captacion: {}, venta: {},
      oferta_captacion: null, oferta_venta: null,
    }
    expect(buildOperacionDirective(vacia, "captar")).toBe("")
  })

  it("con IPC de captar inyecta la oferta de captación y NO la de venta", () => {
    const out = buildOperacionDirective(base, "captar")
    expect(out).toContain("Te entrego el ACM en 48 horas")
    expect(out).not.toContain("Te mando la primera seleccion")
  })

  it("con IPC de vender inyecta la oferta de venta y NO la de captación", () => {
    const out = buildOperacionDirective(base, "vender")
    expect(out).toContain("Te mando la primera seleccion")
    expect(out).not.toContain("Te entrego el ACM en 48 horas")
  })

  it("trae los datos duros del bloque que corresponde, y no los del otro", () => {
    const out = buildOperacionDirective(base, "captar")
    expect(out).toContain("96% del ACM")
    expect(out).toContain("240 compradores")
    expect(out).not.toContain("7% promedio")
  })

  it("suma el perfil profesional y omite los campos vacíos", () => {
    const out = buildOperacionDirective(base, "captar")
    expect(out).toContain("8 años")
    expect(out).toContain("Un PH en Flores")
    expect(out).not.toContain("Matrícula")   // está vacía: no se lista
    expect(out).not.toContain("undefined")
  })

  it("siempre incluye la regla anti-invento y lo que está prohibido prometer", () => {
    for (const tipo of ["captar", "vender"] as const) {
      const out = buildOperacionDirective(base, tipo)
      expect(out).toContain("PROHIBIDO")
      expect(out).toContain("Nunca prometer un plazo exacto de venta")
    }
  })

  it("funciona con el formulario cargado aunque todavía no haya ofertas generadas", () => {
    const sinOfertas = { ...base, oferta_captacion: null, oferta_venta: null }
    const out = buildOperacionDirective(sinOfertas, "captar")
    expect(out).toContain("96% del ACM")
    expect(out).toContain("PROHIBIDO")
  })
})
