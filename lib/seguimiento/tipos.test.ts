import { describe, it, expect } from "vitest"
import { DecisionSchema, DecisionAgenteSchema, PLANTILLAS } from "./tipos"

describe("DecisionSchema", () => {
  it("acepta una decisión de contactar válida", () => {
    const d = DecisionSchema.parse({
      accion: "contactar",
      plantilla: "seg_f1_seguimiento",
      frase_cierre: "¿Pudiste ver lo de la cochera que te preocupaba?",
      proximo_intento_horas: 72,
      razon: "Preguntó por cochera y no siguió; retomo esa duda puntual.",
      confianza: 0.85,
    })
    expect(d.accion).toBe("contactar")
  })
  it("rechaza contactar sin plantilla", () => {
    expect(() =>
      DecisionSchema.parse({
        accion: "contactar",
        plantilla: null,
        frase_cierre: null,
        proximo_intento_horas: null,
        razon: "x".repeat(20),
        confianza: 0.9,
      })
    ).toThrow()
  })
  it("rechaza confianza fuera de rango", () => {
    expect(() =>
      DecisionSchema.parse({
        accion: "posponer",
        plantilla: null,
        frase_cierre: null,
        proximo_intento_horas: 48,
        razon: "El lead avisó que responde el lunes.",
        confianza: 1.4,
      })
    ).toThrow()
  })
  it("las plantillas de seguimiento existen en el catálogo", () => {
    expect(PLANTILLAS.f1).toBe("seg_f1_seguimiento")
    expect(PLANTILLAS.noShow).toBe("visita_post_noshow")
  })
})

describe("DecisionAgenteSchema", () => {
  it("exige evidencia además de los campos de la decisión", () => {
    const d = DecisionAgenteSchema.parse({
      accion: "contactar",
      plantilla: "seg_f1_seguimiento",
      frase_cierre: "¿Pudiste ver lo de la cochera que te preocupaba?",
      proximo_intento_horas: 72,
      razon: "Preguntó por cochera y no siguió.",
      evidencia: "Mensaje del 16/8 14:00: «¿Tiene cochera el PH?» — sin respuesta posterior del lead.",
      confianza: 0.85,
    })
    expect(d.evidencia).toContain("cochera")
  })
  it("rechaza evidencia vacía o de relleno", () => {
    expect(() =>
      DecisionAgenteSchema.parse({
        accion: "posponer",
        plantilla: null,
        frase_cierre: null,
        proximo_intento_horas: 48,
        razon: "El lead avisó que responde el lunes.",
        evidencia: "n/a",
        confianza: 0.9,
      })
    ).toThrow()
  })
  it("mantiene la coherencia: contactar sin plantilla se rechaza", () => {
    expect(() =>
      DecisionAgenteSchema.parse({
        accion: "contactar",
        plantilla: null,
        frase_cierre: null,
        proximo_intento_horas: null,
        razon: "x".repeat(20),
        evidencia: "y".repeat(20),
        confianza: 0.9,
      })
    ).toThrow()
  })
})
