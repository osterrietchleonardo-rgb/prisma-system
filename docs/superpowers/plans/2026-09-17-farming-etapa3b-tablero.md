# Farming · Etapa 3-B — El tablero, el historial y los indicadores

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el asesor mueva cada puerta por las seis columnas del método, que cada movimiento quede anotado solo —con nombre, fecha y qué hizo—, y que el tablero **sea** el reporte: los nueve indicadores salen de lo que ya movió, sin cargar nada aparte.

**Architecture:** La etapa 3-A dejó las tarjetas y las tablas. Esto agrega el movimiento: un endpoint que cambia la etapa **y** escribe la fila de `farming_contactos` en el mismo pedido, un tablero con `@dnd-kit` que sigue el molde del pipeline de Tracking —incluido su menú «Mover a…», que es el camino real en el celular—, el historial por tarjeta, los indicadores calculados con una sola consulta, y el botón que pasa un propietario al pipeline de Tracking.

**Tech Stack:** Next.js 14 (App Router), React 18, Supabase (Postgres + RLS), `@dnd-kit/core` 6.3, `@dnd-kit/sortable` 10, vitest, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-09-11-farming-zonas-design.md` — «Las 6 columnas», «Los 9 indicadores, sin cargar nada aparte», «El enganche con Tracking Performance».

## Lo que ya está y no se vuelve a hacer

Verificado en el código y contra producción antes de escribir esto:

| Existe | Dónde |
|---|---|
| `farming_direcciones.etapa` con las 7 etapas, `orden`, `proxima_accion`, `proxima_accion_en` | migración `20260917120000`, aplicada |
| `farming_contactos` con `direccion_id`, `propietario_id`, `user_id`, `fecha`, `tipo` (15 valores), `cartas_entregadas`, `etapa_desde`, `etapa_hasta`, `nota` | idem, **tabla vacía**: esta etapa es la que la llena |
| `farming_propietarios.tracking_log_id` | idem, nadie lo escribe todavía |
| `ETAPAS`, `TIPOS`, `VINCULOS`, `validarDireccion`, `valoresImposibles` | `lib/farming/direcciones.ts` |
| `zonaAccesible` / `direccionAccesible` con `Acceso` obligatorio (`"leer"` \| `"escribir"`) | `lib/farming/servidor.ts` |
| La solapa «Relevamiento» con la lista agrupada por etapa, el alta, la edición y las personas | `components/farming/relevamiento.tsx`, `direccion-dialog.tsx`, `propietarios.tsx` |
| `@dnd-kit/core` 6.3.1 y `@dnd-kit/sortable` 10 | `package.json` |
| Un tablero que ya funciona, con `PointerSensor` (`distance: 8`), `KeyboardSensor`, `closestCorners`, `DragOverlay` **y un menú «Mover a…» por tarjeta** | `components/tracking/pipeline/PipelineBoard.tsx:49-51,122,150-179`, `PipelineCard.tsx:69-76` |
| `savePerformanceLog(payload)` — exige `type` (`ActivityType`) y `proceso`, validado contra `PROCESOS_POR_ETAPA` | `actions/tracking/savePerformanceLog.ts:8,34-42` |
| `PROCESOS_POR_ETAPA.prospeccion = ["vendedor","comprador","locador","locatario"]`, `.captacion = ["vendedor","locador"]` | `lib/tracking/proceso.ts:67-74` |

## Global Constraints

- **No se toca la migración aplicada** salvo para agregar lo que esta etapa necesita, en una migración nueva.
- **`createAdminClient` se saltea la RLS.** `direccionAccesible(..., "escribir")` antes de cada escritura, `"leer"` antes de cada lectura. Ya existe: no se escribe una segunda compuerta.
- **Una zona archivada se mira y no se toca.** Mover una tarjeta, escribir historial o pasar a Tracking en una zona archivada es 409. Es la misma regla que ya sostienen los endpoints de 3-A.
- **Sin la fecha del próximo paso no se guarda el movimiento.** Es la regla 4 del punto 9 del PDF y la razón de ser del tablero.
- **El historial se llena solo.** El asesor nunca carga una planilla: cada movimiento escribe su fila. Y queda firmado — `user_id` de la sesión, nunca del body.
- **La próxima acción y su fecha van como línea visible en la tarjeta**, nunca en un globito.
- **En el celular se mueve con el menú, no arrastrando.** Seis columnas no se arrastran con el pulgar: el menú «Mover a…» es el camino principal en pantalla chica, igual que en el tablero de Tracking.
- **El botón a Tracking nunca es automático** (spec): el que dijo «dejá la carta, gracias» no es una prospección.
- **44 px** de alto mínimo en todo lo tocable; los dos temas con tokens; nada se corta a 390 px. Copy en castellano rioplatense.
- Nunca `git add -A`. Rama `feat/farming-tablero`, desde `main` (`7263a22` o posterior).
- **La migración se aplica con el OK de Leonardo**, con el rollback escrito antes. El clasificador del entorno bloquea el «Production Deploy» desde el agente: el comando lo corre él.

## Decisiones tomadas al escribir este plan

1. **El movimiento y su historial van en UN endpoint, no en dos.** Si el asesor mueve la tarjeta y la escritura del historial falla aparte, el tablero miente sobre lo que pasó. Un solo `POST /api/farming/direcciones/[id]/mover` hace las dos cosas, y si la segunda falla **revierte la etapa**. Se hace con dos consultas y una compensación explícita, no con una transacción: PostgREST no da transacciones y una función SQL nueva para esto sería más máquina de la necesaria.
2. **`orden` se recalcula al mover, no se arrastra entre tarjetas.** Reordenar dentro de una columna no está en el spec y agrega un modo de arrastre entero. Al caer en una columna, la tarjeta va al principio (`orden = 0`) y las demás corren. Si al usarlo Leonardo quiere ordenar a mano, es otra etapa.
3. **El tipo de contacto se sugiere según la etapa destino, y se puede cambiar.** `presentado → carta_1`, `en_secuencia → carta_otra`, `respondio → llamada`, `tasacion → tasacion`, `captada → entrevista`, `descartada → otro`, `relevado → visita_encargado`. El spec pide registrar qué se hizo, no adivinarlo: la sugerencia ahorra un toque y el desplegable tiene los 15 valores.
4. **Los indicadores se calculan en el servidor con UNA consulta y se devuelven con la lista**, no con nueve consultas ni en el navegador. El tablero es el reporte (spec), así que el número tiene que llegar con las tarjetas.
5. **El botón a Tracking manda `proceso: "vendedor"` por defecto y deja elegir `locador`.** `PROCESOS_POR_ETAPA.prospeccion` admite cuatro y el servidor los valida; farming es captación, así que los otros dos no aplican. No se manda sin que el asesor lo vea.

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/20260917180000_farming_tablero.sql` | Índice de `farming_contactos(propietario_id)` y el de indicadores. |
| `supabase/rollback/20260917_farming_tablero_rollback.sql` | Vuelta atrás. |
| `lib/farming/tablero.ts` | **Puro.** Las columnas del tablero, el tipo de contacto sugerido por etapa, `validarMovimiento`, y `calcularIndicadores` sobre filas. |
| `lib/farming/tablero.test.ts` | Sus tests. |
| `app/api/farming/direcciones/[id]/mover/route.ts` | POST: cambia la etapa y escribe el historial, o revierte. |
| `app/api/farming/direcciones/[id]/contactos/route.ts` | GET: el historial de una tarjeta. |
| `app/api/farming/direcciones/route.ts` | **Modificar:** devolver los indicadores junto a la lista. |
| `app/api/farming/direcciones/[id]/propietarios/[pid]/tracking/route.ts` | POST: crea la actividad en Tracking y guarda el `tracking_log_id`. |
| `components/farming/tablero.tsx` | El tablero: 6 columnas + descartada plegada, dnd y menú «Mover a…». |
| `components/farming/mover-dialog.tsx` | El diálogo obligatorio: qué hiciste, próximo paso y cuándo. |
| `components/farming/historial.tsx` | El historial firmado de una tarjeta. |
| `components/farming/indicadores.tsx` | Los nueve números. |
| `components/farming/relevamiento.tsx` | **Modificar:** lista ↔ tablero, y los indicadores arriba. |
| `components/farming/propietarios.tsx` | **Modificar:** «→ pasarlo a mi pipeline». |
| `app/api/farming/direcciones/[id]/route.ts` | **Modificar:** recalcular `fuera_de_zona` cuando el PATCH trae `lat`/`lng`; `calle`/`tipo` en `null` explícito → 400. |
| `scripts/farming-rls-ataque.mjs` | **Modificar:** los ataques sobre el historial y sobre mover. |
| Guía del asesor §25 · bitácora · spec | Docs. |

---

### Task 1: Las reglas del tablero, sin base de datos

**Files:**
- Create: `lib/farming/tablero.ts`
- Test: `lib/farming/tablero.test.ts`

**Interfaces:**
- Consumes: `ETAPAS`, `EtapaDireccion` de `@/lib/farming/direcciones`.
- Produces:
  - `const COLUMNAS: EtapaDireccion[]` — las seis, sin `descartada`.
  - `const TIPOS_CONTACTO: { clave: string; etiqueta: string }[]` — los 15 del `check`, en orden de uso.
  - `tipoSugerido(etapa: EtapaDireccion): string`
  - `interface Movimiento { etapa_hasta: EtapaDireccion; tipo: string; nota?: string | null; proxima_accion: string; proxima_accion_en: string; cartas_entregadas?: number | null }`
  - `validarMovimiento(m: Partial<Movimiento>): string[]`
  - `interface FilaIndicadores { tramo: string | null; etapa: EtapaDireccion; unidades_totales: number | null; encargado_nombre: string | null; contactos: { tipo: string; etapa_hasta: string | null }[] }`
  - `interface Indicadores { cuadras: number; propiedades: number; unidades: number; contactos: number; encargados: number; respuestas: number; tasaciones: number; entrevistas: number; captaciones: number }`
  - `calcularIndicadores(filas: FilaIndicadores[]): Indicadores`

- [ ] **Step 1: Escribir el test, que va a fallar porque el módulo no existe**

```ts
// lib/farming/tablero.test.ts
import { describe, it, expect } from "vitest"
import { COLUMNAS, tipoSugerido, validarMovimiento, calcularIndicadores, type FilaIndicadores } from "./tablero"

/**
 * El tablero del método. Las reglas que sostiene este archivo:
 *  1. Seis columnas; «descartada» va al costado y NO es una de ellas.
 *  2. **Sin la fecha del próximo paso no se guarda el movimiento** (regla 4 del punto 9 del PDF).
 *     Es lo único que convierte un tablero en un método.
 *  3. Los nueve indicadores salen de lo que el asesor ya movió, sin cargar nada aparte: el
 *     tablero ES el reporte.
 */

describe("las columnas", () => {
  it("son seis, en el orden del método, y descartada no está", () => {
    expect(COLUMNAS).toEqual(["relevado", "presentado", "en_secuencia", "respondio", "tasacion", "captada"])
    expect(COLUMNAS).not.toContain("descartada")
  })
})

describe("tipoSugerido", () => {
  it("propone lo que uno suele hacer al llegar a esa etapa", () => {
    expect(tipoSugerido("presentado")).toBe("carta_1")
    expect(tipoSugerido("tasacion")).toBe("tasacion")
    expect(tipoSugerido("captada")).toBe("entrevista")
  })

  it("una etapa sin costumbre propia cae en «otro», no rompe", () => {
    expect(tipoSugerido("descartada")).toBe("otro")
  })
})

describe("validarMovimiento", () => {
  const ok = { etapa_hasta: "presentado" as const, tipo: "carta_1", proxima_accion: "Volver a pasar", proxima_accion_en: "2026-09-25" }

  it("con qué hiciste, próximo paso y cuándo, se guarda", () => {
    expect(validarMovimiento(ok)).toEqual([])
  })

  it("SIN la fecha no se guarda, y lo dice", () => {
    const e = validarMovimiento({ ...ok, proxima_accion_en: "" })
    expect(e).toHaveLength(1)
    expect(e[0]).toMatch(/cuándo/i)
  })

  it("sin el próximo paso tampoco", () => {
    expect(validarMovimiento({ ...ok, proxima_accion: "   " })).toHaveLength(1)
  })

  it("una etapa que no existe se rechaza", () => {
    expect(validarMovimiento({ ...ok, etapa_hasta: "mudanza" as any })).toHaveLength(1)
  })

  it("un tipo de contacto que no existe se rechaza", () => {
    expect(validarMovimiento({ ...ok, tipo: "paloma mensajera" })).toHaveLength(1)
  })

  it("una fecha que no es una fecha se rechaza", () => {
    expect(validarMovimiento({ ...ok, proxima_accion_en: "el jueves" })).toHaveLength(1)
  })

  it("junta todos los problemas, no corta en el primero", () => {
    expect(validarMovimiento({}).length).toBeGreaterThan(2)
  })
})

describe("calcularIndicadores", () => {
  const filas: FilaIndicadores[] = [
    { tramo: "Conde 900-1000", etapa: "captada", unidades_totales: 32, encargado_nombre: "Roberto",
      contactos: [{ tipo: "visita_encargado", etapa_hasta: "presentado" }, { tipo: "tasacion", etapa_hasta: "tasacion" }] },
    { tramo: "Conde 900-1000", etapa: "respondio", unidades_totales: 8, encargado_nombre: null,
      contactos: [{ tipo: "carta_1", etapa_hasta: "presentado" }, { tipo: "llamada", etapa_hasta: "respondio" }] },
    { tramo: "Av. Ejemplo 1200", etapa: "relevado", unidades_totales: null, encargado_nombre: "Marta",
      contactos: [] },
  ]

  it("cuenta las cuadras distintas que tienen al menos una dirección", () => {
    expect(calcularIndicadores(filas).cuadras).toBe(2)
  })

  it("las propiedades son las tarjetas, y las unidades su suma", () => {
    const i = calcularIndicadores(filas)
    expect(i.propiedades).toBe(3)
    expect(i.unidades).toBe(40)
  })

  it("los contactos son todas las filas del historial", () => {
    expect(calcularIndicadores(filas).contactos).toBe(4)
  })

  it("un encargado cuenta solo si además lo fueron a ver", () => {
    // La tercera tiene encargado pero ninguna visita: no cuenta.
    expect(calcularIndicadores(filas).encargados).toBe(1)
  })

  it("las respuestas son las tarjetas que PASARON por «respondió», aunque después avanzaran", () => {
    expect(calcularIndicadores(filas).respuestas).toBe(1)
  })

  it("tasaciones y entrevistas salen del tipo de contacto", () => {
    const i = calcularIndicadores(filas)
    expect(i.tasaciones).toBe(1)
    expect(i.entrevistas).toBe(0)
  })

  it("las captaciones son las tarjetas que están en «captada» hoy", () => {
    expect(calcularIndicadores(filas).captaciones).toBe(1)
  })

  it("sin ninguna tarjeta, todo en cero y nada explota", () => {
    expect(calcularIndicadores([])).toEqual({
      cuadras: 0, propiedades: 0, unidades: 0, contactos: 0, encargados: 0,
      respuestas: 0, tasaciones: 0, entrevistas: 0, captaciones: 0,
    })
  })

  it("una cuadra sin nombre no inventa una cuadra", () => {
    expect(calcularIndicadores([{ tramo: null, etapa: "relevado", unidades_totales: 1, encargado_nombre: null, contactos: [] }]).cuadras).toBe(0)
  })
})
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `npx vitest run lib/farming/tablero.test.ts`
Expected: FAIL — `Cannot find module './tablero'`.

- [ ] **Step 3: Escribir la implementación**

```ts
// lib/farming/tablero.ts
//
// Farming · las reglas del tablero, sin base de datos en el medio.
//
// Lo que convierte esto en un método y no en una lista de colores: **al mover una tarjeta hay
// que decir qué hiciste, cuál es el próximo paso y cuándo**. Sin la fecha no se guarda el
// movimiento (regla 4 del punto 9 del PDF). Y los nueve indicadores salen de lo que el asesor
// ya movió: el tablero ES el reporte, no hay una pantalla de carga de números.
import { ETAPAS, type EtapaDireccion } from "./direcciones"

/** Las seis del método. «descartada» existe, pero va al costado y no es una columna del flujo. */
export const COLUMNAS: EtapaDireccion[] = ["relevado", "presentado", "en_secuencia", "respondio", "tasacion", "captada"]

/** Los 15 valores que la base acepta, en el orden en que se usan de verdad. */
export const TIPOS_CONTACTO: { clave: string; etiqueta: string }[] = [
  { clave: "visita_encargado", etiqueta: "Visita al encargado" },
  { clave: "carta_1", etiqueta: "Carta 1" },
  { clave: "carta_2", etiqueta: "Carta 2" },
  { clave: "carta_3", etiqueta: "Carta 3" },
  { clave: "carta_4", etiqueta: "Carta 4" },
  { clave: "carta_5", etiqueta: "Carta 5" },
  { clave: "carta_6", etiqueta: "Carta 6" },
  { clave: "carta_7", etiqueta: "Carta 7" },
  { clave: "carta_otra", etiqueta: "Otra carta" },
  { clave: "llamada", etiqueta: "Llamada" },
  { clave: "whatsapp", etiqueta: "WhatsApp" },
  { clave: "email", etiqueta: "Email" },
  { clave: "tasacion", etiqueta: "Tasación" },
  { clave: "entrevista", etiqueta: "Entrevista" },
  { clave: "otro", etiqueta: "Otro" },
]

const CLAVES_TIPO = TIPOS_CONTACTO.map((t) => t.clave)
const CLAVES_ETAPA = ETAPAS.map((e) => e.clave) as string[]

/** Lo que uno suele hacer al llegar a esa etapa. Es una sugerencia: el desplegable tiene los 15. */
export function tipoSugerido(etapa: EtapaDireccion): string {
  switch (etapa) {
    case "relevado": return "visita_encargado"
    case "presentado": return "carta_1"
    case "en_secuencia": return "carta_otra"
    case "respondio": return "llamada"
    case "tasacion": return "tasacion"
    case "captada": return "entrevista"
    default: return "otro"
  }
}

export interface Movimiento {
  etapa_hasta: EtapaDireccion
  tipo: string
  nota?: string | null
  proxima_accion: string
  proxima_accion_en: string
  cartas_entregadas?: number | null
}

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/

/** Todos los problemas juntos, en criollo. Vacío = se puede guardar el movimiento. */
export function validarMovimiento(m: Partial<Movimiento>): string[] {
  const errores: string[] = []

  if (!m.etapa_hasta || !CLAVES_ETAPA.includes(m.etapa_hasta)) errores.push("Esa columna no existe.")
  if (!m.tipo || !CLAVES_TIPO.includes(m.tipo)) errores.push("Elegí qué hiciste.")
  if (!m.proxima_accion?.trim()) errores.push("Escribí cuál es el próximo paso.")

  // La regla que sostiene el método: sin fecha no hay movimiento. Una tarjeta sin próxima acción
  // con fecha es una tarjeta que se va a olvidar.
  const f = (m.proxima_accion_en || "").trim()
  if (!f) errores.push("Decinos para cuándo es el próximo paso.")
  else if (!ES_FECHA.test(f) || Number.isNaN(new Date(f).getTime())) errores.push("Esa fecha no se entiende.")

  if (m.cartas_entregadas != null && (!Number.isInteger(m.cartas_entregadas) || m.cartas_entregadas < 0)) {
    errores.push("Las cartas entregadas van como un número entero.")
  }

  return errores
}

export interface FilaIndicadores {
  tramo: string | null
  etapa: EtapaDireccion
  unidades_totales: number | null
  encargado_nombre: string | null
  contactos: { tipo: string; etapa_hasta: string | null }[]
}

export interface Indicadores {
  cuadras: number
  propiedades: number
  unidades: number
  contactos: number
  encargados: number
  respuestas: number
  tasaciones: number
  entrevistas: number
  captaciones: number
}

/**
 * Los nueve del punto 8 del PDF, sacados de lo que ya está cargado. Cada uno sale de una sola
 * pregunta, y ninguno se carga a mano.
 */
export function calcularIndicadores(filas: FilaIndicadores[]): Indicadores {
  const cuadras = new Set<string>()
  let unidades = 0, contactos = 0, encargados = 0, respuestas = 0, tasaciones = 0, entrevistas = 0, captaciones = 0

  for (const f of filas) {
    // Una cuadra sin nombre no es una cuadra: no se inventa un tramo vacío.
    if (f.tramo?.trim()) cuadras.add(f.tramo.trim())
    unidades += f.unidades_totales ?? 0
    contactos += f.contactos.length

    // El encargado cuenta cuando además lo fueron a ver: tener su nombre anotado no es haberlo
    // contactado.
    if (f.encargado_nombre?.trim() && f.contactos.some((c) => c.tipo === "visita_encargado")) encargados++

    // «Pasaron por respondió», no «están en respondió»: una que ya avanzó a tasación también
    // respondió, y el indicador mide el método, no la foto de hoy.
    if (f.contactos.some((c) => c.etapa_hasta === "respondio")) respuestas++

    tasaciones += f.contactos.filter((c) => c.tipo === "tasacion").length
    entrevistas += f.contactos.filter((c) => c.tipo === "entrevista").length
    if (f.etapa === "captada") captaciones++
  }

  return { cuadras: cuadras.size, propiedades: filas.length, unidades, contactos, encargados, respuestas, tasaciones, entrevistas, captaciones }
}
```

- [ ] **Step 4: Correr y ver pasar**

Run: `npx vitest run lib/farming/tablero.test.ts`
Expected: PASS, 19 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/farming/tablero.ts lib/farming/tablero.test.ts
git commit -m "feat(farming): las reglas del tablero (columnas, movimiento con fecha obligatoria, los 9 indicadores)"
```

---

### Task 2: La migración de los índices que la 3-B necesita

**Files:**
- Create: `supabase/migrations/20260917180000_farming_tablero.sql`
- Create: `supabase/rollback/20260917_farming_tablero_rollback.sql`

**Alcance:** escribir y commitear. **NO aplicar nada.** No importar `scripts/sql-produccion.mjs` (ejecuta `process.argv[2]` al cargarse).

Lo único que hace falta, y el motivo de cada uno:

```sql
-- supabase/migrations/20260917180000_farming_tablero.sql
--
-- Farming · etapa 3-B: los índices que aparecen recién ahora, cuando el historial se empieza a
-- llenar y los indicadores lo recorren.
--
-- QUÉ NO SE TOCA: ninguna tabla, ninguna columna, ninguna política. Son dos índices.
-- Aplicar por Management API con el OK de Leonardo.
-- Rollback: supabase/rollback/20260917_farming_tablero_rollback.sql

begin;

-- La etapa 3-A dejó `propietario_id` con `on delete set null` y sin índice. Mientras la tabla
-- estuvo vacía no importó; desde que el historial se llena, borrar una persona recorre toda la
-- tabla para poner en null sus filas.
create index if not exists farming_contactos_propietario_idx
  on public.farming_contactos (propietario_id)
  where propietario_id is not null;

-- Los indicadores preguntan «qué contactos tiene esta tarjeta» por cada tarjeta de la zona. El
-- índice de 3-A es (direccion_id, fecha desc), que ya sirve para eso — este es el que falta para
-- las dos preguntas por tipo (tasaciones y entrevistas) y por etapa (respuestas), que hoy
-- recorrerían el historial entero de la agencia.
create index if not exists farming_contactos_tipo_etapa_idx
  on public.farming_contactos (direccion_id, tipo, etapa_hasta);

commit;
```

```sql
-- supabase/rollback/20260917_farming_tablero_rollback.sql
-- Deshace 20260917180000_farming_tablero.sql. Solo borra dos índices: ninguna fila se pierde.
begin;
drop index if exists public.farming_contactos_tipo_etapa_idx;
drop index if exists public.farming_contactos_propietario_idx;
commit;
```

Commit: `feat(farming): los indices del historial (todavia sin aplicar)`.

---

### Task 3: Mover una tarjeta, con su historial en el mismo pedido

**Files:**
- Create: `app/api/farming/direcciones/[id]/mover/route.ts`
- Test: `app/api/farming/direcciones/[id]/mover/route.test.ts`

**Interfaces:**
- Consumes: `direccionAccesible(admin, id, agencyId, userId, "escribir")`; `validarMovimiento`, `COLUMNAS` de `@/lib/farming/tablero`.
- Produces: `POST /api/farming/direcciones/<id>/mover` body `Movimiento` → 200 `{ direccion, contacto }` · 400 (validación) · 403 · 404 · 409 (zona archivada).

Las reglas, en este orden:

1. `requireTenant()`, `createAdminClient()`, `direccionAccesible(..., "escribir")`. Sin excepción.
2. `validarMovimiento(body)`; si devuelve errores, **400 y no se escribe nada**.
3. Se guarda la etapa actual en una variable (`etapa_desde`) **antes** de tocar nada.
4. `update` de `farming_direcciones`: `etapa`, `orden: 0`, `proxima_accion`, `proxima_accion_en`, `updated_at`. **Nunca** `unidades_totales` (es generada), ni `zona_id`, ni `agency_id`.
5. `insert` en `farming_contactos`: `direccion_id`, `agency_id` y `user_id` **de la sesión y de la tarjeta validada**, `fecha` de hoy en horario de Buenos Aires (`new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })` da `YYYY-MM-DD`), `tipo`, `cartas_entregadas`, `etapa_desde`, `etapa_hasta`, `nota`.
6. **Si el insert falla, se revierte la etapa** al valor de `etapa_desde` y se contesta 500 con un mensaje que lo diga: «No pudimos anotar el movimiento, así que dejamos la tarjeta donde estaba.» Un tablero que se movió sin historial miente sobre lo que pasó.
7. Mover a la misma etapa en la que ya está **sí** se permite y escribe historial: es como se anota «pasé otra carta» sin cambiar de columna. Dejarlo dicho en un comentario.

Tests (cada uno tiene que morir si se borra la línea que vigila):
- mueve y escribe la fila del historial con `etapa_desde` y `etapa_hasta` correctos;
- **sin fecha del próximo paso → 400 y ni la etapa ni el historial se tocan**;
- la tarjeta de la zona de un colega → 403 y no escribe;
- una zona archivada → 409 y no escribe;
- `user_id` y `agency_id` salen de la sesión aunque el body mande otros;
- si el insert del historial falla, la etapa vuelve a la de antes (programar el fallo en el doble);
- mover a la misma etapa escribe historial y no rompe;
- una etapa que no existe → 400.

Commit: `feat(farming): mover una tarjeta escribe su historial, o no se mueve`.

---

### Task 4: El historial de una tarjeta, y los indicadores con la lista

**Files:**
- Create: `app/api/farming/direcciones/[id]/contactos/route.ts` (GET)
- Modify: `app/api/farming/direcciones/route.ts` (el GET devuelve `indicadores`)
- Test: `app/api/farming/direcciones/[id]/contactos/route.test.ts`, y ampliar `app/api/farming/direcciones/route.test.ts`

Reglas:
- El GET de contactos pasa por `direccionAccesible(..., "leer")` — una zona archivada **sí** deja leer su historial. Orden: `fecha desc, created_at desc`.
- Devuelve también **quién lo hizo**: el nombre sale de `profiles`, en una sola consulta por el conjunto de `user_id` (no una por fila). Si un perfil no está, el nombre es «un colega», nunca un uuid crudo.
- El GET de direcciones suma `indicadores` calculado con `calcularIndicadores`, alimentado por **una** consulta a `farming_contactos` filtrada por las direcciones de la zona. No nueve consultas, no una por tarjeta.
- Los indicadores son de **la zona pedida**, no de la agencia.

Tests: el historial de la tarjeta de un colega → 403; el de una zona archivada → 200; el nombre de quien movió aparece; los indicadores de una zona con dos tarjetas y cuatro contactos dan los números del test de la Task 1; una zona vacía da todo en cero.

Commit: `feat(farming): el historial firmado y los nueve indicadores`.

---

### Task 5: El botón que pasa un propietario al pipeline de Tracking

**Files:**
- Create: `app/api/farming/direcciones/[id]/propietarios/[pid]/tracking/route.ts`
- Test: su test
- Modify: `components/farming/propietarios.tsx`

**Lo que ya existe y hay que respetar:** `savePerformanceLog(payload)` (`actions/tracking/savePerformanceLog.ts`) exige `type` (`ActivityType`) y `proceso`, y valida el proceso contra `PROCESOS_POR_ETAPA`. Para farming: `type: "prospeccion"` y `proceso: "vendedor"` (o `"locador"` si el asesor lo elige). `PROCESOS_POR_ETAPA.prospeccion` admite los cuatro, así que **el servidor no lo va a rechazar por nosotros**: el que decide es el asesor.

Reglas:
- `POST /api/farming/direcciones/<id>/propietarios/<pid>/tracking` body `{ proceso: "vendedor" | "locador" }`.
- `direccionAccesible(..., "escribir")` sobre la dirección de esa persona: en zona archivada, 409.
- **Si `tracking_log_id` ya está, no se crea otra actividad**: 409 «esta persona ya está en tu pipeline», con el id que ya tiene. Nunca se infla el Tracking del equipo por un doble toque.
- Se llama a `savePerformanceLog` con el nombre y el teléfono de la persona, y `propiedad_ref` con la dirección («Av. Ejemplo 1200 · zona «Palermo»»), para que las dos tarjetas se vean cruzadas.
- El id que devuelve se guarda en `farming_propietarios.tracking_log_id`. Si el guardado falla, la actividad **ya existe**: contestar 200 con un aviso de que quedó creada pero sin enlazar, no un error que invite a apretar de nuevo.
- En la pantalla: un botón por persona, solo si tiene teléfono; con el desplegable de vendedor/locador; y cuando ya está enlazada, en vez del botón va una línea visible «ya está en tu pipeline».
- **Nunca automático** (spec).

Commit: `feat(farming): pasar un propietario al pipeline de Tracking`.

---

### Task 6: El tablero

**Files:**
- Create: `components/farming/tablero.tsx`, `components/farming/mover-dialog.tsx`
- Modify: `components/farming/relevamiento.tsx`

**El molde:** `components/tracking/pipeline/PipelineBoard.tsx` — leerlo antes. De ahí salen: `useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))`, `collisionDetection={closestCorners}`, el `DragOverlay`, y el contenedor `overflow-x-auto` con `inline-flex`. Y de `PipelineCard.tsx:69-76`, **el menú «Mover a…»**, que es el camino real en el celular.

Qué tiene que haber:
1. **Un interruptor lista ↔ tablero** en la solapa Relevamiento. La lista que ya existe no se tira: es la vista que sirve en pantalla chica y la que ya está probada.
2. **Seis columnas** con su nombre y su conteo, en el orden de `COLUMNAS`. **«Descartada» al costado, plegada**, y se despliega tocándola.
3. **Cada tarjeta** muestra calle y altura, tipo, unidades si las tiene, y **la próxima acción con su fecha como línea visible**. Si la fecha ya pasó, se ve distinto — sin depender solo del color, que en un teléfono al sol no se distingue: una palabra («vencida»).
4. **Soltar una tarjeta en otra columna abre el diálogo** y **no mueve nada hasta que se guarda**. Si se cancela, la tarjeta vuelve a donde estaba.
5. **El menú «Mover a…»** en cada tarjeta abre el mismo diálogo, con la columna destino ya elegida. Es el camino principal en el celular y tiene que llegar a 44 px.
6. **El diálogo** (`mover-dialog.tsx`): la columna destino, «qué hiciste» (el desplegable con `TIPOS_CONTACTO`, arrancando en `tipoSugerido`), «cuántas cartas» solo si el tipo es una carta, «cuál es el próximo paso» y «para cuándo» (obligatoria), y una nota opcional. El botón de guardar está deshabilitado mientras `validarMovimiento` devuelva errores, y los muestra.
7. **El historial** (`historial.tsx`) se abre desde la tarjeta: fecha, qué se hizo, de qué columna a cuál, quién y la nota.
8. En una **zona archivada**, el tablero se ve y no se mueve: sin dnd, sin menú, con la línea visible que ya usa la lista.

Verificación antes de commitear: `npx tsc --noEmit`, `npm run lint` y `npm test`, los tres limpios en farming.

Commit: `feat(farming): el tablero de las seis columnas`.

---

### Task 7: Los indicadores en pantalla

**Files:** `components/farming/indicadores.tsx`, y engancharlo en `relevamiento.tsx`.

- Los nueve números arriba de la solapa, con el nombre que usa el método (Cuadras relevadas, Propiedades relevadas, Unidades potenciales, Contactos realizados, Encargados contactados, Respuestas recibidas, Tasaciones solicitadas, Entrevistas, Captaciones).
- **Cada número dice de dónde sale**, en una línea visible al tocarlo o debajo en chico — nunca en un globito.
- En cero no se esconden: un indicador en cero es información («todavía no mandaste ninguna carta»).
- A 390 px entran de a dos o tres por fila, sin cortarse.

Commit: `feat(farming): los nueve indicadores en pantalla`.

---

### Task 8: Las tres trampas que dejó la 3-A

**Files:** `app/api/farming/direcciones/[id]/route.ts` y sus tests.

1. **Recalcular `fuera_de_zona` cuando el PATCH trae `lat` o `lng`.** Hoy el cartel puede quedar mal en las dos direcciones. Se recalcula con el mismo criterio que usa el POST, y si la tarjeta **entra** a la zona se limpia también `fuera_de_zona_desde`.
2. **`calle: null` o `tipo: null` explícitos** vuelven hoy como 500 crudo (son `not null` en la base). Que sean 400 con el mensaje que ya existe.
3. Dejar escrito en el comentario que `fuera_de_zona_desde` con fecha = se cayó al mover el trazo, y en null = nació afuera.

Tests para cada uno, y que mueran si se borra la línea.

Commit: `fix(farming): fuera_de_zona se recalcula al corregir la ubicacion`.

---

### Task 9: El ataque, aplicar, probar y documentar

**Turno del controlador.**

- [ ] **Step 1: Extender el ataque.** En `scripts/farming-rls-ataque.mjs`, con el estilo que ya tiene: B intenta **mover** una tarjeta de A (debe fallar), **leer** su historial (debe fallar), **escribir** una fila de historial a mano (debe fallar), y **pasar a Tracking** un propietario de A (debe fallar). Controles positivos con la zona compartida: B **sí** puede mover y leer el historial. Y el bloque del director: **lee** el historial, **no** mueve.
- [ ] **Step 2: Pedir el OK y aplicar** la migración de los dos índices (explicar que no toca ninguna fila).
- [ ] **Step 3: Correr el ataque.** Todo tiene que fallar, los controles positivos pasar, salida 0.
- [ ] **Step 4: Probar en el navegador** con `prueba-farming-a@vakdor.com`, escritorio y celular, los dos temas:
  1. Mover una tarjeta con el menú y con arrastre; **sin fecha no deja guardar**.
  2. El historial muestra el movimiento con quién y cuándo.
  3. Los nueve indicadores cambian solos al mover.
  4. Una tarjeta con la fecha vencida se distingue sin depender del color.
  5. Pasar un propietario a Tracking, y que la segunda vez diga que ya está.
  6. En una zona archivada, el tablero se ve y no se mueve.
  7. 44 px, nada cortado, consola limpia.
- [ ] **Step 5: Documentar** — guía del asesor §25, bitácora y spec. Después, ofrecer el merge.

---

## Lo que esta etapa cierra

Con esto Farming queda completo contra el spec: el territorio, lo que se publica adentro, lo que se camina, el tablero que lo mueve y los indicadores que lo miden. Lo que quede afuera —cartas por IA, recorrido optimizado, notificaciones— está listado en «Lo que deliberadamente NO va» del spec y sigue afuera a propósito.
