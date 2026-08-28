import { describe, it, expect } from "vitest"
import {
  nombreDeParte,
  normalizarParaComparar,
  primeraDiferencia,
  tipoDeParte,
  verificarContraElOriginal,
  verificarDocumentoEntero,
} from "./verificacion"

/**
 * ESTE ARCHIVO ES LA LÍNEA.
 *
 * `verificacion.ts` decide si una plantilla se publica o se queda en borrador.
 * El criterio de comparación no puede ser byte a byte (daría rojos falsos
 * sistemáticos, ver el comentario largo de ese archivo) ni puede ser laxo
 * (dejaría salir un contrato con el dato de otra persona). Lo que sigue es
 * **dónde está la línea**, escrito como pares: esta diferencia pasa, esta otra
 * no.
 *
 * Si alguien la mueve, que sea a propósito y que rompa acá primero.
 */

// ---------------------------------------------------------------------------
// Lo que TIENE que pasar en verde
// ---------------------------------------------------------------------------

describe("diferencias que NO son un fallo: quedan en verde", () => {
  it("dos espacios contra uno", () => {
    const r = verificarContraElOriginal(
      "El asesor Juan  Pérez acepta.",
      "El asesor Juan Pérez acepta.",
    )
    expect(r.coincide).toBe(true)
    expect(r.observacion).toBeNull()
  })

  it("un salto de línea donde el otro tiene un espacio", () => {
    expect(verificarContraElOriginal("Cláusula 1.\nEl asesor acepta.", "Cláusula 1. El asesor acepta.").coincide).toBe(
      true,
    )
  })

  it("un párrafo vacío de más", () => {
    expect(verificarContraElOriginal("Uno.\n\n\nDos.", "Uno.\nDos.").coincide).toBe(true)
  })

  it("fin de línea de Windows contra fin de línea de Linux", () => {
    /**
     * Los archivos de este repo son CRLF y los .docx los arma Word, así que
     * este par no es teórico: es el que aparece.
     */
    expect(verificarContraElOriginal("Uno.\r\nDos.", "Uno.\nDos.").coincide).toBe(true)
  })

  it("una tabulación donde el otro tiene un espacio", () => {
    expect(verificarContraElOriginal("CUIT:\t20-11111111-1", "CUIT: 20-11111111-1").coincide).toBe(true)
  })

  it("el espacio duro de Word (Ctrl+Shift+Espacio) contra el espacio común", () => {
    /**
     * También vigila que el `\s` de JavaScript siga incluyendo al espacio duro:
     * es el motivo por el que `verificacion.ts` no lleva una lista de espacios
     * raros aparte.
     */
    expect(verificarContraElOriginal("Juan\u00a0Pérez", "Juan Pérez").coincide).toBe(true)
  })

  it("un espacio de ancho cero de más", () => {
    expect(verificarContraElOriginal("Juan\u200bPérez", "JuanPérez").coincide).toBe(true)
  })

  it("un guión blando de corte de renglón", () => {
    expect(verificarContraElOriginal("inmo\u00adbiliaria", "inmobiliaria").coincide).toBe(true)
  })

  it("espacios sobrantes al principio y al final", () => {
    expect(verificarContraElOriginal("  Contrato.  ", "Contrato.").coincide).toBe(true)
  })

  it("comillas curvas del autocorrector contra comillas rectas", () => {
    expect(verificarContraElOriginal("“el asesor”", '"el asesor"').coincide).toBe(true)
  })

  it("el apóstrofo curvo contra el recto", () => {
    expect(verificarContraElOriginal("D’Angelo", "D'Angelo").coincide).toBe(true)
  })

  it("la tilde compuesta contra la tilde de un solo caracter", () => {
    // "Pérez" con la e y la tilde por separado, que es como lo guardan algunos
    // editores, contra la é de un solo caracter.
    expect(verificarContraElOriginal("Pe\u0301rez", "Pérez").coincide).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Lo que TIENE que salir en rojo
// ---------------------------------------------------------------------------

describe("diferencias que SÍ son un fallo: quedan en rojo", () => {
  it("un espacio que existe contra uno que no existe entre dos palabras", () => {
    /**
     * El par que define el borde: se COLAPSAN tandas de espacios, no se
     * borran. "Juan Pérez" y "JuanPérez" son dos textos distintos.
     */
    const r = verificarContraElOriginal("Juan Pérez", "JuanPérez")
    expect(r.coincide).toBe(false)
    expect(r.observacion).toContain("Juan Pérez")
  })

  it("el nombre de otra persona: el caso que esto vino a atrapar", () => {
    const r = verificarContraElOriginal(
      "Entre PRISMA y María González, DNI 30.111.222, se acuerda.",
      "Entre PRISMA y Juan Pérez, DNI 30.111.222, se acuerda.",
    )
    expect(r.coincide).toBe(false)
    expect(r.observacion).toContain("María González")
    expect(r.observacion).toContain("Juan Pérez")
  })

  it("un dígito distinto en el CUIT", () => {
    expect(verificarContraElOriginal("CUIT 20-11111111-1", "CUIT 20-11111112-1").coincide).toBe(false)
  })

  it("un guión medio contra un guión corto", () => {
    /**
     * A propósito NO se normalizan los guiones. Si esa diferencia estuviera en
     * el texto fijo, la detección ya la habría convertido en hueco y se
     * rellenaría sola; que llegue hasta acá significa que algo no se reemplazó.
     */
    expect(verificarContraElOriginal("20–11111111–1", "20-11111111-1").coincide).toBe(false)
  })

  it("las mayúsculas cuentan", () => {
    expect(verificarContraElOriginal("VAKDOR S.A.", "VAKDOR s.a.").coincide).toBe(false)
  })

  it("una cláusula entera que falta", () => {
    const r = verificarContraElOriginal(
      "Cláusula 1. Cláusula 2. Confidencialidad. Cláusula 3.",
      "Cláusula 1. Cláusula 3.",
    )
    expect(r.coincide).toBe(false)
    expect(r.observacion).toContain("Confidencialidad")
  })

  it("texto de más que el original no tiene", () => {
    const r = verificarContraElOriginal("Fin del contrato.", "Fin del contrato. {{COMISION}}")
    expect(r.coincide).toBe(false)
    expect(r.observacion).toContain("COMISION")
  })

  it("un porcentaje distinto", () => {
    expect(verificarContraElOriginal("comisión del 30%", "comisión del 35%").coincide).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// La observación: tiene que servirle a alguien que no programa
// ---------------------------------------------------------------------------

describe("la observación", () => {
  it("ubica la diferencia con el texto de antes", () => {
    const r = verificarContraElOriginal(
      "El presente contrato se celebra con Ana Suárez, matrícula 555.",
      "El presente contrato se celebra con Juan Pérez, matrícula 555.",
    )
    expect(r.observacion).toContain("Después de")
    expect(r.observacion).toContain("celebra con")
  })

  it("cuando la diferencia arranca en el primer caracter, lo dice así", () => {
    const r = verificarContraElOriginal("Ana firma.", "Juan firma.")
    expect(r.observacion).toContain("Al principio del documento")
  })

  it("dice (nada) en vez de dejar unas comillas vacías", () => {
    // El caso del documento que sale en blanco: del lado armado no hay NADA que
    // mostrar, y unas comillas vacías no se ven.
    const r = verificarContraElOriginal("Contrato de Ana Suárez.", "")
    expect(r.coincide).toBe(false)
    expect(r.observacion).toContain("(nada)")
  })

  it("no vuelca medio contrato: recorta la muestra", () => {
    const largo = "palabra ".repeat(200)
    const r = verificarContraElOriginal(`Inicio. ${largo}Fin.`, "Inicio. Fin.")
    expect(r.coincide).toBe(false)
    expect(r.observacion!.length).toBeLessThan(500)
    expect(r.observacion).toContain("…")
  })
})

// ---------------------------------------------------------------------------
// Las piezas sueltas
// ---------------------------------------------------------------------------

describe("normalizarParaComparar", () => {
  it("deja una sola forma para el mismo texto escrito de dos maneras", () => {
    expect(normalizarParaComparar("  Juan\u00a0 Pérez\r\n“ok”  ")).toBe('Juan Pérez "ok"')
  })

  it("no toca un texto que ya está en su forma mínima", () => {
    expect(normalizarParaComparar("Juan Pérez, CUIT 20-11111111-1.")).toBe("Juan Pérez, CUIT 20-11111111-1.")
  })

  it("el texto vacío y el de puros espacios dan lo mismo", () => {
    expect(normalizarParaComparar("")).toBe("")
    expect(normalizarParaComparar("   \n\t  ")).toBe("")
  })
})

describe("primeraDiferencia", () => {
  it("devuelve null cuando son iguales", () => {
    expect(primeraDiferencia("abc", "abc")).toBeNull()
  })

  it("recorta el prefijo y el sufijo comunes", () => {
    expect(primeraDiferencia("hola Ana chau", "hola Juan chau")).toEqual({
      enElOriginal: "Ana",
      enElArmado: "Juan",
      antes: "hola ",
    })
  })

  it("no se pasa de largo cuando uno de los dos es más corto", () => {
    /**
     * El prefijo y el sufijo no pueden solaparse. "aaa" contra "aa" comparte
     * "aa" por delante y "aa" por detrás, y sin el tope el recorte daría
     * índices cruzados y un texto negativo. Como no hay ningún espacio, el
     * estirado hasta el borde de palabra se lleva la palabra entera.
     */
    expect(primeraDiferencia("aaa", "aa")).toEqual({ enElOriginal: "aaa", enElArmado: "aa", antes: "" })
  })

  it("estira los bordes hasta el espacio: no corta palabras por la mitad", () => {
    /**
     * Sin el estirado, "María González" y "Juan Pérez" comparten la "ez" final
     * y el director leía «María Gonzál» contra «Juan Pér».
     */
    expect(primeraDiferencia("Entre y María González, DNI", "Entre y Juan Pérez, DNI")).toEqual({
      enElOriginal: "María González,",
      enElArmado: "Juan Pérez,",
      antes: "Entre y ",
    })
  })

  it("con el texto vacío de un lado devuelve el otro entero", () => {
    expect(primeraDiferencia("hola", "")).toEqual({ enElOriginal: "hola", enElArmado: "", antes: "" })
  })
})

// ---------------------------------------------------------------------------
// EL DOCUMENTO ENTERO, NO SOLO EL CUERPO
// ---------------------------------------------------------------------------

const CUERPO = "word/document.xml"
const ENCABEZADO = "word/header1.xml"
const PIE = "word/footer1.xml"

describe("tipoDeParte", () => {
  it("clasifica cada parte del paquete", () => {
    expect(tipoDeParte(CUERPO)).toBe("cuerpo")
    expect(tipoDeParte(ENCABEZADO)).toBe("encabezado")
    expect(tipoDeParte(PIE)).toBe("pie")
    expect(tipoDeParte("word/footnotes.xml")).toBe("notas-al-pie")
    expect(tipoDeParte("word/endnotes.xml")).toBe("notas-al-final")
    expect(tipoDeParte("word/comments.xml")).toBe("comentarios")
    expect(tipoDeParte("word/raro.xml")).toBe("otra")
  })

  it("las notas al pie no se confunden con el pie de página", () => {
    /**
     * "footnotes" empieza con "foot" igual que "footer": preguntado en el orden
     * equivocado, las notas al pie salían informadas como pie y el director iba
     * a mirar el lugar que no era.
     */
    expect(tipoDeParte("word/footnotes.xml")).not.toBe(tipoDeParte(PIE))
  })

  it("las notas al final no se confunden con las notas al pie", () => {
    // Las dos tienen "notes" adentro.
    expect(tipoDeParte("word/endnotes.xml")).not.toBe(tipoDeParte("word/footnotes.xml"))
  })

  it("todos los encabezados son la misma familia, los numere Word como los numere", () => {
    /**
     * Word usa header1 para la primera página y header2 para el resto según le
     * convenga. Comparando ruta contra ruta, dos documentos con el MISMO
     * membrete guardado con distinto número salían como "falta el encabezado".
     */
    expect(tipoDeParte("word/header1.xml")).toBe(tipoDeParte("word/header2.xml"))
  })
})

describe("nombreDeParte", () => {
  it("le pone nombre de persona a cada familia", () => {
    expect(nombreDeParte(CUERPO)).toBe("el cuerpo del documento")
    expect(nombreDeParte(ENCABEZADO)).toBe("el encabezado")
    expect(nombreDeParte(PIE)).toBe("el pie de página")
    expect(nombreDeParte("word/footnotes.xml")).toBe("las notas al pie")
    expect(nombreDeParte("word/endnotes.xml")).toBe("las notas al final")
    expect(nombreDeParte("word/comments.xml")).toBe("los comentarios de Word")
  })
})

describe("verificarDocumentoEntero", () => {
  it("todas las partes iguales: verde", () => {
    const doc = { [CUERPO]: "Contrato de Ana.", [ENCABEZADO]: "Legajo 8892" }
    expect(verificarDocumentoEntero(doc, { ...doc }).coincide).toBe(true)
  })

  it("EL FALSO VERDE: un dato que vive solo en el encabezado", () => {
    /**
     * Medido antes de existir esta función: la detección compara cuerpos, así
     * que el legajo nunca es campo; el molde sale del .docx de Ana con SU
     * legajo adentro; y el contrato de Bruno salía con el número de Ana
     * mientras la comprobación decía VERDE.
     */
    const original = { [CUERPO]: "Contrato de Bruno.", [ENCABEZADO]: "Legajo interno 4471" }
    const armado = { [CUERPO]: "Contrato de Bruno.", [ENCABEZADO]: "Legajo interno 8892" }

    const r = verificarDocumentoEntero(original, armado)
    expect(r.coincide).toBe(false)
    expect(r.observacion).toContain("encabezado")
    expect(r.observacion).toContain("4471")
    expect(r.observacion).toContain("8892")
  })

  it("una diferencia en el pie dice que es en el pie", () => {
    const r = verificarDocumentoEntero({ [CUERPO]: "x", [PIE]: "Ana" }, { [CUERPO]: "x", [PIE]: "Bruno" })
    expect(r.coincide).toBe(false)
    expect(r.observacion).toContain("pie de página")
  })

  it("el cuerpo se informa sin prefijo: es donde todo el mundo mira", () => {
    const r = verificarDocumentoEntero({ [CUERPO]: "Ana firma." }, { [CUERPO]: "Bruno firma." })
    expect(r.coincide).toBe(false)
    expect(r.observacion).not.toContain("En el cuerpo")
  })

  it("el cuerpo se revisa PRIMERO, aun contra una parte que va antes por orden alfabético", () => {
    /**
     * El caso tiene que usar `comments` y no `header`: "word/c" ya viene antes
     * que "word/d" solo, así que con el encabezado el test pasaría igual sin la
     * regla, por el orden alfabético y no por la regla. Con los comentarios,
     * sacar el "cuerpo primero" manda al director a mirar una nota al margen
     * teniendo el nombre de otra persona en la cláusula principal.
     */
    const COMENTARIOS = "word/comments.xml"
    const r = verificarDocumentoEntero(
      { [CUERPO]: "Ana firma.", [COMENTARIOS]: "uno" },
      { [CUERPO]: "Bruno firma.", [COMENTARIOS]: "dos" },
    )
    expect(r.observacion).toContain("Ana")
    expect(r.observacion).not.toContain("comentarios")
  })

  it("y una parte que falta antes del cuerpo tampoco lo tapa", () => {
    const COMENTARIOS = "word/comments.xml"
    const r = verificarDocumentoEntero(
      { [CUERPO]: "Ana firma.", [COMENTARIOS]: "uno" },
      { [CUERPO]: "Bruno firma." },
    )
    // El cuerpo manda: la parte que falta se cuenta después.
    expect(r.observacion).toContain("Ana")
  })

  it("una parte que falta en el armado es una diferencia, y se dice cuál", () => {
    const r = verificarDocumentoEntero({ [CUERPO]: "x", [ENCABEZADO]: "y" }, { [CUERPO]: "x" })
    expect(r.coincide).toBe(false)
    expect(r.observacion).toContain("Falta")
    expect(r.observacion).toContain("encabezado")
  })

  it("una parte que sobra también", () => {
    const r = verificarDocumentoEntero({ [CUERPO]: "x" }, { [CUERPO]: "x", [ENCABEZADO]: "y" })
    expect(r.coincide).toBe(false)
    expect(r.observacion).toContain("Sobra")
  })

  it("un encabezado vacío en los dos lados no es una diferencia", () => {
    expect(verificarDocumentoEntero({ [CUERPO]: "x", [ENCABEZADO]: "" }, { [CUERPO]: "x", [ENCABEZADO]: "  " }).coincide).toBe(
      true,
    )
  })

  it("dentro de cada parte rige el mismo criterio de siempre", () => {
    // Los espacios de más se siguen ignorando también en el encabezado.
    expect(
      verificarDocumentoEntero({ [CUERPO]: "x", [ENCABEZADO]: "Legajo  8892" }, { [CUERPO]: "x", [ENCABEZADO]: "Legajo 8892" })
        .coincide,
    ).toBe(true)
  })

  it("el orden en que vengan las partes no cambia el resultado", () => {
    const a = { [ENCABEZADO]: "y", [CUERPO]: "x", [PIE]: "z" }
    const b = { [PIE]: "z", [CUERPO]: "x", [ENCABEZADO]: "y" }
    expect(verificarDocumentoEntero(a, b).coincide).toBe(true)
  })
})

describe("verificarDocumentoEntero: los casos que costaron una ronda", () => {
  const COMENTARIOS = "word/comments.xml"
  const NOTAS_AL_FINAL = "word/endnotes.xml"

  it("un párrafo vacío de más entre partes NO es una diferencia", () => {
    /**
     * LA REGRESIÓN. `textoPorParte` unía los párrafos con "|||", que no es un
     * espacio y por lo tanto sobrevivía a la normalización: el Enter de más
     * —lo más común que hay en un Word— pasaba a ser un rojo que el director
     * no podía arreglar, porque la detección compara con `diffWords`, que
     * ignora los espacios, y un párrafo vacío NUNCA puede ser un campo.
     *
     * El test que debía cuidarlo miraba `verificarContraElOriginal` con "\n",
     * y producción ya no le pasaba "\n". Seguía en verde sobre un camino que
     * no existía. Este mira lo que pasa de verdad.
     */
    const r = verificarDocumentoEntero({ [CUERPO]: "Uno.\n\n\nDos." }, { [CUERPO]: "Uno.\nDos." })
    expect(r.coincide).toBe(true)
  })

  it("y el separador NUNCA aparece en lo que lee el director", () => {
    const r = verificarDocumentoEntero({ [CUERPO]: "Ana\nRuiz\nfirma." }, { [CUERPO]: "Bruno\nSosa\nfirma." })
    expect(r.coincide).toBe(false)
    expect(r.observacion).not.toContain("|||")
  })

  it("el mismo encabezado guardado con otro número NO es una diferencia", () => {
    // Word numera header1/header2 según la página; el membrete es el mismo.
    const r = verificarDocumentoEntero({ [CUERPO]: "x", "word/header1.xml": "VAKDOR" }, { [CUERPO]: "x", "word/header2.xml": "VAKDOR" })
    expect(r.coincide).toBe(true)
  })

  it("un encabezado en blanco y ninguno son lo mismo", () => {
    // Un header sin una letra adentro no es un encabezado.
    expect(verificarDocumentoEntero({ [CUERPO]: "x", [ENCABEZADO]: "   " }, { [CUERPO]: "x" }).coincide).toBe(true)
  })

  it("una nota al FINAL distinta queda en rojo: es la sexta vía a activa", () => {
    /**
     * La plantilla no rellena las notas al final, así que el molde se lleva la
     * del asesor que hizo de molde al documento de todos. Un legajo ahí salía
     * en verde y la plantilla llegaba a `activa` con el número de otra persona.
     */
    const r = verificarDocumentoEntero(
      { [CUERPO]: "x", [NOTAS_AL_FINAL]: "Legajo interno 4471" },
      { [CUERPO]: "x", [NOTAS_AL_FINAL]: "Legajo interno 8892" },
    )
    expect(r.coincide).toBe(false)
    expect(r.observacion).toContain("notas al final")
    expect(r.observacion).toContain("4471")
  })

  it("una diferencia fuera del cuerpo dice CÓMO se arregla", () => {
    /**
     * Desde la pantalla de revisión el director no puede tocar un encabezado.
     * Desde el Word sí, y sin decírselo el mensaje lo deja sin salida.
     */
    const r = verificarDocumentoEntero({ [CUERPO]: "x", [ENCABEZADO]: "uno" }, { [CUERPO]: "x", [ENCABEZADO]: "dos" })
    expect(r.observacion).toContain("volvé a detectar")
    expect(r.observacion).toContain("cuerpo")
  })

  it("un comentario de Word distinto se arregla borrándolo en el Word, y lo dice", () => {
    // Se sigue comparando a propósito: si el molde le mete a Bruno el
    // comentario de Ana, el documento está mal. Pero tiene salida.
    const r = verificarDocumentoEntero(
      { [CUERPO]: "x", [COMENTARIOS]: "Revisar con Ana" },
      { [CUERPO]: "x", [COMENTARIOS]: "Revisar con Bruno" },
    )
    expect(r.coincide).toBe(false)
    expect(r.observacion).toContain("comentarios de Word")
    expect(r.observacion).toContain("borrá el comentario")
  })

  it("la frase de falta/sobra concuerda en número", () => {
    // "Falta los comentarios" estaba mal escrito y lo leía un director.
    const enPlural = verificarDocumentoEntero({ [CUERPO]: "x", [COMENTARIOS]: "algo" }, { [CUERPO]: "x" })
    expect(enPlural.observacion).toContain("Faltan los comentarios")

    const enSingular = verificarDocumentoEntero({ [CUERPO]: "x", [ENCABEZADO]: "algo" }, { [CUERPO]: "x" })
    expect(enSingular.observacion).toContain("Falta el encabezado")

    const sobrando = verificarDocumentoEntero({ [CUERPO]: "x" }, { [CUERPO]: "x", [COMENTARIOS]: "algo" })
    expect(sobrando.observacion).toContain("Sobran los comentarios")
  })
})
