import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

import {
  BarraDeProgreso,
  CamposQueCambian,
  FilaDeAplicacion,
  ListaDeAvisos,
  LoQueSeLeyo,
  PasoElegir,
  TablaDeUbicaciones,
  VistaPrevia,
} from "@/components/asesor-docs/VersionNueva"
import { FilaDeLaSolapa } from "@/components/asesor-docs/PlantillasTab"
import {
  armarFilas,
  asesoresDeLaPlantilla,
  ASI_EMPIEZA_LA_ESPERA_DE_UN_DATO,
  COMO_SE_APLICA,
  COMO_TIENE_QUE_SER_EL_ARCHIVO,
  EL_ARCHIVO_SIGUE_ELEGIDO,
  etiquetaDeResultado,
  motivoParaNoElegirAsesor,
  motivoParaNoPonerEnUso,
  motivoParaNoSubirVersion,
  NADA_SE_APLICO_TODAVIA,
  PARA_QUE_SIRVE_LA_VERSION_NUEVA,
  PARA_QUE_SIRVE_LA_VISTA_PREVIA,
  PARA_QUE_SIRVE_PONER_EN_USO,
  resumenDelProgreso,
  textoDelArchivoElegido,
  textoPendientes,
  tituloDeCamposDesaparecidos,
  tituloDeCamposNuevos,
  tituloDeLaVistaPrevia,
  tituloDeLosQueFaltan,
  type AsesorDeLaPlantilla,
  type FilaPlantilla,
  type ResultadoDeAplicacion,
} from "./plantillas"
import { ASI_EMPIEZA_EL_PENDIENTE, observacionDePendiente } from "./generar"
import type { RespuestaVersionNueva, UbicacionDeValor } from "./version-nueva"

/**
 * LA PANTALLA DE LA VERSIÓN NUEVA (spec §7.4 y §7.5).
 *
 * ═══ Cómo se prueba una pantalla acá, y por qué así ═══
 *
 * Los tests del repo solo miran `lib/**` y `app/api/**`, así que todo lo que el
 * director LEE vive en `lib/asesor-docs/plantillas.ts`. Eso es necesario y NO
 * ALCANZA: está medido en esta misma etapa que cambiar `{avisoX}` por `{null}`
 * en el componente dejaba los tests en verde y borraba el renglón de la
 * pantalla. La función seguía existiendo y devolviendo la frase correcta; nadie
 * la dibujaba.
 *
 * Por eso acá los pedazos de la pantalla se DIBUJAN de verdad con
 * `renderToStaticMarkup` y se mira el HTML que sale. No hace falta jsdom: todos
 * estos componentes reciben lo suyo por props y no tocan la base ni la red — el
 * `VersionNueva` completo sí las toca, y por eso está partido en estas piezas.
 */

/** El texto visible: el HTML sin etiquetas y sin entidades. */
const visible = (nodo: React.ReactElement): string =>
  renderToStaticMarkup(nodo)
    .replace(/<[^>]*>/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")

const ANA: AsesorDeLaPlantilla = { advisorId: "a1", nombre: "Ana Pérez", participa: true }
const BRUNO: AsesorDeLaPlantilla = { advisorId: "a2", nombre: "Bruno Sanguinetti", participa: true }
const PAUSADO: AsesorDeLaPlantilla = { advisorId: "a3", nombre: "Carla Gómez", participa: false }

// ---------------------------------------------------------------------------
// Cuándo se puede subir una versión nueva, y cuándo no
// ---------------------------------------------------------------------------

describe("motivoParaNoSubirVersion", () => {
  it("con una plantilla activa y su versión, se puede: no hay motivo", () => {
    expect(motivoParaNoSubirVersion({ estado: "activa", version: 3 })).toBeNull()
  })

  /**
   * La versión nueva se lee COMPARÁNDOLA contra la vigente: sin una versión
   * guardada no hay contra qué. Es la misma negativa que devuelve el endpoint
   * (`SIN_VERSION_VIGENTE`), dicha antes de que el director elija el archivo.
   */
  it("sin versión vigente dice que primero hay que detectar la plantilla", () => {
    const motivo = motivoParaNoSubirVersion({ estado: "borrador", version: null })
    expect(motivo).not.toBeNull()
    expect(motivo).toContain("Detectá la plantilla")
  })

  it("en borrador con versión, dice que falta confirmarla", () => {
    const motivo = motivoParaNoSubirVersion({ estado: "borrador", version: 1 })
    expect(motivo).not.toBeNull()
    expect(motivo).toContain("borrador")
    expect(motivo).toContain("confirmala")
  })

  /** Un motivo vacío es un botón apagado sin explicación: un botón roto. */
  it("cuando hay motivo, siempre dice algo", () => {
    for (const fila of [
      { estado: "borrador" as const, version: null },
      { estado: "borrador" as const, version: 2 },
    ]) {
      expect(motivoParaNoSubirVersion(fila)!.length).toBeGreaterThan(40)
    }
  })
})

describe("motivoParaNoElegirAsesor", () => {
  it("con al menos un activo, no hay motivo", () => {
    expect(motivoParaNoElegirAsesor(1)).toBeNull()
  })

  /**
   * Sin ningún activo con documento no hay datos conocidos con los que buscar
   * adentro del Word, así que no hay nada determinista que hacer. El endpoint
   * lo rechaza igual; acá se dice antes, y con lo que el director puede hacer.
   */
  it("sin ninguno dice por qué y qué hacer", () => {
    const motivo = motivoParaNoElegirAsesor(0)
    expect(motivo).toContain("No hay ningún asesor activo")
    expect(motivo).toContain("Reactivá")
  })
})

// ---------------------------------------------------------------------------
// El archivo que se queda en memoria
// ---------------------------------------------------------------------------

describe("textoDelArchivoElegido", () => {
  it("dice el nombre y el tamaño en KB", () => {
    expect(textoDelArchivoElegido("contrato-v2.docx", 45 * 1024)).toBe("contrato-v2.docx · 45 KB")
  })

  it("de un megabyte para arriba, en MB", () => {
    expect(textoDelArchivoElegido("contrato.docx", 3 * 1024 * 1024)).toBe("contrato.docx · 3.0 MB")
  })

  /** Un "0 KB" al lado de un archivo que sí existe se lee como que no cargó. */
  it("un archivo chiquito no dice 0 KB", () => {
    expect(textoDelArchivoElegido("x.docx", 300)).toBe("x.docx · 1 KB")
  })
})

// ---------------------------------------------------------------------------
// El progreso (spec §7.5)
// ---------------------------------------------------------------------------

describe("resumenDelProgreso", () => {
  const cero = { total: 3, ok: 0, pendientes: 0, frenados: 0, errores: 0 }

  it("mientras corre dice cuántos van del total", () => {
    expect(resumenDelProgreso({ ...cero, ok: 1 })).toContain("1 de 3")
    expect(resumenDelProgreso({ ...cero, ok: 1 })).toContain("Esperá")
  })

  it("cuando salieron todos bien lo dice y no menciona problemas", () => {
    const texto = resumenDelProgreso({ ...cero, ok: 3 })
    expect(texto).toContain("Listo")
    expect(texto).toContain("los 3 asesores activos")
    expect(texto).not.toContain("siguen con el documento que tenían")
  })

  it("con uno solo habla en singular", () => {
    expect(resumenDelProgreso({ total: 1, ok: 1, pendientes: 0, frenados: 0, errores: 0 })).toContain(
      "el único asesor activo",
    )
  })

  /**
   * El número Y la consecuencia. "2 de 3" sin decir qué pasó con el otro deja
   * al director mirando una barra que no llega al final sin saber si tiene que
   * hacer algo.
   */
  it("con problemas dice cuántos salieron, qué pasó con los otros y que siguen como estaban", () => {
    const texto = resumenDelProgreso({ total: 4, ok: 1, pendientes: 1, frenados: 1, errores: 1 })
    expect(texto).toContain("1 de 4")
    expect(texto).toContain("a 1 le falta cargar un dato")
    expect(texto).toContain("1 se frenó")
    expect(texto).toContain("1 no se pudo intentar")
    expect(texto).toContain("siguen con el documento que tenían")
  })

  it("en plural concuerda", () => {
    const texto = resumenDelProgreso({ total: 6, ok: 0, pendientes: 2, frenados: 2, errores: 2 })
    expect(texto).toContain("a 2 les falta cargar un dato")
    expect(texto).toContain("2 se frenaron")
    expect(texto).toContain("2 no se pudieron intentar")
  })
})

// ---------------------------------------------------------------------------
// Poner la versión en uso
// ---------------------------------------------------------------------------

describe("motivoParaNoPonerEnUso", () => {
  it("con todos aplicados, se puede", () => {
    expect(motivoParaNoPonerEnUso({ total: 3, ok: 3 })).toBeNull()
  })

  it("con alguno atrás dice cuántos y qué pasaría si se activara igual", () => {
    const motivo = motivoParaNoPonerEnUso({ total: 3, ok: 1 })
    expect(motivo).toContain("quedan 2 asesores")
    expect(motivo).toContain("su contrato sigue siendo el viejo")
  })

  it("con uno solo atrás habla en singular", () => {
    expect(motivoParaNoPonerEnUso({ total: 3, ok: 2 })).toContain("queda 1 asesor")
  })

  /**
   * ═══ EL FRENO DEL CASO QUE HOY NO SE PUEDE ALCANZAR ═══
   *
   * `activar-version` solo exige que ningún asesor ACTIVO quede atrás. Con cero
   * activos esa condición se cumple sola, la versión se activaría, y el estado
   * que calcula `estadoDeLaPlantilla` con la lista vacía es `borrador`: poner
   * en uso una versión **degradaría la plantilla de `activa` a `borrador`** sin
   * que nadie lo hubiera pedido.
   *
   * Hasta hoy ese camino no se podía alcanzar desde ninguna pantalla. Esta es
   * la primera que podría, así que lo frena de este lado — antes de mandar el
   * pedido.
   */
  it("sin ningún asesor activo NO se puede, y dice por qué", () => {
    const motivo = motivoParaNoPonerEnUso({ total: 0, ok: 0 })
    expect(motivo).not.toBeNull()
    expect(motivo).toContain("volvería a quedar como borrador")
  })
})

// ---------------------------------------------------------------------------
// Las etiquetas de cada resultado
// ---------------------------------------------------------------------------

describe("etiquetaDeResultado", () => {
  const TODOS: ResultadoDeAplicacion[] = ["esperando", "corriendo", "ok", "pendiente", "frenado", "error"]

  it("los seis estados tienen etiqueta, y ninguna está vacía", () => {
    for (const estado of TODOS) {
      expect(etiquetaDeResultado(estado).length, `${estado} se quedó sin etiqueta`).toBeGreaterThan(3)
    }
  })

  /** Dos estados distintos con la misma etiqueta serían dos filas idénticas. */
  it("no hay dos estados que se lean igual", () => {
    const etiquetas = TODOS.map(etiquetaDeResultado)
    expect(new Set(etiquetas).size).toBe(TODOS.length)
  })

  it("el pendiente no se lee como un error: dice qué falta", () => {
    expect(etiquetaDeResultado("pendiente")).toContain("dato")
  })
})

// ---------------------------------------------------------------------------
// Los rótulos cortos
// ---------------------------------------------------------------------------

describe("los rótulos concuerdan en número", () => {
  it("campos nuevos", () => {
    expect(tituloDeCamposNuevos(1)).toBe("1 campo nuevo")
    expect(tituloDeCamposNuevos(3)).toBe("3 campos nuevos")
  })

  it("campos que ya no están", () => {
    expect(tituloDeCamposDesaparecidos(1)).toBe("1 campo que ya no está")
    expect(tituloDeCamposDesaparecidos(2)).toBe("2 campos que ya no están")
  })

  it("los que faltan para poder activar", () => {
    expect(tituloDeLosQueFaltan(1)).toContain("Falta este asesor")
    expect(tituloDeLosQueFaltan(4)).toContain("Faltan estos 4")
  })

  it("la vista previa nombra a la persona, no a un archivo", () => {
    expect(tituloDeLaVistaPrevia("Ana Pérez")).toContain("Ana Pérez")
  })
})

// ---------------------------------------------------------------------------
// Quiénes son los asesores de este tipo de documento
// ---------------------------------------------------------------------------

describe("asesoresDeLaPlantilla", () => {
  const documentos = [
    { template_id: "t1", estado: "ok", version_id: "v1", advisor_id: "a1" },
    { template_id: "t1", estado: "ok", version_id: "v1", advisor_id: "a2" },
    { template_id: "t2", estado: "ok", version_id: "v9", advisor_id: "a4" },
  ]
  const asesores = [
    { id: "a1", estado: "activo", full_name: "Zulema Ruiz" },
    { id: "a2", estado: "pausado", full_name: "Ana Pérez" },
    { id: "a4", estado: "activo", full_name: "Otro Tipo" },
  ]

  it("trae solo a los de ESE tipo de documento", () => {
    const salida = asesoresDeLaPlantilla({ templateId: "t1", documentos, asesores })
    expect(salida.map((a) => a.advisorId).sort()).toEqual(["a1", "a2"])
  })

  it("ordena por nombre, para que la lista no cambie entre dos recargas", () => {
    const salida = asesoresDeLaPlantilla({ templateId: "t1", documentos, asesores })
    expect(salida.map((a) => a.nombre)).toEqual(["Ana Pérez", "Zulema Ruiz"])
  })

  /** Pausados y desvinculados quedan afuera de la aplicación (spec §7.5). */
  it("marca quién participa y quién no", () => {
    const salida = asesoresDeLaPlantilla({ templateId: "t1", documentos, asesores })
    expect(salida.find((a) => a.advisorId === "a1")!.participa).toBe(true)
    expect(salida.find((a) => a.advisorId === "a2")!.participa).toBe(false)
  })

  /**
   * El que no aparece en la lista de perfiles NO participa: los dos endpoints
   * lo dejan afuera, así que ofrecérselo al director lo llevaría a pedir algo
   * que va a fallar.
   */
  it("sin perfil, no participa, y se lo nombra igual", () => {
    const salida = asesoresDeLaPlantilla({
      templateId: "t1",
      documentos: [{ template_id: "t1", estado: null, version_id: null, advisor_id: "fantasma" }],
      asesores: [],
    })
    expect(salida).toHaveLength(1)
    expect(salida[0].participa).toBe(false)
    /** Nunca un uuid pelado: el director no sabe quién es. */
    expect(salida[0].nombre).not.toBe("fantasma")
    expect(salida[0].nombre.length).toBeGreaterThan(5)
  })

  it("un asesor con dos documentos del mismo tipo no sale dos veces", () => {
    const salida = asesoresDeLaPlantilla({
      templateId: "t1",
      documentos: [
        { template_id: "t1", estado: null, version_id: null, advisor_id: "a1" },
        { template_id: "t1", estado: null, version_id: null, advisor_id: "a1" },
      ],
      asesores: [{ id: "a1", estado: "activo", full_name: "Ana" }],
    })
    expect(salida).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// EL ROJO QUE ADEMÁS ESPERA UN DATO
// ---------------------------------------------------------------------------

/**
 * ═══ El caso que quedaba mudo ═══
 *
 * `estadoAlQuedarPendiente` conserva el `revisar` cuando la persona ya estaba en
 * rojo, y eso es lo correcto. Pero la dejaba contada SOLO en rojo, y nada decía
 * que además le falta un dato de la versión nueva: el director arreglaba el
 * rojo, volvía a aplicar, y se encontraba con que seguía sin pasar por un
 * motivo que la solapa nunca nombró.
 *
 * El dato existe y está escrito en la `observacion` desde la 7b-1. Lo que
 * faltaba era que alguien la leyera.
 */
describe("armarFilas: el rojo que además espera un dato se cuenta en los DOS baldes", () => {
  const fila = (observacion: string | null) =>
    armarFilas({
      tipos: [{ id: "t1", nombre: "Contrato", estado: "activa", version_actual: "v1" }],
      versiones: [{ id: "v1", version: 1 }],
      documentos: [{ template_id: "t1", estado: "revisar", version_id: "v1", advisor_id: "a1", observacion }],
      asesores: [{ id: "a1", estado: "activo" }],
    })[0]

  it("sin la marca, sigue contando solo en rojo", () => {
    const f = fila("Su documento no coincide con la plantilla.")
    expect(f.enRojo).toBe(1)
    expect(f.pendientes).toBe(0)
  })

  it("con la marca, cuenta en los dos: las dos cosas son ciertas a la vez", () => {
    const f = fila(observacionDePendiente(["COMISION"], "Su documento no coincide con la plantilla."))
    expect(f.enRojo, "sigue siendo un rojo: su documento no coincide").toBe(1)
    expect(f.pendientes, "y además le falta un dato de la versión nueva").toBe(1)
  })

  it("sin observación no se cuenta como pendiente", () => {
    expect(fila(null).pendientes).toBe(0)
  })

  /**
   * La marca está escrita a mano en `plantillas.ts` porque ese archivo lo carga
   * el navegador y `generar.ts` arrastra la librería de comparación de textos.
   * Este test es lo único que impide que las dos se separen: si se separaran, el
   * balde volvería a quedar vacío y nadie se enteraría.
   */
  it("la marca de acá es la misma con la que arranca la anotación de generar.ts", () => {
    expect(ASI_EMPIEZA_LA_ESPERA_DE_UN_DATO).toBe(ASI_EMPIEZA_EL_PENDIENTE)
    expect(observacionDePendiente(["X"]).startsWith(ASI_EMPIEZA_LA_ESPERA_DE_UN_DATO)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// QUE TODO ESTO LLEGUE A LA PANTALLA
// ---------------------------------------------------------------------------

describe("el paso de elegir el archivo, dibujado", () => {
  const archivoFalso = { name: "contrato-v2.docx", size: 45 * 1024 } as unknown as File

  const dibujar = (cambios: Partial<React.ComponentProps<typeof PasoElegir>> = {}) =>
    visible(
      React.createElement(PasoElegir, {
        archivo: null,
        onElegirArchivo: () => {},
        moldeAdvisorId: "",
        onElegirAsesor: () => {},
        activos: [ANA, BRUNO],
        afuera: [],
        motivoSinAsesores: null,
        error: null,
        ...cambios,
      }),
    )

  it("el archivo elegido se ve, con su nombre y su tamaño", () => {
    expect(dibujar({ archivo: archivoFalso })).toContain(textoDelArchivoElegido("contrato-v2.docx", 45 * 1024))
  })

  it("el error del servidor se dibuja, y sus avisos también", () => {
    const html = dibujar({ error: { error: "Ese archivo no parece la versión nueva.", advertencias: ["Mirá ZONA."] } })
    expect(html).toContain("Ese archivo no parece la versión nueva.")
    expect(html).toContain("Mirá ZONA.")
  })

  /**
   * ═══ Lo que NO se puede caer de esta pantalla ═══
   *
   * El servidor borra el .docx apenas lo lee, salga bien o salga mal, así que
   * cualquier reintento necesita volver a subirlo. Esta pantalla se queda con el
   * `File` en memoria justo para eso — y si no lo DICE, el director lee un error
   * rojo y sale a buscar el archivo otra vez en el disco.
   */
  it("con un error y el archivo todavía elegido, se avisa que no hay que volver a buscarlo", () => {
    const html = dibujar({ archivo: archivoFalso, error: { error: "Salió mal.", advertencias: [] } })
    expect(html).toContain(EL_ARCHIVO_SIGUE_ELEGIDO)
  })

  it("sin archivo elegido ese aviso no aparece: no habría nada que conservar", () => {
    const html = dibujar({ archivo: null, error: { error: "Salió mal.", advertencias: [] } })
    expect(html).not.toContain(EL_ARCHIVO_SIGUE_ELEGIDO)
  })

  it("sin ningún asesor activo, en vez de una lista vacía se dibuja el motivo", () => {
    const html = dibujar({ activos: [], motivoSinAsesores: motivoParaNoElegirAsesor(0) })
    expect(html).toContain(motivoParaNoElegirAsesor(0)!)
  })

  /**
   * Un asesor que el director ve en la solapa y no encuentra acá es una pregunta
   * sin respuesta. El spec §7.5 los deja afuera; eso se dice, no se esconde.
   */
  it("los que quedan afuera se nombran, con el porqué", () => {
    const html = dibujar({ afuera: [PAUSADO] })
    expect(html).toContain("Carla Gómez")
    expect(html).toContain("pausado o desvinculado")
  })

  it("sin nadie afuera, no se dibuja ese renglón", () => {
    expect(dibujar({ afuera: [] })).not.toContain("pausado o desvinculado")
  })
})

/**
 * ═══ El agujero de `{avisoX}` → `{null}`, un piso más arriba ═══
 *
 * Los `describe` de acá abajo dibujan cada pieza por separado, y eso NO alcanza:
 * medido con mutación, sacar `<ListaDeAvisos>` del panel dejaba los 1331 tests
 * en verde. La pieza seguía existiendo y dibujando bien; nadie miraba si el
 * panel la montaba — y con ella se iba la cuenta cruzada, que es lo único que ve
 * el caso "nuestra oficina de Palermo" antes de que salga el contrato de todos.
 *
 * El panel completo no se puede dibujar acá (el `Sheet` de Radix necesita un
 * DOM), así que las cinco piezas viven juntas en `LoQueSeLeyo`, que sí se
 * dibuja. Lo único que queda sin red es la línea que la monta, y esa tiene su
 * test estructural más abajo.
 */
describe("todo lo que se leyó de la versión llega junto a la pantalla", () => {
  const leida: RespuestaVersionNueva = {
    versionId: "v2",
    version: 2,
    campos: { nuevos: ["COMISION"], desaparecidos: ["OFICINA"], iguales: ["NOMBRE"] },
    ubicaciones: [
      {
        campo: "ZONA",
        valor: "Palermo",
        veces: 2,
        posiciones: [10, 90],
        situacion: "repetido",
        corto: false,
        dentroDe: [],
      },
    ],
    vistaPrevia: { advisorId: "a1", nombre: "Ana Pérez", texto: "CONTRATO de Ana Pérez." },
    advertencias: ["Mirá esto antes de aplicar la versión: ZONA aparece 2 veces."],
    resumen: "Se leyó la versión 2 y se ubicaron 3 campos adentro del documento.",
    aplicada: false,
  }

  const html = visible(React.createElement(LoQueSeLeyo, { leida }))

  it("el resumen del servidor", () => {
    expect(html).toContain(leida.resumen)
  })

  it("los campos que cambian, con sus nombres", () => {
    expect(html).toContain(tituloDeCamposNuevos(1))
    expect(html).toContain("COMISION")
    expect(html).toContain("OFICINA")
  })

  /** Es el único lugar donde el director ve la cuenta cruzada antes de aplicar. */
  it("los avisos del servidor, enteros", () => {
    expect(html).toContain(leida.advertencias[0])
  })

  it("qué encontró de esa persona adentro del archivo", () => {
    expect(html).toContain("ZONA")
    expect(html).toContain("Palermo")
  })

  it("y la vista previa del §7.4.3", () => {
    expect(html).toContain(tituloDeLaVistaPrevia("Ana Pérez"))
    expect(html).toContain("CONTRATO de Ana Pérez.")
  })
})

describe("los avisos del servidor, dibujados", () => {
  it("cada aviso llega entero a la pantalla", () => {
    const avisos = ["El dato ZONA aparece 2 veces.", "Mirá esto antes de aplicar la versión."]
    const html = visible(React.createElement(ListaDeAvisos, { avisos }))
    for (const a of avisos) expect(html).toContain(a)
  })

  it("sin avisos no se dibuja el cartel vacío", () => {
    expect(visible(React.createElement(ListaDeAvisos, { avisos: [] }))).toBe("")
  })
})

describe("los campos que cambian, dibujados", () => {
  const campos = { nuevos: ["COMISION"], desaparecidos: ["OFICINA", "SUCURSAL"], iguales: ["NOMBRE"] }

  it("dibuja los rótulos y los nombres de los campos", () => {
    const html = visible(React.createElement(CamposQueCambian, { campos }))
    expect(html).toContain(tituloDeCamposNuevos(1))
    expect(html).toContain(tituloDeCamposDesaparecidos(2))
    expect(html).toContain("COMISION")
    expect(html).toContain("OFICINA")
    expect(html).toContain("SUCURSAL")
  })

  it("sin cambios no se dibuja nada", () => {
    expect(
      visible(React.createElement(CamposQueCambian, { campos: { nuevos: [], desaparecidos: [], iguales: ["A"] } })),
    ).toBe("")
  })
})

describe("la vista previa, dibujada (spec §7.4.3)", () => {
  it("dibuja el título con el nombre, el para qué sirve y el texto del documento", () => {
    const html = visible(
      React.createElement(VistaPrevia, { nombre: "Ana Pérez", texto: "CONTRATO entre Ana Pérez y la inmobiliaria." }),
    )
    expect(html).toContain(tituloDeLaVistaPrevia("Ana Pérez"))
    expect(html).toContain(PARA_QUE_SIRVE_LA_VISTA_PREVIA)
    expect(html).toContain("CONTRATO entre Ana Pérez")
  })
})

describe("la tabla de lo que encontró, dibujada", () => {
  const ubicacion = (extra: Partial<UbicacionDeValor>): UbicacionDeValor => ({
    campo: "ZONA",
    valor: "Palermo",
    veces: 1,
    posiciones: [0],
    situacion: "encontrado",
    corto: false,
    dentroDe: [],
    ...extra,
  })

  it("dibuja el campo y su valor", () => {
    const html = visible(React.createElement(TablaDeUbicaciones, { ubicaciones: [ubicacion({})] }))
    expect(html).toContain("ZONA")
    expect(html).toContain("Palermo")
  })

  it("un dato repetido dice en cuántos lugares está", () => {
    const html = visible(
      React.createElement(TablaDeUbicaciones, { ubicaciones: [ubicacion({ situacion: "repetido", veces: 3 })] }),
    )
    expect(html).toContain("3 lugares")
  })

  /** Un valor vacío se DICE: en blanco parece que la pantalla no cargó. */
  it("un campo sin dato no queda en blanco", () => {
    const html = visible(
      React.createElement(TablaDeUbicaciones, {
        ubicaciones: [ubicacion({ valor: "", situacion: "sin-dato", veces: 0, posiciones: [] })],
      }),
    )
    expect(html).toContain("(vacío en su ficha)")
    expect(html).toContain("sin dato cargado")
  })

  it("uno que no aparece se dice con esas palabras", () => {
    const html = visible(
      React.createElement(TablaDeUbicaciones, {
        ubicaciones: [ubicacion({ situacion: "ausente", veces: 0, posiciones: [] })],
      }),
    )
    expect(html).toContain("no aparece")
  })
})

describe("la barra de progreso, dibujada", () => {
  it("dibuja el renglón que dice cuántos van", () => {
    const cuenta = { total: 3, ok: 1, pendientes: 1, frenados: 0, errores: 0 }
    const html = visible(
      React.createElement(BarraDeProgreso, { hechos: 2, total: 3, resumen: resumenDelProgreso(cuenta) }),
    )
    expect(html).toContain(resumenDelProgreso(cuenta))
  })

  /** Con cero asesores la división daría NaN y la barra saldría rota. */
  it("con cero asesores no se rompe", () => {
    expect(() =>
      renderToStaticMarkup(React.createElement(BarraDeProgreso, { hechos: 0, total: 0, resumen: "x" })),
    ).not.toThrow()
  })
})

describe("la fila de cada asesor mientras se aplica, dibujada (spec §7.5)", () => {
  const dibujar = (estado: ResultadoDeAplicacion, mensaje: string | null = null, bloqueado = false) =>
    visible(
      React.createElement(FilaDeAplicacion, {
        asesor: ANA,
        resultado: { estado, mensaje },
        bloqueado,
        onReintentar: () => {},
      }),
    )

  it("dibuja el nombre de la persona y la etiqueta de su estado", () => {
    for (const estado of ["esperando", "corriendo", "ok", "pendiente", "frenado", "error"] as ResultadoDeAplicacion[]) {
      const html = dibujar(estado)
      expect(html).toContain("Ana Pérez")
      expect(html, `se cayó la etiqueta de ${estado}`).toContain(etiquetaDeResultado(estado))
    }
  })

  /**
   * El mensaje del servidor es la lista de qué arreglar en el Word, y son
   * párrafos escritos para el director. Si no se dibuja, el 409 de la red se
   * convierte en una fila roja sin motivo.
   */
  it("el motivo que devolvió el servidor se dibuja entero", () => {
    const motivo = "No se le generó el documento a Ana Pérez: quedó un lugar sin rellenar."
    expect(dibujar("frenado", motivo)).toContain(motivo)
  })

  it("el que salió mal ofrece probar de nuevo", () => {
    expect(dibujar("frenado", "algo")).toContain("Probar de nuevo")
    expect(dibujar("pendiente", "algo")).toContain("Probar de nuevo")
    expect(dibujar("error", "algo")).toContain("Probar de nuevo")
  })

  it("el que salió bien no ofrece nada que reintentar", () => {
    expect(dibujar("ok", "listo")).not.toContain("Probar de nuevo")
    expect(dibujar("esperando")).not.toContain("Probar de nuevo")
  })
})

// ---------------------------------------------------------------------------
// Y LA FILA DE LA SOLAPA, QUE ES DE DONDE SE ENTRA
// ---------------------------------------------------------------------------

describe("la fila de la solapa: el botón de la versión nueva", () => {
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
  }

  const dibujar = (cambios: Partial<FilaPlantilla> = {}) =>
    visible(
      React.createElement(FilaDeLaSolapa, {
        fila: { ...FILA, ...cambios },
        detectando: false,
        onDetectar: () => {},
        onSubirVersion: () => {},
      }),
    )

  it("el botón está en la fila", () => {
    expect(dibujar()).toContain("Subir versión nueva")
  })

  /**
   * Un botón apagado que no dice por qué es un botón roto, y acá el motivo no
   * es adivinable. Va escrito y siempre visible: un `title` no se dibuja nunca
   * sobre un botón deshabilitado de shadcn (`pointer-events: none`), y en el
   * celular no hay dónde pasar el mouse.
   */
  it("cuando no se puede, el motivo se dibuja", () => {
    const html = dibujar({ estado: "borrador", version: null })
    expect(html).toContain(motivoParaNoSubirVersion({ estado: "borrador", version: null })!)
  })

  it("cuando sí se puede, ese motivo no está", () => {
    expect(dibujar()).not.toContain("Detectá la plantilla con los documentos que ya tenés cargados")
  })

  /**
   * El cuarto balde: le falta un dato que la versión nueva trajo, así que sigue
   * con la versión anterior. Es lo que traba poner la versión en uso, y sin este
   * renglón el director no tiene de dónde sacarlo.
   */
  it("el renglón de los que esperan un dato se dibuja", () => {
    expect(dibujar({ pendientes: 1 })).toContain(textoPendientes(1)!)
    expect(dibujar({ pendientes: 4 })).toContain(textoPendientes(4)!)
  })

  it("sin ninguno, ese renglón NO se dibuja", () => {
    expect(dibujar({ pendientes: 0 })).not.toContain("con un dato nuevo sin completar")
  })
})

// ---------------------------------------------------------------------------
// Y QUE LA PANTALLA NO SE ESCRIBA SUS PROPIOS TEXTOS
// ---------------------------------------------------------------------------

/**
 * Lo de arriba dibuja; esto mira el `.tsx` como texto. Los dos hacen falta: el
 * dibujo prueba que el renglón llega a la pantalla, y esto prueba que el texto
 * que llega **sale de lib** y no está escrito a mano al lado. La falla de la
 * Task 5 fue exactamente esa: la frase se sacó de un lado y reapareció escrita
 * a mano treinta líneas más arriba.
 */
describe("la pantalla de la versión nueva no se escribe su propia prosa", () => {
  const FUENTE = readFileSync(path.resolve(__dirname, "../../components/asesor-docs/VersionNueva.tsx"), "utf8")

  /**
   * El archivo SIN comentarios, para las comprobaciones que miran el código.
   *
   * Hace falta y no es prolijidad: los comentarios de este componente EXPLICAN
   * lo que está prohibido —"un `Promise.all` mandaría N pedidos a la vez"— así
   * que un `not.toContain("Promise.all")` sobre el archivo entero da rojo por
   * la explicación y no por el código. Un test que falla por su propia
   * documentación se termina borrando, y con él la comprobación.
   */
  const CODIGO = FUENTE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

  const DE_LIB: Record<string, string> = {
    PARA_QUE_SIRVE_LA_VERSION_NUEVA,
    COMO_TIENE_QUE_SER_EL_ARCHIVO,
    EL_ARCHIVO_SIGUE_ELEGIDO,
    NADA_SE_APLICO_TODAVIA,
    COMO_SE_APLICA,
    PARA_QUE_SIRVE_LA_VISTA_PREVIA,
    PARA_QUE_SIRVE_PONER_EN_USO,
  }

  for (const [nombre, texto] of Object.entries(DE_LIB)) {
    it(`${nombre} se usa por su nombre y no está copiado en el JSX`, () => {
      expect(FUENTE).toContain(nombre)
      /**
       * Los primeros 40 caracteres alcanzan para reconocer una copia y no
       * dependen de dónde corte la línea.
       */
      expect(FUENTE, `${nombre} está escrito a mano adentro del componente`).not.toContain(texto.slice(0, 40))
    })
  }

  /** Y que no queden vacíos: un texto vacío pasa cualquier `not.toContain`. */
  it("ninguno de esos textos está vacío", () => {
    for (const [nombre, texto] of Object.entries(DE_LIB)) {
      expect(texto.length, `${nombre} se quedó sin texto`).toBeGreaterThan(60)
    }
  })

  /**
   * Los tres pedidos mandan ids y NADA de autoridad: la inmobiliaria y el rol
   * salen de la sesión del servidor. Lo único que el navegador decide es dónde
   * subir el archivo, y esa ruta la vuelve a validar el servidor contra la
   * sesión (`validarRutaDeVersionNueva`).
   */
  it("ningún pedido manda el agency_id en el cuerpo", () => {
    const cuerpos = CODIGO.match(/JSON\.stringify\(\{[^}]*\}\)/g) ?? []
    expect(cuerpos.length).toBeGreaterThan(2)
    for (const cuerpo of cuerpos) expect(cuerpo).not.toContain("agencyId")
  })

  /** La ruta del archivo SIEMPRE sale de `rutaDeVersionNueva`, nunca a mano. */
  it("la ruta de Storage sale de la función de lib", () => {
    expect(CODIGO).toContain("rutaDeVersionNueva(agencyId, crypto.randomUUID())")
    expect(CODIGO).not.toContain("_versiones-nuevas/")
  })

  /**
   * La única línea del panel que ningún dibujo alcanza: la que monta las cinco
   * piezas. Si desaparece, el director ve la pantalla vacía entre el resumen y
   * la barra de abajo.
   */
  it("el panel monta lo que se leyó", () => {
    expect(CODIGO).toContain("<LoQueSeLeyo leida={leida} />")
  })

  /**
   * De a UNO y en serie (spec §7.5). Un `Promise.all` mandaría N pedidos a la
   * vez —cada uno baja el molde, el original y hasta tres documentos más— y no
   * habría progreso que mostrar ni forma de que uno que falla no voltee a los
   * otros.
   */
  it("los asesores se aplican en serie, no todos juntos", () => {
    expect(CODIGO).toContain("for (const asesor of activos)")
    expect(CODIGO).not.toContain("Promise.all")
  })

  /**
   * Y el archivo NO se suelta al fallar: si esta línea apareciera en el camino
   * del error, el director tendría que volver a buscarlo en el disco después de
   * cada rechazo.
   */
  it("el File solo se suelta cuando el director elige otro", () => {
    const veces = CODIGO.split("setArchivo(null)").length - 1
    expect(veces, "alguien suelta el archivo en un camino de error").toBe(2)
    expect(CODIGO).toContain("const validacion = validarArchivo(file.name, file.size")
  })
})
