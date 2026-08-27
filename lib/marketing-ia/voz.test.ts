import { describe, it, expect } from "vitest"
import { REGLA_VOZ } from "./voz"

describe("regla de voz de Marketing IA", () => {
  // Caso real: una pieza generada para un asesor de Central salió diciendo
  // "Yo me encargo de todo el trabajo pesado". La oficina lo prohíbe.
  it("prohíbe la primera persona del singular con el ejemplo exacto que falló", () => {
    expect(REGLA_VOZ).toContain("PROHIBIDA la primera persona del singular")
    expect(REGLA_VOZ.toLowerCase()).toContain("yo me encargo")
  })

  it("dice qué escribir en lugar de eso, no solo qué no", () => {
    expect(REGLA_VOZ).toContain("nos encargamos")
  })

  it("no se lleva puestos los datos del asesor: los reencuadra", () => {
    expect(REGLA_VOZ).toContain("matrícula")
  })
})
