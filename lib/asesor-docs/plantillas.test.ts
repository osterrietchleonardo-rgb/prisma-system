import { describe, it, expect } from "vitest"
import {
  armarFilas,
  estadoDePlantilla,
  explicacionDelEstado,
  MINIMO_PARA_DETECTAR,
  motivoParaNoDetectar,
  PARA_QUE_SIRVE,
  PARA_QUE_SIRVE_LA_REVISION,
  NADA_SE_GUARDA_TODAVIA,
  LIMITE_ENCABEZADO_Y_PIE,
  SI_ALGUNO_QUEDA_EN_ROJO,
  LARGO_DE_DATO_CORTO,
  avisoDeDatoCorto,
} from "./plantillas"
import { MINIMO_DOCUMENTOS } from "@/lib/plantillas/deteccion"
import { LARGO_DE_DATO_SOSPECHOSO } from "./confirmacion"

/**
 * La familia de formas en PRESENTE del verbo generar: "genera", "generan",
 * "se generan", "generamos", "regenera", "regeneran", "generás".
 *
 * POR QUÉ EXISTE ESTO, para quien lo lea dentro de seis meses:
 *
 * Que PRISMA le arme solo el documento a cada asesor **todavía no está
 * escrito**. La única ruta de esta etapa es `detectar-plantilla`, que compara
 * los documentos y devuelve una propuesta SIN guardar nada; no hay
 * `confirmar-plantilla`, y `rellenarDocx` existe como primitiva de librería
 * que no llama ninguna pantalla ni ningún endpoint.
 *
 * Contarlo en presente ya pasó dos veces. La segunda es la que explica por qué
 * el test mira una familia entera y no una palabra: se sacó la promesa de
 * `explicacionDelEstado` —con un `not.toContain("regeneran")` cuidándola— y la
 * misma promesa reapareció con OTRO VERBO ("le genera") treinta líneas más
 * arriba, en la primera oración de la pantalla, que es la que ve todo el
 * mundo. `not.toContain("regeneran")` la dejó pasar entera.
 *
 * El futuro está permitido a propósito: "le va a generar", "generará",
 * "falta generarle". La pantalla PUEDE decir qué va a poder hacer; lo que no
 * puede es describir en presente algo que hoy no pasa. Ante la duda entre
 * prometer y quedarse corto, corto.
 *
 * Cuando la generación exista de verdad —un endpoint que la corra y una
 * pantalla que la muestre— este test se borra en el MISMO commit que la hace
 * andar, no antes.
 */
const PROMESA_EN_PRESENTE = /\b(?:re)?gener(?:a|an|amos|as|ás)\b/i

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
   * Que los documentos se armen o se rehagan solos TODAVÍA NO EXISTE (es una
   * tarea posterior). Describirlo en presente le promete al director algo que
   * la pantalla no hace. La familia completa, y el porqué, en
   * `PROMESA_EN_PRESENTE`, arriba.
   */
  it("activa no promete que los documentos se generen ni se regeneren solos", () => {
    const texto = explicacionDelEstado({ estado: "activa", version: 2, enRojo: 0 })
    expect(texto).not.toMatch(PROMESA_EN_PRESENTE)
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

/**
 * La red que faltaba: todo lo que la pantalla dice, revisado contra
 * `PROMESA_EN_PRESENTE`. El texto de arriba de la pantalla se mudó de
 * `PlantillasTab.tsx` a `plantillas.ts` justamente para que estos tests lo
 * alcancen — ningún test del repo mira los `.tsx`.
 */
describe("nada de lo que se muestra promete en presente algo que todavía no pasa", () => {
  it("el párrafo de para qué sirve no lo promete", () => {
    expect(PARA_QUE_SIRVE).not.toMatch(PROMESA_EN_PRESENTE)
  })

  /**
   * Y el otro lado de la moneda: sacar la promesa no puede significar borrar
   * el premio. Si el director no lee para qué le sirve apretar el botón, no lo
   * aprieta. Se dice, en futuro.
   */
  it("pero sí cuenta lo que PRISMA va a poder hacer", () => {
    expect(PARA_QUE_SIRVE).toContain("va a generar")
  })

  it("ninguna explicación de estado lo promete, en ninguna combinación", () => {
    for (const estado of ["activa", "borrador"] as const) {
      for (const version of [null, 1, 2]) {
        for (const enRojo of [0, 1, 5]) {
          expect(explicacionDelEstado({ estado, version, enRojo })).not.toMatch(PROMESA_EN_PRESENTE)
        }
      }
    }
  })

  /**
   * Un patrón que no agarra nada pasa todos los tests de arriba y no protege
   * de nada. Acá se comprueba contra frases escritas a mano que el patrón
   * distingue el presente del futuro.
   */
  it("el patrón agarra la familia entera y deja pasar el futuro", () => {
    for (const promesa of [
      "de ahí en adelante le genera el documento a cada asesor",
      "los documentos de los asesores se generan con esta versión",
      "al subir una versión nueva se regenera todo",
      "los documentos se regeneran solos",
      "generamos el documento de cada asesor",
      "vos generás el documento",
    ]) {
      expect(promesa).toMatch(PROMESA_EN_PRESENTE)
    }

    for (const permitido of [
      "más adelante le va a generar el documento a cada asesor",
      "lo generará con los datos de cada uno",
      "falta generarle el documento a cada asesor",
      "la generación del documento viene después",
    ]) {
      expect(permitido).not.toMatch(PROMESA_EN_PRESENTE)
    }
  })
})

// ---------------------------------------------------------------------------
// La prosa de la pantalla de revisión (spec §7.2)
// ---------------------------------------------------------------------------

describe("la prosa de la pantalla de revisión", () => {
  const textos = {
    PARA_QUE_SIRVE_LA_REVISION,
    NADA_SE_GUARDA_TODAVIA,
    LIMITE_ENCABEZADO_Y_PIE,
    SI_ALGUNO_QUEDA_EN_ROJO,
  }

  for (const [nombre, texto] of Object.entries(textos)) {
    it(`${nombre} no promete en presente algo que todavía no pasa`, () => {
      expect(texto).not.toMatch(PROMESA_EN_PRESENTE)
    })
  }

  it("dice con todas las letras que todavía no se guardó nada", () => {
    // Sin esta frase, ver la lista de campos armada se lee como que la
    // plantilla ya quedó hecha, y el director cierra la pantalla creyendo que
    // terminó.
    expect(NADA_SE_GUARDA_TODAVIA.toLowerCase()).toContain("todavía no se guardó nada")
  })

  it("avisa que el encabezado y el pie quedan fuera de la comprobación", () => {
    // mammoth lee el cuerpo. Callarlo dejaría al director creyendo que se
    // revisó el archivo entero.
    expect(LIMITE_ENCABEZADO_Y_PIE).toContain("encabezado")
    expect(LIMITE_ENCABEZADO_Y_PIE).toContain("pie")
  })

  it("cuenta de antemano qué pasa si alguno queda en rojo", () => {
    expect(SI_ALGUNO_QUEDA_EN_ROJO).toContain("borrador")
  })

  it("dice qué se puede hacer en esa pantalla", () => {
    expect(PARA_QUE_SIRVE_LA_REVISION).toContain("nombre")
    expect(PARA_QUE_SIRVE_LA_REVISION).toContain("sacar")
  })
})

// ---------------------------------------------------------------------------
// El aviso de un dato demasiado corto
// ---------------------------------------------------------------------------

describe("el largo del dato corto está escrito dos veces y tiene que ser el mismo", () => {
  it("no se separaron", () => {
    /**
     * `plantillas.ts` lo carga el navegador y no puede importar
     * `confirmacion.ts` (arrastra la librería de comparación de textos), así
     * que el número está escrito a mano en los dos. Este test es lo único que
     * impide que la pantalla avise por un largo y el servidor mida por otro.
     */
    expect(LARGO_DE_DATO_CORTO).toBe(LARGO_DE_DATO_SOSPECHOSO)
  })
})

describe("avisoDeDatoCorto", () => {
  it("avisa por un dato de un solo carácter, y lo muestra", () => {
    /**
     * El caso medido con tres contratos reales: el "1" de "1 de marzo" se
     * reemplaza también en "una (1) instancia mensual".
     */
    const aviso = avisoDeDatoCorto("1")
    expect(aviso).toContain('"1"')
    expect(aviso).toContain("TODOS los lugares")
    expect(aviso).toContain("sacalo")
  })

  it("no avisa por un nombre y apellido", () => {
    expect(avisoDeDatoCorto("Ana Ruiz")).toBeNull()
  })

  it("no avisa por un dato vacío: ese es otro problema", () => {
    expect(avisoDeDatoCorto("   ")).toBeNull()
  })

  it("el límite: avisa justo en el largo y no uno más", () => {
    expect(avisoDeDatoCorto("x".repeat(LARGO_DE_DATO_CORTO))).not.toBeNull()
    expect(avisoDeDatoCorto("x".repeat(LARGO_DE_DATO_CORTO + 1))).toBeNull()
  })

  it("no promete en presente algo que todavía no pasa", () => {
    expect(avisoDeDatoCorto("1")).not.toMatch(PROMESA_EN_PRESENTE)
  })
})
