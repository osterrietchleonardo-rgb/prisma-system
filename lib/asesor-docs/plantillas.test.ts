import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { FilaDeLaSolapa } from "@/components/asesor-docs/PlantillasTab"
import {
  armarFilas,
  estadoDePlantilla,
  explicacionDelEstado,
  MINIMO_PARA_DETECTAR,
  motivoParaNoDetectar,
  PARA_QUE_SIRVE,
  PARA_QUE_SIRVE_LA_REVISION,
  NADA_SE_GUARDA_TODAVIA,
  LIMITE_DE_LA_COMPROBACION,
  SI_ALGUNO_QUEDA_EN_ROJO,
  LARGO_DE_DATO_CORTO,
  avisoDeDatoCorto,
  fusionarHuecosIguales,
  textoSinComprobar,
  textoDesvinculados,
  ESTADO_DESVINCULADO,
  type FilaPlantilla,
} from "./plantillas"
import { MINIMO_DOCUMENTOS } from "@/lib/plantillas/deteccion"
import { LARGO_DE_DATO_SOSPECHOSO } from "./confirmacion"
import { ESTADOS_FUERA, separarPorEstado } from "./propuesta"

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

/**
 * Los tres asesores de siempre, todos en la agencia. Se pasan de verdad y no
 * como lista vacía: en producción la pantalla SIEMPRE trae los estados, y un
 * test que corre por un camino por el que producción no pasa no cuida nada.
 */
const ACTIVOS = [
  { id: "a1", estado: "activo" },
  { id: "a2", estado: "activo" },
  { id: "a3", estado: "activo" },
]

describe("armarFilas", () => {
  it("cuenta los documentos de cada tipo y los que quedaron en rojo", () => {
    // Los estados valen contra la versión vigente: por eso los documentos
    // apuntan a ella. Un "revisar" de otra versión es otra cosa, y tiene su
    // propio balde más abajo.
    const filas = armarFilas({
      tipos: [{ id: "t1", nombre: "Contrato", estado: "borrador", version_actual: "v1" }],
      versiones: [{ id: "v1", version: 1 }],
      documentos: [
        { template_id: "t1", estado: "ok", version_id: "v1", advisor_id: "a1" },
        { template_id: "t1", estado: "revisar", version_id: "v1", advisor_id: "a2" },
        { template_id: "t1", estado: null, version_id: "v1", advisor_id: "a3" },
      ],
      asesores: ACTIVOS,
    })
    expect(filas[0].documentos).toBe(3)
    expect(filas[0].enRojo).toBe(1)
    expect(filas[0].sinComprobar).toBe(0)
    expect(filas[0].desvinculados).toBe(0)
  })

  it("no cuenta los documentos de otro tipo", () => {
    const filas = armarFilas({
      tipos: [
        { id: "t1", nombre: "Contrato", estado: "borrador", version_actual: "v1" },
        { id: "t2", nombre: "Anexo", estado: "borrador", version_actual: "v2" },
      ],
      versiones: [
        { id: "v1", version: 1 },
        { id: "v2", version: 1 },
      ],
      documentos: [
        { template_id: "t1", estado: "revisar", version_id: "v1", advisor_id: "a1" },
        { template_id: "t2", estado: "ok", version_id: "v2", advisor_id: "a1" },
      ],
      asesores: ACTIVOS,
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
      asesores: ACTIVOS,
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
      asesores: ACTIVOS,
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
      asesores: ACTIVOS,
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
      asesores: ACTIVOS,
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
    LIMITE_DE_LA_COMPROBACION,
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
    // Las seis familias que de verdad se comparan. Si el cartel nombra menos
    // de las que se miran, el director cree que hay agujeros que no hay.
    for (const parte of [
      "cuerpo",
      "encabezado",
      "pie de página",
      "notas al pie",
      "notas al final",
      "comentarios",
      "cuadros de texto",
    ]) {
      expect(LIMITE_DE_LA_COMPROBACION).toContain(parte)
    }

    /**
     * Y la mitad que le sirve al director: que los campos salen del cuerpo, que
     * lo de afuera queda en rojo, y que el arreglo es en el Word. La frase
     * anterior prometía "te lo avisamos aparte" para las notas al final y no
     * había ningún aviso en ningún lado: una promesa falsa en el cartel es peor
     * que no decir nada.
     */
    expect(LIMITE_DE_LA_COMPROBACION).toContain("rojo")
    expect(LIMITE_DE_LA_COMPROBACION).toContain("en el Word")
    expect(LIMITE_DE_LA_COMPROBACION).not.toContain("te lo avisamos aparte")
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

// ---------------------------------------------------------------------------
// El contador de la barra: el mismo número que va a guardar el servidor
// ---------------------------------------------------------------------------

describe("fusionarHuecosIguales, del lado de la pantalla", () => {
  const A = "11111111-1111-4111-8111-111111111111"
  const B = "22222222-2222-4222-8222-222222222222"
  const campo = (id: string, nombre: string, valores: Record<string, string>) => ({
    id,
    nombre,
    contexto: "",
    valores,
  })

  it("vive acá para que la barra pueda decir el número de VERDAD", () => {
    /**
     * En la corrida real fueron 23 campos detectados, 15 mandados y 8
     * guardados: la barra decía 15. Un contador que miente justo antes del
     * clic que guarda es peor que no tener contador. La pantalla usa ESTA
     * función, la misma que el servidor.
     */
    const huecos = [
      campo("h1", "NOMBRE_1", { [A]: "Ana", [B]: "Bruno" }),
      campo("h2", "NOMBRE_2", { [A]: "Ana", [B]: "Bruno" }),
      campo("h3", "CUIT", { [A]: "20-1", [B]: "20-2" }),
    ]
    expect(fusionarHuecosIguales(huecos).huecos).toHaveLength(2)
  })

  it("no junta dos que difieren en un solo asesor", () => {
    const huecos = [
      campo("h1", "N1", { [A]: "Ana", [B]: "Bruno" }),
      campo("h2", "N2", { [A]: "Ana", [B]: "Otro" }),
    ]
    expect(fusionarHuecosIguales(huecos).huecos).toHaveLength(2)
  })

  it("el aviso nombra a los dos campos", () => {
    const huecos = [campo("h1", "N1", { [A]: "Ana" }), campo("h2", "N2", { [A]: "Ana" })]
    const r = fusionarHuecosIguales(huecos)
    expect(r.advertencias[0]).toContain("N1")
    expect(r.advertencias[0]).toContain("N2")
  })
})

// ---------------------------------------------------------------------------
// EL ASESOR QUE NADIE COMPARÓ
// ---------------------------------------------------------------------------

describe("armarFilas: comprobado contra la versión VIGENTE, no contra cualquiera", () => {
  const tipo = (over = {}) => ({
    id: "t1",
    nombre: "Contrato",
    estado: "activa",
    version_actual: "v-nueva",
    ...over,
  })
  /**
   * `advisor_id` va explícito en cada documento: el índice único
   * (advisor_id, template_id) no deja que una persona tenga dos del mismo
   * tipo, y quién es el dueño ahora decide en qué balde cae.
   */
  const doc = (advisorId: string, over = {}) => ({
    template_id: "t1",
    estado: "ok",
    version_id: "v-nueva",
    advisor_id: advisorId,
    ...over,
  })
  /** El equipo entero, todos en la agencia. Los desvinculados tienen lo suyo. */
  const equipo = [
    { id: "ana", estado: "activo" },
    { id: "bruno", estado: "activo" },
    { id: "caro", estado: "pausado" },
  ]

  it("un rojo de la versión VIGENTE se cuenta en rojo", () => {
    const filas = armarFilas({
      tipos: [tipo({ estado: "borrador" })],
      versiones: [{ id: "v-nueva", version: 2 }],
      documentos: [doc("ana"), doc("bruno", { estado: "revisar" })],
      asesores: equipo,
    })
    expect(filas[0].enRojo).toBe(1)
    expect(filas[0].sinComprobar).toBe(0)
  })

  it("LA SÉPTIMA VÍA: un rojo de una versión VIEJA no se cuenta en rojo, se cuenta sin comprobar", () => {
    /**
     * El caso, que un director hace todas las semanas:
     *   1. se confirma y Caro queda en `revisar`;
     *   2. el director la pausa;
     *   3. se vuelve a confirmar: Caro queda afuera (spec §7.5), los otros dos
     *      dan verde, y la plantilla pasa a `activa`;
     *   4. la fila de Caro sigue en `revisar` con el `version_id` viejo.
     *
     * Contando ese `revisar` como rojo, la solapa decía "Activa" y "1 en rojo"
     * al mismo tiempo sobre algo que el director no podía destrabar: Caro está
     * pausada y volver a detectar no la incluye. Y lo grave no era el cartel:
     * era que si mañana la reactivan, su contrato sale de un molde que NUNCA se
     * comparó contra su documento.
     */
    const filas = armarFilas({
      tipos: [tipo()],
      versiones: [{ id: "v-nueva", version: 2 }],
      documentos: [doc("ana"), doc("bruno"), doc("caro", { estado: "revisar", version_id: "v-vieja" })],
      asesores: equipo,
    })
    expect(filas[0].enRojo).toBe(0)
    expect(filas[0].sinComprobar).toBe(1)
  })

  it("el que sube su documento DESPUÉS de que la plantilla quedó activa también entra", () => {
    // Llega con version_id en null a una plantilla ya confirmada.
    const filas = armarFilas({
      tipos: [tipo()],
      versiones: [{ id: "v-nueva", version: 1 }],
      documentos: [doc("ana"), doc("bruno", { estado: null, version_id: null })],
      asesores: equipo,
    })
    expect(filas[0].sinComprobar).toBe(1)
    expect(filas[0].enRojo).toBe(0)
  })

  it("antes de detectar, NADIE está sin comprobar: sería ruido en la fila por defecto", () => {
    const filas = armarFilas({
      tipos: [tipo({ estado: "borrador", version_actual: null })],
      versiones: [],
      documentos: [
        { template_id: "t1", estado: null, version_id: null, advisor_id: "ana" },
        { template_id: "t1", estado: null, version_id: null, advisor_id: "bruno" },
      ],
      asesores: equipo,
    })
    expect(filas[0].sinComprobar).toBe(0)
    expect(filas[0].documentos).toBe(2)
  })

  it("si la versión vigente se borró, los que apuntaban a ella quedan sin comprobar", () => {
    // version_actual es uuid con ON DELETE SET NULL: puede quedar en null.
    const filas = armarFilas({
      tipos: [tipo({ version_actual: null })],
      versiones: [],
      documentos: [doc("ana", { version_id: "v-vieja" })],
      asesores: equipo,
    })
    expect(filas[0].sinComprobar).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// EL DESVINCULADO, Y EL AVISO QUE NO SE PODÍA APAGAR
// ---------------------------------------------------------------------------

/**
 * El caso, medido: `PlantillasTab` traía los documentos sin mirar el estado del
 * asesor, así que el de un desvinculado entraba en el conteo; y las dos rutas
 * de esta etapa lo dejan afuera para siempre (spec §7.5). Su documento caía en
 * `sinComprobar` y la fila le decía al director "volvé a detectar la plantilla
 * con los asesores activos" — que no cambia nada. Un aviso que no se apaga
 * haciendo lo que el aviso pide es un aviso que se aprende a ignorar, y ahí
 * deja de servir para el pausado, que sí vuelve.
 */
describe("armarFilas: el documento de un desvinculado va a su propio balde", () => {
  const tipoActivo = { id: "t1", nombre: "Contrato", estado: "activa", version_actual: "v2" }
  const versiones = [{ id: "v2", version: 2 }]

  it("no se cuenta como sin comprobar: se cuenta como desvinculado", () => {
    const filas = armarFilas({
      tipos: [tipoActivo],
      versiones,
      documentos: [
        { template_id: "t1", estado: "ok", version_id: "v2", advisor_id: "ana" },
        { template_id: "t1", estado: null, version_id: null, advisor_id: "ex" },
      ],
      asesores: [
        { id: "ana", estado: "activo" },
        { id: "ex", estado: "eliminado" },
      ],
    })
    expect(filas[0].desvinculados).toBe(1)
    expect(filas[0].sinComprobar).toBe(0)
    // Sigue estando cargado: el contador de documentos no miente sobre lo que
    // hay en la lista.
    expect(filas[0].documentos).toBe(2)
  })

  /**
   * Un `revisar` viejo de alguien que ya no está tampoco se destraba revisando
   * nada: la confirmación ni lo mira. Contado en rojo, un borrador decía "hasta
   * que estén todos bien, la plantilla no se aplica a nadie", que es falso.
   */
  it("un rojo suyo tampoco cuenta en rojo", () => {
    const filas = armarFilas({
      tipos: [{ ...tipoActivo, estado: "borrador" }],
      versiones,
      documentos: [{ template_id: "t1", estado: "revisar", version_id: "v2", advisor_id: "ex" }],
      asesores: [{ id: "ex", estado: "eliminado" }],
    })
    expect(filas[0].enRojo).toBe(0)
    expect(filas[0].desvinculados).toBe(1)
  })

  it("el pausado NO es un desvinculado: sigue en el balde de los que se pueden incluir", () => {
    const filas = armarFilas({
      tipos: [tipoActivo],
      versiones,
      documentos: [{ template_id: "t1", estado: "ok", version_id: "v-vieja", advisor_id: "caro" }],
      asesores: [{ id: "caro", estado: "pausado" }],
    })
    expect(filas[0].sinComprobar).toBe(1)
    expect(filas[0].desvinculados).toBe(0)
  })

  it("la columna es texto libre: se compara sin espacios y sin mayúsculas", () => {
    const filas = armarFilas({
      tipos: [tipoActivo],
      versiones,
      documentos: [{ template_id: "t1", estado: null, version_id: null, advisor_id: "ex" }],
      asesores: [{ id: "ex", estado: " Eliminado " }],
    })
    expect(filas[0].desvinculados).toBe(1)
  })

  /**
   * Un perfil que no vino (la consulta lo dejó afuera, un id que no está) se
   * trata como si siguiera en la agencia. Decirle al director que borre el
   * documento de alguien que en realidad está activo es el error caro de los
   * dos.
   */
  it("un asesor que no vino en la lista NO se da por desvinculado", () => {
    const filas = armarFilas({
      tipos: [tipoActivo],
      versiones,
      documentos: [{ template_id: "t1", estado: null, version_id: null, advisor_id: "fantasma" }],
      asesores: [],
    })
    expect(filas[0].desvinculados).toBe(0)
    expect(filas[0].sinComprobar).toBe(1)
  })

  /**
   * `ESTADO_DESVINCULADO` está escrito a mano en `plantillas.ts` para no
   * arrastrar al navegador la librería de comparación de textos que cuelga de
   * `propuesta.ts`. Este test es lo único que impide que los dos se separen: si
   * mañana el estado se llamara distinto, acá se contaría a nadie y allá se
   * seguiría excluyendo a la persona, en silencio.
   */
  it("el estado que se mira es el mismo que deja al asesor afuera de la comparación", () => {
    expect(ESTADOS_FUERA).toContain(ESTADO_DESVINCULADO)
    const { dentro } = separarPorEstado([{ advisorId: "ex", estado: ESTADO_DESVINCULADO }])
    expect(dentro).toHaveLength(0)
  })
})

describe("explicacionDelEstado: el asesor sin comparar", () => {
  it("activa con alguien sin comparar lo DICE, y dice qué hacer", () => {
    const texto = explicacionDelEstado({ estado: "activa", version: 2, enRojo: 0, sinComprobar: 1 })
    expect(texto).toContain("Está en uso")
    expect(texto).toContain("1 asesor no se comparó")
    expect(texto).toContain("volvé a detectar")
  })

  it("el renglón entero concuerda en número, no solo la primera frase", () => {
    /**
     * En el navegador salía "1 asesor no se comparó … o estaban pausados …
     * subieron su documento": la cuenta bien y el resto en plural fijo. Lo lee
     * un director y suena a máquina.
     */
    const uno = explicacionDelEstado({ estado: "activa", version: 2, enRojo: 0, sinComprobar: 1 })
    expect(uno).toContain("estaba pausado")
    expect(uno).toContain("subió su documento")
    expect(uno).toContain("esa persona")
    expect(uno).toContain("el asesor activo")
    expect(uno).not.toContain("estaban")
    expect(uno).not.toContain("subieron")

    const varios = explicacionDelEstado({ estado: "activa", version: 2, enRojo: 0, sinComprobar: 3 })
    expect(varios).toContain("3 asesores no se compararon")
    expect(varios).toContain("estaban pausados")
    expect(varios).toContain("subieron su documento")
    expect(varios).toContain("esas personas")
    expect(varios).toContain("los asesores activos")
  })

  it("el aviso de sin comparar va ANTES que el de los rojos", () => {
    /**
     * Un rojo se ve entrando en la ficha del asesor; esto no se ve en ningún
     * lado. Es el que el director no puede deducir solo.
     */
    const texto = explicacionDelEstado({ estado: "activa", version: 2, enRojo: 2, sinComprobar: 1 })
    expect(texto).toContain("no se comparó")
  })

  it("activa y con todos comparados sigue diciendo lo de siempre", () => {
    const texto = explicacionDelEstado({ estado: "activa", version: 2, enRojo: 0, sinComprobar: 0 })
    expect(texto).toBe("Está en uso: es la versión confirmada. Con ella se le va a generar el documento a cada asesor.")
  })

  it("un borrador con alguien sin comparar también lo dice", () => {
    const texto = explicacionDelEstado({ estado: "borrador", version: 1, enRojo: 0, sinComprobar: 1 })
    expect(texto).toContain("no se comparó")
    expect(texto).toContain("detectar la plantilla")
  })

  it("sin el dato, se comporta como antes", () => {
    // La propiedad es opcional: nadie que ya llamaba a esto se rompe.
    expect(explicacionDelEstado({ estado: "activa", version: 1, enRojo: 0 })).toContain("Está en uso")
  })

  it("ninguno de los textos nuevos promete en presente algo que no pasa", () => {
    for (const sinComprobar of [1, 3]) {
      for (const estado of ["activa", "borrador"] as const) {
        expect(explicacionDelEstado({ estado, version: 1, enRojo: 0, sinComprobar })).not.toMatch(PROMESA_EN_PRESENTE)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// EL RENGLÓN ÁMBAR DE LA FILA
// ---------------------------------------------------------------------------

describe("textoSinComprobar", () => {
  it("con uno solo habla en singular", () => {
    expect(textoSinComprobar(1)).toBe("1 asesor sin comparar contra esta versión")
  })

  it("con varios habla en plural y dice cuántos", () => {
    expect(textoSinComprobar(3)).toBe("3 asesores sin comparar contra esta versión")
  })

  /**
   * En cero no se dibuja NADA. Un "0 asesores sin comparar" en la fila por
   * defecto de toda inmobiliaria es ruido: obliga a leer un aviso para
   * descubrir que no hay nada que hacer.
   */
  it("en cero no dice nada", () => {
    expect(textoSinComprobar(0)).toBeNull()
  })

  /** Defensa boba, pero un negativo dibujando un aviso sería peor. */
  it("un número imposible tampoco dice nada", () => {
    expect(textoSinComprobar(-1)).toBeNull()
  })

  it("no promete en presente algo que todavía no pasa", () => {
    for (const cuantos of [1, 2, 9]) {
      expect(textoSinComprobar(cuantos)).not.toMatch(PROMESA_EN_PRESENTE)
    }
  })
})

/**
 * Que el texto viva acá no sirve de nada si la pantalla se escribe el suyo. Es
 * la falla de la Task 5 tal cual: la frase se sacó de un lado y reapareció
 * treinta líneas más arriba, escrita a mano, donde ningún test la veía. Se lee
 * el `.tsx` como texto, igual que hace `lib/acm/ficha-css.test.ts` con la ficha
 * pública.
 */
describe("textoDesvinculados", () => {
  it("con uno solo habla en singular", () => {
    expect(textoDesvinculados(1)).toBe("1 documento de un asesor desvinculado")
  })

  it("con varios habla en plural y dice cuántos", () => {
    expect(textoDesvinculados(2)).toBe("2 documentos de asesores desvinculados")
  })

  it("en cero no dice nada", () => {
    expect(textoDesvinculados(0)).toBeNull()
  })

  it("no promete en presente algo que todavía no pasa", () => {
    for (const cuantos of [1, 2, 9]) {
      expect(textoDesvinculados(cuantos)).not.toMatch(PROMESA_EN_PRESENTE)
    }
  })
})

describe("explicacionDelEstado: el desvinculado, con una instrucción que se puede ejecutar", () => {
  /**
   * Lo que hacía falta arreglar: al desvinculado se le decía "volvé a detectar
   * la plantilla", y volver a detectar no lo incluye NUNCA (spec §7.5).
   *
   * La primera respuesta a eso fue "borrá su documento", y era peor: se apoyaba
   * en una premisa falsa —que un desvinculado no vuelve— y encima rompía la
   * pantalla. Un desvinculado SÍ vuelve: el director lo reactiva él solo por
   * `usuarios/[id]/desbloquear`, que pide `estado === 'eliminado'` y lo deja en
   * `activo`. Y borrar el documento baja el conteo de la fila, así que con
   * justo 3 documentos deja el botón "Detectar plantilla" deshabilitado.
   */
  it("NO manda a detectar de nuevo, y tampoco manda a borrar", () => {
    const texto = explicacionDelEstado({ estado: "activa", version: 2, enRojo: 0, desvinculados: 1 })
    expect(texto).toContain("desvinculado")
    expect(texto).toContain("volver a detectar la plantilla no lo va a cambiar")
    expect(texto).toContain("No tenés que hacer nada")
  })

  it("dice que la persona puede volver, que es la premisa que hacía falta", () => {
    const texto = explicacionDelEstado({ estado: "activa", version: 2, enRojo: 0, desvinculados: 1 })
    expect(texto).toContain("vuelve a la inmobiliaria")
    expect(texto).toContain("entra solo en la próxima detección")
  })

  /**
   * La parte que el director no puede deducir mirando la pantalla: borrar el
   * documento de un desvinculado le baja el conteo de la fila y, con justo el
   * mínimo, le apaga el botón. Si el aviso lo manda a borrar sin decirlo, se
   * queda trabado sin saber por qué.
   */
  it("si nombra borrar, avisa que puede quedarse por debajo del mínimo", () => {
    for (const desvinculados of [1, 3]) {
      const texto = explicacionDelEstado({ estado: "activa", version: 2, enRojo: 0, desvinculados })
      expect(texto.toLowerCase()).toContain("borral")
      expect(texto).toContain("únicamente si estás seguro")
      expect(texto).toContain(`menos de ${MINIMO_PARA_DETECTAR} documentos`)
    }
  })

  it("con varios, todo el renglón concuerda en número", () => {
    const texto = explicacionDelEstado({ estado: "activa", version: 2, enRojo: 0, desvinculados: 3 })
    expect(texto).toContain("3 documentos de asesores desvinculados")
    expect(texto).toContain("no entran")
    expect(texto).toContain("esas personas vuelven")
    expect(texto).toContain("Borralos desde sus fichas")
    expect(texto).not.toContain("Borralo desde")
  })

  it("en un borrador se dice también, pegado a lo que ya decía", () => {
    const texto = explicacionDelEstado({ estado: "borrador", version: null, enRojo: 0, desvinculados: 1 })
    expect(texto).toContain("falta detectar la plantilla")
    expect(texto).toContain("Borralo desde su ficha únicamente si estás seguro")
  })

  it("sin desvinculados no aparece nada de esto", () => {
    const texto = explicacionDelEstado({ estado: "activa", version: 2, enRojo: 0, desvinculados: 0 })
    expect(texto).toBe("Está en uso: es la versión confirmada. Con ella se le va a generar el documento a cada asesor.")
  })

  /**
   * Los avisos se acumulan. Antes el de "sin comparar" cortaba con un `return`
   * y el de los rojos no se decía nunca cuando venían los dos juntos: el
   * director leía un problema y creía que era el único.
   */
  it("los tres avisos conviven en la misma explicación", () => {
    const texto = explicacionDelEstado({
      estado: "activa",
      version: 2,
      enRojo: 2,
      sinComprobar: 1,
      desvinculados: 1,
    })
    expect(texto).toContain("Está en uso")
    expect(texto).toContain("1 asesor no se comparó")
    expect(texto).toContain("asesor desvinculado")
    expect(texto).toContain("2 asesores quedaron")
    // Y en ese orden: primero lo que no se ve en ningún otro lado.
    expect(texto.indexOf("no se comparó")).toBeLessThan(texto.indexOf("desvinculado"))
    expect(texto.indexOf("desvinculado")).toBeLessThan(texto.indexOf("quedaron"))
  })

  it("no promete en presente algo que todavía no pasa, en ninguna combinación", () => {
    for (const estado of ["activa", "borrador"] as const) {
      for (const version of [null, 1]) {
        for (const enRojo of [0, 2]) {
          for (const sinComprobar of [0, 1]) {
            for (const desvinculados of [0, 1, 3]) {
              const texto = explicacionDelEstado({ estado, version, enRojo, sinComprobar, desvinculados })
              expect(texto).not.toMatch(PROMESA_EN_PRESENTE)
              expect(texto.length).toBeGreaterThan(20)
            }
          }
        }
      }
    }
  })
})

describe("la solapa no se escribe sus propios contadores", () => {
  const FUENTE = readFileSync(path.resolve(__dirname, "../../components/asesor-docs/PlantillasTab.tsx"), "utf8")

  it("el renglón de los sin comparar sale de textoSinComprobar", () => {
    expect(FUENTE).toContain("textoSinComprobar(fila.sinComprobar)")
  })

  it("y ese texto no está además escrito a mano en el JSX", () => {
    expect(FUENTE).not.toContain("sin comparar contra esta versión")
  })

  it("el renglón de los desvinculados sale de textoDesvinculados", () => {
    expect(FUENTE).toContain("textoDesvinculados(fila.desvinculados)")
  })

  it("y ese texto tampoco está escrito a mano en el JSX", () => {
    expect(FUENTE).not.toContain("documentos de asesores desvinculados")
  })

  /**
   * `armarFilas` no puede saber quién sigue en la agencia si la consulta no
   * trae el dato. Sin `advisor_id` en el select, el balde de los desvinculados
   * queda vacío para siempre y nadie se entera.
   */
  it("la consulta de documentos trae advisor_id y la de asesores, su estado", () => {
    expect(FUENTE).toContain('.select("template_id, estado, version_id, advisor_id")')
    expect(FUENTE).toContain('from("profiles").select("id, estado")')
  })
})

// ---------------------------------------------------------------------------
// Que el texto LLEGUE A LA PANTALLA
// ---------------------------------------------------------------------------

/**
 * Los de arriba miran el `.tsx` como texto: que la fila llame a
 * `textoSinComprobar` y que la frase no esté escrita a mano en el JSX. Eso es
 * necesario, y NO ALCANZA.
 *
 * Medido por el revisor: cambiar `{avisoSinComprobar}` por `{null}` en el
 * componente dejaba los 82 tests en verde. La llamada seguía estando en el
 * archivo, la función seguía devolviendo la frase correcta, y el renglón
 * ámbar desaparecía de la pantalla sin que nada se pusiera en rojo. Es el
 * mismo hueco por el que en la Task 5 se coló una promesa falsa en la primera
 * línea que lee todo el mundo.
 *
 * Así que acá la fila se DIBUJA de verdad, con `renderToStaticMarkup`, y se
 * mira el HTML que sale. No hace falta ni jsdom ni una librería de testing:
 * `FilaDeLaSolapa` recibe todo por props y no toca la base ni la red.
 */
describe("la fila dibujada: los renglones tienen que llegar a la pantalla", () => {
  const FILA: FilaPlantilla = {
    templateId: "t1",
    nombre: "Contrato Partnership",
    estado: "activa",
    version: 2,
    documentos: 5,
    enRojo: 0,
    sinComprobar: 0,
    desvinculados: 0,
  }

  /** El texto visible de la fila: el HTML sin etiquetas y sin entidades. */
  const dibujar = (cambios: Partial<FilaPlantilla> = {}): string =>
    renderToStaticMarkup(
      React.createElement(FilaDeLaSolapa, {
        fila: { ...FILA, ...cambios },
        detectando: false,
        onDetectar: () => {},
      }),
    )
      .replace(/<[^>]*>/g, "")
      .replace(/&#x27;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")

  it("el renglón ámbar de los sin comparar se dibuja, y dice lo que dice la función", () => {
    expect(dibujar({ sinComprobar: 1 })).toContain(textoSinComprobar(1)!)
    expect(dibujar({ sinComprobar: 4 })).toContain(textoSinComprobar(4)!)
  })

  it("y sin nadie sin comparar, ese renglón NO se dibuja", () => {
    expect(dibujar({ sinComprobar: 0 })).not.toContain("sin comparar contra esta versión")
  })

  it("el renglón de los desvinculados se dibuja igual", () => {
    expect(dibujar({ desvinculados: 2 })).toContain(textoDesvinculados(2)!)
    expect(dibujar({ desvinculados: 0 })).not.toContain("asesor desvinculado")
  })

  it("el contador de los rojos se dibuja", () => {
    expect(dibujar({ enRojo: 1 })).toContain("1 asesor con su documento para revisar")
    expect(dibujar({ enRojo: 3 })).toContain("3 asesores con su documento para revisar")
    expect(dibujar({ enRojo: 0 })).not.toContain("con su documento para revisar")
  })

  it("la explicación del estado se dibuja entera, con sus avisos", () => {
    const fila: FilaPlantilla = { ...FILA, enRojo: 2, sinComprobar: 1, desvinculados: 1 }
    expect(dibujar(fila)).toContain(explicacionDelEstado(fila))
  })

  /**
   * El botón deshabilitado sin motivo es un botón roto: el director aprieta, no
   * pasa nada, y no tiene forma de saber si le falta algo o si el sistema falló.
   */
  it("cuando no se puede detectar, el motivo se dibuja", () => {
    const html = dibujar({ documentos: 2 })
    expect(html).toContain(motivoParaNoDetectar(2)!)
    expect(dibujar({ documentos: 5 })).not.toContain("Para detectar la plantilla hacen falta")
  })

  it("y el nombre del tipo, su estado y cuántos tienen el documento cargado", () => {
    const html = dibujar({ documentos: 5 })
    expect(html).toContain("Contrato Partnership")
    expect(html).toContain("Activa")
    expect(html).toContain("5 asesores tienen este documento cargado")
    expect(dibujar({ documentos: 1 })).toContain("1 asesor tiene este documento cargado")
  })
})
