import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest"
import { AsyncLocalStorage } from "node:async_hooks"
import { readFileSync } from "node:fs"
import path from "node:path"

import { estadoDeLaPlantilla } from "@/lib/asesor-docs/confirmacion"

/**
 * PONER EN USO UNA VERSIÓN, Y LA REGLA QUE NO SE PUEDE ROMPER.
 *
 * Este endpoint escribe UNA columna —`advisor_doc_templates.version_actual`— y
 * se niega si queda algún asesor ACTIVO que no esté ya en esa versión.
 *
 * Los testigos son de CONDUCTA: miran `version_actual` y la lista de
 * escrituras, no el texto del error. Un test que solo mirara el mensaje seguiría
 * en verde con la negativa invertida, porque el mensaje lo arma una función pura
 * que tiene sus propios tests.
 */

const AGENCIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const OTRA_AGENCIA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const DIRECTOR = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
const TIPO = "44444444-4444-4444-8444-444444444444"
const OTRO_TIPO = "55555555-5555-4555-8555-555555555555"
const ANA = "11111111-1111-4111-8111-111111111111"
const BRUNO = "22222222-2222-4222-8222-222222222222"
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

type Base = {
  tipos: Array<Record<string, unknown>>
  documentos: Array<Record<string, unknown>>
  perfiles: Array<Record<string, unknown>>
  versiones: Array<Record<string, unknown>>
  escrituras: Array<{ tabla: string; datos?: Record<string, unknown> }>
  romper: Record<string, string | undefined>
}

let base: Base
const baseDelPedido = new AsyncLocalStorage<Base>()

const clienteFalso = (base: Base) => {
  const consulta = (tabla: string, tipo: string, datos?: Record<string, unknown>) => {
    const filtros: Record<string, unknown> = {}
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
      if (base.romper[tabla] === tipo) return { data: null, error: { message: "roto a propósito" } }
      if (tipo === "update") {
        base.escrituras.push({ tabla, datos })
        const afectadas = filtrar()
        for (const f of afectadas) Object.assign(f, datos)
        return { data: afectadas.map((f) => ({ ...f })), error: null }
      }
      return { data: filtrar().map((f) => ({ ...f })), error: null }
    }

    const api: Record<string, unknown> = {
      eq: (col: string, val: unknown) => ((filtros[col] = val), api),
      in: (col: string, val: unknown[]) => ((filtros[col] = val), api),
      order: () => api,
      select: () => api,
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
  }
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => clienteFalso(baseDelPedido.getStore() ?? base),
}))

function armarBase() {
  base = {
    tipos: [
      { id: TIPO, nombre: "Contrato Partnership", agency_id: AGENCIA, estado: "activa", version_actual: VER_VIEJA },
    ],
    documentos: [
      { id: "doc-ana", advisor_id: ANA, agency_id: AGENCIA, template_id: TIPO, version_id: VER_NUEVA, estado: "ok" },
      { id: "doc-bruno", advisor_id: BRUNO, agency_id: AGENCIA, template_id: TIPO, version_id: VER_NUEVA, estado: "ok" },
    ],
    perfiles: [
      { id: ANA, agency_id: AGENCIA, estado: "activo", full_name: "Ana Ruiz" },
      { id: BRUNO, agency_id: AGENCIA, estado: "activo", full_name: "Bruno Sanguinetti" },
    ],
    versiones: [
      { id: VER_VIEJA, template_id: TIPO, agency_id: AGENCIA, version: 1 },
      { id: VER_NUEVA, template_id: TIPO, agency_id: AGENCIA, version: 2 },
      { id: VER_AJENA, template_id: OTRO_TIPO, agency_id: AGENCIA, version: 1 },
    ],
    escrituras: [],
    romper: {},
  }
}

const pedir = async (opciones: { templateId?: string | null; versionId?: string | null } = {}) => {
  const miBase = base
  const { POST } = await import("./route")
  const cuerpo: Record<string, unknown> = {}
  if (opciones.templateId !== null) cuerpo.templateId = opciones.templateId ?? TIPO
  if (opciones.versionId !== null) cuerpo.versionId = opciones.versionId ?? VER_NUEVA

  const res = await baseDelPedido.run(miBase, () =>
    POST(
      new Request("http://localhost/api/asesor-docs/activar-version", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      }),
    ),
  )
  return { status: res.status, cuerpo: (await res.json()) as Record<string, unknown> }
}

/**
 * Importar la ruta ACÁ y no adentro del primer test.
 *
 * Este archivo era el único de los cuatro tests de endpoint sin este bloque, y
 * se notaba: el primer `pedir()` cargaba la ruta entera —y con ella pizzip,
 * docxtemplater y mammoth— DENTRO del presupuesto de 5 s de un test. Medido
 * corriendo el archivo solo: **1.726 ms para ese test, el 95% del tiempo del
 * archivo**, cuando el resto son milisegundos.
 *
 * Con la suite completa, esos 1,7 s compiten con los otros workers y pasan los
 * 5 s: el test daba `Test timed out in 5000ms` **dos veces**, con 12.376 ms en
 * la primera. Un rojo que no tiene nada que ver con lo que el test prueba, y
 * que aparece y desaparece sin que cambie el código — lo peor que puede pasar
 * en un archivo que cuida la regla de que una versión no se pone en uso con
 * gente atrás.
 *
 * El tope de 60 s es del hook, no del test: los tests siguen con el suyo.
 */
beforeAll(async () => {
  await import("./route")
}, 60_000)

beforeEach(() => {
  sesion.agencyId = AGENCIA
  sesion.role = "director"
  fallaLaSesion.valor = false
  armarBase()
})

describe("con todos los activos en la versión nueva, la pone en uso", () => {
  it("escribe version_actual y el estado, y nada más", async () => {
    const r = await pedir()
    expect(r.status).toBe(200)
    expect(base.tipos[0].version_actual).toBe(VER_NUEVA)

    const updates = base.escrituras.filter((e) => e.tabla === "advisor_doc_templates")
    expect(updates).toHaveLength(1)
    expect(Object.keys(updates[0].datos ?? {}).sort()).toEqual(["estado", "updated_at", "version_actual"])
  })

  /**
   * ═══ El cartel tiene que decir la verdad ═══
   *
   * La solapa lee `estado` para decir "Está en uso". Una plantilla con la
   * versión nueva aplicada a TODOS y el cartel diciendo "Borrador" es la
   * pantalla mintiendo — que es lo que esta etapa viene cerrando.
   */
  it("un borrador con todos en verde pasa a activa", async () => {
    base.tipos[0].estado = "borrador"
    const r = await pedir()
    expect(base.tipos[0].estado).toBe("activa")
    expect(r.cuerpo.estado).toBe("activa")
  })

  /**
   * Y por el otro lado: la regla de publicación de la §7.3 sigue mandando. Un
   * asesor en rojo sobre la versión que se activa deja la plantilla en
   * borrador, aunque la versión pase a ser la vigente. Alcanza con UNO.
   */
  it("con un asesor en rojo sobre esa versión, se queda en borrador", async () => {
    base.tipos[0].estado = "borrador"
    base.documentos[1].estado = "revisar"
    await pedir()
    expect(base.tipos[0].version_actual).toBe(VER_NUEVA)
    expect(base.tipos[0].estado).toBe("borrador")
  })

  /** Un estado que nadie escribió tampoco publica: "no se comprobó" no es "está bien". */
  it("con un asesor sin estado, se queda en borrador", async () => {
    base.tipos[0].estado = "borrador"
    base.documentos[1].estado = null
    await pedir()
    expect(base.tipos[0].estado).toBe("borrador")
  })

  /**
   * El pausado no frena la activación (spec §7.5) y tampoco entra en la cuenta
   * de la publicación: dejar que un pausado congele el cartel para siempre
   * sería el mismo aviso que no se apaga haciendo lo que el aviso pide.
   */
  it("un pausado en rojo no impide que el cartel diga activa", async () => {
    base.tipos[0].estado = "borrador"
    base.documentos[1].estado = "revisar"
    base.perfiles[1].estado = "pausado"
    await pedir()
    expect(base.tipos[0].estado).toBe("activa")
  })

  /**
   * ═══ EL TESTIGO DE QUE LA REGLA NO SE DUPLICÓ ═══
   *
   * La condición de publicación vive en `laPlantillaSePublica`, y
   * `estadoDeLaPlantilla` es lo único que la traduce a las dos palabras que van
   * a la base. Si alguien la escribiera de nuevo acá —un ternario, un
   * `every(...) ? "activa" : "borrador"`— habría dos reglas que se pueden
   * separar sin que nadie se entere, y la pantalla mentiría por el otro lado.
   *
   * Se lee el archivo como texto, igual que hace `ficha-css.test.ts` con la
   * ficha pública: los literales NO pueden aparecer, y el llamado SÍ.
   */
  it("la regla de publicación no está escrita de nuevo en el endpoint", () => {
    const fuente = readFileSync(path.join(process.cwd(), "app/api/asesor-docs/activar-version/route.ts"), "utf8")
    /**
     * Se sacan los renglones de comentario, donde las dos palabras se nombran a
     * propósito y muchas veces. Se filtra por renglón y no con un regex de
     * bloque: es lo que se puede leer de un vistazo dentro de seis meses.
     */
    const esComentario = (linea: string) => {
      const t = linea.trim()
      return t.startsWith("*") || t.startsWith("/*") || t.startsWith("//")
    }
    const codigo = fuente
      .split("\n")
      .filter((l) => !esComentario(l))
      .join("\n")
    expect(codigo).toContain("estadoDeLaPlantilla(")
    expect(codigo).not.toMatch(/["']activa["']/)
    expect(codigo).not.toMatch(/["']borrador["']/)
  })

  /**
   * Y el testigo de que es LA MISMA función, no una que se le parece: se le
   * pide a `estadoDeLaPlantilla` el mismo escenario y tiene que dar lo mismo
   * que quedó en la base.
   */
  it("lo que queda en la base es exactamente lo que dice estadoDeLaPlantilla", async () => {
    base.tipos[0].estado = "borrador"
    base.documentos[1].estado = "revisar"
    await pedir()
    expect(base.tipos[0].estado).toBe(
      estadoDeLaPlantilla({
        resultados: [
          { advisorId: ANA, nombre: "Ana Ruiz", estado: "ok", observacion: null },
          { advisorId: BRUNO, nombre: "Bruno Sanguinetti", estado: "revisar", observacion: null },
        ],
        huecosNoColocados: [],
      }),
    )
  })

  it("no escribe ni una fila de advisor_documents", async () => {
    await pedir()
    expect(base.escrituras.filter((e) => e.tabla === "advisor_documents")).toEqual([])
  })
})

describe("LA REGLA: se niega si queda alguien activo atrás", () => {
  /**
   * EL TESTIGO DE CONDUCTA. Mira `version_actual` y la lista de escrituras, no
   * el mensaje: invertir la condición tiene que dejar esto en rojo.
   */
  it("con un asesor activo en la versión vieja, no escribe NADA", async () => {
    base.documentos[1].version_id = VER_VIEJA
    const r = await pedir()
    /** La conducta PRIMERO: es el testigo. El status es el corolario. */
    expect(base.tipos[0].version_actual).toBe(VER_VIEJA)
    expect(base.escrituras).toEqual([])
    expect(r.status).toBe(409)
  })

  it("y lo nombra, con nombre de persona", async () => {
    base.documentos[1].version_id = VER_VIEJA
    const r = await pedir()
    expect(String(r.cuerpo.error)).toContain("Bruno Sanguinetti")
    expect(r.cuerpo.faltan).toEqual([BRUNO])
  })

  /** El que subió su documento después llega con `version_id` en null: también cuenta. */
  it("un asesor sin ninguna versión también frena", async () => {
    base.documentos[1].version_id = null
    const r = await pedir()
    expect(base.tipos[0].version_actual).toBe(VER_VIEJA)
    expect(r.status).toBe(409)
  })

  /**
   * El `pendiente` del spec §7.4.2 es exactamente este caso: le falta un dato,
   * sigue con la versión anterior, y por eso la versión nueva todavía no se
   * puede poner en uso. Es lo que ata las dos mitades de esta tarea.
   */
  it("el que quedó pendiente con la versión anterior frena la activación", async () => {
    base.documentos[1].version_id = VER_VIEJA
    base.documentos[1].estado = "pendiente"
    const r = await pedir()
    expect(base.tipos[0].version_actual).toBe(VER_VIEJA)
    expect(r.status).toBe(409)
  })
})

describe("los pausados y desvinculados no frenan (spec §7.5)", () => {
  for (const estado of ["pausado", "eliminado"]) {
    it(`un asesor ${estado} en la versión vieja deja pasar, y se lo dice`, async () => {
      base.documentos[1].version_id = VER_VIEJA
      base.perfiles[1].estado = estado
      const r = await pedir()
      expect(r.status).toBe(200)
      expect(base.tipos[0].version_actual).toBe(VER_NUEVA)
      expect((r.cuerpo.advertencias as string[]).join(" ")).toContain("Bruno Sanguinetti")
    })
  }

  /**
   * Al que no aparece en `profiles` se lo trata como ACTIVO: la comprobación
   * tiene que fallar hacia "todavía no", nunca hacia "dale". Darlo por pausado
   * dejaría activar con él atrás.
   */
  it("un asesor que no se pudo leer se trata como activo y frena", async () => {
    base.documentos[1].version_id = VER_VIEJA
    base.perfiles = base.perfiles.filter((p) => p.id !== BRUNO)
    const r = await pedir()
    expect(base.tipos[0].version_actual).toBe(VER_VIEJA)
    expect(r.status).toBe(409)
  })
})

describe("autorización y datos del pedido", () => {
  it("sin sesión, 401 y nada escrito", async () => {
    fallaLaSesion.valor = true
    const r = await pedir()
    expect(r.status).toBe(401)
    expect(base.escrituras).toEqual([])
  })

  it("un asesor no puede poner en uso una versión, 403", async () => {
    sesion.role = "asesor"
    const r = await pedir()
    expect(r.status).toBe(403)
    expect(base.escrituras).toEqual([])
  })

  it("la plantilla de otra inmobiliaria no existe para este director, 404", async () => {
    sesion.agencyId = OTRA_AGENCIA
    const r = await pedir()
    expect(r.status).toBe(404)
    expect(base.tipos[0].version_actual).toBe(VER_VIEJA)
  })

  /** La clave foránea garantiza que la versión exista, no que sea de ESTA plantilla. */
  it("una versión de otro tipo de documento, 404", async () => {
    const r = await pedir({ versionId: VER_AJENA })
    expect(r.status).toBe(404)
    expect(base.tipos[0].version_actual).toBe(VER_VIEJA)
  })

  it("sin versionId no se hace nada", async () => {
    const r = await pedir({ versionId: null })
    expect(r.status).toBe(400)
    expect(base.escrituras).toEqual([])
  })

  /**
   * Un `.eq` que no matchea no es un error en PostgREST: devuelve éxito con cero
   * filas. Sin mirar cuántas se tocaron, "no se escribió nada" se leería igual
   * que "se escribió bien" y el director se iría creyendo que quedó en uso.
   */
  it("si el UPDATE no toca ninguna fila, se dice que falló", async () => {
    base.romper.advisor_doc_templates = "update"
    const r = await pedir()
    expect(r.status).toBe(500)
    expect(base.tipos[0].version_actual).toBe(VER_VIEJA)
  })
})
