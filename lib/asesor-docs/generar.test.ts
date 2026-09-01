import { describe, it, expect } from "vitest"

import {
  avisoDeCamposQueNoAterrizaron,
  avisoDeDatosDeOtro,
  avisoDeHuecosSinRellenar,
  avisoDeHuecoMalEscritoAlSubir,
  avisoDeHuecosMalEscritos,
  sugerenciaDeHueco,
  avisoDeTextoFijoQueFrena,
  camposQueNoAterrizaron,
  contarHuecosDelMolde,
  datosDeOtroQueSeColaron,
  faltanAsesoresParaActivar,
  frenosDeLaGeneracion,
  huecosSinDato,
  observacionDePendiente,
  resumenDeLaGeneracion,
  valoresExclusivosDeOtros,
} from "./generar"
import { DELIMITADORES } from "@/lib/plantillas/docx"
import { LARGO_DE_DATO_SOSPECHOSO } from "./confirmacion"

/** Las dos rutas que importan acá: el cuerpo, y las notas al final. */
const CUERPO = "word/document.xml"
const NOTAS = "word/endnotes.xml"

const hueco = (nombre: string) => `${DELIMITADORES.start}${nombre}${DELIMITADORES.end}`

describe("contarHuecosDelMolde", () => {
  it("cuenta cada hueco por nombre, sumando entre partes", () => {
    const cuenta = contarHuecosDelMolde({
      [CUERPO]: `Hola ${hueco("NOMBRE")}, CUIT ${hueco("CUIT")}. Zona ${hueco("ZONA")} y de nuevo ${hueco("ZONA")}.`,
      "word/header1.xml": `Legajo de ${hueco("NOMBRE")}`,
    })
    expect(cuenta).toEqual({ NOMBRE: 2, CUIT: 1, ZONA: 2 })
  })

  /**
   * Las notas al final ENTRAN en la cuenta aunque docxtemplater no las rellene,
   * y eso es todo el punto: un `{{ZONA}}` que vive ahí no se llena nunca y el
   * contrato sale a la firma con las llaves puestas. Si no se contara, la
   * comprobación de aterrizaje no tendría contra qué comparar y ese contrato
   * pasaría en verde.
   */
  it("cuenta también los que están en las notas al final", () => {
    expect(contarHuecosDelMolde({ [CUERPO]: "nada", [NOTAS]: `Zona: ${hueco("ZONA")}` })).toEqual({ ZONA: 1 })
  })

  it("tolera el espacio de más que Word deja al escribirlo a mano", () => {
    expect(contarHuecosDelMolde({ [CUERPO]: "{{ NOMBRE }}" })).toEqual({ NOMBRE: 1 })
  })

  /**
   * EL HUECO FANTASMA, que sería un falso rojo caro.
   *
   * `textoPorParte` pega los párrafos con un salto de línea. Un "{{" al final de
   * un párrafo y un "NOMBRE}}" al principio del siguiente no son un hueco —
   * `huecosDe` lo evita metiendo "|||" entre párrafos y lo documenta—. Si se
   * contara, el molde prometería un campo que no tiene y se frenaría un
   * documento perfecto.
   */
  it("un salto de línea adentro NO arma un hueco", () => {
    expect(contarHuecosDelMolde({ [CUERPO]: "…final del parrafo {{\nNOMBRE}} arranca el otro" })).toEqual({})
  })

  it("un molde sin huecos devuelve el objeto vacío", () => {
    expect(contarHuecosDelMolde({ [CUERPO]: "Contrato sin un solo campo." })).toEqual({})
  })
})

describe("huecosSinDato: el campo nuevo que esta persona no tiene (spec §7.4.2)", () => {
  it("nombra los huecos del molde para los que no hay dato", () => {
    expect(huecosSinDato({ NOMBRE: 1, COMISION: 1 }, { NOMBRE: "Bruno" })).toEqual(["COMISION"])
  })

  it("un dato que es solo espacios cuenta como que no está", () => {
    expect(huecosSinDato({ COMISION: 1 }, { COMISION: "   " })).toEqual(["COMISION"])
  })

  it("sin form_data, faltan todos", () => {
    expect(huecosSinDato({ NOMBRE: 1, CUIT: 1 }, null)).toEqual(["CUIT", "NOMBRE"])
  })

  it("con todo cargado no falta ninguno", () => {
    expect(huecosSinDato({ NOMBRE: 1 }, { NOMBRE: "Bruno", DEMAS: "sobra" })).toEqual([])
  })

  it("la observación dice qué falta y que sigue con la versión anterior", () => {
    const texto = observacionDePendiente(["COMISION"])
    expect(texto).toContain("COMISION")
    expect(texto).toContain("versión anterior")
    expect(texto).toContain("volvé a aplicarle la versión")
  })
})

// ---------------------------------------------------------------------------
// 1. QUE SUS DATOS HAYAN ATERRIZADO
// ---------------------------------------------------------------------------

describe("camposQueNoAterrizaron", () => {
  const datos = { NOMBRE: "Bruno Sanguinetti", ZONA: "Belgrano" }

  it("con todo puesto no dice nada", () => {
    expect(
      camposQueNoAterrizaron({
        huecosDelMolde: { NOMBRE: 1, ZONA: 1 },
        datos,
        partesDelGenerado: { [CUERPO]: "Bruno Sanguinetti trabaja en Belgrano." },
      }),
    ).toEqual([])
  })

  it("un dato que no llegó al documento se nombra con las dos cuentas", () => {
    expect(
      camposQueNoAterrizaron({
        huecosDelMolde: { NOMBRE: 1, ZONA: 1 },
        datos,
        partesDelGenerado: { [CUERPO]: "Bruno Sanguinetti y nada más." },
      }),
    ).toEqual([{ campo: "ZONA", enElMolde: 1, enElGenerado: 0 }])
  })

  it("si el molde lo prometía dos veces y llegó una, también frena", () => {
    expect(
      camposQueNoAterrizaron({
        huecosDelMolde: { ZONA: 2 },
        datos,
        partesDelGenerado: { [CUERPO]: "zona Belgrano" },
      }),
    ).toEqual([{ campo: "ZONA", enElMolde: 2, enElGenerado: 1 }])
  })

  /**
   * Que aparezca de MÁS no es cosa de esta comprobación: significa que ese texto
   * también está en la parte fija del contrato, y de eso se ocupa la cuenta
   * cruzada, que sabe distinguirlo y lo dice con el mensaje correcto.
   */
  it("que aparezca de más NO frena acá", () => {
    expect(
      camposQueNoAterrizaron({
        huecosDelMolde: { ZONA: 1 },
        datos,
        partesDelGenerado: { [CUERPO]: "oficina de Belgrano, zona Belgrano" },
      }),
    ).toEqual([])
  })

  /**
   * Dos huecos pegados dejan "BelgranoBelgrano". Con la regla de borde de
   * palabra que usa el resto de la etapa, las DOS apariciones se descartarían y
   * se frenaría un documento perfecto. Por eso acá se cuenta liso.
   */
  it("dos huecos pegados no producen un falso rojo", () => {
    expect(
      camposQueNoAterrizaron({
        huecosDelMolde: { ZONA: 2 },
        datos,
        partesDelGenerado: { [CUERPO]: "BelgranoBelgrano" },
      }),
    ).toEqual([])
  })

  it("un campo sin dato no se mira acá: ese ya frenó como pendiente", () => {
    expect(
      camposQueNoAterrizaron({
        huecosDelMolde: { COMISION: 1 },
        datos: { COMISION: "" },
        partesDelGenerado: { [CUERPO]: "sin comision" },
      }),
    ).toEqual([])
  })

  it("el aviso dice a quién, qué campo y que su documento no se tocó", () => {
    const texto = avisoDeCamposQueNoAterrizaron(
      [{ campo: "ZONA", enElMolde: 1, enElGenerado: 0 }],
      "Bruno Sanguinetti",
    )!
    expect(texto).toContain("Bruno Sanguinetti")
    expect(texto).toContain("ZONA")
    expect(texto).toContain("no se tocó")
  })

  it("sin nada que decir, devuelve null", () => {
    expect(avisoDeCamposQueNoAterrizaron([], "Bruno")).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 2. QUE NO SE LE HAYA COLADO EL DATO DE OTRO
// ---------------------------------------------------------------------------

describe("valoresExclusivosDeOtros", () => {
  const ana = { advisorId: "a", nombre: "Ana Ruiz", valores: { CUIT: "27-31456789-4", ZONA: "Villa Urquiza" } }
  const carla = { advisorId: "c", nombre: "Carla Diaz", valores: { CUIT: "27-30111222-3", ZONA: "Belgrano" } }

  it("un CUIT es de una sola persona: entra", () => {
    const salida = valoresExclusivosDeOtros([ana], {})
    expect(salida.map((v) => v.valor).sort()).toEqual(["27-31456789-4", "Villa Urquiza"])
  })

  /**
   * La condición del brief, y la que hace que esto no sea ruido: dos asesores
   * pueden compartir legítimamente una zona. Que "Belgrano" aparezca en el
   * documento de un tercero no dice nada de nadie.
   */
  it("una zona que comparten dos personas NO es exclusiva", () => {
    const otraCarla = { ...carla, advisorId: "c2", valores: { ZONA: "Villa Urquiza" } }
    const salida = valoresExclusivosDeOtros([ana, otraCarla], {})
    expect(salida.map((v) => v.valor)).not.toContain("Villa Urquiza")
    expect(salida.map((v) => v.valor)).toContain("27-31456789-4")
  })

  it("compartida no es lo mismo que escrita igual: 'palermo' y 'Palermo' se juntan", () => {
    const uno = { advisorId: "1", nombre: "Uno", valores: { ZONA: "Palermo" } }
    const dos = { advisorId: "2", nombre: "Dos", valores: { ZONA: "  palermo " } }
    expect(valoresExclusivosDeOtros([uno, dos], {})).toEqual([])
  })

  it("un valor que también es MÍO no cuenta como ajeno", () => {
    expect(valoresExclusivosDeOtros([ana], { ZONA: "Villa Urquiza" }).map((v) => v.valor)).toEqual(["27-31456789-4"])
  })

  /**
   * Un dato de tres letras o menos —"S/N", un "1", un "AR"— aparece por todos
   * lados en cualquier contrato. Tratarlo como la identidad de alguien frenaría
   * la aplicación por un texto que no es el dato de nadie. Es el mismo largo
   * que ya usan la confirmación y la versión nueva.
   */
  it("los datos muy cortos no cuentan como identidad de nadie", () => {
    const corto = { advisorId: "x", nombre: "X", valores: { PISO: "a".repeat(LARGO_DE_DATO_SOSPECHOSO) } }
    expect(valoresExclusivosDeOtros([corto], {})).toEqual([])
  })

  it("sin otros asesores, no hay nada ajeno", () => {
    expect(valoresExclusivosDeOtros([], { CUIT: "20-1-1" })).toEqual([])
  })
})

describe("datosDeOtroQueSeColaron", () => {
  const ajeno = { asesor: "Ana Ruiz", campo: "CUIT", valor: "27-31456789-4" }

  it("lo agarra cuando aparece en el generado y NO estaba en su original", () => {
    const salida = datosDeOtroQueSeColaron({
      exclusivosDeOtros: [ajeno],
      partesDelGenerado: { [NOTAS]: "Legajo de referencia: 27-31456789-4." },
      partesDeSuOriginal: { [CUERPO]: "Contrato viejo de Bruno." },
    })
    expect(salida).toHaveLength(1)
    expect(salida[0].lugares[0]).toContain("27-31456789-4")
  })

  /**
   * La segunda condición, y la que saca el ruido: si ese texto YA estaba en su
   * documento viejo, es una frase del contrato y no un dato que se le coló
   * ahora. Sin esto, un año o el nombre de un barrio que la inmobiliaria nombra
   * en una cláusula fija frenaría la aplicación de TODOS.
   */
  it("si ya estaba en su documento viejo, es texto del contrato y no frena", () => {
    expect(
      datosDeOtroQueSeColaron({
        exclusivosDeOtros: [ajeno],
        partesDelGenerado: { [CUERPO]: "referencia 27-31456789-4" },
        partesDeSuOriginal: { [CUERPO]: "referencia 27-31456789-4" },
      }),
    ).toEqual([])
  })

  it("si no aparece en el generado, no hay nada que decir", () => {
    expect(
      datosDeOtroQueSeColaron({
        exclusivosDeOtros: [ajeno],
        partesDelGenerado: { [CUERPO]: "Contrato de Bruno" },
        partesDeSuOriginal: { [CUERPO]: "Contrato de Bruno" },
      }),
    ).toEqual([])
  })

  /** La misma regla de borde de palabra del resto de la etapa: un CUIT adentro de otro más largo no cuenta. */
  it("no lo encuentra adentro de un número más largo", () => {
    expect(
      datosDeOtroQueSeColaron({
        exclusivosDeOtros: [{ asesor: "Ana", campo: "LEGAJO", valor: "12345" }],
        partesDelGenerado: { [CUERPO]: "expediente 9912345678" },
        partesDeSuOriginal: {},
      }),
    ).toEqual([])
  })

  it("el aviso nombra al dueño del dato, el lugar, y dice que no se tocó nada", () => {
    const texto = avisoDeDatosDeOtro(
      [{ ...ajeno, lugares: ["…Legajo: «27-31456789-4»."] }],
      "Bruno Sanguinetti",
    )!
    expect(texto).toContain("Ana Ruiz")
    expect(texto).toContain("Bruno Sanguinetti")
    expect(texto).toContain("no se tocó")
  })

  it("sin nada colado, devuelve null", () => {
    expect(avisoDeDatosDeOtro([], "Bruno")).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 3. QUE NO QUEDE UN HUECO SIN RELLENAR
// ---------------------------------------------------------------------------

describe("avisoDeHuecosSinRellenar", () => {
  it("nombra el hueco tal como se ve en el contrato", () => {
    const texto = avisoDeHuecosSinRellenar(["ZONA"], "Bruno")!
    expect(texto).toContain(hueco("ZONA"))
    expect(texto).toContain("Bruno")
    expect(texto).toContain("no se tocó")
  })

  it("con varios habla en plural y dice cuántos", () => {
    expect(avisoDeHuecosSinRellenar(["ZONA", "CUIT"], "Bruno")).toContain("2 lugares")
  })

  it("sin ninguno, devuelve null", () => {
    expect(avisoDeHuecosSinRellenar([], "Bruno")).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 5. EL HUECO MAL ESCRITO: EL AGUJERO SILENCIOSO
// ---------------------------------------------------------------------------

/**
 * La medición de por qué esto existe está en `lib/plantillas/docx.test.ts`, que
 * corre docxtemplater de verdad y comprueba que un `{{ZONA-2}}` sale como un
 * BLANCO. Acá se cuida lo otro: que el mensaje sirva para arreglarlo.
 */
describe("avisoDeHuecosMalEscritos", () => {
  it("nombra el hueco como está escrito, dice que saldría en blanco y muestra la forma buena", () => {
    const texto = avisoDeHuecosMalEscritos(["{{ZONA-2}}"], "Bruno Sanguinetti")!
    expect(texto).toContain("Bruno Sanguinetti")
    expect(texto).toContain("{{ZONA-2}}")
    expect(texto).toContain("EN BLANCO")
    expect(texto).toContain("{{ZONA_2}}")
    expect(texto).toContain("letras, números y guión bajo")
    expect(texto).toContain("no se tocó")
  })

  it("con varios habla en plural y los nombra a todos", () => {
    const texto = avisoDeHuecosMalEscritos(["{{ZONA-2}}", "{{ }}"], "Bruno")!
    expect(texto).toContain("2 campos")
    expect(texto).toContain("{{ZONA-2}}")
    expect(texto).toContain("{{ }}")
  })

  it("sin ninguno, devuelve null", () => {
    expect(avisoDeHuecosMalEscritos([], "Bruno")).toBeNull()
  })
})

describe("sugerenciaDeHueco", () => {
  it.each([
    ["{{ZONA-2}}", "{{ZONA_2}}"],
    ["{{ZONA.2}}", "{{ZONA_2}}"],
    ["{{ dos palabras }}", "{{dos_palabras}}"],
    ["{{$ZONA}}", "{{ZONA}}"],
    ["{{ZONA_2}}", "{{ZONA_2}}"],
  ])("de %s propone %s", (malo, bueno) => {
    expect(sugerenciaDeHueco(malo)).toBe(bueno)
  })

  /**
   * Con el hueco vacío no hay nada que proponer, y devolver `{{}}` no ayudaría a
   * nadie: se muestra un ejemplo cualquiera para que el director vea la FORMA.
   */
  it.each(["{{}}", "{{ }}", "{{---}}"])("de %s, que no deja nada, propone un ejemplo", (vacio) => {
    expect(sugerenciaDeHueco(vacio)).toBe("{{COMISION}}")
  })

  /**
   * La sugerencia es una sugerencia: el sistema NO reescribe el contrato de
   * nadie. Es la misma decisión que ya tomó `normalizarHuecosEscritosAMano`.
   */
  it("siempre propone algo que pasa el alfabeto", () => {
    for (const malo of ["{{ZONA-2}}", "{{ZONA.2}}", "{{ dos palabras }}", "{{}}", "{{ZÓNA}}"]) {
      expect(sugerenciaDeHueco(malo)).toMatch(/^\{\{[A-Za-z0-9_]+\}\}$/)
    }
  })
})

describe("avisoDeHuecoMalEscritoAlSubir", () => {
  /**
   * El mismo hallazgo, dicho al SUBIR. Cambia el tiempo verbal y el remedio,
   * no el diagnóstico: al subir no hay ningún documento de nadie en juego, así
   * que decir "su documento no se tocó" sería hablar de algo que no existe.
   */
  it("habla del contrato de TODOS y no del de una persona", () => {
    const texto = avisoDeHuecoMalEscritoAlSubir(["{{ZONA-2}}"])!
    expect(texto).toContain("{{ZONA-2}}")
    expect(texto).toContain("EN BLANCO")
    expect(texto).toContain("todos los asesores")
    expect(texto).toContain("{{ZONA_2}}")
    expect(texto).toContain("volvé a subir")
    expect(texto).not.toContain("no se tocó")
  })

  it("con varios, concuerda el renglón", () => {
    expect(avisoDeHuecoMalEscritoAlSubir(["{{A-1}}", "{{B-2}}"])).toContain("Estos 2 campos")
  })

  it("sin ninguno, devuelve null", () => {
    expect(avisoDeHuecoMalEscritoAlSubir([])).toBeNull()
  })

  /**
   * Los dos mensajes salen de la MISMA detección y de la MISMA sugerencia: si
   * alguien escribiera uno aparte, el día que cambie el alfabeto uno de los dos
   * quedaría mintiendo.
   */
  it("los dos mensajes proponen exactamente la misma corrección", () => {
    for (const malo of ["{{ZONA-2}}", "{{ dos palabras }}", "{{}}"]) {
      const bueno = sugerenciaDeHueco(malo)
      expect(avisoDeHuecosMalEscritos([malo], "Bruno")).toContain(bueno)
      expect(avisoDeHuecoMalEscritoAlSubir([malo])).toContain(bueno)
    }
  })
})

// ---------------------------------------------------------------------------
// 4. LA CUENTA CRUZADA, ACÁ COMO FRENO
// ---------------------------------------------------------------------------

describe("avisoDeTextoFijoQueFrena", () => {
  const sospecha = {
    campo: "ZONA",
    vecesEnElMolde: 2,
    vecesEnElOtro: 1,
    otroAsesor: "Ana Ruiz",
    lugares: ["…nuestra oficina de «Belgrano»…"],
  }

  it("dice el campo, las dos cuentas, el lugar y que no se generó nada", () => {
    const texto = avisoDeTextoFijoQueFrena([sospecha], "Bruno Sanguinetti")!
    expect(texto).toContain("No se le generó el documento a Bruno Sanguinetti")
    expect(texto).toContain("ZONA")
    expect(texto).toContain("Ana Ruiz")
    expect(texto).toContain("sobra 1 aparición")
    expect(texto).toContain("nuestra oficina")
    expect(texto).toContain("no se tocó")
  })

  it("sin sospechas, devuelve null", () => {
    expect(avisoDeTextoFijoQueFrena([], "Bruno")).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Las cuatro juntas
// ---------------------------------------------------------------------------

describe("frenosDeLaGeneracion", () => {
  const base = {
    nombre: "Bruno Sanguinetti",
    huecosDelMolde: { NOMBRE: 1, ZONA: 1 },
    datos: { NOMBRE: "Bruno Sanguinetti", ZONA: "Belgrano" },
    partesDelGenerado: { [CUERPO]: "Bruno Sanguinetti, zona Belgrano." },
    partesDeSuOriginal: { [CUERPO]: "Bruno Sanguinetti, zona Belgrano." },
    huecosQueQuedaron: [] as string[],
    malEscritosEnElMolde: [] as string[],
    exclusivosDeOtros: [],
    sospechasDeTextoFijo: [],
  }

  it("con todo bien, la lista viene vacía — que es lo único que habilita a escribir", () => {
    expect(frenosDeLaGeneracion(base)).toEqual([])
  })

  it("el hueco mal escrito del molde aporta el suyo, y va primero", () => {
    const frenos = frenosDeLaGeneracion({ ...base, malEscritosEnElMolde: ["{{ZONA-2}}"], huecosQueQuedaron: ["CUIT"] })
    expect(frenos.map((f) => f.codigo)).toEqual(["hueco-mal-escrito", "hueco-sin-rellenar"])
  })

  it("cada comprobación aporta su propio código", () => {
    expect(frenosDeLaGeneracion({ ...base, partesDelGenerado: { [CUERPO]: "Bruno Sanguinetti." } })[0].codigo).toBe(
      "no-aterrizo",
    )
    expect(
      frenosDeLaGeneracion({
        ...base,
        exclusivosDeOtros: [{ asesor: "Ana", campo: "CUIT", valor: "27-31456789-4" }],
        partesDelGenerado: { [CUERPO]: "Bruno Sanguinetti, zona Belgrano, ref 27-31456789-4." },
      })[0].codigo,
    ).toBe("dato-ajeno")
    expect(frenosDeLaGeneracion({ ...base, huecosQueQuedaron: ["CUIT"] })[0].codigo).toBe("hueco-sin-rellenar")
    expect(
      frenosDeLaGeneracion({
        ...base,
        sospechasDeTextoFijo: [
          { campo: "ZONA", vecesEnElMolde: 2, vecesEnElOtro: 1, otroAsesor: "Ana", lugares: [] },
        ],
      })[0].codigo,
    ).toBe("texto-fijo")
  })

  /**
   * No corta en la primera: si el molde tiene dos problemas, el director los
   * arregla los dos de una y no descubre el segundo recién después de volver a
   * subir el archivo.
   */
  it("con dos problemas juntos, devuelve los dos", () => {
    const frenos = frenosDeLaGeneracion({
      ...base,
      partesDelGenerado: { [CUERPO]: "Bruno Sanguinetti." },
      huecosQueQuedaron: ["ZONA"],
    })
    expect(frenos.map((f) => f.codigo)).toEqual(["no-aterrizo", "hueco-sin-rellenar"])
  })
})

describe("resumenDeLaGeneracion", () => {
  it("dice quién y con qué versión", () => {
    expect(resumenDeLaGeneracion({ nombre: "Bruno Sanguinetti", version: 2 })).toContain("Bruno Sanguinetti")
    expect(resumenDeLaGeneracion({ nombre: "Bruno Sanguinetti", version: 2 })).toContain("versión 2")
  })
})

// ---------------------------------------------------------------------------
// Poner la versión en uso
// ---------------------------------------------------------------------------

describe("faltanAsesoresParaActivar", () => {
  it("sin nadie atrás, deja pasar", () => {
    expect(faltanAsesoresParaActivar([])).toBeNull()
  })

  it("con uno atrás, se niega y lo nombra", () => {
    const texto = faltanAsesoresParaActivar(["Bruno Sanguinetti"])!
    expect(texto).toContain("Bruno Sanguinetti")
    expect(texto).toContain("queda 1 asesor activo")
  })

  it("con varios, concuerda el renglón entero", () => {
    const texto = faltanAsesoresParaActivar(["Bruno", "Carla"])!
    expect(texto).toContain("quedan 2 asesores activos")
    expect(texto).toContain("a esas personas")
  })

  /**
   * El motivo tiene que estar escrito, no solo la negativa: es la única forma
   * de que el director entienda por qué la pantalla mentiría si se activara
   * igual.
   */
  it("dice por qué la pantalla mentiría", () => {
    expect(faltanAsesoresParaActivar(["Bruno"])).toContain("su contrato sigue siendo el viejo")
  })
})
