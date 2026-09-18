# Prefactibilidad — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una página "Prefactibilidad" (director y asesor) donde se escribe una dirección de CABA, el mapa marca el lote oficial y la ficha dice cuánto se puede construir (envolvente oficial del Código Urbanístico) y cuánto vale la tierra (terrenos comparables de la red), con ficha pública compartible e imprimible.

**Architecture:** Datos abiertos del GCBA: el Código Urbanístico por parcela y las puertas se cargan en Supabase; el contorno del lote, la manzana y la **envolvente oficial** (teselas vectoriales de Ciudad 3D) se piden en vivo desde el servidor y se guardan en caché. Toda la lógica es pura en `lib/prefactibilidad/` con tests vitest; las rutas API exigen sesión y escriben con el cliente admin filtrando por agencia; la ficha pública lee un snapshot congelado por token (molde `shared_acm_reports`).

**Tech Stack:** Next.js 14 App Router, Supabase (PostGIS), `@turf/turf` ^7.4.0, `@mapbox/vector-tile` 3.0.0 + `pbf` 5.1.2, `papaparse` ^5.5.3, react-leaflet ^4.2.1, vitest ^2.1.9.

**Spec:** `docs/superpowers/specs/2026-09-12-prefactibilidad-design.md` (leer entera, incluida la **Adenda 17-sep**: la envolvente oficial es la fuente; la regla del cuarto es control y respaldo).

## Global Constraints

- Rama `feat/prefactibilidad`, worktree `PRISMA-SYSTEM-prefactibilidad`. Nunca `git add -A`: cada commit lista sus archivos.
- Tests nuevos en `lib/prefactibilidad/**/*.test.ts` y `app/api/prefactibilidad/**/*.test.ts` (vitest los incluye; `lib/mapa/**` NO, corre con node:test). Import style: `import { describe, it, expect } from "vitest"`, nombres en castellano.
- Ninguna constante del Código a mano fuera de `lib/prefactibilidad/codigo.ts`; cada una con su artículo.
- Rutas API: `requireTenant()` de `@/lib/auth/tenant-validation`; escritura con `createAdminClient()` filtrando por `agency_id`; errores `NextResponse.json({ error: "<castellano>" }, { status })`; catch-all `status: e.message === "Unauthorized" ? 401 : 500`.
- Llamadas al GCBA solo desde el servidor, con `headers: { "User-Agent": UA }` y `signal: AbortSignal.timeout(8000)`. UA = `"PRISMA-prefactibilidad/1.0 (inmobiliaria; contacto: osterrietchleonardo@vakdor.com)"`.
- Mensajes al usuario (exactos, spec): "El catastro de la Ciudad no está respondiendo, probá en unos minutos" · "No encontramos ese número. Probá con otro número de la misma cuadra" · "Por ahora solo Ciudad de Buenos Aires" · "sin comparables suficientes".
- Leyenda fija (pantalla y ficha): "Estudio orientativo elaborado con datos públicos del Gobierno de la Ciudad de Buenos Aires. No reemplaza el informe de un profesional matriculado ni el certificado urbanístico oficial."
- m² vendibles = construibles × `FACTOR_VENDIBLE = 0.80`. Balcones no se cuentan. Mínimo 5 comparables para mostrar valor de tierra. Radio 800 m.
- Migraciones: `supabase/migrations/YYYYMMDDHHMMSS_<slug>.sql` en `begin; … commit;` con rollback en `supabase/rollback/`. **Aplicar a producción solo con OK de Leonardo** (`node scripts/sql-produccion.mjs "<SQL>"`; el clasificador bloquea `ALTER TABLE`, Leonardo lo corre con `!`).
- Solo CABA. Sin IA. Sin plusvalía en v1.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `lib/prefactibilidad/tipos.ts` | Tipos compartidos (unidad, volumen oficial, planta, resultado, snapshot). |
| `lib/prefactibilidad/codigo.ts` | Tabla del Código (alturas, pisos, retiros, fondo mínimo) con artículos. `FACTOR_VENDIBLE`. |
| `lib/prefactibilidad/geo.ts` | Proyección local a metros, área planar, distancia punto-segmento. |
| `lib/prefactibilidad/teselas.ts` | Matemática de teselas, decodificar MVT (gzip) a GeoJSON, filtrar por `smp`/`sm`. |
| `lib/prefactibilidad/envolvente.ts` | Envolvente oficial → plantas y totales (unir pedazos, recortar al lote, medir). |
| `lib/prefactibilidad/lfi-regla.ts` | Regla del cuarto (control y respaldo): manzana típica, banda, huella. |
| `lib/prefactibilidad/avisos.ts` | Banderas: esquina, atípica, área especial, catalogado, dos alturas, PH, plano límite raro. |
| `lib/prefactibilidad/tierra.ts` | Estadística de terrenos comparables (mediana, rango, USD/m²). |
| `lib/prefactibilidad/normalizar-calle.ts` | USIG "CABILDO AV." ↔ frentes "AV. CABILDO"; abrir `num_dom`. |
| `lib/prefactibilidad/gcba.ts` | Cliente HTTP del GCBA (USIG, epok, teselas) con fetch inyectable. |
| `lib/prefactibilidad/analizar.ts` | Orquestador puro: parcela → resultado (recibe dependencias). |
| `lib/prefactibilidad/plano-svg.ts` | SVG del lote + huella para pantalla y PDF. |
| `lib/prefactibilidad/criollo.ts` | Textos: nombre de unidad en criollo, "PB + 5 pisos, más 2 retirados". |
| `supabase/migrations/20260918100000_prefactibilidad_gcba.sql` | Tablas `gcba_parcelas_cur`, `gcba_puertas`, `gcba_parcela_cache`. |
| `supabase/migrations/20260918100100_prefactibilidades.sql` | Tabla `prefactibilidades` + RLS + RPC `prefactibilidad_terrenos_cerca`. |
| `scripts/gcba/cargar-codigo-urbanistico.mjs` | CSV del Código → `gcba_parcelas_cur`. `--dry`, `--verificar`. |
| `scripts/gcba/cargar-puertas.mjs` | CSV de frentes → `gcba_puertas`. |
| `scripts/gcba/bajar-fixtures.mjs` | Baja teselas y geometrías de las parcelas de prueba a `lib/prefactibilidad/__fixtures__/`. |
| `scripts/gcba/validar-20-parcelas.mjs` | Nuestra medición vs TodoProps; escribe la evidencia. |
| `app/api/prefactibilidad/direcciones/route.ts` | Autocompletar (USIG). |
| `app/api/prefactibilidad/analizar/route.ts` | Dirección → parcela → resultado. |
| `app/api/prefactibilidad/route.ts` | GET lista / POST guardar. |
| `app/api/prefactibilidad/[id]/compartir/route.ts` | Genera token. |
| `app/api/prefactibilidad/[id]/route.ts` | GET una / DELETE. |
| `app/asesor/prefactibilidad/components/*.tsx` | Módulo UI compartido (asesor y director). |
| `app/asesor/prefactibilidad/page.tsx`, `app/director/prefactibilidad/page.tsx` | Páginas. |
| `app/prefactibilidad/[token]/page.tsx` (+ `PrintButton.tsx`) | Ficha pública. |
| `lib/nav/menu.ts`, `lib/nav/menu.test.ts` | Entrada "Prefactibilidad". |

---

### Task 1: Tipos y tabla del Código

**Files:**
- Create: `lib/prefactibilidad/tipos.ts`
- Create: `lib/prefactibilidad/codigo.ts`
- Test: `lib/prefactibilidad/codigo.test.ts`

**Interfaces:**
- Produces: `Unidad`, `TipoVolumen`, `VolumenOficial`, `Planta`, `Edificabilidad`, `UNIDADES`, `FACTOR_VENDIBLE`, `unidadDesdeAltura(alturaCsv: number): Unidad | null`.

- [ ] **Step 1: Escribir el test que falla**

```ts
// lib/prefactibilidad/codigo.test.ts
import { describe, it, expect } from "vitest";
import { UNIDADES, FACTOR_VENDIBLE, unidadDesdeAltura } from "./codigo";

describe("tabla del Código Urbanístico (art. 6.2 y 6.3, texto consolidado Ley 6.776)", () => {
  it("las siete unidades con su altura máxima", () => {
    expect(UNIDADES.CA.alturaMaxima).toBe(38);
    expect(UNIDADES.CM.alturaMaxima).toBe(31.2);
    expect(UNIDADES.USAA.alturaMaxima).toBe(22.8);
    expect(UNIDADES.USAM.alturaMaxima).toBe(17.2);
    expect(UNIDADES.USAB2.alturaMaxima).toBe(14.6);
    expect(UNIDADES.USAB1.alturaMaxima).toBe(12);
    expect(UNIDADES.USAB0.alturaMaxima).toBe(9);
  });
  it("plano límite: altura + 7 m donde hay retirados; igual a la altura en las bajas", () => {
    expect(UNIDADES.USAM.planoLimite).toBe(24.2);
    expect(UNIDADES.CA.planoLimite).toBe(45);
    expect(UNIDADES.USAB2.planoLimite).toBe(14.6);
    expect(UNIDADES.USAB1.retirados).toBe(0);
    expect(UNIDADES.USAM.retirados).toBe(2);
  });
  it("pisos del cuerpo: PB + n (los que usa el mercado y TodoProps)", () => {
    expect(UNIDADES.CA.pisosCuerpo).toBe(13);
    expect(UNIDADES.USAM.pisosCuerpo).toBe(6);
    expect(UNIDADES.USAB0.pisosCuerpo).toBe(3);
  });
  it("basamento hasta la L.I.B. solo en corredores; retiro mínimo de fondo 4/6/8", () => {
    expect(UNIDADES.CA.basamento).toBe(true);
    expect(UNIDADES.USAM.basamento).toBe(false);
    expect(UNIDADES.USAB1.retiroFondoMin).toBe(4);
    expect(UNIDADES.USAA.retiroFondoMin).toBe(6);
    expect(UNIDADES.CM.retiroFondoMin).toBe(8);
  });
  it("cada unidad cita su artículo", () => {
    for (const u of Object.values(UNIDADES)) expect(u.articulo).toMatch(/^6\.2\.[1-7]$/);
  });
  it("traduce la altura del CSV a la unidad; 0 o rara → null", () => {
    expect(unidadDesdeAltura(17.2)).toBe("USAM");
    expect(unidadDesdeAltura(38)).toBe("CA");
    expect(unidadDesdeAltura(0)).toBeNull();
    expect(unidadDesdeAltura(13)).toBeNull();
  });
  it("el factor vendible es 0,80", () => {
    expect(FACTOR_VENDIBLE).toBe(0.8);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run lib/prefactibilidad/codigo.test.ts`
Expected: FAIL — `Cannot find module './codigo'`.

- [ ] **Step 3: Tipos**

```ts
// lib/prefactibilidad/tipos.ts
// Prefactibilidad · tipos compartidos. GeoJSON escribe [lng, lat].
import type { Feature, MultiPolygon, Polygon } from "geojson";

export type Unidad = "CA" | "CM" | "USAA" | "USAM" | "USAB2" | "USAB1" | "USAB0";
export type TipoVolumen = "cuerpo principal" | "retiro 1" | "retiro 2" | "basamento";
export type Poligono = Polygon | MultiPolygon;

/** Un polígono de la capa oficial `volumen_edif` de Ciudad 3D, ya en lon/lat. */
export interface VolumenOficial {
  smp: string;
  tipo: TipoVolumen;
  unidad: Unidad;
  alturaInicial: number;
  alturaFinal: number;
  geom: Poligono;
}

export interface Planta {
  /** "Planta baja y 5 pisos", "Primer retirado", "Segundo retirado", "Basamento (PB y 1º)". */
  nombre: string;
  unidad: Unidad;
  m2PorNivel: number;
  niveles: number;
  desdeM: number;
  hastaM: number;
}

export interface Edificabilidad {
  modo: "oficial" | "regla";
  unidades: Unidad[];
  alturaMaxima: number;
  planoLimite: number;
  plantas: Planta[];
  m2Construibles: number;
  m2Vendibles: number;
  /** Huella del cuerpo principal recortada al lote, para dibujar. */
  huella: Poligono | null;
  /** Solo en modo regla: piso y techo del rango. */
  rango?: { piso: number; techo: number };
}

export interface CatastroParcela {
  smp: string;
  direccion: string;
  superficieTotal: number | null;
  superficieCubierta: number | null;
  frente: number | null;
  fondo: number | null;
  propiedadHorizontal: boolean;
  pisosSobreRasante: number | null;
  unidadesFuncionales: number | null;
  centroide: [number, number]; // [lng, lat]
}

export interface FilaCur {
  smp: string;
  uniEdif: number[];      // uni_edif_1..4 sin ceros
  planoL: number | null;
  tipoMza: "TIPICA" | "ATIPICA" | null;
  catalogado: number;
  distGrp: string | null;  // AE, U, APH, RUA, UP, ...
  distEsp: string | null;
  distCpu: string | null;
  barrio: string | null;
  comuna: string | null;
  publicado: string;       // fecha de publicación del dataset
}

export interface Aviso {
  clave: "esquina" | "atipica" | "area_especial" | "catalogado" | "dos_alturas" | "ph_consolidado" | "plano_limite_raro" | "sin_envolvente" | "sin_dato_codigo";
  texto: string;
  /** true = exige la leyenda "requiere estudio profesional" arriba del bloque. */
  fuerte: boolean;
}

export interface TerrenoCerca {
  id: number;
  titulo: string | null;
  direccion: string | null;
  barrio: string | null;
  precioUsd: number;
  superficieM2: number;
  distanciaM: number;
  url: string;
  foto: string | null;
}

export interface ValorTierra {
  comparables: TerrenoCerca[];
  usdM2Mediana: number;
  usdM2P25: number;
  usdM2P75: number;
  valorLote: { desde: number; mediana: number; hasta: number };
}

export interface Prefactibilidad {
  direccion: string;
  smp: string;
  lote: CatastroParcela;
  geomLote: Poligono;
  geomManzana: Poligono | null;
  manzanaTipo: "TIPICA" | "ATIPICA" | null;
  cur: FilaCur | null;
  edificabilidad: Edificabilidad;
  avisos: Aviso[];
  tierra: ValorTierra | null;
  fuentes: { curPublicado: string | null; consultadoEn: string };
}

export type FeatureVolumen = Feature<Poligono, { smp: string; tipo: string; edificabil: string; altura_inicial: number; altura_final: number }>;
```

- [ ] **Step 4: La tabla**

```ts
// lib/prefactibilidad/codigo.ts
// Las constantes del Código Urbanístico (Ley 6.099, texto consolidado por Ley 6.776, BOCBA
// 7026 del 26-dic-2024). NADA de esto va a mano en otro archivo. Fuente: PDF "Cuerpo
// principal" del dataset codigo-urbanistico, art. 6.2.1 a 6.2.7 (alturas), 6.3 (retirados),
// 6.4.2.4 (fondo mínimo), 6.4.3 (basamento).
//
// Los pisos NO están en el Código (fija metros): se derivan con PB mínima (3 m; 2,6 m en las
// bajas) y entrepisos de ~2,85 m. Son los que usa el mercado y los que muestra TodoProps.
import type { Unidad } from "./tipos";

export interface DefUnidad {
  nombre: string;
  criollo: string;
  alturaMaxima: number;
  planoLimite: number;
  /** Niveles del cuerpo principal contando la planta baja. */
  pisosCuerpo: number;
  retirados: 0 | 2;
  /** Basamento hasta 6 m que puede llegar a la L.I.B. (solo corredores, art. 6.2.1/6.2.2). */
  basamento: boolean;
  /** Distancia no edificable desde el fondo si la L.F.I. no alcanza al lote (art. 6.4.2.4). */
  retiroFondoMin: 4 | 6 | 8;
  articulo: string;
}

export const UNIDADES: Record<Unidad, DefUnidad> = {
  CA:    { nombre: "Corredor Alto",   criollo: "corredor alto",         alturaMaxima: 38,   planoLimite: 45,   pisosCuerpo: 13, retirados: 2, basamento: true,  retiroFondoMin: 8, articulo: "6.2.1" },
  CM:    { nombre: "Corredor Medio",  criollo: "corredor medio",        alturaMaxima: 31.2, planoLimite: 38.2, pisosCuerpo: 11, retirados: 2, basamento: true,  retiroFondoMin: 8, articulo: "6.2.2" },
  USAA:  { nombre: "U.S.A.A.",        criollo: "altura alta",           alturaMaxima: 22.8, planoLimite: 29.8, pisosCuerpo: 8,  retirados: 2, basamento: false, retiroFondoMin: 6, articulo: "6.2.3" },
  USAM:  { nombre: "U.S.A.M.",        criollo: "altura media",          alturaMaxima: 17.2, planoLimite: 24.2, pisosCuerpo: 6,  retirados: 2, basamento: false, retiroFondoMin: 6, articulo: "6.2.4" },
  USAB2: { nombre: "U.S.A.B. 2",      criollo: "altura baja 2",         alturaMaxima: 14.6, planoLimite: 14.6, pisosCuerpo: 5,  retirados: 0, basamento: false, retiroFondoMin: 4, articulo: "6.2.5" },
  USAB1: { nombre: "U.S.A.B. 1",      criollo: "altura baja 1",         alturaMaxima: 12,   planoLimite: 12,   pisosCuerpo: 4,  retirados: 0, basamento: false, retiroFondoMin: 4, articulo: "6.2.6" },
  USAB0: { nombre: "U.S.A.B. 0",      criollo: "altura baja 0",         alturaMaxima: 9,    planoLimite: 9,    pisosCuerpo: 3,  retirados: 0, basamento: false, retiroFondoMin: 4, articulo: "6.2.7" },
};

/** Art. 6.3: primer retirado a 2 m de la L.O.; segundo a 4 m de la L.O. y de la L.F.I.; plano límite = altura + 7. */
export const RETIRO_1_M = 2;
export const RETIRO_2_M = 4;
export const PLANO_LIMITE_EXTRA_M = 7;
/** Art. 6.4.3: banda edificable mínima garantizada en manzanas especiales. */
export const BANDA_MINIMA_M = 16;
/** Vendible sobre construible. Mercado: 78–85 %; se toma abajo a propósito (spec). */
export const FACTOR_VENDIBLE = 0.8;

const POR_ALTURA: Array<[number, Unidad]> = [[38, "CA"], [31.2, "CM"], [22.8, "USAA"], [17.2, "USAM"], [14.6, "USAB2"], [12, "USAB1"], [9, "USAB0"]];

/** La columna uni_edif_N del CSV trae la altura; la unidad se deduce de ahí. */
export function unidadDesdeAltura(alturaCsv: number): Unidad | null {
  const hit = POR_ALTURA.find(([h]) => Math.abs(h - alturaCsv) < 0.05);
  return hit ? hit[1] : null;
}
```

- [ ] **Step 5: Correr y ver que pasa**

Run: `npx vitest run lib/prefactibilidad/codigo.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/prefactibilidad/tipos.ts lib/prefactibilidad/codigo.ts lib/prefactibilidad/codigo.test.ts
git commit -m "feat(prefactibilidad): tipos y tabla del Código Urbanístico con sus artículos"
```

---

### Task 2: Geometría básica en metros

**Files:**
- Create: `lib/prefactibilidad/geo.ts`
- Test: `lib/prefactibilidad/geo.test.ts`

**Interfaces:**
- Produces: `proyector(origen: [lng, lat])` → `{ aMetros(p: [lng,lat]): [x,y]; aLonLat(p:[x,y]): [lng,lat] }`; `areaPlanar(anillo: [x,y][]): number`; `distanciaASegmento(p, a, b): number`; `bboxDe(geom: Poligono): [minLng, minLat, maxLng, maxLat]`; `anillosDe(geom: Poligono): Position[][]` (solo exteriores).

- [ ] **Step 1: Test que falla**

```ts
// lib/prefactibilidad/geo.test.ts
import { describe, it, expect } from "vitest";
import { proyector, areaPlanar, distanciaASegmento, bboxDe, anillosDe } from "./geo";

describe("proyección local: metros alrededor de un origen en CABA", () => {
  it("un grado de latitud son ~110,5 km y uno de longitud ~91,7 km a -34,6°", () => {
    const p = proyector([-58.48, -34.57]);
    const [, y] = p.aMetros([-58.48, -34.56]);
    const [x] = p.aMetros([-58.47, -34.57]);
    expect(y).toBeGreaterThan(1100); expect(y).toBeLessThan(1110);
    expect(x).toBeGreaterThan(910); expect(x).toBeLessThan(925);
  });
  it("ida y vuelta devuelve el mismo punto", () => {
    const p = proyector([-58.48, -34.57]);
    const [lng, lat] = p.aLonLat(p.aMetros([-58.4712, -34.5634]));
    expect(lng).toBeCloseTo(-58.4712, 6); expect(lat).toBeCloseTo(-34.5634, 6);
  });
  it("área planar de un cuadrado de 10 m", () => {
    expect(areaPlanar([[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]])).toBeCloseTo(100, 6);
  });
  it("distancia de un punto a un segmento, dentro y fuera de su sombra", () => {
    expect(distanciaASegmento([5, 3], [0, 0], [10, 0])).toBeCloseTo(3);
    expect(distanciaASegmento([15, 0], [0, 0], [10, 0])).toBeCloseTo(5);
  });
  it("bbox y anillos exteriores de Polygon y MultiPolygon", () => {
    const poly = { type: "Polygon" as const, coordinates: [[[0, 0], [2, 0], [2, 1], [0, 1], [0, 0]]] };
    expect(bboxDe(poly)).toEqual([0, 0, 2, 1]);
    const multi = { type: "MultiPolygon" as const, coordinates: [poly.coordinates, [[[5, 5], [6, 5], [6, 6], [5, 5]]]] };
    expect(anillosDe(multi)).toHaveLength(2);
    expect(bboxDe(multi)).toEqual([0, 0, 6, 6]);
  });
});
```

- [ ] **Step 2: Correr → FAIL** (`npx vitest run lib/prefactibilidad/geo.test.ts`).

- [ ] **Step 3: Implementar**

```ts
// lib/prefactibilidad/geo.ts
// Geometría chica en metros. Turf mide en grados o geodésico; para recortar y medir un lote
// de 30 m alcanza y sobra una proyección equirrectangular local (error < 1 cm a esa escala).
import type { Position } from "geojson";
import type { Poligono } from "./tipos";

const M_POR_GRADO_LAT = 110540;
const M_POR_GRADO_LNG_ECUADOR = 111320;

export function proyector(origen: [number, number]) {
  const [lng0, lat0] = origen;
  const kx = M_POR_GRADO_LNG_ECUADOR * Math.cos((lat0 * Math.PI) / 180);
  return {
    aMetros: ([lng, lat]: Position): [number, number] => [(lng - lng0) * kx, (lat - lat0) * M_POR_GRADO_LAT],
    aLonLat: ([x, y]: [number, number]): [number, number] => [lng0 + x / kx, lat0 + y / M_POR_GRADO_LAT],
  };
}

/** Fórmula del zapato; el anillo puede venir cerrado o no. */
export function areaPlanar(anillo: Position[]): number {
  let s = 0;
  for (let i = 0; i < anillo.length; i++) {
    const [x1, y1] = anillo[i];
    const [x2, y2] = anillo[(i + 1) % anillo.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

export function distanciaASegmento(p: Position, a: Position, b: Position): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

export function anillosDe(geom: Poligono): Position[][] {
  return geom.type === "Polygon" ? [geom.coordinates[0]] : geom.coordinates.map((p) => p[0]);
}

export function bboxDe(geom: Poligono): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const polis = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  for (const poli of polis) for (const anillo of poli) for (const [x, y] of anillo) {
    if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}
```

- [ ] **Step 4: Correr → PASS.**

- [ ] **Step 5: Commit**

```bash
git add lib/prefactibilidad/geo.ts lib/prefactibilidad/geo.test.ts
git commit -m "feat(prefactibilidad): proyección local y medidas en metros"
```

---

### Task 3: Fixtures oficiales y decodificación de teselas

**Files:**
- Create: `scripts/gcba/bajar-fixtures.mjs`
- Create: `lib/prefactibilidad/__fixtures__/` (generado por el script: `.pbf` y `.geojson`)
- Create: `lib/prefactibilidad/teselas.ts`
- Test: `lib/prefactibilidad/teselas.test.ts`

**Interfaces:**
- Produces: `type Tesela = { z: number; x: number; y: number }`; `teselaDe(lng, lat, z): Tesela`; `teselasParaBBox(bbox, z): Tesela[]`; `descomprimir(buf: Uint8Array): Uint8Array`; `decodificar(buf: Uint8Array, t: Tesela): Feature[]` (GeoJSON en lon/lat, `properties` tal cual); `volumenesDe(features: Feature[], smp: string): VolumenOficial[]`; `URL_TESELAS = "https://vectortiles.usig.buenosaires.gob.ar/cur3d"`; `urlTesela(capa, t): string`.
- Las capas: `"volumen_edif" | "lfi" | "lib" | "banda_minima" | "manzana" | "linea_oficial"`.

- [ ] **Step 1: Instalar dependencias**

Run: `npm i @mapbox/vector-tile@3.0.0 pbf@5.1.2`
Expected: `package.json` con ambas; sin errores de peer.

- [ ] **Step 2: Script que baja los fixtures (dato oficial congelado para los tests)**

```js
// scripts/gcba/bajar-fixtures.mjs
// Baja a lib/prefactibilidad/__fixtures__/ lo que necesitan los tests: teselas oficiales de
// Ciudad 3D (zoom 17) y geometrías del catastro para las parcelas de prueba. Se corre UNA vez
// (o cuando el GCBA cambie el dato y haya que renovar la evidencia): los tests no tocan la red.
//   node scripts/gcba/bajar-fixtures.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DESTINO = path.join(RAIZ, "lib", "prefactibilidad", "__fixtures__");
const UA = "PRISMA-prefactibilidad/1.0 (inmobiliaria; contacto: osterrietchleonardo@vakdor.com)";

// smp → [lng, lat] del centroide (catastro epok). Roosevelt 4554 es el caso con número de
// TodoProps (263 m²/planta); Zuviría, manzana atípica; Cabildo, dos unidades (CM y CA).
const PARCELAS = {
  "053-050-006": [-58.4808, -34.5703],
  "056-068-040B": [-58.470035, -34.654211],
  "039-097-008B": [-58.456744, -34.562934],
  "048-026-005": [-58.4636, -34.6421],
  "042-077A-007": [-58.4475, -34.6236],
};
const CAPAS = ["volumen_edif", "lfi", "lib", "banda_minima", "manzana", "linea_oficial"];
const Z = 17;

function tesela(lng, lat) {
  const n = 2 ** Z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const la = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2) * n);
  return { z: Z, x, y };
}

async function bajar(url, archivo) {
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  fs.writeFileSync(archivo, Buffer.from(await r.arrayBuffer()));
  console.log("  ok", path.basename(archivo));
}

fs.mkdirSync(DESTINO, { recursive: true });
for (const [smp, [lng, lat]] of Object.entries(PARCELAS)) {
  const sm = smp.slice(0, smp.lastIndexOf("-")); // la manzana puede tener letra: 042-077A
  const t = tesela(lng, lat);
  console.log(smp, `tesela ${t.z}/${t.x}/${t.y}`);
  for (const capa of CAPAS) {
    await bajar(`https://vectortiles.usig.buenosaires.gob.ar/cur3d/${capa}/${t.z}/${t.x}/${t.y}.pbf`, path.join(DESTINO, `${capa}-${t.z}-${t.x}-${t.y}.pbf`));
  }
  await bajar(`https://epok.buenosaires.gob.ar/catastro/parcela/?smp=${smp}`, path.join(DESTINO, `${smp}.parcela.json`));
  await bajar(`https://epok.buenosaires.gob.ar/catastro/geometria/?smp=${smp}&srid=4326`, path.join(DESTINO, `${smp}.lote.geojson`));
  await bajar(`https://epok.buenosaires.gob.ar/catastro/geometria/?sm=${sm}&srid=4326`, path.join(DESTINO, `${sm}.manzana.geojson`));
}
fs.writeFileSync(path.join(DESTINO, "README.md"), `Dato oficial del GCBA bajado el ${new Date().toISOString().slice(0, 10)} con scripts/gcba/bajar-fixtures.mjs. No editar a mano.\n`);
```

Run: `node scripts/gcba/bajar-fixtures.mjs`
Expected: ~45 archivos en `lib/prefactibilidad/__fixtures__/`; para Roosevelt la tesela es `17/44243/78964`.

- [ ] **Step 3: Test que falla**

```ts
// lib/prefactibilidad/teselas.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { teselaDe, teselasParaBBox, decodificar, volumenesDe, urlTesela } from "./teselas";

const F = (n: string) => readFileSync(path.join(__dirname, "__fixtures__", n));

describe("matemática de teselas (Web Mercator, esquema XYZ)", () => {
  it("Roosevelt 4554 cae en la 17/44243/78964", () => {
    expect(teselaDe(-58.4808, -34.5703, 17)).toEqual({ z: 17, x: 44243, y: 78964 });
  });
  it("un bbox chico dentro de una tesela da una sola; uno que cruza el borde da las vecinas", () => {
    expect(teselasParaBBox([-58.4810, -34.5705, -58.4806, -34.5701], 17)).toHaveLength(1);
    expect(teselasParaBBox([-58.4830, -34.5720, -58.4780, -34.5690], 17).length).toBeGreaterThan(1);
  });
  it("arma la URL oficial", () => {
    expect(urlTesela("volumen_edif", { z: 17, x: 44243, y: 78964 })).toBe("https://vectortiles.usig.buenosaires.gob.ar/cur3d/volumen_edif/17/44243/78964.pbf");
  });
});

describe("decodificar la capa volumen_edif (viene gzip aunque el servidor no lo diga)", () => {
  const feats = decodificar(F("volumen_edif-17-44243-78964.pbf"), { z: 17, x: 44243, y: 78964 });
  it("devuelve features GeoJSON en lon/lat con las propiedades oficiales", () => {
    expect(feats.length).toBeGreaterThan(300);
    const f = feats.find((x) => x.properties?.smp === "053-050-006" && x.properties?.tipo === "cuerpo principal")!;
    expect(f).toBeDefined();
    expect(f.properties!.edificabil).toBe("USAM");
    expect(f.properties!.altura_final).toBe(17.2);
    const [lng, lat] = (f.geometry as any).coordinates[0][0];
    expect(lng).toBeGreaterThan(-58.49); expect(lng).toBeLessThan(-58.47);
    expect(lat).toBeGreaterThan(-34.58); expect(lat).toBeLessThan(-34.56);
  });
  it("volumenesDe filtra por smp y tipa unidad y tipo; ignora lo que no conoce", () => {
    const v = volumenesDe(feats, "053-050-006");
    expect(v.map((x) => x.tipo).sort()).toEqual(["cuerpo principal", "retiro 1", "retiro 2"]);
    expect(v.every((x) => x.unidad === "USAM")).toBe(true);
    expect(v.find((x) => x.tipo === "retiro 2")!.alturaInicial).toBe(20.2);
  });
  it("la parcela de Cabildo trae dos unidades, CM y CA, cada una con basamento", () => {
    const t = teselaDe(-58.456744, -34.562934, 17);
    const fc = decodificar(F(`volumen_edif-17-${t.x}-${t.y}.pbf`), t);
    const v = volumenesDe(fc, "039-097-008B");
    expect(new Set(v.map((x) => x.unidad))).toEqual(new Set(["CM", "CA"]));
    expect(v.filter((x) => x.tipo === "basamento")).toHaveLength(2);
  });
});
```

- [ ] **Step 4: Correr → FAIL** (`Cannot find module './teselas'`).

- [ ] **Step 5: Implementar**

```ts
// lib/prefactibilidad/teselas.ts
// Las capas de Ciudad 3D como teselas vectoriales (MVT). Verificado 17-sep-2026: públicas,
// sin clave, zooms 12 a 19, gzip sin Content-Encoding. El decodificador es el de Mapbox.
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { gunzipSync } from "node:zlib";
import type { Feature } from "geojson";
import { unidadDesdeAltura } from "./codigo";
import type { Poligono, TipoVolumen, Unidad, VolumenOficial } from "./tipos";

export type Capa = "volumen_edif" | "lfi" | "lib" | "banda_minima" | "manzana" | "linea_oficial";
export interface Tesela { z: number; x: number; y: number }

export const URL_TESELAS = "https://vectortiles.usig.buenosaires.gob.ar/cur3d";
export const ZOOM_PARCELA = 17;

export function urlTesela(capa: Capa, t: Tesela): string {
  return `${URL_TESELAS}/${capa}/${t.z}/${t.x}/${t.y}.pbf`;
}

export function teselaDe(lng: number, lat: number, z: number): Tesela {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const la = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2) * n);
  return { z, x, y };
}

/** Todas las teselas que tocan el bbox [minLng, minLat, maxLng, maxLat]. Un lote cruza a lo sumo 4. */
export function teselasParaBBox(b: [number, number, number, number], z: number): Tesela[] {
  const a = teselaDe(b[0], b[3], z); // arriba-izquierda (lat mayor = y menor)
  const c = teselaDe(b[2], b[1], z); // abajo-derecha
  const out: Tesela[] = [];
  for (let x = a.x; x <= c.x; x++) for (let y = a.y; y <= c.y; y++) out.push({ z, x, y });
  return out;
}

export function descomprimir(buf: Uint8Array): Uint8Array {
  return buf[0] === 0x1f && buf[1] === 0x8b ? new Uint8Array(gunzipSync(buf)) : buf;
}

/** MVT → features GeoJSON (lon/lat). Todas las capas del GCBA usan una sola capa interna, "default". */
export function decodificar(buf: Uint8Array, t: Tesela): Feature[] {
  const tile = new VectorTile(new PbfReader(descomprimir(buf)));
  const out: Feature[] = [];
  for (const nombre of Object.keys(tile.layers)) {
    const capa = tile.layers[nombre];
    for (let i = 0; i < capa.length; i++) out.push(capa.feature(i).toGeoJSON(t.x, t.y, t.z) as Feature);
  }
  return out;
}

const TIPOS: TipoVolumen[] = ["cuerpo principal", "retiro 1", "retiro 2", "basamento"];
const UNIDADES_VALIDAS: Unidad[] = ["CA", "CM", "USAA", "USAM", "USAB2", "USAB1", "USAB0"];

/** Los polígonos de volumen_edif de UNA parcela, tipados. Lo que no se reconoce se descarta (y se cuenta aparte en avisos). */
export function volumenesDe(features: Feature[], smp: string): VolumenOficial[] {
  const clave = smp.toUpperCase();
  const out: VolumenOficial[] = [];
  for (const f of features) {
    const p = (f.properties || {}) as Record<string, unknown>;
    if (String(p.smp || "").toUpperCase() !== clave) continue;
    if (f.geometry.type !== "Polygon" && f.geometry.type !== "MultiPolygon") continue;
    const tipo = TIPOS.find((t) => t === p.tipo);
    const unidad = UNIDADES_VALIDAS.find((u) => u === p.edificabil) ?? unidadDesdeAltura(Number(p.altura_final));
    if (!tipo || !unidad) continue;
    out.push({ smp: clave, tipo, unidad, alturaInicial: Number(p.altura_inicial ?? 0), alturaFinal: Number(p.altura_final ?? p.altura_fin ?? 0), geom: f.geometry as Poligono });
  }
  return out;
}
```

- [ ] **Step 6: Correr → PASS.** Si `toGeoJSON` no existe en el tipo, agregar `// @ts-expect-error` NO: revisar que `@mapbox/vector-tile` 3.0.0 exporta `VectorTileFeature.toGeoJSON(x, y, z)` (sí, es API pública) y que `tsconfig` tenga `"moduleResolution": "bundler"` o `"node16"` para leer sus tipos ESM.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json scripts/gcba/bajar-fixtures.mjs lib/prefactibilidad/__fixtures__ lib/prefactibilidad/teselas.ts lib/prefactibilidad/teselas.test.ts
git commit -m "feat(prefactibilidad): leer las teselas oficiales de Ciudad 3D (volumen edificable, LFI, manzanas)"
```

---

### Task 4: La envolvente oficial → plantas y totales

**Files:**
- Create: `lib/prefactibilidad/envolvente.ts`
- Test: `lib/prefactibilidad/envolvente.test.ts`

**Interfaces:**
- Consumes: `VolumenOficial`, `UNIDADES`, `FACTOR_VENDIBLE`, `areaPlanar`, `proyector`, `anillosDe`.
- Produces: `calcularEdificabilidadOficial(volumenes: VolumenOficial[], lote: Poligono): Edificabilidad | null` (null si no hay cuerpo principal); `medirM2(geom: Poligono, origen: [lng,lat]): number`; `recortarAlLote(geom, lote): Poligono | null`; `unirPedazos(geoms: Poligono[]): Poligono | null`.

- [ ] **Step 1: Test que falla (con el dato oficial de los fixtures)**

```ts
// lib/prefactibilidad/envolvente.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { decodificar, teselaDe, volumenesDe } from "./teselas";
import { calcularEdificabilidadOficial, medirM2 } from "./envolvente";
import type { Poligono } from "./tipos";

const fx = (n: string) => path.join(__dirname, "__fixtures__", n);
const lote = (smp: string): Poligono => JSON.parse(readFileSync(fx(`${smp}.lote.geojson`), "utf8")).features[0].geometry;
function volumenes(smp: string, lng: number, lat: number) {
  const t = teselaDe(lng, lat, 17);
  return volumenesDe(decodificar(readFileSync(fx(`volumen_edif-17-${t.x}-${t.y}.pbf`)), t), smp);
}

describe("Roosevelt 4554 (053-050-006, USAM, manzana típica): el número de TodoProps", () => {
  const e = calcularEdificabilidadOficial(volumenes("053-050-006", -58.4808, -34.5703), lote("053-050-006"))!;
  it("cuerpo principal 261 ± 5 m² (TodoProps: 263)", () => {
    const cuerpo = e.plantas.find((p) => p.nombre.startsWith("Planta baja"))!;
    expect(cuerpo.m2PorNivel).toBeGreaterThan(256); expect(cuerpo.m2PorNivel).toBeLessThan(268);
    expect(cuerpo.niveles).toBe(6);
  });
  it("retirados: 244 y 192 m², un nivel cada uno", () => {
    const r1 = e.plantas.find((p) => p.nombre === "Primer retirado")!;
    const r2 = e.plantas.find((p) => p.nombre === "Segundo retirado")!;
    expect(r1.m2PorNivel).toBeCloseTo(244, -1); expect(r2.m2PorNivel).toBeCloseTo(192, -1);
    expect(r1.niveles).toBe(1); expect(r1.desdeM).toBe(17.2); expect(r2.hastaM).toBe(24.2);
  });
  it("totales: 6 × cuerpo + r1 + r2, vendible al 80 %", () => {
    const esperado = e.plantas.reduce((s, p) => s + p.m2PorNivel * p.niveles, 0);
    expect(e.m2Construibles).toBeCloseTo(esperado, 3);
    expect(e.m2Vendibles).toBeCloseTo(esperado * 0.8, 3);
    expect(e.alturaMaxima).toBe(17.2); expect(e.planoLimite).toBe(24.2);
    expect(e.modo).toBe("oficial"); expect(e.unidades).toEqual(["USAM"]);
    expect(e.huella).not.toBeNull();
  });
});

describe("Cabildo 2040 (039-097-008B): dos unidades y basamento", () => {
  const e = calcularEdificabilidadOficial(volumenes("039-097-008B", -58.456744, -34.562934), lote("039-097-008B"))!;
  it("suma CM y CA; el basamento aporta solo lo que excede al cuerpo, en 2 niveles", () => {
    expect(e.unidades.sort()).toEqual(["CA", "CM"]);
    const bas = e.plantas.filter((p) => p.nombre.startsWith("Basamento"));
    expect(bas.length).toBe(2);
    for (const b of bas) { expect(b.niveles).toBe(2); expect(b.m2PorNivel).toBeGreaterThanOrEqual(0); }
    const cuerpoCA = e.plantas.find((p) => p.unidad === "CA" && p.nombre.includes("sobre el basamento"))!;
    expect(cuerpoCA.niveles).toBe(11); // 13 menos los 2 del basamento
    expect(e.alturaMaxima).toBe(38); expect(e.planoLimite).toBe(45);
  });
  it("la huella nunca supera el lote", () => {
    const l = lote("039-097-008B");
    const c = (l.type === "Polygon" ? l.coordinates[0][0] : l.coordinates[0][0][0]) as [number, number];
    expect(medirM2(e.huella!, c)).toBeLessThanOrEqual(medirM2(l, c) + 1);
  });
});

describe("sin cuerpo principal no hay edificabilidad oficial", () => {
  it("devuelve null", () => {
    expect(calcularEdificabilidadOficial([], lote("053-050-006"))).toBeNull();
  });
});
```

- [ ] **Step 2: Correr → FAIL.**

- [ ] **Step 3: Implementar**

```ts
// lib/prefactibilidad/envolvente.ts
// De los polígonos oficiales de volumen_edif a "cuánto se puede construir". Reglas:
//  - Un mismo polígono puede venir partido entre teselas: se une por (unidad, tipo).
//  - Se recorta al contorno del lote (las teselas traen un margen de dibujo).
//  - Niveles: cuerpo = pisosCuerpo de la unidad; retirado 1 y 2 = 1 nivel; basamento (CA/CM)
//    = 2 niveles (PB y 1º) pero solo aporta lo que EXCEDE al cuerpo, y el cuerpo pierde esos 2.
import { area, featureCollection, intersect, union } from "@turf/turf";
import type { Feature } from "geojson";
import { FACTOR_VENDIBLE, UNIDADES } from "./codigo";
import { anillosDe, areaPlanar, proyector } from "./geo";
import type { Edificabilidad, Planta, Poligono, Unidad, VolumenOficial } from "./tipos";

const f = (g: Poligono): Feature<Poligono> => ({ type: "Feature", properties: {}, geometry: g });

export function unirPedazos(geoms: Poligono[]): Poligono | null {
  if (geoms.length === 0) return null;
  if (geoms.length === 1) return geoms[0];
  const u = union(featureCollection(geoms.map(f)));
  return (u?.geometry as Poligono) ?? null;
}

export function recortarAlLote(geom: Poligono, lote: Poligono): Poligono | null {
  const r = intersect(featureCollection([f(geom), f(lote)]));
  return (r?.geometry as Poligono) ?? null;
}

/** m² planos alrededor de un origen; para un lote da lo mismo que turf.area con menos ruido. */
export function medirM2(geom: Poligono, origen: [number, number]): number {
  const p = proyector(origen);
  return anillosDe(geom).reduce((s, an) => s + areaPlanar(an.map((c) => p.aMetros(c))), 0);
}

function nombreCuerpo(niveles: number): string {
  return niveles <= 1 ? "Planta baja" : `Planta baja y ${niveles - 1} ${niveles - 1 === 1 ? "piso" : "pisos"}`;
}

export function calcularEdificabilidadOficial(volumenes: VolumenOficial[], lote: Poligono): Edificabilidad | null {
  if (!volumenes.some((v) => v.tipo === "cuerpo principal")) return null;
  const origen = anillosDe(lote)[0][0] as [number, number];
  const unidades = Array.from(new Set(volumenes.map((v) => v.unidad))) as Unidad[];
  const plantas: Planta[] = [];
  const huellas: Poligono[] = [];
  let alturaMaxima = 0, planoLimite = 0;

  for (const unidad of unidades) {
    const def = UNIDADES[unidad];
    const de = (tipo: VolumenOficial["tipo"]) => {
      const vs = volumenes.filter((v) => v.unidad === unidad && v.tipo === tipo);
      if (vs.length === 0) return null;
      const unido = unirPedazos(vs.map((v) => v.geom));
      const rec = unido ? recortarAlLote(unido, lote) : null;
      return { m2: rec ? medirM2(rec, origen) : 0, geom: rec, desde: Math.min(...vs.map((v) => v.alturaInicial)), hasta: Math.max(...vs.map((v) => v.alturaFinal)) };
    };
    const cuerpo = de("cuerpo principal");
    if (!cuerpo) continue;
    const bas = def.basamento ? de("basamento") : null;
    const nivelesCuerpo = bas ? def.pisosCuerpo - 2 : def.pisosCuerpo;
    if (bas) plantas.push({ nombre: "Basamento (PB y 1º piso)", unidad, m2PorNivel: Math.max(0, bas.m2), niveles: 2, desdeM: bas.desde, hastaM: bas.hasta });
    plantas.push({ nombre: bas ? `${nivelesCuerpo} pisos sobre el basamento` : nombreCuerpo(nivelesCuerpo), unidad, m2PorNivel: cuerpo.m2, niveles: nivelesCuerpo, desdeM: cuerpo.desde, hastaM: cuerpo.hasta });
    const r1 = de("retiro 1"), r2 = de("retiro 2");
    if (r1) plantas.push({ nombre: "Primer retirado", unidad, m2PorNivel: r1.m2, niveles: 1, desdeM: r1.desde, hastaM: r1.hasta });
    if (r2) plantas.push({ nombre: "Segundo retirado", unidad, m2PorNivel: r2.m2, niveles: 1, desdeM: r2.desde, hastaM: r2.hasta });
    if (cuerpo.geom) huellas.push(cuerpo.geom);
    alturaMaxima = Math.max(alturaMaxima, cuerpo.hasta);
    planoLimite = Math.max(planoLimite, r2?.hasta ?? r1?.hasta ?? cuerpo.hasta);
  }
  if (plantas.length === 0) return null;
  const m2Construibles = plantas.reduce((s, p) => s + p.m2PorNivel * p.niveles, 0);
  return {
    modo: "oficial", unidades, alturaMaxima, planoLimite, plantas,
    m2Construibles, m2Vendibles: m2Construibles * FACTOR_VENDIBLE,
    huella: unirPedazos(huellas),
  };
}
```

Nota: en el caso con basamento, el `m2PorNivel` del basamento es la huella COMPLETA del basamento y el cuerpo pierde 2 niveles: así PB y 1º se cuentan una sola vez, con la huella grande. Es lo que dice el comentario de arriba; el test de "aporta solo lo que excede" se cumple porque los 2 niveles del cuerpo no se cuentan.

- [ ] **Step 4: Correr → PASS.** Si el área difiere de 263 en más de 5 m², revisar que el recorte al lote esté usando la geometría de epok (no la de la tesela) y que la tesela sea la de zoom 17.

- [ ] **Step 5: Commit**

```bash
git add lib/prefactibilidad/envolvente.ts lib/prefactibilidad/envolvente.test.ts
git commit -m "feat(prefactibilidad): de la envolvente oficial a plantas, m² construibles y vendibles"
```

---

### Task 5: La regla del cuarto (control y respaldo)

**Files:**
- Create: `lib/prefactibilidad/lfi-regla.ts`
- Test: `lib/prefactibilidad/lfi-regla.test.ts`

**Interfaces:**
- Consumes: `proyector`, `areaPlanar`, `distanciaASegmento`, `anillosDe` (Task 2); `UNIDADES`, `BANDA_MINIMA_M`, `FACTOR_VENDIBLE` (Task 1); `medirM2`, `recortarAlLote`, `unirPedazos` (Task 4).
- Produces: `analizarManzana(manzana: Poligono): { tipica: boolean; lados: number; semisumas: [number, number] | null; areaM2: number; motivo?: string }`; `bandaEdificable(manzana: Poligono): Poligono | null`; `huellaPorRegla(lote, manzana, unidad): { huella: Poligono | null; m2: number; alcanzadoPorLfi: boolean }`; `edificabilidadPorRegla(lote, manzana, unidad): Edificabilidad` (modo `"regla"`, con `rango`).

- [ ] **Step 1: Test que falla**

```ts
// lib/prefactibilidad/lfi-regla.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { analizarManzana, huellaPorRegla, edificabilidadPorRegla } from "./lfi-regla";
import type { Poligono } from "./tipos";

// Manzana sintética de 100 × 100 m con esquina en (-58.48, -34.57). El lote va al MEDIO del lado (x=40):
// a 20 m de la esquina entra también en la banda del lado oeste y la huella crece (es la regla, no un bug). 1 m ≈ 1/91700° en lng y 1/110540° en lat.
const DX = 1 / 91700, DY = 1 / 110540;
const O: [number, number] = [-58.48, -34.57];
const rect = (x0: number, y0: number, w: number, h: number): Poligono => ({
  type: "Polygon",
  coordinates: [[[O[0] + x0 * DX, O[1] + y0 * DY], [O[0] + (x0 + w) * DX, O[1] + y0 * DY], [O[0] + (x0 + w) * DX, O[1] + (y0 + h) * DY], [O[0] + x0 * DX, O[1] + (y0 + h) * DY], [O[0] + x0 * DX, O[1] + y0 * DY]]],
});
const MANZANA = rect(0, 0, 100, 100);

describe("manzana típica según art. 6.4.2.1", () => {
  it("100 × 100: cuatro lados, semisumas ≥ 62, área ≥ 4.000 → típica", () => {
    const m = analizarManzana(MANZANA);
    expect(m.tipica).toBe(true); expect(m.lados).toBe(4); expect(m.areaM2).toBeCloseTo(10000, -2);
  });
  it("50 × 50 no es típica (semisuma < 62 y área < 4.000)", () => {
    expect(analizarManzana(rect(0, 0, 50, 50)).tipica).toBe(false);
  });
  it("cinco lados no es típica", () => {
    const penta: Poligono = { type: "Polygon", coordinates: [[[O[0], O[1]], [O[0] + 100 * DX, O[1]], [O[0] + 100 * DX, O[1] + 100 * DY], [O[0] + 50 * DX, O[1] + 130 * DY], [O[0], O[1] + 100 * DY], [O[0], O[1]]]] };
    expect(analizarManzana(penta).tipica).toBe(false);
  });
});

describe("la línea de frente interno a ¼ (art. 6.4.2)", () => {
  it("lote de 8,66 × 30 sobre el lado sur: la huella es 8,66 × 25 = 216,5 m²", () => {
    const h = huellaPorRegla(rect(40, 0, 8.66, 30), MANZANA, "USAM");
    expect(h.alcanzadoPorLfi).toBe(true);
    expect(h.m2).toBeGreaterThan(214); expect(h.m2).toBeLessThan(219);
  });
  it("lote de 20 m de fondo en USAM: la L.F.I. no lo alcanza → retiro de fondo de 6 m (art. 6.4.2.4) → 8,66 × 14", () => {
    const h = huellaPorRegla(rect(40, 0, 8.66, 20), MANZANA, "USAM");
    expect(h.alcanzadoPorLfi).toBe(false);
    expect(h.m2).toBeCloseTo(8.66 * 14, 0);
  });
  it("edificabilidad por regla: modo regla, 6 niveles, rango con piso de 16 m", () => {
    const e = edificabilidadPorRegla(rect(40, 0, 8.66, 30), MANZANA, "USAM");
    expect(e.modo).toBe("regla");
    expect(e.plantas[0].niveles).toBe(6);
    expect(e.rango!.piso).toBeCloseTo(8.66 * 16 * 6, -1);
    expect(e.rango!.techo).toBeGreaterThan(e.rango!.piso);
    expect(e.m2Vendibles).toBeCloseTo(e.m2Construibles * 0.8, 3);
  });
});

describe("contra la capa oficial: Roosevelt 4554 (manzana 053-050)", () => {
  it("la regla da 242 ± 6 m² (la oficial da 261 por las extensiones del espacio libre; es un control, no la fuente)", () => {
    const fx = (n: string) => JSON.parse(readFileSync(path.join(__dirname, "__fixtures__", n), "utf8")).features[0].geometry as Poligono;
    const h = huellaPorRegla(fx("053-050-006.lote.geojson"), fx("053-050.manzana.geojson"), "USAM");
    expect(h.m2).toBeGreaterThan(236); expect(h.m2).toBeLessThan(248);
  });
});
```

- [ ] **Step 2: Correr → FAIL** (`npx vitest run lib/prefactibilidad/lfi-regla.test.ts`).

- [ ] **Step 3: Implementar**

```ts
// lib/prefactibilidad/lfi-regla.ts
// La regla del TEXTO del Código, para controlar la capa oficial y como respaldo cuando una
// parcela no tiene envolvente en las teselas. Art. 6.4.2: la L.F.I. es paralela a cada línea
// oficial a ¼ de la distancia entre los puntos medios de las L.O. opuestas. Art. 6.4.2.1: si la
// manzana no es cuadrangular, la semisuma de lados opuestos es < 62 m o el área < 4.000 m², la
// fija el organismo (acá: "no típica" → rango).
import { simplify } from "@turf/turf";
import type { Feature, Position } from "geojson";
import { BANDA_MINIMA_M, FACTOR_VENDIBLE, UNIDADES } from "./codigo";
import { anillosDe, areaPlanar, distanciaASegmento, proyector } from "./geo";
import { medirM2, recortarAlLote, unirPedazos } from "./envolvente";
import type { Edificabilidad, Poligono, Unidad } from "./tipos";

const SEMISUMA_MIN_M = 62;
const AREA_MIN_M2 = 4000;
/** Un lado más corto que esto es una ochava, no un lado (las ochavas del Código miden ~4 m). */
const LADO_MIN_M = 12;
/** Cuánto se prolonga cada franja para cubrir la esquina. */
const PROLONGACION_M = 200;
const f = (g: Poligono): Feature<Poligono> => ({ type: "Feature", properties: {}, geometry: g });
type P = [number, number];

function interseccion(a: Position, b: Position, c: Position, d: Position): P | null {
  const den = (a[0] - b[0]) * (c[1] - d[1]) - (a[1] - b[1]) * (c[0] - d[0]);
  if (Math.abs(den) < 1e-9) return null;
  const t = ((a[0] - c[0]) * (c[1] - d[1]) - (a[1] - c[1]) * (c[0] - d[0])) / den;
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}

/** Vértices del anillo exterior en metros, sin el cierre y sin ochavas (el lado corto se reemplaza por el cruce de sus vecinos). */
function ladosEnMetros(manzana: Poligono): { pts: P[]; origen: P } {
  const anillo = anillosDe(simplify(f(manzana), { tolerance: 0.000005, highQuality: true }).geometry as Poligono)[0];
  const origen = anillo[0] as P;
  const p = proyector(origen);
  let pts: P[] = anillo.slice(0, -1).map((c) => p.aMetros(c));
  for (let vuelta = 0; vuelta < 8 && pts.length > 4; vuelta++) {
    const n = pts.length;
    const i = pts.findIndex((q, k) => Math.hypot(pts[(k + 1) % n][0] - q[0], pts[(k + 1) % n][1] - q[1]) < LADO_MIN_M);
    if (i < 0) break;
    const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n], d = pts[(i + 2) % n];
    const x = interseccion(a, b, c, d) ?? b;
    const nuevos: P[] = [];
    for (let k = 0; k < n; k++) { if (k === i) nuevos.push(x); else if (k !== (i + 1) % n) nuevos.push(pts[k]); }
    pts = nuevos;
  }
  return { pts, origen };
}

const lado = (pts: P[], k: number) => Math.hypot(pts[(k + 1) % pts.length][0] - pts[k][0], pts[(k + 1) % pts.length][1] - pts[k][1]);
const centroDe = (pts: P[]): P => [pts.reduce((s, q) => s + q[0], 0) / pts.length, pts.reduce((s, q) => s + q[1], 0) / pts.length];

export function analizarManzana(manzana: Poligono) {
  const { pts } = ladosEnMetros(manzana);
  const areaM2 = areaPlanar(pts);
  const lados = pts.length;
  if (lados !== 4) return { tipica: false, lados, semisumas: null, areaM2, motivo: `manzana de ${lados} lados` };
  const L = [0, 1, 2, 3].map((k) => lado(pts, k));
  const semisumas: [number, number] = [(L[0] + L[2]) / 2, (L[1] + L[3]) / 2];
  if (semisumas[0] < SEMISUMA_MIN_M || semisumas[1] < SEMISUMA_MIN_M) return { tipica: false, lados, semisumas, areaM2, motivo: "semisuma de lados opuestos menor a 62 m" };
  if (areaM2 < AREA_MIN_M2) return { tipica: false, lados, semisumas, areaM2, motivo: "superficie menor a 4.000 m²" };
  return { tipica: true, lados, semisumas, areaM2 };
}

/** Franja de ancho d hacia adentro del lado a→b, prolongada para cubrir la esquina. */
function franja(a: P, b: P, d: number, interior: P): P[] {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
  const ux = dx / L, uy = dy / L;
  let nx = -uy, ny = ux;
  if ((interior[0] - a[0]) * nx + (interior[1] - a[1]) * ny < 0) { nx = -nx; ny = -ny; }
  const a2: P = [a[0] - ux * PROLONGACION_M, a[1] - uy * PROLONGACION_M];
  const b2: P = [b[0] + ux * PROLONGACION_M, b[1] + uy * PROLONGACION_M];
  return [a2, b2, [b2[0] + nx * d, b2[1] + ny * d], [a2[0] + nx * d, a2[1] + ny * d], a2];
}

function franjaLonLat(manzana: Poligono, a: P, b: P, d: number): Poligono {
  const { pts, origen } = ladosEnMetros(manzana);
  const p = proyector(origen);
  return { type: "Polygon", coordinates: [franja(a, b, d, centroDe(pts)).map((c) => p.aLonLat(c))] };
}

/** Banda edificable = manzana ∩ ∪ franjas de ¼. null si la manzana no es típica. */
export function bandaEdificable(manzana: Poligono): Poligono | null {
  if (!analizarManzana(manzana).tipica) return null;
  const { pts } = ladosEnMetros(manzana);
  const mid = pts.map((q, k) => [(q[0] + pts[(k + 1) % 4][0]) / 2, (q[1] + pts[(k + 1) % 4][1]) / 2] as P);
  const d02 = Math.hypot(mid[0][0] - mid[2][0], mid[0][1] - mid[2][1]) / 4;
  const d13 = Math.hypot(mid[1][0] - mid[3][0], mid[1][1] - mid[3][1]) / 4;
  const franjas = pts.map((q, k) => franjaLonLat(manzana, q, pts[(k + 1) % 4], k % 2 === 0 ? d02 : d13));
  const u = unirPedazos(franjas);
  return u ? recortarAlLote(u, manzana) : null;
}

/** El lado de la manzana que toca el lote (la línea oficial del frente) y la profundidad del lote desde él. */
function frenteYFondo(lote: Poligono, manzana: Poligono): { a: P; b: P; fondo: number } {
  const { pts, origen } = ladosEnMetros(manzana);
  const pm = proyector(origen);
  const lm = anillosDe(lote)[0].map((c) => pm.aMetros(c));
  const cand = pts.map((q, k) => ({ a: q, b: pts[(k + 1) % pts.length], d: Math.min(...lm.map((v) => distanciaASegmento(v, q, pts[(k + 1) % pts.length]))) }));
  const frente = cand.sort((u, v) => u.d - v.d)[0];
  return { a: frente.a, b: frente.b, fondo: Math.max(...lm.map((v) => distanciaASegmento(v, frente.a, frente.b))) };
}

export function huellaPorRegla(lote: Poligono, manzana: Poligono, unidad: Unidad) {
  const banda = bandaEdificable(manzana);
  const origen = anillosDe(lote)[0][0] as P;
  if (!banda) return { huella: null, m2: 0, alcanzadoPorLfi: false };
  const m2Lote = medirM2(lote, origen);
  const dentro = recortarAlLote(lote, banda);
  const m2Dentro = dentro ? medirM2(dentro, origen) : 0;
  if (m2Dentro < m2Lote - 1) return { huella: dentro, m2: m2Dentro, alcanzadoPorLfi: true };
  // El lote entra entero en la banda: la L.F.I. no lo alcanza → retiro mínimo de fondo (6.4.2.4).
  const { a, b, fondo } = frenteYFondo(lote, manzana);
  const fr = franjaLonLat(manzana, a, b, Math.max(0, fondo - UNIDADES[unidad].retiroFondoMin));
  const h = recortarAlLote(lote, fr);
  return { huella: h, m2: h ? medirM2(h, origen) : 0, alcanzadoPorLfi: false };
}

/** Proporción de los retirados respecto del cuerpo, medida sobre la envolvente oficial de Roosevelt 4554 (244/261 y 192/261). Solo para el techo del rango. */
const RETIRADO_1_PROP = 0.9;
const RETIRADO_2_PROP = 0.7;

export function edificabilidadPorRegla(lote: Poligono, manzana: Poligono, unidad: Unidad): Edificabilidad {
  const def = UNIDADES[unidad];
  const origen = anillosDe(lote)[0][0] as P;
  const h = huellaPorRegla(lote, manzana, unidad);
  const { a, b } = frenteYFondo(lote, manzana);
  const h16 = recortarAlLote(lote, franjaLonLat(manzana, a, b, BANDA_MINIMA_M));
  const piso = (h16 ? medirM2(h16, origen) : 0) * def.pisosCuerpo;
  const m2Cuerpo = h.m2 > 0 ? h.m2 : piso / def.pisosCuerpo;
  const techo = m2Cuerpo * def.pisosCuerpo + (def.retirados ? m2Cuerpo * (RETIRADO_1_PROP + RETIRADO_2_PROP) : 0);
  return {
    modo: "regla", unidades: [unidad], alturaMaxima: def.alturaMaxima, planoLimite: def.planoLimite,
    plantas: [{ nombre: `Planta baja y ${def.pisosCuerpo - 1} pisos`, unidad, m2PorNivel: m2Cuerpo, niveles: def.pisosCuerpo, desdeM: 0, hastaM: def.alturaMaxima }],
    m2Construibles: techo, m2Vendibles: techo * FACTOR_VENDIBLE, huella: h.huella, rango: { piso, techo },
  };
}
```

- [ ] **Step 4: Correr → PASS.** El test contra la capa oficial DOCUMENTA la diferencia (242 vs 261): si algún día coinciden, el test avisa y se revisa la adenda de la spec.

- [ ] **Step 5: Commit**

```bash
git add lib/prefactibilidad/lfi-regla.ts lib/prefactibilidad/lfi-regla.test.ts
git commit -m "feat(prefactibilidad): regla del cuarto (art. 6.4.2) como control y respaldo de la capa oficial"
```

---

### Task 6: Avisos (las banderas que exigen la leyenda)

**Files:**
- Create: `lib/prefactibilidad/avisos.ts`
- Test: `lib/prefactibilidad/avisos.test.ts`

**Interfaces:**
- Consumes: `FilaCur`, `CatastroParcela`, `Edificabilidad`, `Aviso` (Task 1); `UNIDADES`, `unidadDesdeAltura` (Task 1).
- Produces: `armarAvisos(args: { cur: FilaCur | null; lote: CatastroParcela; manzanaTipo: "TIPICA" | "ATIPICA" | null; esEsquina: boolean; edificabilidad: Edificabilidad | null }): Aviso[]`; `requiereEstudio(avisos: Aviso[]): boolean`.

- [ ] **Step 1: Test que falla**

```ts
// lib/prefactibilidad/avisos.test.ts
import { describe, it, expect } from "vitest";
import { armarAvisos, requiereEstudio } from "./avisos";
import type { CatastroParcela, Edificabilidad, FilaCur } from "./tipos";

const lote: CatastroParcela = { smp: "053-050-006", direccion: "ROOSEVELT 4554", superficieTotal: 375, superficieCubierta: 212, frente: 8.66, fondo: 43.3, propiedadHorizontal: false, pisosSobreRasante: 1, unidadesFuncionales: 0, centroide: [-58.48, -34.57] };
const cur: FilaCur = { smp: "053-050-006", uniEdif: [17.2], planoL: 24.2, tipoMza: "TIPICA", catalogado: 0, distGrp: null, distEsp: null, distCpu: "R2b I", barrio: "VILLA URQUIZA", comuna: "12", publicado: "2026-06-24" };
const edif = { modo: "oficial", unidades: ["USAM"], alturaMaxima: 17.2, planoLimite: 24.2, plantas: [], m2Construibles: 1, m2Vendibles: 0.8, huella: null } as Edificabilidad;

describe("avisos de la prefactibilidad", () => {
  it("lote común: ningún aviso", () => {
    expect(armarAvisos({ cur, lote, manzanaTipo: "TIPICA", esEsquina: false, edificabilidad: edif })).toEqual([]);
  });
  it("esquina y manzana atípica: avisos fuertes", () => {
    const a = armarAvisos({ cur, lote, manzanaTipo: "ATIPICA", esEsquina: true, edificabilidad: edif });
    expect(a.map((x) => x.clave).sort()).toEqual(["atipica", "esquina"]);
    expect(requiereEstudio(a)).toBe(true);
  });
  it("área especial, catalogado y dos alturas", () => {
    const a = armarAvisos({ cur: { ...cur, distGrp: "APH", distEsp: "APH 45", catalogado: 1, uniEdif: [38, 31.2] }, lote, manzanaTipo: "TIPICA", esEsquina: false, edificabilidad: edif });
    expect(a.map((x) => x.clave).sort()).toEqual(["area_especial", "catalogado", "dos_alturas"]);
    expect(a.find((x) => x.clave === "area_especial")!.texto).toContain("APH 45");
  });
  it("PH con muchas unidades: aviso suave; plano límite del CSV distinto al de la unidad: fuerte", () => {
    const a = armarAvisos({ cur: { ...cur, planoL: 29.8 }, lote: { ...lote, propiedadHorizontal: true, unidadesFuncionales: 240, pisosSobreRasante: 16 }, manzanaTipo: "TIPICA", esEsquina: false, edificabilidad: edif });
    expect(a.find((x) => x.clave === "ph_consolidado")!.fuerte).toBe(false);
    expect(a.find((x) => x.clave === "plano_limite_raro")!.fuerte).toBe(true);
  });
  it("sin envolvente oficial y sin dato de código", () => {
    const a = armarAvisos({ cur: null, lote, manzanaTipo: null, esEsquina: false, edificabilidad: null });
    expect(a.map((x) => x.clave).sort()).toEqual(["sin_dato_codigo", "sin_envolvente"]);
  });
});
```

- [ ] **Step 2: Correr → FAIL.**

- [ ] **Step 3: Implementar**

```ts
// lib/prefactibilidad/avisos.ts
// Qué hay que decir además del número. "fuerte" = la leyenda "requiere estudio profesional"
// va ARRIBA del bloque (spec, "Modo rango" y adenda 17-sep).
import { UNIDADES, unidadDesdeAltura } from "./codigo";
import type { Aviso, CatastroParcela, Edificabilidad, FilaCur } from "./tipos";

const GRUPOS_ESPECIALES = ["AE", "U", "APH", "RUA", "UP", "Espacio Publico", "Area de Renovacion", "EE", "UF"];

export function armarAvisos(args: { cur: FilaCur | null; lote: CatastroParcela; manzanaTipo: "TIPICA" | "ATIPICA" | null; esEsquina: boolean; edificabilidad: Edificabilidad | null }): Aviso[] {
  const { cur, lote, manzanaTipo, esEsquina, edificabilidad } = args;
  const out: Aviso[] = [];
  if (esEsquina) out.push({ clave: "esquina", fuerte: true, texto: "Es un lote en esquina: la línea oficial de esquina y las alturas de las dos calles cambian la envolvente. Requiere estudio profesional." });
  if (manzanaTipo === "ATIPICA" || cur?.tipoMza === "ATIPICA") out.push({ clave: "atipica", fuerte: true, texto: "La manzana es atípica: la línea de frente interno la fija el organismo caso por caso. El dato oficial es orientativo." });
  if (cur?.distGrp && GRUPOS_ESPECIALES.some((g) => cur.distGrp!.startsWith(g))) out.push({ clave: "area_especial", fuerte: true, texto: `La parcela está en ${cur.distEsp || cur.distGrp} (normas propias del Anexo II del Código). Requiere estudio profesional.` });
  if (cur && cur.catalogado !== 0) out.push({ clave: "catalogado", fuerte: true, texto: "Inmueble con protección patrimonial (catalogado). Lo que se puede hacer lo define la Dirección de Interpretación Urbanística." });
  if (cur && cur.uniEdif.length >= 2) out.push({ clave: "dos_alturas", fuerte: true, texto: `La parcela tiene dos alturas distintas (${cur.uniEdif.join(" y ")} m): frente a dos calles o lindera a esquina.` });
  if (lote.propiedadHorizontal && (lote.unidadesFuncionales ?? 0) >= 3) out.push({ clave: "ph_consolidado", fuerte: false, texto: `Hoy hay un edificio consolidado en propiedad horizontal (${lote.unidadesFuncionales} unidades, ${lote.pisosSobreRasante ?? "?"} pisos). El cálculo es sobre el lote vacío.` });
  if (cur && cur.planoL && cur.uniEdif[0]) {
    const u = unidadDesdeAltura(cur.uniEdif[0]);
    if (u && Math.abs(UNIDADES[u].planoLimite - cur.planoL) > 0.05) out.push({ clave: "plano_limite_raro", fuerte: true, texto: `El plano límite oficial de la parcela (${cur.planoL} m) no es el de su unidad (${UNIDADES[u].planoLimite} m): puede haber completamiento de tejido u otra condición particular.` });
  }
  if (!edificabilidad) out.push({ clave: "sin_envolvente", fuerte: true, texto: "La capa oficial de Ciudad 3D no tiene envolvente para esta parcela: se muestra el rango por la regla del Código." });
  if (!cur) out.push({ clave: "sin_dato_codigo", fuerte: true, texto: "El Código Urbanístico por parcela del GCBA no tiene dato para esta parcela." });
  return out;
}

export function requiereEstudio(avisos: Aviso[]): boolean {
  return avisos.some((a) => a.fuerte);
}
```

- [ ] **Step 4: Correr → PASS.**

- [ ] **Step 5: Commit**

```bash
git add lib/prefactibilidad/avisos.ts lib/prefactibilidad/avisos.test.ts
git commit -m "feat(prefactibilidad): avisos que exigen la leyenda de estudio profesional"
```

---

### Task 7: Valor de la tierra (estadística)

**Files:**
- Create: `lib/prefactibilidad/tierra.ts`
- Test: `lib/prefactibilidad/tierra.test.ts`

**Interfaces:**
- Consumes: `TerrenoCerca`, `ValorTierra` (Task 1).
- Produces: `MIN_COMPARABLES = 5`, `RADIO_M = 800`, `valorTierra(terrenos: TerrenoCerca[], superficieLoteM2: number): ValorTierra | null`, `mediana(xs)`, `percentil(xs, p)`.

- [ ] **Step 1: Test que falla**

```ts
// lib/prefactibilidad/tierra.test.ts
import { describe, it, expect } from "vitest";
import { valorTierra, mediana, percentil, MIN_COMPARABLES } from "./tierra";
import type { TerrenoCerca } from "./tipos";

let n = 0;
const t = (precioUsd: number, superficieM2: number, distanciaM = 300): TerrenoCerca => ({ id: ++n, titulo: null, direccion: null, barrio: null, precioUsd, superficieM2, distanciaM, url: "u", foto: null });

describe("estadística del valor de la tierra", () => {
  it("mediana y percentiles con interpolación lineal", () => {
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([1, 2, 3, 4])).toBe(2.5);
    expect(percentil([1, 2, 3, 4, 5], 0.25)).toBe(2);
    expect(percentil([1, 2, 3, 4, 5], 0.75)).toBe(4);
  });
  it("con menos de 5 comparables no hay valor", () => {
    expect(valorTierra([t(100000, 200), t(120000, 200), t(90000, 200), t(110000, 200)], 300)).toBeNull();
    expect(MIN_COMPARABLES).toBe(5);
  });
  it("5 terrenos alrededor de USD 500/m² → mediana 500, cuartiles 450/550, valor del lote por su superficie", () => {
    const v = valorTierra([t(100000, 200), t(110000, 200), t(90000, 200), t(120000, 200), t(80000, 200)], 300)!;
    expect(v.usdM2Mediana).toBe(500);
    expect(v.usdM2P25).toBe(450); expect(v.usdM2P75).toBe(550);
    expect(v.valorLote).toEqual({ desde: 135000, mediana: 150000, hasta: 165000 });
    expect(v.comparables).toHaveLength(5);
  });
  it("descarta precio o superficie inválidos y ordena por distancia", () => {
    const v = valorTierra([t(0, 200), t(100000, 0), t(100000, 200, 700), t(100000, 200, 100), t(100000, 200, 300), t(100000, 200, 500), t(100000, 200, 200)], 100)!;
    expect(v.comparables.map((c) => c.distanciaM)).toEqual([100, 200, 300, 500, 700]);
  });
});
```

- [ ] **Step 2: Correr → FAIL.**

- [ ] **Step 3: Implementar**

```ts
// lib/prefactibilidad/tierra.ts
// Cuánto vale la tierra: terrenos en venta de mercado_avisos a menos de 800 m (spec, paso 5).
// Mediana y rango intercuartil de USD/m² de lote, por la superficie del lote. Con menos de 5
// comparables no se muestra número: "sin comparables suficientes" (mismo umbral que la mediana
// de la lista del ACM en comparables-result.tsx).
import type { TerrenoCerca, ValorTierra } from "./tipos";

export const MIN_COMPARABLES = 5;
export const RADIO_M = 800;

export function percentil(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  if (s.length === 0) return NaN;
  const k = (s.length - 1) * p, lo = Math.floor(k), hi = Math.ceil(k);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (k - lo);
}
export const mediana = (xs: number[]) => percentil(xs, 0.5);

export function valorTierra(terrenos: TerrenoCerca[], superficieLoteM2: number): ValorTierra | null {
  const validos = terrenos.filter((t) => t.precioUsd > 0 && t.superficieM2 > 0).sort((a, b) => a.distanciaM - b.distanciaM);
  if (validos.length < MIN_COMPARABLES || !(superficieLoteM2 > 0)) return null;
  const usdM2 = validos.map((t) => t.precioUsd / t.superficieM2);
  const med = mediana(usdM2), p25 = percentil(usdM2, 0.25), p75 = percentil(usdM2, 0.75);
  const r = Math.round;
  return {
    comparables: validos,
    usdM2Mediana: r(med), usdM2P25: r(p25), usdM2P75: r(p75),
    valorLote: { desde: r(p25 * superficieLoteM2), mediana: r(med * superficieLoteM2), hasta: r(p75 * superficieLoteM2) },
  };
}
```

- [ ] **Step 4: Correr → PASS.**

- [ ] **Step 5: Commit**

```bash
git add lib/prefactibilidad/tierra.ts lib/prefactibilidad/tierra.test.ts
git commit -m "feat(prefactibilidad): valor de la tierra con mediana y rango intercuartil de terrenos cercanos"
```

---

### Task 8: Nombres de calle y puertas

**Files:**
- Create: `lib/prefactibilidad/normalizar-calle.ts`
- Test: `lib/prefactibilidad/normalizar-calle.test.ts`

**Interfaces:**
- Produces: `calleClave(nombre: string): string`; `abrirPuertas(numDom: string): number[]`; `FilaFrentes`, `PuertaRow`, `filaPuertas(fila: FilaFrentes): PuertaRow[]`.

- [ ] **Step 1: Test que falla**

```ts
// lib/prefactibilidad/normalizar-calle.test.ts
import { describe, it, expect } from "vitest";
import { calleClave, abrirPuertas, filaPuertas } from "./normalizar-calle";

describe("USIG y el catastro escriben las calles distinto", () => {
  it("«CABILDO AV.» (USIG) y «AV. CABILDO» (frentes) dan la misma clave", () => {
    expect(calleClave("CABILDO AV.")).toBe(calleClave("AV. CABILDO"));
    expect(calleClave("CABILDO AV.")).toBe("CABILDO AV");
  });
  it("saca tildes, puntos y dobles espacios", () => {
    expect(calleClave("Gral. Mariano  Acha")).toBe("MARIANO ACHA GRAL");
    expect(calleClave("ROOSEVELT FRANKLIN D.")).toBe("ROOSEVELT FRANKLIN D");
    expect(calleClave("Zuviría")).toBe("ZUVIRIA");
  });
  it("abre las puertas separadas por punto; vacío y basura dan []", () => {
    expect(abrirPuertas("3939.3943.3945.3947")).toEqual([3939, 3943, 3945, 3947]);
    expect(abrirPuertas("2040")).toEqual([2040]);
    expect(abrirPuertas("")).toEqual([]);
    expect(abrirPuertas("N")).toEqual([]);
  });
  it("una fila de frentes → una fila por puerta, con esquina y ochava; EXCEDENTE se ignora", () => {
    expect(filaPuertas({ frente: "AV. CABILDO", num_dom: "2040", smp: "039-097-008b", parc_esq: "N", ochava: "N", clase: "PARCELA" }))
      .toEqual([{ calle: "AV. CABILDO", calle_clave: "CABILDO AV", altura: 2040, smp: "039-097-008b", es_esquina: false, tiene_ochava: false }]);
    expect(filaPuertas({ frente: "X", num_dom: "1.2", smp: "s", parc_esq: "S", ochava: "S", clase: "EXCEDENTE" })).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr → FAIL.**

- [ ] **Step 3: Implementar**

```ts
// lib/prefactibilidad/normalizar-calle.ts
// La puerta "calle + número" se traduce a parcela con el dataset de frentes del GCBA. USIG dice
// "CABILDO AV." y frentes "AV. CABILDO": la clave común saca puntos y tildes y manda las
// partículas al final. num_dom trae varias puertas pegadas por punto ("3939.3943").
const PARTICULAS = new Set(["AV", "AVDA", "GRAL", "DR", "DRA", "PTE", "ING", "TTE", "CNEL", "PJE", "PSJE", "DIAG", "CMTE", "ALTE", "BRIG", "MTRO", "PROF", "SGTO", "CAP", "MCAL"]);

export function calleClave(nombre: string): string {
  const base = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  const palabras = base.split(" ").filter(Boolean);
  const principales = palabras.filter((p) => !PARTICULAS.has(p));
  const particulas = palabras.filter((p) => PARTICULAS.has(p)).sort();
  return [...principales, ...particulas].join(" ");
}

export function abrirPuertas(numDom: string): number[] {
  return String(numDom || "").split(".").map((s) => parseInt(s, 10)).filter((n) => Number.isFinite(n) && n > 0);
}

export interface FilaFrentes { frente: string; num_dom: string; smp: string; parc_esq: string; ochava: string; clase: string }
export interface PuertaRow { calle: string; calle_clave: string; altura: number; smp: string; es_esquina: boolean; tiene_ochava: boolean }

export function filaPuertas(f: FilaFrentes): PuertaRow[] {
  if (f.clase !== "PARCELA" || !f.smp || !f.frente) return [];
  return abrirPuertas(f.num_dom).map((altura) => ({ calle: f.frente.trim(), calle_clave: calleClave(f.frente), altura, smp: f.smp.trim().toLowerCase(), es_esquina: f.parc_esq === "S", tiene_ochava: f.ochava === "S" }));
}
```

- [ ] **Step 4: Correr → PASS.**

- [ ] **Step 5: Commit**

```bash
git add lib/prefactibilidad/normalizar-calle.ts lib/prefactibilidad/normalizar-calle.test.ts
git commit -m "feat(prefactibilidad): clave común de calle entre USIG y el catastro; abrir las puertas"
```

---

### Task 9: Migraciones (tablas del GCBA, prefactibilidades, RPC de terrenos)

**Files:**
- Create: `supabase/migrations/20260918100000_prefactibilidad_gcba.sql`
- Create: `supabase/rollback/20260918_prefactibilidad_gcba_rollback.sql`
- Create: `supabase/migrations/20260918100100_prefactibilidades.sql`
- Create: `supabase/rollback/20260918_prefactibilidades_rollback.sql`
- Test: `lib/prefactibilidad/migraciones.test.ts` (guardia de texto: las reglas de seguridad están en el SQL)

**Interfaces:**
- Produces: tablas `gcba_parcelas_cur`, `gcba_puertas`, `gcba_parcela_cache`, `prefactibilidades`; RPC `prefactibilidad_terrenos_cerca(p_lat, p_lng, p_radio_m, p_limit)`; RPC `increment_prefactibilidad_view(p_token)`.

- [ ] **Step 1: Test que falla (guardia de texto, como `lib/acm/ficha-css.test.ts`)**

```ts
// lib/prefactibilidad/migraciones.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const sql = (n: string) => readFileSync(path.resolve(__dirname, "../../supabase/migrations", n), "utf8");

describe("las migraciones de prefactibilidad respetan las reglas de la casa", () => {
  const gcba = sql("20260918100000_prefactibilidad_gcba.sql");
  const pref = sql("20260918100100_prefactibilidades.sql");
  it("van en transacción", () => {
    // Los comentarios de cabecera van ANTES del begin (convención del repo): se ignoran para el chequeo.
    const sinComentarios = (s: string) => s.replace(/^--.*$/gm, "").trim();
    for (const s of [gcba, pref]) { expect(sinComentarios(s).startsWith("begin;")).toBe(true); expect(sinComentarios(s).endsWith("commit;")).toBe(true); }
  });
  it("las tablas del GCBA son de solo lectura para la app", () => {
    for (const t of ["gcba_parcelas_cur", "gcba_puertas", "gcba_parcela_cache"]) {
      expect(gcba).toContain(`alter table public.${t} enable row level security`);
      expect(gcba).toContain(`revoke insert, update, delete on public.${t} from authenticated, anon`);
    }
  });
  it("prefactibilidades: RLS por agencia y sin escritura directa; la ficha pública solo por token desde el servidor", () => {
    expect(pref).toContain("alter table public.prefactibilidades enable row level security");
    expect(pref).toContain("user_id = auth.uid()");
    expect(pref).toContain("agency_id in (select agency_id from public.profiles where id = auth.uid() and role = 'director')");
    expect(pref).toContain("revoke insert, update, delete on public.prefactibilidades from authenticated, anon");
    expect(pref).toContain("token text unique");
  });
  it("la RPC de terrenos usa el índice geográfico y solo la puede ejecutar el servidor", () => {
    expect(pref).toContain("ST_DWithin(m.geom");
    expect(pref).toContain("m.tipo = 'Terrenos'");
    expect(pref).toContain("revoke execute on function public.prefactibilidad_terrenos_cerca");
    expect(pref).toContain("grant execute on function public.prefactibilidad_terrenos_cerca");
  });
});
```

- [ ] **Step 2: Correr → FAIL** (no existen los archivos).

- [ ] **Step 3: Migración 1: datos del GCBA**

```sql
-- supabase/migrations/20260918100000_prefactibilidad_gcba.sql
-- Prefactibilidad · datos abiertos del GCBA (spec docs/superpowers/specs/2026-09-12-prefactibilidad-design.md).
-- Tres tablas de solo lectura para la app: el Código Urbanístico por parcela, las puertas
-- (calle + número → parcela) y la caché de lo que se le pide en vivo al catastro y a Ciudad 3D.
-- Se cargan con scripts/gcba/*.mjs (service_role). Nadie más escribe.
-- Aplicar por Management API (scripts/sql-produccion.mjs) con el OK de Leonardo.
-- Rollback: supabase/rollback/20260918_prefactibilidad_gcba_rollback.sql
begin;

create table if not exists public.gcba_parcelas_cur (
  smp          text primary key,             -- "053-050-006", minúsculas como viene el CSV
  seccion      text not null,
  manzana      text not null,
  parcela      text not null,
  uni_edif     numeric[] not null default '{}', -- alturas (17.2, 38…) sin ceros, en orden
  plano_l      numeric,
  tipo_mza     text,                          -- TIPICA | ATIPICA
  catalogado   smallint not null default 0,
  dist_1_grp   text,
  dist_1_esp   text,
  dist_2_grp   text,
  dist_2_esp   text,
  dist_cpu_1   text,
  fot_em_1     numeric,
  barrio       text,
  comuna       text,
  alicuota     numeric,
  inc_uva_21   integer,
  fuente_fecha date not null,                 -- contenido del Código (2024-12-31)
  publicado    date not null                  -- publicación del dataset (2026-06-24)
);
comment on table public.gcba_parcelas_cur is 'Código Urbanístico por parcela, dataset codigo-urbanistico del GCBA (CC-BY-2.5-AR). Solo lectura.';
create index if not exists gcba_parcelas_cur_sm_idx on public.gcba_parcelas_cur (seccion, manzana);

create table if not exists public.gcba_puertas (
  id            bigserial primary key,
  calle         text not null,
  calle_clave   text not null,                -- lib/prefactibilidad/normalizar-calle.ts
  altura        integer not null,
  smp           text not null,
  es_esquina    boolean not null default false,
  tiene_ochava  boolean not null default false,
  lote_carga    text not null                  -- marca de la corrida que la cargó; permite recargar sin ventana vacía
);
comment on table public.gcba_puertas is 'Una fila por puerta, del dataset frentes-parcelas del GCBA. calle_clave iguala USIG y catastro.';
create index if not exists gcba_puertas_clave_idx on public.gcba_puertas (calle_clave, altura);
create index if not exists gcba_puertas_smp_idx on public.gcba_puertas (smp);
create index if not exists gcba_puertas_lote_idx on public.gcba_puertas (lote_carga);

create table if not exists public.gcba_parcela_cache (
  smp            text primary key,
  geom_lote      jsonb,                        -- GeoJSON tal cual lo devuelve epok (PostgREST no convierte JSON a geometry al escribir)
  geom_manzana   jsonb,
  catastro       jsonb,                       -- respuesta de epok catastro/parcela
  volumenes      jsonb,                       -- VolumenOficial[] de las teselas, ya en lon/lat
  manzana_tipo   text,                        -- TIPICA | ATIPICA según la tesela manzana
  esquina_oficial boolean not null default false, -- 2+ líneas oficiales con rumbo distinto
  consultado_en  timestamptz not null default now()
);
comment on table public.gcba_parcela_cache is 'Lo que se le pidió en vivo al catastro (epok) y a Ciudad 3D. La segunda consulta no toca al GCBA.';

-- Solo lectura para la app; escriben los scripts y el servidor con service_role.
alter table public.gcba_parcelas_cur enable row level security;
alter table public.gcba_puertas enable row level security;
alter table public.gcba_parcela_cache enable row level security;
drop policy if exists gcba_parcelas_cur_leer on public.gcba_parcelas_cur;
create policy gcba_parcelas_cur_leer on public.gcba_parcelas_cur for select to authenticated using (true);
drop policy if exists gcba_puertas_leer on public.gcba_puertas;
create policy gcba_puertas_leer on public.gcba_puertas for select to authenticated using (true);
drop policy if exists gcba_parcela_cache_leer on public.gcba_parcela_cache;
create policy gcba_parcela_cache_leer on public.gcba_parcela_cache for select to authenticated using (true);
revoke insert, update, delete on public.gcba_parcelas_cur from authenticated, anon;
revoke insert, update, delete on public.gcba_puertas from authenticated, anon;
revoke insert, update, delete on public.gcba_parcela_cache from authenticated, anon;

commit;
```

```sql
-- supabase/rollback/20260918_prefactibilidad_gcba_rollback.sql
begin;
drop table if exists public.gcba_parcela_cache;
drop table if exists public.gcba_puertas;
drop table if exists public.gcba_parcelas_cur;
commit;
```

- [ ] **Step 4: Migración 2: prefactibilidades + RPCs**

```sql
-- supabase/migrations/20260918100100_prefactibilidades.sql
-- Prefactibilidad · informes guardados y compartidos, y la RPC de terrenos cercanos.
-- Molde: shared_acm_reports (snapshot congelado, lectura pública SOLO por token desde el
-- servidor) + doctrina farming (RLS de lectura por agencia y sin escritura directa).
-- Aplicar por Management API con el OK de Leonardo.
-- Rollback: supabase/rollback/20260918_prefactibilidades_rollback.sql
begin;

create table if not exists public.prefactibilidades (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  direccion   text not null,
  smp         text not null,
  modo        text not null check (modo in ('oficial', 'regla')),
  resultado   jsonb not null,                 -- Prefactibilidad (lib/prefactibilidad/tipos.ts), congelado
  token       text unique,                     -- null hasta que se comparte
  view_count  integer not null default 0,
  creado_en   timestamptz not null default now()
);
comment on table public.prefactibilidades is 'Prefactibilidades guardadas. resultado es un snapshot: los links ya enviados no cambian.';
create index if not exists prefactibilidades_agencia_idx on public.prefactibilidades (agency_id, creado_en desc);
create index if not exists prefactibilidades_user_idx on public.prefactibilidades (user_id, creado_en desc);

alter table public.prefactibilidades enable row level security;
-- Ver: el asesor las suyas; el director todas las de su agencia. (Documenta la regla; la app lee con service_role y filtra igual.)
drop policy if exists prefactibilidades_ver on public.prefactibilidades;
create policy prefactibilidades_ver on public.prefactibilidades
  for select to authenticated
  using (
    user_id = auth.uid()
    or agency_id in (select agency_id from public.profiles where id = auth.uid() and role = 'director')
  );
revoke insert, update, delete on public.prefactibilidades from authenticated, anon;

create or replace function public.increment_prefactibilidad_view(p_token text)
returns void language sql security definer set search_path = public as $$
  update public.prefactibilidades set view_count = view_count + 1 where token = p_token;
$$;

-- Terrenos en venta a menos de p_radio_m de un punto. ST_DWithin sobre geography engancha
-- mercado_avisos_geom_idx en las dos particiones (ver 20260916120000_farming_avisos.sql).
create or replace function public.prefactibilidad_terrenos_cerca(
  p_lat double precision, p_lng double precision, p_radio_m integer default 800, p_limit integer default 200)
returns table (id bigint, titulo text, direccion text, barrio text, precio_usd numeric, superficie_total_m2 numeric, distancia_m integer, url_publica text, foto_portada text)
language sql stable parallel safe as $$
  select m.id, m.titulo, m.direccion, m.barrio, m.precio_usd, m.superficie_total_m2,
         round(ST_Distance(m.geom, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography))::integer as distancia_m,
         m.url_publica, m.foto_portada
  from public.mercado_avisos m
  where m.geom is not null
    and ST_DWithin(m.geom, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_radio_m)
    and m.tipo = 'Terrenos'
    and m.operacion = 'venta'
    and m.calidad = 'ok'
    and m.estado = 'activo'
    and m.precio_usd > 0
    and m.superficie_total_m2 > 0
  order by distancia_m
  limit p_limit;
$$;
revoke execute on function public.prefactibilidad_terrenos_cerca(double precision, double precision, integer, integer) from public, anon, authenticated;
grant execute on function public.prefactibilidad_terrenos_cerca(double precision, double precision, integer, integer) to service_role;

commit;
```

```sql
-- supabase/rollback/20260918_prefactibilidades_rollback.sql
begin;
drop function if exists public.prefactibilidad_terrenos_cerca(double precision, double precision, integer, integer);
drop function if exists public.increment_prefactibilidad_view(text);
drop table if exists public.prefactibilidades;
commit;
```

- [ ] **Step 5: Correr el test → PASS.**

- [ ] **Step 6: Aplicar en LOCAL** (si hay Supabase local: `supabase db reset`; si no, pedirle a Leonardo el OK para producción recién en la Task 16). No aplicar a producción acá.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260918100000_prefactibilidad_gcba.sql supabase/migrations/20260918100100_prefactibilidades.sql supabase/rollback/20260918_prefactibilidad_gcba_rollback.sql supabase/rollback/20260918_prefactibilidades_rollback.sql lib/prefactibilidad/migraciones.test.ts
git commit -m "feat(prefactibilidad): tablas del GCBA, prefactibilidades y RPC de terrenos cercanos"
```

---

### Task 10: Scripts de carga (Código por parcela y puertas)

**Files:**
- Create: `scripts/gcba/comun.mjs`
- Create: `scripts/gcba/cargar-codigo-urbanistico.mjs`
- Create: `scripts/gcba/cargar-puertas.mjs`
- Create: `lib/prefactibilidad/filas-cur.ts` (parseo puro de la fila CSV, testeable)
- Test: `lib/prefactibilidad/filas-cur.test.ts`

**Interfaces:**
- Consumes: `filaPuertas` (Task 8).
- Produces: `filaCurDesdeCsv(fila: Record<string, string>, publicado: string): FilaCurDb | null` con `FilaCurDb = { smp, seccion, manzana, parcela, uni_edif: number[], plano_l: number | null, tipo_mza: string | null, catalogado: number, dist_1_grp, dist_1_esp, dist_2_grp, dist_2_esp, dist_cpu_1, fot_em_1, barrio, comuna, alicuota, inc_uva_21, fuente_fecha: "2024-12-31", publicado }`.

- [ ] **Step 1: Test que falla**

```ts
// lib/prefactibilidad/filas-cur.test.ts
import { describe, it, expect } from "vitest";
import { filaCurDesdeCsv } from "./filas-cur";

// Fila real del CSV (Roosevelt 4554 no; Zuviría 3939, gid 498024), tal cual viene.
const FILA = { gid: "498024", smp: "056-068-040b", seccion: "056", manzana: "068", parcela: "040b", uni_edif_1: "17.2", uni_edif_2: "0", uni_edif_3: "0", uni_edif_4: "0", uso_1: "3", dist_1_grp: "", dist_1_esp: "", dist_2_grp: "", dist_2_esp: "", catalogado: "0", tipo_mza: "ATIPICA", barrio: "PARQUE AVELLANEDA", comuna: "9", plano_l: "24.2", dist_cpu_1: "R2b II", fot_em_1: "1.2", alicuota: "0.1", inc_uva_21: "50" };

describe("una fila del CSV del Código → una fila de gcba_parcelas_cur", () => {
  it("tipa números, arma el arreglo de alturas sin ceros y guarda las fechas", () => {
    const f = filaCurDesdeCsv(FILA, "2026-06-24")!;
    expect(f.smp).toBe("056-068-040b");
    expect(f.uni_edif).toEqual([17.2]);
    expect(f.plano_l).toBe(24.2); expect(f.tipo_mza).toBe("ATIPICA"); expect(f.catalogado).toBe(0);
    expect(f.dist_1_grp).toBeNull(); expect(f.dist_cpu_1).toBe("R2b II"); expect(f.fot_em_1).toBe(1.2);
    expect(f.alicuota).toBe(0.1); expect(f.inc_uva_21).toBe(50);
    expect(f.fuente_fecha).toBe("2024-12-31"); expect(f.publicado).toBe("2026-06-24");
  });
  it("dos alturas → dos elementos; sin smp → null", () => {
    expect(filaCurDesdeCsv({ ...FILA, uni_edif_2: "31.2", uni_edif_1: "38" }, "2026-06-24")!.uni_edif).toEqual([38, 31.2]);
    expect(filaCurDesdeCsv({ ...FILA, smp: "" }, "2026-06-24")).toBeNull();
  });
});
```

- [ ] **Step 2: Correr → FAIL.**

- [ ] **Step 3: Parseo puro**

```ts
// lib/prefactibilidad/filas-cur.ts
// Del CSV codigo-urbanistico.csv (318.128 filas, columnas gid,smp,seccion,manzana,parcela,
// uni_edif_1..4,…,tipo_mza,…,barrio,comuna,plano_l,…,dist_cpu_1,…,fot_em_1,…,alicuota,inc_uva_21,…)
// a la fila de gcba_parcelas_cur. El contenido del Código es al 31-dic-2024 (nombre del recurso).
export const FUENTE_FECHA = "2024-12-31";

export interface FilaCurDb {
  smp: string; seccion: string; manzana: string; parcela: string;
  uni_edif: number[]; plano_l: number | null; tipo_mza: string | null; catalogado: number;
  dist_1_grp: string | null; dist_1_esp: string | null; dist_2_grp: string | null; dist_2_esp: string | null;
  dist_cpu_1: string | null; fot_em_1: number | null; barrio: string | null; comuna: string | null;
  alicuota: number | null; inc_uva_21: number | null; fuente_fecha: string; publicado: string;
}

const num = (s: string | undefined): number | null => { const n = parseFloat(String(s ?? "").trim()); return Number.isFinite(n) ? n : null; };
const txt = (s: string | undefined): string | null => { const t = String(s ?? "").trim(); return t ? t : null; };

export function filaCurDesdeCsv(f: Record<string, string>, publicado: string): FilaCurDb | null {
  const smp = txt(f.smp)?.toLowerCase();
  if (!smp) return null;
  const uni_edif = [f.uni_edif_1, f.uni_edif_2, f.uni_edif_3, f.uni_edif_4].map(num).filter((n): n is number => n !== null && n > 0);
  return {
    smp, seccion: txt(f.seccion) ?? "", manzana: txt(f.manzana) ?? "", parcela: txt(f.parcela) ?? "",
    uni_edif, plano_l: num(f.plano_l) || null, tipo_mza: txt(f.tipo_mza), catalogado: num(f.catalogado) ?? 0,
    dist_1_grp: txt(f.dist_1_grp), dist_1_esp: txt(f.dist_1_esp), dist_2_grp: txt(f.dist_2_grp), dist_2_esp: txt(f.dist_2_esp),
    dist_cpu_1: txt(f.dist_cpu_1), fot_em_1: num(f.fot_em_1), barrio: txt(f.barrio), comuna: txt(f.comuna),
    alicuota: num(f.alicuota), inc_uva_21: num(f.inc_uva_21), fuente_fecha: FUENTE_FECHA, publicado,
  };
}
```

- [ ] **Step 4: Correr → PASS.**

- [ ] **Step 5: Lo común de los scripts**

```js
// scripts/gcba/comun.mjs
// Lo que comparten los cargadores del GCBA: leer .env, resolver la URL del recurso por el
// catálogo CKAN (el gobierno mueve archivos de carpeta; ver scripts/cargar-zona-pois.mjs),
// bajar con User-Agent de navegador (sin él el portal devuelve "Request Rejected"), y escribir
// en Supabase por PostgREST con service_role en tandas.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const UA = "Mozilla/5.0 (compatible; PRISMA-prefactibilidad/1.0; contacto: osterrietchleonardo@vakdor.com)";
export const DRY = process.argv.includes("--dry");

export function leerEnv() {
  const env = {};
  for (const linea of fs.readFileSync(path.join(RAIZ, ".env"), "utf8").split(/\r?\n/)) {
    const m = linea.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) { console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env"); process.exit(1); }
  return env;
}

/** URL y fecha de un recurso del portal de datos, por id de dataset y nombre de recurso. */
export async function recursoCkan(datasetId, nombreIncluye) {
  const r = await fetch(`https://data.buenosaires.gob.ar/api/3/action/package_show?id=${datasetId}`, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!r.ok) throw new Error(`CKAN ${datasetId} → HTTP ${r.status}`);
  const j = await r.json();
  const rec = j.result.resources.find((x) => x.name.includes(nombreIncluye) && x.format.toUpperCase() === "CSV");
  if (!rec) throw new Error(`No hay recurso CSV "${nombreIncluye}" en ${datasetId}`);
  return { url: rec.url, modificado: (rec.last_modified || j.result.metadata_modified || "").slice(0, 10) };
}

export async function bajarTexto(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return await r.text();
}

export function clienteRest(env) {
  const base = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
  return async (ruta, opts = {}) => {
    const res = await fetch(`${base}/rest/v1/${ruta}`, { ...opts, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: opts.prefer || "return=minimal", ...(opts.headers || {}) } });
    if (!res.ok) throw new Error(`${opts.method || "GET"} ${ruta} → ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const t = await res.text();
    return t ? JSON.parse(t) : null;
  };
}

/** Upsert en tandas por PostgREST (Prefer: resolution=merge-duplicates). */
export async function subirEnTandas(sb, tabla, onConflict, filas, tam = 500) {
  let hechas = 0;
  for (let i = 0; i < filas.length; i += tam) {
    await sb(`${tabla}?on_conflict=${onConflict}`, { method: "POST", prefer: "resolution=merge-duplicates", body: JSON.stringify(filas.slice(i, i + tam)) });
    hechas += Math.min(tam, filas.length - i);
    if (hechas % 20000 < tam || hechas === filas.length) console.log(`  [${tabla}] ${hechas}/${filas.length}`);
  }
}
```

- [ ] **Step 6: Cargador del Código**

```js
// scripts/gcba/cargar-codigo-urbanistico.mjs
// CSV "Código Urbanístico actualizado al 31 de diciembre de 2024" → gcba_parcelas_cur.
//   node scripts/gcba/cargar-codigo-urbanistico.mjs [--dry] [--verificar]
// Valida ANTES de escribir: columnas esperadas, ~318.128 filas (±1 %), y la parcela de prueba
// 056-068-040b con sus valores conocidos. Si algo no cierra, no escribe nada.
// A producción SOLO con el OK de Leonardo.
import Papa from "papaparse";
import { DRY, bajarTexto, clienteRest, leerEnv, recursoCkan, subirEnTandas } from "./comun.mjs";
import { filaCurDesdeCsv } from "../../lib/prefactibilidad/filas-cur.ts";

const FILAS_ESPERADAS = 318127; // filas de datos (el archivo tiene 318.128 líneas con la cabecera)
const COLUMNAS = ["gid", "smp", "seccion", "manzana", "parcela", "uni_edif_1", "uni_edif_2", "uni_edif_3", "uni_edif_4", "tipo_mza", "catalogado", "barrio", "comuna", "plano_l", "dist_1_grp", "dist_1_esp", "dist_cpu_1", "fot_em_1", "alicuota", "inc_uva_21"];
const VERIFICAR = process.argv.includes("--verificar");

const env = leerEnv();
const sb = clienteRest(env);

if (VERIFICAR) {
  const r = await sb("gcba_parcelas_cur?smp=eq.056-068-040b&select=uni_edif,plano_l,dist_cpu_1,alicuota,inc_uva_21,publicado", { prefer: "return=representation" });
  const n = await sb("gcba_parcelas_cur?select=smp", { headers: { Prefer: "count=exact", Range: "0-0" } });
  console.log("fila de prueba:", JSON.stringify(r?.[0]));
  const ok = r?.[0] && r[0].uni_edif?.[0] === 17.2 && r[0].plano_l === 24.2 && r[0].dist_cpu_1 === "R2b II" && r[0].alicuota === 0.1 && r[0].inc_uva_21 === 50;
  if (!ok) { console.error("  X CARGA NO VÁLIDA: la parcela de prueba no tiene los valores esperados."); process.exit(1); }
  console.log("  OK carga válida"); process.exit(0);
}

const { url, modificado } = await recursoCkan("codigo-urbanistico", "31 de diciembre de 2024");
console.log(`[cur] recurso: ${url} (modificado ${modificado})${DRY ? " · DRY RUN" : ""}`);
const texto = await bajarTexto(url);
const { data, meta } = Papa.parse(texto.trim(), { header: true, skipEmptyLines: true });
const faltan = COLUMNAS.filter((c) => !meta.fields.includes(c));
if (faltan.length) { console.error("  X El CSV cambió de columnas. Faltan:", faltan.join(", ")); process.exit(1); }
if (Math.abs(data.length - FILAS_ESPERADAS) > FILAS_ESPERADAS * 0.01) { console.error(`  X Filas: ${data.length}, esperadas ~${FILAS_ESPERADAS}. Mirar el CSV antes de tocar el código.`); process.exit(1); }

const filas = data.map((f) => filaCurDesdeCsv(f, modificado)).filter(Boolean);
const prueba = filas.find((f) => f.smp === "056-068-040b");
if (!prueba || prueba.uni_edif[0] !== 17.2 || prueba.plano_l !== 24.2 || prueba.dist_cpu_1 !== "R2b II" || prueba.alicuota !== 0.1 || prueba.inc_uva_21 !== 50) {
  console.error("  X La parcela de prueba 056-068-040b no da los valores conocidos:", JSON.stringify(prueba)); process.exit(1);
}
console.log(`[cur] ${filas.length} filas válidas · alturas 0: ${filas.filter((f) => f.uni_edif.length === 0).length} · atípicas: ${filas.filter((f) => f.tipo_mza === "ATIPICA").length}`);
if (DRY) { console.log("[cur] DRY RUN: nada escrito."); process.exit(0); }
await subirEnTandas(sb, "gcba_parcelas_cur", "smp", filas, 500);
console.log("[cur] listo. Correr --verificar.");
```

- [ ] **Step 7: Cargador de puertas**

```js
// scripts/gcba/cargar-puertas.mjs
// CSV "Frentes parcelas" → gcba_puertas (una fila por puerta).
//   node scripts/gcba/cargar-puertas.mjs [--dry] [--verificar]
// Valida: columnas, ~426.664 filas de frentes (±2 %), y que "AV. CABILDO 2040" resuelva a 039-097-008b.
import Papa from "papaparse";
import { DRY, bajarTexto, clienteRest, leerEnv, recursoCkan, subirEnTandas } from "./comun.mjs";
import { calleClave, filaPuertas } from "../../lib/prefactibilidad/normalizar-calle.ts";

const FILAS_ESPERADAS = 426664;
const COLUMNAS = ["clase", "frente", "num_dom", "ochava", "parcela", "parc_esq", "seccion", "smp"];
const VERIFICAR = process.argv.includes("--verificar");

const env = leerEnv();
const sb = clienteRest(env);

if (VERIFICAR) {
  const r = await sb(`gcba_puertas?calle_clave=eq.${encodeURIComponent(calleClave("CABILDO AV."))}&altura=eq.2040&select=smp,es_esquina`, { prefer: "return=representation" });
  console.log("Cabildo 2040 →", JSON.stringify(r));
  if (r?.[0]?.smp !== "039-097-008b") { console.error("  X CARGA NO VÁLIDA: Cabildo 2040 no resuelve a 039-097-008b."); process.exit(1); }
  console.log("  OK carga válida"); process.exit(0);
}

const { url, modificado } = await recursoCkan("parcelas", "Frentes parcelas");
console.log(`[puertas] recurso: ${url} (modificado ${modificado})${DRY ? " · DRY RUN" : ""}`);
const { data, meta } = Papa.parse((await bajarTexto(url)).trim(), { header: true, skipEmptyLines: true });
const faltan = COLUMNAS.filter((c) => !meta.fields.includes(c));
if (faltan.length) { console.error("  X El CSV cambió de columnas. Faltan:", faltan.join(", ")); process.exit(1); }
if (Math.abs(data.length - FILAS_ESPERADAS) > FILAS_ESPERADAS * 0.02) { console.error(`  X Filas: ${data.length}, esperadas ~${FILAS_ESPERADAS}.`); process.exit(1); }

const puertas = data.flatMap(filaPuertas);
const prueba = puertas.find((p) => p.calle_clave === calleClave("CABILDO AV.") && p.altura === 2040);
if (prueba?.smp !== "039-097-008b") { console.error("  X Cabildo 2040 no resuelve a 039-097-008b en el CSV:", JSON.stringify(prueba)); process.exit(1); }
console.log(`[puertas] ${puertas.length} puertas de ${data.length} frentes · esquinas: ${puertas.filter((p) => p.es_esquina).length}`);
if (DRY) { console.log("[puertas] DRY RUN: nada escrito."); process.exit(0); }
// Recarga SIN ventana vacía: primero entran todas las puertas nuevas con la marca de esta corrida
// y recién después se borran las de corridas anteriores. Si la subida falla a mitad, quedan las
// viejas intactas y las nuevas parciales se limpian en la próxima corrida.
const lote = new Date().toISOString();
await subirEnTandas(sb, "gcba_puertas", "id", puertas.map((p) => ({ ...p, lote_carga: lote })), 1000);
await sb(`gcba_puertas?lote_carga=neq.${encodeURIComponent(lote)}`, { method: "DELETE" });
console.log("[puertas] listo. Correr --verificar.");
```

Nota: Node 24 corre `.ts` importado desde `.mjs` sin flags (verificado en `lib/mapa/__tests__`); si falla, correr con `node --experimental-strip-types`.

- [ ] **Step 8: Probar en seco**

Run: `node scripts/gcba/cargar-codigo-urbanistico.mjs --dry` y `node scripts/gcba/cargar-puertas.mjs --dry`
Expected: ambos imprimen el recurso, la cantidad de filas y "DRY RUN: nada escrito", sin `X`.

- [ ] **Step 9: Commit**

```bash
git add scripts/gcba/comun.mjs scripts/gcba/cargar-codigo-urbanistico.mjs scripts/gcba/cargar-puertas.mjs lib/prefactibilidad/filas-cur.ts lib/prefactibilidad/filas-cur.test.ts
git commit -m "feat(prefactibilidad): cargadores del Código por parcela y de las puertas, con validación antes de escribir"
```

---

### Task 11: Cliente del GCBA (USIG, catastro, teselas) con fetch inyectable

**Files:**
- Create: `lib/prefactibilidad/gcba.ts`
- Test: `lib/prefactibilidad/gcba.test.ts`

**Interfaces:**
- Consumes: `teselasParaBBox`, `decodificar`, `volumenesDe`, `urlTesela` (Task 3); `bboxDe` (Task 2).
- Produces:
  ```ts
  export interface DireccionUsig { direccion: string; calle: string; altura: number; codCalle: number; lat: number; lng: number; esCaba: boolean }
  export interface ClienteGcba {
    normalizar(direccion: string, max?: number): Promise<DireccionUsig[]>
    parcela(smp: string): Promise<CatastroParcela | null>
    geometriaLote(smp: string): Promise<Poligono | null>
    geometriaManzana(sm: string): Promise<Poligono | null>
    volumenes(smp: string, bboxLote: [number, number, number, number]): Promise<VolumenOficial[]>
    manzanaTipo(sm: string, bboxLote: [number, number, number, number]): Promise<"TIPICA" | "ATIPICA" | null>
    esquinaOficial(smp: string, bboxLote): Promise<boolean>   // 2+ líneas oficiales con rumbos distintos
  }
  export class GcbaNoResponde extends Error {}
  export function crearClienteGcba(fetchImpl: typeof fetch = fetch): ClienteGcba
  ```

- [ ] **Step 1: Test que falla (fetch falso con los fixtures)**

```ts
// lib/prefactibilidad/gcba.test.ts
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { crearClienteGcba, GcbaNoResponde } from "./gcba";

const fx = (n: string) => readFileSync(path.join(__dirname, "__fixtures__", n));
const USIG = JSON.stringify({ direccionesNormalizadas: [{ altura: 4554, cod_calle: 3005, cod_partido: "caba", coordenadas: { srid: 4326, x: "-58.480800", y: "-34.570300" }, direccion: "ROOSEVELT FRANKLIN D. 4554, CABA", nombre_calle: "ROOSEVELT FRANKLIN D.", nombre_partido: "CABA", tipo: "calle_altura" }] });

function fetchFalso(caido = false) {
  return vi.fn(async (url: string) => {
    if (caido) throw new Error("ECONNRESET");
    if (url.includes("/normalizar/")) return new Response(USIG, { status: 200 });
    if (url.includes("/catastro/parcela/")) return new Response(fx("053-050-006.parcela.json"), { status: 200 });
    if (url.includes("/catastro/geometria/?smp=")) return new Response(fx("053-050-006.lote.geojson"), { status: 200 });
    if (url.includes("/catastro/geometria/?sm=")) return new Response(fx("053-050.manzana.geojson"), { status: 200 });
    const m = url.match(/cur3d\/(\w+)\/17\/(\d+)\/(\d+)\.pbf/);
    if (m) { try { return new Response(fx(`${m[1]}-17-${m[2]}-${m[3]}.pbf`), { status: 200 }); } catch { return new Response("", { status: 404 }); } }
    return new Response("", { status: 404 });
  }) as unknown as typeof fetch;
}
const BBOX: [number, number, number, number] = [-58.4811, -34.5706, -58.4805, -34.5700];

describe("cliente del GCBA", () => {
  it("normalizar: dirección, calle, altura, coordenadas y si es CABA", async () => {
    const c = crearClienteGcba(fetchFalso());
    const d = await c.normalizar("Roosevelt 4554");
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ calle: "ROOSEVELT FRANKLIN D.", altura: 4554, esCaba: true });
    expect(d[0].lng).toBeCloseTo(-58.4808, 4);
  });
  it("parcela del catastro tipada", async () => {
    const p = (await crearClienteGcba(fetchFalso()).parcela("053-050-006"))!;
    expect(p.smp).toBe("053-050-006");
    expect(p.superficieTotal).toBeGreaterThan(300);
    expect(typeof p.propiedadHorizontal).toBe("boolean");
    expect(p.centroide[0]).toBeLessThan(-58);
  });
  it("geometrías del lote y la manzana como Polygon/MultiPolygon", async () => {
    const c = crearClienteGcba(fetchFalso());
    expect((await c.geometriaLote("053-050-006"))!.type).toMatch(/Polygon/);
    expect((await c.geometriaManzana("053-050"))!.type).toMatch(/Polygon/);
  });
  it("volúmenes oficiales de la parcela desde las teselas del bbox; tipo de manzana", async () => {
    const c = crearClienteGcba(fetchFalso());
    const v = await c.volumenes("053-050-006", BBOX);
    expect(v.map((x) => x.tipo).sort()).toEqual(["cuerpo principal", "retiro 1", "retiro 2"]);
    expect(await c.manzanaTipo("053-050", BBOX)).toBe("TIPICA");
  });
  it("todas las llamadas llevan User-Agent y timeout", async () => {
    const f = fetchFalso();
    await crearClienteGcba(f).parcela("053-050-006");
    const [, init] = (f as any).mock.calls[0];
    expect(init.headers["User-Agent"]).toContain("PRISMA");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
  it("si el GCBA no responde, tira GcbaNoResponde (no un error genérico)", async () => {
    await expect(crearClienteGcba(fetchFalso(true)).parcela("053-050-006")).rejects.toBeInstanceOf(GcbaNoResponde);
  });
});
```

- [ ] **Step 2: Correr → FAIL.**

- [ ] **Step 3: Implementar**

```ts
// lib/prefactibilidad/gcba.ts
// Todo lo que se le pide en vivo al GCBA. Verificado 11 y 17-sep-2026:
//  - USIG normalizar: dirección → coordenadas y nombre oficial de la calle.
//  - epok catastro/parcela y catastro/geometria (smp= lote; sm= manzana).
//  - Teselas de Ciudad 3D (Task 3).
// Siempre desde el servidor (certificados de usig.* y sin exponer nada), con User-Agent y
// timeout. Cualquier fallo de red o 5xx se convierte en GcbaNoResponde → mensaje amable.
import type { CatastroParcela, Poligono, VolumenOficial } from "./tipos";
import { decodificar, teselasParaBBox, urlTesela, volumenesDe, ZOOM_PARCELA, type Capa, type Tesela } from "./teselas";
import type { Feature, LineString, MultiLineString } from "geojson";

export const UA = "PRISMA-prefactibilidad/1.0 (inmobiliaria; contacto: osterrietchleonardo@vakdor.com)";
export const TIMEOUT_MS = 8000;
const USIG = "https://servicios.usig.buenosaires.gob.ar/normalizar/";
const EPOK = "https://epok.buenosaires.gob.ar/catastro";

export class GcbaNoResponde extends Error { constructor(m = "El catastro de la Ciudad no está respondiendo, probá en unos minutos") { super(m); this.name = "GcbaNoResponde"; } }

export interface DireccionUsig { direccion: string; calle: string; altura: number; codCalle: number; lat: number; lng: number; esCaba: boolean }

export interface ClienteGcba {
  normalizar(direccion: string, max?: number): Promise<DireccionUsig[]>;
  parcela(smp: string): Promise<CatastroParcela | null>;
  geometriaLote(smp: string): Promise<Poligono | null>;
  geometriaManzana(sm: string): Promise<Poligono | null>;
  volumenes(smp: string, bboxLote: [number, number, number, number]): Promise<VolumenOficial[]>;
  manzanaTipo(sm: string, bboxLote: [number, number, number, number]): Promise<"TIPICA" | "ATIPICA" | null>;
  esquinaOficial(smp: string, bboxLote: [number, number, number, number]): Promise<boolean>;
}

const num = (v: unknown): number | null => { const n = parseFloat(String(v ?? "")); return Number.isFinite(n) ? n : null; };

export function crearClienteGcba(fetchImpl: typeof fetch = fetch): ClienteGcba {
  async function pedir(url: string): Promise<Response> {
    let r: Response;
    try { r = await fetchImpl(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(TIMEOUT_MS) }); }
    catch { throw new GcbaNoResponde(); }
    if (r.status >= 500) throw new GcbaNoResponde();
    return r;
  }
  async function json(url: string): Promise<any | null> {
    const r = await pedir(url);
    if (!r.ok) return null;
    const t = await r.text();
    if (!t.trim() || t.trim() === "{}") return null;
    try { return JSON.parse(t); } catch { throw new GcbaNoResponde(); }
  }
  function geomDe(fc: any): Poligono | null {
    const g = fc?.features?.[0]?.geometry;
    return g && (g.type === "Polygon" || g.type === "MultiPolygon") ? g : null;
  }
  async function teselas(capa: Capa, bbox: [number, number, number, number]): Promise<Feature[]> {
    const ts: Tesela[] = teselasParaBBox(bbox, ZOOM_PARCELA);
    const partes = await Promise.all(ts.map(async (t) => {
      const r = await pedir(urlTesela(capa, t));
      if (!r.ok) return [] as Feature[];
      return decodificar(new Uint8Array(await r.arrayBuffer()), t);
    }));
    return partes.flat();
  }
  return {
    async normalizar(direccion, max = 5) {
      const j = await json(`${USIG}?direccion=${encodeURIComponent(direccion)}&geocodificar=true&maxOptions=${max}`);
      const lista: any[] = j?.direccionesNormalizadas ?? [];
      return lista.filter((d) => d.tipo === "calle_altura" && d.coordenadas).map((d) => ({
        direccion: d.direccion, calle: d.nombre_calle, altura: Number(d.altura), codCalle: Number(d.cod_calle),
        lat: parseFloat(d.coordenadas.y), lng: parseFloat(d.coordenadas.x), esCaba: String(d.cod_partido).toLowerCase() === "caba",
      }));
    },
    async parcela(smp) {
      const j = await json(`${EPOK}/parcela/?smp=${encodeURIComponent(smp)}`);
      if (!j?.smp) return null;
      return {
        smp: String(j.smp), direccion: String(j.direccion ?? ""),
        superficieTotal: num(j.superficie_total), superficieCubierta: num(j.superficie_cubierta),
        frente: num(j.frente), fondo: num(j.fondo), propiedadHorizontal: String(j.propiedad_horizontal).toLowerCase() === "si",
        pisosSobreRasante: num(j.pisos_sobre_rasante), unidadesFuncionales: num(j.unidades_funcionales),
        centroide: [Number(j.centroide?.[0]), Number(j.centroide?.[1])],
      };
    },
    async geometriaLote(smp) { return geomDe(await json(`${EPOK}/geometria/?smp=${encodeURIComponent(smp)}&srid=4326`)); },
    async geometriaManzana(sm) { return geomDe(await json(`${EPOK}/geometria/?sm=${encodeURIComponent(sm)}&srid=4326`)); },
    async volumenes(smp, bbox) { return volumenesDe(await teselas("volumen_edif", bbox), smp); },
    async manzanaTipo(sm, bbox) {
      const f = (await teselas("manzana", bbox)).find((x) => String(x.properties?.sm).toUpperCase() === sm.toUpperCase());
      const t = f?.properties?.tipo;
      return t === "TIPICA" || t === "ATIPICA" ? t : null;
    },
    async esquinaOficial(smp, bbox) {
      // Dos líneas oficiales con rumbo distinto (> 30°) = frente a dos calles = esquina o doble frente.
      const lineas = (await teselas("linea_oficial", bbox)).filter((x) => String(x.properties?.smp).toUpperCase() === smp.toUpperCase());
      const rumbos: number[] = [];
      for (const l of lineas) {
        const g = l.geometry as LineString | MultiLineString;
        const coords = g.type === "LineString" ? [g.coordinates] : g.coordinates;
        for (const c of coords) if (c.length >= 2) { const [a, b] = [c[0], c[c.length - 1]]; rumbos.push(((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI + 180) % 180); }
      }
      return rumbos.some((r1) => rumbos.some((r2) => Math.min(Math.abs(r1 - r2), 180 - Math.abs(r1 - r2)) > 30));
    },
  };
}
```

- [ ] **Step 4: Correr → PASS.**

- [ ] **Step 5: Commit**

```bash
git add lib/prefactibilidad/gcba.ts lib/prefactibilidad/gcba.test.ts
git commit -m "feat(prefactibilidad): cliente del GCBA (USIG, catastro, teselas) con timeout y error amable"
```

---

### Task 12: Textos en criollo y el orquestador `analizarParcela`

**Files:**
- Create: `lib/prefactibilidad/criollo.ts`
- Create: `lib/prefactibilidad/analizar.ts`
- Test: `lib/prefactibilidad/criollo.test.ts`, `lib/prefactibilidad/analizar.test.ts`

**Interfaces:**
- Consumes: todo lo anterior. `ClienteGcba` (Task 11), `calcularEdificabilidadOficial` (4), `edificabilidadPorRegla` (5), `armarAvisos` (6), `valorTierra`, `RADIO_M` (7), `unidadDesdeAltura` (1), `bboxDe` (2).
- Produces:
  ```ts
  // criollo.ts
  export function describirUnidad(u: Unidad): string          // "Altura media: planta baja y 5 pisos, más 2 retirados (hasta 17,2 m; plano límite 24,2 m)"
  export function describirPlanta(p: Planta): string          // "Planta baja y 5 pisos · 261 m² por nivel · 6 niveles"
  export function m2(n: number): string                        // "1.567 m²" (es-AR, sin decimales)
  export function usd(n: number): string                       // "USD 150.000"
  // analizar.ts
  export interface Dependencias {
    gcba: ClienteGcba
    curDe(smp: string): Promise<FilaCur | null>
    puertaEsquina(smp: string): Promise<boolean | null>
    terrenosCerca(lat: number, lng: number, radioM: number): Promise<TerrenoCerca[]>
    cache: { leer(smp: string): Promise<CacheParcela | null>; guardar(c: CacheParcela): Promise<void> }
    ahora?: () => Date
  }
  export interface CacheParcela { smp: string; geomLote: Poligono; geomManzana: Poligono | null; catastro: CatastroParcela; volumenes: VolumenOficial[]; manzanaTipo: "TIPICA" | "ATIPICA" | null; esquinaOficial: boolean }
  export class ParcelaNoEncontrada extends Error {}
  export async function analizarParcela(smp: string, direccion: string, deps: Dependencias): Promise<Prefactibilidad>
  ```

- [ ] **Step 1: Tests que fallan**

```ts
// lib/prefactibilidad/criollo.test.ts
import { describe, it, expect } from "vitest";
import { describirUnidad, describirPlanta, m2, usd } from "./criollo";

describe("los textos que lee el dueño del lote", () => {
  it("unidad en criollo", () => {
    expect(describirUnidad("USAM")).toBe("Altura media: planta baja y 5 pisos, más 2 retirados (hasta 17,2 m; plano límite 24,2 m)");
    expect(describirUnidad("USAB0")).toBe("Altura baja 0: planta baja y 2 pisos (hasta 9 m)");
    expect(describirUnidad("CA")).toBe("Corredor alto: planta baja y 12 pisos, más 2 retirados (hasta 38 m; plano límite 45 m)");
  });
  it("planta", () => {
    expect(describirPlanta({ nombre: "Planta baja y 5 pisos", unidad: "USAM", m2PorNivel: 261.3, niveles: 6, desdeM: 0, hastaM: 17.2 })).toBe("Planta baja y 5 pisos · 261 m² por nivel · 6 niveles");
  });
  it("números en es-AR", () => {
    expect(m2(1567.4)).toBe("1.567 m²");
    expect(usd(150000)).toBe("USD 150.000");
  });
});
```

```ts
// lib/prefactibilidad/analizar.test.ts
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { analizarParcela, ParcelaNoEncontrada, type Dependencias } from "./analizar";
import { crearClienteGcba } from "./gcba";
import type { TerrenoCerca } from "./tipos";

const fx = (n: string) => readFileSync(path.join(__dirname, "__fixtures__", n));
const fetchFalso = vi.fn(async (url: string) => {
  if (url.includes("/catastro/parcela/")) return new Response(fx("053-050-006.parcela.json"));
  if (url.includes("/catastro/geometria/?smp=")) return new Response(fx("053-050-006.lote.geojson"));
  if (url.includes("/catastro/geometria/?sm=")) return new Response(fx("053-050.manzana.geojson"));
  const m = url.match(/cur3d\/(\w+)\/17\/(\d+)\/(\d+)\.pbf/);
  if (m) { try { return new Response(fx(`${m[1]}-17-${m[2]}-${m[3]}.pbf`)); } catch { return new Response("", { status: 404 }); } }
  return new Response("", { status: 404 });
}) as unknown as typeof fetch;

let n = 0;
const terreno = (precioUsd: number, superficieM2: number, distanciaM: number): TerrenoCerca => ({ id: ++n, titulo: "Lote", direccion: null, barrio: "Villa Urquiza", precioUsd, superficieM2, distanciaM, url: "u", foto: null });
const CINCO = [terreno(200000, 300, 100), terreno(250000, 300, 200), terreno(180000, 300, 300), terreno(220000, 300, 400), terreno(260000, 300, 500)];

function deps(extra: Partial<Dependencias> = {}): Dependencias & { guardados: any[] } {
  const guardados: any[] = [];
  return {
    gcba: crearClienteGcba(fetchFalso),
    curDe: async () => ({ smp: "053-050-006", uniEdif: [17.2], planoL: 24.2, tipoMza: "TIPICA", catalogado: 0, distGrp: null, distEsp: null, distCpu: "R2b I", barrio: "VILLA URQUIZA", comuna: "12", publicado: "2026-06-24" }),
    puertaEsquina: async () => false,
    terrenosCerca: async () => CINCO,
    cache: { leer: async () => null, guardar: async (c) => { guardados.push(c); } },
    ahora: () => new Date("2026-09-18T12:00:00Z"),
    guardados,
    ...extra,
  };
}

describe("analizarParcela: de la parcela al informe", () => {
  it("Roosevelt 4554: modo oficial, sin avisos, 6 niveles de 261 m², valor de la tierra por 5 terrenos, y guarda la caché", async () => {
    const d = deps();
    const r = await analizarParcela("053-050-006", "Roosevelt Franklin D. 4554", d);
    expect(r.edificabilidad.modo).toBe("oficial");
    expect(r.edificabilidad.plantas[0].niveles).toBe(6);
    expect(r.edificabilidad.plantas[0].m2PorNivel).toBeCloseTo(261, -1);
    expect(r.avisos).toEqual([]);
    expect(r.tierra!.comparables).toHaveLength(5);
    expect(r.tierra!.valorLote.mediana).toBe(Math.round((220000 / 300) * r.lote.superficieTotal!));
    expect(r.fuentes.curPublicado).toBe("2026-06-24");
    expect(d.guardados).toHaveLength(1);
    expect(d.guardados[0].smp).toBe("053-050-006");
  });
  it("con caché no le pide nada al GCBA", async () => {
    const d1 = deps();
    await analizarParcela("053-050-006", "x", d1);
    const llamadas = (fetchFalso as any).mock.calls.length;
    const d2 = deps({ cache: { leer: async () => d1.guardados[0], guardar: async () => {} } });
    await analizarParcela("053-050-006", "x", d2);
    expect((fetchFalso as any).mock.calls.length).toBe(llamadas);
  });
  it("menos de 5 terrenos → tierra null", async () => {
    const r = await analizarParcela("053-050-006", "x", deps({ terrenosCerca: async () => CINCO.slice(0, 3) }));
    expect(r.tierra).toBeNull();
  });
  it("sin envolvente oficial → modo regla con rango y aviso fuerte", async () => {
    const gcba = crearClienteGcba(fetchFalso);
    const r = await analizarParcela("053-050-006", "x", deps({ gcba: { ...gcba, volumenes: async () => [] } }));
    expect(r.edificabilidad.modo).toBe("regla");
    expect(r.edificabilidad.rango!.piso).toBeGreaterThan(0);
    expect(r.avisos.map((a) => a.clave)).toContain("sin_envolvente");
  });
  it("parcela inexistente → ParcelaNoEncontrada", async () => {
    const gcba = crearClienteGcba(fetchFalso);
    await expect(analizarParcela("999-999-999", "x", deps({ gcba: { ...gcba, parcela: async () => null } }))).rejects.toBeInstanceOf(ParcelaNoEncontrada);
  });
});
```

- [ ] **Step 2: Correr → FAIL.**

- [ ] **Step 3: Criollo**

```ts
// lib/prefactibilidad/criollo.ts
import { UNIDADES } from "./codigo";
import type { Planta, Unidad } from "./tipos";

const fmtM = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 1 });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function describirUnidad(u: Unidad): string {
  const d = UNIDADES[u];
  const pisos = d.pisosCuerpo - 1;
  const retirados = d.retirados ? `, más ${d.retirados} retirados` : "";
  const plano = d.retirados ? `; plano límite ${fmtM(d.planoLimite)} m` : "";
  return `${cap(d.criollo)}: planta baja y ${pisos} pisos${retirados} (hasta ${fmtM(d.alturaMaxima)} m${plano})`;
}

export function describirPlanta(p: Planta): string {
  return `${p.nombre} · ${m2(p.m2PorNivel)} por nivel · ${p.niveles} ${p.niveles === 1 ? "nivel" : "niveles"}`;
}

export function m2(n: number): string {
  return `${Math.round(n).toLocaleString("es-AR")} m²`;
}

export function usd(n: number): string {
  return `USD ${Math.round(n).toLocaleString("es-AR")}`;
}
```

- [ ] **Step 4: Orquestador**

```ts
// lib/prefactibilidad/analizar.ts
// El camino completo de una parcela, sin saber nada de HTTP ni de Supabase: recibe las
// dependencias y devuelve el informe. Así se prueba entero con fixtures.
import { armarAvisos } from "./avisos";
import { unidadDesdeAltura } from "./codigo";
import { calcularEdificabilidadOficial } from "./envolvente";
import type { ClienteGcba } from "./gcba";
import { bboxDe } from "./geo";
import { edificabilidadPorRegla } from "./lfi-regla";
import { RADIO_M, valorTierra } from "./tierra";
import type { CatastroParcela, Edificabilidad, FilaCur, Poligono, Prefactibilidad, TerrenoCerca, VolumenOficial } from "./tipos";

export class ParcelaNoEncontrada extends Error { constructor() { super("No encontramos ese número. Probá con otro número de la misma cuadra"); this.name = "ParcelaNoEncontrada"; } }

export interface CacheParcela {
  smp: string; geomLote: Poligono; geomManzana: Poligono | null; catastro: CatastroParcela;
  volumenes: VolumenOficial[]; manzanaTipo: "TIPICA" | "ATIPICA" | null; esquinaOficial: boolean;
}

export interface Dependencias {
  gcba: ClienteGcba;
  curDe(smp: string): Promise<FilaCur | null>;
  puertaEsquina(smp: string): Promise<boolean | null>;
  terrenosCerca(lat: number, lng: number, radioM: number): Promise<TerrenoCerca[]>;
  cache: { leer(smp: string): Promise<CacheParcela | null>; guardar(c: CacheParcela): Promise<void> };
  ahora?: () => Date;
}

async function traerDelGcba(smp: string, gcba: ClienteGcba): Promise<CacheParcela> {
  const catastro = await gcba.parcela(smp);
  const geomLote = catastro ? await gcba.geometriaLote(smp) : null;
  if (!catastro || !geomLote) throw new ParcelaNoEncontrada();
  const sm = smp.slice(0, smp.lastIndexOf("-")); // la manzana puede tener letra: 042-077A
  const bbox = bboxDe(geomLote);
  const [geomManzana, volumenes, manzanaTipo, esquinaOficial] = await Promise.all([
    gcba.geometriaManzana(sm), gcba.volumenes(smp, bbox), gcba.manzanaTipo(sm, bbox), gcba.esquinaOficial(smp, bbox),
  ]);
  return { smp, geomLote, geomManzana, catastro, volumenes, manzanaTipo, esquinaOficial };
}

export async function analizarParcela(smp: string, direccion: string, deps: Dependencias): Promise<Prefactibilidad> {
  const clave = smp.toLowerCase();
  let datos = await deps.cache.leer(clave);
  if (!datos) { datos = await traerDelGcba(clave, deps.gcba); await deps.cache.guardar(datos); }
  const [cur, esquinaPuerta] = await Promise.all([deps.curDe(clave), deps.puertaEsquina(clave)]);

  let edificabilidad: Edificabilidad | null = calcularEdificabilidadOficial(datos.volumenes, datos.geomLote);
  const oficial = edificabilidad !== null;
  if (!edificabilidad) {
    const unidad = cur?.uniEdif[0] ? unidadDesdeAltura(cur.uniEdif[0]) : null;
    if (unidad && datos.geomManzana) edificabilidad = edificabilidadPorRegla(datos.geomLote, datos.geomManzana, unidad);
  }
  const avisos = armarAvisos({ cur, lote: datos.catastro, manzanaTipo: datos.manzanaTipo, esEsquina: Boolean(esquinaPuerta) || datos.esquinaOficial, edificabilidad: oficial ? edificabilidad : null });
  if (!edificabilidad) {
    edificabilidad = { modo: "regla", unidades: [], alturaMaxima: 0, planoLimite: 0, plantas: [], m2Construibles: 0, m2Vendibles: 0, huella: null, rango: { piso: 0, techo: 0 } };
  }

  const [lng, lat] = datos.catastro.centroide;
  const terrenos = await deps.terrenosCerca(lat, lng, RADIO_M);
  const tierra = valorTierra(terrenos, datos.catastro.superficieTotal ?? 0);

  return {
    direccion, smp: clave, lote: datos.catastro, geomLote: datos.geomLote, geomManzana: datos.geomManzana,
    manzanaTipo: datos.manzanaTipo, cur, edificabilidad, avisos, tierra,
    fuentes: { curPublicado: cur?.publicado ?? null, consultadoEn: (deps.ahora ?? (() => new Date()))().toISOString() },
  };
}
```

- [ ] **Step 5: Correr → PASS.**

- [ ] **Step 6: Commit**

```bash
git add lib/prefactibilidad/criollo.ts lib/prefactibilidad/criollo.test.ts lib/prefactibilidad/analizar.ts lib/prefactibilidad/analizar.test.ts
git commit -m "feat(prefactibilidad): el orquestador de la parcela y los textos en criollo"
```

---

### Task 13: El plano SVG del lote

**Files:**
- Create: `lib/prefactibilidad/plano-svg.ts`
- Test: `lib/prefactibilidad/plano-svg.test.ts`

**Interfaces:**
- Consumes: `proyector`, `anillosDe`, `bboxDe` (Task 2).
- Produces: `planoSvg(args: { lote: Poligono; huella: Poligono | null; manzana?: Poligono | null; colorLote?: string; colorHuella?: string; ancho?: number; alto?: number }): string` — SVG con viewBox en metros, lote con contorno, huella rellena, manzana en gris si viene, flecha de norte y barra de escala de 10 m. Sin `<text>` (Vercel no tiene fuentes): la escala se dibuja con líneas.

- [ ] **Step 1: Test que falla**

```ts
// lib/prefactibilidad/plano-svg.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { planoSvg } from "./plano-svg";
import type { Poligono } from "./tipos";

const fx = (n: string) => JSON.parse(readFileSync(path.join(__dirname, "__fixtures__", n), "utf8")).features[0].geometry as Poligono;

describe("el plano del lote para la ficha", () => {
  const svg = planoSvg({ lote: fx("053-050-006.lote.geojson"), huella: fx("053-050-006.lote.geojson"), manzana: fx("053-050.manzana.geojson") });
  it("es un SVG con viewBox y tres polígonos (manzana, lote, huella)", () => {
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toMatch(/viewBox="[-\d. ]+"/);
    expect((svg.match(/<polygon/g) || []).length).toBeGreaterThanOrEqual(3);
  });
  it("no usa <text>: en el servidor no hay fuentes", () => {
    expect(svg).not.toContain("<text");
  });
  it("sin huella ni manzana también dibuja", () => {
    const s = planoSvg({ lote: fx("053-050-006.lote.geojson"), huella: null });
    expect((s.match(/<polygon/g) || []).length).toBe(1);
  });
});
```

- [ ] **Step 2: Correr → FAIL.**

- [ ] **Step 3: Implementar**

```ts
// lib/prefactibilidad/plano-svg.ts
// Un plano que imprime siempre igual: SVG generado desde la geometría, no una captura del mapa.
// Coordenadas en metros alrededor del lote, norte arriba. Sin <text> (Vercel no tiene fuentes;
// ver app/api/acm/mapa-zona/route.ts): la escala son dos rayas de 10 m.
import { anillosDe, bboxDe, proyector } from "./geo";
import type { Poligono } from "./tipos";

interface Args { lote: Poligono; huella: Poligono | null; manzana?: Poligono | null; colorLote?: string; colorHuella?: string; ancho?: number; alto?: number }

export function planoSvg({ lote, huella, manzana = null, colorLote = "#8d5c2a", colorHuella = "#8d5c2a", ancho = 480, alto = 360 }: Args): string {
  const [minLng, minLat, maxLng, maxLat] = bboxDe(lote);
  const p = proyector([(minLng + maxLng) / 2, (minLat + maxLat) / 2]);
  const aPuntos = (g: Poligono) => anillosDe(g).map((an) => an.map((c) => { const [x, y] = p.aMetros(c); return `${x.toFixed(2)},${(-y).toFixed(2)}`; }).join(" "));
  const [x0, y0] = p.aMetros([minLng, maxLat]); const [x1, y1] = p.aMetros([maxLng, minLat]);
  const margen = Math.max(6, (x1 - x0) * 0.25);
  const vx = x0 - margen, vy = -y0 - margen, vw = x1 - x0 + 2 * margen, vh = y0 - y1 + 2 * margen;
  const partes: string[] = [];
  if (manzana) for (const pts of aPuntos(manzana)) partes.push(`<polygon points="${pts}" fill="#f4f4f5" stroke="#a1a1aa" stroke-width="0.3" />`);
  for (const pts of aPuntos(lote)) partes.push(`<polygon points="${pts}" fill="#ffffff" stroke="${colorLote}" stroke-width="0.5" />`);
  if (huella) for (const pts of aPuntos(huella)) partes.push(`<polygon points="${pts}" fill="${colorHuella}" fill-opacity="0.35" stroke="${colorHuella}" stroke-width="0.35" />`);
  // norte: flecha arriba a la derecha; escala: 10 m abajo a la izquierda
  const nx = vx + vw - margen * 0.6, ny = vy + margen * 0.4;
  partes.push(`<path d="M ${nx} ${ny + 4} L ${nx} ${ny} M ${nx - 1.2} ${ny + 1.4} L ${nx} ${ny} L ${nx + 1.2} ${ny + 1.4}" stroke="#3f3f46" stroke-width="0.35" fill="none" />`);
  const sx = vx + margen * 0.4, sy = vy + vh - margen * 0.4;
  partes.push(`<path d="M ${sx} ${sy} L ${sx + 10} ${sy} M ${sx} ${sy - 1} L ${sx} ${sy + 1} M ${sx + 10} ${sy - 1} L ${sx + 10} ${sy + 1}" stroke="#3f3f46" stroke-width="0.35" />`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="${vx.toFixed(2)} ${vy.toFixed(2)} ${vw.toFixed(2)} ${vh.toFixed(2)}" role="img" aria-label="Plano del lote con la huella edificable">${partes.join("")}</svg>`;
}
```

- [ ] **Step 4: Correr → PASS.**

- [ ] **Step 5: Commit**

```bash
git add lib/prefactibilidad/plano-svg.ts lib/prefactibilidad/plano-svg.test.ts
git commit -m "feat(prefactibilidad): plano SVG del lote y la huella, apto para PDF"
```

---

### Task 14: Rutas API

**Files:**
- Create: `lib/prefactibilidad/dependencias-supabase.ts` (arma `Dependencias` con el cliente admin)
- Create: `app/api/prefactibilidad/direcciones/route.ts`
- Create: `app/api/prefactibilidad/analizar/route.ts`
- Create: `app/api/prefactibilidad/route.ts`
- Create: `app/api/prefactibilidad/[id]/route.ts`
- Create: `app/api/prefactibilidad/[id]/compartir/route.ts`
- Test: `app/api/prefactibilidad/analizar/route.test.ts`

**Interfaces:**
- Consumes: `requireTenant` (`@/lib/auth/tenant-validation`), `createAdminClient` (`@/lib/supabase/admin`), `analizarParcela`, `crearClienteGcba`, `calleClave`, `GcbaNoResponde`, `ParcelaNoEncontrada`.
- Produces (contratos HTTP):
  - `GET /api/prefactibilidad/direcciones?q=` → `{ direcciones: DireccionUsig[] }` (solo CABA; máx 5).
  - `POST /api/prefactibilidad/analizar` body `{ calle: string; altura: number; direccion: string }` → `{ prefactibilidad: Prefactibilidad }` | 404 `{ error: "No encontramos ese número. Probá con otro número de la misma cuadra" }` | 502 `{ error: "El catastro de la Ciudad no está respondiendo, probá en unos minutos" }`.
  - `GET /api/prefactibilidad` → `{ prefactibilidades: Array<{ id, direccion, smp, modo, token, creado_en, user_id }> }` (asesor: las suyas; director: la agencia).
  - `POST /api/prefactibilidad` body `{ smp: string; direccion: string }` → `{ id }` (el servidor recalcula y guarda SU resultado; el navegador no manda números).
  - `GET /api/prefactibilidad/[id]` → `{ prefactibilidad, token, creado_en }`; `DELETE` → `{ ok: true }`.
  - `POST /api/prefactibilidad/[id]/compartir` → `{ token, path: "/prefactibilidad/<token>" }` (reutiliza el token si ya existe).

- [ ] **Step 1: Test del endpoint de análisis (con base falsa y GCBA falso)**

```ts
// app/api/prefactibilidad/analizar/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const tenant = vi.fn(async () => ({ userId: "u1", agencyId: "a1", role: "asesor" }));
vi.mock("@/lib/auth/tenant-validation", () => ({ requireTenant: () => tenant() }));

const puerta = { smp: "053-050-006", es_esquina: false };
let filaPuerta: any = puerta;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabla: string) => ({
      select: () => ({
        eq: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: tabla === "gcba_puertas" ? filaPuerta : null }) }) }), maybeSingle: async () => ({ data: null }) }),
      }),
      upsert: async () => ({ error: null }),
    }),
    rpc: async () => ({ data: [], error: null }),
  }),
}));

const analizar = vi.fn(async () => ({ smp: "053-050-006", edificabilidad: { modo: "oficial" } }));
vi.mock("@/lib/prefactibilidad/analizar", async (orig) => ({ ...(await orig<any>()), analizarParcela: (...a: any[]) => analizar(...a) }));

import { POST } from "./route";
const req = (body: unknown) => new Request("http://x/api/prefactibilidad/analizar", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => { filaPuerta = puerta; analizar.mockClear(); });

describe("POST /api/prefactibilidad/analizar", () => {
  it("resuelve la puerta a parcela y devuelve el informe", async () => {
    const r = await POST(req({ calle: "ROOSEVELT FRANKLIN D.", altura: 4554, direccion: "Roosevelt 4554" }));
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.prefactibilidad.smp).toBe("053-050-006");
    expect(analizar).toHaveBeenCalledWith("053-050-006", "Roosevelt 4554", expect.anything());
  });
  it("puerta inexistente → 404 con el mensaje de la spec", async () => {
    filaPuerta = null;
    const r = await POST(req({ calle: "ROOSEVELT FRANKLIN D.", altura: 99999, direccion: "x" }));
    expect(r.status).toBe(404);
    expect((await r.json()).error).toBe("No encontramos ese número. Probá con otro número de la misma cuadra");
  });
  it("body inválido → 400; sin sesión → 401", async () => {
    expect((await POST(req({ calle: "", altura: "no" }))).status).toBe(400);
    tenant.mockRejectedValueOnce(new Error("Unauthorized"));
    expect((await POST(req({ calle: "X", altura: 1, direccion: "x" }))).status).toBe(401);
  });
});
```

- [ ] **Step 2: Correr → FAIL.**

- [ ] **Step 3: Dependencias con Supabase**

```ts
// lib/prefactibilidad/dependencias-supabase.ts
// Arma las Dependencias del orquestador con el cliente admin: la caché de parcelas, el Código
// por parcela, las puertas y la RPC de terrenos. Corre en el servidor.
import type { SupabaseClient } from "@supabase/supabase-js";
import { crearClienteGcba } from "./gcba";
import type { CacheParcela, Dependencias } from "./analizar";
import type { FilaCur, TerrenoCerca } from "./tipos";

export function dependenciasSupabase(admin: SupabaseClient): Dependencias {
  return {
    gcba: crearClienteGcba(),
    async curDe(smp) {
      const { data } = await admin.from("gcba_parcelas_cur").select("smp, uni_edif, plano_l, tipo_mza, catalogado, dist_1_grp, dist_1_esp, dist_cpu_1, barrio, comuna, publicado").eq("smp", smp).maybeSingle();
      if (!data) return null;
      return { smp: data.smp, uniEdif: (data.uni_edif ?? []).map(Number), planoL: data.plano_l, tipoMza: data.tipo_mza, catalogado: data.catalogado ?? 0, distGrp: data.dist_1_grp, distEsp: data.dist_1_esp, distCpu: data.dist_cpu_1, barrio: data.barrio, comuna: data.comuna, publicado: data.publicado } as FilaCur;
    },
    async puertaEsquina(smp) {
      const { data } = await admin.from("gcba_puertas").select("es_esquina").eq("smp", smp).limit(1).maybeSingle();
      return data ? Boolean(data.es_esquina) : null;
    },
    async terrenosCerca(lat, lng, radioM) {
      const { data, error } = await admin.rpc("prefactibilidad_terrenos_cerca", { p_lat: lat, p_lng: lng, p_radio_m: radioM, p_limit: 200 });
      if (error || !data) return [];
      return (data as any[]).map((r): TerrenoCerca => ({ id: r.id, titulo: r.titulo, direccion: r.direccion, barrio: r.barrio, precioUsd: Number(r.precio_usd), superficieM2: Number(r.superficie_total_m2), distanciaM: Number(r.distancia_m), url: r.url_publica, foto: r.foto_portada }));
    },
    cache: {
      async leer(smp) {
        const { data } = await admin.from("gcba_parcela_cache").select("smp, geom_lote, geom_manzana, catastro, volumenes, manzana_tipo, esquina_oficial").eq("smp", smp).maybeSingle();
        if (!data?.geom_lote || !data.catastro) return null;
        return { smp: data.smp, geomLote: data.geom_lote, geomManzana: data.geom_manzana, catastro: data.catastro, volumenes: data.volumenes ?? [], manzanaTipo: data.manzana_tipo, esquinaOficial: Boolean(data.esquina_oficial) } as CacheParcela;
      },
      async guardar(c) {
        // Si la caché no se puede escribir, el análisis sale igual; pero tiene que quedar en el log,
        // si no la parcela se le pide al GCBA en cada consulta sin que nadie se entere.
        const { error } = await admin.from("gcba_parcela_cache").upsert({ smp: c.smp, geom_lote: c.geomLote, geom_manzana: c.geomManzana, catastro: c.catastro, volumenes: c.volumenes, manzana_tipo: c.manzanaTipo, esquina_oficial: c.esquinaOficial, consultado_en: new Date().toISOString() }, { onConflict: "smp" });
        if (error) console.error("Prefactibilidad: no se pudo guardar la caché de la parcela", c.smp, error.message);
      },
    },
  };
}
```

Nota: PostgREST acepta GeoJSON para columnas `geometry` y lo devuelve como GeoJSON en el select. La columna `esquina_oficial` ya está en la migración de la Task 9.

- [ ] **Step 4: Las rutas**

```ts
// app/api/prefactibilidad/direcciones/route.ts
// Autocompletar direcciones con el callejero oficial (USIG). Solo CABA, máximo 5.
import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/auth/tenant-validation";
import { crearClienteGcba, GcbaNoResponde } from "@/lib/prefactibilidad/gcba";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireTenant();
    const q = (new URL(req.url).searchParams.get("q") || "").trim();
    if (q.length < 3) return NextResponse.json({ direcciones: [] });
    const todas = await crearClienteGcba().normalizar(q, 5);
    return NextResponse.json({ direcciones: todas.filter((d) => d.esCaba), fueraDeCaba: todas.length > 0 && todas.every((d) => !d.esCaba) });
  } catch (e: any) {
    if (e instanceof GcbaNoResponde) return NextResponse.json({ error: e.message }, { status: 502 });
    console.error("Prefactibilidad direcciones error:", e);
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 500 });
  }
}
```

```ts
// app/api/prefactibilidad/analizar/route.ts
// Dirección (calle oficial + altura) → parcela por las puertas del GCBA → informe completo.
// No guarda nada: guardar es otro botón (POST /api/prefactibilidad).
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenant } from "@/lib/auth/tenant-validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { analizarParcela, ParcelaNoEncontrada } from "@/lib/prefactibilidad/analizar";
import { dependenciasSupabase } from "@/lib/prefactibilidad/dependencias-supabase";
import { GcbaNoResponde } from "@/lib/prefactibilidad/gcba";
import { calleClave } from "@/lib/prefactibilidad/normalizar-calle";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Body = z.object({ calle: z.string().min(1), altura: z.number().int().positive(), direccion: z.string().min(1) });

export async function POST(req: Request) {
  try {
    await requireTenant();
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Elegí una dirección de la lista." }, { status: 400 });
    const { calle, altura, direccion } = parsed.data;
    const admin = createAdminClient();
    const { data: puerta } = await admin.from("gcba_puertas").select("smp, es_esquina").eq("calle_clave", calleClave(calle)).eq("altura", altura).limit(1).maybeSingle();
    if (!puerta) return NextResponse.json({ error: "No encontramos ese número. Probá con otro número de la misma cuadra" }, { status: 404 });
    const prefactibilidad = await analizarParcela(puerta.smp, direccion, dependenciasSupabase(admin));
    return NextResponse.json({ prefactibilidad });
  } catch (e: any) {
    if (e instanceof ParcelaNoEncontrada) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof GcbaNoResponde) return NextResponse.json({ error: e.message }, { status: 502 });
    console.error("Prefactibilidad analizar error:", e);
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 500 });
  }
}
```

```ts
// app/api/prefactibilidad/route.ts
// GET: "Mis prefactibilidades" (asesor: las suyas; director: la agencia). POST: guardar el informe
// (recalculado en el servidor a partir de la parcela).
import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/auth/tenant-validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { analizarParcela, ParcelaNoEncontrada } from "@/lib/prefactibilidad/analizar";
import { dependenciasSupabase } from "@/lib/prefactibilidad/dependencias-supabase";
import { GcbaNoResponde } from "@/lib/prefactibilidad/gcba";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { userId, agencyId, role } = await requireTenant();
    const admin = createAdminClient();
    let q = admin.from("prefactibilidades").select("id, direccion, smp, modo, token, creado_en, user_id, cur_publicado:resultado->fuentes->>curPublicado").eq("agency_id", agencyId).order("creado_en", { ascending: false }).limit(200);
    if (role !== "director") q = q.eq("user_id", userId);
    const { data, error } = await q;
    if (error) throw error;
    // Spec "Qué se congela": si el GCBA publicó un Código más nuevo que el del informe, la lista ofrece recalcular.
    const { data: pub } = await admin.from("gcba_parcelas_cur").select("publicado").order("publicado", { ascending: false }).limit(1).maybeSingle();
    return NextResponse.json({ prefactibilidades: data ?? [], cur_publicado_actual: pub?.publicado ?? null });
  } catch (e: any) {
    console.error("Prefactibilidad lista error:", e);
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { userId, agencyId } = await requireTenant();
    const body = await req.json().catch(() => null);
    const smp = typeof body?.smp === "string" ? body.smp.trim().toLowerCase() : "";
    const direccion = typeof body?.direccion === "string" ? body.direccion.trim() : "";
    if (!smp || !direccion) return NextResponse.json({ error: "No hay un análisis para guardar." }, { status: 400 });
    // Lo que se guarda (y después se comparte por link) lo calcula el SERVIDOR de nuevo: el navegador
    // solo dice qué parcela. Así nadie puede guardar números que PRISMA no calculó. Con la caché de la
    // parcela ya caliente, cuesta una consulta de Código y una de terrenos.
    const admin = createAdminClient();
    const p = await analizarParcela(smp, direccion, dependenciasSupabase(admin));
    const { data, error } = await admin.from("prefactibilidades").insert({ agency_id: agencyId, user_id: userId, direccion: p.direccion, smp: p.smp, modo: p.edificabilidad.modo, resultado: p }).select("id").single();
    if (error) throw error;
    return NextResponse.json({ id: data.id });
  } catch (e: any) {
    if (e instanceof ParcelaNoEncontrada) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof GcbaNoResponde) return NextResponse.json({ error: e.message }, { status: 502 });
    console.error("Prefactibilidad guardar error:", e);
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 500 });
  }
}
```

```ts
// app/api/prefactibilidad/[id]/route.ts
// Abrir (GET) o borrar (DELETE) una prefactibilidad guardada. Molde: app/api/acm/searches/[id]/route.ts.
import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/auth/tenant-validation";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function buscar(id: string, select: string) {
  const { userId, agencyId, role } = await requireTenant();
  const admin = createAdminClient();
  let q = admin.from("prefactibilidades").select(select).eq("id", id).eq("agency_id", agencyId);
  if (role !== "director") q = q.eq("user_id", userId);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return { admin, row: data as any };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { row } = await buscar(params.id, "id, resultado, token, creado_en");
    if (!row) return NextResponse.json({ error: "No encontramos esa prefactibilidad." }, { status: 404 });
    return NextResponse.json({ prefactibilidad: row.resultado, token: row.token, creado_en: row.creado_en });
  } catch (e: any) {
    console.error("Prefactibilidad detalle error:", e);
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { admin, row } = await buscar(params.id, "id");
    if (!row) return NextResponse.json({ error: "No encontramos esa prefactibilidad." }, { status: 404 });
    const { error } = await admin.from("prefactibilidades").delete().eq("id", row.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("Prefactibilidad borrar error:", e);
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 500 });
  }
}
```

```ts
// app/api/prefactibilidad/[id]/compartir/route.ts
// Genera (o reutiliza) el token del link público. Token base62 de 12, como el del ACM.
import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireTenant } from "@/lib/auth/tenant-validation";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function genToken(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from(crypto.randomBytes(12)).map((b) => alphabet[b % 62]).join("");
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId, agencyId, role } = await requireTenant();
    const admin = createAdminClient();
    let q = admin.from("prefactibilidades").select("id, token").eq("id", params.id).eq("agency_id", agencyId);
    if (role !== "director") q = q.eq("user_id", userId);
    const { data: row } = await q.maybeSingle();
    if (!row) return NextResponse.json({ error: "No encontramos esa prefactibilidad." }, { status: 404 });
    let token = row.token as string | null;
    if (!token) {
      token = genToken();
      const { error } = await admin.from("prefactibilidades").update({ token }).eq("id", row.id);
      if (error) throw error;
    }
    return NextResponse.json({ token, path: `/prefactibilidad/${token}` });
  } catch (e: any) {
    console.error("Prefactibilidad compartir error:", e);
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 500 });
  }
}
```

- [ ] **Step 5: Correr el test → PASS.** Ajustar la base falsa del test si la cadena `.select().eq().eq().limit().maybeSingle()` cambia.

- [ ] **Step 6: Commit**

```bash
git add lib/prefactibilidad/dependencias-supabase.ts app/api/prefactibilidad
git commit -m "feat(prefactibilidad): rutas API (direcciones, analizar, guardar, listar, compartir)"
```

---

### Task 15: Menú y páginas (director y asesor)

**Files:**
- Modify: `lib/nav/menu.ts` (grupo `propiedades`, después del renglón `acm`)
- Modify: `lib/nav/menu.test.ts` (las dos listas planas, después de la línea `ACM`)
- Create: `app/asesor/prefactibilidad/page.tsx`, `app/director/prefactibilidad/page.tsx`

- [ ] **Step 1: Test que falla** — en `lib/nav/menu.test.ts`, agregar en `const DIRECTOR` después de `{ name: "ACM", href: "/director/acm" },`:

```ts
  { name: "Prefactibilidad",        href: "/director/prefactibilidad" },
```

y en `const ASESOR` después de `{ name: "ACM", href: "/asesor/acm" },`:

```ts
  { name: "Prefactibilidad",        href: "/asesor/prefactibilidad" },
```

Run: `npx vitest run lib/nav/menu.test.ts` → FAIL (falta el renglón).

- [ ] **Step 2: El renglón** — en `lib/nav/menu.ts`, importar `Ruler` de `lucide-react` (no se repite en ningún rol; verificar con `grep -n "Ruler" lib/nav/menu.ts`) y agregar después del renglón `acm`:

```ts
  { id: "prefactibilidad", icon: Ruler, grupo: "propiedades",
    director: { name: "Prefactibilidad", href: "/director/prefactibilidad" },
    asesor:   { name: "Prefactibilidad", href: "/asesor/prefactibilidad" } },
```

Y en el comentario de cabecera del archivo sumar la línea: `El 18/9/2026 se sumó «Prefactibilidad» (spec 2026-09-12) en Propiedades para los dos roles.`

- [ ] **Step 3: Páginas (mismo molde que el ACM)**

```tsx
// app/asesor/prefactibilidad/page.tsx
"use client";

import { PrefactibilidadModule } from "./components/prefactibilidad-module";

export default function PrefactibilidadPage() {
  return <PrefactibilidadModule />;
}
```

```tsx
// app/director/prefactibilidad/page.tsx
"use client";

// La misma pantalla que el asesor: el director ve todas las prefactibilidades de su agencia.
import { PrefactibilidadModule } from "@/app/asesor/prefactibilidad/components/prefactibilidad-module";

export default function PrefactibilidadDirectorPage() {
  return <PrefactibilidadModule esDirector />;
}
```

- [ ] **Step 4: Correr → PASS** (`npx vitest run lib/nav/menu.test.ts`). El módulo de la Task 16 todavía no existe: crear un `prefactibilidad-module.tsx` mínimo que devuelva `<div />` para que compile, y reemplazarlo en la Task 16.

- [ ] **Step 5: Commit**

```bash
git add lib/nav/menu.ts lib/nav/menu.test.ts app/asesor/prefactibilidad/page.tsx app/director/prefactibilidad/page.tsx app/asesor/prefactibilidad/components/prefactibilidad-module.tsx
git commit -m "feat(prefactibilidad): entrada de menú y páginas para director y asesor"
```

---

### Task 16: La pantalla (buscador, mapa, ficha, guardar y compartir)

**Files:**
- Create: `app/asesor/prefactibilidad/components/prefactibilidad-module.tsx`
- Create: `app/asesor/prefactibilidad/components/buscador-direccion.tsx`
- Create: `app/asesor/prefactibilidad/components/mapa-parcela.tsx`
- Create: `app/asesor/prefactibilidad/components/ficha-lote.tsx`
- Create: `app/asesor/prefactibilidad/components/mis-prefactibilidades.tsx`
- Create: `lib/prefactibilidad/leaflet.ts` (GeoJSON → posiciones `[lat, lng]` de Leaflet)
- Test: `lib/prefactibilidad/leaflet.test.ts`

**Interfaces:**
- Consumes: `DireccionUsig`, `Prefactibilidad`, `Aviso`, `describirUnidad`, `describirPlanta`, `m2`, `usd`, `requiereEstudio`, `planoSvg`; contratos HTTP de la Task 14.
- Produces: `posicionesDe(g: Poligono): [number, number][][][]` (mismo contrato que `components/farming/capas-farming.tsx`).

- [ ] **Step 1: Test que falla**

```ts
// lib/prefactibilidad/leaflet.test.ts
import { describe, it, expect } from "vitest";
import { posicionesDe } from "./leaflet";

describe("GeoJSON [lng, lat] → Leaflet [lat, lng]", () => {
  it("Polygon y MultiPolygon", () => {
    expect(posicionesDe({ type: "Polygon", coordinates: [[[-58.4, -34.6], [-58.3, -34.6], [-58.3, -34.5], [-58.4, -34.6]]] })).toEqual([[[[-34.6, -58.4], [-34.6, -58.3], [-34.5, -58.3], [-34.6, -58.4]]]]);
    expect(posicionesDe({ type: "MultiPolygon", coordinates: [[[[0, 1], [2, 3], [4, 5], [0, 1]]], [[[6, 7], [8, 9], [10, 11], [6, 7]]]] })).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Correr → FAIL.** Implementar:

```ts
// lib/prefactibilidad/leaflet.ts
import type { Poligono } from "./tipos";
/** GeoJSON va [lng, lat]; Leaflet quiere [lat, lng]. Soporta agujeros y varios pedazos. */
export function posicionesDe(g: Poligono): [number, number][][][] {
  const polis = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  return polis.map((p) => p.map((anillo) => anillo.map(([lng, lat]) => [lat, lng] as [number, number])));
}
```

Run → PASS.

- [ ] **Step 3: Buscador de direcciones (se escribe tecla por tecla; debounce 250 ms; mínimo 3 letras)**

```tsx
// app/asesor/prefactibilidad/components/buscador-direccion.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type { DireccionUsig } from "@/lib/prefactibilidad/gcba";

const ESPERA_MS = 250;
const MINIMO = 3;

export function BuscadorDireccion({ onElegir, deshabilitado }: { onElegir: (d: DireccionUsig) => void; deshabilitado?: boolean }) {
  const [q, setQ] = useState("");
  const [opciones, setOpciones] = useState<DireccionUsig[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    if (q.trim().length < MINIMO) { setOpciones([]); setAviso(null); return; }
    const t = setTimeout(async () => {
      ctrl.current?.abort();
      ctrl.current = new AbortController();
      try {
        const r = await fetch(`/api/prefactibilidad/direcciones?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.current.signal });
        const j = await r.json();
        if (!r.ok) { setAviso(j.error || "No se pudo buscar."); setOpciones([]); return; }
        setOpciones(j.direcciones || []);
        setAviso(j.fueraDeCaba ? "Por ahora solo Ciudad de Buenos Aires" : null);
        setAbierto(true);
      } catch (e: any) { if (e?.name !== "AbortError") setAviso("No se pudo buscar."); }
    }, ESPERA_MS);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="relative">
      <label htmlFor="pref-direccion" className="sr-only">Dirección</label>
      <input
        id="pref-direccion" type="text" inputMode="text" autoComplete="off" disabled={deshabilitado}
        value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setAbierto(true)}
        placeholder="Calle y número, por ejemplo Roosevelt 4554"
        className="h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-base text-zinc-900 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />
      {aviso && <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">{aviso}</p>}
      {abierto && opciones.length > 0 && (
        <ul role="listbox" className="absolute z-[700] mt-1 w-full overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {opciones.map((d) => (
            <li key={`${d.codCalle}-${d.altura}`}>
              <button type="button" className="block min-h-11 w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                onClick={() => { setQ(d.direccion); setAbierto(false); onElegir(d); }}>
                {d.direccion}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: El mapa (Leaflet, solo cliente)**

```tsx
// app/asesor/prefactibilidad/components/mapa-parcela.tsx
"use client";
// Solo se puede cargar con dynamic(..., { ssr: false }): Leaflet toca window al importarse.
import { useEffect } from "react";
import { MapContainer, Marker, Polygon, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { posicionesDe } from "@/lib/prefactibilidad/leaflet";
import type { Poligono } from "@/lib/prefactibilidad/tipos";

const CENTRO_CABA: [number, number] = [-34.6037, -58.4];
const clave = process.env.NEXT_PUBLIC_MAPTILER_KEY;
const TILES = clave ? `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${clave}` : "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTR = clave ? '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

function Encuadrar({ lote }: { lote: Poligono | null }) {
  const map = useMap();
  useEffect(() => {
    if (!lote) return;
    const b = L.latLngBounds(posicionesDe(lote).flat(2) as [number, number][]);
    map.fitBounds(b.pad(1.2), { animate: true });
  }, [lote, map]);
  return null;
}

export default function MapaParcela({ pin, lote, huella, manzana }: { pin: { lat: number; lng: number } | null; lote: Poligono | null; huella: Poligono | null; manzana: Poligono | null }) {
  return (
    <MapContainer center={CENTRO_CABA} zoom={12} className="h-full w-full" preferCanvas>
      <TileLayer url={TILES} attribution={ATTR} />
      <Encuadrar lote={lote} />
      {manzana && <Polygon positions={posicionesDe(manzana)} pathOptions={{ color: "#71717a", weight: 1, fillOpacity: 0.03, dashArray: "4 4" }} />}
      {lote && <Polygon positions={posicionesDe(lote)} pathOptions={{ color: "#8d5c2a", weight: 3, fillColor: "#8d5c2a", fillOpacity: 0.08 }} />}
      {huella && <Polygon positions={posicionesDe(huella)} pathOptions={{ color: "#8d5c2a", weight: 1.5, fillColor: "#8d5c2a", fillOpacity: 0.35 }} />}
      {pin && <Marker position={[pin.lat, pin.lng]} />}
    </MapContainer>
  );
}
```

(El ícono por defecto de Leaflet en Next necesita `L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl })` con las imágenes de `leaflet/dist/images/`: copiar exactamente lo que hace `components/mapa/mapa-lienzo.tsx` para el marcador rojo de la dirección buscada.)

- [ ] **Step 5: La ficha (tres bloques)**

```tsx
// app/asesor/prefactibilidad/components/ficha-lote.tsx
"use client";

import { describirPlanta, describirUnidad, m2, usd } from "@/lib/prefactibilidad/criollo";
import { requiereEstudio } from "@/lib/prefactibilidad/avisos";
import type { Prefactibilidad } from "@/lib/prefactibilidad/tipos";

export const LEYENDA = "Estudio orientativo elaborado con datos públicos del Gobierno de la Ciudad de Buenos Aires. No reemplaza el informe de un profesional matriculado ni el certificado urbanístico oficial.";

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">{titulo}</h3>
      {children}
    </section>
  );
}
const Dato = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="flex justify-between gap-3 border-b border-zinc-100 py-1.5 text-sm last:border-0 dark:border-zinc-800"><dt className="text-zinc-600 dark:text-zinc-400">{k}</dt><dd className="text-right font-medium text-zinc-900 dark:text-zinc-100">{v}</dd></div>
);

export function FichaLote({ p }: { p: Prefactibilidad }) {
  const e = p.edificabilidad;
  const fuerte = requiereEstudio(p.avisos);
  return (
    <div className="space-y-4">
      <Bloque titulo="El lote">
        <dl>
          <Dato k="Parcela (sección-manzana-parcela)" v={p.smp.toUpperCase()} />
          <Dato k="Superficie" v={p.lote.superficieTotal != null ? m2(p.lote.superficieTotal) : "sin dato"} />
          <Dato k="Frente × fondo" v={p.lote.frente != null && p.lote.fondo != null ? `${p.lote.frente.toLocaleString("es-AR")} × ${p.lote.fondo.toLocaleString("es-AR")} m` : "sin dato"} />
          <Dato k="Propiedad horizontal" v={p.lote.propiedadHorizontal ? `Sí (${p.lote.unidadesFuncionales ?? "?"} unidades)` : "No"} />
          <Dato k="Construido hoy" v={p.lote.pisosSobreRasante != null ? `${p.lote.pisosSobreRasante} ${p.lote.pisosSobreRasante === 1 ? "piso" : "pisos"}${p.lote.superficieCubierta ? ` · ${m2(p.lote.superficieCubierta)} cubiertos` : ""}` : "sin dato"} />
          <Dato k="Barrio" v={`${p.cur?.barrio ?? "—"}${p.cur?.comuna ? ` · Comuna ${p.cur.comuna}` : ""}`} />
        </dl>
      </Bloque>

      <Bloque titulo="Qué se puede construir">
        {fuerte && (
          <p role="alert" className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            <strong>Requiere estudio profesional.</strong> {p.avisos.filter((a) => a.fuerte).map((a) => a.texto).join(" ")}
          </p>
        )}
        {e.unidades.map((u) => <p key={u} className="mb-2 text-sm text-zinc-800 dark:text-zinc-200">{describirUnidad(u)}</p>)}
        {e.modo === "oficial" ? (
          <>
            <ul className="mb-3 space-y-1 text-sm">{e.plantas.map((pl, i) => <li key={i}>{describirPlanta(pl)}</li>)}</ul>
            <dl>
              <Dato k="Altura máxima / plano límite" v={`${e.alturaMaxima.toLocaleString("es-AR")} m / ${e.planoLimite.toLocaleString("es-AR")} m`} />
              <Dato k="m² construibles" v={m2(e.m2Construibles)} />
              <Dato k="m² vendibles (80 %)" v={m2(e.m2Vendibles)} />
            </dl>
            <p className="mt-2 text-xs text-zinc-500">Envolvente oficial del Código Urbanístico (Ciudad 3D, GCBA). Sin balcones.</p>
          </>
        ) : (
          <dl>
            <Dato k="m² construibles (rango)" v={e.rango ? `${m2(e.rango.piso)} a ${m2(e.rango.techo)}` : "sin dato"} />
            <Dato k="m² vendibles (80 %)" v={e.rango ? `${m2(e.rango.piso * 0.8)} a ${m2(e.rango.techo * 0.8)}` : "sin dato"} />
          </dl>
        )}
        {p.avisos.filter((a) => !a.fuerte).map((a) => <p key={a.clave} className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">{a.texto}</p>)}
      </Bloque>

      <Bloque titulo="Cuánto vale la tierra">
        {p.tierra ? (
          <>
            <dl>
              <Dato k="Valor del lote (rango)" v={`${usd(p.tierra.valorLote.desde)} a ${usd(p.tierra.valorLote.hasta)}`} />
              <Dato k="Valor del lote (mediana)" v={usd(p.tierra.valorLote.mediana)} />
              <Dato k="USD por m² de tierra" v={`${p.tierra.usdM2Mediana.toLocaleString("es-AR")} (${p.tierra.usdM2P25.toLocaleString("es-AR")} a ${p.tierra.usdM2P75.toLocaleString("es-AR")})`} />
            </dl>
            <p className="mt-2 mb-1 text-xs text-zinc-500">{p.tierra.comparables.length} terrenos en venta a menos de 800 m:</p>
            <ul className="space-y-1 text-xs">
              {p.tierra.comparables.slice(0, 12).map((c) => (
                <li key={c.id} className="flex justify-between gap-2">
                  <a href={c.url} target="_blank" rel="noreferrer" className="truncate underline">{c.direccion || c.titulo || "Terreno"}</a>
                  <span className="shrink-0 text-zinc-600 dark:text-zinc-400">{usd(c.precioUsd)} · {m2(c.superficieM2)} · {c.distanciaM} m</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Sin comparables suficientes: hacen falta al menos 5 terrenos en venta a menos de 800 m.</p>
        )}
      </Bloque>

      <p className="text-xs leading-relaxed text-zinc-500">{LEYENDA}{p.fuentes.curPublicado ? ` Código Urbanístico por parcela publicado por el GCBA el ${new Date(p.fuentes.curPublicado).toLocaleDateString("es-AR")}.` : ""}</p>
    </div>
  );
}
```

- [ ] **Step 6: Mis prefactibilidades**

```tsx
// app/asesor/prefactibilidad/components/mis-prefactibilidades.tsx
"use client";

import { useEffect, useState } from "react";

export interface Guardada { id: string; direccion: string; smp: string; modo: "oficial" | "regla"; token: string | null; creado_en: string; cur_publicado: string | null }

export function MisPrefactibilidades({ onAbrir, recargar }: { onAbrir: (id: string) => void; recargar: number }) {
  const [lista, setLista] = useState<Guardada[]>([]);
  const [publicadoActual, setPublicadoActual] = useState<string | null>(null);
  useEffect(() => { fetch("/api/prefactibilidad").then((r) => r.json()).then((j) => { setLista(j.prefactibilidades || []); setPublicadoActual(j.cur_publicado_actual ?? null); }).catch(() => setLista([])); }, [recargar]);
  const vieja = (g: Guardada) => Boolean(publicadoActual && g.cur_publicado && g.cur_publicado < publicadoActual);
  if (lista.length === 0) return <p className="text-sm text-zinc-500">Todavía no guardaste ninguna.</p>;
  return (
    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {lista.map((g) => (
        <li key={g.id}>
          <button type="button" onClick={() => onAbrir(g.id)} className="flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800">
            <span className="truncate">{g.direccion}</span>
            <span className="shrink-0 text-xs text-zinc-500">{new Date(g.creado_en).toLocaleDateString("es-AR")}{g.token ? " · compartida" : ""}{g.modo === "regla" ? " · rango" : ""}{vieja(g) ? " · hay Código nuevo, recalcular" : ""}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 7: El módulo**

```tsx
// app/asesor/prefactibilidad/components/prefactibilidad-module.tsx
"use client";
// Prefactibilidad · dirección → lote oficial en el mapa → qué se puede construir y cuánto vale
// la tierra. Spec: docs/superpowers/specs/2026-09-12-prefactibilidad-design.md.
import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { BuscadorDireccion } from "./buscador-direccion";
import { FichaLote } from "./ficha-lote";
import { MisPrefactibilidades } from "./mis-prefactibilidades";
import type { DireccionUsig } from "@/lib/prefactibilidad/gcba";
import type { Prefactibilidad } from "@/lib/prefactibilidad/tipos";

const MapaParcela = dynamic(() => import("./mapa-parcela"), { ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-zinc-100 dark:bg-zinc-800" /> });

export function PrefactibilidadModule({ esDirector = false }: { esDirector?: boolean }) {
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [p, setP] = useState<Prefactibilidad | null>(null);
  const [idGuardada, setIdGuardada] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recargar, setRecargar] = useState(0);

  const analizar = useCallback(async (d: DireccionUsig) => {
    setPin({ lat: d.lat, lng: d.lng }); setP(null); setIdGuardada(null); setLink(null); setError(null); setCargando(true);
    try {
      const r = await fetch("/api/prefactibilidad/analizar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ calle: d.calle, altura: d.altura, direccion: d.direccion }) });
      const j = await r.json();
      if (!r.ok) { setError(j.error || "No se pudo analizar."); return; }
      setP(j.prefactibilidad);
    } catch { setError("No se pudo analizar."); } finally { setCargando(false); }
  }, []);

  // Devuelve el id: el estado de React no se actualiza dentro del mismo tick, así que quien lo
  // llame no puede leer `idGuardada` recién seteado.
  const guardar = async (): Promise<string | null> => {
    if (!p) return null;
    const r = await fetch("/api/prefactibilidad", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ smp: p.smp, direccion: p.direccion }) });
    const j = await r.json();
    if (!r.ok) { setError(j.error || "No se pudo guardar."); return null; }
    setIdGuardada(j.id); setRecargar((n) => n + 1);
    return j.id as string;
  };
  const compartir = async () => {
    const id = idGuardada ?? (await guardar());
    if (!id) return;
    const r = await fetch(`/api/prefactibilidad/${id}/compartir`, { method: "POST" });
    const j = await r.json();
    if (r.ok) setLink(`${window.location.origin}${j.path}`); else setError(j.error || "No se pudo compartir.");
  };
  const abrir = async (id: string) => {
    const r = await fetch(`/api/prefactibilidad/${id}`);
    const j = await r.json();
    if (!r.ok) { setError(j.error); return; }
    setP(j.prefactibilidad); setIdGuardada(id); setLink(j.token ? `${window.location.origin}/prefactibilidad/${j.token}` : null);
    setPin({ lat: j.prefactibilidad.lote.centroide[1], lng: j.prefactibilidad.lote.centroide[0] });
  };

  return (
    <div className="flex h-full flex-col gap-4 p-4 pt-6 md:p-8">
      <header>
        <h1 className="text-2xl font-semibold">Prefactibilidad</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Escribí una dirección de la Ciudad de Buenos Aires: el mapa marca el lote oficial y la ficha dice cuánto se puede construir y cuánto vale la tierra.</p>
      </header>
      <BuscadorDireccion onElegir={analizar} deshabilitado={cargando} />
      {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">{error}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="relative isolate h-[45dvh] overflow-hidden rounded-xl border border-zinc-200 lg:h-[calc(100dvh-16rem)] lg:min-h-[520px] dark:border-zinc-800">
          <MapaParcela pin={pin} lote={p?.geomLote ?? null} huella={p?.edificabilidad.huella ?? null} manzana={p?.geomManzana ?? null} />
        </div>
        <div className="space-y-4">
          {cargando && <p className="text-sm text-zinc-500">Consultando el catastro de la Ciudad…</p>}
          {p && (
            <>
              <FichaLote p={p} />
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={guardar} disabled={Boolean(idGuardada)} className="min-h-11 rounded-lg border border-zinc-300 px-4 text-sm font-medium disabled:opacity-60 dark:border-zinc-700">{idGuardada ? "Guardada" : "Guardar"}</button>
                <button type="button" onClick={compartir} className="min-h-11 rounded-lg bg-[#8d5c2a] px-4 text-sm font-semibold text-white dark:bg-[#c48a4f] dark:text-zinc-950">Compartir ficha</button>
              </div>
              {link && (
                <div className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                  <p className="mb-1 text-zinc-600 dark:text-zinc-400">Link para el dueño del lote:</p>
                  <code className="block break-all">{link}</code>
                </div>
              )}
            </>
          )}
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">{esDirector ? "Prefactibilidades de la agencia" : "Mis prefactibilidades"}</h2>
            <MisPrefactibilidades onAbrir={abrir} recargar={recargar} />
          </section>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Probar en el navegador** — `npm run dev -- -p 3012` en el worktree (el 3007 es de otra terminal; nunca matar un `next dev` ajeno). Entrar con PRISMAIA - VAKDOR. Escritorio y celular (emulación 390 px):
  - Escribir **tecla por tecla** "Roosevelt 45" y ver el desplegable; elegir 4554: pin, contorno cobre y huella; ficha con 6 niveles y ~261 m².
  - "Av. Cabildo 2040": aviso fuerte arriba (dos alturas), CM y CA.
  - "Zuviría 3939": aviso de manzana atípica.
  - Dirección de provincia ("Mitre 100, San Isidro"): "Por ahora solo Ciudad de Buenos Aires".
  - Número inexistente: mensaje "No encontramos ese número…".
  - Guardar → aparece en la lista; Compartir → link.
  - Medir contraste de lo nuevo en los dos temas (script de la sesión del 8-sep). Los botones miden ≥ 44 px de alto.

- [ ] **Step 9: Commit**

```bash
git add lib/prefactibilidad/leaflet.ts lib/prefactibilidad/leaflet.test.ts app/asesor/prefactibilidad/components
git commit -m "feat(prefactibilidad): la pantalla — buscador oficial, lote en el mapa, ficha, guardar y compartir"
```

---

### Task 17: La ficha pública imprimible

**Files:**
- Create: `app/prefactibilidad/[token]/page.tsx`
- Create: `app/prefactibilidad/[token]/PrintButton.tsx` (copiar `app/ficha-acm/[token]/PrintButton.tsx` cambiando el título del share por "Prefactibilidad")
- Modify: `lib/prefactibilidad/criollo.ts` (agrega `export const LEYENDA`), `app/asesor/prefactibilidad/components/ficha-lote.tsx` (importa `LEYENDA` de criollo y la re-exporta)
- Test: `lib/prefactibilidad/ficha-publica.test.ts` (guardia de texto: leyenda, `robots noindex`, `@media print`, sin sesión)

**Interfaces:**
- Consumes: `createAdminClient`, `planoSvg`, `describirUnidad`, `describirPlanta`, `m2`, `usd`, `requiereEstudio`, `LEYENDA` (se MUEVE a `lib/prefactibilidad/criollo.ts` en esta tarea; `ficha-lote.tsx` la importa desde ahí y la re-exporta), `logoParaDestino` (`@/lib/marketing-ia/logo-variante`), `agencies.marketing_ai_config` (brand_colors, logo, legal_notice) y `profiles` del autor.

- [ ] **Step 1: Test que falla**

```ts
// lib/prefactibilidad/ficha-publica.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const src = readFileSync(path.resolve(__dirname, "../../app/prefactibilidad/[token]/page.tsx"), "utf8");

describe("la ficha pública de prefactibilidad", () => {
  it("lee por token con el cliente admin y no indexa", () => {
    expect(src).toContain('from("prefactibilidades")');
    expect(src).toContain('.eq("token", ');
    expect(src).toContain("createAdminClient");
    expect(src).toContain("robots: { index: false, follow: false }");
    expect(src).toContain('export const dynamic = "force-dynamic"');
  });
  it("lleva la leyenda y las reglas de impresión", () => {
    expect(src).toContain("LEYENDA");
    expect(src).toContain("@media print");
    expect(src).toContain("@page { size: A4; margin: 0; }");
  });
  it("el plano es un SVG generado, no una captura", () => {
    expect(src).toContain("planoSvg(");
  });
});
```

- [ ] **Step 2: Correr → FAIL.**

- [ ] **Step 3: La página** (estructura; el CSS de impresión se copia del bloque `@media print` de `app/ficha-acm/[token]/page.tsx` líneas 937-954 reemplazando `.acm-root` por `.pref-root` y `.sheet` por `.hoja`)

```tsx
// app/prefactibilidad/[token]/page.tsx
// Ficha pública de una prefactibilidad: snapshot congelado, leído SOLO por token con el cliente
// admin (molde: app/ficha-acm/[token]/page.tsx). Sin sesión, sin índice de buscadores.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { logoParaDestino } from "@/lib/marketing-ia/logo-variante";
import { planoSvg } from "@/lib/prefactibilidad/plano-svg";
import { describirPlanta, describirUnidad, m2, usd } from "@/lib/prefactibilidad/criollo";
import { requiereEstudio } from "@/lib/prefactibilidad/avisos";
import { LEYENDA } from "@/lib/prefactibilidad/criollo"; // vive en lib: un export de un módulo "use client" llega al servidor como referencia, no como string
import type { Prefactibilidad } from "@/lib/prefactibilidad/tipos";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";
const DEFAULT_COLORS = ["#0a1f33", "#c8a061", "#f4f1ea"];

async function cargar(token: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("prefactibilidades").select("resultado, agency_id, user_id, creado_en").eq("token", token).maybeSingle();
  if (!data) return null;
  const [{ data: agencia }, { data: autor }] = await Promise.all([
    admin.from("agencies").select("name, marketing_ai_config").eq("id", data.agency_id).single(),
    admin.from("profiles").select("full_name, email, phone").eq("id", data.user_id).single(),
  ]);
  const mk = (agencia?.marketing_ai_config as any) || {};
  return { p: data.resultado as Prefactibilidad, creado: data.creado_en as string, agencia: agencia?.name || "Inmobiliaria", autor, brand: { colors: Array.isArray(mk.brand_colors) && mk.brand_colors.length ? mk.brand_colors : DEFAULT_COLORS, logo: logoParaDestino(mk, "ficha_acm"), legal: typeof mk.legal_notice === "string" ? mk.legal_notice : "" } };
}

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const d = await cargar(params.token);
  return { title: d ? `Prefactibilidad · ${d.p.direccion}` : "Prefactibilidad", robots: { index: false, follow: false } };
}

export default async function FichaPrefactibilidad({ params }: { params: { token: string } }) {
  const d = await cargar(params.token);
  if (!d) notFound();
  try { await createAdminClient().rpc("increment_prefactibilidad_view", { p_token: params.token }); } catch { /* noop */ }
  const { p, brand, agencia, autor } = d;
  const e = p.edificabilidad;
  const primary = brand.colors[0], accent = brand.colors[1] || brand.colors[0];
  const fuerte = requiereEstudio(p.avisos);
  const svg = planoSvg({ lote: p.geomLote, huella: e.huella, manzana: p.geomManzana, colorLote: accent, colorHuella: accent, ancho: 700, alto: 420 });
  return (
    <div className="pref-root" style={{ ["--primary" as any]: primary, ["--accent" as any]: accent }}>
      <style>{CSS}</style>
      <article className="hoja">
        <header className="cabecera">
          {brand.logo ? <img src={`/api/brand-logo?url=${encodeURIComponent(brand.logo)}`} alt={agencia} className="logo" /> : <strong>{agencia}</strong>}
          <div><h1>Prefactibilidad</h1><p className="dir">{p.direccion}</p><p className="sub">Parcela {p.smp.toUpperCase()} · {p.cur?.barrio ?? ""}</p></div>
        </header>
        {fuerte && <p className="aviso"><strong>Requiere estudio profesional.</strong> {p.avisos.filter((a) => a.fuerte).map((a) => a.texto).join(" ")}</p>}
        <div className="plano" dangerouslySetInnerHTML={{ __html: svg }} />
        <section><h2>El lote</h2><dl>
          <div><dt>Superficie</dt><dd>{p.lote.superficieTotal != null ? m2(p.lote.superficieTotal) : "sin dato"}</dd></div>
          <div><dt>Frente × fondo</dt><dd>{p.lote.frente != null && p.lote.fondo != null ? `${p.lote.frente} × ${p.lote.fondo} m` : "sin dato"}</dd></div>
          <div><dt>Construido hoy</dt><dd>{p.lote.pisosSobreRasante ?? "?"} pisos{p.lote.propiedadHorizontal ? " · PH" : ""}</dd></div>
        </dl></section>
        <section><h2>Qué se puede construir</h2>
          {e.unidades.map((u) => <p key={u}>{describirUnidad(u)}</p>)}
          {e.modo === "oficial" ? (<><ul>{e.plantas.map((pl, i) => <li key={i}>{describirPlanta(pl)}</li>)}</ul>
            <dl><div><dt>m² construibles</dt><dd>{m2(e.m2Construibles)}</dd></div><div><dt>m² vendibles (80 %)</dt><dd>{m2(e.m2Vendibles)}</dd></div><div><dt>Altura máxima / plano límite</dt><dd>{e.alturaMaxima} m / {e.planoLimite} m</dd></div></dl></>)
            : (<dl><div><dt>m² construibles (rango)</dt><dd>{e.rango ? `${m2(e.rango.piso)} a ${m2(e.rango.techo)}` : "sin dato"}</dd></div></dl>)}
        </section>
        <section><h2>Cuánto vale la tierra</h2>
          {p.tierra ? (<><dl><div><dt>Valor del lote</dt><dd>{usd(p.tierra.valorLote.desde)} a {usd(p.tierra.valorLote.hasta)} (mediana {usd(p.tierra.valorLote.mediana)})</dd></div><div><dt>USD por m² de tierra</dt><dd>{p.tierra.usdM2Mediana.toLocaleString("es-AR")}</dd></div></dl>
            <p className="chico">{p.tierra.comparables.length} terrenos en venta a menos de 800 m, publicados hoy en la red.</p></>) : <p>Sin comparables suficientes en la zona.</p>}
        </section>
        <footer>
          <p className="contacto">{autor?.full_name}{autor?.phone ? ` · ${autor.phone}` : ""}{autor?.email ? ` · ${autor.email}` : ""} · {agencia}</p>
          <p className="leyenda">{LEYENDA}{p.fuentes.curPublicado ? ` Código Urbanístico por parcela publicado por el GCBA el ${new Date(p.fuentes.curPublicado).toLocaleDateString("es-AR")}.` : ""} {brand.legal}</p>
        </footer>
      </article>
      <PrintButton accent={accent} onAccent="#111111" fileName={`Prefactibilidad - ${p.direccion}`} />
    </div>
  );
}

const CSS = `
.pref-root { min-height: 100vh; background: #f4f4f5; padding: 24px 8px; font-family: ui-sans-serif, system-ui, sans-serif; color: #18181b; }
.hoja { width: 210mm; max-width: 100%; margin: 0 auto; background: #fff; padding: 18mm 16mm; box-shadow: 0 2px 16px rgba(0,0,0,.08); }
.cabecera { display: flex; align-items: center; gap: 16px; border-bottom: 3px solid var(--accent); padding-bottom: 12px; margin-bottom: 16px; }
.logo { height: 48px; width: auto; }
h1 { margin: 0; font-size: 22px; color: var(--primary); } .dir { margin: 2px 0 0; font-size: 18px; font-weight: 600; } .sub { margin: 0; font-size: 12px; color: #52525b; }
h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: var(--primary); margin: 18px 0 8px; }
dl { margin: 0; } dl div { display: flex; justify-content: space-between; gap: 12px; padding: 4px 0; border-bottom: 1px solid #f4f4f5; font-size: 14px; } dt { color: #52525b; } dd { margin: 0; font-weight: 600; }
.plano { margin: 8px 0 4px; } .plano svg { width: 100%; height: auto; display: block; }
.aviso { background: #fffbeb; border: 1px solid #f59e0b; color: #78350f; padding: 10px 12px; border-radius: 8px; font-size: 14px; }
.chico { font-size: 12px; color: #52525b; } .contacto { font-size: 13px; font-weight: 600; margin-top: 20px; } .leyenda { font-size: 11px; color: #52525b; line-height: 1.5; }
@media print {
  @page { size: A4; margin: 0; }
  html, body { background: #ffffff !important; }
  body > *:not(.pref-root) { display: none !important; }
  #nprogress, [data-sonner-toaster], next-route-announcer { display: none !important; }
  .pref-root { background: #ffffff !important; padding: 0 !important; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  .no-print { display: none !important; }
  .hoja { width: 210mm; min-height: 297mm; margin: 0; box-shadow: none !important; page-break-after: auto; }
}
`;
```

- [ ] **Step 4: Correr → PASS.** Probar en el navegador: abrir el link sin sesión (ventana privada), imprimir a PDF y comprobar que el plano sale entero en una hoja y que un token inventado da 404.

- [ ] **Step 5: Commit**

```bash
git add app/prefactibilidad lib/prefactibilidad/ficha-publica.test.ts
git commit -m "feat(prefactibilidad): ficha pública imprimible con el plano del lote y la leyenda"
```

---

### Task 18: Validación con 20 parcelas y evidencia

**Files:**
- Create: `scripts/gcba/validar-20-parcelas.mts` (corre con `tsx`: los módulos de `lib/prefactibilidad` se importan entre sí sin extensión y Node solo no los resuelve)
- Modify: `package.json` (devDependency `tsx`)
- Create: `docs/superpowers/specs/evidencia/prefactibilidad/2026-09-XX-validacion-20-parcelas.md` (lo escribe el script)

- [ ] **Step 1: El script** — para cada parcela de la lista (las 5 de los fixtures más 15 típicas elegidas del CSV con `tipo_mza=TIPICA`, `uni_edif_2=0`, sin área especial, no esquina; repartidas en las 7 unidades), pide al GCBA en vivo (Task 11), calcula con `calcularEdificabilidadOficial`, y baja la página de TodoProps `https://www.todoprops.com/terrenos/caba/parcela/<SMP>` leyendo con una expresión regular "Superficie edificable por planta" y "pisos de tejido". Escribe una tabla Markdown: `smp | unidad | m²/planta nuestro | m²/planta TodoProps | diferencia % | niveles nuestro | niveles TodoProps | regla del cuarto m² | resultado`.

```js
// scripts/gcba/validar-20-parcelas.mts
//   npx tsx scripts/gcba/validar-20-parcelas.mts   (npm i -D tsx una vez)
// Escribe docs/superpowers/specs/evidencia/prefactibilidad/<fecha>-validacion-20-parcelas.md.
// Sale con código 1 si alguna parcela en modo oficial difiere más de 5 % de TodoProps en m²/planta.
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
import { crearClienteGcba } from "../../lib/prefactibilidad/gcba.ts";
import { calcularEdificabilidadOficial } from "../../lib/prefactibilidad/envolvente.ts";
import { huellaPorRegla } from "../../lib/prefactibilidad/lfi-regla.ts";
import { bboxDe } from "../../lib/prefactibilidad/geo.ts";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PARCELAS = ["053-050-006", "048-026-005", "042-074-028", "051-098-009", "042-077A-007", "056-068-040B", "039-097-008B",
  "063-133-008", "048-134-014d", "051-102-016a", "053-045-008", "051-113-024a", "045-075-024g", "029-022-023", "063-037-025", "017-061-025", "053-036-016", "051-040-014", "023-082-008", "036-059-032"];
const TOLERANCIA = 0.05;
const gcba = crearClienteGcba();
const filas = []; let fallas = 0;

for (const smp of PARCELAS) {
  const lote = await gcba.geometriaLote(smp); const manzana = await gcba.geometriaManzana(smp.slice(0, smp.lastIndexOf("-")));
  if (!lote) { filas.push(`| ${smp} | — | sin lote en catastro |`); continue; }
  const vol = await gcba.volumenes(smp, bboxDe(lote));
  const e = calcularEdificabilidadOficial(vol, lote);
  const cuerpo = e?.plantas.find((p) => !p.nombre.startsWith("Basamento") && !p.nombre.includes("retirado"));
  const html = await fetch(`https://www.todoprops.com/terrenos/caba/parcela/${smp.toLowerCase()}`, { headers: { "User-Agent": "Mozilla/5.0" } }).then((r) => r.ok ? r.text() : "").catch(() => "");
  const tpM2 = Number((html.match(/edificable por planta[^0-9]*([\d.]+)\s*m²/i)?.[1] || "").replace(/\./g, "")) || null;
  const tpNiv = Number(html.match(/(\d+)\s*pisos de tejido/i)?.[1]) || null;
  const regla = e && manzana ? huellaPorRegla(lote, manzana, e.unidades[0]).m2 : null;
  const dif = cuerpo && tpM2 ? (cuerpo.m2PorNivel - tpM2) / tpM2 : null;
  const ok = e ? (dif === null || Math.abs(dif) <= TOLERANCIA) : true;
  if (!ok) fallas++;
  filas.push(`| ${smp} | ${e?.unidades.join("+") ?? "sin envolvente"} | ${cuerpo ? cuerpo.m2PorNivel.toFixed(0) : "—"} | ${tpM2 ?? "—"} | ${dif === null ? "—" : (dif * 100).toFixed(1) + " %"} | ${cuerpo ? cuerpo.niveles - 1 : "—"} | ${tpNiv ?? "—"} | ${regla ? regla.toFixed(0) : "—"} | ${ok ? "OK" : "FALLA"} |`);
  console.log(filas.at(-1));
}
const fecha = new Date().toISOString().slice(0, 10);
const dir = path.join(RAIZ, "docs/superpowers/specs/evidencia/prefactibilidad"); fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, `${fecha}-validacion-20-parcelas.md`), `# Validación de la envolvente oficial contra TodoProps — ${fecha}\n\nTolerancia ±5 % en m² por planta (spec). "pisos de tejido" de TodoProps = niveles sobre PB.\n\n| SMP | Unidad | m²/planta PRISMA | m²/planta TodoProps | Dif. | Pisos PRISMA | Pisos TodoProps | Regla ¼ (m²) | Resultado |\n|---|---|---|---|---|---|---|---|---|\n${filas.join("\n")}\n\nFallas: ${fallas}.\n`);
console.log(fallas ? `\nX ${fallas} parcelas fuera de tolerancia. NO habilitar el menú.` : "\nOK: las 20 dentro de tolerancia.");
process.exit(fallas ? 1 : 0);
```

- [ ] **Step 2: Correr** — `npm i -D tsx` (una vez) y `npx tsx scripts/gcba/validar-20-parcelas.mts`. Expected: `OK: las 20 dentro de tolerancia`. Si alguna falla, investigar (¿tesela partida sin unir? ¿lote de epok distinto al de TodoProps?), arreglar con test de regresión, volver a correr. **Si no se llega a 0 fallas, no se habilita el menú** (la Task 15 se revierte con `git revert` del commit del menú).

- [ ] **Step 3: Commit**

```bash
git add scripts/gcba/validar-20-parcelas.mts package.json package-lock.json docs/superpowers/specs/evidencia/prefactibilidad
git commit -m "test(prefactibilidad): validación de 20 parcelas contra TodoProps, con la evidencia"
```

---

### Task 19: Producción, pruebas finales y documentación

- [ ] **Step 1: Pedir el OK** a Leonardo para: (a) aplicar las dos migraciones (Task 9) con `node scripts/sql-produccion.mjs`, (b) correr `cargar-codigo-urbanistico.mjs` y `cargar-puertas.mjs` contra producción. Mostrar el `--dry` de cada uno antes.
- [ ] **Step 2: Con el OK**, aplicar y cargar; correr `--verificar` en los dos; guardar la salida en la bitácora.
- [ ] **Step 3: Pruebas en el navegador** contra el dev server del worktree con las tablas ya cargadas (repetir la lista de la Task 16 Step 8 y la Task 17 Step 4). RLS: entrar como director y como asesor de PRISMAIA - VAKDOR (nunca como asesor de Central); el asesor no ve las del director; token inventado → 404.
- [ ] **Step 4: Docs**
  - `docs/interno/bitacora-sesiones.md`: entrada del día arriba (qué se construyó, la adenda de la envolvente oficial, el resultado de las 20 parcelas, qué quedó).
  - `docs/compartible/estandarizada/FUNCIONAL-ASESOR-PRISMA.md`: sección "Prefactibilidad" después de la del ACM, con el tono de la guía (voseo, negritas, callouts), sin tecnicismos: qué es, cómo se usa en 3 pasos, qué significa cada bloque, el aviso de estudio profesional, cómo compartir.
  - `docs/compartible/estandarizada/FUNCIONAL-DIRECTOR-PRISMA.md`: dos párrafos (ve todas las de la agencia).
- [ ] **Step 5: Correr todo** — `npm test` verde; `npm run lint` sin errores nuevos.
- [ ] **Step 6: Commit de docs y OK de Leonardo para el merge** (flujo clásico: `git fetch origin && git merge origin/main --no-edit` en la rama, tests sobre lo mezclado, `git merge-base --is-ancestor origin/main HEAD`, y `git push origin HEAD:main` solo con su OK).

```bash
git add docs/interno/bitacora-sesiones.md docs/compartible/estandarizada/FUNCIONAL-ASESOR-PRISMA.md docs/compartible/estandarizada/FUNCIONAL-DIRECTOR-PRISMA.md
git commit -m "docs(prefactibilidad): bitácora y guías funcionales"
```
