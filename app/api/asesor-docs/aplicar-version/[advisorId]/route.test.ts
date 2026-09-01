import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest"
import { AsyncLocalStorage } from "node:async_hooks"
import { readFileSync } from "node:fs"
import path from "node:path"
import PizZip from "pizzip"

import { rutaDelDocumentoGenerado } from "@/lib/asesor-docs/reglas"
import { huecosDe, rellenarDocx, textoPorParte } from "@/lib/plantillas/docx"

/**
 * APLICARLE LA VERSIÓN A UN ASESOR: LA PRIMERA VEZ QUE PRISMA ESCRIBE UN
 * DOCUMENTO DE UNA PERSONA.
 *
 * ═══ Los testigos de este archivo son de CONDUCTA, no de mensaje ═══
 *
 * Si dos defensas disparan juntas, un test que solo mira el texto del error no
 * dice cuál actuó — y una mutación que apaga una de las dos no pone nada en
 * rojo, porque la otra sigue frenando. Por eso cada test de la red mide **qué
 * quedó escrito y qué no**: la fila de `advisor_documents`, el archivo en
 * Storage, y la lista de escrituras.
 *
 * Y cada una de las cuatro comprobaciones tiene su propio escenario, armado a
 * propósito para que **las otras tres pasen**. Sin eso, la mutación de una
 * defensa sobreviviría escondida atrás de otra.
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
const OTRO_TIPO = "55555555-5555-4555-8555-555555555555"
const ANA = "11111111-1111-4111-8111-111111111111"
const BRUNO = "22222222-2222-4222-8222-222222222222"
const CARLA = "33333333-3333-4333-8333-333333333333"
const VER_VIEJA = "aa000000-0000-4000-8000-000000000001"
const VER_NUEVA = "aa000000-0000-4000-8000-000000000002"
const VER_AJENA = "aa000000-0000-4000-8000-000000000009"

const sesion = { agencyId: AGENCIA, userId: DIRECTOR, role: "director" as string | null }
const fallaLaSesion = { valor: false }

vi.mock("@/lib/auth/tenant-validation", () => ({
  requireTenant: async () => {
    if (fallaLaSesion.valor) throw new Error("Unauthorized")
    return sesion
  },
}))

type Escritura = {
  tabla: string
  tipo: string
  datos?: Record<string, unknown>
  filtros: Record<string, unknown>
}

type Base = {
  tipos: Array<Record<string, unknown>>
  documentos: Array<Record<string, unknown>>
  perfiles: Array<Record<string, unknown>>
  versiones: Array<Record<string, unknown>>
  archivos: Map<string, Buffer>
  escrituras: Escritura[]
  romper: Record<string, string | undefined>
  /**
   * Se llama justo DESPUÉS de cada lectura, con la tabla.
   *
   * Existe para poder meter mano MIENTRAS el pedido corre, que es la única
   * forma de probar una carrera de verdad: el director reemplazándole el .docx
   * al asesor entre la comprobación y el UPDATE. Es el mismo recurso que usa el
   * test del endpoint hermano.
   */
  despuesDeLeer?: (tabla: string) => void
}

let base: Base

/** Cada pedido con SU base. El motivo largo está en `confirmar-plantilla/route.test.ts`. */
const baseDelPedido = new AsyncLocalStorage<Base>()

const clienteFalso = (base: Base) => {
  const consulta = (tabla: string, tipo: string, datos?: Record<string, unknown>) => {
    const filtros: Record<string, unknown> = {}
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

      if (tipo === "update") {
        base.escrituras.push({ tabla, tipo, datos, filtros })
        const afectadas = filtrar()
        for (const f of afectadas) Object.assign(f, datos)
        return { data: afectadas.map((f) => ({ ...f })), error: null }
      }

      /** COPIAS, no las filas de `base`: PostgREST devuelve JSON por la red. */
      const encontradas = filtrar().map((f) => ({ ...f }))
      base.despuesDeLeer?.(tabla)
      /** `order` ordena de verdad; el motivo largo está en el test del endpoint hermano. */
      if (orden) {
        const { col, asc } = orden
        encontradas.sort((a, b) => {
          const x = a[col] as number | string
          const y = b[col] as number | string
          if (x === y) return 0
          return (x < y ? -1 : 1) * (asc ? 1 : -1)
        })
      }
      return { data: encontradas, error: null }
    }

    const api: Record<string, unknown> = {
      eq: (col: string, val: unknown) => ((filtros[col] = val), api),
      in: (col: string, val: unknown[]) => ((filtros[col] = val), api),
      order: (col: string, opciones?: { ascending?: boolean }) => (
        (orden = { col, asc: opciones?.ascending !== false }), api
      ),
      limit: () => api,
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
      update: (datos: Record<string, unknown>) => consulta(tabla, "update", datos),
    }),
    storage: {
      from: () => ({
        download: async (ruta: string) => {
          const buf = base.archivos.get(ruta)
          if (!buf) return { data: null, error: { message: "no existe" } }
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

function docx(parrafos: string[], notaAlFinal?: string): PizZip {
  const zip = new PizZip()
  const word = zip.folder("word")!
  if (notaAlFinal !== undefined) {
    /**
     * Las notas al final NO se declaran como parte que docxtemplater rellene:
     * se LEEN igual (`textoPorParte` las agrega a mano) y no se rellenan nunca.
     * Ese desnivel es justo lo que hace falta para aislar la comprobación 1.
     */
    word.file(
      "endnotes.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:endnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:endnote w:id="1">${parrafo(notaAlFinal)}</w:endnote></w:endnotes>`,
    )
  }
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="${BASE_TIPO}.document.main+xml"/></Types>`,
  )
  zip.folder("_rels")!.file(".rels", RELS)
  word.file(
    "document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${parrafos.join("")}</w:body></w:document>`,
  )
  return zip
}

const buffer = (zip: PizZip) => Buffer.from(zip.generate({ type: "nodebuffer" }))

type Datos = { NOMBRE: string; CUIT: string; ZONA: string }

const DATOS = {
  [ANA]: { NOMBRE: "Ana Ruiz", CUIT: "27-31456789-4", ZONA: "Villa Urquiza" },
  [BRUNO]: { NOMBRE: "Bruno Sanguinetti", CUIT: "20-28765432-1", ZONA: "Belgrano" },
  /** Comparte la zona con Bruno: así "Belgrano" NO es exclusivo de nadie. */
  [CARLA]: { NOMBRE: "Carla Diaz", CUIT: "27-30111222-3", ZONA: "Belgrano" },
} as Record<string, Datos>

/** El .docx que subió el director para esa persona: la versión VIEJA, y la única verdad de referencia. */
const originalDe = (d: Datos) =>
  docx([
    parrafo("CONTRATO DE PARTNERSHIP COMERCIAL INMOBILIARIO"),
    parrafo(`Y por la otra parte ${d.NOMBRE}, mayor de edad, CUIT ${d.CUIT}, en adelante EL ASESOR.`),
    parrafo(`Se asigna a EL ASESOR la zona de ${d.ZONA}, con captacion preferente.`),
  ])

/** El molde de la versión nueva: el cuerpo con los tres huecos, uno cada uno. */
const moldeNuevo = (cuerpoExtra: string[] = [], notaAlFinal?: string) =>
  docx(
    [
      parrafo("CONTRATO DE PARTNERSHIP COMERCIAL INMOBILIARIO EDICION 2027"),
      parrafo("Y por la otra parte {{NOMBRE}}, mayor de edad, CUIT {{CUIT}}, en adelante EL ASESOR."),
      parrafo("Se asigna a EL ASESOR la zona de {{ZONA}}, con captacion preferente y exclusiva."),
      ...cuerpoExtra.map(parrafo),
    ],
    notaAlFinal,
  )

const RUTA_ORIGINAL = (advisorId: string) => `asesores/${AGENCIA}/${advisorId}/plantillas/${advisorId}.docx`
const RUTA_MOLDE_NUEVO = `asesores/${AGENCIA}/_plantillas/${TIPO}/v2.docx`

function armarBase() {
  base = {
    tipos: [
      { id: TIPO, nombre: "Contrato Partnership", agency_id: AGENCIA, estado: "activa", version_actual: VER_VIEJA },
      { id: OTRO_TIPO, nombre: "Confidencialidad", agency_id: AGENCIA, estado: "activa", version_actual: null },
    ],
    documentos: [ANA, BRUNO, CARLA].map((id) => ({
      id: `doc-${id}`,
      advisor_id: id,
      agency_id: AGENCIA,
      template_id: TIPO,
      nombre_archivo: `contrato-${id}.docx`,
      archivo_original_path: RUTA_ORIGINAL(id),
      form_data: { ...DATOS[id] },
      estado: "ok",
      observacion: null,
      docx_path: null,
      version_id: VER_VIEJA,
    })),
    perfiles: [
      { id: ANA, agency_id: AGENCIA, estado: "activo", full_name: "Ana Ruiz" },
      { id: BRUNO, agency_id: AGENCIA, estado: "activo", full_name: "Bruno Sanguinetti" },
      { id: CARLA, agency_id: AGENCIA, estado: "activo", full_name: "Carla Diaz" },
    ],
    versiones: [
      {
        id: VER_VIEJA,
        template_id: TIPO,
        agency_id: AGENCIA,
        version: 1,
        docx_path: `asesores/${AGENCIA}/_plantillas/${TIPO}/v1.docx`,
        campos_schema: [{ nombre: "NOMBRE" }, { nombre: "CUIT" }, { nombre: "ZONA" }],
      },
      {
        id: VER_NUEVA,
        template_id: TIPO,
        agency_id: AGENCIA,
        version: 2,
        docx_path: RUTA_MOLDE_NUEVO,
        campos_schema: [{ nombre: "NOMBRE" }, { nombre: "CUIT" }, { nombre: "ZONA" }],
      },
      /** Una versión de OTRA plantilla, para medir el `.eq("template_id")`. */
      {
        id: VER_AJENA,
        template_id: OTRO_TIPO,
        agency_id: AGENCIA,
        version: 1,
        docx_path: RUTA_MOLDE_NUEVO,
        campos_schema: [],
      },
    ],
    archivos: new Map(),
    escrituras: [],
    romper: {},
    despuesDeLeer: undefined,
  }

  for (const id of [ANA, BRUNO, CARLA]) base.archivos.set(RUTA_ORIGINAL(id), buffer(originalDe(DATOS[id])))
  base.archivos.set(RUTA_MOLDE_NUEVO, buffer(moldeNuevo()))
}

const filaDe = (advisorId: string) => base.documentos.find((d) => d.advisor_id === advisorId)!

const pedir = async (opciones: {
  advisorId?: string
  templateId?: string | null
  versionId?: string | null
} = {}) => {
  const miBase = base
  const { POST } = await import("./route")

  const cuerpo: Record<string, unknown> = {}
  if (opciones.templateId !== null) cuerpo.templateId = opciones.templateId ?? TIPO
  if (opciones.versionId !== null) cuerpo.versionId = opciones.versionId ?? VER_NUEVA

  const advisorId = opciones.advisorId ?? BRUNO
  const res = await baseDelPedido.run(miBase, () =>
    POST(
      new Request(`http://localhost/api/asesor-docs/aplicar-version/${advisorId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      }),
      { params: { advisorId } },
    ),
  )
  return { status: res.status, cuerpo: (await res.json()) as Record<string, unknown> }
}

/**
 * EL TESTIGO DE CONDUCTA, y el que usan todos los tests de la red.
 *
 * Mide lo único que importa cuando la red frena: que de esa persona **no quedó
 * escrito nada**. Ni la fila, ni el archivo, ni una escritura intentada.
 */
function nadaSeEscribioDe(advisorId: string) {
  const fila = filaDe(advisorId)
  return {
    versionId: fila.version_id,
    estado: fila.estado,
    observacion: fila.observacion,
    docxPath: fila.docx_path,
    escriturasDeDocumentos: base.escrituras.filter((e) => e.tabla === "advisor_documents").length,
    subidas: base.escrituras.filter((e) => e.tabla === "storage").length,
  }
}

const COMO_ESTABA = {
  versionId: VER_VIEJA,
  estado: "ok",
  observacion: null,
  docxPath: null,
  escriturasDeDocumentos: 0,
  subidas: 0,
}

/** Importar la ruta arrastra docxtemplater, pizzip y mammoth: con la cache fría pasa los 10 s por defecto. */
beforeAll(async () => {
  await import("./route")
}, 60_000)

beforeEach(() => {
  sesion.agencyId = AGENCIA
  sesion.userId = DIRECTOR
  sesion.role = "director"
  fallaLaSesion.valor = false
  armarBase()
})

// ---------------------------------------------------------------------------
// EL CAMINO QUE SÍ ESCRIBE
// ---------------------------------------------------------------------------

describe("cuando la red pasa: se le genera el documento", () => {
  it("escribe la versión nueva, el estado y el docx_path, y sube el archivo", async () => {
    const r = await pedir()
    expect(r.status).toBe(200)
    expect(r.cuerpo.estado).toBe("ok")

    const fila = filaDe(BRUNO)
    expect(fila.version_id).toBe(VER_NUEVA)
    expect(fila.estado).toBe("ok")
    expect(fila.observacion).toBeNull()
    expect(fila.docx_path).toBe(rutaDelDocumentoGenerado(AGENCIA, BRUNO, `doc-${BRUNO}`, 2))
    expect(base.archivos.has(fila.docx_path as string)).toBe(true)
  })

  it("el .docx generado se puede abrir y trae SUS datos, no los del molde", async () => {
    await pedir()
    const generado = base.archivos.get(filaDe(BRUNO).docx_path as string)!
    const texto = new PizZip(generado).file("word/document.xml")!.asText()
    expect(texto).toContain("Bruno Sanguinetti")
    expect(texto).toContain("20-28765432-1")
    expect(texto).toContain("Belgrano")
    expect(texto).not.toContain("{{")
    expect(texto).not.toContain("Ana Ruiz")
  })

  /**
   * `version_actual` la mueve `activar-version`, que se niega si queda alguien
   * atrás. Moverla acá, de a un asesor, dejaría a la solapa diciendo "está en
   * uso" con la mitad de la gente todavía en la versión vieja.
   */
  it("NO toca version_actual de la plantilla", async () => {
    await pedir()
    expect(base.tipos[0].version_actual).toBe(VER_VIEJA)
    expect(base.escrituras.filter((e) => e.tabla === "advisor_doc_templates")).toEqual([])
  })

  it("no le toca la fila a NINGÚN otro asesor", async () => {
    await pedir()
    expect(filaDe(ANA).version_id).toBe(VER_VIEJA)
    expect(filaDe(CARLA).version_id).toBe(VER_VIEJA)
    expect(base.escrituras.filter((e) => e.tabla === "advisor_documents")).toHaveLength(1)
  })

  it("el resumen le habla al director con el nombre de la persona", async () => {
    const r = await pedir()
    expect(r.cuerpo.resumen).toContain("Bruno Sanguinetti")
    expect(r.cuerpo.resumen).toContain("versión 2")
  })
})

// ---------------------------------------------------------------------------
// `archivo_original_path` NO SE TOCA NUNCA
// ---------------------------------------------------------------------------

describe("archivo_original_path no se toca por ningún camino", () => {
  /**
   * Es el .docx que subió el director y la única fuente de verdad contra la que
   * compara toda la verificación. Si el generado lo pisara, la próxima
   * comprobación compararía la plantilla contra un archivo que salió de la
   * plantilla misma: **daría verde siempre, contra cualquier error**.
   */
  it("ni el camino que escribe ni el del pendiente lo mandan como valor", async () => {
    await pedir()
    filaDe(BRUNO).form_data = { NOMBRE: "Bruno Sanguinetti", CUIT: "20-28765432-1" }
    await pedir()

    const updates = base.escrituras.filter((e) => e.tabla === "advisor_documents")
    expect(updates.length).toBeGreaterThan(1)
    for (const u of updates) expect(Object.keys(u.datos ?? {})).not.toContain("archivo_original_path")
  })

  it("la ruta del original sigue apuntando al archivo del director", async () => {
    await pedir()
    expect(filaDe(BRUNO).archivo_original_path).toBe(RUTA_ORIGINAL(BRUNO))
    expect(base.archivos.get(RUTA_ORIGINAL(BRUNO))).toEqual(buffer(originalDe(DATOS[BRUNO])))
  })

  /**
   * El estructural, que cuida lo que ningún caso de prueba puede cubrir: que
   * mañana no aparezca un `archivo_original_path:` adentro de un `update`. Se
   * lee el archivo como texto, igual que hace `ficha-css.test.ts` con la ficha
   * pública.
   */
  it("en el código, la columna solo aparece como FILTRO o como lectura", () => {
    const fuente = readFileSync(path.join(process.cwd(), "app/api/asesor-docs/aplicar-version/[advisorId]/route.ts"), "utf8")
    /** Sin los comentarios: ahí se la nombra a propósito, y muchas veces. */
    const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")
    /**
     * Se saca el objeto que recibe cada `.update(` contando llaves, y se exige
     * que la columna NO esté adentro. Leerla —en el `select`, o como
     * `doc.archivo_original_path`— y usarla de FILTRO está bien; escribirla, no.
     */
    const objetosDeUpdate: string[] = []
    for (const m of codigo.matchAll(/\.update\(\{/g)) {
      let i = (m.index ?? 0) + m[0].length - 1
      let nivel = 0
      const desde = i
      for (; i < codigo.length; i++) {
        if (codigo[i] === "{") nivel += 1
        else if (codigo[i] === "}") {
          nivel -= 1
          if (nivel === 0) break
        }
      }
      objetosDeUpdate.push(codigo.slice(desde, i + 1))
    }

    /** Dos updates: el del `pendiente` y el del documento generado. */
    expect(objetosDeUpdate.length).toBe(2)
    for (const objeto of objetosDeUpdate) {
      expect(objeto).not.toContain("archivo_original_path")
    }
    /** Y que la columna se siga usando de filtro: si desapareciera, la carrera del reemplazo se abriría. */
    expect(codigo).toContain('.eq("archivo_original_path"')
  })
})

// ---------------------------------------------------------------------------
// Quién puede, y sobre qué
// ---------------------------------------------------------------------------

describe("autorización", () => {
  it("sin sesión, 401 y nada escrito", async () => {
    fallaLaSesion.valor = true
    const r = await pedir()
    expect(r.status).toBe(401)
    expect(nadaSeEscribioDe(BRUNO)).toEqual(COMO_ESTABA)
  })

  it("un asesor no puede aplicar versiones, 403", async () => {
    sesion.role = "asesor"
    const r = await pedir()
    expect(r.status).toBe(403)
    expect(nadaSeEscribioDe(BRUNO)).toEqual(COMO_ESTABA)
  })

  it("la plantilla de OTRA inmobiliaria no existe para este director, 404", async () => {
    sesion.agencyId = OTRA_AGENCIA
    const r = await pedir()
    expect(r.status).toBe(404)
    expect(nadaSeEscribioDe(BRUNO)).toEqual(COMO_ESTABA)
  })

  /**
   * La clave foránea garantiza que la versión EXISTA, no que sea de ESTA
   * plantilla. Sin el `.eq("template_id")` se le podría aplicar a un asesor el
   * molde de otro tipo de documento, y nada lo delataría.
   */
  it("una versión de OTRO tipo de documento se rechaza, 404", async () => {
    const r = await pedir({ versionId: VER_AJENA })
    expect(r.status).toBe(404)
    expect(nadaSeEscribioDe(BRUNO)).toEqual(COMO_ESTABA)
  })

  it("un asesor que no es de esta inmobiliaria, 404", async () => {
    base.perfiles = base.perfiles.filter((p) => p.id !== BRUNO)
    const r = await pedir()
    expect(r.status).toBe(404)
  })

  it("sin templateId no se hace nada", async () => {
    const r = await pedir({ templateId: null })
    expect(r.status).toBe(400)
    expect(nadaSeEscribioDe(BRUNO)).toEqual(COMO_ESTABA)
  })

  it("sin versionId tampoco", async () => {
    const r = await pedir({ versionId: null })
    expect(r.status).toBe(400)
    expect(nadaSeEscribioDe(BRUNO)).toEqual(COMO_ESTABA)
  })
})

// ---------------------------------------------------------------------------
// Pausados y desvinculados (spec §7.5)
// ---------------------------------------------------------------------------

describe("el pausado y el desvinculado quedan afuera, y su documento no se toca", () => {
  for (const estado of ["pausado", "eliminado"]) {
    it(`a un asesor ${estado} se le rechaza y no se le escribe nada`, async () => {
      base.perfiles.find((p) => p.id === BRUNO)!.estado = estado
      const r = await pedir()
      expect(r.status).toBe(400)
      expect(String(r.cuerpo.error)).toContain("Bruno Sanguinetti")
      expect(nadaSeEscribioDe(BRUNO)).toEqual(COMO_ESTABA)
    })
  }
})

// ---------------------------------------------------------------------------
// EL CAMPO NUEVO: `pendiente`, y sigue con la versión anterior (spec §7.4.2)
// ---------------------------------------------------------------------------

describe("el campo que la versión nueva trajo y esta persona no tiene", () => {
  const conCampoNuevo = () => {
    base.archivos.set(RUTA_MOLDE_NUEVO, buffer(moldeNuevo(["La comision pactada es de {{COMISION}}."])))
  }

  it("queda pendiente, con la versión ANTERIOR y sin documento generado", async () => {
    conCampoNuevo()
    const r = await pedir()
    expect(r.status).toBe(200)
    expect(r.cuerpo.estado).toBe("pendiente")
    expect(r.cuerpo.camposQueFaltan).toEqual(["COMISION"])

    const fila = filaDe(BRUNO)
    /** Lo que dice el spec §7.4.2: sigue con la versión anterior. */
    expect(fila.version_id).toBe(VER_VIEJA)
    expect(fila.estado).toBe("pendiente")
    expect(String(fila.observacion)).toContain("COMISION")
    expect(fila.docx_path).toBeNull()
  })

  it("no sube ningún archivo", async () => {
    conCampoNuevo()
    await pedir()
    expect(base.escrituras.filter((e) => e.tabla === "storage")).toEqual([])
  })

  /**
   * Un `pendiente` que no se pudo guardar NO puede terminar en verde: el
   * director se iría creyendo que quedó anotado qué le falta a esa persona.
   */
  it("si el guardado del pendiente no toca ninguna fila, se dice", async () => {
    conCampoNuevo()
    base.romper.advisor_documents = "update"
    const r = await pedir()
    expect(r.status).toBe(500)
    expect(filaDe(BRUNO).estado).toBe("ok")
  })
})

// ---------------------------------------------------------------------------
// LA RED: una por una, cada una con las otras tres en verde
// ---------------------------------------------------------------------------

describe("1. que sus datos hayan aterrizado", () => {
  /**
   * ═══ Esta comprobación YA NO SE PUEDE AISLAR en el endpoint, y hay que
   *     decirlo en vez de taparlo ═══
   *
   * Antes se aislaba con el molde que tiene `{{ZONA}}` **solo en una nota al
   * final**: docxtemplater no las rellena, así que el dato no llegaba nunca, y
   * `huecosDe` tampoco las leía, así que la 3 no veía nada. La 1 era la única
   * que frenaba.
   *
   * Ese aislamiento vivía de una CEGUERA, y la ceguera era el agujero: un
   * `{{ZONA}}` bien escrito en la nota al final salía impreso, con las llaves
   * puestas, en un contrato que alguien firma. Al taparlo —la 3 ahora mira el
   * documento entero— este escenario dispara las dos.
   *
   * Y no es que falte buscar otro escenario: **para que la 1 pueda fallar,
   * un hueco tiene que haber quedado sin rellenar, y cualquier hueco sin
   * rellenar deja una marca que la 3 ahora ve.** Las dos son coextensivas acá.
   *
   * Medido, apagando la 1 en `generar.ts` y corriendo la suite: 3 rojos, y en
   * ESTE test el resultado pasa a `['hueco-sin-rellenar']` — el endpoint
   * **sigue frenando y sigue sin escribir nada**. Cambia el diagnóstico, no la
   * protección.
   *
   * Entonces la 1 se queda, pero por lo que de verdad aporta: **nombra el campo
   * y dice cuántas veces tenía que aparecer**, que es lo que el director
   * necesita para arreglarlo. Como red independiente ya no cuenta, y su
   * capacidad de distinguir se sigue midiendo donde sí es distinguible: en los
   * tests de `frenosDeLaGeneracion`, que le pasan las entradas directo (ahí
   * apagarla también da rojo).
   */
  const soloEnLaNota = () => {
    base.archivos.set(
      RUTA_MOLDE_NUEVO,
      buffer(
        docx(
          [
            parrafo("CONTRATO EDICION 2027"),
            parrafo("Y por la otra parte {{NOMBRE}}, mayor de edad, CUIT {{CUIT}}, en adelante EL ASESOR."),
          ],
          "Zona asignada: {{ZONA}}",
        ),
      ),
    )
  }

  it("frena y no escribe NADA de esa persona", async () => {
    soloEnLaNota()
    const r = await pedir()
    /** La conducta PRIMERO: es el testigo. El status es el corolario. */
    expect(nadaSeEscribioDe(BRUNO)).toEqual(COMO_ESTABA)
    expect(r.status).toBe(409)
  })

  it("acá actúan la 1 y la 3, y las otras dos siguen calladas", async () => {
    soloEnLaNota()
    const r = await pedir()
    const codigos = (r.cuerpo.motivos as Array<{ codigo: string }>).map((m) => m.codigo)
    /**
     * Las DOS, y en ese orden. Que estén las dos no es un defecto: las dos
     * dicen algo cierto —el dato no llegó, y quedó una marca en el papel— y el
     * director necesita las dos para entender qué pasó.
     *
     * Lo que este test cuida es que las otras DOS sigan sin disparar: si
     * mañana aparece `dato-ajeno` o `texto-fijo` acá, alguna se volvió
     * demasiado sensible y hay que mirarla.
     */
    expect(codigos).toEqual(["no-aterrizo", "hueco-sin-rellenar"])
  })

  /**
   * El caso que la 3 sola NO podría explicar: el hueco quedó sin rellenar en
   * una parte que el director no mira nunca. Sin la 1, el mensaje diría "quedó
   * una marca" sin decir DE QUÉ CAMPO ni dónde tenía que aparecer.
   */
  it("y el mensaje nombra el campo, que es lo único que la 1 aporta hoy", async () => {
    soloEnLaNota()
    const r = await pedir()
    const noAterrizo = (r.cuerpo.motivos as Array<{ codigo: string; mensaje: string }>).find(
      (m) => m.codigo === "no-aterrizo",
    )
    expect(noAterrizo, "desapareció el motivo que nombra el campo").toBeTruthy()
    expect(noAterrizo!.mensaje).toContain("ZONA")
  })

  it("con el molde sano, la misma persona SÍ se escribe", async () => {
    const r = await pedir()
    expect(r.status).toBe(200)
    expect(filaDe(BRUNO).version_id).toBe(VER_NUEVA)
  })
})

describe("2. que no se le haya colado el dato de otro", () => {
  /**
   * ═══ Cómo se aísla ═══
   *
   * El molde arrastra el CUIT de Ana en una nota al final — que es exactamente
   * lo que pasa de verdad: `ponerHuecosEnDocx` no toca las notas al final, así
   * que el molde se las lleva tal cual del asesor del que salió.
   *
   * Las otras tres pasan: los tres datos de Bruno aterrizan en el cuerpo, no
   * queda ningún hueco, y ningún valor suyo aparece dos veces. El CUIT de Ana
   * es exclusivo de ella —Carla tiene otro— y NO está en el documento viejo de
   * Bruno.
   */
  const conElCuitDeAna = () => {
    base.archivos.set(RUTA_MOLDE_NUEVO, buffer(moldeNuevo([], `Legajo de referencia: ${DATOS[ANA].CUIT}`)))
  }

  it("frena y no escribe NADA de esa persona", async () => {
    conElCuitDeAna()
    const r = await pedir()
    /** La conducta PRIMERO: es el testigo. El status es el corolario. */
    expect(nadaSeEscribioDe(BRUNO)).toEqual(COMO_ESTABA)
    expect(r.status).toBe(409)
  })

  it("es esta comprobación la que actuó, y nombra al dueño del dato", async () => {
    conElCuitDeAna()
    const r = await pedir()
    expect((r.cuerpo.motivos as Array<{ codigo: string }>).map((m) => m.codigo)).toEqual(["dato-ajeno"])
    expect(String(r.cuerpo.error)).toContain("Ana Ruiz")
  })

  /**
   * Y el falso rojo que hay que NO tener: una zona que Bruno y Carla comparten
   * no es el dato de nadie en particular, así que aunque aparezca en el molde
   * no frena.
   */
  it("un dato COMPARTIDO por dos asesores no frena", async () => {
    base.archivos.set(RUTA_MOLDE_NUEVO, buffer(moldeNuevo([], `Sucursal de ${DATOS[CARLA].ZONA}`)))
    const r = await pedir({ advisorId: ANA })
    expect(r.status).toBe(200)
    expect(filaDe(ANA).version_id).toBe(VER_NUEVA)
  })
})

describe("3. que no quede un hueco sin rellenar", () => {
  /**
   * ═══ Cómo se aísla ═══
   *
   * El dato guardado de Bruno trae adentro un `{{FIRMA}}` — pasa cuando el
   * documento del que se extrajo ya tenía una marca escrita a mano. Ese texto
   * entra literal en el documento generado y sale a la firma con las llaves
   * puestas.
   *
   * Las otras tres pasan: el valor entero aterriza (el molde promete `{{ZONA}}`
   * una vez y ahí está una vez), no es dato de nadie más, y no aparece dos
   * veces.
   */
  const conUnHuecoEnElDato = () => {
    filaDe(BRUNO).form_data = { ...DATOS[BRUNO], ZONA: "Belgrano {{FIRMA}}" }
  }

  it("frena y no escribe NADA de esa persona", async () => {
    conUnHuecoEnElDato()
    const r = await pedir()
    /** La conducta PRIMERO: es el testigo. El status es el corolario. */
    expect(nadaSeEscribioDe(BRUNO)).toEqual(COMO_ESTABA)
    expect(r.status).toBe(409)
  })

  it("es esta comprobación la que actuó, y muestra el hueco tal como se ve", async () => {
    conUnHuecoEnElDato()
    const r = await pedir()
    expect((r.cuerpo.motivos as Array<{ codigo: string }>).map((m) => m.codigo)).toEqual(["hueco-sin-rellenar"])
    expect(String(r.cuerpo.error)).toContain("{{FIRMA}}")
  })

  /**
   * ═══ El agujero que esta comprobación estaba dejando pasar ═══
   *
   * Un `{{ZONA}}` **BIEN escrito** en una nota al final. Medido contra este
   * mismo endpoint antes del arreglo: `status=200`, `estado:'ok'`, la fila
   * escrita, y el contrato generado diciendo
   * `"Nota: la zona {{ZONA}} se revisa cada anio."` — con las llaves puestas,
   * en el papel que alguien firma.
   *
   * Se le escapaba a las cinco: la 3 usaba `huecosDe`, que recorre las partes
   * que docxtemplater RELLENA y las notas al final no están ahí; la 5 callaba
   * porque el hueco está bien escrito; la 1 queda tapada acá **a propósito**
   * —la zona de Bruno está en el cuerpo como texto FIJO, así que su dato sí
   * "aterriza" y la cuenta cierra—; y la 4 solo lo vería si el documento viejo
   * de otro nombrara su dato menos veces.
   *
   * Es el hermano del `{{ZONA-2}}` y peor: aquél salía como un blanco, éste
   * sale con la marca a la vista.
   *
   * Este escenario es además el único que aísla a la 3 de la 1, ahora que las
   * dos miran el documento entero.
   */
  const huecoBienEscritoEnLaNota = () => {
    base.archivos.set(
      RUTA_MOLDE_NUEVO,
      buffer(
        docx(
          [
            parrafo("CONTRATO EDICION 2027"),
            parrafo("Y por la otra parte {{NOMBRE}}, mayor de edad, CUIT {{CUIT}}, en adelante EL ASESOR."),
            // La zona de Bruno, pero como texto FIJO: su dato aterriza igual.
            parrafo("Se asigna a EL ASESOR la zona de Belgrano, con captacion preferente."),
          ],
          "Nota: la zona {{ZONA}} se revisa cada anio.",
        ),
      ),
    )
  }

  it("un hueco BIEN escrito en la nota al final también frena, y no se escribe nada", async () => {
    huecoBienEscritoEnLaNota()
    const r = await pedir()
    /** La conducta PRIMERO. Antes del arreglo, acá había un 200 y una fila. */
    expect(nadaSeEscribioDe(BRUNO)).toEqual(COMO_ESTABA)
    expect(r.status).toBe(409)
  })

  it("y lo agarra SOLO la 3: el dato de Bruno sí aterrizó", async () => {
    huecoBienEscritoEnLaNota()
    const r = await pedir()
    expect((r.cuerpo.motivos as Array<{ codigo: string }>).map((m) => m.codigo)).toEqual(["hueco-sin-rellenar"])
    expect(String(r.cuerpo.error)).toContain("{{ZONA}}")
  })
})

describe("4. la cuenta cruzada, acá como freno (el caso Palermo)", () => {
  /**
   * ═══ Cómo se aísla, y por qué es la única que ve este daño ═══
   *
   * Si la zona de la persona de la que salió el molde también estaba en una
   * frase FIJA del contrato, el reemplazo convirtió las DOS en `{{ZONA}}`. El
   * molde queda con el hueco dos veces y el contrato de Bruno dice su zona dos
   * veces, donde una de esas dos tendría que ser una frase del contrato.
   *
   * Las otras tres dan verde: el dato aterrizó (dos veces, que es lo que el
   * molde promete), no hay dato ajeno, no quedó ningún hueco. Lo delata contar
   * cruzado contra los documentos de los otros, donde su dato aparece 1 sola
   * vez.
   */
  const conLaZonaDosVeces = () => {
    base.archivos.set(RUTA_MOLDE_NUEVO, buffer(moldeNuevo(["Atencion en nuestra oficina de {{ZONA}}."])))
  }

  it("frena y no escribe NADA de esa persona", async () => {
    conLaZonaDosVeces()
    const r = await pedir()
    /** La conducta PRIMERO: es el testigo. El status es el corolario. */
    expect(nadaSeEscribioDe(BRUNO)).toEqual(COMO_ESTABA)
    expect(r.status).toBe(409)
  })

  it("es esta comprobación la que actuó, y dice cuántas apariciones sobran", async () => {
    conLaZonaDosVeces()
    const r = await pedir()
    expect((r.cuerpo.motivos as Array<{ codigo: string }>).map((m) => m.codigo)).toEqual(["texto-fijo"])
    expect(String(r.cuerpo.error)).toContain("sobra 1 aparición")
  })
})

describe("5. que no haya un hueco mal escrito en el molde (el agujero silencioso)", () => {
  /**
   * ═══ Por qué es la más grave, y cómo se aísla ═══
   *
   * El director escribió `{{ZONA-2}}` en el Word — un guión en el nombre de un
   * campo es de lo más natural. `huecosDe` no lo lista, docxtemplater sí lo
   * trata como campo, no encuentra el dato y **lo deja en blanco**. La medición
   * completa está en `lib/plantillas/docx.test.ts`.
   *
   * Las otras cuatro pasan, y no por casualidad: para todas, ese campo **no
   * existe**. Los tres datos de Bruno aterrizan; no hay dato ajeno; en el
   * documento generado no queda ningún hueco —el mal escrito desapareció, ese
   * es el problema—; nada aparece dos veces. Es la única que puede verlo, y por
   * eso mira el MOLDE y no el resultado.
   */
  const conUnHuecoMalEscrito = () => {
    base.archivos.set(RUTA_MOLDE_NUEVO, buffer(moldeNuevo(["Zona secundaria: {{ZONA-2}}."])))
  }

  it("frena y no escribe NADA de esa persona", async () => {
    conUnHuecoMalEscrito()
    const r = await pedir()
    /** La conducta PRIMERO: es el testigo. El status es el corolario. */
    expect(nadaSeEscribioDe(BRUNO)).toEqual(COMO_ESTABA)
    expect(r.status).toBe(409)
  })

  it("es esta comprobación la que actuó, y muestra el hueco y su corrección", async () => {
    conUnHuecoMalEscrito()
    const r = await pedir()
    expect((r.cuerpo.motivos as Array<{ codigo: string }>).map((m) => m.codigo)).toEqual(["hueco-mal-escrito"])
    expect(String(r.cuerpo.error)).toContain("{{ZONA-2}}")
    expect(String(r.cuerpo.error)).toContain("{{ZONA_2}}")
  })

  /**
   * Y la prueba de que sin la comprobación el daño es INVISIBLE: con ese molde,
   * el documento que se generaría sale con un blanco donde iba la zona
   * secundaria, y ninguna de las otras cuatro tiene nada que decir.
   */
  it("el daño que tapa: el documento saldría con un blanco", () => {
    const generado = rellenarDocx(moldeNuevo(["Zona secundaria: {{ZONA-2}}."]), DATOS[BRUNO])
    const texto = Object.values(textoPorParte(generado)).join("")
    expect(texto).toContain("Zona secundaria: .")
    expect(texto).not.toContain("ZONA-2")
    expect(huecosDe(generado)).toEqual([])
  })
})

/**
 * El primo RUIDOSO del anterior, y por eso cae en la comprobación 3 y no en la
 * 5: si el `{{ZONA-2}}` viene adentro del DATO guardado de esta persona, no lo
 * borra nadie — sale impreso literal en el contrato. Feo, pero visible. Igual
 * no se escribe.
 */
describe("un hueco mal escrito que viene adentro del dato", () => {
  it("frena por la comprobación 3, y no escribe nada", async () => {
    filaDe(BRUNO).form_data = { ...DATOS[BRUNO], ZONA: "Belgrano {{ZONA-2}}" }
    const r = await pedir()
    expect(nadaSeEscribioDe(BRUNO)).toEqual(COMO_ESTABA)
    expect((r.cuerpo.motivos as Array<{ codigo: string }>).map((m) => m.codigo)).toEqual(["hueco-sin-rellenar"])
    expect(String(r.cuerpo.error)).toContain("{{ZONA-2}}")
  })
})

// ---------------------------------------------------------------------------
// Las defensas que no pueden apagarse en silencio
// ---------------------------------------------------------------------------

describe("una comprobación que no se pudo correr no se da por pasada", () => {
  it("si no se puede abrir su documento original, no se genera nada", async () => {
    base.archivos.delete(RUTA_ORIGINAL(BRUNO))
    const r = await pedir()
    expect(r.status).toBe(400)
    expect(nadaSeEscribioDe(BRUNO)).toEqual(COMO_ESTABA)
  })

  it("si no se puede bajar el molde, no se genera nada", async () => {
    base.archivos.delete(RUTA_MOLDE_NUEVO)
    const r = await pedir()
    expect(r.status).toBe(500)
    expect(nadaSeEscribioDe(BRUNO)).toEqual(COMO_ESTABA)
  })

  it("un molde sin un solo campo adentro se rechaza", async () => {
    base.archivos.set(RUTA_MOLDE_NUEVO, buffer(docx([parrafo("Contrato igual para todos, sin campos.")])))
    const r = await pedir()
    expect(r.status).toBe(400)
    expect(nadaSeEscribioDe(BRUNO)).toEqual(COMO_ESTABA)
  })
})

describe("lo que pasa si la escritura falla", () => {
  it("si no se puede subir el archivo, la fila no se toca", async () => {
    base.romper.storage = "upload"
    const r = await pedir()
    expect(r.status).toBe(500)
    expect(filaDe(BRUNO).version_id).toBe(VER_VIEJA)
    expect(base.escrituras.filter((e) => e.tabla === "advisor_documents")).toEqual([])
  })

  /**
   * El reemplazo del .docx de un asesor deja las cuatro columnas en null
   * (`camposDelReemplazo`). Si mientras corría esto el director le cambió el
   * archivo, lo que se comprobó fue el ANTERIOR: el `.eq` por la ruta hace que
   * el UPDATE no matchee, y eso se tiene que leer como falla, no como éxito.
   */
  it("si le reemplazaron el archivo en el medio, no se escribe un ok sobre algo que nadie miró", async () => {
    /**
     * La carrera, de verdad: el .docx de Bruno se reemplaza DESPUÉS de que el
     * endpoint lo leyó y comprobó, y ANTES del UPDATE. El reemplazo deja las
     * cuatro columnas en null (`camposDelReemplazo`), así que el `.eq` por la
     * ruta hace que este UPDATE no matchee — y cero filas afectadas se tiene que
     * leer como falla, nunca como éxito.
     */
    let lecturas = 0
    base.despuesDeLeer = (tabla) => {
      if (tabla !== "advisor_documents") return
      lecturas += 1
      if (lecturas === 2) filaDe(BRUNO).archivo_original_path = `asesores/${AGENCIA}/${BRUNO}/plantillas/otro.docx`
    }
    const r = await pedir()
    expect(r.status).toBe(500)
    expect(filaDe(BRUNO).version_id).toBe(VER_VIEJA)
    expect(filaDe(BRUNO).estado).toBe("ok")
  })
})
