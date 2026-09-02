import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

import {
  BarraDeLaAplicacion,
  BarraDeProgreso,
  CamposQueCambian,
  ElProgreso,
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
  aplicarDeAUno,
  asesoresDeLaPlantilla,
  ASI_EMPIEZA_LA_ESPERA_DE_UN_DATO,
  botonDePonerEnUso,
  explicacionDelEstado,
  COMO_SE_APLICA,
  COMO_TIENE_QUE_SER_EL_ARCHIVO,
  EL_ARCHIVO_SIGUE_ELEGIDO,
  etiquetaDeResultado,
  motivoParaNoElegirAsesor,
  motivoParaNoPonerEnUso,
  motivoParaNoPonerEnUsoDesdeLaFila,
  motivoParaNoSubirVersion,
  NADA_SE_APLICO_TODAVIA,
  PARA_QUE_SIRVE_LA_VERSION_NUEVA,
  PARA_QUE_SIRVE_LA_VISTA_PREVIA,
  PARA_QUE_SIRVE_PONER_EN_USO,
  resultadoDeLaAplicacion,
  resumenDelProgreso,
  textoDeLosQueQuedanAfuera,
  textoDelArchivoElegido,
  textoPendientes,
  tituloDeCamposDesaparecidos,
  tituloDeCamposNuevos,
  tituloDeLaVistaPrevia,
  tituloDeLosQueFaltan,
  textoYaAplicados,
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
    yaAplicados: 0,
    versionYaAplicada: null,
    versionIdYaAplicada: null,
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
   * ═══ Las tres líneas del panel que ningún dibujo alcanza ═══
   *
   * El bucle del §7.5 y la traducción del 200 se mudaron a lib, donde se
   * CORREN; el bloque de progreso y la barra de abajo se mudaron a componentes
   * exportados, donde se DIBUJAN. Lo que queda acá es el cableado, y estos tres
   * asserts son su red: si alguien vuelve a escribir el bucle a mano adentro del
   * panel, o deja de montar una de las dos piezas, esto se pone en rojo.
   */
  it("el bucle de aplicar sale de lib, no está escrito a mano en el panel", () => {
    expect(CODIGO).toContain("await aplicarDeAUno({")
    expect(CODIGO, "el bucle volvió al panel, donde ningún test lo mide").not.toContain("for (const asesor of")
  })

  /**
   * Era la única prosa de esta pantalla escrita a mano en el JSX. Se dibuja en
   * el test de arriba, así que no estaba sin red — pero la regla de la etapa no
   * tiene excepciones, porque una excepción es el precedente de la siguiente.
   */
  it("el texto de los que quedan afuera sale de lib, y no está copiado acá", () => {
    expect(CODIGO).toContain("textoDeLosQueQuedanAfuera(afuera.map((a) => a.nombre))")
    expect(CODIGO).not.toContain("no está en la lista")
  })

  /**
   * Cerrar el panel se frena mientras corre CUALQUIERA de las dos cosas.
   *
   * Miraba solo `aplicando`, así que un Escape durante "poner en uso" cerraba
   * el panel, la solapa recargaba antes de que el servidor terminara, y el
   * director veía el estado intermedio unos segundos sobre una versión que ya
   * estaba en uso. No hace daño —es idempotente— pero le muestra algo que ya
   * no es cierto, que es lo único que esta pantalla no puede hacer.
   *
   * Va como assert de código porque el `cerrar()` no se puede alcanzar desde
   * un test: el `Sheet` de Radix necesita un DOM. Medido: sacarle el
   * `|| activando` deja los 1402 en verde.
   */
  it("cerrar el panel se frena también mientras se pone la versión en uso", () => {
    expect(CODIGO).toContain("if (aplicando || activando) return;")
  })

  it("la traducción de la respuesta sale de lib", () => {
    expect(CODIGO).toContain("resultadoDeLaAplicacion({ ok: res.ok, status: res.status, estado: cuerpo?.estado })")
  })

  /**
   * Y se pega el cableado ENTERO, no el nombre del componente.
   *
   * Con `toContain("<ElProgreso")` sobrevivían dos mutaciones medidas: envolverlo
   * en `{false && (…)}` —el nombre sigue estando— y renombrar el componente
   * (`<BarraDeLaAplicacionQueNoExiste` contiene `<BarraDeLaAplicacion`). Pegando
   * la primera prop al nombre, las dos caen.
   */
  const APRETADO = CODIGO.replace(/\s+/g, " ")

  /**
   * El cableado ENTERO, no la primera prop.
   *
   * Con `toContain("<ElProgreso arranco={arranco}")` **todavía sobrevivía una
   * mutación**, medida por el controlador: pasarle `activos={[]}` en vez de
   * `activos={activos}` dejaba los 1397 en verde. El componente sí está
   * probado —se dibuja y muestra una fila por asesor—, pero **el cableado que
   * le pasa la lista no lo miraba nadie**, así que el panel podía quedarse sin
   * las filas de estado por fila que pide el §7.5 y ningún test se enteraba.
   *
   * Es la misma lección que ya dejó dos veces esta pantalla: **la pieza
   * cubierta no implica el cableado cubierto**. Se fijan las props de las que
   * depende que el §7.5 se cumpla, no todas: `arranco` (que se dibuje),
   * `activos` (una fila por persona) y `porAsesor` (el estado de cada una).
   */
  it("el panel monta el progreso, con su condición adentro y con la gente de verdad", () => {
    expect(APRETADO).toContain("<ElProgreso arranco={arranco} activos={activos} porAsesor={porAsesor}")
  })

  /**
   * Y de la barra, las que deciden si el director puede apretar dos veces o
   * activar cuando no corresponde.
   *
   * El comentario anterior decía que las tres primeras cubrían "activar cuando
   * no corresponde" **y era falso**: lo midió la revisión final, poniendo
   * `motivoParaNoActivar={null}` — sobrevivía. Esa prop es justamente la que
   * decide si el botón de activar está apagado, así que va en el assert.
   *
   * `enUso` queda afuera a propósito: decide qué dice el botón, no si se puede
   * apretar. Se fija lo que manda, no todo — un assert que pega el JSX entero
   * se rompe con cualquier reformateo y eso también cuesta.
   */
  it("y monta la barra de aplicar, con lo que decide si se puede apretar", () => {
    expect(APRETADO).toContain("<BarraDeLaAplicacion arranco={arranco} aplicando={aplicando} activando={activando}")
  })

  it("y le pasa el motivo por el que NO se puede activar, que es lo que apaga el botón", () => {
    expect(APRETADO).toContain("motivoParaNoActivar={motivoParaNoActivar}")
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

// ---------------------------------------------------------------------------
// EL ESTADO INTERMEDIO: YA APLICADO, TODAVÍA SIN PONER EN USO
// ---------------------------------------------------------------------------

/**
 * ═══ El bloqueante de la revisión ═══
 *
 * `aplicar-version/{advisorId}` le escribe a cada asesor su `version_id` nuevo, y
 * `activar-version` es lo ÚNICO que mueve `version_actual`. Entre las dos hay un
 * estado donde `doc.version_id !== vigente` — y NO es un borde: mientras quede un
 * `pendiente` la versión no se puede poner en uso, así que la fila se queda ahí
 * hasta que el director le complete el dato a esa persona.
 *
 * Antes esos asesores caían en `sinComprobar` y la fila decía cuatro cosas falsas
 * sobre ellos, más una instrucción peor que falsa: volver a detectar la
 * plantilla, que la reconstruiría desde los documentos que acababan de salir de
 * ella.
 */
describe("armarFilas: el que ya recibió la versión nueva no está 'sin comprobar'", () => {
  const tipoEnV1 = { id: "t1", nombre: "Contrato", estado: "activa", version_actual: "v1" }
  const versiones = [
    { id: "v1", version: 1 },
    { id: "v2", version: 2 },
  ]
  const armar = (
    documentos: Parameters<typeof armarFilas>[0]["documentos"],
    asesores = [{ id: "a1", estado: "activo" }],
  ) => armarFilas({ tipos: [tipoEnV1], versiones, documentos, asesores })[0]

  it("va a su propio balde, y NO al de sin comprobar", () => {
    const fila = armar([{ template_id: "t1", estado: "ok", version_id: "v2", advisor_id: "a1" }])
    expect(fila.yaAplicados, "el balde nuevo").toBe(1)
    expect(fila.sinComprobar, "no puede seguir contándose como sin comparar").toBe(0)
    expect(fila.enRojo).toBe(0)
  })

  it("trae con qué ponerla en uso: el número y el id de esa versión", () => {
    const fila = armar([{ template_id: "t1", estado: "ok", version_id: "v2", advisor_id: "a1" }])
    expect(fila.versionYaAplicada).toBe(2)
    expect(fila.versionIdYaAplicada).toBe("v2")
  })

  /**
   * Lo que `sinComprobar` SÍ cuida no se puede romper: el pausado que quedó con
   * la versión vieja y el que subió su documento después tienen un `version_id`
   * más VIEJO o nulo, no más nuevo.
   */
  it("el que quedó con una versión MÁS VIEJA sigue contándose como sin comparar", () => {
    const fila = armarFilas({
      tipos: [{ id: "t1", nombre: "Contrato", estado: "activa", version_actual: "v2" }],
      versiones,
      documentos: [{ template_id: "t1", estado: "ok", version_id: "v1", advisor_id: "a1" }],
      asesores: [{ id: "a1", estado: "activo" }],
    })[0]
    expect(fila.sinComprobar).toBe(1)
    expect(fila.yaAplicados).toBe(0)
  })

  it("el que subió su documento después, con version_id en null, también sigue ahí", () => {
    const fila = armar([{ template_id: "t1", estado: null, version_id: null, advisor_id: "a1" }])
    expect(fila.sinComprobar).toBe(1)
    expect(fila.yaAplicados).toBe(0)
  })

  /** Si la consulta no trajo esa fila de versión, no se afirma nada nuevo. */
  it("sin poder saber el número de la versión, cae donde caía antes", () => {
    const fila = armarFilas({
      tipos: [tipoEnV1],
      versiones: [{ id: "v1", version: 1 }],
      documentos: [{ template_id: "t1", estado: "ok", version_id: "v9", advisor_id: "a1" }],
      asesores: [{ id: "a1", estado: "activo" }],
    })[0]
    expect(fila.yaAplicados).toBe(0)
    expect(fila.sinComprobar).toBe(1)
  })

  /**
   * El caso central del §7.4.2, y el que la revisión midió como el peor: dos ya
   * aplicados y uno en `pendiente`. Antes juntaba el aviso correcto del
   * pendiente con dos falsos.
   */
  it("con uno en pendiente, cada uno cae en su balde y ninguno en sin comprobar", () => {
    const fila = armarFilas({
      tipos: [tipoEnV1],
      versiones,
      documentos: [
        { template_id: "t1", estado: "ok", version_id: "v2", advisor_id: "a1" },
        { template_id: "t1", estado: "ok", version_id: "v2", advisor_id: "a2" },
        { template_id: "t1", estado: "pendiente", version_id: "v1", advisor_id: "a3" },
      ],
      asesores: [
        { id: "a1", estado: "activo" },
        { id: "a2", estado: "activo" },
        { id: "a3", estado: "activo" },
      ],
    })[0]
    expect(fila.yaAplicados).toBe(2)
    expect(fila.pendientes).toBe(1)
    expect(fila.sinComprobar, "el estado normal del §7.4.2 no puede mentir").toBe(0)
  })

  /** Con dos versiones nuevas conviviendo gana la más alta: es la única activable. */
  it("con v2 y v3 dando vueltas, se ofrece la más nueva", () => {
    const fila = armarFilas({
      tipos: [tipoEnV1],
      versiones: [...versiones, { id: "v3", version: 3 }],
      documentos: [
        { template_id: "t1", estado: "ok", version_id: "v2", advisor_id: "a1" },
        { template_id: "t1", estado: "ok", version_id: "v3", advisor_id: "a2" },
      ],
      asesores: [
        { id: "a1", estado: "activo" },
        { id: "a2", estado: "activo" },
      ],
    })[0]
    expect(fila.yaAplicados).toBe(2)
    expect(fila.versionIdYaAplicada).toBe("v3")
    expect(fila.versionYaAplicada).toBe(3)
  })
})

describe("lo que la fila DICE en el estado intermedio", () => {
  const enElMedio = {
    estado: "activa" as const,
    version: 1,
    enRojo: 0,
    sinComprobar: 0,
    yaAplicados: 3,
    versionYaAplicada: 2,
  }

  it("ya no dice que no se compararon ni manda a detectar de nuevo", () => {
    const texto = explicacionDelEstado(enElMedio)
    expect(texto, "la afirmación falsa").not.toContain("no se compararon")
    expect(texto, "la instrucción que reconstruiría la plantilla desde su propia salida").not.toContain(
      "volvé a detectar",
    )
  })

  /**
   * Y la PRIMERA línea también era falsa: los documentos de esos asesores están
   * hechos con la versión nueva, no con la vigente.
   */
  it("tampoco arranca diciendo que la vigente es la de los documentos de todos", () => {
    expect(explicacionDelEstado(enElMedio)).not.toContain(
      "es la versión con la que están hechos los documentos de los asesores activos",
    )
  })

  it("dice lo que pasó, con los dos números de versión", () => {
    const texto = explicacionDelEstado(enElMedio)
    expect(texto).toContain("3 asesores ya tienen su documento de la versión 2")
    expect(texto).toContain("todavía usa la versión 1")
  })

  it("y dice que a esas personas no hay que comprobarles nada", () => {
    expect(explicacionDelEstado(enElMedio)).toContain("no hay que comprobarle nada")
  })

  /** La instrucción tiene que nombrar el botón que de verdad está en la fila. */
  it("manda a apretar el botón, con el rótulo exacto que tiene el botón", () => {
    expect(explicacionDelEstado(enElMedio)).toContain(botonDePonerEnUso(2))
  })

  it("con uno solo, todo el renglón concuerda en número", () => {
    const texto = explicacionDelEstado({ ...enElMedio, yaAplicados: 1 })
    expect(texto).toContain("1 asesor ya tiene su documento")
    expect(texto).toContain("A esa persona no hay que comprobarle nada")
  })

  /** Sin los números todavía tiene que decir algo que se entienda. */
  it("sin saber los números de versión, no escribe 'la versión null'", () => {
    const texto = explicacionDelEstado({ ...enElMedio, version: null, versionYaAplicada: null })
    expect(texto).not.toContain("null")
    expect(texto).toContain("la versión nueva")
  })

  it("sin nadie aplicado, la explicación vuelve a arrancar como siempre", () => {
    expect(explicacionDelEstado({ ...enElMedio, yaAplicados: 0 })).toContain("Está en uso")
  })

  /** El aviso del pendiente sigue diciéndose: los dos hechos son ciertos a la vez. */
  it("con un pendiente adentro se dicen los dos, y ninguno falso", () => {
    const texto = explicacionDelEstado({ ...enElMedio, yaAplicados: 2, pendientes: 1 })
    expect(texto).toContain("2 asesores ya tienen su documento")
    expect(texto).toContain("le falta completar un dato")
    expect(texto).not.toContain("no se compararon")
  })

  it("en un borrador también se dice", () => {
    const texto = explicacionDelEstado({ ...enElMedio, estado: "borrador" })
    expect(texto).toContain("ya tienen su documento de la versión 2")
  })
})

describe("motivoParaNoPonerEnUsoDesdeLaFila", () => {
  const listo = { yaAplicados: 3, pendientes: 0, participan: 3 }

  it("con todos aplicados y ninguno esperando un dato, se puede", () => {
    expect(motivoParaNoPonerEnUsoDesdeLaFila(listo)).toBeNull()
  })

  it("con alguien esperando un dato, no: y dice qué hacer primero", () => {
    const motivo = motivoParaNoPonerEnUsoDesdeLaFila({ ...listo, pendientes: 1 })
    expect(motivo).toContain("completá el dato")
    expect(motivo).toContain("no se puede poner en uso")
  })

  it("en plural concuerda", () => {
    expect(motivoParaNoPonerEnUsoDesdeLaFila({ ...listo, pendientes: 2 })).toContain("a los 2 asesores")
  })

  /** El mismo freno del arrastrado 4, por el otro camino. */
  it("sin ningún asesor activo no se puede: dejaría la plantilla como borrador", () => {
    expect(motivoParaNoPonerEnUsoDesdeLaFila({ ...listo, participan: 0 })).toContain("como borrador")
  })

  it("sin nada aplicado tampoco hay nada que poner en uso", () => {
    expect(motivoParaNoPonerEnUsoDesdeLaFila({ ...listo, yaAplicados: 0 })).not.toBeNull()
  })
})

describe("la fila dibujada en el estado intermedio", () => {
  const FILA: FilaPlantilla = {
    templateId: "t1",
    nombre: "Contrato Partnership",
    estado: "activa",
    version: 1,
    documentos: 3,
    participan: 3,
    enRojo: 0,
    sinComprobar: 0,
    desvinculados: 0,
    pendientes: 0,
    yaAplicados: 3,
    versionYaAplicada: 2,
    versionIdYaAplicada: "v2",
  }

  const dibujar = (cambios: Partial<FilaPlantilla> = {}) =>
    visible(
      React.createElement(FilaDeLaSolapa, {
        fila: { ...FILA, ...cambios },
        detectando: false,
        onDetectar: () => {},
        onSubirVersion: () => {},
        onPonerEnUso: () => {},
      }),
    )

  it("el renglón de los ya aplicados se dibuja", () => {
    expect(dibujar()).toContain(textoYaAplicados(3)!)
    expect(dibujar({ yaAplicados: 1 })).toContain(textoYaAplicados(1)!)
  })

  it("sin ninguno, ese renglón no está", () => {
    expect(dibujar({ yaAplicados: 0, versionIdYaAplicada: null })).not.toContain(
      "ya tiene el documento de la versión nueva",
    )
  })

  /**
   * El botón que hace que la instrucción se pueda ejecutar. Sin él, el aviso
   * manda a apretar algo que no existe: el panel arranca siempre pidiendo un
   * Word, así que el director que aplicó y cerró no tenía forma de terminar.
   *
   * ═══ Y se cuentan las VECES, no si aparece ═══
   *
   * La misma trampa que ya cobró una vez con el renglón de los desvinculados, y
   * acá la piso yo: el rótulo del botón lo imprime TAMBIÉN la explicación de
   * arriba —a propósito, para mandarlo a apretar el botón con su nombre exacto—
   * así que un `toContain` pelado pasaba en verde con el botón borrado. Medido:
   * `{hayQuePonerEnUso && (` → `{false && (` sobrevivía.
   *
   * Dos veces: una en la explicación, otra en el botón.
   */
  const veces = (texto: string, frase: string) => texto.split(frase).length - 1

  it("el botón de poner en uso se dibuja, y no lo tapa la explicación de arriba", () => {
    const html = dibujar()
    expect(
      veces(html, botonDePonerEnUso(2)),
      "aparece una sola vez: o se cayó el botón, o se cayó la explicación que lo nombra",
    ).toBe(2)
  })

  it("sin ninguna versión aplicada, ese botón NO está", () => {
    expect(dibujar({ yaAplicados: 0, versionIdYaAplicada: null, versionYaAplicada: null })).not.toContain(
      "Poner la versión",
    )
  })

  it("cuando no se puede apretar, el motivo se dibuja", () => {
    const html = dibujar({ pendientes: 1 })
    expect(html).toContain(motivoParaNoPonerEnUsoDesdeLaFila({ yaAplicados: 3, pendientes: 1, participan: 3 })!)
  })

  it("y la explicación entera de la fila también", () => {
    expect(dibujar()).toContain(explicacionDelEstado(FILA))
  })
})

// ---------------------------------------------------------------------------
// LAS CUATRO EXIGENCIAS DEL §7.5, CON RED
// ---------------------------------------------------------------------------

/**
 * ═══ Lo que la revisión midió, y que mi reporte anterior declaró cazado ═══
 *
 * Tres de las cuatro cosas que pide el §7.5 estaban escritas y bien, y ninguna
 * tenía quien la cuidara: sacar la barra de progreso, reemplazar `activos.map`
 * por `[].map`, y meterle un `break` al bucle **sobrevivían las tres**. El
 * `disabled={aplicando}` también.
 *
 * Mi reporte las dio por medidas, y no lo estaban: lo que estaba medido era la
 * PIEZA SUELTA (`BarraDeProgreso` dibuja bien aislada) y un patrón de texto
 * sobre el `.tsx` (`for (const asesor of activos)` sin `Promise.all`) — que
 * seguía estando igual después de agregarle un `break`. Son dos niveles
 * distintos y el reporte no los distinguió. Esa es la sobreafirmación.
 *
 * El arreglo es el de `475197a` por partida doble: el bloque de aplicación sale
 * a `ElProgreso` y `BarraDeLaAplicacion` —que se dibujan— y el bucle sale a
 * `aplicarDeAUno`, en lib, que se corre.
 */

describe("resultadoDeLaAplicacion: qué significa cada respuesta", () => {
  it("200 con estado ok es lo único que cuenta como hecho", () => {
    expect(resultadoDeLaAplicacion({ ok: true, status: 200, estado: "ok" })).toBe("ok")
  })

  /**
   * El caso del §7.4.2: le falta un dato, llega con 200, y NO tiene documento
   * nuevo. Contarlo como hecho hacía que la pantalla dijera "los 3 ya tienen su
   * documento" y habilitara "Poner esta versión en uso", que se comería un 409.
   */
  it("200 con pendiente NO es hecho", () => {
    expect(resultadoDeLaAplicacion({ ok: true, status: 200, estado: "pendiente" })).toBe("pendiente")
  })

  /** `revisar` es el 200 del que ya estaba en rojo: tampoco tiene documento nuevo. */
  it("200 con revisar tampoco", () => {
    expect(resultadoDeLaAplicacion({ ok: true, status: 200, estado: "revisar" })).toBe("pendiente")
  })

  /** Se falla del lado seguro: un 200 raro nunca se cuenta como hecho. */
  it("un 200 sin estado reconocible no se da por hecho", () => {
    for (const estado of [undefined, null, "", "cualquier_cosa", 1, {}]) {
      expect(resultadoDeLaAplicacion({ ok: true, status: 200, estado })).toBe("pendiente")
    }
  })

  it("el 409 es la red que frenó la escritura", () => {
    expect(resultadoDeLaAplicacion({ ok: false, status: 409, estado: undefined })).toBe("frenado")
  })

  it("y cualquier otra cosa es un error, no un pendiente", () => {
    for (const status of [400, 403, 404, 500]) {
      expect(resultadoDeLaAplicacion({ ok: false, status, estado: undefined })).toBe("error")
    }
  })
})

describe("aplicarDeAUno: de a uno, en serie, y uno que falla no voltea a los otros", () => {
  const tres = ["a1", "a2", "a3"]

  const correr = async (
    aplicar: (a: string) => Promise<{ estado: ResultadoDeAplicacion; mensaje: string | null }>,
  ) => {
    const empezaron: string[] = []
    const terminaron: Array<{ asesor: string; estado: ResultadoDeAplicacion }> = []
    await aplicarDeAUno({
      asesores: tres,
      aplicar,
      alEmpezar: (a) => empezaron.push(a),
      alTerminar: (a, r) => terminaron.push({ asesor: a, estado: r.estado }),
    })
    return { empezaron, terminaron }
  }

  it("le aplica a todos, en el orden que vinieron", async () => {
    const { empezaron, terminaron } = await correr(async () => ({ estado: "ok", mensaje: null }))
    expect(empezaron).toEqual(tres)
    expect(terminaron.map((t) => t.asesor)).toEqual(tres)
  })

  /**
   * ═══ La exigencia que más caro sale romper ═══
   *
   * El §7.5 existe para esto. Con un `break` en el bucle, el primero que falla
   * deja a los otros dos sin su documento — y la pantalla mostraría dos filas en
   * "Todavía no" para siempre, sin que nada explique por qué.
   */
  it("el primero que se frena NO corta: los demás siguen", async () => {
    const { terminaron } = await correr(async (a) =>
      a === "a1" ? { estado: "frenado", mensaje: "algo" } : { estado: "ok", mensaje: null },
    )
    expect(terminaron.map((t) => t.asesor), "alguien puso un break").toEqual(tres)
    expect(terminaron.map((t) => t.estado)).toEqual(["frenado", "ok", "ok"])
  })

  it("y si fallan todos, igual se intentó con todos", async () => {
    const { terminaron } = await correr(async () => ({ estado: "error", mensaje: "no anduvo" }))
    expect(terminaron).toHaveLength(3)
  })

  /**
   * Una excepción cortaría el bucle igual que un `break`, y el que la tira es
   * el `fetch` del navegador — o sea, la conexión de Leonardo. Se la envuelve, y
   * el que tira cuenta como error, nunca como motivo para dejar a los demás sin
   * su documento.
   */
  it("una excepción tampoco corta el bucle: cuenta como error y sigue", async () => {
    const { terminaron } = await correr(async (a) => {
      if (a === "a2") throw new Error("se cortó la red")
      return { estado: "ok", mensaje: null }
    })
    expect(terminaron.map((t) => t.estado)).toEqual(["ok", "error", "ok"])
  })

  /**
   * En SERIE, no todos juntos: cada pedido baja el molde, el original y hasta
   * tres documentos más. En paralelo no habría progreso que mostrar y se
   * multiplicaría por N el trabajo del servidor al mismo tiempo.
   */
  it("no arranca el siguiente hasta que termina el anterior", async () => {
    const orden: string[] = []
    let enVuelo = 0
    let maximoEnVuelo = 0
    await aplicarDeAUno({
      asesores: tres,
      aplicar: async (a) => {
        enVuelo += 1
        maximoEnVuelo = Math.max(maximoEnVuelo, enVuelo)
        await new Promise((listo) => setTimeout(listo, 1))
        orden.push(a)
        enVuelo -= 1
        return { estado: "ok" as ResultadoDeAplicacion, mensaje: null }
      },
      alEmpezar: () => {},
      alTerminar: () => {},
    })
    expect(maximoEnVuelo, "hay más de un pedido a la vez: dejó de ser en serie").toBe(1)
    expect(orden).toEqual(tres)
  })

  /** Y avisa ANTES de arrancar con cada uno: sin eso no hay fila que pintar. */
  it("avisa que empieza antes de que termine", async () => {
    const eventos: string[] = []
    await aplicarDeAUno({
      asesores: ["a1"],
      aplicar: async () => ({ estado: "ok" as ResultadoDeAplicacion, mensaje: null }),
      alEmpezar: () => eventos.push("empieza"),
      alTerminar: () => eventos.push("termina"),
    })
    expect(eventos).toEqual(["empieza", "termina"])
  })

  it("con la lista vacía no hace nada y no se rompe", async () => {
    const { terminaron } = await correr(async () => ({ estado: "ok", mensaje: null }))
    expect(terminaron).toHaveLength(3)
    await expect(
      aplicarDeAUno({ asesores: [], aplicar: async () => ({ estado: "ok", mensaje: null }), alEmpezar: () => {}, alTerminar: () => {} }),
    ).resolves.toBeUndefined()
  })
})

describe("el progreso entero, dibujado (spec §7.5)", () => {
  const activos = [ANA, BRUNO]
  const cuenta = { total: 2, ok: 1, pendientes: 1, frenados: 0, errores: 0, esperando: 0 }
  const porAsesor: Record<string, { estado: ResultadoDeAplicacion; mensaje: string | null }> = {
    a1: { estado: "ok", mensaje: "Ana Pérez ya tiene su documento de la versión 2." },
    a2: { estado: "pendiente", mensaje: "La versión nueva trae un campo que esta persona no tiene: COMISION." },
  }

  const dibujar = (aplicando = false) =>
    visible(
      React.createElement(ElProgreso, { arranco: true, activos, porAsesor, cuenta, aplicando, onReintentar: () => {} }),
    )

  /** Exigencia 1 del §7.5: barra de progreso. */
  it("la barra de progreso está, con su renglón", () => {
    expect(dibujar()).toContain(resumenDelProgreso(cuenta))
  })

  /** Exigencia 2 del §7.5: estado por fila. */
  it("cada asesor tiene su fila, con su nombre, su estado y su motivo", () => {
    const html = dibujar()
    for (const asesor of activos) expect(html).toContain(asesor.nombre)
    expect(html).toContain(etiquetaDeResultado("ok"))
    expect(html).toContain(etiquetaDeResultado("pendiente"))
    expect(html).toContain("COMISION")
  })

  /**
   * Antes de que el director apriete "Aplicar" no hay progreso que mostrar. La
   * condición vive acá adentro y no en el panel: en el panel era un `{arranco &&`
   * que ningún test podía ver.
   */
  it("antes de arrancar no dibuja nada", () => {
    const html = visible(
      React.createElement(ElProgreso, {
        arranco: false,
        activos,
        porAsesor,
        cuenta,
        aplicando: false,
        onReintentar: () => {},
      }),
    )
    expect(html).toBe("")
  })

  it("con la lista vacía no dibuja filas de nadie", () => {
    const html = visible(
      React.createElement(ElProgreso, {
        arranco: true,
        activos: [],
        porAsesor,
        cuenta: { ...cuenta, total: 0 },
        aplicando: false,
        onReintentar: () => {},
      }),
    )
    expect(html).not.toContain("Ana Pérez")
  })

  /**
   * Exigencia 4 del §7.5: bloqueado mientras corre. Se mira el HTML crudo y no
   * el texto, porque `disabled` es un atributo.
   *
   * Y se busca `disabled=""` con el signo igual, no la palabra suelta: las
   * clases de shadcn traen `disabled:pointer-events-none` adentro del
   * `className`, así que un `toContain("disabled")` da verde SIEMPRE y no mide
   * nada. Es la misma trampa de buscar una frase que otro renglón ya imprime.
   */
  it("mientras corre, el botón de reintentar de cada fila queda deshabilitado", () => {
    const crudo = (aplicando: boolean) =>
      renderToStaticMarkup(
        React.createElement(ElProgreso, {
          arranco: true,
          activos,
          porAsesor,
          cuenta,
          aplicando,
          onReintentar: () => {},
        }),
      )
    expect(crudo(true), "el botón de reintentar se puede apretar mientras corre").toContain('disabled=""')
    expect(crudo(false)).not.toContain('disabled=""')
  })
})

describe("la barra de abajo del paso de aplicar, dibujada", () => {
  const dibujar = (cambios: Partial<React.ComponentProps<typeof BarraDeLaAplicacion>> = {}) =>
    visible(
      React.createElement(BarraDeLaAplicacion, {
        arranco: false,
        aplicando: false,
        activando: false,
        enUso: false,
        motivoParaNoActivar: null,
        onAplicar: () => {},
        onPonerEnUso: () => {},
        onCerrar: () => {},
        ...cambios,
      }),
    )

  /**
   * El cartel que evita el peor malentendido de la pantalla: ver la vista previa
   * armada se lee como "el cambio ya está hecho". Es el hermano de
   * `NADA_SE_GUARDA_TODAVIA` de la §7.2, y estaba usado por nombre sin que nadie
   * mirara CUÁNDO.
   */
  it("antes de aplicar dice que todavía no se aplicó nada, y cómo se aplica", () => {
    const html = dibujar()
    expect(html).toContain(NADA_SE_APLICO_TODAVIA)
    expect(html).toContain(COMO_SE_APLICA)
  })

  it("y ofrece aplicar", () => {
    expect(dibujar()).toContain("Aplicar a los asesores")
  })

  it("una vez que arrancó, ese cartel se va y aparece qué significa poner en uso", () => {
    const html = dibujar({ arranco: true })
    expect(html).not.toContain(NADA_SE_APLICO_TODAVIA)
    expect(html).toContain(PARA_QUE_SIRVE_PONER_EN_USO)
    expect(html).toContain("Poner esta versión en uso")
  })

  it("el motivo de por qué no se puede poner en uso se dibuja", () => {
    const motivo = motivoParaNoPonerEnUso({ total: 3, ok: 1 })!
    expect(dibujar({ arranco: true, motivoParaNoActivar: motivo })).toContain(motivo)
  })

  it("cuando ya quedó en uso, ese motivo no se repite ni se ofrece de nuevo", () => {
    const html = dibujar({ arranco: true, enUso: true, motivoParaNoActivar: "algo" })
    expect(html).not.toContain("Poner esta versión en uso")
    expect(html).not.toContain("algo")
  })

  /**
   * Exigencia 4 del §7.5, del lado del botón que dispara todo.
   *
   * ═══ Y se CUENTAN los `disabled`, no se busca uno ═══
   *
   * En esta barra hay DOS botones y el de "Cerrar" también se deshabilita
   * mientras corre, así que un `toContain` da verde con el `disabled` del botón
   * de aplicar borrado. Medido: `disabled={aplicando}` → `disabled={false}`
   * sobrevivía. Con `aplicando` son dos; sin él, ninguno.
   */
  const cuantosDeshabilitados = (html: string) => html.split('disabled=""').length - 1

  it("mientras corre, el botón de aplicar queda deshabilitado", () => {
    const crudo = (aplicando: boolean) =>
      renderToStaticMarkup(
        React.createElement(BarraDeLaAplicacion, {
          arranco: false,
          aplicando,
          activando: false,
          enUso: false,
          motivoParaNoActivar: null,
          onAplicar: () => {},
          onPonerEnUso: () => {},
          onCerrar: () => {},
        }),
      )
    expect(
      cuantosDeshabilitados(crudo(true)),
      "faltan botones bloqueados: dos clics podrían disparar dos procesos",
    ).toBe(2)
    expect(cuantosDeshabilitados(crudo(false))).toBe(0)
  })

  it("y el de poner en uso también, cuando hay un motivo para no poder", () => {
    const crudo = renderToStaticMarkup(
      React.createElement(BarraDeLaAplicacion, {
        arranco: true,
        aplicando: false,
        activando: false,
        enUso: false,
        motivoParaNoActivar: "todavía no",
        onAplicar: () => {},
        onPonerEnUso: () => {},
        onCerrar: () => {},
      }),
    )
    expect(crudo).toContain('disabled=""')
  })
})

// ---------------------------------------------------------------------------
// LA PROSA QUE VIVÍA EN EL .tsx
// ---------------------------------------------------------------------------

describe("textoDeLosQueQuedanAfuera", () => {
  it("con nadie afuera no dice nada", () => {
    expect(textoDeLosQueQuedanAfuera([])).toBeNull()
  })

  it("con uno lo nombra y dice por qué", () => {
    const texto = textoDeLosQueQuedanAfuera(["Carla Gómez"])!
    expect(texto).toContain("Carla Gómez")
    expect(texto).toContain("pausado o desvinculado")
    expect(texto).toContain("queda archivado como está")
  })

  it("con varios los nombra a todos, y concuerda en plural", () => {
    const texto = textoDeLosQueQuedanAfuera(["Ana", "Bruno"])!
    expect(texto).toContain("2 asesores no están en la lista")
    expect(texto).toContain("Ana, Bruno")
    expect(texto).toContain("quedan archivados")
  })
})
