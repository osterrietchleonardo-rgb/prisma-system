import { describe, it, expect } from "vitest"
import PizZip from "pizzip"

import { DELIMITADORES, ponerHuecosEnDocx, textoPorParte } from "@/lib/plantillas/docx"
import { LARGO_DE_DATO_SOSPECHOSO } from "./confirmacion"
import {
  avisoDeCamposConElMismoDato,
  avisoDeCamposDesaparecidos,
  avisoDeCamposNuevos,
  avisoDeCamposSinDato,
  avisoDeTextoFijoSospechado,
  camposQueParecenTextoFijo,
  lugaresDeUnValor,
  avisoDeDatosQueSePasan,
  avisoDeValoresQueSobreviven,
  avisoDeValoresRepetidos,
  camposConElMismoDato,
  camposSchemaDeLaVersionNueva,
  camposSinDato,
  centinelasPara,
  compararCampos,
  moldeNoResisteLaPrueba,
  moldeNoSeReconoce,
  moldeRotoPorChoque,
  nombresDelSchema,
  normalizarHuecosEscritosAMano,
  ordenarComoEnElDocumento,
  reemplazosDeLaVersionNueva,
  rutasEnOrdenDeLectura,
  resumenDeLaVersionNueva,
  seVaAUsar,
  textoDeVistaPrevia,
  textoEsperadoConCentinelas,
  ubicarValores,
  ubicarValoresEnPartes,
  valoresQueSobrevivenEnElMolde,
} from "./version-nueva"

/**
 * La primera mitad del spec §7.4: leer la versión nueva y decir qué cambia.
 *
 * Lo que estos tests cuidan de verdad no es que las funciones "anden": es que
 * lo que se le dice al director sea cierto. Un campo que se informa como
 * ubicado y después no entra en el .docx, o un "desaparecido" que en realidad
 * está en el encabezado, terminan en un contrato que alguien firma.
 */

// ---------------------------------------------------------------------------
// Un .docx de verdad, en memoria
// ---------------------------------------------------------------------------

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
const BASE_TIPO = "application/vnd.openxmlformats-officedocument.wordprocessingml"

/** Un `<w:r>` por palabra y por espacio: así guarda Word de verdad. */
function parrafo(texto: string): string {
  const runs = texto
    .split(/(\s+)/)
    .filter((x) => x.length > 0)
    .map((x) => `<w:r><w:t xml:space="preserve">${x}</w:t></w:r>`)
    .join("")
  return `<w:p>${runs}</w:p>`
}

function docx(parrafos: string[], encabezado?: string): PizZip {
  const zip = new PizZip()
  const overrides = [`<Override PartName="/word/document.xml" ContentType="${BASE_TIPO}.document.main+xml"/>`]
  const word = zip.folder("word")!
  if (encabezado !== undefined) {
    overrides.push(`<Override PartName="/word/header1.xml" ContentType="${BASE_TIPO}.header+xml"/>`)
    word.file(
      "header1.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${parrafo(encabezado)}</w:hdr>`,
    )
  }
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/>${overrides.join("")}</Types>`,
  )
  zip.folder("_rels")!.file(".rels", RELS)
  word.file(
    "document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${parrafos.join("")}</w:body></w:document>`,
  )
  return zip
}

const de = <T extends { campo: string }>(ubicaciones: T[], campo: string): T =>
  ubicaciones.find((u) => u.campo === campo)!

// ---------------------------------------------------------------------------
// ubicarValores: los cuatro bordes que ya costaron caro
// ---------------------------------------------------------------------------

describe("ubicarValores", () => {
  const CONTRATO =
    "Y por la otra parte Ana Ruiz, mayor de edad, CUIT 27-31456789-4, en adelante EL ASESOR.\n" +
    "Se asigna a EL ASESOR la zona de Villa Urquiza.\n" +
    "Aclaracion de la firma de EL ASESOR: Ana Ruiz"

  it("un valor que aparece UNA vez queda encontrado, con su posición", () => {
    const u = de(ubicarValores(CONTRATO, { CUIT: "27-31456789-4" }), "CUIT")
    expect(u.situacion).toBe("encontrado")
    expect(u.veces).toBe(1)
    expect(u.posiciones).toEqual([CONTRATO.indexOf("27-31456789-4")])
  })

  it("un valor que aparece MÁS DE UNA VEZ queda repetido, con las dos posiciones", () => {
    const u = de(ubicarValores(CONTRATO, { NOMBRE: "Ana Ruiz" }), "NOMBRE")
    expect(u.situacion).toBe("repetido")
    expect(u.veces).toBe(2)
    expect(u.posiciones).toEqual([CONTRATO.indexOf("Ana Ruiz"), CONTRATO.lastIndexOf("Ana Ruiz")])
  })

  it("un valor que NO aparece queda ausente", () => {
    const u = de(ubicarValores(CONTRATO, { ZONA: "Palermo" }), "ZONA")
    expect(u.situacion).toBe("ausente")
    expect(u.veces).toBe(0)
    expect(u.posiciones).toEqual([])
  })

  it("un campo con el dato VACÍO queda sin-dato, que no es lo mismo que ausente", () => {
    const u = de(ubicarValores(CONTRATO, { LEGAJO: "   " }), "LEGAJO")
    expect(u.situacion).toBe("sin-dato")
    expect(u.veces).toBe(0)
  })

  it("un valor que parte una palabra por la mitad NO cuenta", () => {
    /**
     * "Ana" está adentro de "Anabela" y de "Susana". Si contara, el reemplazo
     * dejaría "{{NOMBRE}}bela" en el contrato de todo el mundo.
     */
    const texto = "Anabela y Susana firman. Ana Ruiz también."
    const u = de(ubicarValores(texto, { NOMBRE: "Ana" }), "NOMBRE")
    expect(u.veces).toBe(1)
    expect(u.posiciones).toEqual([texto.indexOf("Ana Ruiz")])
  })

  it("un valor de pocas letras se marca corto, aunque se haya encontrado", () => {
    const u = de(ubicarValores("Comision del 35 por ciento", { COMISION: "35" }), "COMISION")
    expect(u.situacion).toBe("encontrado")
    expect(u.corto).toBe(true)
  })

  it("el límite del dato corto es el mismo que usa la confirmación", () => {
    const justo = "x".repeat(LARGO_DE_DATO_SOSPECHOSO)
    const unoMas = "x".repeat(LARGO_DE_DATO_SOSPECHOSO + 1)
    expect(de(ubicarValores(justo, { A: justo }), "A").corto).toBe(true)
    expect(de(ubicarValores(unoMas, { A: unoMas }), "A").corto).toBe(false)
  })

  it("un valor que es SUBCADENA del de otro campo lo dice, y solo en esa dirección", () => {
    const u = ubicarValores("Plazo PLAZO 2026 vigente", { ANIO: "2026", PLAZO: "PLAZO 2026" })
    expect(de(u, "ANIO").dentroDe).toEqual(["PLAZO"])
    expect(de(u, "PLAZO").dentroDe).toEqual([])
  })

  it("dos campos con el MISMO valor no se declaran uno adentro del otro", () => {
    const u = ubicarValores("Belgrano R", { ZONA: "Belgrano R", ZONA_FIRMA: "Belgrano R" })
    expect(de(u, "ZONA").dentroDe).toEqual([])
    expect(de(u, "ZONA_FIRMA").dentroDe).toEqual([])
  })

  it("devuelve los campos en el orden en que vienen, no en otro", () => {
    const u = ubicarValores(CONTRATO, { ZONA: "Villa Urquiza", CUIT: "27-31456789-4", NOMBRE: "Ana Ruiz" })
    expect(u.map((x) => x.campo)).toEqual(["ZONA", "CUIT", "NOMBRE"])
  })

  it("el valor se recorta antes de buscarlo", () => {
    const u = de(ubicarValores("zona de Saavedra.", { ZONA: "  Saavedra  " }), "ZONA")
    expect(u.valor).toBe("Saavedra")
    expect(u.situacion).toBe("encontrado")
  })
})

// ---------------------------------------------------------------------------
// LO QUE ATA LA PREDICCIÓN CON EL REEMPLAZO DE VERDAD
// ---------------------------------------------------------------------------

describe("lo que ubicarValores promete es lo que ponerHuecosEnDocx hace", () => {
  /**
   * `partePalabra` está copiada de `lib/plantillas/docx.ts` porque allá no se
   * exporta. Si las dos reglas se separan, `ubicarValores` miente: informa un
   * campo como ubicado y después no entra en el documento, o al revés. Esto lo
   * mide corriendo el reemplazo de verdad sobre un .docx armado en memoria, en
   * vez de comparar dos copias del mismo regex.
   */
  it("las veces que dice ubicarValores son las que pone ponerHuecosEnDocx", () => {
    const zip = docx([
      parrafo("Y por la otra parte Ana Ruiz, CUIT 27-31456789-4, en adelante EL ASESOR."),
      parrafo("Anabela no es Ana Ruiz."),
      parrafo("Aclaracion de la firma: Ana Ruiz"),
    ])
    const texto = Object.values(textoPorParte(zip)).join("\n")
    const valores = { NOMBRE: "Ana Ruiz", CUIT: "27-31456789-4" }

    const ubicaciones = ubicarValores(texto, valores)
    const { puestos, faltantes } = ponerHuecosEnDocx(zip, reemplazosDeLaVersionNueva(ubicaciones))

    expect(faltantes).toEqual([])
    for (const u of ubicaciones) {
      const puesto = puestos.find((p) => p.hueco === `{{${u.campo}}}`)!
      expect(puesto, `el campo ${u.campo} no entró en el documento`).toBeTruthy()
      expect(puesto.veces, `las veces de ${u.campo}`).toBe(u.veces)
    }
  })

  it("un valor que ubicarValores da por ausente tampoco lo pone el reemplazo", () => {
    const zip = docx([parrafo("Anabela firma el contrato.")])
    const texto = Object.values(textoPorParte(zip)).join("\n")

    const ubicaciones = ubicarValores(texto, { NOMBRE: "Ana" })
    expect(de(ubicaciones, "NOMBRE").situacion).toBe("ausente")

    // Se lo pide igual, salteando el filtro, para medir el reemplazo y no el filtro.
    const { puestos, faltantes } = ponerHuecosEnDocx(zip, [{ buscado: "Ana", hueco: "{{NOMBRE}}" }])
    expect(puestos).toEqual([])
    expect(faltantes).toEqual(["Ana"])
  })
})

// ---------------------------------------------------------------------------
// El documento ENTERO, no solo el cuerpo
// ---------------------------------------------------------------------------

describe("ubicarValoresEnPartes", () => {
  it("encuentra un dato que vive SOLO en el encabezado, y dice dónde", () => {
    const partes = textoPorParte(docx([parrafo("Contrato sin legajo.")], "Legajo interno 8892"))
    const u = de(ubicarValoresEnPartes(partes, { LEGAJO: "8892" }), "LEGAJO")
    expect(u.situacion).toBe("encontrado")
    expect(u.partes).toEqual(["el encabezado"])
  })

  it("una vez en el cuerpo y otra en el encabezado suman: es repetido", () => {
    const partes = textoPorParte(docx([parrafo("El legajo es 8892.")], "Legajo interno 8892"))
    const u = de(ubicarValoresEnPartes(partes, { LEGAJO: "8892" }), "LEGAJO")
    expect(u.veces).toBe(2)
    expect(u.situacion).toBe("repetido")
    expect(u.partes.sort()).toEqual(["el cuerpo del documento", "el encabezado"])
  })

  it("un campo que no está en ninguna parte queda ausente y sin partes", () => {
    const partes = textoPorParte(docx([parrafo("Contrato.")], "Membrete"))
    const u = de(ubicarValoresEnPartes(partes, { ZONA: "Saavedra" }), "ZONA")
    expect(u.situacion).toBe("ausente")
    expect(u.partes).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Qué campos cambian
// ---------------------------------------------------------------------------

describe("compararCampos", () => {
  it("separa los nuevos, los desaparecidos y los que siguen igual", () => {
    const r = compararCampos(["NOMBRE", "CUIT", "ZONA"], ["NOMBRE", "CUIT", "COMISION"])
    expect(r.nuevos).toEqual(["COMISION"])
    expect(r.desaparecidos).toEqual(["ZONA"])
    expect(r.iguales).toEqual(["NOMBRE", "CUIT"])
  })

  it("sin cambios, las tres listas dicen la verdad", () => {
    const r = compararCampos(["NOMBRE"], ["NOMBRE"])
    expect(r.nuevos).toEqual([])
    expect(r.desaparecidos).toEqual([])
    expect(r.iguales).toEqual(["NOMBRE"])
  })

  it("una versión vigente sin campos deja TODO como nuevo", () => {
    const r = compararCampos([], ["NOMBRE", "CUIT"])
    expect(r.nuevos).toEqual(["NOMBRE", "CUIT"])
    expect(r.desaparecidos).toEqual([])
  })

  it("un campo repetido en la entrada no se cuenta dos veces", () => {
    const r = compararCampos(["NOMBRE", "NOMBRE"], ["CUIT", "CUIT"])
    expect(r.desaparecidos).toEqual(["NOMBRE"])
    expect(r.nuevos).toEqual(["CUIT"])
  })

  it("mantiene el orden de entrada, para que dos corridas iguales no se muevan", () => {
    const r = compararCampos(["A", "B", "C"], ["C", "Z", "Y"])
    expect(r.nuevos).toEqual(["Z", "Y"])
    expect(r.desaparecidos).toEqual(["A", "B"])
  })
})

describe("nombresDelSchema", () => {
  it("lee los nombres de un campos_schema normal", () => {
    expect(
      nombresDelSchema([
        { nombre: "NOMBRE", label: "Nombre", orden: 0 },
        { nombre: "CUIT", label: "CUIT", orden: 1 },
      ]),
    ).toEqual(["NOMBRE", "CUIT"])
  })

  it("no explota con lo que puede traer un jsonb viejo", () => {
    expect(nombresDelSchema(null)).toEqual([])
    expect(nombresDelSchema("[]")).toEqual([])
    expect(nombresDelSchema({ nombre: "NOMBRE" })).toEqual([])
    expect(nombresDelSchema([null, 3, { label: "sin nombre" }, { nombre: "  " }, { nombre: "CUIT" }])).toEqual(["CUIT"])
  })

  it("no repite un nombre que venga dos veces", () => {
    expect(nombresDelSchema([{ nombre: "CUIT" }, { nombre: "CUIT" }])).toEqual(["CUIT"])
  })
})

// ---------------------------------------------------------------------------
// Lo que lee el director
// ---------------------------------------------------------------------------

describe("los textos que ve el director", () => {
  it("el rechazo del archivo genérico dice QUÉ se buscó y no apareció", () => {
    const ubicaciones = ubicarValores("Contrato modelo, sin datos.", {
      NOMBRE: "Ana Ruiz",
      CUIT: "27-31456789-4",
    })
    const mensaje = moldeNoSeReconoce(ubicaciones, "Ana Ruiz")
    expect(mensaje).toContain("NOMBRE")
    expect(mensaje).toContain("Ana Ruiz")
    expect(mensaje).toContain("CUIT")
    expect(mensaje).toContain("27-31456789-4")
    // Y qué hacer: sin esto es un "archivo inválido" con más palabras.
    expect(mensaje).toContain("YA COMPLETADO")
  })

  it("el rechazo no vuelca cincuenta valores encima del director", () => {
    const valores = Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [`CAMPO_${i}`, `valor-numero-${i}`]),
    )
    const mensaje = moldeNoSeReconoce(ubicarValores("nada de eso", valores), "Ana Ruiz")
    expect(mensaje).toContain("CAMPO_0")
    expect(mensaje).not.toContain("CAMPO_19")
    expect(mensaje).toMatch(/y 16 campos más/)
  })

  it("cuando todos los datos guardados están vacíos, lo dice así y no como 'no apareció'", () => {
    const mensaje = moldeNoSeReconoce(ubicarValores("Contrato", { NOMBRE: "", CUIT: "" }), "Ana Ruiz")
    expect(mensaje).toContain("están vacíos")
    expect(mensaje).not.toContain("no apareció ninguno")
  })

  it("el aviso de campos nuevos dice la CONSECUENCIA: siguen con el documento de hoy", () => {
    expect(avisoDeCamposNuevos([])).toBeNull()

    const uno = avisoDeCamposNuevos(["COMISION"])!
    expect(uno).toContain("COMISION")
    expect(uno).toContain("a mano")
    expect(uno).toContain("sigue con el documento que tiene hoy")

    const dos = avisoDeCamposNuevos(["COMISION", "PLAZO"])!
    expect(dos).toContain("2 campos que antes no existían")
  })

  it("el aviso de campos desaparecidos dice que el dato NO se borra", () => {
    expect(avisoDeCamposDesaparecidos([])).toBeNull()

    const uno = avisoDeCamposDesaparecidos(["ZONA"])!
    expect(uno).toContain("ZONA")
    expect(uno).toContain("no se borra")
    expect(uno).toContain("versión anterior")

    const dos = avisoDeCamposDesaparecidos(["ZONA", "PLAZO"])!
    expect(dos).toContain("no se borran")
    expect(dos).toContain("versión anterior")
  })

  it("el aviso de repetidos dice cuántas veces, y solo cuando hay alguno", () => {
    const contrato = "Ana Ruiz y otra vez Ana Ruiz. CUIT 27-31456789-4."
    const valores = { NOMBRE: "Ana Ruiz", CUIT: "27-31456789-4" }
    const aviso = avisoDeValoresRepetidos(ubicarValores(contrato, valores))!
    expect(aviso).toContain("NOMBRE (2 veces)")
    expect(aviso).not.toContain("CUIT")

    expect(avisoDeValoresRepetidos(ubicarValores("Ana Ruiz", { NOMBRE: "Ana Ruiz" }))).toBeNull()
  })

  it("el aviso de repetidos NO promete un rojo, porque ese rojo no ocurre", () => {
    /**
     * Decía "va a salir en rojo acá abajo" y es falso: con la zona de Ana en el
     * texto fijo, las tres guardas dan verde y el daño recién aparece en el
     * contrato de Bruno. La pantalla no puede afirmar algo que el sistema no
     * sabe — es la misma clase de mentira que ya costó dos rondas acá.
     */
    const aviso = avisoDeValoresRepetidos(
      ubicarValores("Ana Ruiz firma. Aclaracion: Ana Ruiz.", { NOMBRE: "Ana Ruiz" }),
    )!
    expect(aviso).not.toContain("en rojo")
    // Y dice lo que sí es cierto, más lo único que el director puede hacer.
    expect(aviso).toContain("van a cambiar TODOS juntos")
    expect(aviso).toContain("vista previa")
    expect(aviso).toContain("no lo puede ver nadie desde acá")
  })

  it("el aviso de los datos que se pasan junta el corto y el pedazo de otro", () => {
    const aviso = avisoDeDatosQueSePasan(
      ubicarValores("Comision 35 por ciento, PLAZO 2026 vigente.", {
        COMISION: "35",
        ANIO: "2026",
        PLAZO: "PLAZO 2026",
      }),
    )!
    expect(aviso).toContain("COMISION")
    expect(aviso).toContain("ANIO (está adentro de PLAZO)")

    expect(avisoDeDatosQueSePasan(ubicarValores("Zona Saavedra", { ZONA: "Saavedra" }))).toBeNull()
  })

  it("un dato corto que NO aparece no se avisa: no va a reemplazar nada", () => {
    expect(avisoDeDatosQueSePasan(ubicarValores("Contrato", { COMISION: "35" }))).toBeNull()
  })

  it("el resumen dice el número Y que todavía no se aplicó a nadie", () => {
    const sinCambios = resumenDeLaVersionNueva({ version: 4, ubicados: 3, nuevos: [], desaparecidos: [] })
    expect(sinCambios).toContain("versión 4")
    expect(sinCambios).toContain("3 campos")
    expect(sinCambios).toContain("los mismos que antes")
    expect(sinCambios).toContain("Todavía no se aplicó a ningún asesor")

    const conCambios = resumenDeLaVersionNueva({
      version: 5,
      ubicados: 1,
      nuevos: ["COMISION"],
      desaparecidos: ["ZONA", "PLAZO"],
    })
    expect(conCambios).toContain("se ubicó 1 campo")
    expect(conCambios).toContain("1 campo nuevo")
    expect(conCambios).toContain("2 que ya no están")
    expect(conCambios).toContain("Todavía no se aplicó a ningún asesor")
  })
})

describe("la vista previa", () => {
  it("pone el cuerpo primero y sin rótulo, y el encabezado abajo con el suyo", () => {
    const texto = textoDeVistaPrevia({
      "word/header1.xml": "Legajo interno 8892",
      "word/document.xml": "CONTRATO\nY por la otra parte Ana Ruiz.",
    })
    expect(texto.startsWith("CONTRATO")).toBe(true)
    expect(texto).toContain("— el encabezado —\nLegajo interno 8892")
    expect(texto.indexOf("CONTRATO")).toBeLessThan(texto.indexOf("el encabezado"))
  })

  it("no dibuja el rótulo de una parte vacía", () => {
    const texto = textoDeVistaPrevia({ "word/document.xml": "CONTRATO", "word/header1.xml": "   " })
    expect(texto).toBe("CONTRATO")
  })

  it("dos encabezados de Word salen bajo UN solo rótulo", () => {
    const texto = textoDeVistaPrevia({
      "word/document.xml": "CONTRATO",
      "word/header1.xml": "Membrete",
      "word/header2.xml": "Membrete de las demás páginas",
    })
    expect(texto.match(/— el encabezado —/g)).toHaveLength(1)
  })
})

describe("reemplazosDeLaVersionNueva", () => {
  it("pide solo los campos que aparecen, y con las llaves puestas", () => {
    const ubicaciones = ubicarValores("Ana Ruiz, CUIT 27-31456789-4.", {
      NOMBRE: "Ana Ruiz",
      CUIT: "27-31456789-4",
      ZONA: "Saavedra",
      LEGAJO: "",
    })
    expect(reemplazosDeLaVersionNueva(ubicaciones)).toEqual([
      { buscado: "Ana Ruiz", hueco: "{{NOMBRE}}", nombre: "NOMBRE" },
      { buscado: "27-31456789-4", hueco: "{{CUIT}}", nombre: "CUIT" },
    ])
  })

  it("seVaAUsar dice que sí para encontrado y repetido, y que no para el resto", () => {
    const u = ubicarValores("Ana Ruiz y Ana Ruiz", { NOMBRE: "Ana Ruiz", ZONA: "Saavedra", LEGAJO: "" })
    expect(seVaAUsar(de(u, "NOMBRE"))).toBe(true)
    expect(seVaAUsar(de(u, "ZONA"))).toBe(false)
    expect(seVaAUsar(de(u, "LEGAJO"))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// EL DATO QUE QUEDA PEGADO EN EL MOLDE
// ---------------------------------------------------------------------------

describe("valoresQueSobrevivenEnElMolde", () => {
  /**
   * Es la que le da dientes a la comprobación. Rellenar el molde con los datos
   * de la MISMA persona de la que salió es casi un ida y vuelta: da verde salvo
   * que el .docx no se pueda abrir. Lo que de verdad hace daño es un dato de esa
   * persona que quedó pegado donde el reemplazo no llega, porque ese pedazo se
   * lo lleva el molde al documento de TODOS.
   */
  it("un dato que quedó en una nota al final se ve, y dice en qué parte", () => {
    const molde = textoPorParte(
      docx([parrafo("Y por la otra parte {{NOMBRE}}, CUIT {{CUIT}}.")]),
    )
    // Las notas al final no las toca el reemplazo: se simulan agregándolas al
    // texto por parte, que es exactamente lo que devuelve `textoPorParte`.
    molde["word/endnotes.xml"] = "Legajo del asesor: CUIT 27-31456789-4"

    const sobreviven = valoresQueSobrevivenEnElMolde(molde, {
      NOMBRE: "Ana Ruiz",
      CUIT: "27-31456789-4",
    })
    expect(sobreviven.map((u) => u.campo)).toEqual(["CUIT"])
    expect(sobreviven[0].partes).toEqual(["las notas al final"])
  })

  it("un molde donde todo se convirtió en hueco no deja sobrevivientes", () => {
    const molde = textoPorParte(docx([parrafo("Y por la otra parte {{NOMBRE}}, CUIT {{CUIT}}.")]))
    expect(valoresQueSobrevivenEnElMolde(molde, { NOMBRE: "Ana Ruiz", CUIT: "27-31456789-4" })).toEqual([])
  })

  it("el aviso dice el campo, dónde quedó y la consecuencia para TODOS", () => {
    expect(avisoDeValoresQueSobreviven([], "Ana Ruiz")).toBeNull()

    const molde = { "word/endnotes.xml": "Legajo 27-31456789-4" }
    const sobreviven = valoresQueSobrevivenEnElMolde(molde, { CUIT: "27-31456789-4" })
    const aviso = avisoDeValoresQueSobreviven(sobreviven, "Ana Ruiz")!
    expect(aviso).toContain("CUIT")
    expect(aviso).toContain("27-31456789-4")
    expect(aviso).toContain("las notas al final")
    expect(aviso).toContain("TODOS")
    expect(aviso).toContain("Ana Ruiz")
  })
})

// ---------------------------------------------------------------------------
// DOS CAMPOS CON EL MISMO DATO
// ---------------------------------------------------------------------------

describe("camposConElMismoDato", () => {
  it("junta en un grupo los campos que valen exactamente lo mismo en esa persona", () => {
    const u = ubicarValores("Zona Belgrano R para Belgrano R", {
      ZONA: "Belgrano R",
      ZONA_FIRMA: "Belgrano R",
      CUIT: "27-31456789-4",
    })
    expect(camposConElMismoDato(u)).toEqual([["ZONA", "ZONA_FIRMA"]])
  })

  it("un campo que NO aparece en el documento no arma grupo: no va a reemplazar nada", () => {
    const u = ubicarValores("Contrato sin zonas", { ZONA: "Belgrano R", ZONA_FIRMA: "Belgrano R" })
    expect(camposConElMismoDato(u)).toEqual([])
  })

  it("sin repetidos, no hay grupos", () => {
    const u = ubicarValores("Ana Ruiz en Saavedra", { NOMBRE: "Ana Ruiz", ZONA: "Saavedra" })
    expect(camposConElMismoDato(u)).toEqual([])
  })

  it("el aviso dice qué campos y qué hacer al respecto", () => {
    expect(avisoDeCamposConElMismoDato([], "Ana Ruiz")).toBeNull()

    const aviso = avisoDeCamposConElMismoDato([["ZONA", "ZONA_FIRMA"]], "Ana Ruiz")!
    expect(aviso).toContain("ZONA y ZONA_FIRMA")
    expect(aviso).toContain("Ana Ruiz")
    expect(aviso).toContain("Elegí de referencia a un asesor")
  })
})

// ---------------------------------------------------------------------------
// El esquema de la versión nueva
// ---------------------------------------------------------------------------

describe("camposSchemaDeLaVersionNueva", () => {
  const VIEJO = [
    { nombre: "NOMBRE", label: "Nombre y apellido", orden: 0 },
    { nombre: "CUIT", label: "CUIT del asesor", orden: 1 },
  ]

  it("hereda el rótulo que el director ya había escrito", () => {
    expect(camposSchemaDeLaVersionNueva(["CUIT", "NOMBRE"], VIEJO)).toEqual([
      { nombre: "CUIT", label: "CUIT del asesor", orden: 0 },
      { nombre: "NOMBRE", label: "Nombre y apellido", orden: 1 },
    ])
  })

  it("un campo nuevo se queda con su nombre de rótulo, no vacío", () => {
    expect(camposSchemaDeLaVersionNueva(["COMISION"], VIEJO)).toEqual([
      { nombre: "COMISION", label: "COMISION", orden: 0 },
    ])
  })

  it("numera en el orden de la lista que recibe, y NO en el del esquema viejo", () => {
    /**
     * Ojo con lo que este test mide y con lo que NO: mide que esta función
     * respete el orden de SU entrada. Que esa entrada venga en el orden del
     * documento lo decide el endpoint, y se mide allá, de punta a punta desde el
     * .docx. El nombre anterior de este test decía "el orden del documento" y
     * era falso: nunca miraba quién armaba la lista.
     */
    const schema = camposSchemaDeLaVersionNueva(["CUIT", "COMISION", "NOMBRE"], VIEJO)
    expect(schema.map((c) => c.orden)).toEqual([0, 1, 2])
    expect(schema.map((c) => c.nombre)).toEqual(["CUIT", "COMISION", "NOMBRE"])
  })

  it("no se cae con un esquema viejo que no tiene forma de esquema", () => {
    expect(camposSchemaDeLaVersionNueva(["NOMBRE"], null)).toEqual([
      { nombre: "NOMBRE", label: "NOMBRE", orden: 0 },
    ])
    expect(camposSchemaDeLaVersionNueva(["NOMBRE"], [{ nombre: "NOMBRE" }])).toEqual([
      { nombre: "NOMBRE", label: "NOMBRE", orden: 0 },
    ])
  })

  it("un campo repetido en la lista no se guarda dos veces", () => {
    expect(camposSchemaDeLaVersionNueva(["NOMBRE", "NOMBRE"], VIEJO)).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// EL CAMPO VACÍO NO ES UN CAMPO DESAPARECIDO
// ---------------------------------------------------------------------------

describe("camposSinDato", () => {
  it("separa el que vino vacío del que se buscó y no está", () => {
    const u = ubicarValores("Contrato de Ana Ruiz", {
      NOMBRE: "Ana Ruiz",
      LEGAJO: "",
      ZONA: "Saavedra",
    })
    expect(camposSinDato(u)).toEqual(["LEGAJO"])
    // ZONA sí se buscó y no apareció: eso sí es un desaparecido.
    expect(de(u, "ZONA").situacion).toBe("ausente")
  })

  it("un campo con solo espacios cuenta como vacío, no como ausente", () => {
    expect(camposSinDato(ubicarValores("Contrato", { LEGAJO: "   " }))).toEqual(["LEGAJO"])
  })

  it("sin campos vacíos, la lista es vacía", () => {
    expect(camposSinDato(ubicarValores("Ana Ruiz", { NOMBRE: "Ana Ruiz" }))).toEqual([])
  })

  it("el aviso dice que NO se borra nada y que no se sabe, no que dejó de usarse", () => {
    expect(avisoDeCamposSinDato([], "Ana Ruiz")).toBeNull()

    const uno = avisoDeCamposSinDato(["LEGAJO"], "Ana Ruiz")!
    expect(uno).toContain("LEGAJO")
    expect(uno).toContain("Ana Ruiz")
    expect(uno).toContain("no se pudo comprobar")
    expect(uno).toContain("no se borra")
    // Lo que NO puede decir, porque el sistema no lo sabe.
    expect(uno).not.toContain("deja de usarse")

    const dos = avisoDeCamposSinDato(["LEGAJO", "MATRICULA"], "Ana Ruiz")!
    expect(dos).toContain("2 campos no se pudieron comprobar")
    expect(dos).toContain("no se borran")
  })
})

// ---------------------------------------------------------------------------
// EL ORDEN DEL DOCUMENTO
// ---------------------------------------------------------------------------

describe("ordenarComoEnElDocumento", () => {
  it("ordena por dónde aparece primero, no por cómo venían", () => {
    const partes = textoPorParte(
      docx([parrafo("Se asigna la zona de Saavedra."), parrafo("Firma Ana Ruiz, CUIT 27-31456789-4.")]),
    )
    const u = ubicarValoresEnPartes(partes, {
      NOMBRE: "Ana Ruiz",
      CUIT: "27-31456789-4",
      ZONA: "Saavedra",
    })
    expect(ordenarComoEnElDocumento(u).map((x) => x.campo)).toEqual(["ZONA", "NOMBRE", "CUIT"])
  })

  /**
   * OJO con lo que este test NO mide, porque casi queda vacuo: "word/document.xml"
   * y "word/header1.xml" ordenados alfabéticamente YA dejan el cuerpo primero
   * (la "d" va antes que la "h"). Sacar el criterio del cuerpo-primero no lo
   * ponía en rojo — medido con mutación. Lo que de verdad lo mide es el test de
   * `rutasEnOrdenDeLectura` de más abajo, con una parte que ordena ANTES que el
   * cuerpo. Este se queda porque mide la otra mitad: que `primeraAparicion`
   * lleve el índice de la parte y no solo el caracter.
   */
  it("el cuerpo va antes que el encabezado, aunque ahí el dato esté en el caracter 0", () => {
    const partes = textoPorParte(docx([parrafo("Firma Ana Ruiz.")], "8892"))
    const u = ubicarValoresEnPartes(partes, { LEGAJO: "8892", NOMBRE: "Ana Ruiz" })
    expect(ordenarComoEnElDocumento(u).map((x) => x.campo)).toEqual(["NOMBRE", "LEGAJO"])
    expect(de(u, "LEGAJO").primeraAparicion).not.toBeNull()
    expect(de(u, "LEGAJO").primeraAparicion!.parte).toBeGreaterThan(de(u, "NOMBRE").primeraAparicion!.parte)
  })

  it("los que no aparecen van al final, en el orden en que venían", () => {
    const partes = textoPorParte(docx([parrafo("Firma Ana Ruiz.")]))
    const u = ubicarValoresEnPartes(partes, {
      LEGAJO: "",
      ZONA: "Saavedra",
      NOMBRE: "Ana Ruiz",
    })
    expect(ordenarComoEnElDocumento(u).map((x) => x.campo)).toEqual(["NOMBRE", "LEGAJO", "ZONA"])
  })

  it("primeraAparicion es null cuando el valor no está en ninguna parte", () => {
    const partes = textoPorParte(docx([parrafo("Contrato.")]))
    expect(de(ubicarValoresEnPartes(partes, { ZONA: "Saavedra" }), "ZONA").primeraAparicion).toBeNull()
  })
})

describe("rutasEnOrdenDeLectura", () => {
  it("el cuerpo va PRIMERO aunque su ruta ordene después alfabéticamente", () => {
    /**
     * El caso que hace falta para medir esto de verdad: `word/comments.xml`
     * empieza con "c" y ordenado alfabéticamente iría ANTES que
     * `word/document.xml`. Con el encabezado solo, el criterio del
     * cuerpo-primero no se puede distinguir de un `sort()` pelado.
     */
    expect(
      rutasEnOrdenDeLectura({
        "word/comments.xml": "",
        "word/header1.xml": "",
        "word/document.xml": "",
      }),
    ).toEqual(["word/document.xml", "word/comments.xml", "word/header1.xml"])
  })

  it("sin cuerpo, el resto queda por ruta", () => {
    expect(rutasEnOrdenDeLectura({ "word/header2.xml": "", "word/header1.xml": "" })).toEqual([
      "word/header1.xml",
      "word/header2.xml",
    ])
  })

  it("la vista previa usa ese mismo orden: el cuerpo arriba de los comentarios", () => {
    const texto = textoDeVistaPrevia({
      "word/comments.xml": "Nota de Word",
      "word/document.xml": "CONTRATO",
    })
    expect(texto.startsWith("CONTRATO")).toBe(true)
    expect(texto.indexOf("CONTRATO")).toBeLessThan(texto.indexOf("Nota de Word"))
  })
})

describe("moldeRotoPorChoque", () => {
  it("sin choques no dice nada", () => {
    expect(moldeRotoPorChoque([], "Ana Ruiz")).toBeNull()
  })

  it("nombra al campo culpable, contra quién choca, y las dos salidas que existen", () => {
    const m = moldeRotoPorChoque([{ campo: "ANIO", dentroDe: "PLAZO_2026" }], "Ana Ruiz")!
    expect(m).toContain("Ana Ruiz")
    expect(m).toContain('"ANIO"')
    expect(m).toContain('"PLAZO_2026"')
    expect(m).toContain("No se guardó nada")
    expect(m).toContain("otro asesor")
    expect(m).toContain("del documento en el Word")
    /**
     * El remedio que NO existe en este flujo: acá no hay pantalla de revisión
     * donde borrar un campo, y volver a detectar rearmaría la plantilla desde
     * los documentos viejos. Es la mitad del arreglo.
     */
    expect(m).not.toContain("volvé a detectar")
  })

  it("agrupa por campo culpable en vez de repetirlo una vez por par", () => {
    const m = moldeRotoPorChoque(
      [
        { campo: "TRAMO", dentroDe: "CAMPO_1" },
        { campo: "TRAMO", dentroDe: "CAMPO_12" },
        { campo: "TRAMO", dentroDe: "CAMPO_13" },
      ],
      "Ana Ruiz",
    )!
    expect(m.match(/"TRAMO"/g)).toHaveLength(1)
    expect(m).toContain("2 campos más")
  })
})

// ---------------------------------------------------------------------------
// LA PRUEBA CON DATOS CENTINELA
// ---------------------------------------------------------------------------

describe("centinelasPara", () => {
  it("da un valor distinto por campo, y ninguno está en el documento", () => {
    const texto = "Contrato de Ana Ruiz, CUIT 27-31456789-4."
    const c = centinelasPara(["NOMBRE", "CUIT"], texto)
    expect(c.NOMBRE).not.toBe(c.CUIT)
    expect(texto).not.toContain(c.NOMBRE)
    expect(texto).not.toContain(c.CUIT)
  })

  it("no lleva dígitos ni guiones bajos, para que ningún dato corto caiga adentro", () => {
    const c = centinelasPara(["A", "B", "C"], "")
    for (const valor of Object.values(c)) expect(valor).toMatch(/^[A-Z]+$/)
  })

  it("un dato corto NO se encuentra adentro de un centinela", () => {
    /**
     * Es la propiedad que hace utilizable a la prueba: el centinela queda en el
     * texto mientras se siguen buscando los otros valores. Si un "1" pudiera
     * meterse adentro, la prueba produciría el daño que tiene que detectar.
     */
    const c = centinelasPara(["A"], "")
    expect(ubicarValores(c.A, { CORTO: "1" })[0].veces).toBe(0)
    expect(ubicarValores(c.A, { CORTO: "A" })[0].veces).toBe(0)
  })

  it("si el prefijo ya estuviera en el documento, se alarga hasta que no esté", () => {
    const c = centinelasPara(["A"], "CENTINELAPRISMAAFIN aparece en el contrato")
    expect(c.A).not.toBe("CENTINELAPRISMAAFIN")
    expect("CENTINELAPRISMAAFIN aparece en el contrato").not.toContain(c.A)
  })

  it("con más de 26 campos sigue dando valores distintos", () => {
    const campos = Array.from({ length: 30 }, (_, i) => `CAMPO_${i}`)
    const c = centinelasPara(campos, "")
    expect(new Set(Object.values(c)).size).toBe(30)
  })
})

describe("textoEsperadoConCentinelas", () => {
  it("cambia cada valor por su centinela, en todas las partes", () => {
    const esperado = textoEsperadoConCentinelas(
      { "word/document.xml": "Firma Ana Ruiz. Otra vez Ana Ruiz.", "word/header1.xml": "Legajo 8892" },
      [
        { buscado: "Ana Ruiz", centinela: "XNOMBREX" },
        { buscado: "8892", centinela: "XLEGAJOX" },
      ],
    )
    expect(esperado["word/document.xml"]).toBe("Firma XNOMBREX. Otra vez XNOMBREX.")
    expect(esperado["word/header1.xml"]).toBe("Legajo XLEGAJOX")
  })

  it("consume el valor MÁS LARGO primero, igual que ponerHuecosEnDocx", () => {
    /**
     * Si entrara primero el corto, partiría al largo por la mitad y el esperado
     * sería distinto del que produce Word — un rojo inventado por la propia
     * comprobación.
     */
    const esperado = textoEsperadoConCentinelas({ "word/document.xml": "Vive en Belgrano 1234, zona Belgrano." }, [
      { buscado: "Belgrano", centinela: "XZONAX" },
      { buscado: "Belgrano 1234", centinela: "XDIRX" },
    ])
    expect(esperado["word/document.xml"]).toBe("Vive en XDIRX, zona XZONAX.")
  })

  it("no toca lo que parte una palabra por la mitad", () => {
    const esperado = textoEsperadoConCentinelas({ "word/document.xml": "Anabela y Ana Ruiz" }, [
      { buscado: "Ana", centinela: "XNX" },
    ])
    expect(esperado["word/document.xml"]).toBe("Anabela y XNX Ruiz")
  })

  it("un buscado vacío se ignora en vez de meter el centinela en cada letra", () => {
    const esperado = textoEsperadoConCentinelas({ "word/document.xml": "Contrato" }, [
      { buscado: "", centinela: "XX" },
    ])
    expect(esperado["word/document.xml"]).toBe("Contrato")
  })
})

describe("moldeNoResisteLaPrueba", () => {
  it("dice que no se guardó nada y qué mirar en el Word", () => {
    const m = moldeNoResisteLaPrueba("en el cuerpo dice «X» y diría «Y»")
    expect(m).toContain("no pone los datos donde corresponde")
    expect(m).toContain("«X»")
    expect(m).toContain("No se guardó nada")
    expect(m).toContain("Word")
  })

  it("sin observación, igual dice algo que se entiende", () => {
    expect(moldeNoResisteLaPrueba(null)).toContain("quedaron en lugares distintos")
  })
})

describe("normalizarHuecosEscritosAMano", () => {
  it("le saca los espacios de adentro de las llaves", () => {
    expect(
      normalizarHuecosEscritosAMano({ "word/document.xml": "La comision es del {{ COMISION }} anual." }),
    ).toEqual({ "word/document.xml": "La comision es del {{COMISION}} anual." })
  })

  it("deja igual el que ya venía canónico", () => {
    const partes = { "word/document.xml": "Zona: {{ZONA}}" }
    expect(normalizarHuecosEscritosAMano(partes)).toEqual(partes)
  })

  /**
   * ═══ El testigo de que la forma del hueco sale de DELIMITADORES ═══
   *
   * `HUECO_ESCRITO` era la TERCERA copia de `{{` y `}}` escritos a mano, y
   * `docx.ts` documenta el daño MEDIDO de que dos de esas copias discrepen.
   *
   * Yo había escrito que esto "no se puede demostrar con una mutación", y era
   * demasiado fuerte: es cierto que cambiar los delimitadores pone 102 tests en
   * rojo con o sin el arreglo, así que la mutación no discrimina. Pero el
   * observable correcto no es "¿algo se puso en rojo?" sino **"¿este test sigue
   * verde?"**. Con el fixture armado DESDE la constante, el código de hoy pasa
   * y el de ayer —el regex a mano— fallaría, porque buscaría `{{` en un texto
   * que ya no lo tiene.
   */
  it("la forma que busca sale de DELIMITADORES, no de dos llaves escritas a mano", () => {
    const { start, end } = DELIMITADORES
    expect(
      normalizarHuecosEscritosAMano({ "word/document.xml": `Zona: ${start}  ZONA  ${end}.` }),
    ).toEqual({ "word/document.xml": `Zona: ${start}ZONA${end}.` })
  })

  it("NO toca lo que no es un hueco válido: sería reescribirle el contrato a alguien", () => {
    const partes = {
      "word/document.xml": "Un {{ }} vacio, un {{ dos palabras }} y una llave suelta {{ .",
    }
    expect(normalizarHuecosEscritosAMano(partes)).toEqual(partes)
  })

  it("normaliza en todas las partes, no solo en el cuerpo", () => {
    expect(
      normalizarHuecosEscritosAMano({
        "word/document.xml": "{{ A }}",
        "word/header1.xml": "{{  B  }}",
      }),
    ).toEqual({ "word/document.xml": "{{A}}", "word/header1.xml": "{{B}}" })
  })
})

// ---------------------------------------------------------------------------
// LA CUENTA CRUZADA
// ---------------------------------------------------------------------------

/**
 * El agujero que ninguna de las otras guardas puede ver, y la única cuenta que
 * lo delata sin salir a comparar N contra N.
 */
describe("camposQueParecenTextoFijo", () => {
  const partesDeAna = textoPorParte(
    docx([
      parrafo("Se asigna a EL ASESOR la zona de Palermo."),
      parrafo("Las consultas se atienden en nuestra oficina de Palermo."),
      parrafo("Firma: Ana Ruiz."),
    ]),
  )
  const ubicacionesDeAna = ubicarValoresEnPartes(partesDeAna, { ZONA: "Palermo", NOMBRE: "Ana Ruiz" })

  const bruno = (texto: string[]) => ({
    nombre: "Bruno Sanguinetti",
    valores: { ZONA: "Belgrano R", NOMBRE: "Bruno Sanguinetti" },
    partes: textoPorParte(docx(texto.map(parrafo))),
  })

  it("delata el valor que también es texto fijo: 2 acá, 1 en el otro", () => {
    const sospechas = camposQueParecenTextoFijo({
      ubicaciones: ubicacionesDeAna,
      partesDelNuevo: partesDeAna,
      otros: [bruno(["Se asigna a EL ASESOR la zona de Belgrano R.", "Firma: Bruno Sanguinetti."])],
    })
    expect(sospechas.map((s) => s.campo)).toEqual(["ZONA"])
    expect(sospechas[0].vecesEnElMolde).toBe(2)
    expect(sospechas[0].vecesEnElOtro).toBe(1)
    expect(sospechas[0].otroAsesor).toBe("Bruno Sanguinetti")
  })

  it("y dice DÓNDE, que es lo único que le permite al director arreglarlo", () => {
    const sospechas = camposQueParecenTextoFijo({
      ubicaciones: ubicacionesDeAna,
      partesDelNuevo: partesDeAna,
      otros: [bruno(["Se asigna a EL ASESOR la zona de Belgrano R.", "Firma: Bruno Sanguinetti."])],
    })
    expect(sospechas[0].lugares).toHaveLength(2)
    expect(sospechas[0].lugares.join(" ")).toContain("nuestra oficina de «Palermo»")
    expect(sospechas[0].lugares.join(" ")).toContain("la zona de «Palermo»")
  })

  it("si las cuentas dan igual, no dice nada", () => {
    const sospechas = camposQueParecenTextoFijo({
      ubicaciones: ubicacionesDeAna,
      partesDelNuevo: partesDeAna,
      otros: [
        bruno([
          "Se asigna a EL ASESOR la zona de Belgrano R.",
          "Las consultas se atienden en nuestra oficina de Belgrano R.",
          "Firma: Bruno Sanguinetti.",
        ]),
      ],
    })
    expect(sospechas).toEqual([])
  })

  it("un campo que aparece UNA sola vez no se mira: no hay una de las dos que sobre", () => {
    const partes = textoPorParte(docx([parrafo("La zona de Palermo.")]))
    const sospechas = camposQueParecenTextoFijo({
      ubicaciones: ubicarValoresEnPartes(partes, { ZONA: "Palermo" }),
      partesDelNuevo: partes,
      otros: [{ nombre: "Bruno", valores: { ZONA: "Belgrano R" }, partes: textoPorParte(docx([parrafo("Nada.")])) }],
    })
    expect(sospechas).toEqual([])
  })

  it("que el OTRO repita más veces no es sospecha de nada", () => {
    const partes = textoPorParte(docx([parrafo("Palermo y otra vez Palermo.")]))
    const sospechas = camposQueParecenTextoFijo({
      ubicaciones: ubicarValoresEnPartes(partes, { ZONA: "Palermo" }),
      partesDelNuevo: partes,
      otros: [
        {
          nombre: "Bruno",
          valores: { ZONA: "Belgrano R" },
          partes: textoPorParte(docx([parrafo("Belgrano R, Belgrano R y Belgrano R.")])),
        },
      ],
    })
    expect(sospechas).toEqual([])
  })

  it("el otro que no tiene ese dato, o que no lo tiene en su documento, se saltea", () => {
    const otros = [
      { nombre: "Sin dato", valores: { ZONA: "" }, partes: textoPorParte(docx([parrafo("Contrato.")])) },
      { nombre: "Sin la palabra", valores: { ZONA: "Saavedra" }, partes: textoPorParte(docx([parrafo("Contrato.")])) },
    ]
    expect(
      camposQueParecenTextoFijo({ ubicaciones: ubicacionesDeAna, partesDelNuevo: partesDeAna, otros }),
    ).toEqual([])
  })

  it("sin nadie con quien contrastar, no inventa nada", () => {
    expect(
      camposQueParecenTextoFijo({ ubicaciones: ubicacionesDeAna, partesDelNuevo: partesDeAna, otros: [] }),
    ).toEqual([])
  })

  it("informa al asesor con la cuenta MÁS BAJA, que es el que deja más claro cuánto sobra", () => {
    const partes = textoPorParte(docx([parrafo("Palermo, Palermo y Palermo otra vez.")]))
    const sospechas = camposQueParecenTextoFijo({
      ubicaciones: ubicarValoresEnPartes(partes, { ZONA: "Palermo" }),
      partesDelNuevo: partes,
      otros: [
        { nombre: "Dos", valores: { ZONA: "Nunez" }, partes: textoPorParte(docx([parrafo("Nunez y Nunez.")])) },
        { nombre: "Uno", valores: { ZONA: "Saavedra" }, partes: textoPorParte(docx([parrafo("Saavedra.")])) },
      ],
    })
    expect(sospechas[0].otroAsesor).toBe("Uno")
    expect(sospechas[0].vecesEnElOtro).toBe(1)
  })
})

describe("lugaresDeUnValor", () => {
  it("muestra el texto de alrededor con el valor marcado", () => {
    const partes = { "word/document.xml": "Las consultas se atienden en nuestra oficina de Palermo, de 9 a 18." }
    const lugares = lugaresDeUnValor(partes, "Palermo")
    expect(lugares).toHaveLength(1)
    expect(lugares[0]).toContain("nuestra oficina de «Palermo»")
    expect(lugares[0]).toContain("de 9 a 18")
  })

  it("recorta con puntos suspensivos cuando el contrato sigue", () => {
    const largo = "x".repeat(200)
    const lugares = lugaresDeUnValor({ "word/document.xml": largo + " Palermo " + largo }, "Palermo")
    expect(lugares[0].startsWith("…")).toBe(true)
    expect(lugares[0].endsWith("…")).toBe(true)
  })

  it("junta los saltos de línea, para que el pedazo entre en un renglón", () => {
    const lugares = lugaresDeUnValor({ "word/document.xml": "Zona:\n\nPalermo\n\nFirma" }, "Palermo")
    expect(lugares[0]).not.toContain("\n")
  })

  it("corta a los tres primeros y no vuelca el contrato entero", () => {
    const partes = { "word/document.xml": "Palermo. Palermo. Palermo. Palermo. Palermo." }
    expect(lugaresDeUnValor(partes, "Palermo")).toHaveLength(3)
  })

  it("el cuerpo va antes que el encabezado, igual que en todo lo demás", () => {
    const lugares = lugaresDeUnValor(
      { "word/header1.xml": "Membrete Palermo", "word/document.xml": "Zona de Palermo" },
      "Palermo",
    )
    expect(lugares[0]).toContain("Zona de")
  })

  it("un valor vacío no devuelve nada", () => {
    expect(lugaresDeUnValor({ "word/document.xml": "Contrato" }, "")).toEqual([])
  })
})

describe("avisoDeTextoFijoSospechado", () => {
  const sospecha = {
    campo: "ZONA",
    vecesEnElMolde: 2,
    vecesEnElOtro: 1,
    otroAsesor: "Bruno Sanguinetti",
    lugares: ["…nuestra oficina de «Palermo», de 9 a 18…"],
  }

  it("sin sospechas no dice nada", () => {
    expect(avisoDeTextoFijoSospechado([])).toBeNull()
  })

  it("nombra el campo, la cuenta, el otro asesor y el LUGAR", () => {
    const aviso = avisoDeTextoFijoSospechado([sospecha])!
    expect(aviso).toContain("ZONA")
    expect(aviso).toContain("Bruno Sanguinetti")
    expect(aviso).toContain("sobra 1 aparición")
    expect(aviso).toContain("nuestra oficina de «Palermo»")
  })

  it("dice qué hacer, y que esto avisa y no frena", () => {
    const aviso = avisoDeTextoFijoSospechado([sospecha])!
    expect(aviso).toContain("cambiá esa frase en el Word")
    expect(aviso).toContain("no frena")
    // Y por qué puede equivocarse, que es lo que lo hace un aviso honesto.
    expect(aviso).toContain("versión anterior")
  })

  it("con dos sospechas las nombra a las dos", () => {
    const aviso = avisoDeTextoFijoSospechado([sospecha, { ...sospecha, campo: "NOMBRE" }])!
    expect(aviso).toContain("2 datos")
    expect(aviso).toContain("ZONA")
    expect(aviso).toContain("NOMBRE")
  })
})
