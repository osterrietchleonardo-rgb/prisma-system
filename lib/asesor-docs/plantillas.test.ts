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
  textoPendientes,
  ESTADO_DESVINCULADO,
  ESTADO_PAUSADO,
  type FilaPlantilla,
} from "./plantillas"
import { MINIMO_DOCUMENTOS } from "@/lib/plantillas/deteccion"
import { LARGO_DE_DATO_SOSPECHOSO } from "./confirmacion"
import { ESTADOS_FUERA, separarPorEstado } from "./propuesta"

/**
 * ═══ ACÁ ESTABA `PROMESA_EN_PRESENTE`, Y SE BORRÓ EN LA 7b-2 ═══
 *
 * Era un patrón —la familia entera de "genera / generan / regeneran /
 * generamos / generás"— que prohibía que cualquier texto de esta solapa dijera
 * en presente que PRISMA le arma el documento a cada asesor. Existía porque no
 * lo hacía:
 * la única ruta era `detectar-plantilla`, que comparaba y devolvía una
 * propuesta sin guardar nada, y `rellenarDocx` era una primitiva que no
 * llamaba ninguna pantalla. Decirlo en presente le prometía al director algo
 * que iba a buscar y no iba a encontrar. Ya había pasado dos veces, y la
 * segunda explica por qué el patrón miraba una familia entera y no una
 * palabra: se sacó la promesa de `explicacionDelEstado` —con un
 * `not.toContain("regeneran")` cuidándola— y reapareció con OTRO VERBO ("le
 * genera") treinta líneas más arriba, en la primera oración que lee todo el
 * mundo.
 *
 * Su propio comentario decía cuándo se borraba: **en el MISMO commit que
 * hiciera andar la generación de punta a punta, no antes.** Ese commit es
 * este. La solapa sube la versión nueva, se la aplica a cada asesor contra
 * `aplicar-version/{advisorId}` —que rellena el molde, le pasa las cinco
 * comprobaciones y guarda el `.docx` de esa persona— y después la pone en uso.
 * Así que la promesa dejó de ser una promesa, y `PARA_QUE_SIRVE` pasó a estar
 * en presente en este mismo commit.
 *
 * Lo que NO se borró es la regla de fondo, y vale para todo lo que se agregue
 * de acá en adelante: **no se puede describir en presente algo que hoy no
 * pasa.** Ante la duda entre prometer y quedarse corto, corto. Lo que la
 * reemplaza son los tests de abajo, que miden lo contrario: que lo que la
 * pantalla afirma sea alcanzable de verdad desde ella.
 */

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

  /**
   * `participan` es el número del que depende el botón, y tiene que contar lo
   * MISMO que cuenta `detectar-plantilla`: los que no están pausados ni
   * desvinculados, y solo los que aparecen en la lista de asesores.
   */
  it("participan cuenta solo a los que entran de verdad en la comparación", () => {
    const filas = armarFilas({
      tipos: [{ id: "t1", nombre: "Contrato", estado: "borrador", version_actual: null }],
      versiones: [],
      documentos: [
        { template_id: "t1", estado: null, version_id: null, advisor_id: "a1" },
        { template_id: "t1", estado: null, version_id: null, advisor_id: "a2" },
        { template_id: "t1", estado: null, version_id: null, advisor_id: "a3" },
        { template_id: "t1", estado: null, version_id: null, advisor_id: "a4" },
      ],
      asesores: [
        { id: "a1", estado: "activo" },
        { id: "a2", estado: "pausado" },
        { id: "a3", estado: ESTADO_DESVINCULADO },
        // a4 no aparece: la ruta lo deja afuera por no encontrarlo.
      ],
    })
    expect(filas[0].documentos).toBe(4)
    expect(filas[0].participan).toBe(1)
  })

  it("un estado que el sistema no conoce SÍ participa, igual que en separarPorEstado", () => {
    const filas = armarFilas({
      tipos: [{ id: "t1", nombre: "Contrato", estado: "borrador", version_actual: null }],
      versiones: [],
      documentos: [{ template_id: "t1", estado: null, version_id: null, advisor_id: "a1" }],
      asesores: [{ id: "a1", estado: "vacaciones" }],
    })
    expect(filas[0].participan).toBe(1)
    // Y la regla de allá dice lo mismo: entra, con una advertencia.
    expect(separarPorEstado([{ advisorId: "a1", estado: "vacaciones" }]).dentro).toHaveLength(1)
  })

  it("el pausado con mayúsculas y espacios tampoco participa", () => {
    const filas = armarFilas({
      tipos: [{ id: "t1", nombre: "Contrato", estado: "borrador", version_actual: null }],
      versiones: [],
      documentos: [{ template_id: "t1", estado: null, version_id: null, advisor_id: "a1" }],
      asesores: [{ id: "a1", estado: " Pausado " }],
    })
    expect(filas[0].participan).toBe(0)
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

  /**
   * El agujero que se cierra acá, medido en la 7b-1: el botón se habilitaba con
   * `fila.documentos`, que cuenta a los pausados y a los desvinculados, y la
   * ruta comparaba solo a los activos. Con 3 documentos donde uno era de un
   * pausado, el botón quedaba habilitado y la detección salía con 2.
   */
  it("con documentos de más que no participan, el motivo sigue existiendo", () => {
    // 4 cargados, 2 que participan: el botón NO se puede habilitar.
    expect(motivoParaNoDetectar(2, 4)).not.toBeNull()
    expect(motivoParaNoDetectar(2, 4)).toContain("hoy hay 2")
  })

  it("y dice por qué los números no coinciden, en vez de dejar dos cifras sueltas", () => {
    expect(motivoParaNoDetectar(2, 3)).toContain("1 es de un asesor pausado o desvinculado")
    expect(motivoParaNoDetectar(1, 4)).toContain("3 son de asesores pausados o desvinculados")
  })

  it("cuando todos participan no inventa una explicación que no hace falta", () => {
    expect(motivoParaNoDetectar(2, 2)).not.toContain("pausado")
    expect(motivoParaNoDetectar(2)).not.toContain("pausado")
  })

  it("con los que participan al mínimo no hay motivo, aunque haya más cargados", () => {
    expect(motivoParaNoDetectar(MINIMO_PARA_DETECTAR, MINIMO_PARA_DETECTAR + 4)).toBeNull()
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
   * Y ahora sí lo dice, porque ahora sí pasa. La afirmación es más fuerte que
   * la anterior y se puede sostener: `activar-version` se NIEGA mientras quede
   * un asesor activo con el documento de otra versión, así que de una fila
   * `activa` es cierto que los documentos de los activos son de esta versión.
   */
  it("activa dice que los documentos de los activos están hechos con esta versión", () => {
    const texto = explicacionDelEstado({ estado: "activa", version: 2, enRojo: 0 })
    expect(texto).toContain("están hechos los documentos de los asesores activos")
    expect(texto).toContain("subí el Word de la versión nueva")
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
 * Lo que reemplaza a `PROMESA_EN_PRESENTE`, y mide lo contrario que él.
 *
 * Aquel prohibía prometer. Estos exigen que lo que la pantalla promete se pueda
 * hacer DESDE la pantalla: si mañana alguien saca el botón de la versión nueva
 * y deja el párrafo, el párrafo vuelve a ser una promesa falsa — la misma
 * clase de falla, entrando por la otra punta.
 */
describe("lo que el párrafo de arriba promete se puede hacer desde acá", () => {
  const FUENTE = readFileSync(path.resolve(__dirname, "../../components/asesor-docs/PlantillasTab.tsx"), "utf8")

  it("cuenta el premio: que PRISMA le genera el documento a cada asesor", () => {
    // Sin el premio, el director lee un procedimiento y no entiende para qué
    // apretaría el botón.
    expect(PARA_QUE_SIRVE).toContain("le genera el documento a cada asesor")
  })

  it("y cuenta cómo: subir el Word una vez y aplicárselo a todos", () => {
    expect(PARA_QUE_SIRVE).toContain("subís el Word una sola vez")
  })

  /**
   * La otra mitad, y la que de verdad impide que esto vuelva a ser mentira: el
   * botón que hace lo que el párrafo promete tiene que estar en la pantalla, y
   * la pantalla que lo hace tiene que estar montada.
   */
  it("el botón de subir la versión nueva existe, y abre la pantalla que la aplica", () => {
    expect(FUENTE).toContain("Subir versión nueva")
    expect(FUENTE).toContain("<VersionNueva")
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

  it("ninguno de esos textos quedó vacío al mudarse a lib", () => {
    // Se mudaron del `.tsx` a `lib` para que los tests los alcancen. Un texto
    // vacío pasaría cualquier assertion de "no dice X" sin que nadie se entere.
    for (const [nombre, texto] of Object.entries(textos)) {
      expect(texto.length, `${nombre} se quedó sin texto`).toBeGreaterThan(40)
    }
  })

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

  /**
   * Y los DOS juntos tienen que ser exactamente `ESTADOS_FUERA`, no un
   * subconjunto: si mañana se agrega un tercer estado que deja al asesor afuera
   * y este archivo no se entera, `participan` lo seguiría contando y el botón
   * "Detectar plantilla" se habilitaría con documentos que la ruta no mira.
   */
  it("los dos estados escritos a mano acá son TODOS los que dejan afuera", () => {
    expect([ESTADO_PAUSADO, ESTADO_DESVINCULADO].sort()).toEqual([...ESTADOS_FUERA].sort())
    expect(separarPorEstado([{ advisorId: "p", estado: ESTADO_PAUSADO }]).dentro).toHaveLength(0)
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
    expect(texto).toBe(
      "Está en uso: es la versión con la que están hechos los documentos de los asesores activos. Cuando " +
        "cambie el contrato, subí el Word de la versión nueva desde el botón de acá al lado.",
    )
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
})

/**
 * Que el texto viva acá no sirve de nada si la pantalla se escribe el suyo. Es
 * la falla de la Task 5 tal cual: la frase se sacó de un lado y reapareció
 * treinta líneas más arriba, escrita a mano, donde ningún test la veía. Se lee
 * el `.tsx` como texto, igual que hace `lib/acm/ficha-css.test.ts` con la ficha
 * pública.
 */
/**
 * ═══ EL BALDE DE `pendiente`, CERRADO ANTES DE PODER LLENARLO ═══
 *
 * Hasta la 7b-1 nadie escribía `estado: 'pendiente'`, así que un pendiente
 * sobre la versión VIGENTE no caía en ningún balde: `enRojo` mira solo
 * `revisar`, `sinComprobar` exige que el `version_id` NO sea el vigente, y
 * `desvinculados` mira el estado de la persona. Se contaba en `documentos` y
 * la pantalla no lo nombraba en ningún lado.
 *
 * Estos tests son la red de que eso quedó cerrado. Miran la CUENTA, no el
 * texto: si alguien saca la línea del `pendiente` de `armarFilas`, el contador
 * vuelve a cero y el balde se abre otra vez en silencio.
 */
describe("armarFilas: el pendiente sobre la versión vigente tiene su propio balde", () => {
  const filaDe = (documentos: Parameters<typeof armarFilas>[0]["documentos"]) =>
    armarFilas({
      tipos: [{ id: "t1", nombre: "Contrato", estado: "activa", version_actual: "v1" }],
      versiones: [{ id: "v1", version: 1 }],
      documentos,
      asesores: ACTIVOS,
    })[0]

  it("lo cuenta, y no lo mete en rojo ni en sin comprobar", () => {
    const fila = filaDe([
      { template_id: "t1", estado: "ok", version_id: "v1", advisor_id: "a1" },
      { template_id: "t1", estado: "pendiente", version_id: "v1", advisor_id: "a2" },
    ])
    expect(fila.pendientes).toBe(1)
    expect(fila.enRojo).toBe(0)
    expect(fila.sinComprobar).toBe(0)
    expect(fila.documentos).toBe(2)
  })

  it("varios pendientes se suman", () => {
    const fila = filaDe([
      { template_id: "t1", estado: "pendiente", version_id: "v1", advisor_id: "a1" },
      { template_id: "t1", estado: "pendiente", version_id: "v1", advisor_id: "a2" },
      { template_id: "t1", estado: "revisar", version_id: "v1", advisor_id: "a3" },
    ])
    expect(fila.pendientes).toBe(2)
    expect(fila.enRojo).toBe(1)
  })

  /**
   * Un `pendiente` que quedó de OTRA versión no es un pendiente de la que está
   * en uso: ese ya lo cuenta `sinComprobar`, y contarlo dos veces le mostraría
   * al director dos problemas donde hay uno.
   */
  it("un pendiente de otra versión sigue yendo a sin comprobar y no acá", () => {
    const fila = filaDe([{ template_id: "t1", estado: "pendiente", version_id: "v-vieja", advisor_id: "a1" }])
    expect(fila.pendientes).toBe(0)
    expect(fila.sinComprobar).toBe(1)
  })

  /** El desvinculado sigue teniendo prioridad: su balde es el suyo y nada más. */
  it("el pendiente de un desvinculado no se cuenta acá", () => {
    const fila = armarFilas({
      tipos: [{ id: "t1", nombre: "Contrato", estado: "activa", version_actual: "v1" }],
      versiones: [{ id: "v1", version: 1 }],
      documentos: [{ template_id: "t1", estado: "pendiente", version_id: "v1", advisor_id: "a1" }],
      asesores: [{ id: "a1", estado: ESTADO_DESVINCULADO }],
    })[0]
    expect(fila.pendientes).toBe(0)
    expect(fila.desvinculados).toBe(1)
  })

  it("sin ninguno, el contador es cero", () => {
    const fila = filaDe([{ template_id: "t1", estado: "ok", version_id: "v1", advisor_id: "a1" }])
    expect(fila.pendientes).toBe(0)
  })
})

describe("textoPendientes", () => {
  it("con uno solo habla en singular", () => {
    expect(textoPendientes(1)).toBe("1 asesor con un dato nuevo sin completar")
  })

  it("con varios habla en plural y dice cuántos", () => {
    expect(textoPendientes(2)).toBe("2 asesores con un dato nuevo sin completar")
  })

  it("en cero no dice nada", () => {
    expect(textoPendientes(0)).toBeNull()
  })

  it("un número imposible tampoco dice nada", () => {
    expect(textoPendientes(-1)).toBeNull()
  })
})

describe("explicacionDelEstado: el pendiente se nombra, y dice qué hacer", () => {
  it("en una plantilla activa lo dice, con la consecuencia al lado", () => {
    const texto = explicacionDelEstado({ estado: "activa", version: 2, enRojo: 0, pendientes: 1 })
    expect(texto).toContain("A 1 asesor le falta completar un dato")
    expect(texto).toContain("sigue con la versión anterior")
    expect(texto).toContain("no se puede poner en uso")
  })

  it("en plural concuerda todo el renglón", () => {
    const texto = explicacionDelEstado({ estado: "activa", version: 2, enRojo: 0, pendientes: 3 })
    expect(texto).toContain("A 3 asesores les falta")
    expect(texto).toContain("siguen con la versión anterior")
  })

  it("en un borrador también se dice", () => {
    const texto = explicacionDelEstado({ estado: "borrador", version: 1, enRojo: 0, pendientes: 2 })
    expect(texto).toContain("les falta completar un dato")
  })

  /**
   * Testigo de que el aviso NO se pisa con los otros: con los cuatro juntos
   * tienen que estar los cuatro. Es el mismo bug de primer-match-gana que ya se
   * arregló dos veces en esta función.
   */
  it("convive con los otros tres avisos sin pisarlos", () => {
    const texto = explicacionDelEstado({
      estado: "activa",
      version: 2,
      enRojo: 1,
      sinComprobar: 1,
      pendientes: 1,
      desvinculados: 1,
    })
    expect(texto).toContain("no se comparó")
    expect(texto).toContain("le falta completar un dato")
    expect(texto).toContain("para revisar")
    expect(texto).toContain("asesor desvinculado")
  })

  it("en cero no agrega nada", () => {
    expect(explicacionDelEstado({ estado: "activa", version: 2, enRojo: 0, pendientes: 0 })).toBe(
      "Está en uso: es la versión con la que están hechos los documentos de los asesores activos. Cuando " +
        "cambie el contrato, subí el Word de la versión nueva desde el botón de acá al lado.",
    )
  })
})

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
})

describe("explicacionDelEstado: el desvinculado, con una instrucción que se puede ejecutar", () => {
  /**
   * Lo que hacía falta arreglar: al desvinculado se le decía "volvé a detectar
   * la plantilla", y volver a detectar no lo incluye NUNCA (spec §7.5).
   *
   * La primera respuesta a eso fue "borrá su documento", y era peor: se apoyaba
   * en una premisa falsa —que un desvinculado no vuelve— y encima rompía la
   * pantalla. Un desvinculado SÍ vuelve, y el director lo hace sin pedirle nada
   * a nadie: la lista tiene el filtro "eliminado", el menú le ofrece "Pausar
   * asesor" a un eliminado y `requireDirectorSobreAsesor` no filtra por estado,
   * así que Pausar → Reactivar lo deja en `activo` (y del lado de Vakdor,
   * `admin-vakdor/usuarios/[id]/desbloquear` lo hace en un paso). Y borrar el
   * documento baja el conteo de la fila, así que con justo 3 documentos deja el
   * botón "Detectar plantilla" deshabilitado.
   */
  it("NO manda a detectar de nuevo, y tampoco manda a borrar", () => {
    const texto = explicacionDelEstado({ estado: "activa", version: 2, enRojo: 0, desvinculados: 1 })
    expect(texto).toContain("desvinculado")
    expect(texto).toContain("No entra en ninguna comparación")
    expect(texto).toContain("no tenés que hacer nada")
  })

  /**
   * El veredicto va PRIMERO, no tercero.
   *
   * La versión anterior de este texto explicaba dos cosas y recién después
   * decía que no había nada que hacer: 161 palabras en un `<p text-xs>` para
   * un aviso que no rompe nada. Un aviso informativo que no se lee de un
   * vistazo no se lee.
   *
   * Se mide la posición y no el largo total a propósito: el largo cambia solo
   * con que alguien agregue un aviso más arriba, y eso no es una regresión.
   */
  it("el veredicto llega en la primera oración del aviso, no al final", () => {
    for (const desvinculados of [1, 3]) {
      const aviso = explicacionDelEstado({ estado: "activa", version: 2, enRojo: 0, desvinculados })
        .split("Aparte, hay")[1]
      expect(aviso, "cambió el arranque del aviso de desvinculados").toBeTruthy()
      const primeraOracion = aviso.split(". ")[0]
      expect(primeraOracion).toContain("no tenés que hacer nada")
    }
  })

  it("dice que la persona puede volver, que es la premisa que hacía falta", () => {
    const texto = explicacionDelEstado({ estado: "activa", version: 2, enRojo: 0, desvinculados: 1 })
    expect(texto).toContain("vuelve a la inmobiliaria")
    expect(texto).toContain("entra solo en la próxima detección")
  })

  /**
   * ═══ La oración que se cayó, y por qué este test es al revés que antes ═══
   *
   * Hasta la 7b-2 el aviso terminaba con "si igual querés borrarlo, tené en
   * cuenta que con menos de 3 documentos no se puede volver a detectar la
   * plantilla", y este test exigía esa oración. Era cierta mientras el mínimo se
   * contaba sobre `fila.documentos`, que incluía a los desvinculados.
   *
   * Ahora el mínimo se cuenta sobre `fila.participan`, que NO los incluye:
   * borrar el documento de un desvinculado no cambia nada del botón. La oración
   * pasó a ser falsa, y un test que la exigiera estaría blindando la decisión
   * equivocada. Así que se da vuelta: el aviso no puede volver a decirlo.
   */
  it("ya no promete que borrarlo baja del mínimo, porque dejó de contar para el mínimo", () => {
    for (const desvinculados of [1, 3]) {
      const texto = explicacionDelEstado({ estado: "activa", version: 2, enRojo: 0, desvinculados })
      expect(texto).not.toContain(`menos de ${MINIMO_PARA_DETECTAR} documentos`)
      expect(texto).toContain("no tenés que hacer nada")
    }
  })

  /** Y lo dice de frente, que es lo que reemplaza a la oración que se cayó. */
  it("dice que no cuenta para poder detectar la plantilla", () => {
    expect(explicacionDelEstado({ estado: "activa", version: 2, enRojo: 0, desvinculados: 1 })).toContain(
      "ni cuenta para poder detectar la plantilla",
    )
    expect(explicacionDelEstado({ estado: "activa", version: 2, enRojo: 0, desvinculados: 3 })).toContain(
      "ni cuentan para poder detectar la plantilla",
    )
  })

  it("con varios, todo el renglón concuerda en número", () => {
    const texto = explicacionDelEstado({ estado: "activa", version: 2, enRojo: 0, desvinculados: 3 })
    expect(texto).toContain("3 documentos de asesores desvinculados")
    expect(texto).toContain("No entran")
    expect(texto).toContain("esas personas vuelven")
    expect(texto).toContain("sus documentos entran solos")
    expect(texto).not.toContain("su documento entra solo")
  })

  it("en un borrador se dice también, pegado a lo que ya decía", () => {
    const texto = explicacionDelEstado({ estado: "borrador", version: null, enRojo: 0, desvinculados: 1 })
    expect(texto).toContain("falta detectar la plantilla")
    expect(texto).toContain("Aparte, hay 1 documento de un asesor desvinculado")
  })

  it("sin desvinculados no aparece nada de esto", () => {
    const texto = explicacionDelEstado({ estado: "activa", version: 2, enRojo: 0, desvinculados: 0 })
    expect(texto).toBe(
      "Está en uso: es la versión con la que están hechos los documentos de los asesores activos. Cuando " +
        "cambie el contrato, subí el Word de la versión nueva desde el botón de acá al lado.",
    )
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
    /**
     * El orden, y este se corrigió MIRANDO LA PANTALLA, no leyendo el código.
     *
     * Lo accionable va junto y primero; el de los desvinculados —el único que
     * dice "no tenés que hacer nada"— va último. Estaba en el medio, y con los
     * tres juntos partía en dos las dos cosas que el director sí tiene que
     * hacer: el párrafo se leía como un muro con lo accionable a los costados
     * de lo informativo.
     */
    expect(texto.indexOf("no se comparó")).toBeLessThan(texto.indexOf("quedaron"))
    expect(texto.indexOf("quedaron")).toBeLessThan(texto.indexOf("desvinculado"))
  })

  it("nunca queda vacía, en ninguna combinación", () => {
    for (const estado of ["activa", "borrador"] as const) {
      for (const version of [null, 1]) {
        for (const enRojo of [0, 2]) {
          for (const sinComprobar of [0, 1]) {
            for (const desvinculados of [0, 1, 3]) {
              const texto = explicacionDelEstado({ estado, version, enRojo, sinComprobar, desvinculados })
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

  /**
   * ═══ La segunda puerta del botón de poner en uso ═══
   *
   * El `disabled` del botón lo cuida un test que lo dibuja, pero el HANDLER no
   * se puede alcanzar desde ningún test: sacarle el guard deja los 1402 en
   * verde (medido). Y un `disabled` es un adorno del navegador —se saltea con
   * un clic programático— mientras que al otro lado hay un `UPDATE` sobre
   * `version_actual`, que es lo que la solapa lee para decir "está en uso".
   *
   * El servidor frena los tres casos que importan, así que esto es la segunda
   * puerta y no la única. Pero una defensa sola es una defensa que el día que
   * alguien toque el botón desaparece sin ruido — y acá se comprueba leyendo
   * el archivo, que es lo único que alcanza a este código.
   */
  it("el handler de poner en uso comprueba el MISMO motivo que apaga el botón", () => {
    expect(FUENTE).toContain("if (motivoParaNoPonerEnUsoDesdeLaFila(fila) !== null) return;")
  })

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
  it("la consulta de documentos trae advisor_id y la observación, y la de asesores su nombre", () => {
    expect(FUENTE).toContain('.select("template_id, estado, version_id, advisor_id, observacion")')
    expect(FUENTE).toContain('from("profiles").select("id, estado, full_name")')
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
    participan: 5,
    enRojo: 0,
    sinComprobar: 0,
    desvinculados: 0,
    pendientes: 0,
    yaAplicados: 0,
    versionYaAplicada: null,
    versionIdYaAplicada: null,
  }

  /**
   * El HTML CRUDO de la fila, con etiquetas: hace falta para mirar `disabled`.
   *
   * ═══ Por qué `disabled` se busca CON el igual ═══
   *
   * Buscar la palabra `disabled` suelta **no mide nada nunca**: las clases de
   * shadcn traen `disabled:pointer-events-none disabled:opacity-50`
   * (`components/ui/button.tsx`), así que la palabra está en el `class` del
   * botón esté apagado o encendido. Un test que la busque pasa siempre.
   *
   * Con el igual —`disabled=""`— solo aparece cuando React lo puso de verdad.
   * Lo encontró el implementador con una mutación que le sobrevivía, y la
   * revisión final auditó si hacía falta una barrida por el repo: **no** —
   * `grep -rln "disabled" --include=*.test.ts --include=*.test.tsx` devuelve un
   * solo archivo, y es el que ya está arreglado.
   */
  const dibujarCrudo = (cambios: Partial<FilaPlantilla> = {}): string =>
    renderToStaticMarkup(
      React.createElement(FilaDeLaSolapa, {
        fila: { ...FILA, ...cambios },
        detectando: false,
        onDetectar: () => {},
        onPonerEnUso: () => {},
      }),
    )

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

  /**
   * Este test nació vacuo y hay que dejarlo dicho, porque la trampa se repite.
   *
   * Asertaba `toContain(textoDesvinculados(2))` = "2 documentos de asesores
   * desvinculados"… y esa misma frase la imprime `explicacionDelEstado` en el
   * `<p>` de arriba, en el MISMO render. Medido por el revisor: borrar
   * `{avisoDesvinculados}` del componente dejaba los 876 en verde. O sea: el
   * agujero que este `describe` vino a tapar seguía abierto en el renglón de
   * al lado.
   *
   * Por eso se cuenta cuántas VECES aparece, no si aparece: dos, una por
   * renglón. El de "sin comparar" no necesita esto porque su frase corta y la
   * de la explicación están redactadas distinto y no se pisan.
   */
  const veces = (texto: string, frase: string) => texto.split(frase).length - 1

  it("el renglón de los desvinculados se dibuja igual, y no lo tapa la explicación de arriba", () => {
    const frase = textoDesvinculados(2)!
    const html = dibujar({ desvinculados: 2 })
    expect(html).toContain(frase)
    expect(
      veces(html, frase),
      "la frase aparece una sola vez: o se cayó el renglón corto, o se cayó la explicación",
    ).toBe(2)
    expect(dibujar({ desvinculados: 0 })).not.toContain("asesor desvinculado")
  })

  /**
   * ═══ El botón de poner en uso: que esté APAGADO cuando no corresponde ═══
   *
   * La revisión final midió que este botón era lo menos cubierto de la ronda:
   * cuatro mutaciones sobre su cableado, cuatro sobrevivientes. Los tests
   * dibujaban la fila y comprobaban que el MOTIVO se escribe, pero ninguno
   * comprobaba que el botón estuviera apagado — y a diferencia del panel, el
   * handler de la fila no tenía guard propio: el `disabled` era todo.
   *
   * (Ahora sí lo tiene, y por eso este test es la segunda puerta y no la
   * única. Pero el servidor no frena el caso de cero asesores activos.)
   */
  /**
   * El estado intermedio: la plantilla usa la v1 y ya hay documentos hechos con
   * la v2. El `version: 1` importa — mi primera versión de este fixture ponía
   * la vigente y la aplicada las dos en 2, o sea "no hay nada pendiente", y el
   * botón directamente no se dibujaba. El test fallaba por una contradicción
   * mía, no por el código.
   */
  const VERSION_APLICADA = {
    version: 1,
    versionYaAplicada: 2,
    versionIdYaAplicada: "v-2",
    yaAplicados: 2,
  }

  /**
   * Si ESE botón está apagado, no "si hay algún botón apagado".
   *
   * La primera versión de este test contaba todos los `disabled=""` de la fila
   * y **fallaba por un motivo que no tenía nada que ver**: con menos de 3
   * documentos, "Detectar plantilla" también está apagado. Un test que se cae
   * por el botón de al lado no mide lo que dice medir.
   */
  const botonDePonerEnUsoApagado = (html: string): boolean => {
    /**
     * Se recorren los `<button>` y se busca el que TIENE ese texto adentro.
     *
     * Mi primer intento hacía `indexOf("Poner la versión")` y miraba el
     * `<button` anterior — y agarraba la frase que la EXPLICACIÓN usa para
     * decirle al director qué botón apretar (`… con el botón "Poner la versión
     * 2 en uso"`), no el botón. Dos suposiciones mías equivocadas seguidas
     * sobre la misma fila: por eso el helper se escribe mirando la estructura,
     * no la distancia.
     */
    const botones = html.match(/<button[^>]*>[\s\S]*?<\/button>/g) ?? []
    /**
     * Sin el acento a propósito: el archivo pasó por varias herramientas y la
     * "ó" no matcheaba aunque el HTML la tuviera (lo midió una sonda: el HTML
     * incluía la frase y el filtro devolvía cero). "Poner la versi" identifica
     * al botón igual y no depende de cómo quedó codificado este archivo.
     */
    const suyo = botones.filter((b) => b.includes("Poner la versi"))
    expect(suyo.length, "no hay exactamente un botón de poner en uso").toBe(1)
    return suyo[0].includes('disabled=""')
  }

  it("con todos los activos ya aplicados, el botón de poner en uso está ENCENDIDO", () => {
    const html = dibujarCrudo({ ...VERSION_APLICADA, participan: 2, pendientes: 0, enRojo: 0 })
    expect(botonDePonerEnUsoApagado(html), "tendría que poder apretarse").toBe(false)
  })

  it("pero con uno esperando un dato, está APAGADO", () => {
    const html = dibujarCrudo({ ...VERSION_APLICADA, participan: 3, pendientes: 1, enRojo: 0 })
    expect(
      botonDePonerEnUsoApagado(html),
      "no se puede poner en uso mientras quede alguien esperando un dato",
    ).toBe(true)
  })

  it("y sin ningún asesor activo también, porque activar dejaría la plantilla en borrador", () => {
    const html = dibujarCrudo({ ...VERSION_APLICADA, participan: 0, pendientes: 0, enRojo: 0 })
    expect(botonDePonerEnUsoApagado(html)).toBe(true)
  })

  /**
   * Y el que NO apaga, que es tan importante como los que sí: un asesor en rojo
   * sobre la versión VIEJA no bloquea poner en uso la nueva. Si bloqueara, el
   * director quedaría trabado por un problema de la versión que está
   * reemplazando. Quien decide de verdad es el servidor, que mira quién no está
   * en la versión nueva.
   */
  it("un rojo de la versión vieja NO lo apaga", () => {
    const html = dibujarCrudo({ ...VERSION_APLICADA, participan: 3, pendientes: 0, enRojo: 1 })
    expect(botonDePonerEnUsoApagado(html)).toBe(false)
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
    const html = dibujar({ documentos: 2, participan: 2 })
    expect(html).toContain(motivoParaNoDetectar(2, 2)!)
    expect(dibujar({ documentos: 5, participan: 5 })).not.toContain("Para detectar la plantilla hacen falta")
  })

  /**
   * El que decide el botón es `participan`, no `documentos`. Si la fila se
   * dibujara con `documentos` —que es como estaba— un tipo con 3 cargados de
   * los cuales uno es de un pausado se vería SIN motivo y con el botón
   * habilitado, y la detección saldría con 2.
   */
  it("con documentos de más que no participan, el motivo se dibuja igual", () => {
    const html = dibujar({ documentos: 3, participan: 2 })
    expect(html).toContain(motivoParaNoDetectar(2, 3)!)
    expect(html).toContain("1 es de un asesor pausado o desvinculado")
  })

  it("y el nombre del tipo, su estado y cuántos tienen el documento cargado", () => {
    const html = dibujar({ documentos: 5 })
    expect(html).toContain("Contrato Partnership")
    expect(html).toContain("Activa")
    expect(html).toContain("5 asesores tienen este documento cargado")
    expect(dibujar({ documentos: 1 })).toContain("1 asesor tiene este documento cargado")
  })
})

// ---------------------------------------------------------------------------
// El borrador también acumula
// ---------------------------------------------------------------------------

/**
 * La rama `activa` se arregló en la ronda 4: los avisos se suman en vez de
 * pisarse. La rama `borrador` se quedó en primer-match-gana, con el mismo bug —
 * con rojos Y gente sin comparar, el director leía solo lo de los rojos, los
 * arreglaba, la plantilla no salía igual, y el otro motivo no aparecía hasta
 * que los rojos llegaban a cero.
 */
describe("explicacionDelEstado: en borrador los avisos también se acumulan", () => {
  it("rojos y sin comparar se dicen LOS DOS, no el primero", () => {
    const texto = explicacionDelEstado({ estado: "borrador", version: 1, enRojo: 2, sinComprobar: 1 })
    expect(texto).toContain("1 asesor no se comparó")
    expect(texto).toContain("2 asesores quedaron")
    expect(texto).toContain("no se aplica a nadie")
  })

  it("los tres avisos conviven, y en el mismo orden que en una plantilla activa", () => {
    const texto = explicacionDelEstado({
      estado: "borrador",
      version: 3,
      enRojo: 1,
      sinComprobar: 2,
      desvinculados: 1,
    })
    expect(texto).toContain("Es un borrador y todavía no se usa")
    expect(texto.indexOf("no se compararon")).toBeLessThan(texto.indexOf("quedó"))
    expect(texto.indexOf("quedó")).toBeLessThan(texto.indexOf("desvinculado"))
  })

  /**
   * El caso de siempre, que no puede cambiar: sin nada pendiente, el borrador
   * dice qué le falta y nada más.
   */
  it("sin nada pendiente sigue diciendo que falta confirmarla, y nada más", () => {
    expect(explicacionDelEstado({ estado: "borrador", version: 1, enRojo: 0, sinComprobar: 0 })).toBe(
      "Es un borrador y todavía no se usa: la plantilla ya está detectada pero falta confirmarla.",
    )
  })

  it("sin versión sigue mandando a detectar, y nada más", () => {
    expect(explicacionDelEstado({ estado: "borrador", version: null, enRojo: 0, sinComprobar: 0 })).toBe(
      "Es un borrador y todavía no se usa: falta detectar la plantilla a partir de los documentos cargados y " +
        "revisarla.",
    )
  })

  /**
   * Sin versión guardada no hay contra qué haberse comparado, y lo que hay que
   * hacer —detectar la plantilla— ya lo dice la primera oración. El aviso de
   * "sin comparar" ahí sería la misma instrucción dicha dos veces con dos
   * redacciones distintas.
   */
  it("sin versión NO se repite la instrucción de detectar", () => {
    const texto = explicacionDelEstado({ estado: "borrador", version: null, enRojo: 0, sinComprobar: 2 })
    expect(texto).toContain("falta detectar la plantilla")
    expect(texto).not.toContain("no se compararon")
    expect(texto.match(/detectar la plantilla/g)).toHaveLength(1)
  })

  /**
   * Las dos ramas dicen lo mismo del mismo problema. Si mañana alguien toca una
   * sola, esto lo caza.
   */
  it("el aviso de los sin comparar dice la misma cantidad en las dos ramas", () => {
    for (const cuantos of [1, 4]) {
      const activa = explicacionDelEstado({ estado: "activa", version: 1, enRojo: 0, sinComprobar: cuantos })
      const borrador = explicacionDelEstado({ estado: "borrador", version: 1, enRojo: 0, sinComprobar: cuantos })
      const quienes = cuantos === 1 ? "1 asesor no se comparó" : `${cuantos} asesores no se compararon`
      expect(activa).toContain(quienes)
      expect(borrador).toContain(quienes)
    }
  })

  it("y el de los rojos también, en las dos", () => {
    for (const cuantos of [1, 3]) {
      const activa = explicacionDelEstado({ estado: "activa", version: 1, enRojo: cuantos, sinComprobar: 0 })
      const borrador = explicacionDelEstado({ estado: "borrador", version: 1, enRojo: cuantos, sinComprobar: 0 })
      const quienes = cuantos === 1 ? "1 asesor quedó" : `${cuantos} asesores quedaron`
      expect(activa).toContain(quienes)
      expect(borrador).toContain(quienes)
    }
  })
})
