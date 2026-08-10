import { describe, it, expect } from "vitest"
import { normalizar, similitud, hookRepetido } from "./similitud"

describe("normalizar", () => {
  it("baja a minúsculas, saca tildes y puntuación", () => {
    expect(normalizar("¿Tenés QUÉ, dónde?")).toBe("tenes que donde")
  })
})

describe("similitud", () => {
  it("un texto contra sí mismo da 1", () => {
    const t = "el lead entro un sabado a la noche y nadie contesto"
    expect(similitud(t, t)).toBe(1)
  })

  it("dos textos sin relación dan menos de 0,2", () => {
    const a = "tu equipo te interrumpe quince veces al dia por cosas que ya estan resueltas"
    const b = "la tasacion por corazonada deja la propiedad ocho meses publicada"
    expect(similitud(a, b)).toBeLessThan(0.2)
  })

  it("dos aperturas casi iguales (con tildes y mayúsculas distintas) superan 0,45", () => {
    const a = "El lead entró un sábado a la noche y nadie contestó hasta el lunes"
    const b = "el lead entro un sabado a la noche y NADIE contesto hasta el lunes"
    expect(similitud(a, b)).toBeGreaterThan(0.45)
  })

  it("es simétrica", () => {
    const a = "dos asesores llamaron al mismo cliente el mismo dia"
    const b = "dos asesores llamaron al mismo cliente ese dia por dos portales"
    expect(similitud(a, b)).toBeCloseTo(similitud(b, a), 10)
  })

  it("un texto vacío da 0 y no rompe", () => {
    expect(similitud("", "hola que tal como va")).toBe(0)
  })
})

describe("hookRepetido", () => {
  it("marca el repetido y dice contra cuál", () => {
    const previos = ["Tu equipo te interrumpe quince veces al dia", "El lead entro un sabado a la noche"]
    const r = hookRepetido("El lead entró un sábado a la noche", previos)
    expect(r.repetido).toBe(true)
    expect(r.contra).toBe("El lead entro un sabado a la noche")
  })

  it("no marca uno nuevo", () => {
    const previos = ["Tu equipo te interrumpe quince veces al dia"]
    expect(hookRepetido("La tasacion por corazonada te deja ocho meses publicado", previos).repetido).toBe(false)
  })

  it("sin previos nunca marca repetición", () => {
    expect(hookRepetido("cualquier cosa", []).repetido).toBe(false)
  })
})
