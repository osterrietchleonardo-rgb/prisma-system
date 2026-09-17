# Farming · Etapa 1 (el territorio) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un asesor dibuje su zona de farming (desde Farming o desde el Buscador), que no pueda pisar la de un colega, que la pueda redibujar, sumarle pedazos, compartirla y borrarla, y que el director pueda ver el reparto del territorio y liberar una zona.

**Architecture:** Dos tablas nuevas (`farming_zonas`, `farming_zonas_compartidas`) con RLS por agencia. La geometría (validar, medir, unir, detectar choque) es una librería pura en `lib/farming/geometria.ts` sobre Turf, probada con vitest. Cuatro endpoints en `app/api/farming/` que usan `createAdminClient` con filtros explícitos por usuario/agencia. La pantalla reusa `MapaLienzo` y el lápiz que ya existen en `components/mapa/`, pasándoles capas propias como `children`.

**Tech Stack:** Next.js 14.2 (App Router, route handlers con `params` sincrónico), React 18, react-leaflet 4, `@turf/turf` 7.4, Supabase (Postgres + RLS, sin PostGIS en estas tablas), vitest para `lib/**` y `app/api/**`.

**Spec:** `docs/superpowers/specs/2026-09-11-farming-zonas-design.md` — el plan argumenta desde ahí; quien ejecuta lee los dos.

## Global Constraints

- **No se toca** `mapa_zonas`, `mercado_avisos`, el Buscador IA (salvo un botón en `components/mapa/mapa-zonas-panel.tsx`), el ACM ni Tracking. Ninguna política RLS existente se modifica.
- **Los endpoints usan `createAdminClient`, que se saltea la RLS.** El `.eq("agency_id", …)` y el `.eq("owner_user_id", …)` explícitos **no son opcionales** en ninguna consulta ni escritura (spec, "RLS").
- **Topes** (spec, "Tres topes"): máximo **3** zonas activas por asesor; máximo **5 km²** por zona sumando todos sus pedazos; el director no dibuja ni asigna.
- **Choque = superposición real**: más de **100 m²** o más del **1%** de la zona más chica, lo que sea mayor. Tocarse por una calle no es choque.
- **Un trazo cruzado consigo mismo (un 8) se rechaza**, nunca se guarda.
- **Cada edición vuelve a pasar por el control de choque** y la zona se **excluye a sí misma** de ese control.
- **Farming es una herramienta de asesor**: `role !== "asesor"` no crea zonas (403). El director solo ve y libera.
- **Nombres de pantalla en criollo, sin tecnicismos** (memoria `estilo-guias-funcionales`). Mensajes de error dicen qué hacer, no qué falló técnicamente.
- Toda migración se aplica **por Management API** (`scripts/sql-produccion.mjs`), **con el OK de Leonardo**, con el rollback escrito antes.
- Nunca `git add -A`. Commits chicos, en la rama `farming-zonas` (ya existe, viene de `main`).
- Etapa 1 **no crea** `farming_direcciones` ni las otras tres tablas: van en la etapa 3. Donde una regla de la etapa 3 toca un endpoint de esta (borrar → archivar; redibujar → `fuera_de_zona`), queda un comentario `// ETAPA 3:` con la regla exacta del spec.

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `lib/farming/geometria.ts` | **Puro.** Validar un dibujo, medirlo en km², sumarle un pedazo, detectar choques, bbox. Topes como constantes. |
| `lib/farming/geometria.test.ts` | Los tests de arriba. |
| `lib/farming/tipos.ts` | Solo tipos: lo que viaja entre API y pantalla. |
| `lib/farming/armar.ts` | **Puro.** De filas de la base a `ZonaFarming` / `RespuestaZonas`. |
| `lib/farming/armar.test.ts` | |
| `lib/farming/base-falsa.ts` | Doble de prueba: un cliente de Supabase en memoria para los tests de endpoint. |
| `lib/farming/servidor.ts` | Lo que comparten los cuatro endpoints: las columnas, el manejo de errores y la carga del contexto de la agencia. Vive acá y no en un `route.ts` porque **Next.js rechaza en el build cualquier export de un `route.ts` que no sea un método HTTP o una config** ("is not a valid Route export field"). |
| `supabase/migrations/20260912120000_farming_zonas.sql` | Las dos tablas + RLS. |
| `supabase/rollback/20260912_farming_zonas_rollback.sql` | Cómo volver atrás. |
| `app/api/farming/zonas/route.ts` | GET (todo lo que la pantalla necesita) y POST (crear). |
| `app/api/farming/zonas/route.test.ts` | |
| `app/api/farming/zonas/[id]/route.ts` | PATCH (redibujar / sumar / renombrar) y DELETE. |
| `app/api/farming/zonas/[id]/route.test.ts` | |
| `app/api/farming/zonas/[id]/compartir/route.ts` | POST (sumar a alguien) y DELETE (sacarlo). |
| `app/api/farming/zonas/[id]/liberar/route.ts` | POST, solo director. |
| `app/api/farming/zonas/[id]/compartir-y-liberar.test.ts` | Los dos de arriba. |
| `lib/nav/menu.ts` + `menu.test.ts` | El renglón «Farming» para los dos roles. |
| `components/farming/capas-farming.tsx` | Los polígonos sobre el mapa (propia, ajenas, choques). Vive dentro del `MapContainer`. |
| `components/farming/mapa-farming.tsx` | El mapa con el lápiz en modo nueva / redibujar / sumar / ver. |
| `components/farming/lista-zonas.tsx` | Las tarjetas de «Mis zonas» con sus botones. |
| `components/farming/compartir-dialog.tsx` | Elegir un colega del desplegable. |
| `components/farming/farming-page.tsx` | El contenedor: pide los datos, abre el mapa, habla con la API. |
| `components/farming/farming-director.tsx` | El mapa de la agencia + la lista con «liberar». |
| `app/asesor/farming/page.tsx` · `app/director/farming/page.tsx` | Las rutas. |
| `components/mapa/mapa-zonas-panel.tsx` | **Modificar:** botón «usar para farming». |
| `scratch/farming-rls-ataque.mjs` | El ataque contra producción que tiene que fallar. |

---

### Task 1: La geometría pura

**Files:**
- Create: `lib/farming/geometria.ts`
- Test: `lib/farming/geometria.test.ts`
- Modify: `docs/superpowers/specs/2026-09-11-farming-zonas-design.md` (una línea: `booleanValid` → `kinks`)

**Interfaces:**
- Produces:
  - `type Dibujo = Polygon | MultiPolygon` (de `geojson`)
  - `MAX_VERTICES = 5000`, `MIN_VERTICES_ANILLO = 4`, `MAX_KM2 = 5`, `MAX_ZONAS_ACTIVAS = 3`, `MIN_M2_CHOQUE = 100`, `PCT_CHOQUE = 0.01`
  - `validarDibujo(g: unknown): { ok: true; dibujo: Dibujo } | { ok: false; motivo: string }`
  - `areaKm2(d: Dibujo): number`
  - `contarPedazos(d: Dibujo): number`
  - `sumarPedazo(base: Dibujo, nuevo: Dibujo): Dibujo | null`
  - `interface ZonaParaChoque { id: string; nombre: string; owner_nombre: string; geojson: Dibujo }`
  - `interface Choque { zona_id: string; nombre: string; owner_nombre: string; pct: number; recorte: Dibujo }`
  - `choquesContra(nuevo: Dibujo, otras: ZonaParaChoque[]): Choque[]`
  - `bboxDeDibujo(d: Dibujo): BBox | null` (el `BBox` de `lib/mapa/tipos`)

**Por qué `kinks` y no `booleanValid`:** el spec decía `booleanValid`, pero leído el código de Turf 7.4 (`node_modules/@turf/boolean-valid/dist/esm/index.js`), para un `Polygon` esa función solo chequea que el anillo cierre, que no tenga pinchazos y que los agujeros no crucen el borde. **No detecta que el anillo exterior se cruce consigo mismo.** Lo que sí lo detecta es `kinks()`, que devuelve los puntos de auto-intersección. Se usan las dos: `booleanValid` para la forma general y `kinks` para el 8.

- [ ] **Step 1: Escribir los tests, que van a fallar porque el módulo no existe**

```ts
// lib/farming/geometria.test.ts
import { describe, it, expect } from "vitest"
import {
  validarDibujo, areaKm2, contarPedazos, sumarPedazo, choquesContra, bboxDeDibujo,
  MAX_VERTICES, MAX_KM2, MAX_ZONAS_ACTIVAS, MIN_M2_CHOQUE,
  type Dibujo,
} from "./geometria"

/**
 * La geometría del territorio. Las reglas que sostiene este archivo:
 *  1. Un dibujo que no es polígono, no cierra, está fuera del mapa, tiene demasiados
 *     puntos o SE CRUZA CONSIGO MISMO (un 8) se rechaza con un motivo en criollo.
 *  2. El área se mide en km² sobre TODOS los pedazos.
 *  3. Sumar un pedazo suelto da MultiPolygon; sumar uno que se toca da un solo Polygon.
 *  4. Choque = superposición REAL: más de 100 m² o más del 1% de la zona más chica.
 *     Tocarse por una calle no es choque.
 *  5. El recorte del choque se devuelve para dibujarlo rayado.
 */

// Cuadrados en Belgrano. GeoJSON va [lng, lat]. A esta latitud, 0.01° de lng ≈ 0,92 km y
// 0.01° de lat ≈ 1,11 km, así que un cuadrado de 0.01 × 0.01 ronda 1 km².
const cuadrado = (lng: number, lat: number, lado = 0.01): Dibujo => ({
  type: "Polygon",
  coordinates: [[[lng, lat], [lng + lado, lat], [lng + lado, lat + lado], [lng, lat + lado], [lng, lat]]],
})

const LNG = -58.46
const LAT = -34.56

describe("validarDibujo", () => {
  it("acepta un cuadrado bien cerrado", () => {
    const v = validarDibujo(cuadrado(LNG, LAT))
    expect(v.ok).toBe(true)
  })

  it("acepta un MultiPolygon de dos pedazos", () => {
    const d: Dibujo = { type: "MultiPolygon", coordinates: [cuadrado(LNG, LAT).coordinates as any, cuadrado(LNG + 0.05, LAT).coordinates as any] }
    expect(validarDibujo(d).ok).toBe(true)
  })

  it.each<[string, unknown]>([
    ["null", null],
    ["un punto", { type: "Point", coordinates: [LNG, LAT] }],
    ["sin coordenadas", { type: "Polygon" }],
    ["anillo abierto", { type: "Polygon", coordinates: [[[LNG, LAT], [LNG + 0.01, LAT], [LNG + 0.01, LAT + 0.01], [LNG, LAT + 0.01]]] }],
    ["tres puntos", { type: "Polygon", coordinates: [[[LNG, LAT], [LNG + 0.01, LAT], [LNG, LAT]]] }],
    ["fuera del mapa", { type: "Polygon", coordinates: [[[200, LAT], [201, LAT], [201, LAT + 1], [200, LAT + 1], [200, LAT]]] }],
    ["coordenada NaN", { type: "Polygon", coordinates: [[[LNG, LAT], [NaN, LAT], [LNG + 0.01, LAT + 0.01], [LNG, LAT + 0.01], [LNG, LAT]]] }],
  ])("rechaza %s", (_, g) => {
    const v = validarDibujo(g)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.motivo.length).toBeGreaterThan(0)
  })

  it("rechaza un trazo con más de MAX_VERTICES puntos", () => {
    const anillo: number[][] = []
    for (let i = 0; i <= MAX_VERTICES; i++) {
      const a = (i / MAX_VERTICES) * 2 * Math.PI
      anillo.push([LNG + 0.01 * Math.cos(a), LAT + 0.01 * Math.sin(a)])
    }
    anillo.push(anillo[0])
    const v = validarDibujo({ type: "Polygon", coordinates: [anillo] })
    expect(v.ok).toBe(false)
  })

  it("rechaza un 8: el trazo que se cruza consigo mismo", () => {
    // Moño: las dos diagonales se cruzan en el medio.
    const ocho = { type: "Polygon", coordinates: [[[LNG, LAT], [LNG + 0.01, LAT + 0.01], [LNG + 0.01, LAT], [LNG, LAT + 0.01], [LNG, LAT]]] }
    const v = validarDibujo(ocho)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.motivo).toMatch(/cruza/)
  })
})

describe("areaKm2 y contarPedazos", () => {
  it("un cuadrado de 0.01° ronda 1 km²", () => {
    const a = areaKm2(cuadrado(LNG, LAT))
    expect(a).toBeGreaterThan(0.9)
    expect(a).toBeLessThan(1.2)
  })

  it("dos pedazos suman sus áreas", () => {
    const d: Dibujo = { type: "MultiPolygon", coordinates: [cuadrado(LNG, LAT).coordinates as any, cuadrado(LNG + 0.05, LAT).coordinates as any] }
    expect(areaKm2(d)).toBeGreaterThan(1.8)
    expect(contarPedazos(d)).toBe(2)
    expect(contarPedazos(cuadrado(LNG, LAT))).toBe(1)
  })

  it("el tope de 5 km² y el de 3 zonas son los del spec", () => {
    expect(MAX_KM2).toBe(5)
    expect(MAX_ZONAS_ACTIVAS).toBe(3)
    expect(MIN_M2_CHOQUE).toBe(100)
  })
})

describe("sumarPedazo", () => {
  it("un pedazo suelto da un MultiPolygon de dos", () => {
    const r = sumarPedazo(cuadrado(LNG, LAT), cuadrado(LNG + 0.05, LAT))
    expect(r?.type).toBe("MultiPolygon")
    expect(r && contarPedazos(r)).toBe(2)
  })

  it("un pedazo que se solapa se funde en un solo Polygon", () => {
    const r = sumarPedazo(cuadrado(LNG, LAT), cuadrado(LNG + 0.005, LAT))
    expect(r?.type).toBe("Polygon")
    expect(r && areaKm2(r)).toBeGreaterThan(1.3)
  })

  it("se puede sumar un pedazo a una zona que ya tiene dos", () => {
    const dos = sumarPedazo(cuadrado(LNG, LAT), cuadrado(LNG + 0.05, LAT))!
    const tres = sumarPedazo(dos, cuadrado(LNG + 0.1, LAT))
    expect(tres && contarPedazos(tres)).toBe(3)
  })
})

describe("choquesContra", () => {
  const juan = { id: "zj", nombre: "Belgrano C", owner_nombre: "Juan Pérez", geojson: cuadrado(LNG, LAT) }

  it("sin superposición no hay choque", () => {
    expect(choquesContra(cuadrado(LNG + 0.05, LAT), [juan])).toEqual([])
  })

  it("compartir una calle (tocarse por el borde) NO es choque", () => {
    // Pegado a la derecha: comparten exactamente la arista x = LNG + 0.01.
    expect(choquesContra(cuadrado(LNG + 0.01, LAT), [juan])).toEqual([])
  })

  it("una superposición mínima (menos de 100 m²) NO es choque", () => {
    // Se mete 0.00005° (~5 m) en una franja de 0.0001° (~11 m): ~55 m².
    const pelo: Dibujo = { type: "Polygon", coordinates: [[[LNG + 0.00995, LAT], [LNG + 0.01, LAT], [LNG + 0.01, LAT + 0.0001], [LNG + 0.00995, LAT + 0.0001], [LNG + 0.00995, LAT]]] }
    expect(choquesContra(pelo, [juan])).toEqual([])
  })

  it("pisar la mitad devuelve el choque con el porcentaje y el recorte", () => {
    const r = choquesContra(cuadrado(LNG + 0.005, LAT), [juan])
    expect(r).toHaveLength(1)
    expect(r[0].zona_id).toBe("zj")
    expect(r[0].owner_nombre).toBe("Juan Pérez")
    expect(r[0].pct).toBeGreaterThanOrEqual(45)
    expect(r[0].pct).toBeLessThanOrEqual(55)
    expect(areaKm2(r[0].recorte)).toBeGreaterThan(0.4)
  })

  it("una zona chica adentro de una grande es choque del 100%", () => {
    const r = choquesContra(cuadrado(LNG + 0.002, LAT + 0.002, 0.003), [juan])
    expect(r).toHaveLength(1)
    expect(r[0].pct).toBe(100)
  })

  it("revisa contra todas y devuelve solo las que pisa", () => {
    const maria = { id: "zm", nombre: "Núñez", owner_nombre: "María", geojson: cuadrado(LNG + 0.2, LAT) }
    const r = choquesContra(cuadrado(LNG + 0.005, LAT), [juan, maria])
    expect(r.map((c) => c.zona_id)).toEqual(["zj"])
  })

  it("un dibujo ajeno roto se saltea, no rompe el control", () => {
    const rota = { id: "zr", nombre: "Rota", owner_nombre: "X", geojson: { type: "Polygon", coordinates: [] } as any }
    expect(choquesContra(cuadrado(LNG + 0.005, LAT), [rota, juan])).toHaveLength(1)
  })
})

describe("bboxDeDibujo", () => {
  it("abarca todos los pedazos de un MultiPolygon", () => {
    const d = sumarPedazo(cuadrado(LNG, LAT), cuadrado(LNG + 0.05, LAT))!
    const b = bboxDeDibujo(d)!
    expect(b.oeste).toBeCloseTo(LNG, 5)
    expect(b.este).toBeCloseTo(LNG + 0.06, 5)
    expect(b.sur).toBeCloseTo(LAT, 5)
    expect(b.norte).toBeCloseTo(LAT + 0.01, 5)
  })
})
```

- [ ] **Step 2: Correrlos y verlos fallar**

Run: `npx vitest run lib/farming/geometria.test.ts`
Expected: FAIL — `Cannot find module './geometria'`.

- [ ] **Step 3: Escribir la implementación**

```ts
// lib/farming/geometria.ts
//
// Farming · la geometría del territorio: validar un dibujo, medirlo, sumarle un pedazo y
// detectar si pisa el de otro asesor.
//
// Corre en el servidor con Turf y no en la base A PROPÓSITO (spec, "La exclusividad"): esta
// cuenta corre UNA vez cuando alguien guarda una zona, no en cada búsqueda. Acá se prueba
// con polígonos reales sin tocar producción, y el mensaje del choque se arma donde se
// muestra.
//
// GeoJSON escribe [lng, lat], al revés de como se dice una coordenada.
import { area, booleanValid, featureCollection, intersect, kinks, union } from "@turf/turf"
import type { Feature, MultiPolygon, Polygon, Position } from "geojson"
import type { BBox } from "@/lib/mapa/tipos"

export type Dibujo = Polygon | MultiPolygon

/** Un trazo a mano trae ~300 vértices; más que esto es basura o un ataque. */
export const MAX_VERTICES = 5000
/** Menos de esto no es una zona, es un click sin querer (misma regla que el lápiz). */
export const MIN_VERTICES_ANILLO = 4
/** Los topes del spec ("Tres topes que se implementan así, salvo que Leonardo diga otra cosa"). */
export const MAX_KM2 = 5
export const MAX_ZONAS_ACTIVAS = 3
/** Dos zonas que comparten una calle se tocan sin pisarse: el choque exige superposición REAL. */
export const MIN_M2_CHOQUE = 100
export const PCT_CHOQUE = 0.01

export type Validacion = { ok: true; dibujo: Dibujo } | { ok: false; motivo: string }

export interface ZonaParaChoque {
  id: string
  nombre: string
  owner_nombre: string
  geojson: Dibujo
}

export interface Choque {
  zona_id: string
  nombre: string
  owner_nombre: string
  /** Qué porcentaje del dibujo NUEVO cae sobre esa zona. */
  pct: number
  /** El pedazo que se pisa, para dibujarlo rayado. */
  recorte: Dibujo
}

const feature = (d: Dibujo): Feature<Polygon | MultiPolygon> => ({ type: "Feature", properties: {}, geometry: d })

function anillos(d: Dibujo): Position[][] {
  return d.type === "Polygon" ? d.coordinates : d.coordinates.flat()
}

/**
 * Devuelve el dibujo listo para guardar, o el motivo —en criollo— por el que no sirve. Los
 * motivos se muestran tal cual al asesor: dicen qué hacer, no qué falló técnicamente.
 */
export function validarDibujo(g: unknown): Validacion {
  const d = g as Dibujo
  if (!d || typeof d !== "object" || (d.type !== "Polygon" && d.type !== "MultiPolygon")) {
    return { ok: false, motivo: "Eso no es una zona dibujada" }
  }
  if (!Array.isArray(d.coordinates) || d.coordinates.length === 0) {
    return { ok: false, motivo: "El dibujo está vacío" }
  }

  let vertices = 0
  for (const anillo of anillos(d)) {
    if (!Array.isArray(anillo) || anillo.length < MIN_VERTICES_ANILLO) {
      return { ok: false, motivo: "El trazo es demasiado chico: dibujá la zona sin soltar" }
    }
    for (const p of anillo) {
      if (!Array.isArray(p) || p.length < 2) return { ok: false, motivo: "El dibujo tiene un punto roto" }
      const lng = Number(p[0])
      const lat = Number(p[1])
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return { ok: false, motivo: "El dibujo tiene un punto roto" }
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return { ok: false, motivo: "El dibujo se sale del mapa" }
      vertices++
    }
    const primero = anillo[0]
    const ultimo = anillo[anillo.length - 1]
    if (primero[0] !== ultimo[0] || primero[1] !== ultimo[1]) {
      return { ok: false, motivo: "El trazo no cierra: volvé a dibujarlo" }
    }
  }
  if (vertices > MAX_VERTICES) return { ok: false, motivo: "El dibujo tiene demasiados puntos: hacelo más simple" }

  // kinks devuelve los puntos donde el trazo se corta a sí mismo (un 8). booleanValid NO lo
  // detecta: mira la forma general (anillos que cierran, sin pinchazos, agujeros adentro).
  // Van en este orden a propósito: el cruce tiene su propio mensaje, y un 8 rompe el cálculo
  // de solapamiento, así que se pide redibujar y nunca se guarda.
  if (kinks(d).features.length > 0) {
    return { ok: false, motivo: "El trazo se cruza consigo mismo: redibujalo sin que las líneas se pisen" }
  }
  if (!booleanValid(d)) return { ok: false, motivo: "El trazo tiene una forma rara: volvé a dibujarlo" }

  return { ok: true, dibujo: d }
}

/** Área geodésica en km² de todos los pedazos juntos. */
export function areaKm2(d: Dibujo): number {
  return area(feature(d)) / 1_000_000
}

export function contarPedazos(d: Dibujo): number {
  return d.type === "Polygon" ? 1 : d.coordinates.length
}

/**
 * Suma un pedazo a un dibujo. Dos pedazos que se tocan se funden en uno; sueltos quedan
 * como MultiPolygon. Devuelve null si Turf no pudo unirlos (dibujo roto).
 */
export function sumarPedazo(base: Dibujo, nuevo: Dibujo): Dibujo | null {
  try {
    const r = union(featureCollection([feature(base), feature(nuevo)]))
    return r ? r.geometry : null
  } catch {
    return null
  }
}

/**
 * Contra qué zonas se pisa un dibujo, y cuánto. El umbral evita que dos zonas que comparten
 * una calle cuenten como choque: se exige más de MIN_M2_CHOQUE o más de PCT_CHOQUE de la
 * zona más chica, lo que sea MAYOR.
 *
 * Una zona ajena con dibujo roto se saltea (se registra en consola): no puede bloquear a
 * todos los demás por estar mal guardada.
 */
export function choquesContra(nuevo: Dibujo, otras: ZonaParaChoque[]): Choque[] {
  const areaNuevo = area(feature(nuevo))
  const choques: Choque[] = []

  for (const z of otras) {
    let recorte: Feature<Polygon | MultiPolygon> | null
    let areaOtra: number
    try {
      areaOtra = area(feature(z.geojson))
      recorte = intersect(featureCollection([feature(nuevo), feature(z.geojson)]))
    } catch (e) {
      console.warn(`Farming: la zona ${z.id} (${z.nombre}) tiene un dibujo roto y se salteó en el control de choque`, e)
      continue
    }
    if (!recorte) continue

    const areaRecorte = area(recorte)
    const umbral = Math.max(MIN_M2_CHOQUE, PCT_CHOQUE * Math.min(areaNuevo, areaOtra))
    if (areaRecorte <= umbral) continue

    choques.push({
      zona_id: z.id,
      nombre: z.nombre,
      owner_nombre: z.owner_nombre,
      pct: Math.min(100, Math.round((areaRecorte / areaNuevo) * 100)),
      recorte: recorte.geometry,
    })
  }
  return choques
}

/** Rectángulo que encierra TODOS los pedazos (bboxDePoligono de lib/mapa mira solo el primero). */
export function bboxDeDibujo(d: Dibujo): BBox | null {
  let sur = Infinity, norte = -Infinity, oeste = Infinity, este = -Infinity
  for (const anillo of anillos(d)) {
    for (const p of anillo) {
      const lng = Number(p[0]), lat = Number(p[1])
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
      if (lat < sur) sur = lat
      if (lat > norte) norte = lat
      if (lng < oeste) oeste = lng
      if (lng > este) este = lng
    }
  }
  if (!Number.isFinite(sur) || !Number.isFinite(oeste)) return null
  return { sur, oeste, norte, este }
}
```

- [ ] **Step 4: Correr los tests y verlos pasar**

Run: `npx vitest run lib/farming/geometria.test.ts`
Expected: PASS, 22 tests. Si "un pedazo que se solapa se funde en un solo Polygon" falla porque `union` devuelve `MultiPolygon`, revisar que los dos cuadrados realmente se pisen (`LNG + 0.005` con lado `0.01` → se pisan 50%).

- [ ] **Step 5: Corregir la línea del spec y commitear**

En `docs/superpowers/specs/2026-09-11-farming-zonas-design.md`, sección "La exclusividad", punto 1, reemplazar:

`**\`booleanValid\`**: un trazo a mano alzada puede cruzarse consigo mismo`

por:

`**\`booleanValid\` + \`kinks\`**: un trazo a mano alzada puede cruzarse consigo mismo` y agregar al final del punto: `(leído el código de Turf 7.4: \`booleanValid\` solo no detecta el cruce del anillo exterior; \`kinks\` sí).`

```bash
git add lib/farming/geometria.ts lib/farming/geometria.test.ts docs/superpowers/specs/2026-09-11-farming-zonas-design.md
git commit -m "feat(farming): geometria del territorio (validar, medir, sumar pedazos, choques)

booleanValid de Turf NO detecta un trazo que se cruza consigo mismo (leido
el codigo): se suma kinks(). Corregida la linea del spec."
```

---

### Task 2: La migración (dos tablas + RLS) y su aplicación

**Files:**
- Create: `supabase/migrations/20260912120000_farming_zonas.sql`
- Create: `supabase/rollback/20260912_farming_zonas_rollback.sql`
- Create: `scratch/aplicar-sql.mjs` (aplica un archivo .sql por Management API)

**Interfaces:**
- Produces: tablas `public.farming_zonas` y `public.farming_zonas_compartidas` con las columnas exactas de abajo. Los endpoints de las tareas 3-5 dependen de estos nombres.

- [ ] **Step 1: Escribir el rollback primero**

```sql
-- supabase/rollback/20260912_farming_zonas_rollback.sql
-- Deshace 20260912120000_farming_zonas.sql. Borra SOLO las dos tablas nuevas de Farming.
-- No toca mapa_zonas, mercado_avisos ni ninguna otra tabla.
begin;
drop table if exists public.farming_zonas_compartidas;
drop table if exists public.farming_zonas;
commit;
```

- [ ] **Step 2: Escribir la migración**

```sql
-- supabase/migrations/20260912120000_farming_zonas.sql
--
-- Farming · etapa 1: el territorio.
-- Spec: docs/superpowers/specs/2026-09-11-farming-zonas-design.md
--
-- QUÉ NO SE TOCA: mapa_zonas (las zonas del Buscador siguen privadas, misma RLS),
-- mercado_avisos, profiles. Esto es TODO aditivo: dos tablas nuevas.
--
-- Las zonas de farming son VISIBLES para toda la agencia (el contorno y de quién es): sin
-- eso, dibujar a ciegas choca una y otra vez. Escribir, solo el dueño; liberar, el director.
-- La app usa createAdminClient (saltea RLS) con filtros explícitos: estas políticas son la
-- red de abajo para quien entre por PostgREST directo.
--
-- Aplicar por Management API (scripts/sql-produccion.mjs) con el OK de Leonardo.
-- Rollback: supabase/rollback/20260912_farming_zonas_rollback.sql

begin;

create table if not exists public.farming_zonas (
  id                  uuid primary key default gen_random_uuid(),
  agency_id           uuid not null,
  owner_user_id       uuid not null references auth.users(id) on delete cascade,
  nombre              text not null,
  -- Polygon o MultiPolygon: una zona puede tener varios pedazos (spec, "Editar el trazo").
  geojson             jsonb not null,
  -- Calculada con Turf al guardar, sobre la suma de los pedazos.
  area_km2            numeric(10,4) not null default 0,
  -- De qué zona del Buscador se copió. SIN clave foránea a propósito: borrar la del
  -- Buscador no tiene que tocar el territorio.
  origen_mapa_zona_id uuid,
  estado              text not null default 'activa'
                      check (estado in ('activa', 'liberada', 'archivada')),
  liberada_en         timestamptz,
  liberada_por        uuid,
  motivo_liberacion   text,
  -- Última vez que cambió la forma. El cartel "fuera de zona" (etapa 3) lo usa.
  trazo_editado_en    timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.farming_zonas is
  'Territorio de farming de un asesor. Visible para la agencia; edita el dueño; libera el director. Spec 2026-09-11.';

create index if not exists farming_zonas_agencia_estado_idx on public.farming_zonas (agency_id, estado);
create index if not exists farming_zonas_owner_idx          on public.farming_zonas (owner_user_id);

create table if not exists public.farming_zonas_compartidas (
  zona_id      uuid not null references public.farming_zonas(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  agregado_por uuid not null,
  created_at   timestamptz not null default now(),
  primary key (zona_id, user_id)
);

comment on table public.farming_zonas_compartidas is
  'Con qué asesores comparte su zona el dueño. Los dos trabajan el mismo tablero.';

create index if not exists farming_zonas_compartidas_user_idx on public.farming_zonas_compartidas (user_id);

-- ── RLS ──
alter table public.farming_zonas enable row level security;
alter table public.farming_zonas_compartidas enable row level security;

-- Ver: cualquier miembro de la agencia (el contorno y de quién es).
drop policy if exists farming_zonas_ver_agencia on public.farming_zonas;
create policy farming_zonas_ver_agencia on public.farming_zonas
  for select to authenticated
  using (agency_id in (select agency_id from public.profiles where id = auth.uid()));

-- Crear: solo para uno mismo y en la propia agencia.
drop policy if exists farming_zonas_crear_propia on public.farming_zonas;
create policy farming_zonas_crear_propia on public.farming_zonas
  for insert to authenticated
  with check (
    owner_user_id = auth.uid()
    and agency_id in (select agency_id from public.profiles where id = auth.uid())
  );

-- Editar: el dueño, o el director de la agencia (para liberar).
drop policy if exists farming_zonas_editar on public.farming_zonas;
create policy farming_zonas_editar on public.farming_zonas
  for update to authenticated
  using (
    owner_user_id = auth.uid()
    or agency_id in (select agency_id from public.profiles where id = auth.uid() and role = 'director')
  )
  with check (
    owner_user_id = auth.uid()
    or agency_id in (select agency_id from public.profiles where id = auth.uid() and role = 'director')
  );

-- Borrar: solo el dueño.
drop policy if exists farming_zonas_borrar_propia on public.farming_zonas;
create policy farming_zonas_borrar_propia on public.farming_zonas
  for delete to authenticated
  using (owner_user_id = auth.uid());

-- Compartidas: ver, la agencia; sumar o sacar a alguien, solo el dueño de la zona.
drop policy if exists farming_compartidas_ver on public.farming_zonas_compartidas;
create policy farming_compartidas_ver on public.farming_zonas_compartidas
  for select to authenticated
  using (exists (
    select 1 from public.farming_zonas z
    where z.id = zona_id
      and z.agency_id in (select agency_id from public.profiles where id = auth.uid())
  ));

drop policy if exists farming_compartidas_escribe_duenio on public.farming_zonas_compartidas;
create policy farming_compartidas_escribe_duenio on public.farming_zonas_compartidas
  for all to authenticated
  using (exists (select 1 from public.farming_zonas z where z.id = zona_id and z.owner_user_id = auth.uid()))
  with check (exists (select 1 from public.farming_zonas z where z.id = zona_id and z.owner_user_id = auth.uid()));

commit;
```

- [ ] **Step 3: El script que aplica un archivo .sql**

`scripts/sql-produccion.mjs` recibe la consulta por argumento; con un archivo de 100 líneas y comillas eso no viaja bien por PowerShell. Este envoltorio lee el archivo y llama a la misma función:

```js
// scratch/aplicar-sql.mjs
// Aplica un archivo .sql a producción por Management API. Uso:
//   node scratch/aplicar-sql.mjs supabase/migrations/20260912120000_farming_zonas.sql
// Leer es libre; DDL necesita el OK de Leonardo (CLAUDE.md, regla 3).
import fs from "node:fs"
import { sql } from "../scripts/sql-produccion.mjs"

const archivo = process.argv[2]
if (!archivo) throw new Error("Falta la ruta del .sql")
const texto = fs.readFileSync(archivo, "utf8")
console.log(`Aplicando ${archivo} (${texto.length} caracteres)…`)
console.log(JSON.stringify(await sql(texto), null, 2))
```

- [ ] **Step 4: Pedirle el OK a Leonardo — en criollo, diciendo PRIMERO qué no se toca**

Mensaje (adaptar, pero con estas cuatro partes): (1) **No se toca nada de lo que existe**: ni `mapa_zonas`, ni `mercado_avisos`, ni los asesores, ni ninguna política. (2) **Qué se crea**: dos tablas vacías, `farming_zonas` y `farming_zonas_compartidas`. (3) **Qué pasa si sale mal**: el rollback borra esas dos tablas y nada más; como nacen vacías, no hay datos que perder. (4) **Cómo se aplica**: por la Management API, en una transacción — si algo falla a mitad, no queda nada a medias.

**No seguir sin el OK.**

- [ ] **Step 5: Aplicar y verificar contra producción**

```bash
node scratch/aplicar-sql.mjs supabase/migrations/20260912120000_farming_zonas.sql
node scripts/sql-produccion.mjs "select table_name from information_schema.tables where table_schema='public' and table_name like 'farming%' order by 1"
node scripts/sql-produccion.mjs "select tablename, policyname, cmd from pg_policies where tablename like 'farming%' order by 1,2"
```

Expected: las 2 tablas; 6 políticas (`farming_zonas_ver_agencia` SELECT, `farming_zonas_crear_propia` INSERT, `farming_zonas_editar` UPDATE, `farming_zonas_borrar_propia` DELETE, `farming_compartidas_ver` SELECT, `farming_compartidas_escribe_duenio` ALL).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260912120000_farming_zonas.sql supabase/rollback/20260912_farming_zonas_rollback.sql
git commit -m "feat(farming): tablas farming_zonas y farming_zonas_compartidas con RLS por agencia

Aplicada en produccion por Management API el 2026-09-XX con OK de Leonardo."
```

(Poner la fecha real del día en que se aplicó en lugar de `2026-09-XX`.)

(`scratch/` está gitignoreado: el script queda en disco, no se versiona.)

---

### Task 3: Tipos, armado de respuesta y el doble de base

**Files:**
- Create: `lib/farming/tipos.ts`
- Create: `lib/farming/armar.ts`
- Test: `lib/farming/armar.test.ts`
- Create: `lib/farming/base-falsa.ts`

**Interfaces:**
- Produces (tipos.ts):
  - `interface Colega { id: string; nombre: string }`
  - `interface ZonaFarming { id; nombre; geojson: Dibujo; area_km2: number; pedazos: number; estado: "activa"|"liberada"|"archivada"; owner_user_id; owner_nombre; origen_mapa_zona_id: string|null; trazo_editado_en: string|null; created_at: string; compartida_con: Colega[] }`
  - `interface ContornoAjeno { id; nombre; owner_nombre; geojson: Dibujo }`
  - `interface RespuestaZonas { mias: ZonaFarming[]; compartidas_conmigo: ZonaFarming[]; ajenas: ContornoAjeno[]; equipo: ZonaFarming[]; colegas: Colega[]; topes: { max_zonas: number; max_km2: number } }`
  - `interface RespuestaChoque { error: string; choques: Choque[] }`
- Produces (armar.ts):
  - `interface FilaZona { id; agency_id; owner_user_id; nombre; geojson; area_km2; origen_mapa_zona_id; estado; trazo_editado_en; created_at }`
  - `interface FilaCompartida { zona_id; user_id; agregado_por; created_at }`
  - `interface FilaPerfil { id; full_name: string|null; role: string|null; estado: string|null }`
  - `nombreDe(perfiles: FilaPerfil[], id: string): string`
  - `armarZona(fila: FilaZona, compartidas: FilaCompartida[], perfiles: FilaPerfil[]): ZonaFarming`
  - `armarRespuesta(args: { filas: FilaZona[]; compartidas: FilaCompartida[]; perfiles: FilaPerfil[]; userId: string; role: string }): RespuestaZonas`
  - `colegasActivos(perfiles: FilaPerfil[], userId: string): Colega[]`
- Produces (base-falsa.ts): `baseFalsa(tablas: Record<string, any[]>) => { from(tabla): consulta; tablas }` — soporta `select/insert/update/delete/eq/neq/in/order/limit/single/maybeSingle` y es thenable.

- [ ] **Step 1: Los tipos**

```ts
// lib/farming/tipos.ts
// Solo tipos: lo que viaja entre la API de Farming y la pantalla. Nada ejecutable.
import type { Choque, Dibujo } from "./geometria"

export type { Choque, Dibujo }

export interface Colega {
  id: string
  nombre: string
}

export interface ZonaFarming {
  id: string
  nombre: string
  geojson: Dibujo
  area_km2: number
  pedazos: number
  estado: "activa" | "liberada" | "archivada"
  owner_user_id: string
  owner_nombre: string
  origen_mapa_zona_id: string | null
  trazo_editado_en: string | null
  created_at: string
  compartida_con: Colega[]
}

/** Lo mínimo de una zona ajena: la forma y de quién es. Para no dibujar a ciegas. */
export interface ContornoAjeno {
  id: string
  nombre: string
  owner_nombre: string
  geojson: Dibujo
}

export interface RespuestaZonas {
  mias: ZonaFarming[]
  compartidas_conmigo: ZonaFarming[]
  ajenas: ContornoAjeno[]
  /** Solo para el director: todas las activas de la agencia, completas. Vacío para el asesor. */
  equipo: ZonaFarming[]
  /** Asesores activos de la agencia (sin uno mismo), para el desplegable de compartir. */
  colegas: Colega[]
  topes: { max_zonas: number; max_km2: number }
}

export interface RespuestaChoque {
  error: string
  choques: Choque[]
}
```

- [ ] **Step 2: El test del armado**

```ts
// lib/farming/armar.test.ts
import { describe, it, expect } from "vitest"
import { armarRespuesta, armarZona, colegasActivos, nombreDe, type FilaPerfil, type FilaZona } from "./armar"

/**
 * De filas de la base a lo que ve la pantalla. Reglas:
 *  1. "mías" son las que tengo como dueño; "compartidas conmigo" las que otro me sumó;
 *     "ajenas" son solo contornos (forma + de quién), nunca la zona completa.
 *  2. El director recibe "equipo" con todas; el asesor lo recibe vacío.
 *  3. Colegas = asesores ACTIVOS de la agencia, sin uno mismo, sin pausados ni eliminados.
 *  4. Un perfil sin nombre no rompe nada: "otro asesor".
 */

const cuadrado = { type: "Polygon" as const, coordinates: [[[-58.46, -34.56], [-58.45, -34.56], [-58.45, -34.55], [-58.46, -34.55], [-58.46, -34.56]]] }

const YO = "u-yo", JUAN = "u-juan", MARIA = "u-maria", PAUSADO = "u-pausado", DIRECTOR = "u-dir"

const perfiles: FilaPerfil[] = [
  { id: YO, full_name: "Leo", role: "asesor", estado: "activo" },
  { id: JUAN, full_name: "Juan Pérez", role: "asesor", estado: "activo" },
  { id: MARIA, full_name: null, role: "asesor", estado: null },
  { id: PAUSADO, full_name: "Pausado", role: "asesor", estado: "pausado" },
  { id: DIRECTOR, full_name: "El Director", role: "director", estado: "activo" },
]

const fila = (id: string, owner: string, nombre = "Zona"): FilaZona => ({
  id, agency_id: "ag", owner_user_id: owner, nombre, geojson: cuadrado, area_km2: 1.02,
  origen_mapa_zona_id: null, estado: "activa", trazo_editado_en: null, created_at: "2026-09-12T10:00:00Z",
})

describe("nombreDe y colegasActivos", () => {
  it("un perfil sin nombre se llama 'otro asesor'", () => {
    expect(nombreDe(perfiles, MARIA)).toBe("otro asesor")
    expect(nombreDe(perfiles, "no-existe")).toBe("otro asesor")
    expect(nombreDe(perfiles, JUAN)).toBe("Juan Pérez")
  })

  it("colegas: asesores activos, sin uno mismo, sin pausados, sin el director", () => {
    expect(colegasActivos(perfiles, YO).map((c) => c.id)).toEqual([JUAN, MARIA])
  })
})

describe("armarZona", () => {
  it("cuenta los pedazos y resuelve los nombres de los compartidos", () => {
    const z = armarZona(fila("z1", YO), [{ zona_id: "z1", user_id: JUAN, agregado_por: YO, created_at: "" }], perfiles)
    expect(z.pedazos).toBe(1)
    expect(z.owner_nombre).toBe("Leo")
    expect(z.compartida_con).toEqual([{ id: JUAN, nombre: "Juan Pérez" }])
  })
})

describe("armarRespuesta", () => {
  const filas = [fila("z-mia", YO, "Mía"), fila("z-juan", JUAN, "De Juan"), fila("z-maria", MARIA, "De María")]
  const compartidas = [{ zona_id: "z-maria", user_id: YO, agregado_por: MARIA, created_at: "" }]

  it("asesor: mías, compartidas conmigo, y el resto como contorno", () => {
    const r = armarRespuesta({ filas, compartidas, perfiles, userId: YO, role: "asesor" })
    expect(r.mias.map((z) => z.id)).toEqual(["z-mia"])
    expect(r.compartidas_conmigo.map((z) => z.id)).toEqual(["z-maria"])
    expect(r.ajenas.map((z) => z.id)).toEqual(["z-juan"])
    expect(Object.keys(r.ajenas[0]).sort()).toEqual(["geojson", "id", "nombre", "owner_nombre"])
    expect(r.equipo).toEqual([])
    expect(r.colegas.map((c) => c.id)).toEqual([JUAN, MARIA])
    expect(r.topes).toEqual({ max_zonas: 3, max_km2: 5 })
  })

  it("director: nada propio, todas en equipo", () => {
    const r = armarRespuesta({ filas, compartidas, perfiles, userId: DIRECTOR, role: "director" })
    expect(r.mias).toEqual([])
    expect(r.equipo.map((z) => z.id)).toEqual(["z-mia", "z-juan", "z-maria"])
    expect(r.ajenas.map((z) => z.id)).toEqual(["z-mia", "z-juan", "z-maria"])
  })
})
```

- [ ] **Step 3: Correrlo y verlo fallar**

Run: `npx vitest run lib/farming/armar.test.ts`
Expected: FAIL — `Cannot find module './armar'`.

- [ ] **Step 4: Implementar el armado**

```ts
// lib/farming/armar.ts
// De filas de la base a lo que ve la pantalla. Puro, sin Supabase: se prueba solo.
import { contarPedazos, MAX_KM2, MAX_ZONAS_ACTIVAS, type Dibujo } from "./geometria"
import type { Colega, ContornoAjeno, RespuestaZonas, ZonaFarming } from "./tipos"

export interface FilaZona {
  id: string
  agency_id: string
  owner_user_id: string
  nombre: string
  geojson: Dibujo
  area_km2: number | string
  origen_mapa_zona_id: string | null
  estado: "activa" | "liberada" | "archivada"
  trazo_editado_en: string | null
  created_at: string
}

export interface FilaCompartida {
  zona_id: string
  user_id: string
  agregado_por: string
  created_at: string
}

export interface FilaPerfil {
  id: string
  full_name: string | null
  role: string | null
  estado: string | null
}

export function nombreDe(perfiles: FilaPerfil[], id: string): string {
  const nombre = perfiles.find((p) => p.id === id)?.full_name?.trim()
  return nombre || "otro asesor"
}

/** Asesores con los que se puede compartir: activos, de la agencia, sin uno mismo. */
export function colegasActivos(perfiles: FilaPerfil[], userId: string): Colega[] {
  return perfiles
    .filter((p) => p.id !== userId && p.role === "asesor" && p.estado !== "pausado" && p.estado !== "eliminado")
    .map((p) => ({ id: p.id, nombre: nombreDe(perfiles, p.id) }))
}

export function armarZona(fila: FilaZona, compartidas: FilaCompartida[], perfiles: FilaPerfil[]): ZonaFarming {
  return {
    id: fila.id,
    nombre: fila.nombre,
    geojson: fila.geojson,
    area_km2: Number(fila.area_km2) || 0,
    pedazos: contarPedazos(fila.geojson),
    estado: fila.estado,
    owner_user_id: fila.owner_user_id,
    owner_nombre: nombreDe(perfiles, fila.owner_user_id),
    origen_mapa_zona_id: fila.origen_mapa_zona_id,
    trazo_editado_en: fila.trazo_editado_en,
    created_at: fila.created_at,
    compartida_con: compartidas
      .filter((c) => c.zona_id === fila.id)
      .map((c) => ({ id: c.user_id, nombre: nombreDe(perfiles, c.user_id) })),
  }
}

export function armarRespuesta(args: {
  filas: FilaZona[]
  compartidas: FilaCompartida[]
  perfiles: FilaPerfil[]
  userId: string
  role: string
}): RespuestaZonas {
  const { filas, compartidas, perfiles, userId, role } = args
  const todas = filas.map((f) => armarZona(f, compartidas, perfiles))
  const esDirector = role === "director"

  const mias = todas.filter((z) => z.owner_user_id === userId)
  const compartidasConmigo = todas.filter((z) => z.owner_user_id !== userId && z.compartida_con.some((c) => c.id === userId))
  // El contorno ajeno es SOLO forma + de quién: la zona completa de otro no viaja al asesor.
  const ajenas: ContornoAjeno[] = todas
    .filter((z) => esDirector || (z.owner_user_id !== userId && !compartidasConmigo.some((c) => c.id === z.id)))
    .map((z) => ({ id: z.id, nombre: z.nombre, owner_nombre: z.owner_nombre, geojson: z.geojson }))

  return {
    mias,
    compartidas_conmigo: compartidasConmigo,
    ajenas,
    equipo: esDirector ? todas : [],
    colegas: colegasActivos(perfiles, userId),
    topes: { max_zonas: MAX_ZONAS_ACTIVAS, max_km2: MAX_KM2 },
  }
}
```

- [ ] **Step 5: Correr y ver pasar**

Run: `npx vitest run lib/farming/armar.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: El doble de base para los tests de endpoint**

```ts
// lib/farming/base-falsa.ts
//
// DOBLE DE PRUEBA. Un cliente de Supabase en memoria, con lo justo que usan los endpoints de
// Farming: from().select().eq().neq().in().order().limit().single().maybeSingle(), insert(),
// update(), delete(). Es thenable, como el real. No toca red.
//
// Solo lo importan los *.test.ts: no va a producción.

type Fila = Record<string, any>
type Predicado = (f: Fila) => boolean

export function baseFalsa(inicial: Record<string, Fila[]>) {
  const tablas: Record<string, Fila[]> = JSON.parse(JSON.stringify(inicial))
  let siguienteId = 1

  function from(tabla: string) {
    const filas = () => (tablas[tabla] ??= [])
    let op: "select" | "insert" | "update" | "delete" = "select"
    let carga: any = null
    const filtros: Predicado[] = []
    let orden: { col: string; asc: boolean } | null = null
    let tope: number | null = null
    let unico = false
    let quizas = false

    const q: any = {
      select: () => q,
      insert: (f: any) => { op = "insert"; carga = f; return q },
      update: (p: any) => { op = "update"; carga = p; return q },
      delete: () => { op = "delete"; return q },
      eq: (c: string, v: any) => { filtros.push((f) => f[c] === v); return q },
      neq: (c: string, v: any) => { filtros.push((f) => f[c] !== v); return q },
      in: (c: string, vs: any[]) => { filtros.push((f) => vs.includes(f[c])); return q },
      order: (c: string, o?: { ascending?: boolean }) => { orden = { col: c, asc: o?.ascending !== false }; return q },
      limit: (n: number) => { tope = n; return q },
      single: () => { unico = true; return q },
      maybeSingle: () => { unico = true; quizas = true; return q },
      then: (resolve: (r: { data: any; error: any }) => void) => {
        const pasa = (f: Fila) => filtros.every((p) => p(f))
        let res: Fila[]
        if (op === "insert") {
          const nuevas = (Array.isArray(carga) ? carga : [carga]).map((f: Fila) => ({
            id: `id-${siguienteId++}`,
            created_at: new Date().toISOString(),
            ...f,
          }))
          filas().push(...nuevas)
          res = nuevas
        } else if (op === "update") {
          res = filas().filter(pasa)
          for (const f of res) Object.assign(f, carga)
        } else if (op === "delete") {
          res = filas().filter(pasa)
          tablas[tabla] = filas().filter((f) => !res.includes(f))
        } else {
          res = filas().filter(pasa)
          if (orden) {
            const { col, asc } = orden
            res = [...res].sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (asc ? 1 : -1))
          }
          if (tope !== null) res = res.slice(0, tope)
        }
        const data = unico ? (res[0] ?? null) : res
        const error = unico && !quizas && !data ? { message: "no rows", code: "PGRST116" } : null
        return resolve({ data, error })
      },
    }
    return q
  }

  return { from, tablas }
}
```

- [ ] **Step 7: Commit**

```bash
git add lib/farming/tipos.ts lib/farming/armar.ts lib/farming/armar.test.ts lib/farming/base-falsa.ts
git commit -m "feat(farming): tipos de la API, armado de la respuesta y doble de base para tests"
```

---

### Task 4: Lo compartido del servidor, y GET y POST `/api/farming/zonas`

**Files:**
- Create: `lib/farming/servidor.ts`
- Create: `app/api/farming/zonas/route.ts`
- Test: `app/api/farming/zonas/route.test.ts`

**Interfaces:**
- Consumes: `requireTenant()` → `{ userId, agencyId, role }`; `createAdminClient()`; `validarDibujo`, `areaKm2`, `choquesContra`, `MAX_KM2`, `MAX_ZONAS_ACTIVAS` (Task 1); `armarRespuesta`, `armarZona`, `nombreDe` (Task 3).
- Produces (servidor.ts, lo reusan las Tasks 5 y 6):
  - `COLUMNAS_ZONA: string`
  - `responderError(e: unknown, contexto: string): NextResponse`
  - `cargarContexto(admin: SupabaseClient<any, any, any>, agencyId: string): Promise<{ filas: FilaZona[]; compartidas: FilaCompartida[]; perfiles: FilaPerfil[] }>`
- Produces (route.ts):
  - `GET /api/farming/zonas` → 200 `RespuestaZonas`
  - `POST /api/farming/zonas` body `{ nombre: string; geojson: Dibujo; origen_mapa_zona_id?: string }` → 201 `{ zona: ZonaFarming }` · 400 `{ error }` · 403 si no es asesor · 409 `RespuestaChoque`

- [ ] **Step 0: Lo compartido**

Un `route.ts` de Next.js **solo puede exportar** métodos HTTP y configs (`dynamic`, `revalidate`…); cualquier otro export rompe el build. Por eso esto vive en `lib/`:

```ts
// lib/farming/servidor.ts
//
// Lo que comparten los endpoints de Farming. NO va en un route.ts: Next.js rechaza en el
// build cualquier export de un route.ts que no sea un método HTTP o una config.
//
// createAdminClient se saltea la RLS: por eso cargarContexto filtra SIEMPRE por agency_id.
import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { FilaCompartida, FilaPerfil, FilaZona } from "./armar"

export const COLUMNAS_ZONA =
  "id, agency_id, owner_user_id, nombre, geojson, area_km2, origen_mapa_zona_id, estado, trazo_editado_en, created_at"

export function responderError(e: unknown, contexto: string) {
  console.error(`Farming (${contexto}):`, e)
  const msg = (e as any)?.message || "Algo salió mal"
  return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 })
}

/** Las zonas activas de la agencia, quién las comparte y los perfiles para ponerles nombre. */
export async function cargarContexto(admin: SupabaseClient<any, any, any>, agencyId: string) {
  const { data: filas, error: e1 } = await admin
    .from("farming_zonas")
    .select(COLUMNAS_ZONA)
    .eq("agency_id", agencyId)
    .eq("estado", "activa")
    .order("created_at", { ascending: false })
  if (e1) throw e1

  const ids = (filas || []).map((z: any) => z.id)
  const { data: compartidas, error: e2 } = ids.length
    ? await admin.from("farming_zonas_compartidas").select("zona_id, user_id, agregado_por, created_at").in("zona_id", ids)
    : { data: [], error: null }
  if (e2) throw e2

  const { data: perfiles, error: e3 } = await admin
    .from("profiles")
    .select("id, full_name, role, estado")
    .eq("agency_id", agencyId)
  if (e3) throw e3

  return {
    filas: (filas || []) as FilaZona[],
    compartidas: (compartidas || []) as FilaCompartida[],
    perfiles: (perfiles || []) as FilaPerfil[],
  }
}
```

- [ ] **Step 1: Los tests del endpoint**

```ts
// app/api/farming/zonas/route.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest"
import { baseFalsa } from "@/lib/farming/base-falsa"

/**
 * Crear y listar zonas de farming. Las reglas que sostiene este archivo:
 *  1. GET devuelve mías / compartidas conmigo / ajenas como contorno / colegas.
 *  2. POST rechaza: sin nombre, dibujo roto, más de 5 km², la 4ª zona activa, y que no sea
 *     asesor (403). Cada rechazo dice por qué.
 *  3. POST devuelve 409 con el recorte si pisa a otro. El trazo NO se guarda.
 *  4. POST guarda con agency_id y owner_user_id del que llama, NUNCA del body.
 */

const AGENCIA = "ag-1"
const YO = "u-yo", JUAN = "u-juan", DIRECTOR = "u-dir"

const cuadrado = (lng: number, lat: number, lado = 0.01) => ({
  type: "Polygon",
  coordinates: [[[lng, lat], [lng + lado, lat], [lng + lado, lat + lado], [lng, lat + lado], [lng, lat]]],
})

const sesion = { userId: YO, agencyId: AGENCIA, role: "asesor" }
vi.mock("@/lib/auth/tenant-validation", () => ({ requireTenant: async () => ({ ...sesion }) }))

let base = baseFalsa({})
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => base }))

const { GET, POST } = await import("./route")

const post = (body: any) =>
  POST(new Request("http://localhost/api/farming/zonas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }))

beforeEach(() => {
  sesion.userId = YO
  sesion.role = "asesor"
  base = baseFalsa({
    profiles: [
      { id: YO, agency_id: AGENCIA, full_name: "Leo", role: "asesor", estado: "activo" },
      { id: JUAN, agency_id: AGENCIA, full_name: "Juan Pérez", role: "asesor", estado: "activo" },
      { id: DIRECTOR, agency_id: AGENCIA, full_name: "Dire", role: "director", estado: "activo" },
      { id: "u-otra-agencia", agency_id: "ag-2", full_name: "Ajeno", role: "asesor", estado: "activo" },
    ],
    farming_zonas: [
      { id: "z-juan", agency_id: AGENCIA, owner_user_id: JUAN, nombre: "Belgrano C", geojson: cuadrado(-58.46, -34.56), area_km2: 1.02, estado: "activa", origen_mapa_zona_id: null, trazo_editado_en: null, created_at: "2026-09-12T10:00:00Z" },
      { id: "z-otra-agencia", agency_id: "ag-2", owner_user_id: "u-otra-agencia", nombre: "De otra agencia", geojson: cuadrado(-58.46, -34.56), area_km2: 1, estado: "activa", origen_mapa_zona_id: null, trazo_editado_en: null, created_at: "2026-09-12T10:00:00Z" },
    ],
    farming_zonas_compartidas: [],
  })
})

describe("GET /api/farming/zonas", () => {
  it("separa mías, compartidas conmigo y ajenas; nunca mezcla otra agencia", async () => {
    base.tablas.farming_zonas.push({ id: "z-mia", agency_id: AGENCIA, owner_user_id: YO, nombre: "Mía", geojson: cuadrado(-58.40, -34.56), area_km2: 1, estado: "activa", origen_mapa_zona_id: null, trazo_editado_en: null, created_at: "2026-09-12T11:00:00Z" })
    const r = await GET()
    const d = await r.json()
    expect(r.status).toBe(200)
    expect(d.mias.map((z: any) => z.id)).toEqual(["z-mia"])
    expect(d.ajenas.map((z: any) => z.id)).toEqual(["z-juan"])
    expect(d.ajenas[0].owner_nombre).toBe("Juan Pérez")
    expect(d.colegas).toEqual([{ id: JUAN, nombre: "Juan Pérez" }])
    expect(JSON.stringify(d)).not.toContain("z-otra-agencia")
  })
})

describe("POST /api/farming/zonas", () => {
  it("guarda una zona válida con el dueño y la agencia de la sesión, no del body", async () => {
    const r = await post({ nombre: "Núñez", geojson: cuadrado(-58.40, -34.56), owner_user_id: JUAN, agency_id: "ag-2" })
    const d = await r.json()
    expect(r.status).toBe(201)
    expect(d.zona.owner_user_id).toBe(YO)
    expect(d.zona.pedazos).toBe(1)
    expect(d.zona.area_km2).toBeGreaterThan(0.9)
    const fila = base.tablas.farming_zonas.find((z) => z.id === d.zona.id)!
    expect(fila.agency_id).toBe(AGENCIA)
    expect(fila.estado).toBe("activa")
  })

  it("sin nombre: 400", async () => {
    const r = await post({ nombre: "  ", geojson: cuadrado(-58.40, -34.56) })
    expect(r.status).toBe(400)
  })

  it("dibujo roto: 400 con el motivo", async () => {
    const r = await post({ nombre: "X", geojson: { type: "Point", coordinates: [0, 0] } })
    expect(r.status).toBe(400)
    expect((await r.json()).error).toMatch(/zona/)
  })

  it("más de 5 km²: 400", async () => {
    const r = await post({ nombre: "Medio barrio", geojson: cuadrado(-58.40, -34.56, 0.03) })
    expect(r.status).toBe(400)
    expect((await r.json()).error).toMatch(/5 km/)
  })

  it("la cuarta zona activa: 400; las liberadas no cuentan", async () => {
    for (let i = 0; i < 3; i++) {
      base.tablas.farming_zonas.push({ id: `z-mia-${i}`, agency_id: AGENCIA, owner_user_id: YO, nombre: `Mía ${i}`, geojson: cuadrado(-58.30 + i * 0.05, -34.56), area_km2: 1, estado: "activa", origen_mapa_zona_id: null, trazo_editado_en: null, created_at: "" })
    }
    base.tablas.farming_zonas.push({ id: "z-liberada", agency_id: AGENCIA, owner_user_id: YO, nombre: "Vieja", geojson: cuadrado(-58.20, -34.56), area_km2: 1, estado: "liberada", origen_mapa_zona_id: null, trazo_editado_en: null, created_at: "" })
    const r = await post({ nombre: "Cuarta", geojson: cuadrado(-58.10, -34.56) })
    expect(r.status).toBe(400)
    expect((await r.json()).error).toMatch(/3 zonas/)
  })

  it("pisa la de Juan: 409 con el recorte y NO guarda", async () => {
    const antes = base.tablas.farming_zonas.length
    const r = await post({ nombre: "Encima", geojson: cuadrado(-58.455, -34.56) })
    const d = await r.json()
    expect(r.status).toBe(409)
    expect(d.choques).toHaveLength(1)
    expect(d.choques[0].owner_nombre).toBe("Juan Pérez")
    expect(d.choques[0].recorte.type).toBe("Polygon")
    expect(base.tablas.farming_zonas).toHaveLength(antes)
  })

  it("una zona liberada ya no bloquea", async () => {
    base.tablas.farming_zonas.find((z) => z.id === "z-juan")!.estado = "liberada"
    const r = await post({ nombre: "Encima", geojson: cuadrado(-58.455, -34.56) })
    expect(r.status).toBe(201)
  })

  it("el director no crea zonas: 403", async () => {
    sesion.userId = DIRECTOR
    sesion.role = "director"
    const r = await post({ nombre: "X", geojson: cuadrado(-58.40, -34.56) })
    expect(r.status).toBe(403)
  })
})
```

- [ ] **Step 2: Verlos fallar**

Run: `npx vitest run app/api/farming/zonas/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: El endpoint**

```ts
// app/api/farming/zonas/route.ts
//
// Farming · las zonas del territorio. GET: todo lo que la pantalla necesita. POST: crear.
//
// createAdminClient se saltea la RLS: por eso TODAS las consultas filtran por agency_id y
// las escrituras ponen owner_user_id de la sesión, nunca del body. No es opcional.
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireTenant } from "@/lib/auth/tenant-validation"
import { areaKm2, choquesContra, MAX_KM2, MAX_ZONAS_ACTIVAS, validarDibujo } from "@/lib/farming/geometria"
import { armarRespuesta, armarZona, nombreDe, type FilaZona } from "@/lib/farming/armar"
import { cargarContexto, COLUMNAS_ZONA, responderError } from "@/lib/farming/servidor"

export const dynamic = "force-dynamic"

const LARGO_NOMBRE = 80

export async function GET() {
  try {
    const { userId, agencyId, role } = await requireTenant()
    const admin = createAdminClient()
    const ctx = await cargarContexto(admin, agencyId)
    return NextResponse.json(armarRespuesta({ ...ctx, userId, role }))
  } catch (e) {
    return responderError(e, "listar")
  }
}

export async function POST(req: Request) {
  try {
    const { userId, agencyId, role } = await requireTenant()
    if (role !== "asesor") {
      return NextResponse.json({ error: "Farming es una herramienta del asesor: el director ve y libera, no dibuja" }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const nombre = String(body?.nombre || "").trim().slice(0, LARGO_NOMBRE)
    if (!nombre) return NextResponse.json({ error: "Ponele un nombre a la zona" }, { status: 400 })

    const v = validarDibujo(body?.geojson)
    if (!v.ok) return NextResponse.json({ error: v.motivo }, { status: 400 })

    const km2 = areaKm2(v.dibujo)
    if (km2 > MAX_KM2) {
      return NextResponse.json({ error: `La zona mide ${km2.toFixed(1)} km² y el máximo son ${MAX_KM2} km². Dibujá una más chica.` }, { status: 400 })
    }

    const admin = createAdminClient()
    const ctx = await cargarContexto(admin, agencyId)

    const mias = ctx.filas.filter((z) => z.owner_user_id === userId)
    if (mias.length >= MAX_ZONAS_ACTIVAS) {
      return NextResponse.json({ error: `Ya tenés ${MAX_ZONAS_ACTIVAS} zonas activas, que es el máximo. Borrá una para dibujar otra.` }, { status: 400 })
    }

    // Se controla contra TODAS las activas de la agencia, las propias incluidas: dos zonas
    // del mismo asesor una encima de la otra tampoco tienen sentido.
    const choques = choquesContra(
      v.dibujo,
      ctx.filas.map((z) => ({ id: z.id, nombre: z.nombre, owner_nombre: z.owner_user_id === userId ? "vos" : nombreDe(ctx.perfiles, z.owner_user_id), geojson: z.geojson })),
    )
    if (choques.length > 0) {
      const primero = choques[0]
      return NextResponse.json(
        { error: `Tu trazo pisa «${primero.nombre}», zona de ${primero.owner_nombre}. Corré el trazo y volvé a intentar.`, choques },
        { status: 409 },
      )
    }

    const { data, error } = await admin
      .from("farming_zonas")
      .insert({
        agency_id: agencyId,
        owner_user_id: userId,
        nombre,
        geojson: v.dibujo,
        area_km2: Number(km2.toFixed(4)),
        origen_mapa_zona_id: typeof body?.origen_mapa_zona_id === "string" ? body.origen_mapa_zona_id : null,
        estado: "activa",
      })
      .select(COLUMNAS_ZONA)
      .single()
    if (error) throw error

    return NextResponse.json({ zona: armarZona(data as FilaZona, [], ctx.perfiles) }, { status: 201 })
  } catch (e) {
    return responderError(e, "crear")
  }
}
```

- [ ] **Step 4: Verlos pasar**

Run: `npx vitest run app/api/farming/zonas/route.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/farming/servidor.ts app/api/farming/zonas/route.ts app/api/farming/zonas/route.test.ts
git commit -m "feat(farming): GET y POST /api/farming/zonas con topes y control de choque"
```

---

### Task 5: PATCH y DELETE `/api/farming/zonas/[id]`

**Files:**
- Create: `app/api/farming/zonas/[id]/route.ts`
- Test: `app/api/farming/zonas/[id]/route.test.ts`

**Interfaces:**
- Consumes: `cargarContexto`, `COLUMNAS_ZONA`, `responderError` de `lib/farming/servidor` (Task 4); `validarDibujo`, `sumarPedazo`, `areaKm2`, `choquesContra`, `MAX_KM2` (Task 1); `armarZona`, `nombreDe` (Task 3).
- Produces:
  - `PATCH /api/farming/zonas/[id]` body `{ accion: "redibujar" | "sumar" | "renombrar"; geojson?: Dibujo; nombre?: string }` → 200 `{ zona: ZonaFarming }` · 400 · 403 (no es el dueño) · 404 · 409 `RespuestaChoque`
  - `DELETE /api/farming/zonas/[id]` → 200 `{ ok: true, accion: "borrada" }` · 403 · 404

- [ ] **Step 1: Los tests**

```ts
// app/api/farming/zonas/[id]/route.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest"
import { baseFalsa } from "@/lib/farming/base-falsa"

/**
 * Editar y borrar una zona. Las reglas que sostiene este archivo:
 *  1. Solo el dueño edita o borra. Un compartido o un colega recibe 403; otra agencia, 404.
 *  2. "redibujar" reemplaza el trazo; "sumar" lo une al que había; "renombrar" solo el nombre.
 *  3. Cada edición vuelve a pasar por el control de choque y la zona SE EXCLUYE A SÍ MISMA.
 *  4. Sumar un pedazo que pisa a otro: 409 y el trazo viejo queda intacto.
 *  5. El tope de 5 km² se mide sobre la suma de los pedazos.
 */

const AGENCIA = "ag-1"
const YO = "u-yo", JUAN = "u-juan"

const cuadrado = (lng: number, lat: number, lado = 0.01) => ({
  type: "Polygon",
  coordinates: [[[lng, lat], [lng + lado, lat], [lng + lado, lat + lado], [lng, lat + lado], [lng, lat]]],
})

const sesion = { userId: YO, agencyId: AGENCIA, role: "asesor" }
vi.mock("@/lib/auth/tenant-validation", () => ({ requireTenant: async () => ({ ...sesion }) }))
let base = baseFalsa({})
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => base }))

const { PATCH, DELETE } = await import("./route")

const patch = (id: string, body: any) =>
  PATCH(new Request(`http://localhost/api/farming/zonas/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: { id } })
const borrar = (id: string) => DELETE(new Request(`http://localhost/api/farming/zonas/${id}`, { method: "DELETE" }), { params: { id } })

const zona = (id: string, owner: string, geojson: any, extra: any = {}) => ({
  id, agency_id: AGENCIA, owner_user_id: owner, nombre: id, geojson, area_km2: 1, estado: "activa",
  origen_mapa_zona_id: null, trazo_editado_en: null, created_at: "2026-09-12T10:00:00Z", ...extra,
})

beforeEach(() => {
  sesion.userId = YO
  sesion.role = "asesor"
  base = baseFalsa({
    profiles: [
      { id: YO, agency_id: AGENCIA, full_name: "Leo", role: "asesor", estado: "activo" },
      { id: JUAN, agency_id: AGENCIA, full_name: "Juan Pérez", role: "asesor", estado: "activo" },
    ],
    farming_zonas: [
      zona("z-mia", YO, cuadrado(-58.40, -34.56)),
      zona("z-juan", JUAN, cuadrado(-58.46, -34.56)),
      zona("z-ajena", "u-x", cuadrado(-58.40, -34.56), { agency_id: "ag-2" }),
    ],
    farming_zonas_compartidas: [{ zona_id: "z-juan", user_id: YO, agregado_por: JUAN, created_at: "" }],
  })
})

describe("PATCH", () => {
  it("renombrar cambia solo el nombre", async () => {
    const r = await patch("z-mia", { accion: "renombrar", nombre: "  Belgrano R  " })
    expect(r.status).toBe(200)
    expect((await r.json()).zona.nombre).toBe("Belgrano R")
    expect(base.tablas.farming_zonas[0].trazo_editado_en).toBeNull()
  })

  it("redibujar reemplaza el trazo y marca trazo_editado_en", async () => {
    const r = await patch("z-mia", { accion: "redibujar", geojson: cuadrado(-58.30, -34.56) })
    const d = await r.json()
    expect(r.status).toBe(200)
    expect(d.zona.geojson.coordinates[0][0]).toEqual([-58.30, -34.56])
    expect(base.tablas.farming_zonas[0].trazo_editado_en).not.toBeNull()
  })

  it("redibujar sobre el mismo lugar NO choca consigo misma", async () => {
    const r = await patch("z-mia", { accion: "redibujar", geojson: cuadrado(-58.402, -34.56) })
    expect(r.status).toBe(200)
  })

  it("sumar un pedazo suelto deja dos pedazos y suma el área", async () => {
    const r = await patch("z-mia", { accion: "sumar", geojson: cuadrado(-58.35, -34.56) })
    const d = await r.json()
    expect(r.status).toBe(200)
    expect(d.zona.pedazos).toBe(2)
    expect(d.zona.area_km2).toBeGreaterThan(1.8)
  })

  it("sumar un pedazo que pisa a Juan: 409 y el trazo viejo queda", async () => {
    const r = await patch("z-mia", { accion: "sumar", geojson: cuadrado(-58.455, -34.56) })
    expect(r.status).toBe(409)
    expect((await r.json()).choques[0].owner_nombre).toBe("Juan Pérez")
    expect(base.tablas.farming_zonas[0].geojson.type).toBe("Polygon")
  })

  it("sumar hasta pasar los 5 km²: 400", async () => {
    const r = await patch("z-mia", { accion: "sumar", geojson: cuadrado(-58.30, -34.56, 0.025) })
    expect(r.status).toBe(400)
    expect((await r.json()).error).toMatch(/5 km/)
  })

  it("un compartido no edita el trazo: 403", async () => {
    const r = await patch("z-juan", { accion: "renombrar", nombre: "Mío ahora" })
    expect(r.status).toBe(403)
  })

  it("otra agencia: 404", async () => {
    expect((await patch("z-ajena", { accion: "renombrar", nombre: "X" })).status).toBe(404)
  })

  it("acción desconocida: 400", async () => {
    expect((await patch("z-mia", { accion: "volar" })).status).toBe(400)
  })
})

describe("DELETE", () => {
  it("el dueño borra y se lleva las compartidas", async () => {
    base.tablas.farming_zonas_compartidas.push({ zona_id: "z-mia", user_id: JUAN, agregado_por: YO, created_at: "" })
    const r = await borrar("z-mia")
    expect(r.status).toBe(200)
    expect(base.tablas.farming_zonas.find((z) => z.id === "z-mia")).toBeUndefined()
    expect(base.tablas.farming_zonas_compartidas.filter((c) => c.zona_id === "z-mia")).toEqual([])
  })

  it("un compartido no borra: 403", async () => {
    expect((await borrar("z-juan")).status).toBe(403)
    expect(base.tablas.farming_zonas.find((z) => z.id === "z-juan")).toBeDefined()
  })
})
```

- [ ] **Step 2: Verlos fallar**

Run: `npx vitest run "app/api/farming/zonas/[id]/route.test.ts"`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: El endpoint**

```ts
// app/api/farming/zonas/[id]/route.ts
//
// Farming · editar (redibujar / sumar un pedazo / renombrar) y borrar una zona.
// Solo el dueño. El director libera por su propio endpoint; un compartido trabaja las
// tarjetas (etapa 3) pero no toca el territorio.
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireTenant } from "@/lib/auth/tenant-validation"
import { areaKm2, choquesContra, MAX_KM2, sumarPedazo, validarDibujo, type Dibujo } from "@/lib/farming/geometria"
import { armarZona, nombreDe, type FilaZona } from "@/lib/farming/armar"
import { cargarContexto, COLUMNAS_ZONA, responderError } from "@/lib/farming/servidor"

export const dynamic = "force-dynamic"

const LARGO_NOMBRE = 80

/** La zona, si es de la agencia. `mia` dice si el que llama es el dueño. */
async function buscarZona(admin: ReturnType<typeof createAdminClient>, id: string, agencyId: string, userId: string) {
  const { data, error } = await admin
    .from("farming_zonas")
    .select(COLUMNAS_ZONA)
    .eq("id", id)
    .eq("agency_id", agencyId)
    .maybeSingle()
  if (error) throw error
  const zona = data as FilaZona | null
  return { zona, mia: !!zona && zona.owner_user_id === userId }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId, agencyId } = await requireTenant()
    const admin = createAdminClient()
    const { zona, mia } = await buscarZona(admin, params.id, agencyId, userId)
    if (!zona) return NextResponse.json({ error: "No encontramos esa zona" }, { status: 404 })
    if (!mia) return NextResponse.json({ error: "Solo quien dibujó la zona puede cambiarla" }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const accion = body?.accion

    if (accion === "renombrar") {
      const nombre = String(body?.nombre || "").trim().slice(0, LARGO_NOMBRE)
      if (!nombre) return NextResponse.json({ error: "Ponele un nombre a la zona" }, { status: 400 })
      const { data, error } = await admin
        .from("farming_zonas")
        .update({ nombre, updated_at: new Date().toISOString() })
        .eq("id", zona.id)
        .eq("owner_user_id", userId)
        .select(COLUMNAS_ZONA)
        .single()
      if (error) throw error
      const ctx = await cargarContexto(admin, agencyId)
      return NextResponse.json({ zona: armarZona(data as FilaZona, ctx.compartidas, ctx.perfiles) })
    }

    if (accion !== "redibujar" && accion !== "sumar") {
      return NextResponse.json({ error: "No sé qué hacer con esa acción" }, { status: 400 })
    }

    const v = validarDibujo(body?.geojson)
    if (!v.ok) return NextResponse.json({ error: v.motivo }, { status: 400 })

    let dibujo: Dibujo = v.dibujo
    if (accion === "sumar") {
      const unido = sumarPedazo(zona.geojson, v.dibujo)
      if (!unido) return NextResponse.json({ error: "No se pudo sumar ese pedazo: volvé a dibujarlo" }, { status: 400 })
      const v2 = validarDibujo(unido)
      if (!v2.ok) return NextResponse.json({ error: v2.motivo }, { status: 400 })
      dibujo = v2.dibujo
    }

    const km2 = areaKm2(dibujo)
    if (km2 > MAX_KM2) {
      return NextResponse.json({ error: `Con ese cambio la zona mide ${km2.toFixed(1)} km² y el máximo son ${MAX_KM2} km².` }, { status: 400 })
    }

    const ctx = await cargarContexto(admin, agencyId)
    // La zona se excluye a sí misma: si no, redibujarla chocaría contra su versión anterior.
    const choques = choquesContra(
      dibujo,
      ctx.filas
        .filter((z) => z.id !== zona.id)
        .map((z) => ({ id: z.id, nombre: z.nombre, owner_nombre: z.owner_user_id === userId ? "vos" : nombreDe(ctx.perfiles, z.owner_user_id), geojson: z.geojson })),
    )
    if (choques.length > 0) {
      const p = choques[0]
      return NextResponse.json(
        { error: `Ese trazo pisa «${p.nombre}», zona de ${p.owner_nombre}. Corré el trazo y volvé a intentar.`, choques },
        { status: 409 },
      )
    }

    const ahora = new Date().toISOString()
    const { data, error } = await admin
      .from("farming_zonas")
      .update({ geojson: dibujo, area_km2: Number(km2.toFixed(4)), trazo_editado_en: ahora, updated_at: ahora })
      .eq("id", zona.id)
      .eq("owner_user_id", userId)
      .select(COLUMNAS_ZONA)
      .single()
    if (error) throw error

    // ETAPA 3: acá se recalcula `fuera_de_zona` en farming_direcciones. Regla del spec
    // ("Lo trabajado no se borra por mover un trazo"): las direcciones que quedan afuera y
    // están VACÍAS (etapa relevado, sin encargado, sin propietarios, sin contactos) se borran;
    // las demás quedan con fuera_de_zona=true y fuera_de_zona_desde=ahora. La respuesta suma
    // { fuera: { sacadas: n, marcadas: n } } para el aviso de pantalla.

    return NextResponse.json({ zona: armarZona(data as FilaZona, ctx.compartidas, ctx.perfiles) })
  } catch (e) {
    return responderError(e, "editar")
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId, agencyId } = await requireTenant()
    const admin = createAdminClient()
    const { zona, mia } = await buscarZona(admin, params.id, agencyId, userId)
    if (!zona) return NextResponse.json({ error: "No encontramos esa zona" }, { status: 404 })
    if (!mia) return NextResponse.json({ error: "Solo quien dibujó la zona puede borrarla" }, { status: 403 })

    // ETAPA 3: si la zona tiene direcciones cargadas NO se borra: pasa a estado 'archivada'
    // (spec, "Borrar una zona") y la respuesta dice { ok: true, accion: "archivada" }.

    // La FK con on delete cascade se lleva las compartidas en la base real; el doble de
    // prueba no sabe de cascadas, así que se borran explícito. Es inocuo en producción.
    const { error: e1 } = await admin.from("farming_zonas_compartidas").delete().eq("zona_id", zona.id)
    if (e1) throw e1
    const { error: e2 } = await admin.from("farming_zonas").delete().eq("id", zona.id).eq("owner_user_id", userId)
    if (e2) throw e2

    return NextResponse.json({ ok: true, accion: "borrada" })
  } catch (e) {
    return responderError(e, "borrar")
  }
}
```

- [ ] **Step 4: Verlos pasar**

Run: `npx vitest run "app/api/farming/zonas/[id]/route.test.ts"`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add "app/api/farming/zonas/[id]/route.ts" "app/api/farming/zonas/[id]/route.test.ts"
git commit -m "feat(farming): PATCH (redibujar, sumar pedazo, renombrar) y DELETE de una zona"
```

---

### Task 6: Compartir y liberar

**Files:**
- Create: `app/api/farming/zonas/[id]/compartir/route.ts`
- Create: `app/api/farming/zonas/[id]/liberar/route.ts`
- Test: `app/api/farming/zonas/[id]/compartir-y-liberar.test.ts`

**Interfaces:**
- Produces:
  - `POST /api/farming/zonas/[id]/compartir` body `{ user_id: string }` → 200 `{ ok: true }` · 400 (no es un asesor activo de la agencia, o es uno mismo) · 403 · 404
  - `DELETE /api/farming/zonas/[id]/compartir?user_id=…` → 200 `{ ok: true }` · 403 · 404
  - `POST /api/farming/zonas/[id]/liberar` body `{ motivo: string }` → 200 `{ ok: true }` · 400 (sin motivo) · 403 (no es director) · 404

- [ ] **Step 1: Los tests**

```ts
// app/api/farming/zonas/[id]/compartir-y-liberar.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest"
import { baseFalsa } from "@/lib/farming/base-falsa"

/**
 * Compartir (solo el dueño, solo con asesores activos de su agencia) y liberar (solo el
 * director, con motivo, sin borrar nada).
 */

const AGENCIA = "ag-1"
const YO = "u-yo", JUAN = "u-juan", PAUSADO = "u-pausado", DIRECTOR = "u-dir"

const cuadrado = { type: "Polygon", coordinates: [[[-58.40, -34.56], [-58.39, -34.56], [-58.39, -34.55], [-58.40, -34.55], [-58.40, -34.56]]] }

const sesion = { userId: YO, agencyId: AGENCIA, role: "asesor" }
vi.mock("@/lib/auth/tenant-validation", () => ({ requireTenant: async () => ({ ...sesion }) }))
let base = baseFalsa({})
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => base }))

const compartir = await import("./compartir/route")
const liberar = await import("./liberar/route")

const postCompartir = (id: string, body: any) =>
  compartir.POST(new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: { id } })
const delCompartir = (id: string, userId: string) =>
  compartir.DELETE(new Request(`http://localhost/x?user_id=${userId}`, { method: "DELETE" }), { params: { id } })
const postLiberar = (id: string, body: any) =>
  liberar.POST(new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: { id } })

beforeEach(() => {
  sesion.userId = YO
  sesion.role = "asesor"
  base = baseFalsa({
    profiles: [
      { id: YO, agency_id: AGENCIA, full_name: "Leo", role: "asesor", estado: "activo" },
      { id: JUAN, agency_id: AGENCIA, full_name: "Juan", role: "asesor", estado: "activo" },
      { id: PAUSADO, agency_id: AGENCIA, full_name: "Pausado", role: "asesor", estado: "pausado" },
      { id: DIRECTOR, agency_id: AGENCIA, full_name: "Dire", role: "director", estado: "activo" },
      { id: "u-otra", agency_id: "ag-2", full_name: "Otra", role: "asesor", estado: "activo" },
    ],
    farming_zonas: [
      { id: "z-mia", agency_id: AGENCIA, owner_user_id: YO, nombre: "Mía", geojson: cuadrado, area_km2: 1, estado: "activa", origen_mapa_zona_id: null, trazo_editado_en: null, created_at: "" },
      { id: "z-juan", agency_id: AGENCIA, owner_user_id: JUAN, nombre: "De Juan", geojson: cuadrado, area_km2: 1, estado: "activa", origen_mapa_zona_id: null, trazo_editado_en: null, created_at: "" },
    ],
    farming_zonas_compartidas: [],
  })
})

describe("compartir", () => {
  it("el dueño suma a un asesor activo de su agencia", async () => {
    const r = await postCompartir("z-mia", { user_id: JUAN })
    expect(r.status).toBe(200)
    expect(base.tablas.farming_zonas_compartidas).toEqual([expect.objectContaining({ zona_id: "z-mia", user_id: JUAN, agregado_por: YO })])
  })

  it("sumar dos veces al mismo no duplica", async () => {
    await postCompartir("z-mia", { user_id: JUAN })
    await postCompartir("z-mia", { user_id: JUAN })
    expect(base.tablas.farming_zonas_compartidas).toHaveLength(1)
  })

  it.each([["uno mismo", YO], ["un pausado", PAUSADO], ["el director", DIRECTOR], ["otra agencia", "u-otra"], ["alguien que no existe", "u-nadie"]])(
    "no se puede compartir con %s: 400",
    async (_, id) => {
      expect((await postCompartir("z-mia", { user_id: id })).status).toBe(400)
      expect(base.tablas.farming_zonas_compartidas).toEqual([])
    },
  )

  it("un no-dueño no comparte la de otro: 403", async () => {
    expect((await postCompartir("z-juan", { user_id: PAUSADO })).status).toBe(403)
  })

  it("el dueño saca a alguien", async () => {
    base.tablas.farming_zonas_compartidas.push({ zona_id: "z-mia", user_id: JUAN, agregado_por: YO, created_at: "" })
    const r = await delCompartir("z-mia", JUAN)
    expect(r.status).toBe(200)
    expect(base.tablas.farming_zonas_compartidas).toEqual([])
  })
})

describe("liberar", () => {
  it("el director libera con motivo; la fila queda, no se borra", async () => {
    sesion.userId = DIRECTOR
    sesion.role = "director"
    const r = await postLiberar("z-juan", { motivo: "Juan se desvinculó" })
    expect(r.status).toBe(200)
    const fila = base.tablas.farming_zonas.find((z) => z.id === "z-juan")!
    expect(fila.estado).toBe("liberada")
    expect(fila.liberada_por).toBe(DIRECTOR)
    expect(fila.motivo_liberacion).toBe("Juan se desvinculó")
    expect(fila.liberada_en).toBeTruthy()
  })

  it("sin motivo: 400", async () => {
    sesion.userId = DIRECTOR
    sesion.role = "director"
    expect((await postLiberar("z-juan", { motivo: " " })).status).toBe(400)
  })

  it("un asesor no libera, ni la propia: 403", async () => {
    expect((await postLiberar("z-mia", { motivo: "x" })).status).toBe(403)
    expect(base.tablas.farming_zonas[0].estado).toBe("activa")
  })
})
```

- [ ] **Step 2: Verlos fallar**

Run: `npx vitest run "app/api/farming/zonas/[id]/compartir-y-liberar.test.ts"`
Expected: FAIL — módulos inexistentes.

- [ ] **Step 3: Compartir**

```ts
// app/api/farming/zonas/[id]/compartir/route.ts
//
// Farming · con quién comparte su zona el dueño. Los dos trabajan el mismo tablero; el
// dueño sigue siendo el único que puede borrarla o sacar a alguien (spec, "Compartir zona").
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireTenant } from "@/lib/auth/tenant-validation"
import { responderError } from "@/lib/farming/servidor"

export const dynamic = "force-dynamic"

async function zonaPropia(admin: ReturnType<typeof createAdminClient>, id: string, agencyId: string, userId: string) {
  const { data, error } = await admin
    .from("farming_zonas")
    .select("id, owner_user_id")
    .eq("id", id)
    .eq("agency_id", agencyId)
    .maybeSingle()
  if (error) throw error
  if (!data) return { status: 404 as const, error: "No encontramos esa zona" }
  if ((data as any).owner_user_id !== userId) return { status: 403 as const, error: "Solo quien dibujó la zona puede compartirla" }
  return { status: 200 as const, error: null }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId, agencyId } = await requireTenant()
    const admin = createAdminClient()
    const chequeo = await zonaPropia(admin, params.id, agencyId, userId)
    if (chequeo.error) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

    const body = await req.json().catch(() => ({}))
    const destinatario = String(body?.user_id || "")
    if (!destinatario || destinatario === userId) {
      return NextResponse.json({ error: "Elegí un colega del desplegable" }, { status: 400 })
    }

    // Solo asesores ACTIVOS de la MISMA agencia. Un pausado o el director no entran.
    const { data: perfil, error: e1 } = await admin
      .from("profiles")
      .select("id, role, estado")
      .eq("id", destinatario)
      .eq("agency_id", agencyId)
      .maybeSingle()
    if (e1) throw e1
    const p = perfil as { role: string | null; estado: string | null } | null
    if (!p || p.role !== "asesor" || p.estado === "pausado" || p.estado === "eliminado") {
      return NextResponse.json({ error: "Solo se puede compartir con un asesor activo de tu inmobiliaria" }, { status: 400 })
    }

    const { data: ya, error: e2 } = await admin
      .from("farming_zonas_compartidas")
      .select("zona_id")
      .eq("zona_id", params.id)
      .eq("user_id", destinatario)
      .maybeSingle()
    if (e2) throw e2
    if (!ya) {
      const { error: e3 } = await admin
        .from("farming_zonas_compartidas")
        .insert({ zona_id: params.id, user_id: destinatario, agregado_por: userId })
      if (e3) throw e3
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return responderError(e, "compartir")
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId, agencyId } = await requireTenant()
    const admin = createAdminClient()
    const chequeo = await zonaPropia(admin, params.id, agencyId, userId)
    if (chequeo.error) return NextResponse.json({ error: chequeo.error }, { status: chequeo.status })

    const destinatario = new URL(req.url).searchParams.get("user_id")?.trim()
    if (!destinatario) return NextResponse.json({ error: "Falta a quién sacar" }, { status: 400 })

    const { error } = await admin
      .from("farming_zonas_compartidas")
      .delete()
      .eq("zona_id", params.id)
      .eq("user_id", destinatario)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (e) {
    return responderError(e, "dejar de compartir")
  }
}
```

- [ ] **Step 4: Liberar**

```ts
// app/api/farming/zonas/[id]/liberar/route.ts
//
// Farming · el director libera una zona. NO borra nada: la fila queda en 'liberada' con
// fecha, motivo y quién; sus tarjetas (etapa 3) se conservan. Lo único que cambia es que
// esas cuadras vuelven a estar disponibles (spec, "La pantalla del director").
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireTenant } from "@/lib/auth/tenant-validation"
import { responderError } from "@/lib/farming/servidor"

export const dynamic = "force-dynamic"

const LARGO_MOTIVO = 300

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId, agencyId, role } = await requireTenant()
    if (role !== "director") {
      return NextResponse.json({ error: "Solo el director puede liberar una zona" }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const motivo = String(body?.motivo || "").trim().slice(0, LARGO_MOTIVO)
    if (!motivo) return NextResponse.json({ error: "Escribí por qué se libera: queda en el historial" }, { status: 400 })

    const admin = createAdminClient()
    const ahora = new Date().toISOString()
    const { data, error } = await admin
      .from("farming_zonas")
      .update({ estado: "liberada", liberada_en: ahora, liberada_por: userId, motivo_liberacion: motivo, updated_at: ahora })
      .eq("id", params.id)
      .eq("agency_id", agencyId)
      .eq("estado", "activa")
      .select("id")
    if (error) throw error
    if (!data || data.length === 0) return NextResponse.json({ error: "No encontramos esa zona activa" }, { status: 404 })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return responderError(e, "liberar")
  }
}
```

- [ ] **Step 5: Verlos pasar**

Run: `npx vitest run "app/api/farming/zonas/[id]/compartir-y-liberar.test.ts"`
Expected: PASS, 12 tests.

- [ ] **Step 6: Correr TODA la suite y commitear**

Run: `npm test`
Expected: todo verde (incluidos los de `lib/mapa` con node:test).

```bash
git add "app/api/farming/zonas/[id]/compartir/route.ts" "app/api/farming/zonas/[id]/liberar/route.ts" "app/api/farming/zonas/[id]/compartir-y-liberar.test.ts"
git commit -m "feat(farming): compartir zona (solo el dueno, con asesores activos) y liberar (solo director)"
```

---

### Task 7: El renglón «Farming» en el menú

**Files:**
- Modify: `lib/nav/menu.ts:96-105` (grupo Propiedades) y `lib/nav/menu.ts:14-34` (imports)
- Modify: `lib/nav/menu.test.ts:12-52` y `:69-72`

- [ ] **Step 1: Actualizar el test para que exija el renglón nuevo (va a fallar)**

En `lib/nav/menu.test.ts`:
- Debajo del comentario de cabecera agregar: `// Único agregado desde entonces: «Farming» (spec 2026-09-11), en Propiedades para los dos roles.`
- En `DIRECTOR_ANTES` agregar `{ name: "Farming", href: "/director/farming" },` después de `Propiedades`.
- En `ASESOR_ANTES` agregar `{ name: "Farming", href: "/asesor/farming" },` después de `Mis Propiedades`.
- Cambiar `it("director: 19 renglones; asesor: 17"` por `it("director: 20 renglones; asesor: 18"` y los `toHaveLength(19)`/`(17)` por `20`/`18`.
- En `"el orden dentro de cada grupo es el acordado (director)"`, la línea de `propiedades` pasa a `["Propiedades", "Farming", "Buscador IA", "ACM", "Pulso de Mercado"]`.

Run: `npx vitest run lib/nav/menu.test.ts`
Expected: FAIL — falta `Farming -> /asesor/farming` y `/director/farming`, y las cuentas.

- [ ] **Step 2: Agregar el renglón**

En `lib/nav/menu.ts`, sumar `Sprout` al import de `lucide-react`, y en `RENGLONES`, dentro de `// -- Propiedades`, inmediatamente después del renglón `propiedades` y antes de `buscador-ia`:

```ts
  { id: "farming", icon: Sprout, grupo: "propiedades",
    director: { name: "Farming", href: "/director/farming" },
    asesor:   { name: "Farming", href: "/asesor/farming" } },
```

- [ ] **Step 3: Ver pasar (incluido "ningún icono se repite")**

Run: `npx vitest run lib/nav/menu.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/nav/menu.ts lib/nav/menu.test.ts
git commit -m "feat(farming): renglon Farming en Propiedades para asesor y director"
```

---

### Task 8: Las capas del mapa y el mapa de farming

**Files:**
- Create: `components/farming/capas-farming.tsx`
- Create: `components/farming/mapa-farming.tsx`

**Interfaces:**
- Consumes: `MapaLienzo` (default export de `components/mapa/mapa-lienzo`, props `grupos, onMover, onAbrirGrupo, onAbrirCumulo, onProveedor, encuadrarA, lapizActivo, trazos, onTrazo, children`); `Trazo` de `components/mapa/mapa-lapiz`; `bboxDeDibujo`, `Dibujo` (Task 1); `Choque`, `ContornoAjeno` (Task 3).
- Produces:
  - `posicionesDe(d: Dibujo): [number, number][][][]` (para react-leaflet `Polygon`)
  - `CapasFarming` (default) props `{ propia?: Dibujo | null; ajenas: ContornoAjeno[]; choques: Choque[] }`
  - `type ModoMapa = { tipo: "nueva" } | { tipo: "redibujar"; zonaId: string; actual: Dibujo } | { tipo: "sumar"; zonaId: string; actual: Dibujo } | { tipo: "ver"; actual: Dibujo | null }`
  - `MapaFarming` props `{ modo: ModoMapa; ajenas: ContornoAjeno[]; onGuardar: (args: { nombre?: string; geojson: Dibujo }) => Promise<void>; onCerrar: () => void }` — `onGuardar` rechaza con `{ choques: Choque[]; message }` si el servidor devolvió 409 (lo arma `farming-page.tsx`, Task 9).

- [ ] **Step 1: Las capas (dentro del MapContainer)**

```tsx
// components/farming/capas-farming.tsx
"use client"

// Los polígonos de Farming sobre el mapa: la zona propia (verde), las ajenas (gris punteado,
// con el nombre y de quién es) y los recortes de choque (rojo). Se montan como `children`
// de MapaLienzo, o sea ADENTRO del MapContainer: por eso este archivo solo se carga con
// dynamic(..., { ssr: false }), igual que el lienzo.
import { Polygon, Tooltip } from "react-leaflet"
import type { Dibujo } from "@/lib/farming/geometria"
import type { Choque, ContornoAjeno } from "@/lib/farming/tipos"

/** GeoJSON va [lng, lat]; Leaflet quiere [lat, lng]. Soporta agujeros y varios pedazos. */
export function posicionesDe(d: Dibujo): [number, number][][][] {
  const polis = d.type === "Polygon" ? [d.coordinates] : d.coordinates
  return polis.map((p) => p.map((anillo) => anillo.map(([lng, lat]) => [lat, lng] as [number, number])))
}

export default function CapasFarming({
  propia,
  ajenas,
  choques,
}: {
  propia?: Dibujo | null
  ajenas: ContornoAjeno[]
  choques: Choque[]
}) {
  return (
    <>
      {ajenas.map((z) => (
        <Polygon
          key={z.id}
          positions={posicionesDe(z.geojson)}
          pathOptions={{ color: "#71717a", weight: 2, dashArray: "6 4", fillColor: "#71717a", fillOpacity: 0.08 }}
        >
          <Tooltip sticky>
            <span className="font-semibold">{z.nombre}</span>
            <br />
            zona de {z.owner_nombre}
          </Tooltip>
        </Polygon>
      ))}

      {propia && (
        <Polygon
          positions={posicionesDe(propia)}
          pathOptions={{ color: "#15803d", weight: 3, fillColor: "#22c55e", fillOpacity: 0.12 }}
        />
      )}

      {choques.map((c, i) => (
        <Polygon
          key={`choque-${c.zona_id}-${i}`}
          positions={posicionesDe(c.recorte)}
          pathOptions={{ color: "#b91c1c", weight: 2, dashArray: "4 4", fillColor: "#ef4444", fillOpacity: 0.4 }}
        >
          <Tooltip permanent direction="center" opacity={1}>
            <span className="font-semibold">pisa «{c.nombre}»</span> de {c.owner_nombre} ({c.pct}%)
          </Tooltip>
        </Polygon>
      ))}
    </>
  )
}
```

- [ ] **Step 2: El mapa con el lápiz**

```tsx
// components/farming/mapa-farming.tsx
"use client"

// El mapa de Farming: el MISMO lienzo y el MISMO lápiz del Buscador, con cuatro modos.
//   nueva      → dibujar un trazo y guardarlo con nombre
//   redibujar  → el trazo nuevo reemplaza al actual
//   sumar      → el trazo nuevo se suma al actual (lo une el servidor)
//   ver        → sin lápiz
// Las zonas ajenas se ven siempre como contorno: sin eso se dibuja a ciegas y se choca.
import { useCallback, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { Loader2, Pencil, Save, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Trazo } from "@/components/mapa/mapa-lapiz"
import type { BBox } from "@/lib/mapa/tipos"
import { bboxDeDibujo, type Dibujo } from "@/lib/farming/geometria"
import type { Choque, ContornoAjeno } from "@/lib/farming/tipos"

// Leaflet toca `window` al importarse: sin ssr:false el build se cae.
const MapaLienzo = dynamic(() => import("@/components/mapa/mapa-lienzo"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-zinc-200 dark:bg-zinc-800">
      <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
    </div>
  ),
})
const CapasFarming = dynamic(() => import("./capas-farming"), { ssr: false })

export type ModoMapa =
  | { tipo: "nueva" }
  | { tipo: "redibujar"; zonaId: string; actual: Dibujo }
  | { tipo: "sumar"; zonaId: string; actual: Dibujo }
  | { tipo: "ver"; actual: Dibujo | null }

const TITULO: Record<ModoMapa["tipo"], string> = {
  nueva: "Dibujá tu zona de farming",
  redibujar: "Redibujá la zona: el trazo nuevo reemplaza al anterior",
  sumar: "Dibujá el pedazo que falta: se suma a la zona",
  ver: "Tu zona",
}

const nada = () => {}

export function MapaFarming({
  modo,
  ajenas,
  onGuardar,
  onCerrar,
}: {
  modo: ModoMapa
  ajenas: ContornoAjeno[]
  onGuardar: (args: { nombre?: string; geojson: Dibujo }) => Promise<void>
  onCerrar: () => void
}) {
  const [trazo, setTrazo] = useState<Trazo | null>(null)
  const [lapizActivo, setLapizActivo] = useState(modo.tipo !== "ver")
  const [nombre, setNombre] = useState("")
  const [choques, setChoques] = useState<Choque[]>([])
  const [guardando, setGuardando] = useState(false)

  const actual = modo.tipo === "nueva" ? null : modo.actual

  // Al abrir, el mapa se acomoda a la zona actual; al terminar un trazo, al trazo.
  const encuadrarA = useMemo<BBox | null>(() => {
    if (trazo) return bboxDeDibujo(trazo.poligono)
    return actual ? bboxDeDibujo(actual) : null
  }, [trazo, actual])

  // Con el lápiz, cada trazo nuevo REEMPLAZA al anterior: acá se dibuja UNA zona (o UN
  // pedazo) por vez. Para dos pedazos se usa "sumar" dos veces.
  const agregarTrazo = useCallback((t: Trazo) => {
    setTrazo(t)
    setChoques([])
    setLapizActivo(false)
  }, [])

  // Lo que se ve en verde: en "sumar", lo actual + el trazo; en los demás, el trazo o lo actual.
  const propia: Dibujo | null = useMemo(() => {
    if (modo.tipo === "sumar") return modo.actual
    if (trazo) return trazo.poligono
    return actual
  }, [modo, trazo, actual])

  const guardar = async () => {
    if (!trazo) return toast.error("Primero dibujá la zona con el lápiz")
    if (modo.tipo === "nueva" && !nombre.trim()) return toast.error("Ponele un nombre a la zona")
    setGuardando(true)
    try {
      await onGuardar({ nombre: modo.tipo === "nueva" ? nombre.trim() : undefined, geojson: trazo.poligono })
    } catch (e: any) {
      // Un 409 trae los recortes: se dibujan rayados y el trazo NO se borra, para corregir
      // sin redibujar todo (spec, "Choque de zonas").
      if (Array.isArray(e?.choques)) setChoques(e.choques)
      toast.error(e?.message || "No se pudo guardar")
    } finally {
      setGuardando(false)
    }
  }

  const puedeDibujar = modo.tipo !== "ver"

  return (
    <div
      className="relative isolate h-[calc(100dvh-12rem)] overflow-hidden rounded-xl border border-zinc-200 sm:h-[560px] dark:border-zinc-800"
      style={{ touchAction: lapizActivo ? "none" : undefined }}
    >
      <MapaLienzo
        grupos={[]}
        onMover={nada}
        onAbrirGrupo={nada}
        onAbrirCumulo={nada}
        onProveedor={nada}
        encuadrarA={encuadrarA}
        lapizActivo={lapizActivo}
        trazos={modo.tipo === "sumar" && trazo ? [trazo] : []}
        onTrazo={puedeDibujar ? agregarTrazo : undefined}
      >
        <CapasFarming propia={propia} ajenas={ajenas} choques={choques} />
      </MapaLienzo>

      {/* Barra de arriba */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[600] flex flex-wrap items-center gap-2 p-3 pl-14">
        <div className="pointer-events-auto rounded-lg bg-white/95 px-3 py-1.5 text-xs font-medium shadow dark:bg-zinc-900/95">
          {TITULO[modo.tipo]}
        </div>
        {modo.tipo === "nueva" && (
          <Input
            className="pointer-events-auto h-8 w-56 text-xs"
            placeholder="Nombre (ej: Belgrano R)"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            maxLength={80}
          />
        )}
        <button
          onClick={onCerrar}
          title="Cerrar"
          className="pointer-events-auto ml-auto flex h-8 w-8 items-center justify-center rounded-full bg-white text-zinc-700 shadow dark:bg-zinc-900 dark:text-zinc-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {puedeDibujar && (
        <button
          onClick={() => setLapizActivo((v) => !v)}
          title={lapizActivo ? "Salir del lápiz" : "Dibujar a mano alzada"}
          className={`absolute right-3 top-14 z-[700] flex h-10 w-10 items-center justify-center rounded-full shadow-lg transition-colors ${
            lapizActivo ? "bg-sky-700 text-white" : "bg-white text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          }`}
        >
          <Pencil className="h-4 w-4" />
        </button>
      )}

      {lapizActivo && (
        <div className="pointer-events-none absolute left-1/2 top-14 z-[700] -translate-x-1/2 rounded-lg bg-sky-700/95 px-3 py-1.5 text-xs font-medium text-white shadow">
          Dibujá sin soltar. Las zonas grises son de tus colegas: no se pueden pisar.
        </div>
      )}

      {/* La línea visible del choque, no un globito: en el celular los globitos no se abren. */}
      {choques.length > 0 && (
        <div className="absolute inset-x-3 bottom-16 z-[700] rounded-lg bg-red-700/95 px-3 py-2 text-xs text-white shadow">
          Tu trazo pisa {choques.map((c) => `«${c.nombre}» (${c.owner_nombre}, ${c.pct}%)`).join(", ")}. Lo rayado es lo que choca: corré el trazo y volvé a guardar.
        </div>
      )}

      {puedeDibujar && (
        <div className="absolute bottom-3 right-3 z-[700] flex gap-2">
          {trazo && (
            <Button variant="secondary" size="sm" className="h-9" onClick={() => { setTrazo(null); setChoques([]); setLapizActivo(true) }}>
              Borrar el trazo
            </Button>
          )}
          <Button size="sm" className="h-9 gap-1.5" disabled={!trazo || guardando} onClick={guardar}>
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar
          </Button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "farming" ; echo "fin"`
Expected: sin líneas de error para `components/farming/`. (El proyecto puede tener otros errores previos; solo importan los de estos archivos.)

- [ ] **Step 4: Commit**

```bash
git add components/farming/capas-farming.tsx components/farming/mapa-farming.tsx
git commit -m "feat(farming): mapa con el lapiz del Buscador y las capas (propia, ajenas, choques)"
```

---

### Task 9: La página del asesor

**Files:**
- Create: `components/farming/lista-zonas.tsx`
- Create: `components/farming/compartir-dialog.tsx`
- Create: `components/farming/farming-page.tsx`
- Create: `app/asesor/farming/page.tsx`

**Interfaces:**
- Consumes: `MapaFarming`, `ModoMapa` (Task 8); tipos (Task 3); los endpoints (Tasks 4-6); `Dialog, DialogContent, DialogHeader, DialogTitle` de `components/ui/dialog`; `Select, SelectTrigger, SelectValue, SelectContent, SelectItem` de `components/ui/select`.
- Produces: `FarmingPage` (sin props), `ListaZonas`, `CompartirDialog`.

- [ ] **Step 1: La lista**

```tsx
// components/farming/lista-zonas.tsx
"use client"

// Las tarjetas de «Mis zonas»: una por zona, con lo que dice el spec (nombre, km², pedazos,
// con quién se comparte) y los botones: ver, redibujar, sumar un pedazo, compartir, borrar.
// Las compartidas conmigo se listan aparte y solo se pueden ver.
import { Eye, Pencil, Plus, Share2, Trash2, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ZonaFarming } from "@/lib/farming/tipos"

function Tarjeta({
  zona,
  propia,
  onVer,
  onRedibujar,
  onSumar,
  onCompartir,
  onBorrar,
}: {
  zona: ZonaFarming
  propia: boolean
  onVer: () => void
  onRedibujar?: () => void
  onSumar?: () => void
  onCompartir?: () => void
  onBorrar?: () => void
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-card p-4 dark:border-zinc-800">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{zona.nombre}</p>
          <p className="text-xs text-muted-foreground">
            {zona.area_km2.toFixed(2)} km² · {zona.pedazos === 1 ? "1 pedazo" : `${zona.pedazos} pedazos`}
            {!propia && ` · zona de ${zona.owner_nombre}`}
          </p>
        </div>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={onVer}>
          <Eye className="h-3.5 w-3.5" /> ver
        </Button>
      </div>

      {/* Línea visible, no globito: quién más trabaja esta zona se tiene que ver de un vistazo. */}
      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Users className="h-3.5 w-3.5 shrink-0" />
        {zona.compartida_con.length === 0
          ? propia ? "Solo la trabajás vos" : `La trabajan ${zona.owner_nombre} y vos`
          : `La trabajan ${propia ? "vos" : zona.owner_nombre} y ${zona.compartida_con.map((c) => c.nombre).join(", ")}`}
      </p>

      {propia && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={onRedibujar}>
            <Pencil className="h-3.5 w-3.5" /> redibujar
          </Button>
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={onSumar}>
            <Plus className="h-3.5 w-3.5" /> sumar un pedazo
          </Button>
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={onCompartir}>
            <Share2 className="h-3.5 w-3.5" /> compartir
          </Button>
          <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-muted-foreground hover:text-destructive" onClick={onBorrar}>
            <Trash2 className="h-3.5 w-3.5" /> borrar
          </Button>
        </div>
      )}
    </div>
  )
}

export function ListaZonas({
  mias,
  compartidasConmigo,
  topes,
  onNueva,
  onVer,
  onRedibujar,
  onSumar,
  onCompartir,
  onBorrar,
}: {
  mias: ZonaFarming[]
  compartidasConmigo: ZonaFarming[]
  topes: { max_zonas: number; max_km2: number }
  onNueva: () => void
  onVer: (z: ZonaFarming) => void
  onRedibujar: (z: ZonaFarming) => void
  onSumar: (z: ZonaFarming) => void
  onCompartir: (z: ZonaFarming) => void
  onBorrar: (z: ZonaFarming) => void
}) {
  const llena = mias.length >= topes.max_zonas
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Mis zonas</h2>
          <p className="text-xs text-muted-foreground">
            Hasta {topes.max_zonas} zonas de {topes.max_km2} km² cada una. Ninguna puede pisar la de un colega.
          </p>
        </div>
        <Button className="h-10 gap-1.5" onClick={onNueva} disabled={llena} title={llena ? `Ya tenés ${topes.max_zonas}: borrá una para dibujar otra` : undefined}>
          <Plus className="h-4 w-4" /> dibujar una zona nueva
        </Button>
      </div>
      {llena && (
        <p className="text-xs text-amber-700 dark:text-amber-500">Ya tenés {topes.max_zonas} zonas, que es el máximo. Borrá una para dibujar otra.</p>
      )}

      {mias.length === 0 && (
        <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-muted-foreground dark:border-zinc-700">
          Todavía no tenés ninguna zona. Dibujá la primera con el botón de arriba, o desde el Buscador IA → Mapa → Mis zonas → «usar para farming».
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {mias.map((z) => (
          <Tarjeta key={z.id} zona={z} propia onVer={() => onVer(z)} onRedibujar={() => onRedibujar(z)} onSumar={() => onSumar(z)} onCompartir={() => onCompartir(z)} onBorrar={() => onBorrar(z)} />
        ))}
      </div>

      {compartidasConmigo.length > 0 && (
        <>
          <h3 className="text-sm font-semibold">Zonas que comparten conmigo</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {compartidasConmigo.map((z) => (
              <Tarjeta key={z.id} zona={z} propia={false} onVer={() => onVer(z)} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: El diálogo de compartir**

```tsx
// components/farming/compartir-dialog.tsx
"use client"

// Elegir un colega del desplegable. Al sumarlo, "automáticamente al asesor en su cuenta le
// aparece marcada esa zona como compartida" (pedido del 10-sep): eso pasa solo porque el GET
// de su pantalla la trae en compartidas_conmigo.
import { useState } from "react"
import { Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Colega, ZonaFarming } from "@/lib/farming/tipos"

export function CompartirDialog({
  zona,
  colegas,
  onSumar,
  onSacar,
  onCerrar,
}: {
  zona: ZonaFarming | null
  colegas: Colega[]
  onSumar: (zonaId: string, userId: string) => Promise<void>
  onSacar: (zonaId: string, userId: string) => Promise<void>
  onCerrar: () => void
}) {
  const [elegido, setElegido] = useState("")
  const [ocupado, setOcupado] = useState(false)

  const disponibles = colegas.filter((c) => !zona?.compartida_con.some((x) => x.id === c.id))

  const sumar = async () => {
    if (!zona || !elegido) return
    setOcupado(true)
    try {
      await onSumar(zona.id, elegido)
      setElegido("")
    } finally {
      setOcupado(false)
    }
  }

  return (
    <Dialog open={!!zona} onOpenChange={(abierto) => { if (!abierto) onCerrar() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Compartir «{zona?.nombre}»</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          El colega va a ver la zona en su Farming y va a trabajar el mismo tablero que vos. Vos seguís siendo quien la puede borrar.
        </p>

        {zona && zona.compartida_con.length > 0 && (
          <ul className="space-y-1">
            {zona.compartida_con.map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
                {c.nombre}
                <button onClick={() => onSacar(zona.id, c.id)} title="Dejar de compartir" className="rounded p-1 text-muted-foreground hover:text-destructive">
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {disponibles.length === 0 ? (
          <p className="text-sm text-muted-foreground">No queda ningún otro asesor activo con quien compartirla.</p>
        ) : (
          <div className="flex gap-2">
            <Select value={elegido} onValueChange={setElegido}>
              <SelectTrigger className="h-10 flex-1">
                <SelectValue placeholder="Elegí un colega" />
              </SelectTrigger>
              <SelectContent>
                {disponibles.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button className="h-10" disabled={!elegido || ocupado} onClick={sumar}>
              {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : "Compartir"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: El contenedor**

```tsx
// components/farming/farming-page.tsx
"use client"

// La página Farming del asesor. Etapa 1: solo «Mis zonas». Las solapas «Relevamiento» y
// «A la venta en mi zona» llegan en las etapas 3 y 2: acá no se dibujan solapas vacías.
import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import type { Dibujo } from "@/lib/farming/geometria"
import type { RespuestaZonas, ZonaFarming } from "@/lib/farming/tipos"
import { ListaZonas } from "./lista-zonas"
import { CompartirDialog } from "./compartir-dialog"
import { MapaFarming, type ModoMapa } from "./mapa-farming"

/** Un pedido a la API que, si viene 409, rechaza con los choques adentro. */
async function pedir(url: string, init?: RequestInit) {
  const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) {
    const e: any = new Error(d.error || "Algo salió mal")
    if (r.status === 409) e.choques = d.choques
    throw e
  }
  return d
}

export function FarmingPage() {
  const [datos, setDatos] = useState<RespuestaZonas | null>(null)
  const [cargando, setCargando] = useState(true)
  const [modo, setModo] = useState<ModoMapa | null>(null)
  const [compartiendo, setCompartiendo] = useState<ZonaFarming | null>(null)

  const recargar = useCallback(async () => {
    try {
      setDatos(await pedir("/api/farming/zonas"))
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { recargar() }, [recargar])

  // El diálogo de compartir muestra la zona con su lista de compartidos al día.
  useEffect(() => {
    if (!compartiendo || !datos) return
    const fresca = datos.mias.find((z) => z.id === compartiendo.id)
    if (fresca && fresca !== compartiendo) setCompartiendo(fresca)
  }, [datos, compartiendo])

  const guardar = async ({ nombre, geojson }: { nombre?: string; geojson: Dibujo }) => {
    if (!modo || modo.tipo === "ver") return
    if (modo.tipo === "nueva") {
      await pedir("/api/farming/zonas", { method: "POST", body: JSON.stringify({ nombre, geojson }) })
      toast.success("Zona guardada")
    } else {
      await pedir(`/api/farming/zonas/${modo.zonaId}`, { method: "PATCH", body: JSON.stringify({ accion: modo.tipo, geojson }) })
      toast.success(modo.tipo === "sumar" ? "Pedazo sumado" : "Zona redibujada")
    }
    setModo(null)
    await recargar()
  }

  const borrar = async (z: ZonaFarming) => {
    // ETAPA 3: si la zona tiene tarjetas, el texto cambia: "se archiva, tus tarjetas quedan".
    if (!window.confirm(`¿Borrar «${z.nombre}»? Esas cuadras quedan libres para otro asesor.`)) return
    try {
      await pedir(`/api/farming/zonas/${z.id}`, { method: "DELETE" })
      toast.success("Zona borrada")
      await recargar()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const sumarColega = async (zonaId: string, userId: string) => {
    try {
      await pedir(`/api/farming/zonas/${zonaId}/compartir`, { method: "POST", body: JSON.stringify({ user_id: userId }) })
      toast.success("Zona compartida")
      await recargar()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const sacarColega = async (zonaId: string, userId: string) => {
    try {
      await pedir(`/api/farming/zonas/${zonaId}/compartir?user_id=${encodeURIComponent(userId)}`, { method: "DELETE" })
      await recargar()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  if (cargando || !datos) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-6 p-4 pt-6 md:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Farming</h1>
        <p className="text-sm text-muted-foreground">Tu territorio: las cuadras que trabajás para captar propiedades.</p>
      </div>

      {modo ? (
        <MapaFarming modo={modo} ajenas={datos.ajenas} onGuardar={guardar} onCerrar={() => setModo(null)} />
      ) : (
        <ListaZonas
          mias={datos.mias}
          compartidasConmigo={datos.compartidas_conmigo}
          topes={datos.topes}
          onNueva={() => setModo({ tipo: "nueva" })}
          onVer={(z) => setModo({ tipo: "ver", actual: z.geojson })}
          onRedibujar={(z) => setModo({ tipo: "redibujar", zonaId: z.id, actual: z.geojson })}
          onSumar={(z) => setModo({ tipo: "sumar", zonaId: z.id, actual: z.geojson })}
          onCompartir={(z) => setCompartiendo(z)}
          onBorrar={borrar}
        />
      )}

      <CompartirDialog
        zona={compartiendo}
        colegas={datos.colegas}
        onSumar={sumarColega}
        onSacar={sacarColega}
        onCerrar={() => setCompartiendo(null)}
      />
    </div>
  )
}
```

- [ ] **Step 4: La ruta**

```tsx
// app/asesor/farming/page.tsx
import { FarmingPage } from "@/components/farming/farming-page"

export const metadata = {
  title: "Farming | PRISMA IA",
  description: "Tu zona de farming: el territorio donde captás propiedades.",
}

export default function AsesorFarmingPage() {
  return <FarmingPage />
}
```

- [ ] **Step 5: Levantar el dev y probar a mano el flujo mínimo**

Run: `npm run dev` (si el 3000 está tomado por otra terminal, `npx next dev -p 3010`; **el 3007 es del ACM, no usarlo**).

Con un **asesor de PRISMAIA - VAKDOR** (nunca uno de Central): abrir `/asesor/farming` → «dibujar una zona nueva» → dibujar en **Belgrano (CABA)** → nombre → Guardar. Debe aparecer la tarjeta con km² y «1 pedazo». Después «sumar un pedazo» → un trazo suelto → Guardar → «2 pedazos». Después «redibujar» **encima de la zona actual** → debe guardar (no choca consigo misma).

- [ ] **Step 6: Commit**

```bash
git add components/farming/lista-zonas.tsx components/farming/compartir-dialog.tsx components/farming/farming-page.tsx app/asesor/farming/page.tsx
git commit -m "feat(farming): pagina del asesor con Mis zonas, mapa, compartir y borrar"
```

---

### Task 10: El botón «usar para farming» en el Buscador

**Files:**
- Modify: `components/mapa/mapa-zonas-panel.tsx` (imports `:6`, estado `:31-35`, bloque de zonas guardadas `:158-183`)

**Interfaces:**
- Consumes: `POST /api/farming/zonas` (Task 4) con `origen_mapa_zona_id`.

- [ ] **Step 1: Agregar el botón y su formulario inline**

En los imports de `lucide-react` sumar `Sprout`. Sumar `import { usePathname } from "next/navigation"`.

Después de `const [descripcion, setDescripcion] = useState("")` agregar:

```tsx
  // «Usar para farming»: copia el dibujo a una zona de farming (spec 2026-09-11). Solo el
  // asesor: el director no dibuja territorio, así que en /director/... el botón no aparece.
  const pathname = usePathname()
  const esAsesor = pathname?.startsWith("/asesor/") ?? false
  const [farmingDe, setFarmingDe] = useState<string | null>(null)
  const [nombreFarming, setNombreFarming] = useState("")
  const [creandoFarming, setCreandoFarming] = useState(false)

  const usarParaFarming = async (z: ZonaGuardada) => {
    if (!nombreFarming.trim()) return toast.error("Ponele un nombre a la zona de farming")
    setCreandoFarming(true)
    try {
      const r = await fetch("/api/farming/zonas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nombreFarming.trim(), geojson: z.geojson, origen_mapa_zona_id: z.id }),
      })
      const d = await r.json()
      if (r.status === 409) {
        const c = d.choques?.[0]
        throw new Error(c ? `Ese dibujo pisa «${c.nombre}», zona de ${c.owner_nombre}. Corregilo desde Farming.` : d.error)
      }
      if (!r.ok) throw new Error(d.error || "No se pudo crear la zona de farming")
      setFarmingDe(null)
      setNombreFarming("")
      toast.success("Zona de farming creada. La ves en Propiedades → Farming.")
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setCreandoFarming(false)
    }
  }
```

En el bloque de cada zona guardada (`{zonas.map((z) => (...))}`), reemplazar el contenedor por uno que apile el formulario debajo:

```tsx
          {zonas.map((z) => (
            <div key={z.id} className="group rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
              <div className="flex items-start gap-2">
                <button className="min-w-0 flex-1 text-left" onClick={() => onAplicarZona(z)}>
                  <div className="flex items-center gap-1.5">
                    <MapPinned className="h-3 w-3 shrink-0 text-sky-600" />
                    <span className="truncate text-xs font-medium">{z.nombre}</span>
                  </div>
                  {z.descripcion && (
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-zinc-500">{z.descripcion}</p>
                  )}
                </button>
                {esAsesor && (
                  <button
                    onClick={() => { setFarmingDe(farmingDe === z.id ? null : z.id); setNombreFarming(z.nombre) }}
                    className="rounded p-1 text-zinc-600 hover:text-green-700 dark:text-zinc-400"
                    title="Usar este dibujo como zona de farming"
                  >
                    <Sprout className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  onClick={() => borrar(z.id)}
                  className="rounded p-1 text-zinc-600 dark:text-zinc-400 opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
                  title="Borrar zona"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {farmingDe === z.id && (
                <div className="mt-2 space-y-1.5">
                  {/* Línea visible, no globito: en el celular los globitos no se abren. */}
                  <p className="text-[10px] text-zinc-600 dark:text-zinc-400">Se copia el dibujo a Farming. Esta zona del Buscador queda igual.</p>
                  <Input
                    className="h-8 text-xs"
                    placeholder="Nombre de la zona de farming"
                    value={nombreFarming}
                    onChange={(e) => setNombreFarming(e.target.value)}
                    maxLength={80}
                    autoFocus
                  />
                  <div className="flex gap-1">
                    <Button size="sm" className="h-7 flex-1 text-xs" disabled={creandoFarming} onClick={() => usarParaFarming(z)}>
                      {creandoFarming ? <Loader2 className="h-3 w-3 animate-spin" /> : "Usar para farming"}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setFarmingDe(null)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
```

- [ ] **Step 2: Probar a mano**

Como asesor de PRISMAIA - VAKDOR: Buscador IA → Mapa → Mis zonas → una zona guardada → botón de la hoja → nombre → «Usar para farming» → toast. Ir a Farming: la zona está, con `origen_mapa_zona_id` cargado (verificar con `node scripts/sql-produccion.mjs "select nombre, origen_mapa_zona_id from farming_zonas order by created_at desc limit 3"`). Borrar la zona del Buscador: la de Farming **sigue estando**.

Como director (`/director/consultor`): el botón de la hoja **no aparece**.

- [ ] **Step 3: Commit**

```bash
git add components/mapa/mapa-zonas-panel.tsx
git commit -m "feat(farming): boton 'usar para farming' en Mis zonas del Buscador (solo asesor)"
```

---

### Task 11: La pantalla del director

**Files:**
- Create: `components/farming/farming-director.tsx`
- Create: `app/director/farming/page.tsx`

**Interfaces:**
- Consumes: `GET /api/farming/zonas` (para el director trae `equipo` completo y `ajenas` = todas), `POST /api/farming/zonas/[id]/liberar` (Task 6), `MapaFarming` en modo `ver` (Task 8).

- [ ] **Step 1: El componente**

```tsx
// components/farming/farming-director.tsx
"use client"

// Lo que ve el director: el mapa de la agencia con todas las zonas y de quién es cada una,
// la lista por asesor, y «liberar». NO hay aprobación de zonas ni asignación: Leonardo
// eligió "primero que la dibuja, la gana" (spec). Liberar no borra nada.
import { useCallback, useEffect, useState } from "react"
import { Loader2, Unlock } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { RespuestaZonas, ZonaFarming } from "@/lib/farming/tipos"
import { MapaFarming } from "./mapa-farming"

export function FarmingDirector() {
  const [datos, setDatos] = useState<RespuestaZonas | null>(null)
  const [liberando, setLiberando] = useState<ZonaFarming | null>(null)
  const [motivo, setMotivo] = useState("")
  const [ocupado, setOcupado] = useState(false)

  const recargar = useCallback(async () => {
    const r = await fetch("/api/farming/zonas")
    const d = await r.json()
    if (!r.ok) return toast.error(d.error || "No se pudieron traer las zonas")
    setDatos(d)
  }, [])

  useEffect(() => { recargar() }, [recargar])

  const liberar = async () => {
    if (!liberando) return
    setOcupado(true)
    try {
      const r = await fetch(`/api/farming/zonas/${liberando.id}/liberar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      toast.success(`«${liberando.nombre}» liberada. Esas cuadras ya se pueden volver a dibujar.`)
      setLiberando(null)
      setMotivo("")
      await recargar()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setOcupado(false)
    }
  }

  if (!datos) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  // Agrupado por asesor, para leer el reparto de un vistazo.
  const porAsesor = new Map<string, ZonaFarming[]>()
  for (const z of datos.equipo) porAsesor.set(z.owner_nombre, [...(porAsesor.get(z.owner_nombre) || []), z])

  return (
    <div className="flex h-full flex-col gap-6 p-4 pt-6 md:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Farming de la inmobiliaria</h1>
        <p className="text-sm text-muted-foreground">
          {datos.equipo.length} {datos.equipo.length === 1 ? "zona activa" : "zonas activas"} entre {porAsesor.size} {porAsesor.size === 1 ? "asesor" : "asesores"}. Cada uno dibuja la suya; vos podés liberar una si hace falta.
        </p>
      </div>

      <MapaFarming modo={{ tipo: "ver", actual: null }} ajenas={datos.ajenas} onGuardar={async () => {}} onCerrar={() => {}} />

      {datos.equipo.length === 0 && (
        <p className="text-sm text-muted-foreground">Ningún asesor dibujó todavía su zona.</p>
      )}

      {[...porAsesor.entries()].map(([asesor, zonas]) => (
        <div key={asesor} className="space-y-2">
          <h2 className="text-sm font-semibold">{asesor}</h2>
          {zonas.map((z) => (
            <div key={z.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-card px-4 py-3 dark:border-zinc-800">
              <div>
                <p className="font-medium">{z.nombre}</p>
                <p className="text-xs text-muted-foreground">
                  {z.area_km2.toFixed(2)} km² · {z.pedazos === 1 ? "1 pedazo" : `${z.pedazos} pedazos`}
                  {z.compartida_con.length > 0 && ` · compartida con ${z.compartida_con.map((c) => c.nombre).join(", ")}`}
                </p>
              </div>
              <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setLiberando(z)}>
                <Unlock className="h-3.5 w-3.5" /> liberar
              </Button>
            </div>
          ))}
        </div>
      ))}

      <Dialog open={!!liberando} onOpenChange={(a) => { if (!a) setLiberando(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Liberar «{liberando?.nombre}»</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            No se borra nada: la zona queda en el historial con la fecha y este motivo. Lo único que cambia es que esas cuadras vuelven a estar libres para que otro asesor las dibuje.
          </p>
          <Textarea placeholder="Por qué se libera (ej: el asesor se desvinculó)" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setLiberando(null)}>Cancelar</Button>
            <Button disabled={!motivo.trim() || ocupado} onClick={liberar}>
              {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : "Liberar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 2: La ruta**

```tsx
// app/director/farming/page.tsx
import { FarmingDirector } from "@/components/farming/farming-director"

export const metadata = {
  title: "Farming | PRISMA IA",
  description: "El territorio de farming de la inmobiliaria, asesor por asesor.",
}

export default function DirectorFarmingPage() {
  return <FarmingDirector />
}
```

- [ ] **Step 3: Probar a mano**

Con la cuenta de Leonardo (director de PRISMAIA - VAKDOR): `/director/farming` muestra el mapa con las zonas de prueba en gris, la lista agrupada por asesor, y «liberar» pide motivo. Liberar una → desaparece de la lista → en `/asesor/farming` del asesor también desapareció → el asesor **puede volver a dibujar encima** de esas cuadras.

- [ ] **Step 4: Commit**

```bash
git add components/farming/farming-director.tsx app/director/farming/page.tsx
git commit -m "feat(farming): pantalla del director con el mapa de la agencia y liberar"
```

---

### Task 12: El ataque contra producción que tiene que fallar

**Files:**
- Create: `scratch/farming-rls-ataque.mjs` (no se versiona)

La memoria `verificar-el-ataque-despues-de-aplicar` es explícita: un arreglo de seguridad no está hecho hasta que el ataque falla, **y hasta confirmar que la medición midió** (controles positivos).

- [ ] **Step 1: Confirmar que hay dos asesores en PRISMAIA - VAKDOR**

```bash
node scripts/sql-produccion.mjs "select p.id, p.full_name, p.role, p.estado from profiles p join agencies a on a.id = p.agency_id where a.name ilike '%PRISMAIA%' order by role, full_name"
```

Si hay menos de dos asesores activos: **pedirle a Leonardo** un segundo asesor de prueba (o el OK para crear una invitación desde su Configuración). No crear nada sin OK.

- [ ] **Step 2: El script**

Recibe las credenciales por variables de entorno para no escribirlas en ningún archivo:

```js
// scratch/farming-rls-ataque.mjs
// Uso (PowerShell):
//   $env:A_EMAIL="..."; $env:A_PASS="..."; $env:B_EMAIL="..."; $env:B_PASS="..."; node scratch/farming-rls-ataque.mjs
// A y B son dos asesores de PRISMAIA - VAKDOR. Entra por PostgREST con la clave ANON (o sea,
// con la RLS puesta): lo que el endpoint no protege, esto lo tiene que frenar.
import fs from "node:fs"
import { createClient } from "@supabase/supabase-js"

const env = Object.fromEntries(fs.readFileSync(".env", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_0-9]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")] }))
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY

async function entrar(email, password) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } })
  const { data, error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw error
  return { c, uid: data.user.id }
}

const cuadrado = { type: "Polygon", coordinates: [[[-58.99, -34.99], [-58.98, -34.99], [-58.98, -34.98], [-58.99, -34.98], [-58.99, -34.99]]] }
const resultados = []
const espera = (nombre, ok) => { resultados.push({ nombre, ok }); console.log(ok ? "  ✔" : "  ✘", nombre) }

const A = await entrar(process.env.A_EMAIL, process.env.A_PASS)
const B = await entrar(process.env.B_EMAIL, process.env.B_PASS)
const { data: perfilA } = await A.c.from("profiles").select("agency_id").eq("id", A.uid).single()

console.log("Control positivo: A crea su zona por PostgREST")
const { data: zona, error: e1 } = await A.c.from("farming_zonas").insert({ agency_id: perfilA.agency_id, owner_user_id: A.uid, nombre: "ATAQUE-RLS (borrar)", geojson: cuadrado, area_km2: 1 }).select("id").single()
espera("A pudo crear la suya", !e1 && !!zona)

console.log("Control positivo: A renombra la suya")
const { data: r1 } = await A.c.from("farming_zonas").update({ nombre: "ATAQUE-RLS renombrada" }).eq("id", zona.id).select("id")
espera("A pudo editar la suya (1 fila)", r1?.length === 1)

console.log("B ve el contorno de A (esperado: SÍ, misma agencia)")
const { data: r2 } = await B.c.from("farming_zonas").select("id, nombre").eq("id", zona.id)
espera("B ve la zona de A", r2?.length === 1)

console.log("ATAQUE 1: B renombra la zona de A")
const { data: r3 } = await B.c.from("farming_zonas").update({ nombre: "PWNED" }).eq("id", zona.id).select("id")
espera("B NO pudo editar (0 filas)", (r3?.length ?? 0) === 0)

console.log("ATAQUE 2: B se suma solo a la zona de A")
const { error: e4 } = await B.c.from("farming_zonas_compartidas").insert({ zona_id: zona.id, user_id: B.uid, agregado_por: B.uid })
espera("B NO pudo compartirse (error de RLS)", !!e4)

console.log("ATAQUE 3: B crea una zona a nombre de A")
const { error: e5 } = await B.c.from("farming_zonas").insert({ agency_id: perfilA.agency_id, owner_user_id: A.uid, nombre: "PWNED", geojson: cuadrado, area_km2: 1 })
espera("B NO pudo crear a nombre de A", !!e5)

console.log("ATAQUE 4: B borra la zona de A")
const { data: r6 } = await B.c.from("farming_zonas").delete().eq("id", zona.id).select("id")
espera("B NO pudo borrar (0 filas)", (r6?.length ?? 0) === 0)

console.log("Limpieza: A borra la suya")
const { data: r7 } = await A.c.from("farming_zonas").delete().eq("id", zona.id).select("id")
espera("A borró la suya (1 fila)", r7?.length === 1)

const fallas = resultados.filter((r) => !r.ok)
console.log(fallas.length ? `\n✘ ${fallas.length} FALLAS` : "\n✔ Todo como tiene que ser: los ataques fallan y los controles positivos pasan")
process.exit(fallas.length ? 1 : 0)
```

- [ ] **Step 3: Correrlo y anotar el resultado**

Expected: los 4 ataques fallan, los 3 controles positivos pasan. Si un ataque pasa, la política está mal: **no seguir** hasta arreglarla (con OK de Leonardo para el `alter policy`) y volver a correr.

El resultado (fecha, 7 líneas) va a la bitácora en la Task 13.

---

### Task 13: Verificación en el navegador, docs y cierre de la etapa

**Files:**
- Modify: `docs/interno/bitacora-sesiones.md` (entrada nueva arriba)
- Modify: `docs/compartible/estandarizada/FUNCIONAL-ASESOR-PRISMA.md` y `FUNCIONAL-DIRECTOR-PRISMA.md` (sección Farming)

- [ ] **Step 1: Servidor recién levantado**

Matar cualquier `next dev` viejo y levantar de nuevo: el dev server sirve código viejo justo después de editar (bitácora 8-sep). Nunca `next build` con el dev levantado: pisa `.next`.

- [ ] **Step 2: Escritorio, con Chrome DevTools MCP, en los DOS temas**

Como asesor de PRISMAIA - VAKDOR, a 1366×768, tema claro y después oscuro (`mode-toggle`), sacando captura de cada estado:

1. `/asesor/farming` vacío → texto de bienvenida legible.
2. «dibujar una zona nueva» → el mapa encuadra CABA, el lápiz está prendido, el cartel azul se lee.
3. Dibujar en Belgrano → el trazo verde queda → nombre → Guardar → tarjeta con km² y «1 pedazo».
4. Con el **segundo asesor** (otra ventana/incógnito): `/asesor/farming` → «dibujar» → **la zona del primero se ve gris punteada** con su nombre al pasar el mouse → dibujar **encima** → Guardar → **toast rojo + recorte rayado + la línea roja de abajo**, y **el trazo sigue en pantalla**. Corregirlo al lado → Guardar → ok.
5. Primer asesor: «sumar un pedazo» → «2 pedazos». «redibujar» encima de sí misma → ok.
6. «compartir» → desplegable con el segundo asesor → Compartir → la tarjeta dice «La trabajan vos y …». En la ventana del segundo asesor, recargar → la zona aparece en «Zonas que comparten conmigo», sin botones de edición.
7. «borrar» → confirmación → desaparece. Con el segundo asesor: la compartida desapareció también.
8. Cuarta zona: el botón «dibujar» se deshabilita y el texto ámbar lo explica.
9. `/director/farming` con la cuenta de Leonardo: mapa + lista + liberar con motivo.

Contraste: correr el medidor de la sesión del 8-sep sobre `/asesor/farming` y `/director/farming` en los dos temas. Ningún texto bajo 4,5:1.

- [ ] **Step 3: Celular (emulación 390×844)**

Los mismos pasos 2-7. Además, medido, no mirado:
- Los botones «redibujar / sumar / compartir / borrar» miden **≥ 44 px de alto** y el toque cae adentro (memoria `boton-que-se-ve-pero-no-se-toca`).
- Dibujar con el dedo **no scrollea la página** (`touchAction: none` con el lápiz activo).
- El cartel rojo del choque se lee sin abrir nada (no es un globito).
- El `Select` de compartir se abre y se elige con el dedo.

- [ ] **Step 4: La suite completa y el lint**

Run: `npm test` y `npm run lint`
Expected: todo verde; el lint sin errores nuevos en `components/farming`, `lib/farming`, `app/api/farming`.

- [ ] **Step 5: Bitácora y guías**

Entrada nueva arriba de `docs/interno/bitacora-sesiones.md` con: qué se construyó (etapa 1), las 7 líneas del ataque RLS con la fecha, lo que se midió en el celular, errores propios si los hubo, y qué quedó pendiente (etapas 2 y 3; la migración de `farming_direcciones`).

En `FUNCIONAL-ASESOR-PRISMA.md`, sección nueva **«Farming: tu zona»**, sin tecnicismos (memoria `estilo-guias-funcionales`): qué es, cómo dibujarla (los dos caminos), qué pasa si pisás a un colega, cómo sumar un pedazo, compartir y borrar. En `FUNCIONAL-DIRECTOR-PRISMA.md`: **«Farming: el reparto del territorio»** — ver y liberar, y que liberar no borra nada.

- [ ] **Step 6: Commit y pedir el OK para mergear**

```bash
git add docs/interno/bitacora-sesiones.md docs/compartible/estandarizada/FUNCIONAL-ASESOR-PRISMA.md docs/compartible/estandarizada/FUNCIONAL-DIRECTOR-PRISMA.md
git commit -m "docs(farming): bitacora de la etapa 1 y guias del asesor y del director"
```

Mostrarle a Leonardo las capturas de escritorio y celular, el resultado del ataque RLS y el número de tests. **El merge a `main` es con su OK** (memoria `merge-a-main-flujo-clasico`): rama `farming-zonas` → `main`, sin borrar la rama hasta que él lo diga.

---

## Lo que esta etapa deja listo para la 2 y la 3

- **Etapa 2 («A la venta en mi zona»)**: necesita `farming_avisos_marca` y la función `farming_avisos_en_zona(p_geojson, …)` sobre `mercado_avisos` con PostGIS, medida con `EXPLAIN ANALYZE`. La solapa entra en `farming-page.tsx` envolviendo `ListaZonas` en `Tabs`.
- **Etapa 3 (el tablero y la caminata)**: `farming_direcciones`, `farming_propietarios`, `farming_contactos`; los dos comentarios `// ETAPA 3:` en `app/api/farming/zonas/[id]/route.ts` (borrar → archivar; redibujar → `fuera_de_zona`) y el de `farming-page.tsx` (el texto del borrado) dicen exactamente qué regla del spec va en cada lugar.
