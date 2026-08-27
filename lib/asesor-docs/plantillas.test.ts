import { describe, it, expect } from "vitest"
import {
  armarFilas,
  estadoDePlantilla,
  explicacionDelEstado,
  MINIMO_PARA_DETECTAR,
  motivoParaNoDetectar,
} from "./plantillas"
import { MINIMO_DOCUMENTOS } from "@/lib/plantillas/deteccion"

/**
 * `MINIMO_PARA_DETECTAR` está escrito a mano en `plantillas.ts` para no
 * arrastrar la librería de comparación al navegador. Este test es lo único que
 * impide que los dos números se separen: si alguien cambia el mínimo de la
 * detección y no toca el de la pantalla, el botón se habilitaría con menos
 * documentos de los que la comparación necesita.
 */
describe("el mínimo de la pantalla y el de la detección son el mismo número", () => {
  it("no se separaron", () => {
    expect(MINIMO_PARA_DETECTAR).toBe(MINIMO_DOCUMENTOS)
  })
})

describe("estadoDePlantilla", () => {
  it("lee los dos valores que tiene la base", () => {
    expect(estadoDePlantilla("activa")).toBe("activa")
    expect(estadoDePlantilla("borrador")).toBe("borrador")
  })

  /**
   * Equivocarse hacia "activa" le dice al director que puede confiar en una
   * plantilla que quizá no esté lista. Hacia "borrador" solo le dice que
   * revise algo que ya estaba bien.
   */
  it("cualquier otra cosa cae en borrador, nunca en activa", () => {
    expect(estadoDePlantilla(null)).toBe("borrador")
    expect(estadoDePlantilla(undefined)).toBe("borrador")
    expect(estadoDePlantilla("")).toBe("borrador")
    expect(estadoDePlantilla("ACTIVA")).toBe("borrador")
    expect(estadoDePlantilla("lo_que_sea")).toBe("borrador")
  })
})

describe("armarFilas", () => {
  it("cuenta los documentos de cada tipo y los que quedaron en rojo", () => {
    const filas = armarFilas({
      tipos: [{ id: "t1", nombre: "Contrato", estado: "borrador", version_actual: null }],
      versiones: [],
      documentos: [
        { template_id: "t1", estado: "ok" },
        { template_id: "t1", estado: "revisar" },
        { template_id: "t1", estado: null },
      ],
    })
    expect(filas[0].documentos).toBe(3)
    expect(filas[0].enRojo).toBe(1)
  })

  it("no cuenta los documentos de otro tipo", () => {
    const filas = armarFilas({
      tipos: [
        { id: "t1", nombre: "Contrato", estado: "borrador", version_actual: null },
        { id: "t2", nombre: "Anexo", estado: "borrador", version_actual: null },
      ],
      versiones: [],
      documentos: [
        { template_id: "t1", estado: "revisar" },
        { template_id: "t2", estado: "ok" },
      ],
    })
    const porNombre = Object.fromEntries(filas.map((f) => [f.nombre, f]))
    expect(porNombre["Contrato"].documentos).toBe(1)
    expect(porNombre["Contrato"].enRojo).toBe(1)
    expect(porNombre["Anexo"].documentos).toBe(1)
    expect(porNombre["Anexo"].enRojo).toBe(0)
  })

  it("un tipo sin ningún documento cargado sale en cero, no se pierde de la lista", () => {
    const filas = armarFilas({
      tipos: [{ id: "t1", nombre: "Contrato", estado: "borrador", version_actual: null }],
      versiones: [],
      documentos: [],
    })
    expect(filas).toHaveLength(1)
    expect(filas[0].documentos).toBe(0)
  })

  it("traduce el id de la versión vigente a su número", () => {
    const filas = armarFilas({
      tipos: [{ id: "t1", nombre: "Contrato", estado: "activa", version_actual: "v7" }],
      versiones: [
        { id: "v1", version: 1 },
        { id: "v7", version: 3 },
      ],
      documentos: [],
    })
    expect(filas[0].version).toBe(3)
  })

  /**
   * Un 0 se leería como "versión cero", que no existe. Si la versión vigente
   * apunta a una fila que no llegó, la verdad es "sin versión".
   */
  it("si la versión vigente apunta a algo que no llegó, queda sin versión y no en cero", () => {
    const filas = armarFilas({
      tipos: [{ id: "t1", nombre: "Contrato", estado: "activa", version_actual: "v9" }],
      versiones: [{ id: "v1", version: 1 }],
      documentos: [],
    })
    expect(filas[0].version).toBeNull()
  })

  it("ordena por nombre para que la lista no cambie de orden entre recargas", () => {
    const filas = armarFilas({
      tipos: [
        { id: "t1", nombre: "Contrato", estado: "borrador", version_actual: null },
        { id: "t2", nombre: "Anexo", estado: "borrador", version_actual: null },
        { id: "t3", nombre: "Ñandú", estado: "borrador", version_actual: null },
      ],
      versiones: [],
      documentos: [],
    })
    expect(filas.map((f) => f.nombre)).toEqual(["Anexo", "Contrato", "Ñandú"])
  })
})

describe("motivoParaNoDetectar", () => {
  it("con menos de los que hacen falta dice cuántos hay y cuántos faltan", () => {
    const motivo = motivoParaNoDetectar(1)
    expect(motivo).not.toBeNull()
    expect(motivo).toContain("hoy hay 1")
    expect(motivo).toContain("2 asesores más")
  })

  it("cuando falta uno solo habla en singular", () => {
    expect(motivoParaNoDetectar(2)).toContain("1 asesor más")
  })

  it("sin ningún documento no dice 'hoy hay 0'", () => {
    const motivo = motivoParaNoDetectar(0)
    expect(motivo).toContain("todavía no hay ninguno cargado")
    expect(motivo).not.toContain("hoy hay 0")
  })

  it("con los que hacen falta, o más, no hay motivo: se puede detectar", () => {
    expect(motivoParaNoDetectar(MINIMO_PARA_DETECTAR)).toBeNull()
    expect(motivoParaNoDetectar(MINIMO_PARA_DETECTAR + 5)).toBeNull()
  })

  /**
   * El límite exacto. Es el borde del que depende el botón: con uno menos la
   * comparación no puede distinguir el texto fijo del dato de cada persona.
   */
  it("el corte está justo en el mínimo, ni uno antes", () => {
    expect(motivoParaNoDetectar(MINIMO_PARA_DETECTAR - 1)).not.toBeNull()
    expect(motivoParaNoDetectar(MINIMO_PARA_DETECTAR)).toBeNull()
  })

  /**
   * El botón dice "Detectar plantilla". Si el motivo de al lado dice
   * "deducir", el director tiene que adivinar que son la misma cosa.
   */
  it("habla de detectar, la misma palabra del botón", () => {
    const motivo = motivoParaNoDetectar(1)
    expect(motivo).toContain("detectar")
    expect(motivo).not.toContain("deducir")
  })
})

describe("explicacionDelEstado", () => {
  it("activa dice que está en uso", () => {
    expect(explicacionDelEstado({ estado: "activa", version: 2, enRojo: 0 })).toContain("en uso")
  })

  /**
   * Una plantilla "Activa" con asesores en rojo es una contradicción, y la
   * pantalla la muestra igual: "Activa" de un lado y el contador rojo del
   * otro. Si la explicación del estado no la nombra, el director lee las dos
   * cosas juntas y no tiene nada que le diga cuál vale.
   *
   * Se nombra a propósito: la contradicción es el síntoma de un problema real,
   * y taparla sería apagar el aviso en vez de arreglar la causa.
   */
  it("activa con asesores en rojo nombra la contradicción", () => {
    const texto = explicacionDelEstado({ estado: "activa", version: 2, enRojo: 2 })
    expect(texto).toContain("en uso")
    expect(texto).toContain("2 asesores quedaron")
    expect(texto).toContain("no debería")
  })

  it("activa con uno solo en rojo habla en singular", () => {
    expect(explicacionDelEstado({ estado: "activa", version: 2, enRojo: 1 })).toContain("1 asesor quedó")
  })

  /**
   * La regeneración automática al subir una versión nueva TODAVÍA NO EXISTE
   * (es una tarea posterior). Describirla en presente le promete al director
   * algo que la pantalla no hace.
   */
  it("activa no promete que los documentos se regeneren solos", () => {
    const texto = explicacionDelEstado({ estado: "activa", version: 2, enRojo: 0 })
    expect(texto).not.toContain("regeneran")
  })

  /**
   * El botón dice "Detectar plantilla". Si la prosa dice "deducir", el
   * director tiene que adivinar que son la misma cosa.
   */
  it("borrador sin versión dice que falta detectarla, con la misma palabra del botón", () => {
    const texto = explicacionDelEstado({ estado: "borrador", version: null, enRojo: 0 })
    expect(texto).toContain("todavía no se usa")
    expect(texto).toContain("detectar")
    expect(texto).not.toContain("deducir")
  })


  it("borrador con asesores en rojo dice cuántos son y que no se aplica a nadie", () => {
    const texto = explicacionDelEstado({ estado: "borrador", version: 1, enRojo: 2 })
    expect(texto).toContain("2 asesores quedaron")
    expect(texto).toContain("no")
  })

  it("con uno solo en rojo habla en singular", () => {
    expect(explicacionDelEstado({ estado: "borrador", version: 1, enRojo: 1 })).toContain("1 asesor quedó")
  })

  /**
   * Nunca puede quedar vacío: es el texto que hace que el estado se entienda
   * sin preguntarle a nadie.
   */
  it("siempre dice algo, en cualquier combinación", () => {
    for (const estado of ["activa", "borrador"] as const) {
      for (const version of [null, 1]) {
        for (const enRojo of [0, 1, 5]) {
          expect(explicacionDelEstado({ estado, version, enRojo }).length).toBeGreaterThan(20)
        }
      }
    }
  })
})
