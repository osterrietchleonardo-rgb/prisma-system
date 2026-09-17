// lib/farming/tablero.test.ts
import { describe, it, expect } from "vitest"
import { COLUMNAS, tipoSugerido, validarMovimiento, calcularIndicadores, type FilaIndicadores } from "./tablero"

/**
 * El tablero del método. Las reglas que sostiene este archivo:
 *  1. Seis columnas; «descartada» va al costado y NO es una de ellas.
 *  2. **Sin la fecha del próximo paso no se guarda el movimiento** (regla 4 del punto 9 del PDF).
 *     Es lo único que convierte un tablero en un método.
 *  3. Los nueve indicadores salen de lo que el asesor ya movió, sin cargar nada aparte: el
 *     tablero ES el reporte.
 */

describe("las columnas", () => {
  it("son seis, en el orden del método, y descartada no está", () => {
    expect(COLUMNAS).toEqual(["relevado", "presentado", "en_secuencia", "respondio", "tasacion", "captada"])
    expect(COLUMNAS).not.toContain("descartada")
  })
})

describe("tipoSugerido", () => {
  it("propone lo que uno suele hacer al llegar a esa etapa", () => {
    expect(tipoSugerido("presentado")).toBe("carta_1")
    expect(tipoSugerido("tasacion")).toBe("tasacion")
    expect(tipoSugerido("captada")).toBe("entrevista")
  })

  it("una etapa sin costumbre propia cae en «otro», no rompe", () => {
    expect(tipoSugerido("descartada")).toBe("otro")
  })
})

describe("validarMovimiento", () => {
  const ok = { etapa_hasta: "presentado" as const, tipo: "carta_1", proxima_accion: "Volver a pasar", proxima_accion_en: "2026-09-25" }

  it("con qué hiciste, próximo paso y cuándo, se guarda", () => {
    expect(validarMovimiento(ok)).toEqual([])
  })

  it("SIN la fecha no se guarda, y lo dice", () => {
    const e = validarMovimiento({ ...ok, proxima_accion_en: "" })
    expect(e).toHaveLength(1)
    expect(e[0]).toMatch(/cuándo/i)
  })

  it("sin el próximo paso tampoco", () => {
    expect(validarMovimiento({ ...ok, proxima_accion: "   " })).toHaveLength(1)
  })

  it("una etapa que no existe se rechaza", () => {
    expect(validarMovimiento({ ...ok, etapa_hasta: "mudanza" as any })).toHaveLength(1)
  })

  it("un tipo de contacto que no existe se rechaza", () => {
    expect(validarMovimiento({ ...ok, tipo: "paloma mensajera" })).toHaveLength(1)
  })

  it("una fecha que no es una fecha se rechaza", () => {
    expect(validarMovimiento({ ...ok, proxima_accion_en: "el jueves" })).toHaveLength(1)
  })

  it("junta todos los problemas, no corta en el primero", () => {
    expect(validarMovimiento({}).length).toBeGreaterThan(2)
  })
})

describe("calcularIndicadores", () => {
  const filas: FilaIndicadores[] = [
    { tramo: "Conde 900-1000", etapa: "captada", unidades_totales: 32, encargado_nombre: "Roberto",
      contactos: [{ tipo: "visita_encargado", etapa_hasta: "presentado" }, { tipo: "tasacion", etapa_hasta: "tasacion" }] },
    { tramo: "Conde 900-1000", etapa: "respondio", unidades_totales: 8, encargado_nombre: null,
      contactos: [{ tipo: "carta_1", etapa_hasta: "presentado" }, { tipo: "llamada", etapa_hasta: "respondio" }] },
    { tramo: "Av. Ejemplo 1200", etapa: "relevado", unidades_totales: null, encargado_nombre: "Marta",
      contactos: [] },
  ]

  it("cuenta las cuadras distintas que tienen al menos una dirección", () => {
    expect(calcularIndicadores(filas).cuadras).toBe(2)
  })

  it("las propiedades son las tarjetas, y las unidades su suma", () => {
    const i = calcularIndicadores(filas)
    expect(i.propiedades).toBe(3)
    expect(i.unidades).toBe(40)
  })

  it("los contactos son todas las filas del historial", () => {
    expect(calcularIndicadores(filas).contactos).toBe(4)
  })

  it("un encargado cuenta solo si además lo fueron a ver", () => {
    // La tercera tiene encargado pero ninguna visita: no cuenta.
    expect(calcularIndicadores(filas).encargados).toBe(1)
  })

  it("las respuestas son las tarjetas que PASARON por «respondió», aunque después avanzaran", () => {
    expect(calcularIndicadores(filas).respuestas).toBe(1)
  })

  it("tasaciones y entrevistas salen del tipo de contacto", () => {
    const i = calcularIndicadores(filas)
    expect(i.tasaciones).toBe(1)
    expect(i.entrevistas).toBe(0)
  })

  it("las captaciones son las tarjetas que están en «captada» hoy", () => {
    expect(calcularIndicadores(filas).captaciones).toBe(1)
  })

  it("sin ninguna tarjeta, todo en cero y nada explota", () => {
    expect(calcularIndicadores([])).toEqual({
      cuadras: 0, propiedades: 0, unidades: 0, contactos: 0, encargados: 0,
      respuestas: 0, tasaciones: 0, entrevistas: 0, captaciones: 0,
    })
  })

  it("una cuadra sin nombre no inventa una cuadra", () => {
    expect(calcularIndicadores([{ tramo: null, etapa: "relevado", unidades_totales: 1, encargado_nombre: null, contactos: [] }]).cuadras).toBe(0)
  })
})
