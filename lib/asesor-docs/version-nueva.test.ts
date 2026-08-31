import { describe, it, expect } from "vitest"
import PizZip from "pizzip"

import { ponerHuecosEnDocx, textoPorParte } from "@/lib/plantillas/docx"
import { LARGO_DE_DATO_SOSPECHOSO } from "./confirmacion"
import {
  avisoDeCamposConElMismoDato,
  avisoDeCamposDesaparecidos,
  avisoDeCamposNuevos,
  avisoDeDatosQueSePasan,
  avisoDeValoresQueSobreviven,
  avisoDeValoresRepetidos,
  camposConElMismoDato,
  camposSchemaDeLaVersionNueva,
  compararCampos,
  moldeNoSeReconoce,
  nombresDelSchema,
  reemplazosDeLaVersionNueva,
  resumenDeLaVersionNueva,
  seVaAUsar,
  textoDeVistaPrevia,
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

  it("el orden sale de cómo aparecen en el documento nuevo, no del esquema viejo", () => {
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
