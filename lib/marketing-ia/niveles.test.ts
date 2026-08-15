import { describe, it, expect } from "vitest"
import { nivelDesdeIpc, NIVEL_DESCRIPCION } from "./niveles"

describe("nivel de consciencia del IPC", () => {
  it("traduce las 5 etiquetas que guarda el formulario de IPC", () => {
    expect(nivelDesdeIpc({ nivel_conciencia: "Inconsciente" })).toBe(0)
    expect(nivelDesdeIpc({ nivel_conciencia: "Consciente del Problema" })).toBe(1)
    expect(nivelDesdeIpc({ nivel_conciencia: "Consciente de la Solución" })).toBe(2)
    expect(nivelDesdeIpc({ nivel_conciencia: "Consciente del Producto" })).toBe(3)
    expect(nivelDesdeIpc({ nivel_conciencia: "Muy Consciente" })).toBe(4)
  })

  it("cae en 1 cuando el perfil no lo trae o trae cualquier cosa", () => {
    expect(nivelDesdeIpc({})).toBe(1)
    expect(nivelDesdeIpc(null)).toBe(1)
    expect(nivelDesdeIpc({ nivel_conciencia: "cualquier cosa" })).toBe(1)
  })

  it("tolera espacios de más", () => {
    expect(nivelDesdeIpc({ nivel_conciencia: "  Muy Consciente " })).toBe(4)
  })

  it("tiene una descripción para cada uno de los 5 niveles", () => {
    for (const nivel of [0, 1, 2, 3, 4] as const) {
      expect(NIVEL_DESCRIPCION[nivel].length).toBeGreaterThan(20)
    }
  })
})
