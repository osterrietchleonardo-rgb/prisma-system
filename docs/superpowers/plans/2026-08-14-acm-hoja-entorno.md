# Hoja "La propiedad y su entorno" del ACM · Plan de implementación

> **Para quien lo ejecute:** SUB-SKILL OBLIGATORIA: usar `superpowers:subagent-driven-development`
> (recomendada) o `superpowers:executing-plans` para implementar tarea por tarea. Los pasos usan
> casillas (`- [ ]`) para llevar la cuenta.

**Objetivo:** agregar a la ficha pública del ACM una hoja A4 entre la portada y los comparables, con
un relato del barrio escrito por IA a partir de datos abiertos del gobierno, los datos duros
calculados al lado y un mapa con los marcadores.

**Arquitectura:** los datasets del gobierno se cargan **una vez** a dos tablas PostGIS
(`zona_barrios`, `zona_pois`) con un script que se corre a mano. Al crear la ficha, una sola función
SQL (`zona_resumen`) devuelve el barrio y los puntos de interés cercanos; fuera de CABA el respaldo es
Overpass/OpenStreetMap en vivo. Un párrafo de Gemini narra esos datos, el asesor lo revisa y lo edita
antes de confirmar, y todo queda congelado en el snapshot de la ficha.

**Stack:** Next.js 14 (App Router), Supabase + PostGIS 3.3.7, `@google/generative-ai`
(`gemini-3.5-flash`), `papaparse`, `sharp`, `vitest`.

**Especificación:** `docs/superpowers/specs/2026-08-13-acm-hoja-entorno-datos-abiertos-design.md`

## Restricciones globales

Valen para **todas** las tareas:

- **Rama y worktree:** el trabajo va en `feat/acm-hoja-entorno`, worktree
  `C:/Users/LENOVO/Desktop/CODE/prisma-wt-acm-entorno`. Todos los comandos se corren parados ahí.
- **La ficha NO nombra ninguna fuente de datos.** Ni "GCBA", ni "datos abiertos", ni "OpenStreetMap",
  ni nombres de organismos, en ningún texto visible. Única excepción: el crédito `© OpenStreetMap`
  dibujado dentro de la imagen del mapa, que es condición de la licencia.
- **La hoja de una propiedad de GBA se ve idéntica a la de CABA.** Que la fuente cambie queda en el
  snapshot (`fuente: "gcba" | "osm"`) solo para auditar; el cliente no lo ve.
- **La IA no produce ningún número.** Todos los nombres, distancias y conteos salen de la base o de
  Overpass. La IA solo los narra.
- **`zona` es opcional en el snapshot.** Las fichas ya creadas no lo tienen y tienen que seguir
  abriendo igual. Nunca acceder sin verificar.
- **Nunca bloquear la creación de la ficha.** Si algo de la zona falla (Georef, Overpass, Gemini, el
  mapa), la hoja no se genera y la ficha sale como hoy.
- **Idioma:** todo el código, comentarios y mensajes en español. Los comentarios explican *por qué*,
  no *qué*.
- **Tests:** `npx vitest run <archivo>` para uno solo; `npm test` corre todo.
- **Commits:** uno por tarea, al final, con los archivos listados explícitamente (nunca `git add -A`:
  el repo tiene worktrees en paralelo y muchos archivos sueltos en `scratch/`).

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `lib/acm/zona-formato.ts` | **nuevo** · funciones puras: metros → cuadras / minutos / texto legible |
| `lib/acm/zona-formato.test.ts` | **nuevo** · tests de lo anterior |
| `lib/acm/ficha.ts` | **editar** · sumar los tipos `FichaZona` y `FichaZonaPoi` y el campo `zona?` |
| `supabase/migrations/20260814100000_zona_pois.sql` | **nuevo** · las dos tablas, índices y RLS |
| `supabase/migrations/20260814100050_lower_norm.sql` | **nuevo** · `lower_norm()`, para el control de calidad de la carga |
| `supabase/migrations/20260814100100_zona_resumen.sql` | **nuevo** · `cercano()` y `zona_resumen()` |
| `scripts/cargar-zona-pois.mjs` | **nuevo** · baja los datasets y los carga, con control de calidad |
| `lib/acm/zona.ts` | **nuevo** · geocodificar, resolver el barrio, pedir el resumen, armar `FichaZona` |
| `lib/acm/zona.test.ts` | **nuevo** · tests del armado y de los mapeos |
| `lib/acm/zona-overpass.ts` | **nuevo** · el respaldo fuera de CABA |
| `lib/acm/zona-relato.ts` | **nuevo** · el prompt y la llamada a Gemini |
| `lib/acm/zona-relato.test.ts` | **nuevo** · tests del prompt y del saneado |
| `app/api/acm/mapa-zona/route.ts` | **nuevo** · arma el PNG de tiles + marcadores |
| `app/api/acm/ficha/route.ts` | **editar** · calcular la zona en `preview`, guardarla al confirmar |
| `app/asesor/acm/components/revision-zona.tsx` | **nuevo** · el bloque de revisión del asesor |
| `app/asesor/acm/components/comparables-result.tsx` | **editar** · estado y montaje del bloque |
| `app/ficha-acm/[token]/page.tsx` | **editar** · la hoja nueva; sacar la descripción de la portada |

`comparables-result.tsx` ya tiene **870 líneas**. El bloque de revisión va en un componente aparte
(`revision-zona.tsx`) a propósito: sumarle ~120 líneas más lo volvería inmanejable.

---

## Tarea 1 · Formateo de distancias (funciones puras)

**Por qué primero:** no depende de nada, y todo lo demás la usa. Es la única lógica de la feature que
se puede probar sin base, sin red y sin IA.

**Archivos:**
- Crear: `lib/acm/zona-formato.ts`
- Test: `lib/acm/zona-formato.test.ts`

**Interfaces:**
- Consume: nada.
- Produce: `metrosLegible(m)`, `minutosCaminando(m)`, `cuadras(m)`, `cuadrasEnPalabras(m)` — usadas
  por las tareas 5, 7 y 11.

- [ ] **Paso 1: escribir el test que falla**

```ts
// lib/acm/zona-formato.test.ts
import { describe, it, expect } from "vitest";
import { metrosLegible, minutosCaminando, cuadras, cuadrasEnPalabras } from "./zona-formato";

describe("metrosLegible", () => {
  it("muestra metros redondeados a la decena por debajo del kilómetro", () => {
    expect(metrosLegible(547)).toBe("550 m");
    expect(metrosLegible(94)).toBe("90 m");
  });

  it("pasa a kilómetros con un decimal desde 1000 m", () => {
    expect(metrosLegible(1234)).toBe("1,2 km");
    expect(metrosLegible(3000)).toBe("3 km");
  });

  it("usa coma decimal, no punto (es-AR)", () => {
    expect(metrosLegible(1550)).toBe("1,6 km");
  });

  it("devuelve cadena vacía si no hay dato", () => {
    expect(metrosLegible(null)).toBe("");
  });
});

describe("minutosCaminando", () => {
  it("calcula a 75 m por minuto y nunca devuelve menos de 1", () => {
    expect(minutosCaminando(750)).toBe(10);
    expect(minutosCaminando(20)).toBe(1);
  });

  it("devuelve null si no hay dato", () => {
    expect(minutosCaminando(null)).toBe(null);
  });
});

describe("cuadras", () => {
  it("cuenta a 100 m por cuadra", () => {
    expect(cuadras(400)).toBe(4);
    expect(cuadras(447)).toBe(4);
    expect(cuadras(460)).toBe(5);
  });

  it("nunca devuelve cero: menos de media cuadra sigue siendo una cuadra", () => {
    expect(cuadras(30)).toBe(1);
  });
});

describe("cuadrasEnPalabras", () => {
  it("escribe el número en letras hasta doce, que es lo que se camina", () => {
    expect(cuadrasEnPalabras(400)).toBe("cuatro cuadras");
    expect(cuadrasEnPalabras(100)).toBe("una cuadra");
  });

  it("de trece en adelante usa el número, porque en letras se vuelve ilegible", () => {
    expect(cuadrasEnPalabras(1500)).toBe("15 cuadras");
  });

  it("devuelve cadena vacía si no hay dato", () => {
    expect(cuadrasEnPalabras(null)).toBe("");
  });
});
```

- [ ] **Paso 2: correr el test y ver que falla**

```bash
npx vitest run lib/acm/zona-formato.test.ts
```

Esperado: FAIL — `Failed to resolve import "./zona-formato"`.

- [ ] **Paso 3: escribir la implementación mínima**

```ts
// lib/acm/zona-formato.ts
// ACM · Hoja del entorno: cómo se dice una distancia.
// Existe aparte porque lo usan tres lugares con criterios distintos: la columna de datos duros
// (metros exactos), el prompt de la IA (cuadras, que es como habla la gente) y el mapa.

/** A cuánto camina una persona: 4,5 km/h ≈ 75 m por minuto. */
const METROS_POR_MINUTO = 75;
/** Una cuadra de CABA. */
const METROS_POR_CUADRA = 100;

const NUMEROS = [
  "", "una", "dos", "tres", "cuatro", "cinco", "seis",
  "siete", "ocho", "nueve", "diez", "once", "doce",
];

/** "550 m" · "1,2 km". Vacío si no hay dato. Redondeado a la decena: la precisión al metro es falsa. */
export function metrosLegible(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return "";
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  const km = Math.round(m / 100) / 10;
  return `${km.toLocaleString("es-AR")} km`;
}

/** Minutos caminando, nunca menos de 1 (decir "0 minutos" no ayuda a nadie). */
export function minutosCaminando(m: number | null | undefined): number | null {
  if (m == null || !Number.isFinite(m)) return null;
  return Math.max(1, Math.round(m / METROS_POR_MINUTO));
}

/** Cuadras, nunca cero: media cuadra sigue siendo "a una cuadra". */
export function cuadras(m: number | null | undefined): number {
  if (m == null || !Number.isFinite(m)) return 0;
  return Math.max(1, Math.round(m / METROS_POR_CUADRA));
}

/**
 * "cuatro cuadras". Es lo que se le pasa a la IA en vez de metros pelados: "a cuatro cuadras se
 * abren las Barrancas" es una frase de persona, "espacio verde a 400 metros" es una ficha catastral.
 * De trece en adelante el número escrito estorba más de lo que suma.
 */
export function cuadrasEnPalabras(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return "";
  const n = cuadras(m);
  const palabra = n <= 12 ? NUMEROS[n] : String(n);
  return `${palabra} ${n === 1 ? "cuadra" : "cuadras"}`;
}
```

- [ ] **Paso 4: correr el test y ver que pasa**

```bash
npx vitest run lib/acm/zona-formato.test.ts
```

Esperado: PASS, 11 tests.

- [ ] **Paso 5: commitear**

```bash
git add lib/acm/zona-formato.ts lib/acm/zona-formato.test.ts
git commit -m "feat(acm): formateo de distancias para la hoja del entorno"
```

---

## Tarea 2 · Los tipos en el snapshot

**Archivos:**
- Modificar: `lib/acm/ficha.ts` (agregar al final de los tipos, antes de `normalizeBarrio`)

**Interfaces:**
- Consume: nada.
- Produce: `FichaZona`, `FichaZonaPoi`, `AcmFichaSnapshot.zona` — usados por las tareas 5, 9, 10 y 11.

- [ ] **Paso 1: agregar los tipos**

En `lib/acm/ficha.ts`, justo **antes** de `export interface MercadoBarrioLite`:

```ts
// ── Hoja "La propiedad y su entorno" ─────────────────────────────────────────
// Los datos duros los calcula la base (o Overpass fuera de CABA); el relato lo escribe la IA a
// partir de ESOS datos y lo revisa el asesor. Ver lib/acm/zona.ts.

/** Categorías que muestra la hoja, en el orden en que salen impresas. */
export const CATEGORIAS_ZONA = [
  "subte", "espacio_verde", "escuela", "hospital",
  "farmacia", "parada_colectivo", "comisaria", "ecobici", "ciclovia",
] as const;
export type CategoriaZona = (typeof CATEGORIAS_ZONA)[number];

export interface FichaZonaPoi {
  categoria: CategoriaZona;
  /** "Juramento" · "12 escuelas". Ya resuelto para imprimir. */
  titulo: string;
  /** "Línea D" · "8 estatales". Vacío si la categoría no tiene detalle. */
  detalle: string;
  /** Metros al más cercano. null en las categorías que solo cuentan (farmacias). */
  metros: number | null;
  /** Cuántos hay en el radio. null en las que muestran solo el más cercano. */
  cantidad: number | null;
  /** Para el mapa. null si la categoría no se dibuja (conteos sin punto único). */
  lat: number | null;
  lon: number | null;
}

export interface FichaZona {
  barrio: string;
  comuna: number | null;
  area_km2: number | null;
  /** Espacios verdes públicos del barrio ENTERO (contexto del banner), no los del radio. */
  espacios_verdes_barrio: number | null;
  /** Interno, para auditar de dónde salieron los datos. NO se muestra en la hoja. */
  fuente: "gcba" | "osm";
  /** El texto de la IA, ya revisado y editado por el asesor. */
  relato: string;
  pois: FichaZonaPoi[];
  /** URL del PNG del mapa. null si no se pudo generar: la hoja sale sin mapa. */
  mapa_url: string | null;
}
```

Y dentro de `AcmFichaSnapshot`, después de `comparison`:

```ts
  /**
   * Ausente en toda ficha anterior a ago-2026, y ausente también cuando el asesor destildó la
   * hoja o cuando no hubo datos de zona. Nunca acceder sin verificar.
   */
  zona?: FichaZona | null;
```

- [ ] **Paso 2: verificar que TypeScript compila**

```bash
npx tsc --noEmit
```

Esperado: sin errores nuevos. (Si el proyecto ya tenía errores previos, comparar contra
`git stash && npx tsc --noEmit` para no atribuirse ajenos.)

- [ ] **Paso 3: commitear**

```bash
git add lib/acm/ficha.ts
git commit -m "feat(acm): tipos de la hoja del entorno en el snapshot"
```

---

## Tarea 3 · Las tablas y sus índices

**Archivos:**
- Crear: `supabase/migrations/20260814100000_zona_pois.sql`

**Interfaces:**
- Consume: nada.
- Produce: las tablas `zona_barrios` y `zona_pois` — usadas por las tareas 4 y 5.

**Ojo:** las migraciones del repo **no se aplican solas**. Se aplican con la Management API (ver el
paso 2). El archivo en `supabase/migrations/` es el registro; el que la ejecuta sos vos.

- [ ] **Paso 1: escribir la migración**

```sql
-- supabase/migrations/20260814100000_zona_pois.sql
-- ACM · Hoja "La propiedad y su entorno".
-- Datos abiertos del gobierno cargados UNA VEZ (scripts/cargar-zona-pois.mjs) para no bajar
-- decenas de megas cada vez que alguien crea una ficha.
-- Son datos PUBLICOS del gobierno, no de ninguna agencia: no llevan agency_id ni tenant.

create table if not exists public.zona_barrios (
  id          bigserial primary key,
  nombre      text not null,
  -- Normalizado (minúsculas, sin acentos) por el script de carga, con el MISMO criterio que
  -- normalizeBarrio() de lib/acm/ficha.ts. Sirve para el respaldo por nombre cuando Georef no
  -- encuentra la dirección y lo único que hay es lo que tipeó el asesor.
  nombre_norm text not null,
  comuna      int,
  area_km2    numeric,
  geom        geometry(MultiPolygon, 4326) not null
);

create unique index if not exists zona_barrios_nombre_norm_idx on public.zona_barrios (nombre_norm);
create index if not exists zona_barrios_geom_idx on public.zona_barrios using gist (geom);

create table if not exists public.zona_pois (
  id             bigserial primary key,
  categoria      text not null,
  -- Id del propio dataset. Junto con la categoría hace la clave del upsert: volver a correr la
  -- carga actualiza en lugar de duplicar.
  ext_id         text not null,
  nombre         text not null default '',
  -- Lo que distingue dentro de la categoría: la línea del subte, la gestión de la escuela.
  subtipo        text,
  direccion      text,
  -- El barrio que declara el propio dataset. NO se usa para buscar: se usa para el control de
  -- calidad de la carga (ver el script). Si el punto no cae en el barrio que él mismo dice,
  -- las coordenadas están mal.
  barrio         text,
  comuna         int,
  extra          jsonb not null default '{}'::jsonb,
  -- El punto. En parques y ciclovías es el centroide: es lo que se dibuja en el mapa.
  geom           geometry(Point, 4326) not null,
  -- La forma real cuando no es un punto (el polígono del parque, el trazado de la ciclovía).
  -- La distancia se mide contra ESTO cuando existe: el centro de las Barrancas está mucho más
  -- lejos que su borde, y al que camina le importa el borde.
  geom_forma     geometry(Geometry, 4326),
  fuente         text not null,
  actualizado_at timestamptz not null default now()
);

create unique index if not exists zona_pois_cat_ext_idx  on public.zona_pois (categoria, ext_id);
create index        if not exists zona_pois_geom_idx     on public.zona_pois using gist (geom);
create index        if not exists zona_pois_forma_idx    on public.zona_pois using gist (geom_forma)
  where geom_forma is not null;
create index        if not exists zona_pois_categoria_idx on public.zona_pois (categoria);

-- RLS: lectura para cualquier usuario logueado, escritura solo para el service role (que
-- salteа RLS). Sin políticas de escritura a propósito: nadie edita esto desde la app.
alter table public.zona_barrios enable row level security;
alter table public.zona_pois    enable row level security;

drop policy if exists "zona_barrios lectura autenticada" on public.zona_barrios;
create policy "zona_barrios lectura autenticada"
  on public.zona_barrios for select to authenticated using (true);

drop policy if exists "zona_pois lectura autenticada" on public.zona_pois;
create policy "zona_pois lectura autenticada"
  on public.zona_pois for select to authenticated using (true);
```

- [ ] **Paso 2: aplicar la migración a la base**

```bash
node scratch/apply-sql.mjs supabase/migrations/20260814100000_zona_pois.sql
```

Esperado: `HTTP 201`. (El script sale con un `Assertion failed` de Node en Windows **después** de
imprimir el resultado; si viste `HTTP 201`, salió bien.)

- [ ] **Paso 3: verificar que quedó todo**

Crear `scratch/_check-zona-tablas.sql`:

```sql
select table_name, count(*)::int as columnas
from information_schema.columns
where table_schema = 'public' and table_name in ('zona_barrios','zona_pois')
group by 1 order by 1;

select tablename, indexname from pg_indexes
where schemaname = 'public' and tablename in ('zona_barrios','zona_pois')
order by 1, 2;

select relname, relrowsecurity from pg_class
where relname in ('zona_barrios','zona_pois');
```

```bash
node scratch/apply-sql.mjs scratch/_check-zona-tablas.sql
```

Esperado: `zona_barrios` con 6 columnas, `zona_pois` con 13, los 6 índices, y `relrowsecurity: true`
en las dos.

- [ ] **Paso 4: commitear**

```bash
git add supabase/migrations/20260814100000_zona_pois.sql
git commit -m "feat(acm): tablas zona_barrios y zona_pois con PostGIS y RLS"
```

---

## Tarea 4 · El script de carga

**Por qué antes de `zona_resumen`:** sin datos, la función no se puede probar contra nada real.

**Archivos:**
- Crear: `scripts/cargar-zona-pois.mjs`

**Interfaces:**
- Consume: las tablas de la tarea 3.
- Produce: los datos cargados, que usan las tareas 5 y siguientes.

**El patrón ya existe.** `scripts/cargar-manzanas.mjs` lee el `.env` a mano, habla con la base por la
Management API y con Overpass con reintentos. Copiar `leerEnv()` y `sql()` de ahí tal cual
(`scripts/cargar-manzanas.mjs:48-73`).

- [ ] **Paso 1: escribir el esqueleto y la resolución de URLs por catálogo**

```js
// scripts/cargar-zona-pois.mjs
// Carga los datos abiertos del gobierno porteño que alimentan la hoja "La propiedad y su
// entorno" del ACM. Se corre A MANO, no hay cron: estos datasets cambian cada varios meses.
//
//   node scripts/cargar-zona-pois.mjs            → todo
//   node scripts/cargar-zona-pois.mjs subte      → una categoría sola
//   node scripts/cargar-zona-pois.mjs --verificar → solo el control de calidad
//
// POR QUE SE RESUELVEN LAS URLS POR CATALOGO Y NO SE ESCRIBEN FIJAS
// El gobierno mueve los archivos de carpeta. Al escribir esto, 4 de las 7 URLs que teníamos
// anotadas daban 404 porque farmacias había pasado de "salud" a "ministerio-de-salud",
// espacios verdes a "secretaria-de-desarrollo-urbano" y comisarías había cambiado de nombre.
// El catálogo CKAN sobrevive a esas mudanzas; una URL fija no.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import Papa from "papaparse"

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const UA = "PRISMA-acm/1.0 (inmobiliaria; contacto: osterrietchleonardo@vakdor.com)"

function leerEnv() {
  const txt = fs.readFileSync(path.join(RAIZ, ".env"), "utf8")
  const env = {}
  for (const linea of txt.split(/\r?\n/)) {
    const m = linea.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim()
  }
  return env
}

const env = leerEnv()
const REF = env.SUPABASE_PROJECT_REF || (env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/^https?:\/\//, "").split(".")[0]

async function sql(consulta) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SUPABASE_API_KEY_MANAGEMENT}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: consulta }),
  })
  const texto = await r.text()
  if (!r.ok) throw new Error(`SQL ${r.status}: ${texto.slice(0, 300)}`)
  return JSON.parse(texto)
}

/** Escapa una cadena para meterla literal en el SQL. Null/undefined → NULL. */
function lit(v) {
  if (v == null || v === "") return "NULL"
  return "'" + String(v).replace(/'/g, "''") + "'"
}

/** Resuelve la URL de un recurso del catálogo CKAN del gobierno porteño. */
async function urlDelCatalogo(dataset, formato, contiene) {
  const r = await fetch(`https://data.buenosaires.gob.ar/api/3/action/package_show?id=${dataset}`, {
    headers: { "User-Agent": UA },
  })
  const d = await r.json()
  if (!d.success) throw new Error(`Catálogo: no existe el dataset "${dataset}"`)
  const rec = d.result.resources.find(
    (x) => x.format.toUpperCase() === formato.toUpperCase() && x.url.includes(contiene)
  )
  if (!rec) throw new Error(`Catálogo: "${dataset}" no tiene un ${formato} con "${contiene}"`)
  return rec.url
}

async function bajarTexto(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA } })
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`)
  return await r.text()
}

/** CSV → array de objetos. Los CSV del gobierno vienen con BOM: Papa lo saca solo. */
function csv(texto) {
  return Papa.parse(texto.trim(), { header: true, skipEmptyLines: true }).data
}

/** "POINT (-58.45 -34.56)" → [lon, lat]. Devuelve null si no parsea. */
function puntoDeWkt(wkt) {
  const m = /POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i.exec(wkt || "")
  return m ? [Number(m[1]), Number(m[2])] : null
}

/** Coordenada con coma decimal ("-58,3709946") → número. Ver la trampa de las paradas. */
function num(v) {
  if (v == null) return NaN
  return Number(String(v).replace(",", "."))
}

/** Mismo criterio que normalizeBarrio() de lib/acm/ficha.ts. */
function normalizar(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}
```

- [ ] **Paso 2: cargar los barrios**

```js
// ── BARRIOS ─────────────────────────────────────────────────────────────────
// Van primero: sin ellos no hay control de calidad de los POIs ni forma de decir en qué barrio
// cae una propiedad.
async function cargarBarrios() {
  const url = await urlDelCatalogo("barrios", "CSV", "barrios.csv")
  const filas = csv(await bajarTexto(url))
  console.log(`  barrios: ${filas.length} filas`)

  const valores = []
  for (const f of filas) {
    const nombre = (f.nombre || "").trim()
    const geom = (f.geometry || "").trim()
    if (!nombre || !geom) continue
    const areaKm2 = Number(f.area_metro) / 1_000_000
    valores.push(
      `(${lit(nombre)}, ${lit(normalizar(nombre))}, ${Number(f.comuna) || "NULL"}, ` +
      `${Number.isFinite(areaKm2) ? areaKm2.toFixed(4) : "NULL"}, ` +
      // El CSV trae POLYGON y la columna es MultiPolygon: ST_Multi normaliza los dos casos.
      `ST_Multi(ST_GeomFromText(${lit(geom)}, 4326)))`
    )
  }

  await sql("DELETE FROM zona_barrios")
  await sql(
    `INSERT INTO zona_barrios (nombre, nombre_norm, comuna, area_km2, geom) VALUES ${valores.join(",")}`
  )
  const [n] = await sql("SELECT count(*)::int AS n FROM zona_barrios")
  console.log(`  barrios: ${n.n} cargados`)
}
```

- [ ] **Paso 3: correr solo los barrios y verificar**

```bash
node scripts/cargar-zona-pois.mjs barrios
```

Esperado: `barrios: 48 cargados`.

Verificar que el polígono sirve — crear `scratch/_check-barrio-punto.sql`:

```sql
-- Arcos 2800 (coordenada real devuelta por Georef) tiene que caer en Belgrano.
select nombre, comuna, round(area_km2::numeric, 2) as km2
from zona_barrios
where ST_Contains(geom, ST_SetSRID(ST_MakePoint(-58.459472179092, -34.5538758007397), 4326));
```

```bash
node scratch/apply-sql.mjs scratch/_check-barrio-punto.sql
```

Esperado: una fila, `Belgrano`, comuna 13.

- [ ] **Paso 4: commitear el avance**

```bash
git add scripts/cargar-zona-pois.mjs
git commit -m "feat(acm): script de carga de zona - barrios"
```

- [ ] **Paso 5: agregar las categorías de POIs**

Cada categoría es una función que devuelve filas `{ext_id, nombre, subtipo, direccion, barrio,
comuna, extra, lon, lat, wktForma}`. `wktForma` solo en parques y ciclovías.

```js
// ── POIs ────────────────────────────────────────────────────────────────────

async function poisSubte() {
  const url = await urlDelCatalogo("subte-estaciones", "CSV", "estaciones_de_subte.csv")
  return csv(await bajarTexto(url)).flatMap((f) => {
    const p = puntoDeWkt(f.geometry)
    if (!p) return []
    return [{
      ext_id: String(f.id), nombre: (f.estacion || "").trim(),
      subtipo: `Línea ${(f.linea || "").trim()}`,
      direccion: null, barrio: null, comuna: null,
      extra: { linea: (f.linea || "").trim() }, lon: p[0], lat: p[1], wktForma: null,
    }]
  })
}

async function poisHospitales() {
  const url = await urlDelCatalogo("hospitales", "CSV", "hospitales.csv")
  return csv(await bajarTexto(url)).flatMap((f) => {
    const p = puntoDeWkt(f.WKT)
    if (!p) return []
    return [{
      ext_id: String(f.ID), nombre: (f.NOM_MAP || f.NOMBRE || "").trim(),
      subtipo: (f.TIPO || "").trim() || null,
      direccion: (f.DOM_NORMA || "").trim() || null, barrio: null, comuna: null,
      extra: {}, lon: p[0], lat: p[1], wktForma: null,
    }]
  })
}

async function poisComisarias() {
  const url = await urlDelCatalogo("comisarias-policia-ciudad", "CSV", "comisarias_policia.csv")
  return csv(await bajarTexto(url)).flatMap((f) => {
    const p = puntoDeWkt(f.geometry)
    if (!p) return []
    return [{
      ext_id: String(f.id), nombre: (f.nombre || "").trim(), subtipo: null,
      direccion: (f.direccion || "").trim() || null,
      barrio: (f.barrio || "").trim() || null, comuna: Number(f.comuna) || null,
      extra: {}, lon: p[0], lat: p[1], wktForma: null,
    }]
  })
}

async function poisFarmacias() {
  const url = await urlDelCatalogo("farmacias", "GeoJSON", "farmacias.geojson")
  const gj = JSON.parse(await bajarTexto(url))
  return (gj.features || []).flatMap((f, i) => {
    const c = f.geometry?.coordinates
    if (!Array.isArray(c) || c.length < 2) return []
    const p = f.properties || {}
    return [{
      ext_id: String(p.id ?? i), nombre: (p.nombre || p.NOMBRE || "Farmacia").trim(), subtipo: null,
      direccion: (p.direccion || p.DIRECCION || "").trim() || null,
      barrio: (p.barrio || p.BARRIO || "").trim() || null, comuna: Number(p.comuna || p.COMUNA) || null,
      extra: {}, lon: Number(c[0]), lat: Number(c[1]), wktForma: null,
    }]
  })
}

// PARADAS DE COLECTIVO — dos trampas medidas, las dos silenciosas:
//   1. Las coordenadas usan COMA decimal ("-58,3709946"). Con Number() directo dan NaN, y si
//      alguien "arregla" eso mal, todas las paradas de Buenos Aires aterrizan en el Golfo de
//      Guinea (0,0) sin que nada tire error.
//   2. Las líneas vienen repartidas en seis columnas L1..L6, casi todas vacías.
async function poisParadas() {
  const url = await urlDelCatalogo("colectivos-paradas", "CSV", "paradas-de-colectivo.csv")
  return csv(await bajarTexto(url)).flatMap((f) => {
    const lon = num(f.coord_X), lat = num(f.coord_Y)
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon === 0 || lat === 0) return []
    const lineas = ["L1", "L2", "L3", "L4", "L5", "L6"]
      .map((k) => String(f[k] ?? "").trim())
      .filter(Boolean)
    return [{
      ext_id: String(f.fid), nombre: (f.DIRECCION || "").trim() || "Parada", subtipo: null,
      direccion: (f.DIRECCION || "").trim() || null,
      barrio: (f.BARRIO || "").trim() || null, comuna: Number(f.COMUNA) || null,
      extra: { lineas }, lon, lat, wktForma: null,
    }]
  })
}

// ESPACIOS VERDES — son polígonos. Se guarda el centroide (para dibujar) y la forma (para medir).
async function poisEspaciosVerdes() {
  const url = await urlDelCatalogo("espacios-verdes", "CSV", "espacio_verde_publico.csv")
  return csv(await bajarTexto(url)).flatMap((f) => {
    const geom = (f.geometry || "").trim()
    if (!geom) return []
    return [{
      ext_id: String(f.id), nombre: (f.nombre || f.nom_mapa || "Espacio verde").trim(),
      subtipo: (f.clasificac || "").trim() || null,
      direccion: (f.ubicacion || "").trim() || null,
      barrio: (f.barrio || "").trim() || null, comuna: Number(f.comuna) || null,
      extra: { area_m2: Number(f.area) || null },
      lon: null, lat: null, wktForma: geom, // el centroide lo calcula PostGIS
    }]
  })
}

// CICLOVIAS — son líneas. Mismo criterio que los parques.
async function poisCiclovias() {
  const url = await urlDelCatalogo("ciclovias", "CSV", "ciclovias.csv")
  return csv(await bajarTexto(url)).flatMap((f, i) => {
    const geom = (f.geometry || "").trim()
    if (!geom) return []
    return [{
      ext_id: String(f.id ?? i), nombre: (f.calle || f.nombre || "Ciclovía").trim(), subtipo: null,
      direccion: null, barrio: null, comuna: null, extra: {},
      lon: null, lat: null, wktForma: geom,
    }]
  })
}

// ECOBICI — única categoría que NO es un archivo: sale de API Transporte con las credenciales
// CLIENT_ID/CLIENT_SECRET del .env (verificadas: son de API Transporte, no de Google).
async function poisEcobici() {
  const u = new URL("https://apitransporte.buenosaires.gob.ar/ecobici/gbfs/stationInformation")
  u.searchParams.set("client_id", env.CLIENT_ID)
  u.searchParams.set("client_secret", env.CLIENT_SECRET)
  const d = JSON.parse(await bajarTexto(u.toString()))
  return (d.data?.stations || []).map((s) => ({
    ext_id: String(s.station_id), nombre: (s.name || "").trim(), subtipo: null,
    direccion: (s.address || "").trim() || null, barrio: null, comuna: null,
    extra: { capacidad: s.capacity ?? null },
    lon: Number(s.lon), lat: Number(s.lat), wktForma: null,
  }))
}

// ESCUELAS — vienen en EPSG:9498 (coordenadas locales de CABA), NO en lat/lon. Se reproyectan
// con ST_Transform EN LA BASE: PostGIS ya tiene la definición del sistema y no hay que acertarle
// a los parámetros a mano con proj4.
async function poisEscuelas() {
  const url = await urlDelCatalogo("establecimientos-educativos", "GeoJSON", "establecimientos_educativos.geojson")
  const gj = JSON.parse(await bajarTexto(url))
  return (gj.features || []).flatMap((f, i) => {
    const c = f.geometry?.coordinates
    if (!Array.isArray(c) || c.length < 2) return []
    const p = f.properties || {}
    return [{
      ext_id: String(p.id ?? i), nombre: (p.nam || "").trim(),
      subtipo: (p.ges || "").trim() || null,   // "Estatal" | "Privado"
      direccion: (p.dir || "").trim() || null,
      barrio: (p.bar || "").trim() || null, comuna: Number(p.com) || null,
      extra: { nivel: (p.nen_mde || "").trim() || null },
      // Punto en 9498, se transforma al insertar.
      lon: null, lat: null, wktForma: `POINT(${c[0]} ${c[1]})`, srid: 9498,
    }]
  })
}
```

- [ ] **Paso 6: escribir el insertador y el despachador**

```js
// ── INSERCION ───────────────────────────────────────────────────────────────
// El SQL va por tandas: un INSERT con 8.000 filas revienta el límite de la Management API.
const TANDA = 500

async function guardar(categoria, filas, fuente) {
  await sql(`DELETE FROM zona_pois WHERE categoria = ${lit(categoria)}`)

  for (let i = 0; i < filas.length; i += TANDA) {
    const valores = filas.slice(i, i + TANDA).map((f) => {
      // Tres formas de llegar al punto, por orden: lat/lon directas; forma en 9498 que se
      // reproyecta; forma en 4326 de la que se saca el centroide.
      let geom, geomForma
      if (f.srid === 9498) {
        geom = `ST_Transform(ST_GeomFromText(${lit(f.wktForma)}, 9498), 4326)`
        geomForma = "NULL"
      } else if (f.wktForma) {
        geom = `ST_PointOnSurface(ST_GeomFromText(${lit(f.wktForma)}, 4326))`
        geomForma = `ST_GeomFromText(${lit(f.wktForma)}, 4326)`
      } else {
        geom = `ST_SetSRID(ST_MakePoint(${f.lon}, ${f.lat}), 4326)`
        geomForma = "NULL"
      }
      return `(${lit(categoria)}, ${lit(f.ext_id)}, ${lit(f.nombre)}, ${lit(f.subtipo)}, ` +
        `${lit(f.direccion)}, ${lit(f.barrio)}, ${f.comuna || "NULL"}, ` +
        `${lit(JSON.stringify(f.extra || {}))}::jsonb, ${geom}, ${geomForma}, ${lit(fuente)})`
    })
    await sql(
      `INSERT INTO zona_pois (categoria, ext_id, nombre, subtipo, direccion, barrio, comuna, extra, geom, geom_forma, fuente)
       VALUES ${valores.join(",")}
       ON CONFLICT (categoria, ext_id) DO UPDATE SET
         nombre = EXCLUDED.nombre, subtipo = EXCLUDED.subtipo, direccion = EXCLUDED.direccion,
         barrio = EXCLUDED.barrio, comuna = EXCLUDED.comuna, extra = EXCLUDED.extra,
         geom = EXCLUDED.geom, geom_forma = EXCLUDED.geom_forma, actualizado_at = now()`
    )
  }
  console.log(`  ${categoria}: ${filas.length} cargados`)
}

const CATEGORIAS = {
  subte: poisSubte,
  escuela: poisEscuelas,
  hospital: poisHospitales,
  farmacia: poisFarmacias,
  comisaria: poisComisarias,
  espacio_verde: poisEspaciosVerdes,
  parada_colectivo: poisParadas,
  ecobici: poisEcobici,
  ciclovia: poisCiclovias,
}
```

**`ST_PointOnSurface` y no `ST_Centroid`:** el centroide de un parque en forma de "L" o de una
ciclovía curva puede caer **fuera** de la propia forma. `ST_PointOnSurface` garantiza un punto que
está adentro, que es lo que hace falta para dibujar el marcador donde corresponde.

- [ ] **Paso 7: escribir el control de calidad**

```js
// ── CONTROL DE CALIDAD ──────────────────────────────────────────────────────
// El único chequeo que detecta una reproyección silenciosamente torcida. Cada POI trae del
// dataset el barrio que él mismo declara; se cruza contra el polígono real. Si un punto no cae
// donde dice estar, las coordenadas están mal — y en escuelas eso es exactamente lo que pasa si
// la reproyección de EPSG:9498 falla, sin que nada tire un error.
async function verificar() {
  const filas = await sql(`
    SELECT p.categoria,
           count(*)::int AS con_barrio,
           count(*) FILTER (WHERE b.nombre_norm IS DISTINCT FROM lower_norm(p.barrio))::int AS fuera
    FROM zona_pois p
    LEFT JOIN zona_barrios b ON ST_Contains(b.geom, p.geom)
    WHERE p.barrio IS NOT NULL AND p.barrio <> ''
    GROUP BY 1 ORDER BY 1`)

  console.log("\n  Control de calidad (POIs cuyo punto NO cae en el barrio que declaran):")
  let hayProblema = false
  for (const f of filas) {
    const pct = f.con_barrio ? Math.round((f.fuera / f.con_barrio) * 100) : 0
    const mal = pct > 10
    if (mal) hayProblema = true
    console.log(`    ${mal ? "✗" : "✓"} ${f.categoria}: ${f.fuera}/${f.con_barrio} (${pct}%)`)
  }
  if (hayProblema) {
    console.error("\n  ✗ CARGA NO VALIDA: hay una categoría con más del 10% de puntos fuera de lugar.")
    console.error("    En escuelas, esto significa que la reproyección de EPSG:9498 falló.")
    process.exit(1)
  }
  console.log("  ✓ carga válida\n")
}
```

Esto necesita una función `lower_norm` en la base. Agregarla al final de la migración de la tarea 3
**o** como migración aparte — va acá porque solo la usa el control de calidad:

```sql
-- supabase/migrations/20260814100050_lower_norm.sql
-- Normaliza un texto igual que normalizeBarrio() de lib/acm/ficha.ts y que normalizar() del
-- script de carga. Existe para poder comparar el barrio que declara un POI contra el nombre
-- del barrio real sin depender de la extensión unaccent.
create or replace function public.lower_norm(t text)
returns text language sql immutable as $$
  select trim(regexp_replace(
    regexp_replace(
      translate(lower(coalesce(t, '')), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'),
      '[^a-z0-9\s]', ' ', 'g'),
    '\s+', ' ', 'g'))
$$;
```

- [ ] **Paso 8: escribir el despachador y correr todo**

```js
// ── MAIN ────────────────────────────────────────────────────────────────────
const arg = (process.argv[2] || "").trim()

if (arg === "--verificar") {
  await verificar()
} else if (arg === "barrios") {
  await cargarBarrios()
} else if (arg && CATEGORIAS[arg]) {
  console.log(`Cargando ${arg}…`)
  await guardar(arg, await CATEGORIAS[arg](), "gcba")
  await verificar()
} else if (arg) {
  console.error(`Categoría desconocida: "${arg}". Opciones: barrios, ${Object.keys(CATEGORIAS).join(", ")}`)
  process.exit(1)
} else {
  console.log("Cargando todo…")
  await cargarBarrios()
  for (const [cat, fn] of Object.entries(CATEGORIAS)) {
    console.log(`Cargando ${cat}…`)
    await guardar(cat, await fn(), "gcba")
  }
  await verificar()
}
```

```bash
node scratch/apply-sql.mjs supabase/migrations/20260814100050_lower_norm.sql
node scripts/cargar-zona-pois.mjs
```

Esperado: las 9 categorías con su conteo, y `✓ carga válida`.

**Si escuelas sale con ✗:** la reproyección falló. Verificar a mano con
`SELECT ST_AsText(ST_Transform(ST_GeomFromText('POINT(26519.67 74333.08)', 9498), 4326))` — tiene que
dar algo cerca de `POINT(-58.39 -34.59)` (Recoleta, que es lo que declara esa fila). Si da otra cosa,
el SRID no es 9498 y hay que mirar qué declara el GeoJSON.

- [ ] **Paso 9: commitear**

```bash
git add scripts/cargar-zona-pois.mjs supabase/migrations/20260814100050_lower_norm.sql
git commit -m "feat(acm): carga de los datos abiertos de zona con control de calidad"
```

---

## Tarea 5 · La función `zona_resumen`

**Archivos:**
- Crear: `supabase/migrations/20260814100100_zona_resumen.sql`

**Interfaces:**
- Consume: `zona_barrios` y `zona_pois` con datos (tareas 3 y 4).
- Produce: `zona_resumen(p_lat double precision, p_lon double precision) returns jsonb` — la usa la
  tarea 6.

- [ ] **Paso 1: escribir la migración**

```sql
-- supabase/migrations/20260814100100_zona_resumen.sql
-- ACM · Todo lo que necesita la hoja del entorno, en UNA llamada.
-- Devuelve jsonb y no una tabla porque cada categoría tiene forma distinta (unas devuelven el
-- más cercano, otras un conteo, otras las dos cosas): una tabla obligaría a columnas nullables
-- para todo y el que la lee tendría que adivinar cuáles miran.
--
-- Los radios NO son un parámetro. Son una decisión de producto, medida en cuadras de CABA:
-- 500 m de farmacias son 5 cuadras (lo que se camina por un remedio), 3 km de hospital es lo
-- que se recorre en auto sin pensarlo. Que vivan acá adentro evita que alguien los cambie desde
-- el llamador y produzca dos fichas con criterios distintos.
-- El más cercano de una categoría dentro de un radio, o null.
-- VA PRIMERO: zona_resumen la llama, y una función tiene que existir antes que quien la usa.
create or replace function public.cercano(p_categoria text, p_geo geography, p_radio int)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'nombre',  p.nombre,
    'subtipo', p.subtipo,
    'metros',  round(ST_Distance(coalesce(p.geom_forma, p.geom)::geography, p_geo))::int,
    'lat',     ST_Y(p.geom),
    'lon',     ST_X(p.geom),
    'extra',   p.extra)
  from zona_pois p
  where p.categoria = p_categoria
    and ST_DWithin(coalesce(p.geom_forma, p.geom)::geography, p_geo, p_radio)
  order by ST_Distance(coalesce(p.geom_forma, p.geom)::geography, p_geo)
  limit 1;
$$;

create or replace function public.zona_resumen(p_lat double precision, p_lon double precision)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  punto     geometry(Point, 4326);
  geo       geography;
  v_barrio  record;
  resultado jsonb;
begin
  punto := ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326);
  geo   := punto::geography;

  -- El barrio. Si el punto no cae en ninguno, no es CABA: devolvemos null y el llamador se va
  -- al respaldo de OpenStreetMap.
  select b.nombre, b.comuna, b.area_km2 into v_barrio
  from zona_barrios b
  where ST_Contains(b.geom, punto)
  limit 1;

  if v_barrio is null then
    return null;
  end if;

  select jsonb_build_object(
    'barrio',  v_barrio.nombre,
    'comuna',  v_barrio.comuna,
    'area_km2', round(v_barrio.area_km2::numeric, 1),

    -- Contexto del banner: espacios verdes del barrio ENTERO, no del radio.
    'espacios_verdes_barrio', (
      select count(*)::int from zona_pois p, zona_barrios b
      where p.categoria = 'espacio_verde' and b.nombre = v_barrio.nombre
        and ST_Contains(b.geom, p.geom)
    ),

    -- ── Los más cercanos ──
    -- La distancia se mide contra geom_forma cuando existe (el borde del parque, el trazado de
    -- la ciclovía) y contra geom cuando no. Medir un parque desde su centro miente: el borde de
    -- las Barrancas está a la mitad de distancia que su centro.
    'subte',         (select cercano('subte', geo, 1500)),
    'espacio_verde', (select cercano('espacio_verde', geo, 1200)),
    'hospital',      (select cercano('hospital', geo, 3000)),
    'comisaria',     (select cercano('comisaria', geo, 1500)),
    'ciclovia',      (select cercano('ciclovia', geo, 400)),

    -- ── Los que se cuentan ──
    'escuela', (
      select jsonb_build_object(
        'cantidad', count(*)::int,
        'estatales', count(*) FILTER (WHERE p.subtipo ilike 'estatal')::int)
      from zona_pois p
      where p.categoria = 'escuela' and ST_DWithin(p.geom::geography, geo, 1000)
    ),
    'farmacia', (
      select jsonb_build_object('cantidad', count(*)::int)
      from zona_pois p
      where p.categoria = 'farmacia' and ST_DWithin(p.geom::geography, geo, 500)
    ),
    'ecobici', (
      select jsonb_build_object('cantidad', count(*)::int)
      from zona_pois p
      where p.categoria = 'ecobici' and ST_DWithin(p.geom::geography, geo, 600)
    ),
    -- Las líneas de colectivo se juntan de TODAS las paradas del radio y se deduplican: al que
    -- pregunta le importa qué líneas tiene, no cuántos carteles hay.
    'parada_colectivo', (
      select jsonb_build_object(
        'lineas', coalesce(jsonb_agg(distinct l order by l), '[]'::jsonb),
        'cantidad', count(distinct l)::int)
      from zona_pois p, jsonb_array_elements_text(p.extra->'lineas') AS l
      where p.categoria = 'parada_colectivo' and ST_DWithin(p.geom::geography, geo, 300)
    )
  ) into resultado;

  return resultado;
end;
$$;

-- La app la llama con la clave anónima del usuario logueado.
grant execute on function public.zona_resumen(double precision, double precision) to authenticated;
```

**`security definer`:** la función lee tablas con RLS. Como los datos son públicos y las políticas ya
permiten `select` a `authenticated`, no es estrictamente necesario, pero fija el `search_path` y deja
la función a salvo de cambios futuros en las políticas.

- [ ] **Paso 2: aplicar y probar contra una dirección real**

```bash
node scratch/apply-sql.mjs supabase/migrations/20260814100100_zona_resumen.sql
```

Crear `scratch/_check-zona-resumen.sql`:

```sql
-- Arcos 2800, Belgrano (coordenada real de Georef).
select jsonb_pretty(zona_resumen(-34.5538758007397, -58.459472179092));
-- Un punto en Olivos (GBA): tiene que devolver NULL.
select zona_resumen(-34.5093, -58.4941) is null as fuera_de_caba;
```

```bash
node scratch/apply-sql.mjs scratch/_check-zona-resumen.sql
```

Esperado: un JSON con `barrio: "Belgrano"`, `comuna: 13`, subte con una estación y su línea,
espacio verde con nombre y metros, escuelas con cantidad, líneas de colectivo. Y
`fuera_de_caba: true`.

**Chequeo de olfato obligatorio:** mirar los metros del subte y del espacio verde. Si el subte da
más de 1.500 o el parque más de 1.200, algo está mal en el filtro. Si el espacio verde da un número
sospechosamente redondo o gigante, `geom_forma` no se cargó.

- [ ] **Paso 3: commitear**

```bash
git add supabase/migrations/20260814100100_zona_resumen.sql
git commit -m "feat(acm): funcion SQL zona_resumen"
```

---

## Tarea 6 · `lib/acm/zona.ts` — geocodificar y armar los datos

**Archivos:**
- Crear: `lib/acm/zona.ts`, `lib/acm/zona.test.ts`

**Interfaces:**
- Consume: `zona_resumen` (tarea 5), los tipos de la tarea 2, el formateo de la tarea 1.
- Produce:
  - `geocodificar(direccion: string, barrio: string): Promise<{lat: number; lon: number} | null>`
  - `resumenACategorias(resumen: any): FichaZonaPoi[]`
  - `obtenerZona(supabase, direccion, barrio): Promise<ZonaCalculada | null>` donde
    `ZonaCalculada = { zona: Omit<FichaZona, "relato" | "mapa_url">; centro: { lat: number; lon: number } }`
  — las usan las tareas 7 y 10.

**Por qué `obtenerZona` devuelve también el centro:** el navegador del asesor necesita las
coordenadas para pedir el mapa (tarea 9), y son las mismas que ya se geocodificaron acá. Sin
devolverlas habría que geocodificar dos veces la misma dirección.

- [ ] **Paso 1: escribir el test que falla**

Se testea `resumenACategorias`, que es pura. `geocodificar` y `obtenerZona` hablan con la red y con
la base: se prueban a mano en el paso 5.

```ts
// lib/acm/zona.test.ts
import { describe, it, expect } from "vitest";
import { resumenACategorias } from "./zona";

const RESUMEN = {
  barrio: "Belgrano", comuna: 13, area_km2: 8.1, espacios_verdes_barrio: 26,
  subte: { nombre: "Juramento", subtipo: "Línea D", metros: 547, lat: -34.5623, lon: -58.4556, extra: {} },
  espacio_verde: { nombre: "Barrancas de Belgrano", subtipo: "PARQUE", metros: 412, lat: -34.5601, lon: -58.4531, extra: { area_m2: 54000 } },
  hospital: { nombre: "HOSP. PIROVANO", subtipo: "Hospital general", metros: 1187, lat: -34.5701, lon: -58.4712, extra: {} },
  comisaria: { nombre: "Comisaría Vecinal 13-B", subtipo: null, metros: 703, lat: -34.5588, lon: -58.4601, extra: {} },
  ciclovia: null,
  escuela: { cantidad: 12, estatales: 8 },
  farmacia: { cantidad: 8 },
  ecobici: { cantidad: 3 },
  parada_colectivo: { lineas: ["15", "29", "42", "60", "68"], cantidad: 5 },
};

describe("resumenACategorias", () => {
  it("arma el subte con la línea como detalle", () => {
    const subte = resumenACategorias(RESUMEN).find((p) => p.categoria === "subte");
    expect(subte).toEqual({
      categoria: "subte", titulo: "Juramento", detalle: "Línea D",
      metros: 547, cantidad: null, lat: -34.5623, lon: -58.4556,
    });
  });

  it("cuenta las escuelas y aclara cuántas son estatales", () => {
    const esc = resumenACategorias(RESUMEN).find((p) => p.categoria === "escuela");
    expect(esc?.titulo).toBe("12 escuelas");
    expect(esc?.detalle).toBe("8 estatales");
    expect(esc?.cantidad).toBe(12);
    expect(esc?.metros).toBe(null);
  });

  it("singulariza cuando hay una sola", () => {
    const r = resumenACategorias({ ...RESUMEN, escuela: { cantidad: 1, estatales: 0 }, farmacia: { cantidad: 1 } });
    expect(r.find((p) => p.categoria === "escuela")?.titulo).toBe("1 escuela");
    expect(r.find((p) => p.categoria === "farmacia")?.titulo).toBe("1 farmacia");
  });

  it("lista las líneas de colectivo separadas por punto medio", () => {
    const col = resumenACategorias(RESUMEN).find((p) => p.categoria === "parada_colectivo");
    expect(col?.titulo).toBe("15 · 29 · 42 · 60 · 68");
    expect(col?.detalle).toBe("a menos de 300 m");
  });

  it("omite las categorías sin dato en vez de mostrarlas vacías", () => {
    const cats = resumenACategorias(RESUMEN).map((p) => p.categoria);
    expect(cats).not.toContain("ciclovia");
  });

  it("omite los conteos en cero", () => {
    const r = resumenACategorias({ ...RESUMEN, farmacia: { cantidad: 0 }, ecobici: { cantidad: 0 } });
    const cats = r.map((p) => p.categoria);
    expect(cats).not.toContain("farmacia");
    expect(cats).not.toContain("ecobici");
  });

  it("respeta el orden de CATEGORIAS_ZONA", () => {
    const cats = resumenACategorias(RESUMEN).map((p) => p.categoria);
    expect(cats).toEqual(["subte", "espacio_verde", "escuela", "hospital", "farmacia", "parada_colectivo", "comisaria", "ecobici"]);
  });

  it("no explota con un resumen vacío", () => {
    expect(resumenACategorias({})).toEqual([]);
  });
});
```

- [ ] **Paso 2: correr el test y ver que falla**

```bash
npx vitest run lib/acm/zona.test.ts
```

Esperado: FAIL — no existe `./zona`.

- [ ] **Paso 3: escribir la implementación**

```ts
// lib/acm/zona.ts
// ACM · Hoja "La propiedad y su entorno": de una dirección a los datos duros del barrio.
//
// El camino es: dirección → Georef (lat/lon) → zona_resumen (PostGIS) → categorías listas para
// imprimir. Fuera de CABA, zona_resumen devuelve null y entra el respaldo de zona-overpass.ts.
//
// NADA de acá escribe texto para el cliente: eso es zona-relato.ts. Acá solo salen números y
// nombres propios que vinieron de un dataset.
import { CATEGORIAS_ZONA, type CategoriaZona, type FichaZona, type FichaZonaPoi } from "./ficha";

const UA = "PRISMA-acm/1.0 (inmobiliaria; contacto: osterrietchleonardo@vakdor.com)";
const TIMEOUT_GEOREF_MS = 8000;

/** Provincia 02 = CABA. Georef pide el código, no el nombre. */
const PROVINCIA_CABA = "02";

/**
 * Dirección → coordenadas, con Georef (gratis, del gobierno nacional).
 *
 * OJO con lo que Georef NO da: para CABA devuelve `departamento: "Comuna 13"`, nunca el barrio.
 * El barrio sale del polígono (zona_resumen), no de acá.
 *
 * Se busca primero en CABA porque ahí está el 90% del inventario medido; si no aparece, se
 * reintenta sin restringir provincia para cubrir GBA.
 */
export async function geocodificar(direccion: string, barrio: string): Promise<{ lat: number; lon: number } | null> {
  const texto = [direccion, barrio].filter(Boolean).join(", ").trim();
  if (!texto) return null;

  for (const provincia of [PROVINCIA_CABA, null]) {
    try {
      const u = new URL("https://apis.datos.gob.ar/georef/api/direcciones");
      u.searchParams.set("direccion", texto);
      u.searchParams.set("max", "1");
      if (provincia) u.searchParams.set("provincia", provincia);

      const r = await fetch(u.toString(), {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(TIMEOUT_GEOREF_MS),
      });
      if (!r.ok) continue;
      const d = await r.json();
      const ub = d?.direcciones?.[0]?.ubicacion;
      if (ub && Number.isFinite(ub.lat) && Number.isFinite(ub.lon)) {
        return { lat: Number(ub.lat), lon: Number(ub.lon) };
      }
    } catch {
      // Timeout o red caída: se prueba el siguiente intento y, si no, se devuelve null.
    }
  }
  return null;
}

const plural = (n: number, singular: string, plural_: string) => `${n} ${n === 1 ? singular : plural_}`;

/**
 * El jsonb de zona_resumen (o el equivalente que arma Overpass) → las tarjetas de la hoja.
 *
 * Regla: **una categoría sin dato no aparece**. Nada de "0 farmacias" ni "sin datos de subte":
 * un renglón que dice que algo falta llama la atención sobre lo que no hay, que es justo lo que
 * un documento de venta no tiene que hacer. Si no hay, no se habla del tema.
 */
export function resumenACategorias(r: any): FichaZonaPoi[] {
  if (!r || typeof r !== "object") return [];

  const cercano = (cat: CategoriaZona, detalle?: (x: any) => string): FichaZonaPoi | null => {
    const x = r[cat];
    if (!x || !x.nombre) return null;
    return {
      categoria: cat,
      titulo: String(x.nombre).trim(),
      detalle: detalle ? detalle(x) : (x.subtipo ? String(x.subtipo).trim() : ""),
      metros: Number.isFinite(x.metros) ? Number(x.metros) : null,
      cantidad: null,
      lat: Number.isFinite(x.lat) ? Number(x.lat) : null,
      lon: Number.isFinite(x.lon) ? Number(x.lon) : null,
    };
  };

  const conteo = (cat: CategoriaZona, sing: string, plu: string, detalle = ""): FichaZonaPoi | null => {
    const n = Number(r[cat]?.cantidad);
    if (!Number.isFinite(n) || n <= 0) return null;
    return { categoria: cat, titulo: plural(n, sing, plu), detalle, metros: null, cantidad: n, lat: null, lon: null };
  };

  const porCategoria: Record<CategoriaZona, () => FichaZonaPoi | null> = {
    subte: () => cercano("subte"),
    espacio_verde: () => cercano("espacio_verde", () => ""),
    escuela: () => {
      const base = conteo("escuela", "escuela", "escuelas");
      if (!base) return null;
      const est = Number(r.escuela?.estatales);
      return { ...base, detalle: Number.isFinite(est) && est > 0 ? `${est} estatales` : "" };
    },
    hospital: () => cercano("hospital", () => ""),
    farmacia: () => conteo("farmacia", "farmacia", "farmacias", "a menos de 500 m"),
    parada_colectivo: () => {
      const lineas = Array.isArray(r.parada_colectivo?.lineas) ? r.parada_colectivo.lineas : [];
      if (lineas.length === 0) return null;
      // Ordenadas como números: el orden de texto pone el 105 antes que el 15.
      const orden = [...lineas].sort((a: string, b: string) => Number(a) - Number(b));
      return {
        categoria: "parada_colectivo",
        titulo: orden.join(" · "),
        detalle: "a menos de 300 m",
        metros: null, cantidad: orden.length, lat: null, lon: null,
      };
    },
    comisaria: () => cercano("comisaria", () => ""),
    ecobici: () => conteo("ecobici", "estación Ecobici", "estaciones Ecobici", "a menos de 600 m"),
    ciclovia: () => cercano("ciclovia", () => ""),
  };

  // El orden de impresión lo manda CATEGORIAS_ZONA, no el orden del jsonb.
  return CATEGORIAS_ZONA.map((c) => porCategoria[c]()).filter((x): x is FichaZonaPoi => x !== null);
}

/** Lo duro de la hoja + el punto que se geocodificó (que necesita el mapa). */
export interface ZonaCalculada {
  zona: Omit<FichaZona, "relato" | "mapa_url">;
  centro: { lat: number; lon: number };
}

/**
 * Todo lo duro de la hoja, listo salvo el relato y el mapa (que vienen después).
 * Devuelve null si no se pudo ubicar la propiedad o si no hay datos suficientes.
 */
export async function obtenerZona(
  supabase: { rpc: (fn: string, args: any) => Promise<{ data: any; error: any }> },
  direccion: string,
  barrio: string
): Promise<ZonaCalculada | null> {
  const centro = await geocodificar(direccion, barrio);
  if (!centro) return null;

  const { data, error } = await supabase.rpc("zona_resumen", { p_lat: centro.lat, p_lon: centro.lon });
  if (error) {
    console.error("ACM zona: falló zona_resumen:", error);
    return null;
  }

  if (data) {
    const pois = resumenACategorias(data);
    if (pois.length === 0) return null;
    return {
      centro,
      zona: {
        barrio: String(data.barrio || ""),
        comuna: Number.isFinite(data.comuna) ? Number(data.comuna) : null,
        area_km2: Number.isFinite(Number(data.area_km2)) ? Number(data.area_km2) : null,
        espacios_verdes_barrio: Number.isFinite(data.espacios_verdes_barrio) ? Number(data.espacios_verdes_barrio) : null,
        fuente: "gcba",
        pois,
      },
    };
  }

  // No es CABA: respaldo por OpenStreetMap. Import diferido para no cargarlo en el 90% de los
  // casos que se resuelven con la base.
  const { zonaPorOverpass } = await import("./zona-overpass");
  const zona = await zonaPorOverpass(centro.lat, centro.lon, barrio);
  return zona ? { zona, centro } : null;
}
```

- [ ] **Paso 4: correr el test y ver que pasa**

```bash
npx vitest run lib/acm/zona.test.ts
```

Esperado: PASS, 8 tests. (`zona-overpass` todavía no existe, pero el import es diferido y estos
tests no lo tocan.)

- [ ] **Paso 5: probar `geocodificar` contra la API real**

Crear `scratch/_probar-georef.mjs`:

```js
const u = new URL("https://apis.datos.gob.ar/georef/api/direcciones")
u.searchParams.set("direccion", "Arcos 2800, Belgrano")
u.searchParams.set("provincia", "02")
u.searchParams.set("max", "1")
const d = await (await fetch(u, { headers: { "User-Agent": "PRISMA-acm/1.0" } })).json()
console.log(JSON.stringify(d.direcciones?.[0]?.ubicacion, null, 2))
```

```bash
node scratch/_probar-georef.mjs
```

Esperado: `{ "lat": -34.55..., "lon": -58.45... }`.

- [ ] **Paso 6: commitear**

```bash
git add lib/acm/zona.ts lib/acm/zona.test.ts
git commit -m "feat(acm): geocodificacion y armado de los datos de zona"
```

---

## Tarea 7 · El respaldo fuera de CABA (Overpass)

**Archivos:**
- Crear: `lib/acm/zona-overpass.ts`

**Interfaces:**
- Consume: `resumenACategorias` (tarea 6).
- Produce: `zonaPorOverpass(lat, lon, barrioDeclarado): Promise<Omit<FichaZona, "relato"|"mapa_url"> | null>`
  — la usa `obtenerZona` de la tarea 6.

- [ ] **Paso 1: escribir la implementación**

```ts
// lib/acm/zona-overpass.ts
// ACM · Respaldo de la hoja del entorno fuera de CABA (Olivos, Monte Grande, Escobar…).
//
// Los datos del gobierno porteño terminan en la General Paz. De los 53 ACM hechos al escribir
// esto, 48 eran de CABA y 5 de GBA: esto cubre esos 5 sin romper nada de los 48.
//
// Overpass es un servidor COMUNITARIO, no nuestro: contesta 406 a quien no se identifica y 429 o
// 504 cuando está cargado. Nunca puede bloquear la creación de una ficha — si no contesta a
// tiempo, la hoja no sale y listo.
import { resumenACategorias } from "./zona";
import type { FichaZona } from "./ficha";

const UA = "PRISMA-acm/1.0 (inmobiliaria; contacto: osterrietchleonardo@vakdor.com)";
const TIMEOUT_MS = 20000;
/** Menos de esto es media hoja vacía, que se ve peor que ninguna hoja. */
const MINIMO_CATEGORIAS = 3;

/** Metros entre dos coordenadas (Haversine). PostGIS no está disponible acá: esto es en vivo. */
function metros(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.asin(Math.sqrt(a)));
}

export async function zonaPorOverpass(
  lat: number,
  lon: number,
  barrioDeclarado: string
): Promise<Omit<FichaZona, "relato" | "mapa_url"> | null> {
  // Una sola consulta con todos los radios: cada ida a Overpass cuesta segundos.
  // `nwr` toma nodos, vías y relaciones: muchos hospitales y parques están mapeados como
  // polígono, no como punto, y con `node` solo se perderían.
  const q = `[out:json][timeout:18];
(
  nwr["railway"="station"]["station"!="subway"](around:1500,${lat},${lon});
  nwr["railway"="subway_entrance"](around:1500,${lat},${lon});
  nwr["leisure"="park"](around:1200,${lat},${lon});
  nwr["amenity"="school"](around:1000,${lat},${lon});
  nwr["amenity"="hospital"](around:3000,${lat},${lon});
  nwr["amenity"="pharmacy"](around:500,${lat},${lon});
  nwr["highway"="bus_stop"](around:300,${lat},${lon});
  nwr["amenity"="police"](around:1500,${lat},${lon});
);
out center tags;`;

  let elementos: any[] = [];
  try {
    const r = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA, Accept: "application/json" },
      body: "data=" + encodeURIComponent(q),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) throw new Error(`Overpass ${r.status}`);
    elementos = (await r.json())?.elements || [];
  } catch (e) {
    // Sin reintentos a propósito: acá hay un asesor esperando que se cree su ficha. Los
    // reintentos con espera creciente son del script de carga, que corre sin nadie mirando.
    console.error("ACM zona: Overpass no contestó:", e);
    return null;
  }

  // Cada elemento con su distancia. `center` lo agrega Overpass para vías y relaciones.
  const conDistancia = elementos.flatMap((e) => {
    const la = e.lat ?? e.center?.lat, lo = e.lon ?? e.center?.lon;
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return [];
    return [{ tags: e.tags || {}, lat: la, lon: lo, metros: metros(lat, lon, la, lo) }];
  });

  const filtrar = (pred: (t: any) => boolean, radio: number) =>
    conDistancia.filter((x) => pred(x.tags) && x.metros <= radio).sort((a, b) => a.metros - b.metros);

  const primero = (lista: typeof conDistancia) => {
    const x = lista.find((e) => (e.tags.name || "").trim());
    return x ? { nombre: x.tags.name.trim(), subtipo: null, metros: x.metros, lat: x.lat, lon: x.lon, extra: {} } : null;
  };

  const estaciones = filtrar((t) => t.railway === "station" || t.railway === "subway_entrance", 1500);
  const parques = filtrar((t) => t.leisure === "park", 1200);
  const escuelas = filtrar((t) => t.amenity === "school", 1000);
  const hospitales = filtrar((t) => t.amenity === "hospital", 3000);
  const farmacias = filtrar((t) => t.amenity === "pharmacy", 500);
  const policia = filtrar((t) => t.amenity === "police", 1500);
  const paradas = filtrar((t) => t.highway === "bus_stop", 300);

  // Las líneas salen del nombre o de la ref de la parada; en GBA suelen faltar. Si no hay, la
  // categoría no aparece — que es exactamente lo que hace resumenACategorias con una lista vacía.
  const lineas = Array.from(
    new Set(paradas.flatMap((p) => String(p.tags.route_ref || p.tags.ref || "").split(/[;,]/).map((s) => s.trim()).filter(Boolean)))
  );

  // Se arma el MISMO objeto que devuelve zona_resumen para reusar resumenACategorias tal cual:
  // así la hoja de GBA se imprime con el mismo código y se ve idéntica a la de CABA.
  const resumen = {
    subte: primero(estaciones),
    espacio_verde: primero(parques),
    hospital: primero(hospitales),
    comisaria: primero(policia),
    ciclovia: null,
    escuela: { cantidad: escuelas.length, estatales: 0 },
    farmacia: { cantidad: farmacias.length },
    ecobici: { cantidad: 0 },
    parada_colectivo: { lineas, cantidad: lineas.length },
  };

  const pois = resumenACategorias(resumen);
  if (pois.length < MINIMO_CATEGORIAS) return null;

  return {
    // OpenStreetMap no tiene los barrios de GBA con la prolijidad del gobierno porteño: se usa
    // lo que escribió el asesor, que para una propiedad de GBA es el dato más confiable que hay.
    barrio: (barrioDeclarado || "").trim(),
    comuna: null,
    area_km2: null,
    espacios_verdes_barrio: null,
    fuente: "osm",
    pois,
  };
}
```

- [ ] **Paso 2: probar contra Overpass real**

Crear `scratch/_probar-overpass.mjs` que importe el módulo compilado no sirve (es TS). Probar la
consulta cruda:

```js
const lat = -34.5093, lon = -58.4941 // Olivos
const q = `[out:json][timeout:18];(nwr["amenity"="pharmacy"](around:500,${lat},${lon});nwr["amenity"="school"](around:1000,${lat},${lon}););out center tags;`
const r = await fetch("https://overpass-api.de/api/interpreter", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "PRISMA-acm/1.0", Accept: "application/json" },
  body: "data=" + encodeURIComponent(q),
})
const d = await r.json()
console.log("HTTP", r.status, "· elementos:", d.elements?.length)
console.log(d.elements?.slice(0, 5).map((e) => e.tags?.name || "(sin nombre)"))
```

```bash
node scratch/_probar-overpass.mjs
```

Esperado: HTTP 200 y una lista de nombres reales de Olivos.

- [ ] **Paso 3: verificar que los tests siguen pasando**

```bash
npx vitest run lib/acm/
```

Esperado: todo verde.

- [ ] **Paso 4: commitear**

```bash
git add lib/acm/zona-overpass.ts
git commit -m "feat(acm): respaldo de zona por OpenStreetMap fuera de CABA"
```

---

## Tarea 8 · El relato de la IA

**Archivos:**
- Crear: `lib/acm/zona-relato.ts`, `lib/acm/zona-relato.test.ts`

**Interfaces:**
- Consume: `FichaZonaPoi` (tarea 2), el formateo (tarea 1).
- Produce:
  - `construirPromptZona(datos: DatosRelato): string`
  - `sanearRelato(texto: string): string`
  - `generarRelato(datos: DatosRelato): Promise<string>`
  — las usa la tarea 10.

- [ ] **Paso 1: escribir el test que falla**

```ts
// lib/acm/zona-relato.test.ts
import { describe, it, expect } from "vitest";
import { construirPromptZona, sanearRelato, MAX_RELATO } from "./zona-relato";

const DATOS = {
  barrio: "Belgrano", comuna: 13, area_km2: 8.1, espacios_verdes_barrio: 26,
  pois: [
    { categoria: "subte" as const, titulo: "Juramento", detalle: "Línea D", metros: 547, cantidad: null, lat: -34.5, lon: -58.4 },
    { categoria: "espacio_verde" as const, titulo: "Barrancas de Belgrano", detalle: "", metros: 412, cantidad: null, lat: -34.5, lon: -58.4 },
    { categoria: "escuela" as const, titulo: "12 escuelas", detalle: "8 estatales", metros: null, cantidad: 12, lat: null, lon: null },
  ],
};

describe("construirPromptZona", () => {
  it("expresa las distancias en cuadras, no en metros", () => {
    const p = construirPromptZona(DATOS);
    expect(p).toContain("cinco cuadras");   // 547 m
    expect(p).toContain("cuatro cuadras");  // 412 m
    expect(p).not.toContain("547");
  });

  it("incluye todos los datos disponibles", () => {
    const p = construirPromptZona(DATOS);
    expect(p).toContain("Juramento");
    expect(p).toContain("Línea D");
    expect(p).toContain("Barrancas de Belgrano");
    expect(p).toContain("12 escuelas");
  });

  it("prohíbe explícitamente inventar lugares", () => {
    const p = construirPromptZona(DATOS);
    expect(p).toMatch(/no nombres? ning[uú]n lugar/i);
  });

  it("prohíbe opinar sobre el valor de la propiedad", () => {
    expect(construirPromptZona(DATOS)).toMatch(/invers|convien|oportunidad/i);
  });

  it("no menciona categorías que no vinieron", () => {
    const p = construirPromptZona(DATOS);
    expect(p).not.toMatch(/farmacia/i);
    expect(p).not.toMatch(/hospital/i);
  });
});

describe("sanearRelato", () => {
  it("saca los encabezados en markdown que a veces mete el modelo", () => {
    expect(sanearRelato("## El barrio\n\nBelgrano es tranquilo.")).toBe("Belgrano es tranquilo.");
  });

  it("saca las negritas de markdown pero conserva el texto", () => {
    expect(sanearRelato("**Belgrano** es tranquilo.")).toBe("Belgrano es tranquilo.");
  });

  it("junta los saltos de línea múltiples en párrafos simples", () => {
    expect(sanearRelato("Uno.\n\n\n\nDos.")).toBe("Uno.\n\nDos.");
  });

  it("recorta a MAX_RELATO sin cortar una palabra al medio", () => {
    const largo = "palabra ".repeat(400);
    const r = sanearRelato(largo);
    expect(r.length).toBeLessThanOrEqual(MAX_RELATO);
    expect(r.endsWith("palabra")).toBe(true);
  });

  it("devuelve cadena vacía si le entra basura", () => {
    expect(sanearRelato("")).toBe("");
    expect(sanearRelato("   \n  ")).toBe("");
  });
});
```

- [ ] **Paso 2: correr el test y ver que falla**

```bash
npx vitest run lib/acm/zona-relato.test.ts
```

Esperado: FAIL — no existe `./zona-relato`.

- [ ] **Paso 3: escribir la implementación**

```ts
// lib/acm/zona-relato.ts
// ACM · El párrafo que cuenta el barrio en la hoja del entorno.
//
// La IA acá tiene UN trabajo: convertir en prosa una lista de datos que ya vienen calculados.
// No decide, no busca, no completa. Cada número y cada nombre propio del texto tiene que poder
// rastrearse a la lista que se le pasó — por eso los datos van en cuadras ya convertidas y no en
// metros: si el modelo tuviera que dividir por cien, tendríamos aritmética de un LLM en un
// documento firmado por la inmobiliaria.
import { GoogleGenerativeAI } from "@google/generative-ai";
import { cuadrasEnPalabras } from "./zona-formato";
import type { FichaZonaPoi } from "./ficha";

/** Tope duro. La hoja es un A4 exacto y el relato comparte columna con la descripción. */
export const MAX_RELATO = 900;

export interface DatosRelato {
  barrio: string;
  comuna: number | null;
  area_km2: number | null;
  espacios_verdes_barrio: number | null;
  pois: FichaZonaPoi[];
}

/** Cómo se le nombra cada categoría al modelo. */
const ETIQUETAS: Record<string, string> = {
  subte: "Estación de subte más cercana",
  espacio_verde: "Espacio verde más cercano",
  escuela: "Escuelas a menos de diez cuadras",
  hospital: "Hospital más cercano",
  farmacia: "Farmacias a menos de cinco cuadras",
  parada_colectivo: "Líneas de colectivo que paran cerca",
  comisaria: "Comisaría más cercana",
  ecobici: "Estaciones de bicicletas públicas cerca",
  ciclovia: "Ciclovía más cercana",
};

export function construirPromptZona(d: DatosRelato): string {
  const lineas: string[] = [];
  lineas.push(`Barrio: ${d.barrio}`);
  if (d.comuna != null) lineas.push(`Comuna: ${d.comuna}`);
  if (d.area_km2 != null) lineas.push(`Superficie del barrio: ${d.area_km2} km²`);
  if (d.espacios_verdes_barrio) lineas.push(`Espacios verdes públicos en el barrio: ${d.espacios_verdes_barrio}`);

  for (const p of d.pois) {
    const etiqueta = ETIQUETAS[p.categoria] || p.categoria;
    // La distancia va YA convertida a cuadras: el modelo no hace cuentas.
    const dist = p.metros != null ? ` (a ${cuadrasEnPalabras(p.metros)})` : "";
    const det = p.detalle ? ` — ${p.detalle}` : "";
    lineas.push(`${etiqueta}: ${p.titulo}${det}${dist}`);
  }

  return `Sos un redactor inmobiliario argentino. Escribís para el dueño de una propiedad que va a
leer un informe de tasación hecho por su inmobiliaria.

Escribí UN texto de tres párrafos cortos sobre el barrio, siguiendo exactamente esta estructura:

1. UBICAR: qué tipo de barrio es y dónde está, usando solo los datos de abajo.
2. CAMINAR: qué tiene alrededor, contado como la experiencia de caminarlo. Usá las distancias en
   cuadras tal como están escritas abajo.
3. CERRAR: qué tipo de vida cotidiana habilita ese conjunto.

DATOS DISPONIBLES (lo único que existe):
${lineas.join("\n")}

REGLAS QUE NO SE NEGOCIAN:
- No nombres ningún lugar, calle, avenida, shopping, colegio, plaza ni institución que no esté en
  la lista de arriba. Ni uno.
- No inventes historia, fundación, arquitectura, tradición ni "es sabido que".
- No opines sobre el valor de la propiedad. Nada de inversión, oportunidad, revalorización, "es
  una zona que conviene" ni nada parecido. No es tu tema.
- No uses las palabras "datos", "fuente", "según", "registro" ni "relevamiento". El lector no
  tiene que enterarse de que esto salió de una lista.
- Si algo no está en la lista, no existe: no lo menciones y no aclares que falta.
- No uses títulos, viñetas, negritas ni markdown. Solo párrafos de texto corrido.
- Español rioplatense, voseo, tono sobrio y profesional. Nada de publicidad.
- Máximo 150 palabras en total.

Escribí solamente el texto, sin introducción ni comentarios.`;
}

/** Recorta sin partir una palabra al medio. */
function recortar(t: string, max: number): string {
  if (t.length <= max) return t;
  const corte = t.slice(0, max);
  const i = corte.lastIndexOf(" ");
  return (i > max * 0.6 ? corte.slice(0, i) : corte).trimEnd();
}

/**
 * Saca el andamiaje de markdown que el modelo mete aunque se le pida que no, y aplica el tope.
 * Sin esto, un `## El barrio` se imprime literal en un PDF de lujo.
 */
export function sanearRelato(texto: string): string {
  const limpio = (texto || "")
    .replace(/^#{1,6}\s+.*$/gm, "")        // encabezados
    .replace(/\*\*(.+?)\*\*/g, "$1")       // negritas
    .replace(/^\s*[-*•]\s+/gm, "")         // viñetas
    .replace(/\n{3,}/g, "\n\n")            // saltos de más
    .trim();
  return recortar(limpio, MAX_RELATO);
}

/**
 * Genera el relato. Devuelve cadena vacía si algo falla: la hoja se puede armar sin texto (el
 * asesor lo escribe a mano si quiere), pero NUNCA se cae la creación de la ficha por esto.
 */
export async function generarRelato(datos: DatosRelato): Promise<string> {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    // Mismo modelo que ya usa el ACM para analizar fotos.
    const model = genAI.getGenerativeModel({
      model: "gemini-3.5-flash",
      // Temperatura baja: acá no queremos creatividad, queremos que se ciña a la lista.
      generationConfig: { temperature: 0.4, maxOutputTokens: 600 },
    });
    const r = await model.generateContent(construirPromptZona(datos));
    return sanearRelato(r.response.text());
  } catch (e) {
    console.error("ACM zona: no se pudo generar el relato:", e);
    return "";
  }
}
```

- [ ] **Paso 4: correr el test y ver que pasa**

```bash
npx vitest run lib/acm/zona-relato.test.ts
```

Esperado: PASS, 10 tests.

- [ ] **Paso 5: commitear**

```bash
git add lib/acm/zona-relato.ts lib/acm/zona-relato.test.ts
git commit -m "feat(acm): relato del barrio con IA sobre datos verificados"
```

---

## Tarea 9 · El mapa

**Archivos:**
- Crear: `app/api/acm/mapa-zona/route.ts`

**Interfaces:**
- Consume: `FichaZonaPoi` (tarea 2).
- Produce: `GET /api/acm/mapa-zona?lat=&lon=&pois=<json>` → `image/png`. La URL la guarda la tarea 10.

- [ ] **Paso 1: escribir el endpoint**

```ts
// app/api/acm/mapa-zona/route.ts
// ACM · El mapa de la hoja del entorno: una IMAGEN FIJA, no un mapa interactivo.
//
// POR QUE FIJA: la ficha se imprime a PDF desde el navegador (ver PrintButton). Un mapa
// interactivo sale en blanco o a medio cargar en el PDF; un <img> ya cargado sale siempre.
//
// POR QUE OPENSTREETMAP Y NO MAPTILER: la NEXT_PUBLIC_MAPTILER_KEY del .env está restringida
// por dominio y devuelve 403 desde el servidor (medido). La app ya cae a OSM en
// components/mapa/mapa-lienzo.tsx; esto usa la misma fuente.
import { NextResponse } from "next/server";
import sharp from "sharp";
import { requireTenant } from "@/lib/auth/tenant-validation";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const TILE = 256;
const ZOOM = 15;          // ~1,2 km de ancho: entra el radio de casi todos los POIs
const ANCHO_TILES = 4;    // 1024 px
const ALTO_TILES = 3;     //  768 px
const UA = "PRISMA-acm/1.0 (inmobiliaria; contacto: osterrietchleonardo@vakdor.com)";

/** lon/lat → coordenadas de tile fraccionarias (Web Mercator). */
function aTile(lat: number, lon: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const latRad = (lat * Math.PI) / 180;
  return {
    x: ((lon + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  };
}

/** Un círculo de color con borde blanco, en SVG. Los emoji no se renderizan igual en todos lados. */
function marcador(x: number, y: number, color: string, r: number): string {
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" stroke="#ffffff" stroke-width="2.5"/>`;
}

const COLOR: Record<string, string> = {
  subte: "#1d4ed8", espacio_verde: "#15803d", escuela: "#b45309",
  hospital: "#be123c", comisaria: "#4338ca", ciclovia: "#0891b2",
};

export async function GET(req: Request) {
  try {
    // Endpoint autenticado: no es un proxy abierto de tiles para cualquiera de internet.
    await requireTenant();

    const url = new URL(req.url);
    const lat = Number(url.searchParams.get("lat"));
    const lon = Number(url.searchParams.get("lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return NextResponse.json({ error: "Faltan las coordenadas." }, { status: 400 });
    }

    let pois: Array<{ categoria: string; lat: number; lon: number }> = [];
    try {
      const crudo = JSON.parse(url.searchParams.get("pois") || "[]");
      if (Array.isArray(crudo)) {
        pois = crudo
          .filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lon))
          .slice(0, 12); // tope: son marcadores, no una capa de datos
      }
    } catch { /* sin marcadores extra, el mapa sale igual */ }

    const centro = aTile(lat, lon, ZOOM);
    const x0 = Math.floor(centro.x) - Math.floor(ANCHO_TILES / 2);
    const y0 = Math.floor(centro.y) - Math.floor(ALTO_TILES / 2);
    const ancho = ANCHO_TILES * TILE, alto = ALTO_TILES * TILE;

    // Bajar las tiles. Una que falle deja un hueco gris, no rompe el mapa entero.
    const tiles: Array<{ input: Buffer; top: number; left: number }> = [];
    await Promise.all(
      Array.from({ length: ANCHO_TILES * ALTO_TILES }, async (_, i) => {
        const dx = i % ANCHO_TILES, dy = Math.floor(i / ANCHO_TILES);
        try {
          const r = await fetch(`https://tile.openstreetmap.org/${ZOOM}/${x0 + dx}/${y0 + dy}.png`, {
            headers: { "User-Agent": UA },
            signal: AbortSignal.timeout(8000),
          });
          if (!r.ok) return;
          tiles.push({ input: Buffer.from(await r.arrayBuffer()), top: dy * TILE, left: dx * TILE });
        } catch { /* hueco */ }
      })
    );
    if (tiles.length === 0) {
      return NextResponse.json({ error: "No se pudo armar el mapa." }, { status: 502 });
    }

    // Píxel dentro de la imagen para una coordenada.
    const aPixel = (la: number, lo: number) => {
      const t = aTile(la, lo, ZOOM);
      return { x: (t.x - x0) * TILE, y: (t.y - y0) * TILE };
    };

    const marcas: string[] = [];
    for (const p of pois) {
      const { x, y } = aPixel(p.lat, p.lon);
      if (x < 8 || y < 8 || x > ancho - 8 || y > alto - 8) continue; // fuera de cuadro
      marcas.push(marcador(x, y, COLOR[p.categoria] || "#525252", 8));
    }
    // La propiedad va última para que quede ARRIBA de todo, y más grande.
    const c = aPixel(lat, lon);
    marcas.push(`<circle cx="${c.x}" cy="${c.y}" r="16" fill="#0a1f33" fill-opacity="0.18"/>`);
    marcas.push(marcador(c.x, c.y, "#0a1f33", 11));

    // El crédito de OpenStreetMap es CONDICION DE LA LICENCIA para usar estas tiles, no una cita
    // de fuente: la ficha no nombra ninguna otra. Va chico y sobre una banda semitransparente
    // para que se lea sobre cualquier mapa.
    const credito =
      `<rect x="${ancho - 168}" y="${alto - 20}" width="168" height="20" fill="#ffffff" fill-opacity="0.72"/>` +
      `<text x="${ancho - 6}" y="${alto - 6}" text-anchor="end" font-family="sans-serif" font-size="11" fill="#444444">© OpenStreetMap</text>`;

    const svg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}">${marcas.join("")}${credito}</svg>`
    );

    const png = await sharp({
      create: { width: ancho, height: alto, channels: 4, background: "#e8e6e1" },
    })
      .composite([...tiles, { input: svg, top: 0, left: 0 }])
      .png({ compressionLevel: 9 })
      .toBuffer();

    return new NextResponse(png as any, {
      headers: {
        "Content-Type": "image/png",
        // El mapa de una coordenada no cambia: que lo cachee el CDN y no volvamos a pedirle
        // tiles a OSM cada vez que alguien abre la ficha.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (e: any) {
    console.error("ACM mapa-zona error:", e);
    if (e.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "No se pudo armar el mapa." }, { status: 500 });
  }
}
```

- [ ] **Paso 2: levantar el server y mirar el PNG**

```bash
npm run dev
```

Con sesión iniciada en el navegador, abrir:

```
http://localhost:3000/api/acm/mapa-zona?lat=-34.5538758&lon=-58.4594721&pois=[{"categoria":"subte","lat":-34.5623,"lon":-58.4556},{"categoria":"espacio_verde","lat":-34.5601,"lon":-58.4531}]
```

Esperado: un PNG de 1024×768 con el mapa de Belgrano, un punto azul oscuro grande en Arcos 2800,
un punto azul (subte) y uno verde (espacio verde), y `© OpenStreetMap` abajo a la derecha.

**Verificar la ubicación, no solo que aparezca la imagen:** el punto grande tiene que caer sobre
Arcos y Juramento aproximadamente. Si cae en el medio del río o en otra parte de la ciudad, la
conversión de coordenadas está mal (lat y lon dados vuelta es el error clásico).

- [ ] **Paso 3: commitear**

```bash
git add app/api/acm/mapa-zona/route.ts
git commit -m "feat(acm): mapa estatico de la zona con marcadores"
```

---

## Tarea 10 · Integrar en el endpoint de la ficha

**Archivos:**
- Modificar: `app/api/acm/ficha/route.ts`

**Interfaces:**
- Consume: `obtenerZona` (tarea 6), `generarRelato` (tarea 8), el endpoint de la tarea 9.
- Produce: en `preview`, el campo `zona` en la respuesta JSON; al confirmar, `snapshot.zona`.
  Lo consume la tarea 11.

- [ ] **Paso 1: agregar los imports**

En `app/api/acm/ficha/route.ts`, junto a los imports de `@/lib/acm/…`:

```ts
import { obtenerZona } from "@/lib/acm/zona";
import { generarRelato } from "@/lib/acm/zona-relato";
import type { FichaZona } from "@/lib/acm/ficha";
```

Y agregar `FichaZona` a los tipos ya importados desde `@/lib/acm/ficha` si preferís una sola línea.

- [ ] **Paso 2: leer los campos nuevos del body**

Después de la línea que lee `conclusionesIn` (`route.ts:66-68`):

```ts
    // Hoja del entorno. En `preview` se calcula y se devuelve para que el asesor la revise; al
    // confirmar, el navegador manda de vuelta el texto ya editado y el resto de los datos duros.
    // `incluir_zona === false` = el asesor la destildó y la ficha sale sin esa hoja.
    const incluirZona: boolean = body.incluir_zona !== false;
    const zonaIn: FichaZona | null =
      body.zona && typeof body.zona === "object" ? (body.zona as FichaZona) : null;
```

- [ ] **Paso 3: calcular la zona en el modo preview**

Reemplazar el bloque `if (preview) { … }` (`route.ts:187-194`) por:

```ts
    // Modo revisión: se calcula todo, se devuelve para que el asesor lo revise, y se corta acá
    // (no se guarda nada, no se consume token).
    if (preview) {
      let zona: FichaZona | null = null;
      let zonaCentro: { lat: number; lon: number } | null = null;

      if (incluirZona) {
        try {
          const calc = await obtenerZona(supabase, sujeto.direccion || "", sujeto.barrio || "");
          if (calc) {
            // El relato es lo único que cuesta plata y lo único que puede tardar. Si falla,
            // devuelve cadena vacía y el asesor escribe el texto a mano: los datos duros ya
            // están y la hoja se puede armar igual.
            const relato = await generarRelato(calc.zona);
            // mapa_url va en null: la imagen la pide el navegador del asesor (el endpoint
            // exige sesión) y su URL vuelve en el pedido de confirmación.
            zona = { ...calc.zona, relato, mapa_url: null };
            zonaCentro = calc.centro;
          }
        } catch (e) {
          // La zona NUNCA puede impedir que el asesor arme su ficha.
          console.error("ACM ficha: no se pudo calcular la zona:", e);
        }
      }

      return NextResponse.json({
        preview: true,
        conclusiones: comparison.conclusiones,
        promedio_m2: comparison.promedio_m2,
        desvio_prom_pct: comparison.desvio_prom_pct,
        zona,
        zona_centro: zonaCentro,
      });
    }
```

- [ ] **Paso 4: guardar la zona al confirmar**

En el armado del `snapshot` (`route.ts:206-234`), después de `comparison`:

```ts
      // Lo que revisó y editó el asesor, tal cual. No se recalcula ni se vuelve a llamar a la
      // IA: lo que el asesor leyó y aprobó es exactamente lo que va a ver el cliente.
      zona: incluirZona && zonaIn && zonaIn.relato ? zonaIn : null,
```

- [ ] **Paso 5: verificar que compila y que no rompió nada**

```bash
npx tsc --noEmit
npm test
```

Esperado: sin errores nuevos, tests verdes.

- [ ] **Paso 6: commitear**

```bash
git add app/api/acm/ficha/route.ts
git commit -m "feat(acm): calcular y guardar la zona al crear la ficha"
```

---

## Tarea 11 · El bloque de revisión del asesor

**Archivos:**
- Crear: `app/asesor/acm/components/revision-zona.tsx`
- Modificar: `app/asesor/acm/components/comparables-result.tsx`

**Interfaces:**
- Consume: `FichaZona` (tarea 2), la respuesta de `preview` (tarea 10).
- Produce: el componente `<RevisionZona />`, y `zona` / `incluirZona` en el body de `crearFicha`.

- [ ] **Paso 1: escribir el componente**

```tsx
// app/asesor/acm/components/revision-zona.tsx
// ACM · El bloque donde el asesor revisa la hoja del entorno antes de crear la ficha.
//
// El texto es editable; los datos duros NO. Se muestran igual, de solo lectura, porque revisar
// un texto sin ver sobre qué se escribió es revisar al aire: sin esto el asesor no tiene cómo
// saber si la IA se inventó una estación de subte.
"use client";

import { CheckSquare, Square, MapPin } from "lucide-react";
import type { FichaZona } from "@/lib/acm/ficha";

const ETIQUETA: Record<string, string> = {
  subte: "Subte", espacio_verde: "Espacio verde", escuela: "Escuelas", hospital: "Hospital",
  farmacia: "Farmacias", parada_colectivo: "Colectivos", comisaria: "Comisaría",
  ecobici: "Ecobici", ciclovia: "Ciclovía",
};

export function RevisionZona({
  zona, incluir, onIncluir, onRelato,
}: {
  zona: FichaZona | null;
  incluir: boolean;
  onIncluir: (v: boolean) => void;
  onRelato: (v: string) => void;
}) {
  if (!zona) {
    return (
      <div className="p-3.5 rounded-xl border border-accent/15 bg-muted/30 text-sm text-muted-foreground">
        No pudimos armar el análisis del entorno para esta dirección. La ficha se crea igual, sin esa hoja.
      </div>
    );
  }

  return (
    <div className="space-y-3 pt-1">
      <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
        <button
          type="button"
          onClick={() => onIncluir(!incluir)}
          className="text-accent"
          aria-label={incluir ? "Sacar la hoja del entorno" : "Incluir la hoja del entorno"}
        >
          {incluir ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5 text-muted-foreground/50" />}
        </button>
        Incluir la hoja &ldquo;La propiedad y su entorno&rdquo;
      </label>

      {incluir && (
        <>
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-accent">
            <MapPin className="w-3.5 h-3.5" />
            {zona.barrio}{zona.comuna != null ? ` · Comuna ${zona.comuna}` : ""}
          </div>

          <textarea
            value={zona.relato}
            onChange={(e) => onRelato(e.target.value)}
            rows={8}
            placeholder="El texto del barrio. Podés reescribirlo entero."
            className="w-full rounded-xl border border-accent/20 bg-background/50 p-3 text-sm leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-accent"
          />

          <div>
            <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">
              Datos con los que se escribió (van en la hoja tal cual, no se editan):
            </p>
            <div className="flex flex-wrap gap-1.5">
              {zona.pois.map((p) => (
                <span
                  key={p.categoria}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-accent/15 bg-background/60"
                >
                  <span className="text-muted-foreground">{ETIQUETA[p.categoria] || p.categoria}:</span>{" "}
                  <span className="font-semibold">{p.titulo}</span>
                  {p.metros != null && <span className="text-muted-foreground"> · {p.metros} m</span>}
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Paso 2: enganchar el estado en `comparables-result.tsx`**

Junto a los otros `useState` (cerca de `route.ts` línea 340 del componente):

```tsx
  const [zona, setZona] = useState<FichaZona | null>(null);
  const [incluirZona, setIncluirZona] = useState(true);
  const [zonaCentro, setZonaCentro] = useState<{ lat: number; lon: number } | null>(null);
```

Importar el tipo y el componente:

```tsx
import type { FichaZona } from "@/lib/acm/ficha";
import { RevisionZona } from "./revision-zona";
```

En `revisarConclusiones`, después de `setConclusiones(...)`:

```tsx
      setZona(data.zona ?? null);
      setZonaCentro(data.zona_centro ?? null);
      setIncluirZona(Boolean(data.zona));
```

En `crearFicha`, dentro del `body`:

```tsx
          incluir_zona: incluirZona && Boolean(zona),
          zona: incluirZona && zona ? { ...zona, mapa_url: urlDelMapa() } : null,
```

Y arriba de `crearFicha`, el armado de la URL del mapa:

```tsx
  /**
   * URL del PNG del mapa. Se arma acá y no en el servidor porque el endpoint pide sesión: el
   * navegador del asesor la tiene, y la ficha pública después sirve la imagen ya generada por
   * el caché del CDN.
   */
  const urlDelMapa = (): string | null => {
    if (!zonaCentro || !zona) return null;
    const pois = zona.pois
      .filter((p) => p.lat != null && p.lon != null)
      .map((p) => ({ categoria: p.categoria, lat: p.lat, lon: p.lon }));
    const q = new URLSearchParams({
      lat: String(zonaCentro.lat),
      lon: String(zonaCentro.lon),
      pois: JSON.stringify(pois),
    });
    return `/api/acm/mapa-zona?${q.toString()}`;
  };
```

- [ ] **Paso 3: montar el bloque en el modal**

En el modal de revisión, **antes** del `<label>` de "Incluir la sección de conclusiones"
(alrededor de la línea 799):

```tsx
                <RevisionZona
                  zona={zona}
                  incluir={incluirZona}
                  onIncluir={setIncluirZona}
                  onRelato={(v) => setZona((z) => (z ? { ...z, relato: v } : z))}
                />

                <div className="h-px bg-accent/10" />
```

Y cambiar el título del modal, que ahora cubre dos cosas:

```tsx
                <h3 className="text-lg font-black flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-accent" /> Revisá antes de crear la ficha
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  El análisis del entorno lo escribió la IA con datos reales del barrio, y las conclusiones
                  se calcularon con los comparables que elegiste. Podés editar todo o sacar cualquiera de
                  las dos secciones.
                </p>
```

- [ ] **Paso 4: verificar en el navegador**

```bash
npm run dev
```

Entrar con las credenciales del `.env`, ir a un ACM con comparables, tocar **Crear ficha**, elegir
comparables y **Revisar**. Verificar:

1. Aparece el bloque del entorno con el barrio correcto.
2. El texto se puede editar y lo editado se conserva al tocar Crear.
3. Al destildar, el bloque se colapsa.
4. Los chips de datos muestran nombres reales y distancias creíbles.

- [ ] **Paso 5: commitear**

```bash
git add app/asesor/acm/components/revision-zona.tsx app/asesor/acm/components/comparables-result.tsx
git commit -m "feat(acm): revision de la hoja del entorno antes de crear la ficha"
```

---

## Tarea 12 · La hoja en la ficha pública

**Archivos:**
- Modificar: `app/ficha-acm/[token]/page.tsx`

**Interfaces:**
- Consume: `snapshot.zona` (tareas 2 y 10).
- Produce: la hoja impresa. Es la última tarea.

- [ ] **Paso 1: sacar la descripción de la portada**

En el bloque de la portada, **borrar**:

```tsx
          {subject.descripcion && (
            <p className="cover-desc">{subject.descripcion}</p>
          )}
```

La regla CSS `.cover-desc` se conserva: la reusa la hoja nueva.

- [ ] **Paso 2: insertar la hoja entre la portada y los comparables**

Justo **después** del `</section>` de la portada y **antes** del `{comparables.map(...)}`:

```tsx
      {/* ══════════ LA PROPIEDAD Y SU ENTORNO ══════════ */}
      {/* Ausente en las fichas anteriores a ago-2026 y cuando el asesor la destildó. */}
      {snap.zona && (
        <EntornoSheet
          zona={snap.zona} descripcion={subject.descripcion || ""} primary={primary} accent={accent}
          onPrimary={onPrimary} brand={brand} agencyName={agencyName}
        />
      )}
```

- [ ] **Paso 3: escribir el componente de la hoja**

Antes de `function ComparableSheet(...)`:

```tsx
// ── Hoja "La propiedad y su entorno" ─────────────────────────────────────────
// Dos columnas: a la izquierda lo que se lee (la descripción de la propiedad y el relato del
// barrio), a la derecha lo que se consulta (el mapa y los datos). La hoja NO nombra ninguna
// fuente de datos: el único crédito está dibujado dentro del PNG del mapa, por licencia.
const ICONO_ZONA: Record<string, string> = {
  subte: "🚇", espacio_verde: "🌳", escuela: "🎓", hospital: "🏥",
  farmacia: "💊", parada_colectivo: "🚌", comisaria: "🚓", ecobici: "🚲", ciclovia: "🚴",
};

function EntornoSheet({
  zona, descripcion, primary, accent, onPrimary, brand, agencyName,
}: {
  zona: FichaZona; descripcion: string; primary: string; accent: string; onPrimary: string;
  brand: FichaBrand; agencyName: string;
}) {
  const contexto = [
    zona.comuna != null ? `Comuna ${zona.comuna}` : null,
    zona.area_km2 != null ? `${zona.area_km2} km²` : null,
    zona.espacios_verdes_barrio
      ? `${zona.espacios_verdes_barrio} espacios verdes`
      : null,
  ].filter(Boolean).join(" · ");

  return (
    <section className="sheet">
      <div className="pulso" style={{ backgroundColor: primary, color: onPrimary }}>
        <div className="pulso-left">
          <span className="pulso-eyebrow" style={{ color: accent }}>LA PROPIEDAD Y SU ENTORNO</span>
          <div className="pulso-barrio">{zona.barrio}</div>
        </div>
        {contexto && (
          <div className="pulso-right">
            <span className="pulso-sub">{contexto}</span>
          </div>
        )}
      </div>

      <div className="sheet-body entorno-body">
        <div className="entorno-col">
          {descripcion && (
            <>
              <h3 className="entorno-h" style={{ fontFamily: "var(--font-display)", color: primary }}>La propiedad</h3>
              <p className="entorno-texto">{descripcion}</p>
            </>
          )}
          {zona.relato && (
            <>
              <h3 className="entorno-h" style={{ fontFamily: "var(--font-display)", color: primary }}>El barrio</h3>
              {zona.relato.split(/\n{2,}/).map((p, i) => (
                <p key={i} className="entorno-texto">{p}</p>
              ))}
            </>
          )}
        </div>

        <div className="entorno-col">
          {zona.mapa_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={zona.mapa_url} alt={`Mapa de ${zona.barrio}`} className="entorno-mapa" loading="eager" />
          )}
          <div className="entorno-pois">
            {zona.pois.map((p) => (
              <div key={p.categoria} className="entorno-poi">
                <span className="entorno-poi-ico">{ICONO_ZONA[p.categoria] || "📍"}</span>
                <div className="entorno-poi-txt">
                  <div className="entorno-poi-tit" style={{ color: primary }}>{p.titulo}</div>
                  <div className="entorno-poi-sub">
                    {[p.detalle, p.metros != null ? metrosLegible(p.metros) : null].filter(Boolean).join(" · ")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <SheetFooter brand={brand} agencyName={agencyName} primary={primary} />
    </section>
  );
}
```

Agregar los imports al principio del archivo:

```tsx
import type { AcmFichaSnapshot, FichaBrand, FichaComparable, FichaZona } from "@/lib/acm/ficha";
import { metrosLegible } from "@/lib/acm/zona-formato";
```

- [ ] **Paso 4: agregar el CSS**

En la constante `CSS`, después del bloque de la portada:

```css
/* Hoja del entorno — dos columnas. La izquierda se lee, la derecha se consulta.
   Los dos textos tienen clamp: la hoja es un A4 EXACTO y acá no hay ninguna foto que
   absorba el sobrante (a diferencia de la hoja del comparable, donde .gallery hace de
   esponja). Sin clamp, un relato largo empuja el pie fuera de la página impresa. */
.entorno-body { display: grid; grid-template-columns: 1fr 82mm; gap: 10mm; align-items: start; }
.entorno-col { min-width: 0; }
.entorno-h { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .18em; margin: 0 0 6px; }
.entorno-h + .entorno-texto { margin-top: 0; }
.entorno-texto {
  font-size: 12px; line-height: 1.62; color: #4a4a4a; margin: 0 0 10px;
  max-height: 132px; overflow: hidden;
  display: -webkit-box; -webkit-line-clamp: 7; -webkit-box-orient: vertical;
}
.entorno-mapa {
  width: 100%; height: 62mm; object-fit: cover; border-radius: 12px;
  background: #e8e6e1; display: block; margin-bottom: 8px;
}
.entorno-pois { display: flex; flex-direction: column; gap: 6px; }
.entorno-poi { display: flex; align-items: flex-start; gap: 8px; }
.entorno-poi-ico { font-size: 14px; line-height: 1.2; flex-shrink: 0; width: 18px; }
.entorno-poi-txt { min-width: 0; }
.entorno-poi-tit { font-size: 11.5px; font-weight: 700; line-height: 1.25; }
.entorno-poi-sub { font-size: 9.5px; color: #8a8a8a; line-height: 1.3; margin-top: 1px; }
.pulso-barrio { font-size: 17px; font-weight: 700; line-height: 1.15; margin-top: 2px; }
```

**`.pulso-barrio` ya existe** en el CSS (la usa la página final, `page.tsx:188`). Verificá antes de
agregarla: si ya está, no la dupliques.

- [ ] **Paso 5: verificar en el navegador — pantalla, celular e impresión**

```bash
npm run dev
```

1. Crear una ficha completa desde el ACM con la hoja del entorno tildada.
2. Abrir el link. Verificar: la portada **ya no tiene** la descripción; la hoja 2 existe, con el
   barrio en el banner, las dos columnas, el mapa y los datos.
3. **Emulación de dispositivo** (no achicar la ventana): que la hoja no desborde horizontalmente.
4. **Descargar PDF** y verificar en el PDF: que la hoja del entorno ocupe **una sola página**, que
   el mapa aparezca, y que el pie de marca esté abajo de todo y no cortado.

**El caso peor que hay que probar a mano:** una descripción de 700 caracteres (el tope) **más** un
relato de 900 (el tope). Si con eso el pie se cae a una segunda página, bajar `-webkit-line-clamp`
de 7 a 6 en `.entorno-texto`.

- [ ] **Paso 6: correr todo y commitear**

```bash
npx tsc --noEmit
npm test
git add app/ficha-acm/\[token\]/page.tsx
git commit -m "feat(acm): hoja La propiedad y su entorno en la ficha publica"
```

---

## Cierre

- [ ] **Actualizar la documentación**

Los cuatro documentos que se actualizan con cada cambio no trivial:

- `docs/interno/TECNICO-PRISMA.md` — las tablas nuevas, la función SQL, el script de carga y cómo
  se vuelve a correr.
- `docs/interno/LOGICA-PRISMA.md` — qué decide qué: cuándo sale la hoja y cuándo no.
- `docs/compartible/estandarizada/FUNCIONAL-ASESOR.md` — qué ve y qué puede editar el asesor, en
  lenguaje de usuario (ver el criterio de redacción del propio documento: sin tecnicismos).
- `docs/compartible/estandarizada/FUNCIONAL-DIRECTOR.md` — qué suma la hoja al informe del cliente.

- [ ] **Verificación final antes de pasárselo a Leonardo**

```bash
npm test
npx tsc --noEmit
npm run build
```

Y las dos pasadas en el navegador (escritorio y celular con emulación de dispositivo), con una
ficha creada de punta a punta, incluyendo el PDF descargado.

- [ ] **Probar una propiedad de GBA**

Armar un ACM con una dirección de Olivos y verificar que la hoja salga (por Overpass) y que se vea
**idéntica** a la de CABA: sin ninguna mención de que los datos vinieron de otro lado.
