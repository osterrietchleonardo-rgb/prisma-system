import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest"
import { AsyncLocalStorage } from "node:async_hooks"
import PizZip from "pizzip"

/**
 * EL ENDPOINT DE LA VERSIÓN NUEVA, CON RED.
 *
 * Lo que este archivo cuida, y que ninguna función pura puede cuidar sola:
 *
 *  · que este endpoint **NO aplique nada** — ni `version_actual`, ni una sola
 *    fila de `advisor_documents`. El spec §7.4.4 dice que el reemplazo ocurre
 *    recién con el OK explícito del director, y el único lugar donde eso se
 *    respeta o se rompe es acá;
 *  · que el `agency_id` de la sesión vaya como filtro en cada consulta;
 *  · que el número de versión salga de la MÁS NUEVA, y que un choque se
 *    devuelva como conflicto en vez de resolverse en silencio.
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

const sesion = { agencyId: AGENCIA, userId: DIRECTOR, role: "director" as string | null }
const fallaLaSesion = { valor: false }

vi.mock("@/lib/auth/tenant-validation", () => ({
  requireTenant: async () => {
    if (fallaLaSesion.valor) throw new Error("Unauthorized")
    return sesion
  },
}))

type Base = {
  tipos: Array<Record<string, unknown>>
  documentos: Array<Record<string, unknown>>
  perfiles: Array<Record<string, unknown>>
  versiones: Array<Record<string, unknown>>
  archivos: Map<string, Buffer>
  escrituras: Array<{ tabla: string; tipo: string; datos?: Record<string, unknown>; filtros: Record<string, unknown> }>
  lecturas: Array<{ tabla: string; filtros: Record<string, unknown> }>
  romper: Record<string, string | undefined>
  /**
   * Se llama justo DESPUÉS de cada lectura.
   *
   * Existe para poder meter mano MIENTRAS el pedido corre, que es la única forma
   * de probar una carrera de verdad: otro director guardando una versión entre
   * el SELECT del número máximo y el INSERT.
   */
  despuesDeLeer?: (tabla: string) => void
}

let base: Base

/** Cada pedido con SU base. El motivo largo está en `confirmar-plantilla/route.test.ts`. */
const baseDelPedido = new AsyncLocalStorage<Base>()

const clienteFalso = (base: Base) => {
  const consulta = (tabla: string, tipo: string, datos?: Record<string, unknown>) => {
    const filtros: Record<string, unknown> = {}
    let cuantos: number | null = null
    let orden: { col: string; asc: boolean } | null = null

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
        const choca = base.versiones.some((v) => v.template_id === fila.template_id && v.version === fila.version)
        if (choca) return { data: null, error: { message: "duplicada", code: "23505" } }
        base.versiones.push(fila)
        base.escrituras.push({ tabla, tipo, datos, filtros })
        return { data: fila, error: null }
      }

      if (tipo === "update" || tipo === "delete") {
        base.escrituras.push({ tabla, tipo, datos, filtros })
        const afectadas = filtrar()
        for (const f of afectadas) if (tipo === "update") Object.assign(f, datos)
        if (tipo === "delete") {
          const fuera = new Set(afectadas)
          base.versiones = base.versiones.filter((v) => !fuera.has(v))
        }
        return { data: afectadas, error: null }
      }

      base.lecturas.push({ tabla, filtros })
      /** COPIAS, no las filas de `base`: PostgREST devuelve JSON por la red. */
      const encontradas = filtrar().map((f) => ({ ...f }))
      base.despuesDeLeer?.(tabla)
      /**
       * `order` ORDENA DE VERDAD, y eso NO es una prolijidad heredada.
       *
       * El cliente falso de `confirmar-plantilla/route.test.ts` lo tiene como
       * no-op, con la trampa anotada al lado: `limit(1)` se queda con el
       * PRIMERO de la lista, o sea la versión más VIEJA, al revés que
       * producción. Este endpoint numera la versión nueva a partir de la última,
       * y hay un test que sube una versión sobre una plantilla que ya tiene tres.
       * Con el `order` de mentira ese test mediría 1 + 1 = 2 y "pasaría" fijando
       * una conducta que en producción no existe: un test que blinda la decisión
       * equivocada tan bien como la correcta.
       */
      if (orden) {
        const { col, asc } = orden
        encontradas.sort((a, b) => {
          const x = a[col] as number | string
          const y = b[col] as number | string
          if (x === y) return 0
          return (x < y ? -1 : 1) * (asc ? 1 : -1)
        })
      }
      return { data: cuantos === null ? encontradas : encontradas.slice(0, cuantos), error: null }
    }

    const api: Record<string, unknown> = {
      eq: (col: string, val: unknown) => ((filtros[col] = val), api),
      in: (col: string, val: unknown[]) => ((filtros[col] = val), api),
      order: (col: string, opciones?: { ascending?: boolean }) => (
        (orden = { col, asc: opciones?.ascending !== false }), api
      ),
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
  createClient: () => clienteFalso(baseDelPedido.getStore() ?? base),
}))

// ---------------------------------------------------------------------------
// Los .docx, en memoria
// ---------------------------------------------------------------------------

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
const BASE_TIPO = "application/vnd.openxmlformats-officedocument.wordprocessingml"

/** Un `<w:r>` por palabra y por espacio: así guarda Word de verdad. */
function parrafo(texto: string): string {
  const runs = texto
    .split(/(\s+)/)
    .filter((x) => x.length > 0)
    .map((x) => `<w:r w:rsidR="00A3F2B1"><w:t xml:space="preserve">${x}</w:t></w:r>`)
    .join("")
  return `<w:p w:rsidR="00B71C4D">${runs}</w:p>`
}

function docx(parrafos: string[], notaAlFinal?: string, encabezado?: string): PizZip {
  const zip = new PizZip()
  const word = zip.folder("word")!
  const overrides = [`<Override PartName="/word/document.xml" ContentType="${BASE_TIPO}.document.main+xml"/>`]
  if (encabezado !== undefined) {
    overrides.push(`<Override PartName="/word/header1.xml" ContentType="${BASE_TIPO}.header+xml"/>`)
    word.file(
      "header1.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${parrafo(encabezado)}</w:hdr>`,
    )
  }
  if (notaAlFinal !== undefined) {
    // Las notas al final NO se declaran como parte que docxtemplater rellene:
    // se LEEN igual, y ese es justo el punto de uno de los tests de abajo.
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

const DATOS_DE_ANA = {
  NOMBRE: "Ana Ruiz",
  CUIT: "27-31456789-4",
  ZONA: "Villa Urquiza",
}

/** La versión NUEVA del contrato, ya completada con los datos de Ana. */
const versionNuevaDeAna = (extra: string[] = [], notaAlFinal?: string, encabezado?: string) =>
  docx(
    [
      parrafo("CONTRATO DE PARTNERSHIP COMERCIAL INMOBILIARIO — EDICION 2027"),
      parrafo("Y por la otra parte Ana Ruiz, mayor de edad, CUIT 27-31456789-4, en adelante EL ASESOR."),
      parrafo("Se asigna a EL ASESOR la zona de Villa Urquiza, con captacion preferente y exclusiva."),
      parrafo("Aclaracion de la firma de EL ASESOR: Ana Ruiz"),
      ...extra.map(parrafo),
    ],
    notaAlFinal,
    encabezado,
  )

const SCHEMA_VIGENTE = [
  { nombre: "NOMBRE", label: "Nombre y apellido", orden: 0 },
  { nombre: "CUIT", label: "CUIT", orden: 1 },
  { nombre: "ZONA", label: "Zona asignada", orden: 2 },
]

function armarBase() {
  base = {
    tipos: [
      {
        id: TIPO,
        nombre: "Contrato Partnership",
        agency_id: AGENCIA,
        estado: "activa",
        version_actual: "ver-vieja",
      },
    ],
    documentos: [
      {
        id: "doc-ana",
        advisor_id: ANA,
        agency_id: AGENCIA,
        template_id: TIPO,
        archivo_original_path: `asesores/${AGENCIA}/${ANA}/plantillas/ana.docx`,
        form_data: { ...DATOS_DE_ANA },
        estado: "ok",
        version_id: "ver-vieja",
      },
      {
        id: "doc-bruno",
        advisor_id: BRUNO,
        agency_id: AGENCIA,
        template_id: TIPO,
        archivo_original_path: `asesores/${AGENCIA}/${BRUNO}/plantillas/bruno.docx`,
        form_data: null,
        estado: "ok",
        version_id: "ver-vieja",
      },
    ],
    perfiles: [
      { id: ANA, agency_id: AGENCIA, estado: "activo", full_name: "Ana Ruiz" },
      { id: BRUNO, agency_id: AGENCIA, estado: "activo", full_name: "Bruno Sanguinetti" },
    ],
    versiones: [
      {
        id: "ver-vieja",
        template_id: TIPO,
        agency_id: AGENCIA,
        version: 1,
        docx_path: `asesores/${AGENCIA}/_plantillas/${TIPO}/v1.docx`,
        campos_schema: SCHEMA_VIGENTE,
        origen: "detectada",
      },
    ],
    archivos: new Map(),
    escrituras: [],
    lecturas: [],
    romper: {},
  }
}

const pedir = async (opciones: {
  zip?: PizZip
  nombreArchivo?: string
  templateId?: string | null
  moldeAdvisorId?: string | null
  sinArchivo?: boolean
}) => {
  const miBase = base
  const { POST } = await import("./route")

  const form = new FormData()
  if (opciones.templateId !== null) form.set("templateId", opciones.templateId ?? TIPO)
  if (opciones.moldeAdvisorId !== null) form.set("moldeAdvisorId", opciones.moldeAdvisorId ?? ANA)
  if (!opciones.sinArchivo) {
    const buf = buffer(opciones.zip ?? versionNuevaDeAna())
    form.set("archivo", new File([new Uint8Array(buf)], opciones.nombreArchivo ?? "contrato-v2.docx"))
  }

  const res = await baseDelPedido.run(miBase, () =>
    POST(new Request("http://localhost/api/asesor-docs/aplicar-version", { method: "POST", body: form })),
  )
  return { status: res.status, cuerpo: (await res.json()) as Record<string, unknown> }
}

/** El módulo se carga una vez, antes del primer test: la librería de Word pesa. */
beforeAll(async () => {
  await import("./route")
})

beforeEach(() => {
  sesion.agencyId = AGENCIA
  sesion.userId = DIRECTOR
  sesion.role = "director"
  fallaLaSesion.valor = false
  armarBase()
})

// ---------------------------------------------------------------------------
// LO QUE ESTE ENDPOINT NO HACE
// ---------------------------------------------------------------------------

describe("no aplica nada: la versión queda guardada y sin usar", () => {
  it("guarda la versión nueva y NO toca version_actual", async () => {
    const r = await pedir({})
    expect(r.status).toBe(200)
    expect(r.cuerpo.version).toBe(2)
    expect(r.cuerpo.aplicada).toBe(false)

    // La plantilla sigue apuntando a la versión vieja.
    expect(base.tipos[0].version_actual).toBe("ver-vieja")
    const tocaronElTipo = base.escrituras.filter((e) => e.tabla === "advisor_doc_templates")
    expect(tocaronElTipo).toEqual([])
  })

  it("NO escribe ni una fila de advisor_documents", async () => {
    const r = await pedir({})
    expect(r.status).toBe(200)
    expect(base.escrituras.filter((e) => e.tabla === "advisor_documents")).toEqual([])
    expect(base.documentos.map((d) => d.version_id)).toEqual(["ver-vieja", "ver-vieja"])
    expect(base.documentos.map((d) => d.estado)).toEqual(["ok", "ok"])
  })

  it("la versión se guarda con origen 'subida' y el molde en la ruta del §8.6", async () => {
    const r = await pedir({})
    expect(r.status).toBe(200)

    const guardada = base.versiones.find((v) => v.version === 2)!
    expect(guardada.origen).toBe("subida")
    expect(guardada.agency_id).toBe(AGENCIA)
    expect(guardada.created_by).toBe(DIRECTOR)
    expect(guardada.docx_path).toBe(`asesores/${AGENCIA}/_plantillas/${TIPO}/v2.docx`)
    expect(base.archivos.has(`asesores/${AGENCIA}/_plantillas/${TIPO}/v2.docx`)).toBe(true)
  })

  it("el molde guardado es un .docx que se puede abrir y tiene los huecos puestos", async () => {
    await pedir({})
    const guardado = base.archivos.get(`asesores/${AGENCIA}/_plantillas/${TIPO}/v2.docx`)!
    const texto = new PizZip(guardado).file("word/document.xml")!.asText()
    expect(texto).toContain("{{NOMBRE}}")
    expect(texto).toContain("{{CUIT}}")
    expect(texto).toContain("{{ZONA}}")
    expect(texto).not.toContain("27-31456789-4")
  })
})

// ---------------------------------------------------------------------------
// Quién puede, y sobre qué
// ---------------------------------------------------------------------------

describe("autorización", () => {
  it("sin sesión, 401", async () => {
    fallaLaSesion.valor = true
    const r = await pedir({})
    expect(r.status).toBe(401)
    expect(base.versiones).toHaveLength(1)
  })

  it("un asesor no puede subir una versión, 403", async () => {
    sesion.role = "asesor"
    const r = await pedir({})
    expect(r.status).toBe(403)
    expect(base.versiones).toHaveLength(1)
  })

  it("la plantilla de OTRA inmobiliaria no existe para este director, 404", async () => {
    sesion.agencyId = OTRA_AGENCIA
    const r = await pedir({})
    expect(r.status).toBe(404)
    expect(base.versiones).toHaveLength(1)
  })

  it("cada consulta lleva el agency_id de la sesión, no el del pedido", async () => {
    await pedir({})
    expect(base.lecturas.length).toBeGreaterThan(0)
    for (const l of base.lecturas) expect(l.filtros.agency_id).toBe(AGENCIA)
  })
})

// ---------------------------------------------------------------------------
// Lo que llega del navegador
// ---------------------------------------------------------------------------

describe("lo que se rechaza antes de tocar nada", () => {
  it("sin archivo, 400", async () => {
    const r = await pedir({ sinArchivo: true })
    expect(r.status).toBe(400)
    expect(r.cuerpo.error).toContain("Falta el archivo")
  })

  it("un PDF, 400 y con el motivo", async () => {
    const r = await pedir({ nombreArchivo: "contrato-v2.pdf" })
    expect(r.status).toBe(400)
    expect(r.cuerpo.error).toContain(".docx")
  })

  it("sin decir de qué asesor son los datos, 400", async () => {
    const r = await pedir({ moldeAdvisorId: null })
    expect(r.status).toBe(400)
    expect(r.cuerpo.error).toContain("asesor")
  })

  it("un asesor SIN datos guardados se rechaza con ese motivo", async () => {
    const r = await pedir({ moldeAdvisorId: BRUNO })
    expect(r.status).toBe(400)
    expect(r.cuerpo.error).toContain("no tiene datos guardados")
    expect(base.versiones).toHaveLength(1)
  })

  it("un asesor pausado no puede ser la referencia", async () => {
    base.perfiles[0].estado = "pausado"
    const r = await pedir({})
    expect(r.status).toBe(400)
    expect(r.cuerpo.error).toContain("pausado")
    expect(base.versiones).toHaveLength(1)
  })

  it("una plantilla sin versión vigente no se puede versionar", async () => {
    base.tipos[0].version_actual = null
    const r = await pedir({})
    expect(r.status).toBe(400)
    expect(r.cuerpo.error).toContain("no tiene ninguna versión activa")
  })

  it("una version_actual que apunta a la versión de OTRA plantilla no se usa", async () => {
    /**
     * La clave foránea garantiza que la fila exista, no que sea de esta
     * plantilla. Si se usara igual, los campos nuevos se compararían contra el
     * esquema del documento equivocado y la lista de "desaparecidos" saldría
     * redactada, completa y falsa.
     */
    base.versiones.push({
      id: "ver-de-otra-plantilla",
      template_id: "99999999-9999-4999-8999-999999999999",
      agency_id: AGENCIA,
      version: 7,
      campos_schema: [{ nombre: "OTRO_CAMPO", label: "Otro", orden: 0 }],
      origen: "detectada",
    })
    base.tipos[0].version_actual = "ver-de-otra-plantilla"

    const r = await pedir({})
    expect(r.status).toBe(400)
    expect(r.cuerpo.error).toContain("no tiene ninguna versión activa")
    expect(base.versiones.some((v) => v.version === 2)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// EL PUNTO 1 DEL SPEC §7.4: el archivo genérico
// ---------------------------------------------------------------------------

describe("el archivo genérico se rechaza, y con nombre y apellido", () => {
  it("un contrato modelo sin los datos de nadie no pasa, y el error dice qué se buscó", async () => {
    const generico = docx([
      parrafo("CONTRATO DE PARTNERSHIP COMERCIAL INMOBILIARIO"),
      parrafo("Y por la otra parte {{NOMBRE}}, CUIT {{CUIT}}, en adelante EL ASESOR."),
    ])
    const r = await pedir({ zip: generico })
    expect(r.status).toBe(400)

    const error = r.cuerpo.error as string
    expect(error).toContain("no parece la versión nueva")
    // Lo que hace que el director pueda arreglarlo solo: QUÉ se esperaba encontrar.
    expect(error).toContain("NOMBRE")
    expect(error).toContain("Ana Ruiz")
    expect(error).toContain("27-31456789-4")

    expect(base.versiones).toHaveLength(1)
    expect(base.archivos.size).toBe(0)
  })

  it("el archivo de OTRA persona tampoco pasa: sus datos no están adentro", async () => {
    const deBruno = docx([
      parrafo("Y por la otra parte Bruno Sanguinetti, CUIT 20-28765432-1, en adelante EL ASESOR."),
      parrafo("Se asigna a EL ASESOR la zona de Belgrano R."),
    ])
    const r = await pedir({ zip: deBruno })
    expect(r.status).toBe(400)
    expect(r.cuerpo.error).toContain("no parece la versión nueva")
    expect(base.versiones).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// EL PUNTO 2 DEL SPEC §7.4: qué campos cambian
// ---------------------------------------------------------------------------

describe("qué campos cambian", () => {
  it("un campo que ya no está en la versión nueva sale como desaparecido, y se avisa que el dato NO se borra", async () => {
    const sinZona = docx([
      parrafo("CONTRATO — EDICION 2027"),
      parrafo("Y por la otra parte Ana Ruiz, CUIT 27-31456789-4, en adelante EL ASESOR."),
      parrafo("Aclaracion de la firma: Ana Ruiz"),
    ])
    const r = await pedir({ zip: sinZona })
    expect(r.status).toBe(200)

    const campos = r.cuerpo.campos as { nuevos: string[]; desaparecidos: string[]; iguales: string[] }
    expect(campos.desaparecidos).toEqual(["ZONA"])
    expect(campos.nuevos).toEqual([])
    expect(campos.iguales.sort()).toEqual(["CUIT", "NOMBRE"])

    const avisos = (r.cuerpo.advertencias as string[]).join(" ")
    expect(avisos).toContain("ZONA")
    expect(avisos).toContain("no se borra")
  })

  it("un hueco escrito a mano en el Word es un campo nuevo, y se dice que hay que completarlo", async () => {
    const conCampoNuevo = versionNuevaDeAna(["La comision pactada es del {{COMISION}} sobre la operacion."])
    const r = await pedir({ zip: conCampoNuevo })
    expect(r.status).toBe(200)

    const campos = r.cuerpo.campos as { nuevos: string[]; desaparecidos: string[] }
    expect(campos.nuevos).toEqual(["COMISION"])
    expect(campos.desaparecidos).toEqual([])

    const avisos = (r.cuerpo.advertencias as string[]).join(" ")
    expect(avisos).toContain("COMISION")
    expect(avisos).toContain("a mano")

    // Y el campo nuevo entra en el esquema de la versión guardada.
    const guardada = base.versiones.find((v) => v.version === 2)!
    const nombres = (guardada.campos_schema as Array<{ nombre: string }>).map((c) => c.nombre)
    expect(nombres).toContain("COMISION")
  })

  it("un dato que vive SOLO en el encabezado se encuentra igual", async () => {
    /**
     * El falso verde que ya se pagó una vez en esta etapa: mammoth lee el
     * CUERPO y nada más. Si acá se mirara solo el cuerpo, el legajo saldría
     * como "desaparecido" —siendo que está— y el molde se llevaría el
     * encabezado de Ana al documento de todos.
     */
    base.documentos[0].form_data = { ...DATOS_DE_ANA, LEGAJO: "8892" }
    base.versiones[0].campos_schema = [...SCHEMA_VIGENTE, { nombre: "LEGAJO", label: "Legajo", orden: 3 }]

    const r = await pedir({ zip: versionNuevaDeAna([], undefined, "Legajo interno 8892") })
    expect(r.status).toBe(200)

    const campos = r.cuerpo.campos as { nuevos: string[]; desaparecidos: string[]; iguales: string[] }
    expect(campos.desaparecidos).toEqual([])
    expect(campos.iguales).toContain("LEGAJO")

    // Y el hueco entró en el encabezado del molde, no quedó el 8892 de Ana.
    const guardado = base.archivos.get(`asesores/${AGENCIA}/_plantillas/${TIPO}/v2.docx`)!
    const encabezado = new PizZip(guardado).file("word/header1.xml")!.asText()
    expect(encabezado).toContain("{{LEGAJO}}")
    expect(encabezado).not.toContain("8892")
  })

  it("un campo VACÍO en el asesor de referencia no se declara desaparecido ni se cae del schema", async () => {
    /**
     * `formDataDe` escribe `""` para el campo que ese asesor no tenía. Antes,
     * ese campo salía como "desaparecido" —una afirmación que el sistema no
     * puede hacer, porque nunca lo buscó— y encima desaparecía del
     * `campos_schema`: se le borraba el campo a TODOS los asesores porque UNO no
     * lo tenía cargado.
     */
    base.documentos[0].form_data = { ...DATOS_DE_ANA, LEGAJO: "" }
    base.versiones[0].campos_schema = [...SCHEMA_VIGENTE, { nombre: "LEGAJO", label: "Legajo", orden: 3 }]

    const r = await pedir({})
    expect(r.status).toBe(200)

    const campos = r.cuerpo.campos as { nuevos: string[]; desaparecidos: string[]; iguales: string[] }
    expect(campos.desaparecidos).toEqual([])
    expect(campos.iguales).toContain("LEGAJO")

    // Y sigue en el esquema de la versión nueva.
    const guardada = base.versiones.find((v) => v.version === 2)!
    const nombres = (guardada.campos_schema as Array<{ nombre: string }>).map((c) => c.nombre)
    expect(nombres).toContain("LEGAJO")

    // Con su propio aviso, que dice la verdad y no "deja de usarse".
    const avisos = (r.cuerpo.advertencias as string[]).join(" ")
    expect(avisos).toContain("LEGAJO")
    expect(avisos).toContain("no se pudo comprobar")
    expect(avisos).not.toContain("deja de usarse")
  })

  it("el orden del campos_schema es el del DOCUMENTO, medido desde el .docx", async () => {
    /**
     * De punta a punta y no sobre la función suelta: lo que estaba mal no era la
     * función —respetaba el orden de su entrada— sino QUIÉN le armaba la entrada.
     * Salía el orden de las llaves de `form_data`, que es el de la versión
     * anterior, mientras un comentario y el nombre de un test afirmaban lo
     * contrario.
     *
     * Acá la zona va primero en el Word y el nombre después; en `form_data` van
     * al revés. El formulario tiene que seguir al documento.
     */
    const zonaPrimero = docx([
      parrafo("CONTRATO — EDICION 2027"),
      parrafo("Se asigna a EL ASESOR la zona de Villa Urquiza."),
      parrafo("Y por la otra parte Ana Ruiz, CUIT 27-31456789-4, en adelante EL ASESOR."),
    ])
    expect(Object.keys(base.documentos[0].form_data as object)).toEqual(["NOMBRE", "CUIT", "ZONA"])

    const r = await pedir({ zip: zonaPrimero })
    expect(r.status).toBe(200)

    const schema = base.versiones.find((v) => v.version === 2)!.campos_schema as Array<{
      nombre: string
      orden: number
    }>
    expect(schema.map((c) => c.nombre)).toEqual(["ZONA", "NOMBRE", "CUIT"])
    expect(schema.map((c) => c.orden)).toEqual([0, 1, 2])
  })

  it("un hueco escrito a mano en el primer párrafo no queda al final del formulario", async () => {
    const comisionArriba = docx([
      parrafo("La comision pactada es del {{COMISION}} sobre la operacion."),
      parrafo("Y por la otra parte Ana Ruiz, CUIT 27-31456789-4, en adelante EL ASESOR."),
      parrafo("Se asigna a EL ASESOR la zona de Villa Urquiza."),
    ])
    const r = await pedir({ zip: comisionArriba })
    expect(r.status).toBe(200)

    const schema = base.versiones.find((v) => v.version === 2)!.campos_schema as Array<{ nombre: string }>
    expect(schema.map((c) => c.nombre)).toEqual(["COMISION", "NOMBRE", "CUIT", "ZONA"])
  })

  it("el rótulo que el director ya le había puesto a un campo se conserva", async () => {
    await pedir({})
    const guardada = base.versiones.find((v) => v.version === 2)!
    const schema = guardada.campos_schema as Array<{ nombre: string; label: string }>
    expect(schema.find((c) => c.nombre === "NOMBRE")!.label).toBe("Nombre y apellido")
    expect(schema.find((c) => c.nombre === "ZONA")!.label).toBe("Zona asignada")
  })
})

// ---------------------------------------------------------------------------
// EL PUNTO 3 DEL SPEC §7.4: la vista previa
// ---------------------------------------------------------------------------

describe("la vista previa", () => {
  it("es el documento de un asesor REAL armado con la versión nueva", async () => {
    const r = await pedir({})
    const vista = r.cuerpo.vistaPrevia as { advisorId: string; nombre: string; texto: string }
    expect(vista.advisorId).toBe(ANA)
    expect(vista.nombre).toBe("Ana Ruiz")
    // Con los datos de Ana adentro, no con los huecos a la vista.
    expect(vista.texto).toContain("Ana Ruiz")
    expect(vista.texto).toContain("27-31456789-4")
    expect(vista.texto).toContain("EDICION 2027")
    expect(vista.texto).not.toContain("{{")
  })

  it("el resumen dice que todavía no se aplicó a nadie", async () => {
    const r = await pedir({})
    expect(r.cuerpo.resumen as string).toContain("Todavía no se aplicó a ningún asesor")
  })
})

// ---------------------------------------------------------------------------
// LA RED DE SEGURIDAD
// ---------------------------------------------------------------------------

describe("la red de seguridad", () => {
  it("un dato que queda pegado en una nota al final frena todo: iría al documento de TODOS", async () => {
    /**
     * `ponerHuecosEnDocx` no toca las notas al final —docxtemplater tampoco las
     * rellena—, así que el CUIT de Ana se lo llevaría el molde al contrato de
     * cada asesor. La comprobación de ida y vuelta NO lo ve: para Ana el
     * documento vuelve idéntico. Esto es lo único que lo atrapa.
     */
    const conNota = versionNuevaDeAna([], "Legajo del asesor: CUIT 27-31456789-4")
    const r = await pedir({ zip: conNota })
    expect(r.status).toBe(400)

    const error = r.cuerpo.error as string
    expect(error).toContain("CUIT")
    expect(error).toContain("TODOS")
    expect(base.versiones).toHaveLength(1)
    expect(base.archivos.size).toBe(0)
  })

  it("dos campos con el mismo dato en esa persona frenan, y el mensaje dice qué hacer", async () => {
    base.documentos[0].form_data = { ...DATOS_DE_ANA, ZONA_FIRMA: "Villa Urquiza" }
    const r = await pedir({})
    expect(r.status).toBe(400)

    const error = r.cuerpo.error as string
    expect(error).toContain("ZONA")
    expect(error).toContain("ZONA_FIRMA")
    expect(error).toContain("Elegí de referencia a un asesor")
    expect(base.versiones).toHaveLength(1)
  })

  it("un dato tan corto que rompe el nombre de otro campo frena ANTES, y con una salida que existe", async () => {
    /**
     * "2026" se mete adentro de `{{PLAZO_2026}}` —el guión bajo y las llaves no
     * son letras ni números— y deja las llaves cruzadas. El .docx ya no se puede
     * rellenar.
     *
     * Antes esto se descubría recién cuando `rellenarDocx` tiraba, y el mensaje
     * terminaba mandando a "volvé a detectar la plantilla y sacá ese campo": un
     * camino que en este flujo NO existe. Ahora frena antes de tocar el
     * documento y ofrece las dos salidas que sí existen.
     */
    base.documentos[0].form_data = { PLAZO_2026: "cinco anios", ANIO: "2026" }
    const zip = docx([
      parrafo("El plazo del acuerdo es de cinco anios."),
      parrafo("Vigente durante el ejercicio 2026."),
    ])
    const r = await pedir({ zip })
    expect(r.status).toBe(400)

    const error = r.cuerpo.error as string
    expect(error).toContain("ANIO")
    expect(error).toContain("PLAZO_2026")
    // Las dos salidas ejecutables desde esta pantalla.
    expect(error).toContain("otro asesor")
    expect(error).toContain("saca")
    // Y la que NO existe acá.
    expect(error).not.toContain("volvé a detectar")

    expect(base.versiones).toHaveLength(1)
    expect(base.archivos.size).toBe(0)
  })

  it("el choque contra un hueco escrito a mano también frena", async () => {
    /**
     * `{{COMISION_1}}` lo escribió el director en el Word, así que no está en el
     * esquema y no salía en la lista contra la cual se buscan los choques. El
     * dato "1" se le mete adentro igual y rompe el molde exactamente igual.
     */
    base.documentos[0].form_data = { ...DATOS_DE_ANA, TRAMO: "1" }
    const zip = versionNuevaDeAna(["Tramo 1 del plan.", "La comision del tramo es {{COMISION_1}}."])
    const r = await pedir({ zip })
    expect(r.status).toBe(400)
    expect(r.cuerpo.error as string).toContain("TRAMO")
    expect(r.cuerpo.error as string).toContain("COMISION_1")
    expect(base.versiones).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// EL NÚMERO DE VERSIÓN
// ---------------------------------------------------------------------------

describe("el número de versión", () => {
  it("sale de la MÁS NUEVA, no de la más vieja", async () => {
    base.versiones.push(
      { id: "ver-2", template_id: TIPO, agency_id: AGENCIA, version: 2, campos_schema: SCHEMA_VIGENTE },
      { id: "ver-3", template_id: TIPO, agency_id: AGENCIA, version: 3, campos_schema: SCHEMA_VIGENTE },
    )
    const r = await pedir({})
    expect(r.status).toBe(200)
    expect(r.cuerpo.version).toBe(4)
    expect(base.archivos.has(`asesores/${AGENCIA}/_plantillas/${TIPO}/v4.docx`)).toBe(true)
  })

  it("no cuenta las versiones de OTRA plantilla", async () => {
    base.versiones.push({
      id: "ver-otra",
      template_id: "99999999-9999-4999-8999-999999999999",
      agency_id: AGENCIA,
      version: 9,
      campos_schema: SCHEMA_VIGENTE,
    })
    const r = await pedir({})
    expect(r.cuerpo.version).toBe(2)
  })

  it("si el número choca, es un CONFLICTO y se dice: no se reintenta en silencio", async () => {
    /**
     * La carrera de verdad: el endpoint lee que la última versión es la 1 y
     * calcula 2; entre esa lectura y el INSERT, otro director guarda la 2. El
     * índice único `(template_id, version)` la frena.
     *
     * Tiene que salir como CONFLICTO. Guardarla como 3 en silencio le haría
     * creer a este director que su subida salió sobre lo que él estaba viendo en
     * pantalla, y lo que estaba viendo ya no existe.
     */
    /**
     * La SEGUNDA lectura de la tabla de versiones es la del número máximo: la
     * primera es la de la versión vigente. Colarse antes de esa no sería una
     * carrera — el endpoint leería el máximo ya con la fila adentro y calcularía
     * el número siguiente, que es justo lo que este test dice que NO tiene que
     * pasar en silencio.
     */
    let lecturas = 0
    base.despuesDeLeer = (tabla) => {
      if (tabla !== "advisor_doc_template_versions") return
      lecturas++
      if (lecturas !== 2) return
      base.versiones.push({
        id: "ver-de-otro",
        template_id: TIPO,
        agency_id: AGENCIA,
        version: 2,
        campos_schema: SCHEMA_VIGENTE,
      })
    }

    const r = await pedir({})
    expect(r.status).toBe(409)
    expect(r.cuerpo.error as string).toContain("Alguien más guardó una versión")

    // Y no quedó ningún molde subido a nombre de una versión que no se creó.
    expect(base.archivos.size).toBe(0)
  })
})
