import { describe, it, expect } from "vitest"
import { normalizarParaComparar, primeraDiferencia, verificarContraElOriginal } from "./verificacion"

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
