import { describe, it, expect } from "vitest"
import {
  avisoDeNotasAlFinal,
  camposConDatoCorto,
  camposQueChocanConOtroNombre,
  camposSchema,
  estadoDeLaPlantilla,
  comoQuedaEnElDocumento,
  fusionarHuecosIguales,
  LARGO_DE_DATO_SOSPECHOSO,
  moldeInservible,
  formDataDe,
  laPlantillaSePublica,
  leerPropuestaConfirmada,
  nombresFinales,
  reemplazosDelMolde,
  resumenDeLaConfirmacion,
  type HuecoParaGuardar,
  type ResultadoDeAsesor,
} from "./confirmacion"

const A = "11111111-1111-4111-8111-111111111111"
const B = "22222222-2222-4222-8222-222222222222"
const C = "33333333-3333-4333-8333-333333333333"
const TIPO = "44444444-4444-4444-8444-444444444444"

const hueco = (over: Partial<HuecoParaGuardar> = {}): HuecoParaGuardar => ({
  id: "hueco-0",
  nombre: "NOMBRE_COMPLETO",
  label: "Nombre completo",
  contexto: "Entre PRISMA y Juan Pérez, se acuerda",
  valores: { [A]: "Juan Pérez", [B]: "María González" },
  ...over,
})

const resultado = (over: Partial<ResultadoDeAsesor> = {}): ResultadoDeAsesor => ({
  advisorId: A,
  nombre: "Juan Pérez",
  estado: "ok",
  observacion: null,
  ...over,
})

// ---------------------------------------------------------------------------
// Los nombres de los campos
// ---------------------------------------------------------------------------

describe("nombresFinales", () => {
  it("deja pasar un nombre que ya está bien, sin decir nada", () => {
    const r = nombresFinales([{ nombre: "CUIT" }])
    expect(r.nombres).toEqual(["CUIT"])
    expect(r.advertencias).toEqual([])
  })

  it("sanea lo que el director escribe como persona y lo avisa", () => {
    const r = nombresFinales([{ nombre: "Comisión %" }])
    expect(r.nombres).toEqual(["COMISION"])
    expect(r.advertencias[0]).toContain("Comisión %")
    expect(r.advertencias[0]).toContain("COMISION")
  })

  it("un nombre vacío no queda vacío: sale como CAMPO_N y se avisa", () => {
    const r = nombresFinales([{ nombre: "   " }])
    expect(r.nombres).toEqual(["CAMPO_1"])
    expect(r.advertencias[0]).toContain("sin nombre")
  })

  it("dos campos con el mismo nombre NO se pisan", () => {
    /**
     * El fallo que esto ataja: el nombre es la llave del objeto que se le pasa
     * a docxtemplater. Con dos CUIT, el segundo pisa al primero y los dos
     * lugares del contrato salen con el mismo número.
     */
    const r = nombresFinales([{ nombre: "CUIT" }, { nombre: "CUIT" }])
    expect(r.nombres).toEqual(["CUIT", "CUIT_2"])
    expect(r.advertencias.join(" ")).toContain("dos campos llamados CUIT")
  })

  it("dos nombres distintos que se sanean al mismo también se separan", () => {
    // "Comisión %" y "comisión" dan los dos COMISION.
    const r = nombresFinales([{ nombre: "Comisión %" }, { nombre: "comisión" }])
    expect(r.nombres).toEqual(["COMISION", "COMISION_2"])
  })

  it("tres iguales dan tres nombres distintos", () => {
    expect(nombresFinales([{ nombre: "A" }, { nombre: "A" }, { nombre: "A" }]).nombres).toEqual(["A", "A_2", "A_3"])
  })
})

// ---------------------------------------------------------------------------
// Leer lo que manda la pantalla
// ---------------------------------------------------------------------------

describe("leerPropuestaConfirmada", () => {
  const bueno = {
    templateId: TIPO,
    moldeAdvisorId: A,
    huecos: [{ id: "hueco-0", nombre: "Nombre completo", contexto: "…", valores: { [A]: "Juan", [B]: "María" } }],
  }

  it("acepta una propuesta bien formada y devuelve los dos nombres", () => {
    const r = leerPropuestaConfirmada(bueno)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.propuesta.huecos[0].nombre).toBe("NOMBRE_COMPLETO")
    expect(r.propuesta.huecos[0].label).toBe("Nombre completo")
  })

  it("NO lee la inmobiliaria ni el rol, aunque se los manden", () => {
    /**
     * El agujero que se cerró el 27-ago-2026 en producción: un dato de
     * autoridad que viaja desde el navegador. Acá se comprueba que aunque
     * llegue, no salga del otro lado.
     */
    const r = leerPropuestaConfirmada({ ...bueno, agencyId: "otra", agency_id: "otra", role: "director" })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(JSON.stringify(r.propuesta)).not.toContain("otra")
    expect(Object.keys(r.propuesta).sort()).toEqual(["huecos", "moldeAdvisorId", "templateId"])
  })

  it("rechaza un cuerpo que no es un objeto", () => {
    expect(leerPropuestaConfirmada(null).ok).toBe(false)
    expect(leerPropuestaConfirmada("hola").ok).toBe(false)
    expect(leerPropuestaConfirmada([]).ok).toBe(false)
  })

  it("rechaza un templateId que no es un uuid", () => {
    expect(leerPropuestaConfirmada({ ...bueno, templateId: "1 OR 1=1" }).ok).toBe(false)
  })

  it("rechaza un molde que no es un uuid", () => {
    expect(leerPropuestaConfirmada({ ...bueno, moldeAdvisorId: "el primero" }).ok).toBe(false)
  })

  it("rechaza que no quede ningún campo, y explica qué hacer", () => {
    const r = leerPropuestaConfirmada({ ...bueno, huecos: [] })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toContain("volver a detectar")
  })

  it("rechaza dos campos con el mismo identificador", () => {
    const r = leerPropuestaConfirmada({ ...bueno, huecos: [bueno.huecos[0], { ...bueno.huecos[0] }] })
    expect(r.ok).toBe(false)
  })

  it("rechaza un id de asesor que no es un uuid", () => {
    const r = leerPropuestaConfirmada({
      ...bueno,
      huecos: [{ ...bueno.huecos[0], valores: { "no-soy-un-uuid": "x" } }],
    })
    expect(r.ok).toBe(false)
  })

  it("rechaza un valor que no es texto", () => {
    const r = leerPropuestaConfirmada({ ...bueno, huecos: [{ ...bueno.huecos[0], valores: { [A]: 42 } }] })
    expect(r.ok).toBe(false)
  })

  it("aguanta que falte el contexto: no es un dato que decida nada", () => {
    const r = leerPropuestaConfirmada({ ...bueno, huecos: [{ id: "h", nombre: "CUIT", valores: { [A]: "20-1-1" } }] })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.propuesta.huecos[0].contexto).toBe("")
  })

  it("desambigua los nombres repetidos que llegan de la pantalla", () => {
    const r = leerPropuestaConfirmada({
      ...bueno,
      huecos: [
        { id: "h1", nombre: "CUIT", valores: { [A]: "20-1-1" } },
        { id: "h2", nombre: "CUIT", valores: { [A]: "20-2-2" } },
      ],
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.propuesta.huecos.map((h) => h.nombre)).toEqual(["CUIT", "CUIT_2"])
    expect(r.advertencias.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// El mismo dato escrito dos veces
// ---------------------------------------------------------------------------

describe("fusionarHuecosIguales", () => {
  const nombreArriba = { id: "h1", nombre: "NOMBRE_1", contexto: "Entre PRISMA y …", valores: { [A]: "Juan", [B]: "María" } }
  const nombreEnLaFirma = { id: "h2", nombre: "NOMBRE_2", contexto: "Firma: …", valores: { [A]: "Juan", [B]: "María" } }

  it("junta el nombre de la cláusula con el de la firma", () => {
    /**
     * El caso más común de un contrato, y el que sin esto trababa la plantilla
     * entera: `ponerHuecosEnDocx` reemplaza TODAS las apariciones, así que el
     * primer campo se lleva los dos lugares y el segundo quedaría sin marcar.
     */
    const r = fusionarHuecosIguales([nombreArriba, nombreEnLaFirma])
    expect(r.huecos.map((h) => h.id)).toEqual(["h1"])
    expect(r.advertencias[0]).toContain("NOMBRE_2")
    expect(r.advertencias[0]).toContain("NOMBRE_1")
  })

  it("NO junta dos campos que difieren aunque sea en un asesor", () => {
    /**
     * Dos datos distintos que coinciden en el molde pero no en el resto. Juntarlos
     * escribiría el mismo texto en los dos lugares del contrato de María.
     */
    const otro = { ...nombreEnLaFirma, valores: { [A]: "Juan", [B]: "Ana" } }
    const r = fusionarHuecosIguales([nombreArriba, otro])
    expect(r.huecos.map((h) => h.id)).toEqual(["h1", "h2"])
    expect(r.advertencias).toEqual([])
  })

  it("NO junta dos campos que tienen distinta lista de asesores", () => {
    const soloUno = { ...nombreEnLaFirma, valores: { [A]: "Juan" } }
    expect(fusionarHuecosIguales([nombreArriba, soloUno]).huecos).toHaveLength(2)
  })

  it("los huecos sin ningún valor no se juntan entre sí", () => {
    const vacio1 = { id: "h1", nombre: "A", contexto: "", valores: {} }
    const vacio2 = { id: "h2", nombre: "B", contexto: "", valores: {} }
    expect(fusionarHuecosIguales([vacio1, vacio2]).huecos).toHaveLength(2)
  })

  it("junta tres apariciones del mismo dato en una sola", () => {
    const tercero = { ...nombreEnLaFirma, id: "h3", nombre: "NOMBRE_3" }
    const r = fusionarHuecosIguales([nombreArriba, nombreEnLaFirma, tercero])
    expect(r.huecos.map((h) => h.id)).toEqual(["h1"])
    expect(r.advertencias).toHaveLength(2)
  })

  it("desde leerPropuestaConfirmada, el campo repetido no se lleva un nombre", () => {
    const r = leerPropuestaConfirmada({ templateId: TIPO, moldeAdvisorId: A, huecos: [nombreArriba, nombreEnLaFirma] })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.propuesta.huecos.map((h) => h.nombre)).toEqual(["NOMBRE_1"])
  })
})

// ---------------------------------------------------------------------------
// Lo que se le pide a las primitivas de .docx
// ---------------------------------------------------------------------------

describe("reemplazosDelMolde", () => {
  it("arma un pedido por campo con el valor del asesor molde", () => {
    const r = reemplazosDelMolde([hueco()], A)
    expect(r.reemplazos).toEqual([
      { buscado: "Juan Pérez", hueco: "{{NOMBRE_COMPLETO}}", nombre: "NOMBRE_COMPLETO" },
    ])
    expect(r.sinValorEnElMolde).toEqual([])
  })

  it("saca los que el molde no tiene, y los nombra", () => {
    /**
     * Pasa de verdad: OTRO asesor tiene un texto que el del molde no tiene. Ahí
     * no hay nada que reemplazar. `ponerHuecosEnDocx` los devolvería como
     * "(vacío -- se ignoró)", que no le dice nada a nadie.
     */
    const r = reemplazosDelMolde([hueco({ nombre: "ANEXO", valores: { [A]: "  ", [B]: "Anexo I" } })], A)
    expect(r.reemplazos).toEqual([])
    expect(r.sinValorEnElMolde).toEqual(["ANEXO"])
  })

  it("un asesor molde que no figura en los valores cuenta como sin valor", () => {
    const r = reemplazosDelMolde([hueco()], C)
    expect(r.reemplazos).toEqual([])
    expect(r.sinValorEnElMolde).toEqual(["NOMBRE_COMPLETO"])
  })
})

describe("camposSchema", () => {
  it("guarda el nombre técnico, el rótulo y el orden", () => {
    expect(camposSchema([hueco(), hueco({ id: "hueco-1", nombre: "CUIT", label: "CUIT" })])).toEqual([
      { nombre: "NOMBRE_COMPLETO", label: "Nombre completo", orden: 0 },
      { nombre: "CUIT", label: "CUIT", orden: 1 },
    ])
  })
})

describe("formDataDe", () => {
  it("arma el objeto por nombre de campo", () => {
    expect(formDataDe([hueco()], B)).toEqual({ NOMBRE_COMPLETO: "María González" })
  })

  it("un asesor que no entró en la comparación devuelve null, no un objeto vacío", () => {
    /**
     * "No se comparó" y "se comparó y está todo vacío" son dos cosas distintas.
     * Confundirlas le armaría a esa persona un contrato con todos los datos en
     * blanco creyendo que está bien.
     */
    expect(formDataDe([hueco()], C)).toBeNull()
  })

  it("un campo que ese asesor no tiene queda como texto vacío, no como undefined", () => {
    const dos = [hueco(), hueco({ id: "hueco-1", nombre: "CUIT", valores: { [A]: "20-1-1" } })]
    expect(formDataDe(dos, B)).toEqual({ NOMBRE_COMPLETO: "María González", CUIT: "" })
  })
})

// ---------------------------------------------------------------------------
// Los datos demasiado cortos
// ---------------------------------------------------------------------------

describe("camposConDatoCorto", () => {
  it("un nombre y apellido no es corto", () => {
    expect(camposConDatoCorto([hueco()], A)).toEqual([])
  })

  it("marca el dato de un solo carácter", () => {
    /**
     * El caso medido: el "1" de "1 de marzo". Se reemplaza en TODAS las
     * apariciones —"una (1) instancia mensual" incluida— y encima se mete
     * adentro del {{CAMPO_1}} que ya se puso, y rompe el molde entero.
     */
    const dia = hueco({ nombre: "DIA_INICIO", valores: { [A]: "1", [B]: "15" } })
    expect(camposConDatoCorto([dia], A)).toEqual(["DIA_INICIO"])
  })

  it("marca los dos caracteres que quedan de una razón social", () => {
    // "S.A." contra "S.R.L." deja "A." — que también está en el "S.A." de la
    // inmobiliaria, en el mismo contrato.
    const forma = hueco({ nombre: "FORMA_SOCIETARIA", valores: { [A]: "A.", [B]: "R.L." } })
    expect(camposConDatoCorto([forma], A)).toEqual(["FORMA_SOCIETARIA"])
  })

  it("no marca uno que llega justo al límite", () => {
    const largo = "x".repeat(LARGO_DE_DATO_SOSPECHOSO + 1)
    expect(camposConDatoCorto([hueco({ valores: { [A]: largo } })], A)).toEqual([])
  })

  it("un campo vacío en el molde NO es un dato corto: es otro problema", () => {
    // Ese ya lo cuenta `reemplazosDelMolde` como sinValorEnElMolde.
    expect(camposConDatoCorto([hueco({ valores: { [A]: "  " } })], A)).toEqual([])
  })

  it("mira el valor DEL MOLDE, que es el texto que se busca en el .docx", () => {
    const h = hueco({ nombre: "CUIT", valores: { [A]: "20-11111111-1", [B]: "1" } })
    expect(camposConDatoCorto([h], A)).toEqual([])
    expect(camposConDatoCorto([h], B)).toEqual(["CUIT"])
  })
})

describe("camposQueChocanConOtroNombre", () => {
  it("encuentra el dato que se mete adentro del nombre de otro campo", () => {
    /**
     * LA CAUSA EXACTA de que el molde quede sin poder abrirse: el campo se
     * escribe {{PLAZO_2026}} y un dato "2026" lo encuentra ahí adentro, porque
     * ni el guión bajo ni las llaves son letras ni números. Queda
     * {{PLAZO_{{ANIO}}}} y docxtemplater ya no puede leer el archivo.
     */
    const huecos = [
      hueco({ id: "h1", nombre: "PLAZO_2026", valores: { [A]: "treinta días corridos" } }),
      hueco({ id: "h2", nombre: "ANIO", valores: { [A]: "2026" } }),
    ]
    expect(camposQueChocanConOtroNombre(huecos, A)).toEqual([{ campo: "ANIO", dentroDe: "PLAZO_2026" }])
  })

  it("cuatro caracteres: el aviso por largo NO lo ve, y esto sí", () => {
    // Por eso el diagnóstico no puede ser el largo del dato.
    const huecos = [
      hueco({ id: "h1", nombre: "PLAZO_2026", valores: { [A]: "treinta días corridos" } }),
      hueco({ id: "h2", nombre: "ANIO", valores: { [A]: "2026" } }),
    ]
    expect(camposConDatoCorto(huecos, A)).toEqual([])
    expect(camposQueChocanConOtroNombre(huecos, A)).toHaveLength(1)
  })

  it("el dato de un dígito choca con el CAMPO_1 de siempre", () => {
    const huecos = [
      hueco({ id: "h1", nombre: "CAMPO_1", valores: { [A]: "Juan Pérez" } }),
      hueco({ id: "h2", nombre: "DIA", valores: { [A]: "1" } }),
    ]
    expect(camposQueChocanConOtroNombre(huecos, A)).toEqual([{ campo: "DIA", dentroDe: "CAMPO_1" }])
  })

  it("no marca un dato que cae partiendo una palabra del nombre por la mitad", () => {
    // "OMB" está adentro de NOMBRE pero pegado a letras: ponerHuecosEnDocx
    // tampoco lo reemplazaría, así que no rompe nada.
    const huecos = [
      hueco({ id: "h1", nombre: "NOMBRE", valores: { [A]: "Juan Pérez" } }),
      hueco({ id: "h2", nombre: "OTRO", valores: { [A]: "OMB" } }),
    ]
    expect(camposQueChocanConOtroNombre(huecos, A)).toEqual([])
  })

  it("un dato normal no choca con nada", () => {
    expect(camposQueChocanConOtroNombre([hueco(), hueco({ id: "h2", nombre: "CUIT" })], A)).toEqual([])
  })

  it("un campo sin dato en el molde no choca: no hay texto que buscar", () => {
    const huecos = [
      hueco({ id: "h1", nombre: "PLAZO_2026", valores: { [A]: "treinta días" } }),
      hueco({ id: "h2", nombre: "ANIO", valores: { [A]: "  " } }),
    ]
    expect(camposQueChocanConOtroNombre(huecos, A)).toEqual([])
  })
})

describe("avisoDeNotasAlFinal", () => {
  it("no dice nada si no hay notas al final", () => {
    expect(avisoDeNotasAlFinal("")).toBeNull()
    expect(avisoDeNotasAlFinal("   \n  ")).toBeNull()
  })

  it("cuando las hay, explica por qué importan y qué hacer", () => {
    /**
     * El cartel prometía "te lo avisamos aparte" y no había ningún aviso en
     * ninguna parte. Este es el aviso.
     */
    const aviso = avisoDeNotasAlFinal("Legajo interno 8892")!
    expect(aviso).toContain("notas al final")
    expect(aviso).toContain("molde")
    expect(aviso).toContain("Word")
  })
})

describe("moldeInservible", () => {
  it("dice que no se guardó nada", () => {
    expect(moldeInservible({ choques: [], camposCortos: [] }).toLowerCase()).toContain("no se guardó nada")
  })

  it("cuando hay un choque, lo nombra con los DOS campos", () => {
    const texto = moldeInservible({ choques: [{ campo: "ANIO", dentroDe: "PLAZO_2026" }], camposCortos: [] })
    expect(texto).toContain("ANIO")
    expect(texto).toContain("PLAZO_2026")
    expect(texto).toContain("Volvé a detectar")
  })

  it("un campo que choca con muchos se nombra UNA vez, no una por choque", () => {
    /**
     * Medido en el navegador: un dato de un dígito choca con el nombre de los
     * ocho campos numerados, y el mensaje repetía ocho veces "FECHA_INICIO_DIA".
     * El director tiene que leer qué campo sacar, no contra cuántos choca.
     */
    const texto = moldeInservible({
      choques: ["A_1", "B_1", "C_1", "D_1"].map((dentroDe) => ({ campo: "DIA", dentroDe })),
      camposCortos: [],
    })
    expect(texto.match(/"DIA"/g)).toHaveLength(1)
    expect(texto).toContain("A_1")
    expect(texto).toContain("3 campos más")
  })

  it("con dos campos culpables se nombran los dos", () => {
    const texto = moldeInservible({
      choques: [
        { campo: "DIA", dentroDe: "PLAZO_1" },
        { campo: "ANIO", dentroDe: "PLAZO_2026" },
      ],
      camposCortos: [],
    })
    expect(texto).toContain("DIA")
    expect(texto).toContain("ANIO")
    expect(texto).toContain("Los campos que lo rompen son")
  })

  it("el choque manda sobre el aviso por largo: es el diagnóstico, no la sospecha", () => {
    const texto = moldeInservible({
      choques: [{ campo: "ANIO", dentroDe: "PLAZO_2026" }],
      camposCortos: ["OTRO_CORTO"],
    })
    expect(texto).toContain("ANIO")
    expect(texto).not.toContain("OTRO_CORTO")
  })

  it("sin choque, cae al aviso por largo", () => {
    const texto = moldeInservible({ choques: [], camposCortos: ["DIA_INICIO", "FORMA_SOCIETARIA"] })
    expect(texto).toContain("DIA_INICIO")
    expect(texto).toContain("FORMA_SOCIETARIA")
    expect(texto).toContain("Volvé a detectar")
  })

  it("sin nada que señalar, igual dice qué probar: no deja al director mudo", () => {
    const texto = moldeInservible({ choques: [], camposCortos: [] })
    expect(texto).toContain("pocas letras")
  })
})

describe("estadoDeLaPlantilla", () => {
  it("todo bien: activa", () => {
    expect(estadoDeLaPlantilla({ resultados: [resultado()], huecosNoColocados: [] })).toBe("activa")
  })

  it("uno en rojo: borrador", () => {
    expect(
      estadoDeLaPlantilla({
        resultados: [resultado(), resultado({ advisorId: B, estado: "revisar", observacion: "x" })],
        huecosNoColocados: [],
      }),
    ).toBe("borrador")
  })

  it("un campo sin marcar: borrador", () => {
    expect(estadoDeLaPlantilla({ resultados: [resultado()], huecosNoColocados: ["CUIT"] })).toBe("borrador")
  })

  it("nadie comprobado: borrador", () => {
    expect(estadoDeLaPlantilla({ resultados: [], huecosNoColocados: [] })).toBe("borrador")
  })
})

// ---------------------------------------------------------------------------
// LA REGLA QUE NO SE PUEDE ROMPER
// ---------------------------------------------------------------------------

describe("laPlantillaSePublica", () => {
  it("con los tres asesores en verde, se publica", () => {
    expect(
      laPlantillaSePublica({
        resultados: [resultado(), resultado({ advisorId: B }), resultado({ advisorId: C })],
        huecosNoColocados: [],
      }),
    ).toBe(true)
  })

  it("UN solo asesor en rojo la deja en borrador", () => {
    expect(
      laPlantillaSePublica({
        resultados: [
          resultado(),
          resultado({ advisorId: B }),
          resultado({ advisorId: C, estado: "revisar", observacion: "no coincide" }),
        ],
        huecosNoColocados: [],
      }),
    ).toBe(false)
  })

  it("un campo que no se pudo marcar la deja en borrador aunque estén todos en verde", () => {
    expect(
      laPlantillaSePublica({ resultados: [resultado(), resultado({ advisorId: B })], huecosNoColocados: ["CUIT"] }),
    ).toBe(false)
  })

  it("sin ningún asesor comprobado NO se publica", () => {
    // "No se encontró ningún problema" no es lo mismo que "está bien".
    expect(laPlantillaSePublica({ resultados: [], huecosNoColocados: [] })).toBe(false)
  })
})

describe("resumenDeLaConfirmacion", () => {
  it("cuando sale bien, lo dice con el número de versión", () => {
    const texto = resumenDeLaConfirmacion({
      resultados: [resultado(), resultado({ advisorId: B }), resultado({ advisorId: C })],
      huecosNoColocados: [],
      version: 1,
    })
    expect(texto).toContain("versión 1")
    expect(texto).toContain("activa")
    expect(texto).toContain("3")
  })

  it("cuando alguno está en rojo, dice cuántos Y la consecuencia", () => {
    const texto = resumenDeLaConfirmacion({
      resultados: [resultado(), resultado({ advisorId: B, estado: "revisar", observacion: "x" })],
      huecosNoColocados: [],
      version: 2,
    })
    expect(texto).toContain("1 asesor no coincide")
    expect(texto).toContain("borrador")
    expect(texto).toContain("no se usa con nadie")
  })

  it("todos en verde y un campo sin marcar: NO dice '0 asesores no coinciden'", () => {
    /**
     * Un número correcto con una explicación falsa es peor que no decir nada:
     * el director iría a buscar un asesor en rojo que no existe.
     */
    const texto = resumenDeLaConfirmacion({
      resultados: [resultado(), resultado({ advisorId: B })],
      huecosNoColocados: ["CUIT"],
      version: 1,
    })
    expect(texto).not.toContain("0 asesores")
    expect(texto).toContain("CUIT")
    expect(texto).toContain("borrador")
  })

  it("sin ningún asesor comprobado lo dice tal cual", () => {
    const texto = resumenDeLaConfirmacion({ resultados: [], huecosNoColocados: [], version: 1 })
    expect(texto).toContain("ningún asesor")
    expect(texto).toContain("borrador")
  })
})

describe("los resúmenes no prometen en presente algo que todavía no pasa", () => {
  /**
   * La misma familia de verbos que vigila `plantillas.test.ts`, y por el mismo
   * motivo: que PRISMA le arme solo el documento a cada asesor TODAVÍA NO PASA.
   * Esta tarea rellena la plantilla para COMPROBAR, en memoria, y no guarda
   * ningún documento generado — `advisor_documents` ni siquiera tiene la
   * columna donde guardarlo. El futuro y el condicional sí están permitidos.
   *
   * Se borra en el MISMO commit que haga andar la generación de verdad.
   */
  const PROMESA_EN_PRESENTE = /\b(?:re)?gener(?:a|an|amos|as|ás)\b/i

  it("ninguno de los cuatro resúmenes posibles la tiene", () => {
    const todos = [
      resumenDeLaConfirmacion({ resultados: [resultado()], huecosNoColocados: [], version: 1 }),
      resumenDeLaConfirmacion({
        resultados: [resultado({ estado: "revisar", observacion: "x" })],
        huecosNoColocados: [],
        version: 1,
      }),
      resumenDeLaConfirmacion({ resultados: [], huecosNoColocados: [], version: 1 }),
      resumenDeLaConfirmacion({ resultados: [resultado()], huecosNoColocados: ["CUIT"], version: 1 }),
    ]
    for (const t of todos) expect(t).not.toMatch(PROMESA_EN_PRESENTE)
  })
})

describe("los avisos de nombres tampoco la tienen", () => {
  const PROMESA_EN_PRESENTE = /\b(?:re)?gener(?:a|an|amos|as|ás)\b/i
  it("los de nombresFinales y los de la fusión", () => {
    const avisos = [
      ...nombresFinales([{ nombre: "Comisión %" }, { nombre: "Comisión %" }, { nombre: "" }]).advertencias,
      ...fusionarHuecosIguales([
        { id: "a", nombre: "N1", contexto: "", valores: { [A]: "x" } },
        { id: "b", nombre: "N2", contexto: "", valores: { [A]: "x" } },
      ]).advertencias,
    ]
    expect(avisos.length).toBeGreaterThan(0)
    for (const a of avisos) expect(a).not.toMatch(PROMESA_EN_PRESENTE)
  })
})
