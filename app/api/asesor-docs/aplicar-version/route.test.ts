import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest"
import { AsyncLocalStorage } from "node:async_hooks"
import { readFileSync } from "node:fs"
import path from "node:path"
import PizZip from "pizzip"

import { rutaDeVersionNueva } from "@/lib/asesor-docs/reglas"

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
  /** Cada ruta que el endpoint intentó BAJAR. Es lo que mide la guarda de prefijo. */
  lecturasDeStorage: string[]
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
        download: async (ruta: string) => {
          base.lecturasDeStorage.push(ruta)
          const buf = base.archivos.get(ruta)
          if (!buf) return { data: null, error: { message: "no existe" } }
          return { data: new Blob([new Uint8Array(buf)]), error: null }
        },
        remove: async (rutas: string[]) => {
          if (base.romper.storage === "remove") return { error: { message: "no se pudo borrar" } }
          for (const r of rutas) base.archivos.delete(r)
          base.escrituras.push({ tabla: "storage", tipo: "remove", filtros: { rutas } })
          return { error: null }
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
    lecturasDeStorage: [],
    romper: {},
  }
}

/** Donde el navegador deja el .docx de la versión nueva antes de llamar. */
const RUTA_SUBIDA = rutaDeVersionNueva(AGENCIA, "subida-de-prueba")

const pedir = async (opciones: {
  zip?: PizZip
  /** La ruta que manda el cliente. Por defecto, una válida de esta agencia. */
  archivoPath?: string | null
  templateId?: string | null
  moldeAdvisorId?: string | null
  /** No dejar el archivo en Storage, para probar la ruta que apunta a la nada. */
  sinSubirlo?: boolean
  /** Campos de más en el cuerpo, para probar que ninguno es de autoridad. */
  extra?: Record<string, unknown>
}) => {
  const miBase = base

  /**
   * El navegador SUBE el archivo a Storage y después llama. Se emula dejando el
   * .docx en el bucket falso antes del pedido.
   */
  if (!opciones.sinSubirlo) {
    base.archivos.set(RUTA_SUBIDA, buffer(opciones.zip ?? versionNuevaDeAna()))
  }

  const { POST } = await import("./route")

  const cuerpo: Record<string, unknown> = {}
  if (opciones.templateId !== null) cuerpo.templateId = opciones.templateId ?? TIPO
  if (opciones.moldeAdvisorId !== null) cuerpo.moldeAdvisorId = opciones.moldeAdvisorId ?? ANA
  if (opciones.archivoPath !== null) cuerpo.archivoPath = opciones.archivoPath ?? RUTA_SUBIDA
  Object.assign(cuerpo, opciones.extra ?? {})

  const res = await baseDelPedido.run(miBase, () =>
    POST(
      new Request("http://localhost/api/asesor-docs/aplicar-version", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      }),
    ),
  )
  return { status: res.status, cuerpo: (await res.json()) as Record<string, unknown> }
}

/** El módulo se carga una vez, antes del primer test: la librería de Word pesa. */
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
    /**
     * Con una ruta de SU propia agencia, para que el pedido llegue hasta la
     * consulta de la plantilla en vez de frenar antes en la guarda de la ruta.
     * Lo que se mide acá es el `.eq("agency_id")`, no la guarda.
     */
    const suya = rutaDeVersionNueva(OTRA_AGENCIA, "subida-de-prueba")
    base.archivos.set(suya, buffer(versionNuevaDeAna()))

    const r = await pedir({ archivoPath: suya, sinSubirlo: true })
    expect(r.status).toBe(404)
    expect(base.versiones).toHaveLength(1)
  })

  // ───────────────────────────────────────────────────────────────────────
  // LA GUARDA DE LA RUTA
  // ───────────────────────────────────────────────────────────────────────

  /**
   * ═══ Por qué esta guarda es la mitad de haber pasado el archivo a una ruta ═══
   *
   * El resto de la Etapa C baja rutas que salen de la BASE, ya filtradas por
   * agencia. Esta la manda el cliente. Y el bucket `documents` es PÚBLICO: sin
   * guarda, una ruta de otra inmobiliaria se baja igual y el contrato ajeno sale
   * en texto plano adentro de `vistaPrevia`.
   *
   * Lo que se mide no es solo el código de respuesta: es que el archivo **no se
   * haya bajado**. Un 400 después de haber leído el contrato ajeno ya sería
   * tarde si mañana ese texto se filtra en un log o en un mensaje de error.
   */
  it("una ruta de OTRA inmobiliaria se rechaza, y el archivo NI SE BAJA", async () => {
    const ajena = rutaDeVersionNueva(OTRA_AGENCIA, "contrato-del-cliente-real")
    base.archivos.set(ajena, buffer(versionNuevaDeAna()))

    const r = await pedir({ archivoPath: ajena })
    expect(r.status).toBe(400)
    expect(r.cuerpo.error as string).toContain("no es de tu inmobiliaria")
    expect(base.lecturasDeStorage).toEqual([])
    expect(base.archivos.has(ajena)).toBe(true)
  })

  it("un agency_id metido en el CUERPO no le sirve para bajar la ruta ajena", async () => {
    /**
     * La guarda compara contra el `agency_id` de la SESIÓN. Si lo tomara del
     * cuerpo, la guarda sería el propio atacante diciendo contra qué
     * compararse: manda la ruta de otra inmobiliaria y, al lado, el agency_id de
     * esa inmobiliaria. El 27-ago-2026 se cerró en producción un agujero por
     * confiar en un dato de autoridad que venía del navegador.
     *
     * Medido con mutación: pasarle `cuerpo.agencyId` a la guarda no ponía nada
     * en rojo hasta que existió este test.
     */
    const ajena = rutaDeVersionNueva(OTRA_AGENCIA, "contrato-del-cliente-real")
    base.archivos.set(ajena, buffer(versionNuevaDeAna()))

    const r = await pedir({ archivoPath: ajena, extra: { agencyId: OTRA_AGENCIA, agency_id: OTRA_AGENCIA } })
    expect(r.status).toBe(400)
    expect(r.cuerpo.error as string).toContain("no es de tu inmobiliaria")
    expect(base.lecturasDeStorage).toEqual([])
    expect(base.archivos.has(ajena)).toBe(true)
  })

  it("una ruta con .. se rechaza sin bajar nada", async () => {
    const r = await pedir({
      archivoPath: `asesores/${AGENCIA}/_versiones-nuevas/../../${OTRA_AGENCIA}/x.docx`,
    })
    expect(r.status).toBe(400)
    expect(base.lecturasDeStorage).toEqual([])
  })

  it("una ruta absoluta se rechaza sin bajar nada", async () => {
    const r = await pedir({ archivoPath: `/${rutaDeVersionNueva(AGENCIA, "x")}` })
    expect(r.status).toBe(400)
    expect(base.lecturasDeStorage).toEqual([])
  })

  it("el .docx de un ASESOR no se puede pasar como versión nueva", async () => {
    /**
     * Es el archivo original que subió el director: la única fuente de verdad
     * contra la que compara toda la verificación. Y como el endpoint borra lo
     * que lee, poder apuntarle acá sería poder borrarlo.
     */
    const original = `asesores/${AGENCIA}/${ANA}/plantillas/ana.docx`
    base.archivos.set(original, buffer(versionNuevaDeAna()))

    const r = await pedir({ archivoPath: original })
    expect(r.status).toBe(400)
    expect(base.lecturasDeStorage).toEqual([])
    expect(base.archivos.has(original)).toBe(true)
  })

  it("el archivo que se leyó se borra del bucket, salga bien o salga mal", async () => {
    const bien = await pedir({})
    expect(bien.status).toBe(200)
    expect(base.archivos.has(RUTA_SUBIDA)).toBe(false)

    armarBase()
    const generico = docx([parrafo("Contrato modelo sin datos de nadie.")])
    const mal = await pedir({ zip: generico })
    expect(mal.status).toBe(400)
    expect(base.archivos.has(RUTA_SUBIDA)).toBe(false)
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
  it("sin la ruta del archivo, 400", async () => {
    const r = await pedir({ archivoPath: null })
    expect(r.status).toBe(400)
    expect(r.cuerpo.error).toContain("Falta el archivo")
    expect(base.lecturasDeStorage).toEqual([])
  })

  it("un PDF, 400 y con el motivo", async () => {
    const r = await pedir({ archivoPath: rutaDeVersionNueva(AGENCIA, "x").replace(".docx", ".pdf") })
    expect(r.status).toBe(400)
    expect(r.cuerpo.error).toContain(".docx")
    expect(base.lecturasDeStorage).toEqual([])
  })

  it("una ruta que no apunta a ningún archivo, 404", async () => {
    const r = await pedir({ sinSubirlo: true })
    expect(r.status).toBe(404)
    expect(r.cuerpo.error).toContain("Volvé a subirlo")
    expect(base.versiones).toHaveLength(1)
  })

  it("un archivo vacío, 400", async () => {
    base.archivos.set(RUTA_SUBIDA, Buffer.alloc(0))
    const r = await pedir({ sinSubirlo: true })
    expect(r.status).toBe(400)
    expect(r.cuerpo.error).toContain("vacío")
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

/**
 * ═══ EL HUECO MAL ESCRITO, RECHAZADO AL SUBIR ═══
 *
 * Medido con las librerías reales el 2026-09-01 (la tabla completa está en
 * `huecosMalEscritos`, en `lib/plantillas/docx.ts`): un `{{ZONA-2}}` escrito a
 * mano en el Word NO lo lista `huecosDe` —el nombre de un campo solo admite
 * letras, números y guión bajo— pero docxtemplater sí lo trata como campo, no
 * encuentra el dato, y **lo deja en blanco**.
 *
 * Sin esto, ese archivo se guardaba como versión, pasaba las tres
 * comprobaciones de este endpoint en VERDE, y el día que se aplicara el
 * contrato de cada asesor salía con un blanco donde iba un dato. Un blanco no
 * se ve.
 *
 * Se rechaza acá, cuando el director acaba de subir el archivo y tiene el Word
 * abierto al lado: es el único momento en que arreglarlo le cuesta treinta
 * segundos.
 */
describe("el hueco mal escrito se rechaza al subir, antes de guardar la versión", () => {
  const conHuecoMalEscrito = (texto: string) => versionNuevaDeAna([texto])

  it("no guarda la versión, y el testigo es que no se creó ninguna", async () => {
    const r = await pedir({ zip: conHuecoMalEscrito("La comision pactada es de {{COMISION-2}}.") })
    /** La conducta primero: no hay versión nueva y el archivo subido se borró. */
    expect(base.versiones).toHaveLength(1)
    expect(base.archivos.has(RUTA_SUBIDA)).toBe(false)
    expect(r.status).toBe(400)
  })

  it("el mensaje nombra el hueco, dice que saldría en blanco y muestra la corrección", async () => {
    const r = await pedir({ zip: conHuecoMalEscrito("La comision pactada es de {{COMISION-2}}.") })
    expect(r.cuerpo.error).toContain("{{COMISION-2}}")
    expect(r.cuerpo.error).toContain("EN BLANCO")
    expect(r.cuerpo.error).toContain("{{COMISION_2}}")
    expect(r.cuerpo.error).toContain("volvé a subir")
  })

  /**
   * Los cinco bordes, todos medidos: los cinco dejan un blanco, así que los
   * cinco se rechazan. Que `normalizarHuecosEscritosAMano` decida NO TOCAR el
   * `{{ }}` vacío y el `{{ dos palabras }}` es otra cosa — no reescribir el
   * contrato de nadie está bien; callar el blanco, no.
   */
  it.each([
    ["un guión", "Zona secundaria: {{ZONA-2}}."],
    ["un punto", "Zona secundaria: {{ZONA.2}}."],
    ["vacío", "Zona secundaria: {{ }}."],
    ["dos palabras", "Zona secundaria: {{ dos palabras }}."],
    ["un acento", "Zona secundaria: {{ZÓNA}}."],
  ])("lo rechaza con %s", async (_caso, texto) => {
    const r = await pedir({ zip: conHuecoMalEscrito(texto) })
    expect(base.versiones).toHaveLength(1)
    expect(r.status).toBe(400)
  })

  /**
   * Y el falso rojo que NO puede tener: un hueco bien escrito a mano es
   * exactamente el camino del spec §7.4.2 —así es como el director declara un
   * campo nuevo— y tiene que seguir pasando.
   */
  it("un hueco BIEN escrito a mano sigue guardando la versión", async () => {
    const r = await pedir({ zip: conHuecoMalEscrito("La comision pactada es de {{COMISION_2}}.") })
    expect(r.status).toBe(200)
    expect(base.versiones).toHaveLength(2)
  })

  it("y con espacios de más adentro, también", async () => {
    const r = await pedir({ zip: conHuecoMalEscrito("La comision pactada es de {{ COMISION_2 }}.") })
    expect(r.status).toBe(200)
    expect(base.versiones).toHaveLength(2)
  })
})

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

  it("un hueco escrito a mano CON ESPACIOS adentro de las llaves también se entiende", async () => {
    /**
     * `docx.ts` documenta que el director escribe los huecos a mano en Word y
     * que ahí sale `{{ NOMBRE }}` con un espacio de más "muy fácil" —tiene un
     * `trim` en el parser justo por eso—. Si acá el hueco de la comprobación se
     * escribiera siempre canónico, el archivo con espacios se rechazaba con un
     * mensaje que hablaba de otra cosa.
     */
    const conEspacios = versionNuevaDeAna(["La comision pactada es del {{ COMISION }} sobre la operacion."])
    const r = await pedir({ zip: conEspacios })
    expect(r.status).toBe(200)
    expect((r.cuerpo.campos as { nuevos: string[] }).nuevos).toEqual(["COMISION"])
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

  it("si el molde relleno NO devuelve el documento de esa persona, se rechaza", async () => {
    /**
     * ═══ El test que faltaba, y por qué faltaba ═══
     *
     * La comprobación del spec §7.4.5 —rellenar el molde con los datos del
     * asesor y comparar contra su documento— no la medía NINGÚN test: cambiar
     * `if (!verificacion.coincide)` por `if (false && …)` dejaba los 956 en
     * verde. O sea que la red de seguridad podía no existir y nadie se enteraba.
     *
     * El caso es real y ambiguo de verdad: el director dejó la zona escrita
     * literal en una cláusula y, más abajo, escribió `{{ZONA}}` a mano en otra.
     * El molde no puede saber cuál de las dos cosas quiso. Rellenarlo con los
     * datos de Ana pone "Villa Urquiza" en los dos lugares, y el segundo, en su
     * archivo, decía `{{ZONA}}`. No coincide, y no se guarda nada.
     */
    const zip = docx([
      parrafo("CONTRATO — EDICION 2027"),
      parrafo("Y por la otra parte Ana Ruiz, CUIT 27-31456789-4, en adelante EL ASESOR."),
      parrafo("Se asigna a EL ASESOR la zona de Villa Urquiza."),
      parrafo("Zona alternativa a convenir: {{ZONA}}."),
    ])
    const r = await pedir({ zip })
    expect(r.status).toBe(400)
    expect(r.cuerpo.error as string).toContain("no reproduce el documento de Ana Ruiz")

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

// ---------------------------------------------------------------------------
// EL HUÉRFANO EN UN BUCKET PÚBLICO
// ---------------------------------------------------------------------------

/**
 * ═══ Por qué esto necesita un test POR CADA VÍA, y no uno ═══
 *
 * El borrado del .docx subido estaba después de la bajada, así que **seis vías
 * de rechazo salían sin borrarlo**: el 403, dos 404, tres 400 y los 500 de
 * lectura. Cada una dejaba un contrato **legible por URL** en el bucket
 * `documents`, que es público — el mismo daño que el cambio a ruta de Storage
 * vino a evitar, entrando por la otra punta.
 *
 * Un test del camino feliz y otro de un rechazo tardío no lo veían, y por eso
 * acá va la lista entera: cada salida que no sea el 200 tiene su caso.
 */
describe("el archivo subido no queda huérfano, salga bien o salga mal", () => {
  const rechazos: Array<{ que: string; status: number; antes: () => void }> = [
    { que: "quien pide no es director", status: 403, antes: () => { sesion.role = "asesor" } },
    { que: "no se puede leer el tipo de documento", status: 500, antes: () => { base.romper.advisor_doc_templates = "select" } },
    { que: "el tipo es de otra inmobiliaria", status: 404, antes: () => { base.tipos[0].agency_id = OTRA_AGENCIA } },
    { que: "la plantilla no tiene versión vigente", status: 400, antes: () => { base.tipos[0].version_actual = null } },
    { que: "no se puede leer la versión vigente", status: 500, antes: () => { base.romper.advisor_doc_template_versions = "select" } },
    { que: "la versión vigente no existe", status: 400, antes: () => { base.versiones = [] } },
    { que: "no se puede leer el documento del asesor", status: 500, antes: () => { base.romper.advisor_documents = "select" } },
    { que: "ese asesor no tiene documento de este tipo", status: 404, antes: () => { base.documentos = base.documentos.filter((d) => d.advisor_id !== ANA) } },
    { que: "no se puede leer al asesor", status: 500, antes: () => { base.romper.profiles = "select" } },
    { que: "el asesor no está en la inmobiliaria", status: 404, antes: () => { base.perfiles = base.perfiles.filter((p) => p.id !== ANA) } },
    { que: "el asesor está pausado", status: 400, antes: () => { base.perfiles[0].estado = "pausado" } },
    { que: "el asesor no tiene datos guardados", status: 400, antes: () => { base.documentos[0].form_data = null } },
  ]

  for (const caso of rechazos) {
    it(`lo borra cuando ${caso.que} (${caso.status})`, async () => {
      caso.antes()
      const r = await pedir({})
      expect(r.status, `el escenario "${caso.que}" ya no devuelve ${caso.status}`).toBe(caso.status)
      expect(base.archivos.has(RUTA_SUBIDA), "quedó un contrato legible por URL").toBe(false)
    })
  }

  /**
   * Las dos vías que quedaban afuera, y quedaban por el ORDEN.
   *
   * Los dos uuid se validaban ARRIBA de la guarda de la ruta, así que un id mal
   * formado devolvía 400 sin borrar: el director subía su contrato, se
   * equivocaba en un id, y el .docx quedaba legible por URL en un bucket
   * público. Bajarlos abajo de la guarda las cierra.
   *
   * El test va con el caso feliz al lado a propósito: sin él, alguien podría
   * "arreglarlo" haciendo que el endpoint borre ANTES de saber de quién es el
   * archivo, que es el agujero de al lado y peor.
   */
  const idsInvalidos: Array<{ que: string; cuerpo: Record<string, unknown> }> = [
    { que: "el tipo de documento no es un uuid", cuerpo: { templateId: "no-soy-un-uuid" } },
    { que: "el tipo de documento no viene", cuerpo: { templateId: null } },
    { que: "el asesor del molde no es un uuid", cuerpo: { moldeAdvisorId: "tampoco" } },
    { que: "el asesor del molde no viene", cuerpo: { moldeAdvisorId: null } },
  ]

  for (const caso of idsInvalidos) {
    it(`lo borra cuando ${caso.que} (400)`, async () => {
      const r = await pedir(caso.cuerpo)
      expect(r.status).toBe(400)
      expect(
        base.archivos.has(RUTA_SUBIDA),
        "un id mal escrito no puede dejar el contrato legible por URL",
      ).toBe(false)
    })
  }

  it("pero una ruta que NO pasó la guarda no se borra, aunque los ids estén mal", async () => {
    /**
     * El borde que hace que lo de arriba no se convierta en un arma: si la ruta
     * es de otra inmobiliaria, ese archivo no es nuestro para borrar. Con los
     * ids inválidos ADEMÁS mal puestos, el endpoint tiene que seguir sin
     * tocarlo — si borrara, sería un borrador de archivos ajenos servido en
     * bandeja.
     */
    const ajena = `asesores/${OTRA_AGENCIA}/_versiones-nuevas/contrato.docx`
    base.archivos.set(ajena, buffer(versionNuevaDeAna()))

    const r = await pedir({ archivoPath: ajena, templateId: "no-soy-un-uuid" })
    expect(r.status).toBe(400)
    expect(base.archivos.has(ajena), "borró un archivo que no es de esta inmobiliaria").toBe(true)
  })

  it("lo borra cuando el archivo está vacío (400)", async () => {
    base.archivos.set(RUTA_SUBIDA, Buffer.alloc(0))
    const r = await pedir({ sinSubirlo: true })
    expect(r.status).toBe(400)
    expect(base.archivos.has(RUTA_SUBIDA)).toBe(false)
  })

  it("lo borra cuando el número de versión choca (409)", async () => {
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
    expect(base.archivos.has(RUTA_SUBIDA)).toBe(false)
  })

  it("lo borra cuando no se puede subir el molde (500)", async () => {
    base.romper.storage = "upload"
    const r = await pedir({})
    expect(r.status).toBe(500)
    expect(base.archivos.has(RUTA_SUBIDA)).toBe(false)
  })

  it("y también en el camino feliz", async () => {
    const r = await pedir({})
    expect(r.status).toBe(200)
    expect(base.archivos.has(RUTA_SUBIDA)).toBe(false)
  })

  /**
   * ═══ El borde que va al revés, y es el más importante de todos ═══
   *
   * Si la ruta NO pasó la guarda de agencia, no se borra nada. Ese archivo no es
   * nuestro: borrarlo convertiría este endpoint en un borrador de archivos
   * ajenos servido en bandeja — mandás la ruta de otra inmobiliaria y el sistema
   * te la borra.
   */
  it("NO borra lo que no pasó la guarda de agencia", async () => {
    const ajena = rutaDeVersionNueva(OTRA_AGENCIA, "contrato-del-cliente-real")
    base.archivos.set(ajena, buffer(versionNuevaDeAna()))

    const r = await pedir({ archivoPath: ajena })
    expect(r.status).toBe(400)
    expect(base.archivos.has(ajena), "se borró un archivo ajeno").toBe(true)
    expect(base.escrituras.filter((e) => e.tipo === "remove")).toEqual([])
  })

  it("un fallo al borrar no le tira abajo el pedido al director", async () => {
    base.romper.storage = "remove"
    const r = await pedir({})
    expect(r.status).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// LA VÍA QUE TODAVÍA NO EXISTE
// ---------------------------------------------------------------------------

/**
 * Los tests de arriba cubren las vías que HAY hoy. Este cubre la que alguien
 * agregue mañana: si aparece un `return NextResponse.json(algo, { status: N })`
 * después de la guarda, se pone en rojo y esa vía no llega a producción dejando
 * un contrato legible por URL.
 */
describe("ninguna vía de rechazo futura se saltea el borrado", () => {
  const FUENTE = readFileSync(path.resolve(__dirname, "route.ts"), "utf8")

  /**
   * Se corta en `createClient()` porque es la línea siguiente a la guarda: todo
   * lo de arriba responde ANTES de que exista una ruta validada, y ahí no hay
   * nada que se pueda borrar.
   */
  const CORTE = "const supabase = createClient()"
  const despuesDeLaGuarda = () => FUENTE.slice(FUENTE.indexOf(CORTE))

  it("el corte existe una sola vez, así que este test mira lo que dice mirar", () => {
    expect(FUENTE.split(CORTE)).toHaveLength(2)
  })

  it("después de la guarda no queda ni un `status:` suelto: todos pasan por rechazar", () => {
    expect(
      despuesDeLaGuarda().match(/\{ status:/g),
      "hay una salida que responde sin borrar el archivo subido: pasala por rechazar()",
    ).toBeNull()
  })

  it("y ahí solo quedan dos NextResponse.json: el de rechazar y el del 200", () => {
    expect(despuesDeLaGuarda().match(/NextResponse\.json\(/g) ?? []).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// LA CUENTA CRUZADA, DE PUNTA A PUNTA
// ---------------------------------------------------------------------------

/**
 * ═══ El agujero, reproducido acá adentro ═══
 *
 * La zona de Ana es "Villa Urquiza" y el contrato nuevo dice, además, "nuestra
 * oficina de Villa Urquiza". El reemplazo convierte las DOS en `{{ZONA}}` y las
 * tres comprobaciones dan verde: el valor no queda pegado en el molde, el ida y
 * vuelta devuelve el documento de Ana letra por letra, y la simulación con
 * centinelas reemplaza las mismas dos apariciones.
 *
 * El daño solo se ve en el contrato de Bruno: "nuestra oficina de Belgrano R".
 *
 * Lo que lo delata es la cuenta cruzada: 2 acá, 1 en el documento de Bruno.
 */
describe("la cuenta cruzada avisa del dato que también es texto fijo", () => {
  /** El contrato NUEVO de Ana, con su zona también metida en una frase fija. */
  const conLaZonaEnElTextoFijo = () =>
    docx([
      parrafo("CONTRATO DE PARTNERSHIP COMERCIAL INMOBILIARIO — EDICION 2027"),
      parrafo("Y por la otra parte Ana Ruiz, mayor de edad, CUIT 27-31456789-4, en adelante EL ASESOR."),
      parrafo("Se asigna a EL ASESOR la zona de Villa Urquiza, con captacion preferente."),
      parrafo("Las consultas se atienden en nuestra oficina de Villa Urquiza, de 9 a 18."),
      parrafo("Aclaracion de la firma de EL ASESOR: Ana Ruiz"),
    ])

  /** El contrato VIEJO de Bruno, donde su zona aparece una sola vez. */
  const contratoViejoDeBruno = (parrafos?: string[]) =>
    docx(
      parrafos?.map(parrafo) ?? [
        parrafo("CONTRATO DE PARTNERSHIP COMERCIAL INMOBILIARIO"),
        parrafo("Y por la otra parte Bruno Sanguinetti, CUIT 20-28765432-1, en adelante EL ASESOR."),
        parrafo("Se asigna a EL ASESOR la zona de Belgrano R."),
        parrafo("Aclaracion de la firma de EL ASESOR: Bruno Sanguinetti"),
      ],
    )

  const conBrunoCargado = (zip = contratoViejoDeBruno()) => {
    base.documentos[1].form_data = {
      NOMBRE: "Bruno Sanguinetti",
      CUIT: "20-28765432-1",
      ZONA: "Belgrano R",
    }
    base.archivos.set(base.documentos[1].archivo_original_path as string, buffer(zip))
  }

  it("lo avisa, con el campo, la cuenta y el lugar — y NO frena", async () => {
    conBrunoCargado()
    const r = await pedir({ zip: conLaZonaEnElTextoFijo() })

    // No frena: el spec §7.4.3 quiere que el director lo vea antes de decir que sí.
    expect(r.status).toBe(200)
    expect(base.versiones.some((v) => v.version === 2)).toBe(true)

    const avisos = (r.cuerpo.advertencias as string[]).join(" ")
    expect(avisos).toContain("ZONA")
    expect(avisos).toContain("Bruno Sanguinetti")
    expect(avisos).toContain("sobra 1 aparición")
    expect(avisos).toContain("nuestra oficina de «Villa Urquiza»")
  })

  it("cuando el otro repite lo mismo, no avisa nada: era el dato de cada uno", async () => {
    conBrunoCargado(
      contratoViejoDeBruno([
        "CONTRATO DE PARTNERSHIP COMERCIAL INMOBILIARIO",
        "Y por la otra parte Bruno Sanguinetti, CUIT 20-28765432-1, en adelante EL ASESOR.",
        "Se asigna a EL ASESOR la zona de Belgrano R.",
        "Las consultas se atienden en nuestra oficina de Belgrano R, de 9 a 18.",
        "Aclaracion de la firma de EL ASESOR: Bruno Sanguinetti",
      ]),
    )
    const r = await pedir({ zip: conLaZonaEnElTextoFijo() })
    expect(r.status).toBe(200)
    expect((r.cuerpo.advertencias as string[]).join(" ")).not.toContain("parte FIJA")
  })

  it("sin nadie con datos cargados, no inventa un aviso", async () => {
    // Bruno sigue con form_data en null, como viene la base.
    const r = await pedir({ zip: conLaZonaEnElTextoFijo() })
    expect(r.status).toBe(200)
    expect((r.cuerpo.advertencias as string[]).join(" ")).not.toContain("parte FIJA")
  })

  it("si el documento del otro no se puede bajar, se sigue sin el aviso en vez de fallar", async () => {
    base.documentos[1].form_data = { ZONA: "Belgrano R" }
    // Y su archivo NO está en Storage.
    const r = await pedir({ zip: conLaZonaEnElTextoFijo() })
    expect(r.status).toBe(200)
    expect((r.cuerpo.advertencias as string[]).join(" ")).not.toContain("parte FIJA")
  })

  it("las tres comprobaciones de arriba dan verde: por eso hace falta esta", async () => {
    /**
     * El testigo de que el agujero es real. Si alguna de las tres lo viera, este
     * pedido sería un 400 y la cuenta cruzada no haría falta.
     */
    conBrunoCargado()
    const r = await pedir({ zip: conLaZonaEnElTextoFijo() })
    expect(r.status).toBe(200)

    // Y el molde guardado tiene el hueco en los DOS lugares: es el daño.
    const guardado = base.archivos.get(`asesores/${AGENCIA}/_plantillas/${TIPO}/v2.docx`)!
    const cuerpo = new PizZip(guardado).file("word/document.xml")!.asText()
    expect(cuerpo.match(/\{\{ZONA\}\}/g) ?? []).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// EL TESTIGO QUE AÍSLA A LA PRUEBA CON CENTINELAS
// ---------------------------------------------------------------------------

/**
 * ═══ Qué cuida este test que ningún otro cuida ═══
 *
 * La prueba con datos centinela y el ida y vuelta del §7.4.5 disparaban siempre
 * juntos, así que ningún test decía cuál de las dos actuaba: la mutación quedaba
 * cazada por el TEXTO del mensaje, no por la conducta.
 *
 * Este escenario las separa. El dato de un campo —"Anabel"— es pedazo de otra
 * palabra del contrato —"Anabella"—, y ahí `ponerHueco` NO tiene que tocar nada:
 * es la regla de borde de palabra que `docx.ts` documenta. Si esa regla se
 * rompiera:
 *
 *  · `valoresQueSobrevivenEnElMolde` seguiría **verde**: "Anabel" ya no está en
 *    ninguna parte del molde, se lo llevó el reemplazo de más;
 *  · el ida y vuelta seguiría **verde**: rellenar con "Anabel" devuelve
 *    "Anabella" y el documento vuelve igualito;
 *  · la prueba con centinelas quedaría en **rojo**, porque la simulación sobre
 *    texto plano —que sí respeta el borde— no toca "Anabella" y el molde sí.
 *
 * O sea: **este es el caso donde la centinela es la única que puede hablar.**
 * Medido con una mutación de `partePalabra` en `lib/plantillas/docx.ts`, que
 * pone este test en rojo con el mensaje de `moldeNoResisteLaPrueba`.
 */
describe("la prueba con centinelas, aislada de la del ida y vuelta", () => {
  const conUnDatoQueEsPedazoDeOtraPalabra = () =>
    docx([
      parrafo("CONTRATO DE PARTNERSHIP COMERCIAL INMOBILIARIO — EDICION 2027"),
      parrafo("Y por la otra parte Ana Ruiz, mayor de edad, CUIT 27-31456789-4, en adelante EL ASESOR."),
      parrafo("Se asigna a EL ASESOR la zona de Villa Urquiza, con captacion preferente."),
      parrafo("Las firmas las certifica la escribana Anabel."),
      parrafo("El estudio Anabella y Asociados interviene como tercero."),
      parrafo("Aclaracion de la firma de EL ASESOR: Ana Ruiz"),
    ])

  const conLaEscribana = () => {
    base.documentos[0].form_data = { ...DATOS_DE_ANA, ESCRIBANA: "Anabel" }
    base.versiones[0].campos_schema = [...SCHEMA_VIGENTE, { nombre: "ESCRIBANA", label: "Escribana", orden: 3 }]
  }

  it("el dato que es pedazo de otra palabra se marca donde va, y NO adentro de la otra", async () => {
    conLaEscribana()
    const r = await pedir({ zip: conUnDatoQueEsPedazoDeOtraPalabra() })
    expect(r.status).toBe(200)

    const guardado = base.archivos.get(`asesores/${AGENCIA}/_plantillas/${TIPO}/v2.docx`)!
    const cuerpo = new PizZip(guardado).file("word/document.xml")!.asText()

    // El hueco entró una sola vez: donde el dato era el dato.
    expect(cuerpo.match(/\{\{ESCRIBANA\}\}/g) ?? []).toHaveLength(1)
    // Y el estudio quedó intacto: no es el dato de nadie.
    expect(cuerpo).toContain("Anabella")
  })

  it("y el documento del asesor vuelve igualito, que es lo que mira el ida y vuelta", async () => {
    conLaEscribana()
    const r = await pedir({ zip: conUnDatoQueEsPedazoDeOtraPalabra() })
    expect(r.status).toBe(200)

    const vista = r.cuerpo.vistaPrevia as { texto: string }
    expect(vista.texto).toContain("la escribana Anabel.")
    expect(vista.texto).toContain("El estudio Anabella y Asociados")
  })
})
