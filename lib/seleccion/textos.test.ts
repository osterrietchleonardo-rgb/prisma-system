import { describe, it, expect } from "vitest"
import { fragmentosSeguros, menciones, sacarFragmentos } from "./textos"

/**
 * LIMPIAR LA DESCRIPCIÓN QUE VE EL CLIENTE.
 *
 * El 55% de los avisos de la red traen la matrícula o el corredor del colega adentro de la
 * descripción, y el 42% su nombre. Borrarlo automáticamente NO es confiable: medido sobre
 * 400 avisos, el nombre del publicador cae en el medio del texto en el 65% de los casos, y
 * hay uno donde "Goyena Bienes Raíces" matcheaba con "Av. Pedro Goyena 1600" — la CALLE de
 * la propiedad. Un limpiador automático le habría borrado la dirección al aviso.
 *
 * Por eso hay dos niveles y ninguno borra solo:
 *  - `fragmentosSeguros`: frases con matrícula/CUCICBA/corredor/martillero. El asesor las
 *    saca con un toque.
 *  - `menciones`: apariciones del nombre del publicador. SOLO se señalan, nunca entran en
 *    el sacado de un toque, justamente por el caso Goyena.
 */

describe("fragmentosSeguros", () => {
  it("encuentra la frase de la matrícula sin tocar el resto", () => {
    const t = "Hermoso depto en Caballito. Martillero responsable Ricardo Tiscornia CUCICBA 6020. Cerca del subte."
    expect(fragmentosSeguros(t)).toEqual(["Martillero responsable Ricardo Tiscornia CUCICBA 6020."])
  })

  it("encuentra el bloque pegado al final", () => {
    const t = "Excelente funcionalidad, ideal para inversión.\nFOLGER BUENOS NEGOCIOS INMOBILIARIOS CUCICBA 2213"
    expect(fragmentosSeguros(t)).toEqual(["FOLGER BUENOS NEGOCIOS INMOBILIARIOS CUCICBA 2213"])
  })

  it("encuentra el descargo de no ejercer el corretaje", () => {
    const t = "Valor de venta: USD 290.000. GRUPO MORADA no ejerce el corretaje inmobiliario. Consultá."
    expect(fragmentosSeguros(t)).toEqual(["GRUPO MORADA no ejerce el corretaje inmobiliario."])
  })

  it("encuentra la invitación a contactar al colega", () => {
    const t = "Depto luminoso al frente. Contactanos por WhatsApp para coordinar la visita."
    expect(fragmentosSeguros(t)).toEqual(["Contactanos por WhatsApp para coordinar la visita."])
  })

  /**
   * Encontrado mirando una ficha real, no midiendo: el aviso "LOCAL COMERCIAL GALERIA LAS
   * VEGAS" ARRANCA con los datos del colega, y la línea "Contacto: Guadalupe Cabrera" se
   * escapaba de todos los patrones. Es lo primero que leería el cliente.
   */
  it("encuentra la línea de contacto del colega", () => {
    const t = "Corredor Responsable: Silvia Vergara CPI 7783.\nContacto: Guadalupe Cabrera\nLOCAL COMERCIAL EN GALERÍA."
    expect(fragmentosSeguros(t)).toContain("Contacto: Guadalupe Cabrera")
  })

  it("NO confunde 'en contacto con la naturaleza' con un dato de contacto", () => {
    const t = "Casa en un entorno único, en contacto con la naturaleza y muy tranquila."
    expect(fragmentosSeguros(t)).toEqual([])
  })

  /**
   * La matrícula pegada al organismo, sin espacio. Se escapaba en el 0,6% de los avisos
   * (4 de 667): `\bcmcpsi\b` no matchea "CMCPSI5675" porque entre la "I" y el "5" no hay
   * borde de palabra.
   */
  it("encuentra la matrícula pegada al organismo, sin espacio", () => {
    const t = "Oficina a cargo de Jorge Becco, Bienes Raíces CMCPSI5675 Libro 9 Folio 45."
    expect(fragmentosSeguros(t)).toHaveLength(1)
    expect(sacarFragmentos(t, fragmentosSeguros(t))).toBe("")
  })

  it("una descripción limpia no devuelve nada", () => {
    const t = "Departamento de 2 ambientes, muy amplio, balcón corrido y mucha luz natural."
    expect(fragmentosSeguros(t)).toEqual([])
  })

  it("NO marca la calle aunque se llame como una inmobiliaria", () => {
    const t = "Ubicado en el piso 12 de la Av. Pedro Goyena 1600, encantador departamento de 2 ambientes."
    expect(fragmentosSeguros(t)).toEqual([])
  })
})

describe("sacarFragmentos", () => {
  it("saca solo las frases marcadas y deja el texto legible", () => {
    const t = "Hermoso depto en Caballito. Martillero responsable Ricardo Tiscornia CUCICBA 6020. Cerca del subte."
    expect(sacarFragmentos(t, fragmentosSeguros(t))).toBe("Hermoso depto en Caballito. Cerca del subte.")
  })

  it("aplicarlo dos veces da lo mismo que aplicarlo una", () => {
    const t = "Luminoso. CUCICBA Matrícula 3067. Cerca del tren."
    const unaVez = sacarFragmentos(t, fragmentosSeguros(t))
    const dosVeces = sacarFragmentos(unaVez, fragmentosSeguros(unaVez))
    expect(dosVeces).toBe(unaVez)
  })

  it("sin fragmentos devuelve el texto igual", () => {
    const t = "Departamento de 2 ambientes con balcón."
    expect(sacarFragmentos(t, [])).toBe(t)
  })

  it("no deja líneas vacías ni espacios de más", () => {
    const t = "Primera línea.\nCUCICBA Matrícula 1516\n\nÚltima línea."
    expect(sacarFragmentos(t, fragmentosSeguros(t))).toBe("Primera línea.\nÚltima línea.")
  })
})

describe("menciones al nombre del publicador", () => {
  it("señala el nombre cuando aparece", () => {
    const t = "Kinach, Gustavo Luis atiende la propiedad. Excelente ubicación."
    expect(menciones(t, "Kinach Propiedades")).toEqual(["Kinach"])
  })

  it("señala TAMBIÉN el caso de la calle, para que lo mire una persona", () => {
    // Es a propósito: la máquina no puede distinguir la calle del nombre de la
    // inmobiliaria, así que avisa y decide el asesor. Lo que NO hace es borrarlo.
    const t = "Ubicado en el piso 12 de la Av. Pedro Goyena 1600."
    expect(menciones(t, "Goyena Bienes Raíces")).toEqual(["Goyena"])
  })

  it("no señala nada si el nombre no aparece", () => {
    expect(menciones("Departamento con balcón al frente.", "Tiscornia Propiedades")).toEqual([])
  })

  it("ignora nombres demasiado cortos para ser distintivos", () => {
    expect(menciones("Casa con sum y parrilla.", "SUM SA")).toEqual([])
  })

  it("sin nombre de publicador no señala nada", () => {
    expect(menciones("Casa Kinach linda.", null)).toEqual([])
  })
})
