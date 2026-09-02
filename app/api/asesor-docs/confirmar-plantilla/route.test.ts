import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest"
import { AsyncLocalStorage } from "node:async_hooks"
import PizZip from "pizzip"

/**
 * EL ENDPOINT, CON RED.
 *
 * Por qué existe este archivo: la regla que no se puede romper —si aunque sea
 * UN asesor queda en rojo, la plantilla NO pasa a `activa`— está decidida en
 * una función pura con sus tests, pero **el único lugar donde de verdad se
 * aplica es acá**. Y `vitest.config.ts` miraba solo `lib/**`: dar vuelta esa
 * línea en `route.ts` no ponía ni un test en rojo de los 710. Medido con
 * mutaciones. Lo único que sostenía la regla era haberla probado a mano.
 *
 * Nada de esto toca red ni Supabase: el cliente de base es falso y los .docx se
 * arman en memoria.
 */

// ---------------------------------------------------------------------------
// La sesión y el cliente de base, falsos
// ---------------------------------------------------------------------------

const AGENCIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const OTRA_AGENCIA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const DIRECTOR = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
const TIPO = "44444444-4444-4444-8444-444444444444"

const ANA = "11111111-1111-4111-8111-111111111111"
const BRUNO = "22222222-2222-4222-8222-222222222222"
const CARO = "33333333-3333-4333-8333-333333333333"

const sesion = { agencyId: AGENCIA, userId: DIRECTOR, role: "director" as string | null }
const fallaLaSesion = { valor: false }

vi.mock("@/lib/auth/tenant-validation", () => ({
  requireTenant: async () => {
    if (fallaLaSesion.valor) throw new Error("Unauthorized")
    return sesion
  },
}))

/** Lo que la base "tiene" y lo que se le escribió, en memoria. */
type Base = {
  tipos: Array<Record<string, unknown>>
  documentos: Array<Record<string, unknown>>
  perfiles: Array<Record<string, unknown>>
  versiones: Array<Record<string, unknown>>
  archivos: Map<string, Buffer>
  /** Cada escritura y cada filtro, para poder mirarlos en los tests. */
  escrituras: Array<{ tabla: string; tipo: string; datos?: Record<string, unknown>; filtros: Record<string, unknown> }>
  lecturas: Array<{ tabla: string; filtros: Record<string, unknown> }>
  /** Para forzar fallos: nombre de tabla → qué operación tiene que fallar. */
  romper: Record<string, string | undefined>
  /**
   * Se llama justo después de cada bajada de Storage.
   *
   * Existe para poder meter mano MIENTRAS el pedido corre, que es la única
   * forma de probar una carrera: el director reemplazándole el .docx a un
   * asesor entre la comparación y el guardado.
   */
  alBajar?: (ruta: string) => void
}

let base: Base

/**
 * CADA PEDIDO CON SU BASE, y por qué esto no es una elegancia.
 *
 * Este archivo fallaba ~1 de cada 5 corridas completas con un `expected 409 to
 * be 200`, y producía falsos ROJOS — el peor tipo, porque enseña a descartar
 * los rojos de este archivo.
 *
 * La cadena, reproducida con `--testTimeout=500`: vitest **no cancela el cuerpo
 * de un test que expira**. El primer test paga el `import("./route")` con toda
 * su librería de Word encima, se pasa del tiempo, y su petición sigue viva. El
 * `beforeEach` del siguiente reemplaza `base` por una recién armada, la
 * petición fugada llega tarde a `createClient()`, agarra la base NUEVA, y su
 * `INSERT` de versión choca contra el índice único con el test siguiente. El
 * 409 se lo come un test que no tenía nada que ver.
 *
 * Pasar la base por parámetro no alcanza: la petición fugada podía estar
 * todavía ANTES de `createClient()` cuando el test siguiente arrancaba. Lo que
 * sí alcanza es atarla al contexto asincrónico del pedido: `pedir` captura la
 * base ANTES de cualquier `await` y corre el endpoint adentro de ese contexto,
 * que viaja solo por todos los `await` de la ruta. Una petición fugada escribe
 * en su propia base, que ya no mira nadie.
 */
const baseDelPedido = new AsyncLocalStorage<Base>()

const clienteFalso = (base: Base) => {
  const consulta = (tabla: string, tipo: string, datos?: Record<string, unknown>) => {
    const filtros: Record<string, unknown> = {}
    let cuantos: number | null = null

    const filas = () => {
      if (tabla === "advisor_doc_templates") return base.tipos
      if (tabla === "advisor_documents") return base.documentos
      if (tabla === "profiles") return base.perfiles
      if (tabla === "advisor_doc_template_versions") return base.versiones
      return []
    }

    const filtrar = () =>
      filas().filter((f) =>
        Object.entries(filtros).every(([k, v]) => (Array.isArray(v) ? v.includes(f[k]) : f[k] === v)),
      )

    const resolver = () => {
      if (base.romper[tabla] === tipo) return { data: null, error: { message: "roto a propósito", code: "XX000" } }

      if (tipo === "insert") {
        const fila: Record<string, unknown> = { id: `ver-${base.versiones.length + 1}`, ...datos }
        const choca = base.versiones.some(
          (v) => v.template_id === fila.template_id && v.version === fila.version,
        )
        if (choca) return { data: null, error: { message: "duplicada", code: "23505" } }
        base.versiones.push(fila)
        base.escrituras.push({ tabla, tipo, datos, filtros })
        return { data: fila, error: null }
      }

      if (tipo === "update" || tipo === "delete") {
        base.escrituras.push({ tabla, tipo, datos, filtros })
        const afectadas = filtrar()
        for (const f of afectadas) {
          if (tipo === "update") Object.assign(f, datos)
        }
        if (tipo === "delete") {
          const fuera = new Set(afectadas)
          base.versiones = base.versiones.filter((v) => !fuera.has(v))
        }
        /**
         * Las filas afectadas, como las devuelve PostgREST cuando se le
         * encadena `.select()` a un UPDATE. Antes acá iba `null`, y con eso
         * "no matcheó ninguna fila" quedaba indistinguible de "se escribió
         * bien" — que es exactamente lo que el endpoint tiene que poder
         * distinguir para no publicar una plantilla sobre un archivo que
         * cambió en el medio.
         */
        return { data: afectadas, error: null }
      }

      base.lecturas.push({ tabla, filtros })
      /**
       * COPIAS, no las filas de `base`.
       *
       * PostgREST devuelve JSON por la red: lo que lee el endpoint nunca es un
       * puntero vivo a lo que hay en la base. Devolviendo la fila misma, todo
       * lo que el endpoint leyó al principio del pedido cambiaba solo si algo
       * tocaba la base en el medio — y con eso la carrera del .docx que se
       * reemplaza durante la confirmación era imposible de probar acá, porque
       * el endpoint "veía" el archivo nuevo sin haberlo releído.
       */
      const encontradas = filtrar().map((f) => ({ ...f }))
      return { data: cuantos === null ? encontradas : encontradas.slice(0, cuantos), error: null }
    }

    const api: Record<string, unknown> = {
      eq: (col: string, val: unknown) => ((filtros[col] = val), api),
      in: (col: string, val: unknown[]) => ((filtros[col] = val), api),
      /**
       * OJO, TRAMPA CONOCIDA Y NO ARREGLADA: `order` es un no-op y `limit(1)`
       * se queda con el PRIMERO de la lista — o sea la versión más VIEJA, al
       * revés que producción, donde la ruta pide `.order("version", {
       * ascending: false }).limit(1)` para quedarse con la más nueva.
       *
       * Hoy no muerde porque ningún test confirma dos veces la misma plantilla
       * con éxito. El día que alguien escriba uno que confirme tres veces, la
       * segunda va a calcular `version = 1 + 1 = 2` sobre la versión vieja y se
       * va a comer un 409 que no tiene nada que ver con lo que está probando.
       * Si aparece ese test, esto se arregla primero.
       */
      order: () => api,
      limit: (n: number) => ((cuantos = n), api),
      select: () => api,
      single: () => {
        const r = resolver()
        return Promise.resolve(Array.isArray(r.data) ? { data: r.data[0] ?? null, error: r.error } : r)
      },
      maybeSingle: () => {
        const r = resolver()
        return Promise.resolve(Array.isArray(r.data) ? { data: r.data[0] ?? null, error: r.error } : r)
      },
      then: (ok: (v: unknown) => unknown, mal?: (e: unknown) => unknown) => Promise.resolve(resolver()).then(ok, mal),
    }
    return api
  }

  return {
    from: (tabla: string) => ({
      select: () => consulta(tabla, "select"),
      insert: (datos: Record<string, unknown>) => ({ select: () => consulta(tabla, "insert", datos) }),
      update: (datos: Record<string, unknown>) => consulta(tabla, "update", datos),
      delete: () => consulta(tabla, "delete"),
    }),
    storage: {
      from: () => ({
        download: async (ruta: string) => {
          const buf = base.archivos.get(ruta)
          if (!buf) return { data: null, error: { message: "no existe" } }
          base.alBajar?.(ruta)
          return { data: new Blob([new Uint8Array(buf)]), error: null }
        },
        upload: async (ruta: string, contenido: Buffer) => {
          if (base.romper.storage === "upload") return { error: { message: "no se pudo subir" } }
          base.archivos.set(ruta, contenido)
          base.escrituras.push({ tabla: "storage", tipo: "upload", filtros: { ruta } })
          return { error: null }
        },
      }),
    },
  }
}

vi.mock("@/lib/supabase/server", () => ({
  // El `?? base` es para cualquier cliente que se cree fuera de un `pedir`; hoy
  // no hay ninguno, pero fallar por un `undefined` sería un rojo sin sentido.
  createClient: () => clienteFalso(baseDelPedido.getStore() ?? base),
}))

// ---------------------------------------------------------------------------
// Tres contratos en memoria
// ---------------------------------------------------------------------------

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`

/** Un `<w:r>` por palabra y por espacio: así guarda Word de verdad. */
function parrafo(texto: string): string {
  const runs = texto
    .split(/(\s+)/)
    .filter((x) => x.length > 0)
    .map((x) => `<w:r w:rsidR="00A3F2B1"><w:t xml:space="preserve">${x}</w:t></w:r>`)
    .join("")
  return `<w:p w:rsidR="00B71C4D">${runs}</w:p>`
}

const BASE_TIPO = "application/vnd.openxmlformats-officedocument.wordprocessingml"

function docx(parrafos: string[], encabezado?: string, notaAlFinal?: string): PizZip {
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
  if (notaAlFinal !== undefined) {
    // Las notas al final NO se declaran en [Content_Types] como parte que
    // docxtemplater rellene: se leen igual, que es justo el punto.
    word.file(
      "endnotes.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:endnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:endnote w:id="1">${parrafo(notaAlFinal)}</w:endnote></w:endnotes>`,
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

const buffer = (zip: PizZip) => Buffer.from(zip.generate({ type: "nodebuffer" }))

type Persona = { id: string; nombre: string; cuit: string; zona: string; legajo?: string; notaAlFinal?: string }

const GENTE: Persona[] = [
  { id: ANA, nombre: "Ana Ruiz", cuit: "27-31456789-4", zona: "Villa Urquiza" },
  { id: BRUNO, nombre: "Bruno Sanguinetti Errazuriz", cuit: "20-28765432-1", zona: "Belgrano R" },
  { id: CARO, nombre: "Caro Pena", cuit: "20-33210987-6", zona: "Saavedra" },
]

const contratoDe = (p: Persona) =>
  docx(
    [
      parrafo("CONTRATO DE PARTNERSHIP COMERCIAL INMOBILIARIO"),
      parrafo(`Y por la otra parte ${p.nombre}, mayor de edad, CUIT ${p.cuit}, en adelante EL ASESOR.`),
      parrafo(`Se asigna a EL ASESOR la zona de ${p.zona}, con captacion preferente.`),
      parrafo(`Aclaracion de la firma de EL ASESOR: ${p.nombre}`),
    ],
    p.legajo,
    p.notaAlFinal,
  )

const rutaDe = (p: Persona) => `asesores/${AGENCIA}/${p.id}/plantillas/${p.id}.docx`

/** La propuesta tal como la manda la pantalla, ya revisada por el director. */
function propuestaDe(gente: Persona[], molde = ANA) {
  const campo = (nombre: string, saca: (p: Persona) => string) => ({
    id: `hueco-${nombre}`,
    nombre,
    contexto: "",
    valores: Object.fromEntries(gente.map((p) => [p.id, saca(p)])),
  })
  return {
    templateId: TIPO,
    moldeAdvisorId: molde,
    huecos: [campo("NOMBRE", (p) => p.nombre), campo("CUIT", (p) => p.cuit), campo("ZONA", (p) => p.zona)],
  }
}

const pedir = async (cuerpo: unknown) => {
  // ANTES del `await`: si el test expira acá en el medio, esta petición se
  // queda con la base de SU test y no con la del siguiente. Ver `baseDelPedido`.
  const miBase = base
  const { POST } = await import("./route")
  const res = await baseDelPedido.run(miBase, () =>
    POST(
      new Request("http://localhost/api/asesor-docs/confirmar-plantilla", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      }),
    ),
  )
  return { status: res.status, cuerpo: (await res.json()) as Record<string, unknown> }
}

/**
 * El módulo de la ruta se carga UNA vez, antes del primer test.
 *
 * Sin esto, el primer test paga el `import("./route")` entero —la ruta,
 * docxtemplater, la librería de comparación de textos— dentro de su propio
 * presupuesto de tiempo, y es siempre él el que expira cuando el presupuesto se
 * achica. Cargarlo acá no acelera nada: reparte el costo donde corresponde, en
 * vez de cobrárselo al que salga primero en la lista.
 */
/**
 * Importar la ruta arrastra docxtemplater, pizzip y mammoth. Con la cache de
 * vite fria eso puede pasar los 10 s que vitest da por defecto para un hook.
 *
 * El tope va ACA y no en `vitest.config.ts`: uno global alto taparia un cuelgue
 * futuro en cualquiera de los otros archivos, que hoy arrancan en milisegundos.
 * Un tope suelto solo donde el arranque es caro.
 *
 * No se pudo reproducir el timeout (borrando `node_modules/.vite` la suite paso
 * entera sin esto). Queda como precaucion, y se dice asi.
 */
beforeAll(async () => {
  await import("./route")
}, 60_000)

const tipoGuardado = () => base.tipos.find((t) => t.id === TIPO)!
const documentoDe = (id: string) => base.documentos.find((d) => d.advisor_id === id)!

function armarBase(gente: Persona[]) {
  base = {
    tipos: [{ id: TIPO, nombre: "Contrato Partnership", agency_id: AGENCIA, estado: "borrador", version_actual: null }],
    documentos: gente.map((p) => ({
      id: `doc-${p.id}`,
      advisor_id: p.id,
      agency_id: AGENCIA,
      template_id: TIPO,
      archivo_original_path: rutaDe(p),
      nombre_archivo: `${p.nombre}.docx`,
      created_at: p.id,
      estado: null,
      version_id: null,
      form_data: null,
    })),
    perfiles: gente.map((p) => ({ id: p.id, agency_id: AGENCIA, estado: "activo", full_name: p.nombre })),
    versiones: [],
    archivos: new Map(gente.map((p) => [rutaDe(p), buffer(contratoDe(p))])),
    escrituras: [],
    lecturas: [],
    romper: {},
  }
}

beforeEach(() => {
  sesion.agencyId = AGENCIA
  sesion.userId = DIRECTOR
  sesion.role = "director"
  fallaLaSesion.valor = false
  armarBase(GENTE)
})

// ---------------------------------------------------------------------------
// LA REGLA QUE NO SE PUEDE ROMPER
// ---------------------------------------------------------------------------

describe("la regla que no se puede romper, aplicada de verdad", () => {
  it("con los tres asesores en verde, la plantilla queda ACTIVA", async () => {
    const r = await pedir(propuestaDe(GENTE))
    expect(r.status).toBe(200)
    expect(r.cuerpo.estado).toBe("activa")
    expect(tipoGuardado().estado).toBe("activa")
    expect((r.cuerpo.resultados as Array<{ estado: string }>).every((x) => x.estado === "ok")).toBe(true)
  })

  it("con UN asesor en rojo, la versión se guarda pero la plantilla NO pasa a activa", async () => {
    /**
     * Se le saca el campo de la zona: el contrato de Bruno y el de Caro van a
     * salir con la zona de Ana. Es el caso del director que borra un campo que
     * sí era un dato de cada persona.
     */
    const propuesta = propuestaDe(GENTE)
    propuesta.huecos = propuesta.huecos.filter((h) => h.nombre !== "ZONA")

    const r = await pedir(propuesta)
    expect(r.status).toBe(200)

    // La versión SÍ se guarda: el trabajo del director no se tira.
    expect(base.versiones).toHaveLength(1)
    expect(r.cuerpo.version).toBe(1)

    // Y la plantilla NO se publica.
    expect(r.cuerpo.estado).toBe("borrador")
    expect(tipoGuardado().estado).toBe("borrador")
    expect(tipoGuardado().version_actual).toBe(base.versiones[0].id)

    const rojos = (r.cuerpo.resultados as Array<{ nombre: string; estado: string; observacion: string | null }>).filter(
      (x) => x.estado === "revisar",
    )
    expect(rojos).toHaveLength(2)
    for (const rojo of rojos) expect(rojo.observacion).toBeTruthy()
  })

  it("el UPDATE del tipo nunca escribe activa cuando hay alguien en rojo", async () => {
    /**
     * Mirado sobre la escritura misma y no sobre la respuesta: es la línea que
     * decide si una persona firma un contrato con los datos de otra.
     */
    const propuesta = propuestaDe(GENTE)
    propuesta.huecos = propuesta.huecos.filter((h) => h.nombre !== "ZONA")
    await pedir(propuesta)

    const update = base.escrituras.find((e) => e.tabla === "advisor_doc_templates" && e.tipo === "update")!
    expect(update.datos!.estado).toBe("borrador")
  })

  it("un guardado que falla pasa a ese asesor a rojo, aunque la comprobación diera bien", async () => {
    base.romper.advisor_documents = "update"
    const r = await pedir(propuestaDe(GENTE))

    expect(r.status).toBe(200)
    expect((r.cuerpo.resultados as Array<{ estado: string }>).every((x) => x.estado === "revisar")).toBe(true)
    expect(r.cuerpo.estado).toBe("borrador")
    expect(tipoGuardado().estado).toBe("borrador")
  })
})

// ---------------------------------------------------------------------------
// El .docx que cambia MIENTRAS se confirma
// ---------------------------------------------------------------------------

/**
 * La última vía por la que una plantilla llegaba a `activa` sin que alguien
 * comparara nada.
 *
 * El endpoint lee los documentos al empezar, baja el archivo de cada uno, lo
 * compara y recién al final escribe el veredicto. Si en el medio el director le
 * reemplaza el .docx a un asesor, el reemplazo deja las cuatro columnas en null
 * —"a este no lo comparó nadie", que es la verdad—, y este endpoint se las
 * volvía a llenar un segundo después con el veredicto del archivo VIEJO. Los
 * tres daban `ok` y la plantilla se publicaba.
 *
 * La carrera se mete con el gancho `alBajar`: es el único momento en que el
 * pedido está a mitad de camino.
 */
describe("el documento que se reemplaza en el medio de la confirmación", () => {
  /** Simula al director subiendo otro .docx para Bruno mientras esto corre. */
  const reemplazarleElDocxABrunoAlBajar = () => {
    const rutaNueva = `asesores/${AGENCIA}/${BRUNO}/plantillas/reemplazo.docx`
    base.archivos.set(rutaNueva, buffer(contratoDe({ ...GENTE[1], zona: "Nuñez" })))
    base.alBajar = (ruta) => {
      // Solo cuando ya se bajó el archivo VIEJO de Bruno: ahí es donde duele.
      if (ruta !== rutaDe(GENTE[1])) return
      base.alBajar = undefined
      const doc = documentoDe(BRUNO)
      // Lo mismo que escribe `camposDelReemplazo` en la pantalla del director.
      doc.archivo_original_path = rutaNueva
      doc.nombre_archivo = "reemplazo.docx"
      doc.version_id = null
      doc.form_data = null
      doc.estado = null
      doc.observacion = null
    }
    return rutaNueva
  }

  it("ese asesor va a rojo y la plantilla NO pasa a activa", async () => {
    reemplazarleElDocxABrunoAlBajar()

    const r = await pedir(propuestaDe(GENTE))
    expect(r.status).toBe(200)

    const resultados = r.cuerpo.resultados as Array<{ advisorId: string; estado: string; observacion: string | null }>
    const bruno = resultados.find((x) => x.advisorId === BRUNO)!
    expect(bruno.estado).toBe("revisar")
    expect(bruno.observacion).toBeTruthy()

    // Y con un solo rojo, la regla dura hace el resto.
    expect(r.cuerpo.estado).toBe("borrador")
    expect(tipoGuardado().estado).toBe("borrador")
  })

  it("no le pisa la constancia al archivo nuevo: sus cuatro columnas siguen en null", async () => {
    reemplazarleElDocxABrunoAlBajar()
    await pedir(propuestaDe(GENTE))

    /**
     * Esto es el corazón del asunto. Con las cuatro en null, la solapa cuenta a
     * Bruno en el balde de "sin comparar" y el director lo ve. Con el veredicto
     * del archivo viejo pegado encima, la fila diría `estado: 'ok'` contra la
     * versión vigente sobre un archivo que nadie miró.
     */
    const doc = documentoDe(BRUNO)
    expect(doc.version_id).toBe(null)
    expect(doc.form_data).toBe(null)
    expect(doc.estado).toBe(null)
    expect(doc.observacion).toBe(null)

    // Y los otros dos sí quedaron guardados: el arreglo no rompe el camino sano.
    expect(documentoDe(ANA).estado).toBe("ok")
    expect(documentoDe(CARO).estado).toBe("ok")
  })

  it("la observación le dice al director qué pasó y qué hacer, sin tecnicismos", async () => {
    reemplazarleElDocxABrunoAlBajar()
    const r = await pedir(propuestaDe(GENTE))

    const resultados = r.cuerpo.resultados as Array<{ advisorId: string; observacion: string | null }>
    const texto = resultados.find((x) => x.advisorId === BRUNO)!.observacion!
    expect(texto).toContain("reemplaz")
    expect(texto).toContain("Volvé a detectar la plantilla")
    // Nada de jerga de base de datos en algo que lee un dueño de inmobiliaria.
    expect(texto.toLowerCase()).not.toContain("update")
    expect(texto.toLowerCase()).not.toContain("null")
    expect(texto.toLowerCase()).not.toContain("fila")
  })

  it("el UPDATE de cada documento va acotado también por la ruta del archivo que se comparó", async () => {
    await pedir(propuestaDe(GENTE))
    const updates = base.escrituras.filter((e) => e.tabla === "advisor_documents" && e.tipo === "update")
    expect(updates).toHaveLength(3)
    for (const p of GENTE) {
      expect(updates.some((u) => u.filtros.archivo_original_path === rutaDe(p))).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// El falso verde del encabezado
// ---------------------------------------------------------------------------

describe("las partes que no son el cuerpo", () => {
  it("un legajo que vive SOLO en el encabezado deja a los demás en rojo", async () => {
    /**
     * La detección compara cuerpos, así que el legajo nunca es campo, y el
     * molde se lleva el de Ana literal. Comparando solo el cuerpo esto daba
     * VERDE y el contrato de Bruno salía con el legajo de Ana.
     */
    const conLegajo = GENTE.map((p, i) => ({ ...p, legajo: `Legajo interno ${8892 + i * 100}` }))
    armarBase(conLegajo)

    const r = await pedir(propuestaDe(conLegajo))
    expect(r.status).toBe(200)
    expect(r.cuerpo.estado).toBe("borrador")

    const resultados = r.cuerpo.resultados as Array<{ advisorId: string; estado: string; observacion: string | null }>
    expect(resultados.find((x) => x.advisorId === ANA)!.estado).toBe("ok")
    for (const otro of [BRUNO, CARO]) {
      const x = resultados.find((y) => y.advisorId === otro)!
      expect(x.estado).toBe("revisar")
      expect(x.observacion).toContain("encabezado")
    }
  })

  it("si el encabezado dice lo mismo en todos, no molesta", async () => {
    const igual = GENTE.map((p) => ({ ...p, legajo: "Contrato modelo 2026" }))
    armarBase(igual)
    const r = await pedir(propuestaDe(igual))
    expect(r.cuerpo.estado).toBe("activa")
  })
})

// ---------------------------------------------------------------------------
// Seguridad: la agencia y el rol salen de la sesión
// ---------------------------------------------------------------------------

describe("seguridad", () => {
  it("sin sesión: 401 y ni una escritura", async () => {
    fallaLaSesion.valor = true
    const r = await pedir(propuestaDe(GENTE))
    expect(r.status).toBe(401)
    expect(base.escrituras).toHaveLength(0)
  })

  it("un asesor NO puede confirmar: 403 y ni una escritura", async () => {
    sesion.role = "asesor"
    const r = await pedir(propuestaDe(GENTE))
    expect(r.status).toBe(403)
    expect(base.escrituras).toHaveLength(0)
    expect(base.versiones).toHaveLength(0)
  })

  it("un rol desconocido tampoco: solo el director", async () => {
    sesion.role = null
    expect((await pedir(propuestaDe(GENTE))).status).toBe(403)
    sesion.role = "cliente"
    expect((await pedir(propuestaDe(GENTE))).status).toBe(403)
    expect(base.escrituras).toHaveLength(0)
  })

  it("la plantilla se busca SIEMPRE filtrando por la agencia de la sesión", async () => {
    await pedir(propuestaDe(GENTE))
    const lectura = base.lecturas.find((l) => l.tabla === "advisor_doc_templates")!
    expect(lectura.filtros.agency_id).toBe(AGENCIA)
    expect(lectura.filtros.id).toBe(TIPO)
  })

  it("una plantilla de otra inmobiliaria no existe para este director", async () => {
    base.tipos[0].agency_id = OTRA_AGENCIA
    const r = await pedir(propuestaDe(GENTE))
    expect(r.status).toBe(404)
    expect(base.escrituras).toHaveLength(0)
  })

  it("el agency_id que llega en el cuerpo se ignora", async () => {
    /**
     * El agujero que se cerró en producción el 27-ago-2026: un dato de
     * autoridad que viaja desde el navegador.
     */
    const r = await pedir({ ...propuestaDe(GENTE), agencyId: OTRA_AGENCIA, agency_id: OTRA_AGENCIA, role: "asesor" })
    expect(r.status).toBe(200)
    const version = base.versiones[0]
    expect(version.agency_id).toBe(AGENCIA)
    expect(String(version.docx_path)).toContain(AGENCIA)
    expect(String(version.docx_path)).not.toContain(OTRA_AGENCIA)
  })

  it("los documentos también se leen con el agency_id de la sesión", async () => {
    await pedir(propuestaDe(GENTE))
    const lectura = base.lecturas.find((l) => l.tabla === "advisor_documents")!
    expect(lectura.filtros.agency_id).toBe(AGENCIA)
  })

  it("cada documento se actualiza acotado por id Y por agencia", async () => {
    await pedir(propuestaDe(GENTE))
    const updates = base.escrituras.filter((e) => e.tabla === "advisor_documents" && e.tipo === "update")
    expect(updates).toHaveLength(3)
    for (const u of updates) expect(u.filtros.agency_id).toBe(AGENCIA)
  })
})

// ---------------------------------------------------------------------------
// Los asesores que quedan afuera
// ---------------------------------------------------------------------------

describe("quiénes entran", () => {
  it("un asesor pausado no se comprueba y su documento NO se toca", async () => {
    base.perfiles.find((p) => p.id === CARO)!.estado = "pausado"
    const r = await pedir(propuestaDe(GENTE))

    const resultados = r.cuerpo.resultados as Array<{ advisorId: string }>
    expect(resultados.map((x) => x.advisorId)).not.toContain(CARO)
    expect(documentoDe(CARO).estado).toBeNull()
    expect(documentoDe(CARO).version_id).toBeNull()
    expect((r.cuerpo.advertencias as string[]).join(" ")).toContain("pausado")
  })

  it("un asesor que apareció DESPUÉS de la detección queda en rojo, no invisible", async () => {
    /**
     * Quiénes entran lo decide el servidor releyendo la base, no la lista que
     * manda la pantalla: entre detectar y confirmar alguien puede subir otro
     * documento.
     */
    const nuevo: Persona = { id: "99999999-9999-4999-8999-999999999999", nombre: "Nuevo", cuit: "20-1-1", zona: "X" }
    armarBase([...GENTE, nuevo])
    // La propuesta es la vieja: no tiene valores para el que llegó después.
    const r = await pedir(propuestaDe(GENTE))

    const suyo = (r.cuerpo.resultados as Array<{ advisorId: string; estado: string; observacion: string }>).find(
      (x) => x.advisorId === nuevo.id,
    )!
    expect(suyo.estado).toBe("revisar")
    expect(suyo.observacion).toContain("no entró en la comparación")
    expect(r.cuerpo.estado).toBe("borrador")
  })
})

// ---------------------------------------------------------------------------
// La versión
// ---------------------------------------------------------------------------

describe("la versión", () => {
  it("la primera es la 1 y va a la ruta que dice la spec", async () => {
    const r = await pedir(propuestaDe(GENTE))
    expect(r.cuerpo.version).toBe(1)
    expect(base.versiones[0].docx_path).toBe(`asesores/${AGENCIA}/_plantillas/${TIPO}/v1.docx`)
    expect(base.versiones[0].origen).toBe("detectada")
    expect(base.archivos.has(String(base.versiones[0].docx_path))).toBe(true)
  })

  it("la siguiente es la 2, y la anterior NO se borra", async () => {
    await pedir(propuestaDe(GENTE))
    const r = await pedir(propuestaDe(GENTE))
    expect(r.cuerpo.version).toBe(2)
    expect(base.versiones.map((v) => v.version)).toEqual([1, 2])
  })

  it("si la subida del molde falla, la fila de la versión se borra", async () => {
    base.romper.storage = "upload"
    const r = await pedir(propuestaDe(GENTE))
    expect(r.status).toBe(500)
    expect(base.versiones).toHaveLength(0)
    expect(tipoGuardado().estado).toBe("borrador")
    expect(tipoGuardado().version_actual).toBeNull()
  })

  it("el molde guardado ya no dice el nombre del asesor que hizo de molde", async () => {
    const { textoPorParte } = await import("@/lib/plantillas/docx")
    await pedir(propuestaDe(GENTE))
    const molde = new PizZip(base.archivos.get(String(base.versiones[0].docx_path))!)
    const texto = Object.values(textoPorParte(molde)).join(" ")
    expect(texto).not.toContain("Ana Ruiz")
    expect(texto).not.toContain("27-31456789-4")
    expect(texto).toContain("{{NOMBRE}}")
    expect(texto).toContain("CONTRATO DE PARTNERSHIP COMERCIAL INMOBILIARIO")
  })
})

// ---------------------------------------------------------------------------
// El molde que no se puede rellenar
// ---------------------------------------------------------------------------

describe("el molde inservible", () => {
  it("un dato que se mete adentro del nombre de otro campo: 400, nada escrito, y se nombra al culpable", async () => {
    /**
     * `{{PLAZO_2026}}` con un campo cuyo dato es "2026": las llaves quedan
     * cruzadas y docxtemplater no puede abrir el archivo. Cuatro caracteres, o
     * sea que el aviso por largo (3) no lo ve — por eso el diagnóstico mira el
     * choque de verdad y no el largo.
     */
    const PLAZOS = ["treinta dias corridos", "cuarenta y cinco dias", "sesenta dias habiles"]
    armarBase(GENTE)
    base.archivos = new Map(
      GENTE.map((p, i) => [
        rutaDe(p),
        buffer(
          docx([
            parrafo(`Contrato de ${p.nombre}, vigente hasta ${2026 + i}.`),
            parrafo(`Plazo de preaviso: ${PLAZOS[i]}.`),
          ]),
        ),
      ]),
    )

    /**
     * El orden importa y es el que hace el daño: `ponerHuecosEnDocx` reemplaza
     * primero los textos largos, así que `{{PLAZO_2026}}` ya está adentro del
     * .docx cuando le toca al dato "2026", que lo encuentra ahí y lo pisa.
     */
    const r = await pedir({
      templateId: TIPO,
      moldeAdvisorId: ANA,
      huecos: [
        {
          id: "h1",
          nombre: "PLAZO_2026",
          contexto: "",
          valores: Object.fromEntries(GENTE.map((p, i) => [p.id, PLAZOS[i]])),
        },
        {
          id: "h2",
          nombre: "ANIO",
          contexto: "",
          valores: Object.fromEntries(GENTE.map((p, i) => [p.id, String(2026 + i)])),
        },
      ],
    })

    expect(r.status).toBe(400)
    expect(String(r.cuerpo.error)).toContain("ANIO")
    expect(String(r.cuerpo.error)).toContain("PLAZO_2026")
    expect(Array.isArray(r.cuerpo.advertencias)).toBe(true)

    // Y lo más importante: NO se guardó nada.
    expect(base.versiones).toHaveLength(0)
    expect(base.escrituras).toHaveLength(0)
    expect(tipoGuardado().estado).toBe("borrador")
  })
})

// ---------------------------------------------------------------------------
// Lo que se rechaza antes de mirar nada
// ---------------------------------------------------------------------------

describe("lo que se rechaza en la puerta", () => {
  it("un cuerpo que no es JSON", async () => {
    const { POST } = await import("./route")
    const res = await POST(
      new Request("http://localhost/x", { method: "POST", body: "esto no es json", headers: {} }),
    )
    expect(res.status).toBe(400)
    expect(base.escrituras).toHaveLength(0)
  })

  it("una propuesta sin campos", async () => {
    const r = await pedir({ templateId: TIPO, moldeAdvisorId: ANA, huecos: [] })
    expect(r.status).toBe(400)
    expect(base.escrituras).toHaveLength(0)
  })

  it("un molde que no tiene documento en esta plantilla", async () => {
    const r = await pedir(propuestaDe(GENTE, "77777777-7777-4777-8777-777777777777"))
    expect(r.status).toBe(409)
    expect(base.escrituras).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Los campos que no se pudieron marcar, y las notas al final
// ---------------------------------------------------------------------------

describe("huecosNoColocados llega hasta la decisión final", () => {
  it("un campo que no se pudo marcar deja la plantilla en borrador aunque TODOS estén en verde", async () => {
    /**
     * La mitad de la regla que ningún test veía: mutar el cableado a
     * `estadoDeLaPlantilla({ resultados, huecosNoColocados: [] })` borraba esta
     * condición sin que nada parpadeara.
     *
     * El caso: un campo cuyo dato está VACÍO en todos. No hay texto que buscar,
     * así que el `{{HUECO}}` nunca entra en el .docx; y como no cambia nada,
     * los tres asesores verifican bien. Verde por todos lados y un campo que en
     * el formulario de la plantilla no va a hacer absolutamente nada.
     */
    const propuesta = propuestaDe(GENTE)
    propuesta.huecos.push({
      id: "hueco-VACIO",
      nombre: "ANEXO",
      contexto: "",
      valores: Object.fromEntries(GENTE.map((p) => [p.id, "   "])),
    })

    const r = await pedir(propuesta)
    expect(r.status).toBe(200)

    // Todos en verde...
    expect((r.cuerpo.resultados as Array<{ estado: string }>).every((x) => x.estado === "ok")).toBe(true)
    // ...y la plantilla NO se publica, por el campo sin marcar.
    expect(r.cuerpo.huecosNoColocados).toEqual(["ANEXO"])
    expect(r.cuerpo.estado).toBe("borrador")
    expect(tipoGuardado().estado).toBe("borrador")

    // Y el resumen dice el motivo de verdad, no "0 asesores no coinciden".
    expect(String(r.cuerpo.resumen)).toContain("ANEXO")
    expect(String(r.cuerpo.resumen)).not.toContain("0 asesores")
  })
})

describe("las notas al final", () => {
  it("una nota al final distinta por persona deja a los demás en rojo", async () => {
    /**
     * La sexta vía a `activa`: la plantilla no rellena las notas al final, así
     * que el molde se lleva la del asesor molde al documento de todos. Con la
     * comparación mirando solo lo que el molde rellena, esto daba verde y la
     * plantilla se publicaba con el legajo de otra persona.
     */
    const conNota = GENTE.map((p, i) => ({ ...p, notaAlFinal: `Legajo interno ${8892 + i * 100}` }))
    armarBase(conNota)

    const r = await pedir(propuestaDe(conNota))
    expect(r.status).toBe(200)
    expect(r.cuerpo.estado).toBe("borrador")

    const resultados = r.cuerpo.resultados as Array<{ advisorId: string; estado: string; observacion: string | null }>
    expect(resultados.find((x) => x.advisorId === ANA)!.estado).toBe("ok")
    for (const otro of [BRUNO, CARO]) {
      const x = resultados.find((y) => y.advisorId === otro)!
      expect(x.estado).toBe("revisar")
      expect(x.observacion).toContain("notas al final")
      // Y con la salida: se arregla en el Word, no en la pantalla.
      expect(x.observacion).toContain("volvé a detectar")
    }
  })

  it("cuando el molde tiene notas al final, se avisa con nombre propio", async () => {
    /**
     * El cartel prometía "te lo avisamos aparte" y no había ningún aviso en
     * ninguna parte. Este test mira que el aviso llegue de verdad en la
     * respuesta, que es lo único que el director ve.
     */
    const conNota = GENTE.map((p) => ({ ...p, notaAlFinal: "Ley 25.326 de Proteccion de Datos Personales." }))
    armarBase(conNota)

    const r = await pedir(propuestaDe(conNota))
    expect((r.cuerpo.advertencias as string[]).join(" ")).toContain("El contrato tiene notas al final")
  })

  it("sin notas al final NO se avisa de algo que no pasa", async () => {
    armarBase(GENTE)
    const r = await pedir(propuestaDe(GENTE))
    // Ojo: el cartel del límite TAMBIÉN nombra las notas al final. Lo que no
    // tiene que aparecer es el aviso propio.
    expect((r.cuerpo.advertencias as string[]).join(" ")).not.toContain("El contrato tiene notas al final")
  })

  it("si la nota al final dice lo mismo en todos, no molesta", async () => {
    const igual = GENTE.map((p) => ({ ...p, notaAlFinal: "Ley 25.326 de Protección de Datos Personales." }))
    armarBase(igual)
    expect((await pedir(propuestaDe(igual))).cuerpo.estado).toBe("activa")
  })

  it("un Enter de más en el documento de una persona NO la pone en rojo", async () => {
    /**
     * La regresión del "|||", vista desde el endpoint: el párrafo vacío es lo
     * más común que hay en un Word y la detección no puede convertirlo en
     * campo. Un rojo acá no tendría arreglo.
     */
    armarBase(GENTE)
    const bruno = GENTE.find((p) => p.id === BRUNO)!
    base.archivos.set(
      rutaDe(bruno),
      buffer(
        docx([
          parrafo("CONTRATO DE PARTNERSHIP COMERCIAL INMOBILIARIO"),
          `<w:p w:rsidR="00B71C4D"><w:pPr><w:spacing w:after="0"/></w:pPr></w:p>`,
          parrafo(`Y por la otra parte ${bruno.nombre}, mayor de edad, CUIT ${bruno.cuit}, en adelante EL ASESOR.`),
          parrafo(`Se asigna a EL ASESOR la zona de ${bruno.zona}, con captacion preferente.`),
          parrafo(`Aclaracion de la firma de EL ASESOR: ${bruno.nombre}`),
        ]),
      ),
    )

    const r = await pedir(propuestaDe(GENTE))
    const suyo = (r.cuerpo.resultados as Array<{ advisorId: string; estado: string; observacion: string }>).find(
      (x) => x.advisorId === BRUNO,
    )!
    expect(suyo.estado, suyo.observacion ?? "").toBe("ok")
    expect(r.cuerpo.estado).toBe("activa")
  })
})

// ---------------------------------------------------------------------------
// LA SÉPTIMA VÍA A ACTIVA: pausar y volver a confirmar
// ---------------------------------------------------------------------------

describe("el asesor que quedó sin comprobar", () => {
  it("pausar a quien quedó en rojo y volver a confirmar: la plantilla se publica y SE DICE", async () => {
    /**
     * El caso, que un director hace todas las semanas:
     *   1. se confirma y Caro queda en `revisar`;
     *   2. el director la pausa (hay un módulo entero para eso);
     *   3. se vuelve a confirmar: Caro queda afuera por spec §7.5, los otros
     *      dos dan verde y la plantilla pasa a `activa`;
     *   4. la fila de Caro sigue en `revisar` con el `version_id` viejo.
     *
     * Que se publique es correcto: dejar que un pausado congele la plantilla
     * para siempre sería peor. Lo que NO puede pasar es que se publique en
     * silencio — si mañana reactivan a Caro, su contrato saldría de un molde
     * que nunca se comparó contra su documento.
     */
    const propuesta = propuestaDe(GENTE)
    propuesta.huecos = propuesta.huecos.filter((h) => h.nombre !== "ZONA")
    const primera = await pedir(propuesta)
    expect(primera.cuerpo.estado).toBe("borrador")
    expect(documentoDe(CARO).estado).toBe("revisar")
    const versionVieja = documentoDe(CARO).version_id

    // 2. Se la pausa.
    base.perfiles.find((x) => x.id === CARO)!.estado = "pausado"

    // 3. Se vuelve a confirmar, ahora con el campo de la zona.
    const segunda = await pedir(propuestaDe(GENTE))

    expect(segunda.cuerpo.estado).toBe("activa")
    expect(tipoGuardado().estado).toBe("activa")

    // 4. La fila de Caro no se tocó: sigue en revisar y con la versión vieja.
    expect(documentoDe(CARO).estado).toBe("revisar")
    expect(documentoDe(CARO).version_id).toBe(versionVieja)
    expect(documentoDe(CARO).version_id).not.toBe(tipoGuardado().version_actual)

    // Y ACÁ ESTÁ LO QUE FALTABA: se dice, con nombre y apellido.
    expect(segunda.cuerpo.sinComprobar).toEqual(["Caro Pena"])
    expect((segunda.cuerpo.advertencias as string[]).join(" ")).toContain("NO se comprobó contra esta versión")
    expect(String(segunda.cuerpo.resumen)).toContain("no se comprobó")
  })

  it("el resumen de una corrida limpia NO habla de gente sin comprobar", async () => {
    const r = await pedir(propuestaDe(GENTE))
    expect(r.cuerpo.sinComprobar).toEqual([])
    expect(String(r.cuerpo.resumen)).not.toContain("no se comprobó")
    expect(String(r.cuerpo.resumen)).toContain("Listo")
  })

  it("dos asesores pausados salen los dos nombrados", async () => {
    base.perfiles.find((x) => x.id === BRUNO)!.estado = "pausado"
    base.perfiles.find((x) => x.id === CARO)!.estado = "eliminado"
    const r = await pedir(propuestaDe(GENTE))
    expect((r.cuerpo.sinComprobar as string[]).length).toBe(2)
    expect(String(r.cuerpo.resumen)).toContain("2 asesores")
  })
})

// ---------------------------------------------------------------------------
// P3: dos documentos del mismo asesor
// ---------------------------------------------------------------------------

describe("un asesor con dos documentos del mismo tipo", () => {
  it("se usa el primero, se avisa, y NO se le escribe estado al segundo", async () => {
    /**
     * En producción lo tapa el índice único (advisor_id, template_id), pero el
     * código no tenía defensa propia: armaba 4 resultados para 3 personas,
     * verificaba dos veces el mismo archivo y al otro le escribía un estado sin
     * haberlo mirado.
     */
    armarBase(GENTE)
    const ana = GENTE.find((p) => p.id === ANA)!
    base.documentos.push({
      id: "doc-duplicado",
      advisor_id: ANA,
      agency_id: AGENCIA,
      template_id: TIPO,
      archivo_original_path: rutaDe(ana),
      nombre_archivo: "duplicado.docx",
      created_at: "zzz",
      estado: null,
      version_id: null,
      form_data: null,
    })

    const r = await pedir(propuestaDe(GENTE))

    // Tres personas, tres resultados. No cuatro.
    expect((r.cuerpo.resultados as unknown[]).length).toBe(3)
    expect((r.cuerpo.advertencias as string[]).join(" ")).toContain("más de un documento de este tipo")

    // Y al duplicado no se le escribió nada.
    const duplicado = base.documentos.find((d) => d.id === "doc-duplicado")!
    expect(duplicado.estado).toBeNull()
    expect(duplicado.version_id).toBeNull()
  })
})
