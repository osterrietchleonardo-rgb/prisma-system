import { describe, it, expect } from "vitest"
import { MAX_PARTES, demoraDeEscritura, partirEnMensajes } from "./partir-mensajes"

describe("partirEnMensajes: como escribe una persona, de a un mensaje", () => {
  it("una respuesta corta va entera, en un solo mensaje", () => {
    expect(partirEnMensajes("Hola, ¿en qué te puedo ayudar?")).toEqual(["Hola, ¿en qué te puedo ayudar?"])
  })

  it("dos ideas separadas por punto y aparte son dos mensajes", () => {
    const partes = partirEnMensajes("Buenísimo, gracias por contarme.\n\n¿Me pasás tu teléfono así te contactan?")
    expect(partes).toHaveLength(2)
    expect(partes[1]).toContain("teléfono")
  })

  it("un párrafo largo se corta por oraciones, sin cortar palabras", () => {
    const largo =
      "PRISMA es el sistema de Vakdor para inmobiliarias que quieren dejar de operar a ciegas. " +
      "Se conecta con tu CRM y con tu WhatsApp, y te da trazabilidad de lo que hace cada asesor. " +
      "Ya lo usa una inmobiliaria con 60 asesores."
    const partes = partirEnMensajes(largo)
    expect(partes.length).toBeGreaterThan(1)
    for (const p of partes) expect(p.trim()).toBe(p)
    expect(partes.join(" ")).toBe(largo.trim())
  })

  it("nunca parte un link al medio: el visitante tiene que poder tocarlo", () => {
    const con = "Podés verlo acá: https://www.vakdor.com/sobre-mi y me contás qué te parece."
    for (const parte of partirEnMensajes(con)) {
      const mitad = parte.includes("https://www.vakdor.com/sobre-mi")
      const nada = !parte.includes("vakdor.com")
      expect(mitad || nada, parte).toBe(true)
    }
  })

  it("no manda una catarata: como mucho unas pocas burbujas", () => {
    const enorme = Array.from({ length: 20 }, (_, i) => `Esta es la oración número ${i} del texto.`).join(" ")
    expect(partirEnMensajes(enorme).length).toBeLessThanOrEqual(MAX_PARTES)
  })

  it("no deja una burbuja huérfana de dos palabras", () => {
    for (const parte of partirEnMensajes("Perfecto, quedamos así entonces. Gracias.")) {
      expect(parte.length).toBeGreaterThan(8)
    }
  })

  it("un texto vacío no genera burbujas vacías", () => {
    expect(partirEnMensajes("   ")).toEqual([])
    expect(partirEnMensajes("Hola\n\n\n\nChau")).toEqual(["Hola", "Chau"])
  })
})

describe("demoraDeEscritura: el tiempo que tarda alguien en escribir eso", () => {
  it("un mensaje largo tarda más que uno corto", () => {
    expect(demoraDeEscritura("Hola")).toBeLessThan(demoraDeEscritura("Hola, ".repeat(40)))
  })
  it("nunca es instantáneo ni eterno", () => {
    expect(demoraDeEscritura("Hola")).toBeGreaterThanOrEqual(400)
    expect(demoraDeEscritura("x".repeat(5000))).toBeLessThanOrEqual(2500)
  })
})
