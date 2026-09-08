# ACM · comparables solo dentro de las zonas dibujadas — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el asesor o el director pueda elegir, antes de apretar "Buscar comparables", una o varias de las zonas que ya dibujó en el mapa del Buscador IA, y que el ACM devuelva únicamente comparables que caen adentro de ese dibujo.

**Architecture:** El recorte se hace **en SQL**, agregando un parámetro `p_poligonos text[]` a las dos funciones que ya usa el ACM (`acm_match_properties` y `acm_match_roomix`), con la condición `point(lng,lat) <@ any(p_poligonos::polygon[])` — la única forma medida que engancha el índice `mercado_avisos_punto_idx` (30 ms contra 184 ms). Cuando hay polígono, reemplaza al gate de barrio y la dimensión "zona" puntúa 100 con peso 20. Cuando no hay, **nada cambia**. La API resuelve los ids de zona contra `mapa_zonas` filtrando por `user_id` y nunca acepta un polígono crudo del navegador.

**Tech Stack:** Next.js (App Router), TypeScript, Supabase/Postgres (plpgsql, índices GiST sobre `point`), vitest para `lib/**` y `app/api/**`, `node --test` para `lib/mapa/**`, shadcn/ui + Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-07-acm-comparables-por-zona-dibujada-design.md`

**Rama:** `feat/acm-comparables-por-zona` (ya creada desde `main`).

## Global Constraints

- **La forma del filtro geográfico es obligatoria:** `point(lng, lat) <@ any(p_poligonos::polygon[])`. Escrito como `exists (select 1 from unnest(...) ...)` el índice NO entra (184 ms y creciendo, contra 30 ms — medido 7-sep-2026).
- **Sin zona elegida, el resultado tiene que ser idéntico al de hoy**, id por id y `match_pct` por `match_pct`.
- **La API nunca acepta un polígono del navegador.** Solo `zona_ids`, y se resuelven contra `mapa_zonas` filtrando **también** por `user_id`. `createAdminClient` saltea RLS, así que ese filtro no es opcional.
- **Nunca caer al modo barrio en silencio.** Si el modo zona no puede resolver ninguna zona válida, se avisa y no se busca.
- **Tope: 10 zonas por búsqueda.** El tope de vértices por zona ya lo pone `poligonoParaSql` en 5.000.
- **Zona con dibujo: `sc_zona = 100`, `w_zona = 20`** en las dos funciones.
- **Los dos modos son excluyentes** y el modo barrio es el que viene puesto: al abrir el ACM no hay ninguna zona tildada.
- **DDL a producción por Management API** con `SUPABASE_API_KEY_MANAGEMENT` y `SUPABASE_PROJECT_REF` (los dos en `.env`). Las migraciones del repo NO se aplican solas.
- **Nunca `git add -A`.** Se agregan los archivos por nombre.
- **Los tests de `lib/mapa/**` corren con `node --test`**, no con vitest, y sus imports llevan extensión `.ts`. Todo lo demás (`lib/**`, `app/api/**`) corre con vitest. El script completo es `npm test`.

---

## Datos verificados para las pruebas (producción, 7 y 8-sep-2026)

Esto está medido, no supuesto. Sin esto, las pruebas de las Tasks 3, 4 y 9 miden cero y se ven verdes igual.

| | |
|---|---|
| Agencia propia (con la que se prueba) | **PRISMAIA - VAKDOR** · `57c6134b-89dc-4968-bd1a-27364cf99195` |
| Agencia del cliente — **no se toca** | Central Real Estate Argentina · `4962bf85-a92c-4c33-ba07-380686bbab76` |
| Cartera de PRISMAIA | 135 propiedades, 134 con coordenadas |

**Las dos pruebas SQL necesitan zonas DISTINTAS, y no es un capricho:**

- **La cartera de PRISMAIA está en La Plata** (74 en La Plata, 15 en Los Bosquecitos, el resto en Brandsen y alrededores). Las tres zonas guardadas hoy ("BUSQUEDA MAXI", "test", "zona prueba") están todas en CABA y **no contienen ni una sola propiedad de PRISMAIA**. Con cualquiera de ellas, la prueba de la cartera devuelve 0 filas y no prueba nada.
- **`mercado_avisos` no tiene ni un aviso en La Plata**: la red solo cubre CABA (0 avisos en el recuadro lat −35,00/−34,88 × lng −58,03/−57,89). Con una zona de La Plata, la prueba de la red devuelve 0 filas y tampoco prueba nada.

Entonces:

| Prueba | Zona a usar | Barrio del sujeto |
|---|---|---|
| Task 3 · cartera (`acm_match_properties`) | **una zona nueva, dibujada sobre La Plata** (centro aproximado lat −34,9296 / lng −57,9571) | `La Plata` |
| Task 4 · red (`acm_match_roomix`) | una de las de CABA ya guardadas: `test` o `zona prueba` | `Belgrano` |

La zona de La Plata se dibuja **desde la app**, en el Buscador IA → solapa Mapa → dibujar el área → guardarla con un nombre (por ejemplo "ACM prueba La Plata"). Es el mismo camino que va a usar el asesor, así que dibujarla también verifica que ese camino sigue funcionando.

**Las dos pruebas tienen que abortar si midieron cero.** Un `afuera: 0` sobre `total: 0` es verde y no significa nada.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `lib/acm/zonas-poligonos.ts` *(nuevo)* | Función pura: filas de `mapa_zonas` → polígonos SQL + qué zonas se usaron + cuáles no sirvieron. Sin red, sin Supabase. |
| `lib/acm/zonas-poligonos.test.ts` *(nuevo)* | Sus tests (vitest). |
| `supabase/migrations/20260908120000_acm_zona_dibujada.sql` *(nuevo)* | Las dos funciones con `p_poligonos`. |
| `supabase/rollback/20260908_acm_zona_dibujada_rollback.sql` *(nuevo)* | Las dos funciones como están HOY, para volver atrás. |
| `lib/tasacion/types.ts` | Campo `zonas` en `Sujeto`. |
| `app/api/acm/comparables/route.ts` | Recibe `zona_ids`, resuelve, pasa `p_poligonos`, guarda y reporta. |
| `app/api/acm/comparables/route.test.ts` *(nuevo)* | Tests del endpoint con cliente de base falso. |
| `app/asesor/acm/components/subject-input.tsx` | El selector de dos modos excluyentes + las casillas de zonas. |
| `app/asesor/acm/components/acm-module.tsx` | Estado `modoZona` / `zonasElegidas` / `zonasUsadas`, el body, el reset y la reapertura del historial. |
| `app/asesor/acm/components/comparables-result.tsx` | El chip "Dentro de:", el cartel de pocos comparables y el botón "Buscar sin la zona". |

---

## Task 1: La función pura que convierte zonas en polígonos

**Files:**
- Create: `lib/acm/zonas-poligonos.ts`
- Test: `lib/acm/zonas-poligonos.test.ts`

**Interfaces:**
- Consumes: `poligonoParaSql` de `lib/mapa/poligono-sql.ts` (ya existe; devuelve `string | null`, sin imports propios, así que se puede importar desde vitest sin problema).
- Produces:
  ```ts
  export const MAX_ZONAS_POR_BUSQUEDA = 10
  export interface ZonaFila { id: string; nombre: string; geojson: unknown }
  export interface ZonasResueltas {
    poligonos: string[]
    usadas: { id: string; nombre: string }[]
    invalidas: string[]
  }
  export function resolverZonas(filas: ZonaFila[]): ZonasResueltas
  ```

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/acm/zonas-poligonos.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { resolverZonas, MAX_ZONAS_POR_BUSQUEDA, type ZonaFila } from "./zonas-poligonos"

/**
 * De filas de `mapa_zonas` a los literales de polígono que entiende Postgres.
 *
 * Las tres reglas que sostiene este archivo:
 *  1. Un dibujo roto se ignora SOLO A ÉL y queda anotado por nombre — nunca cancela la búsqueda
 *     de las otras zonas ni desaparece en silencio.
 *  2. El orden de `poligonos` y de `usadas` es el mismo, y solo entran las que convirtieron.
 *  3. Hay un tope de zonas por búsqueda.
 */

// Un cuadrado válido alrededor de Belgrano. GeoJSON va [lng, lat].
const cuadrado = (lng: number, lat: number) => ({
  type: "Polygon",
  coordinates: [[[lng, lat], [lng + 0.01, lat], [lng + 0.01, lat + 0.01], [lng, lat + 0.01], [lng, lat]]],
})

const fila = (id: string, nombre: string, geojson: unknown): ZonaFila => ({ id, nombre, geojson })

describe("resolverZonas", () => {
  it("convierte una zona válida y la deja anotada como usada", () => {
    const r = resolverZonas([fila("z1", "Belgrano bajo", cuadrado(-58.45, -34.56))])

    expect(r.poligonos).toHaveLength(1)
    expect(r.poligonos[0].startsWith("((-58.45,-34.56)")).toBe(true)
    expect(r.usadas).toEqual([{ id: "z1", nombre: "Belgrano bajo" }])
    expect(r.invalidas).toEqual([])
  })

  it("convierte varias y mantiene el mismo orden en polígonos y en usadas", () => {
    const r = resolverZonas([
      fila("z1", "A", cuadrado(-58.45, -34.56)),
      fila("z2", "B", cuadrado(-58.47, -34.58)),
    ])

    expect(r.poligonos).toHaveLength(2)
    expect(r.usadas.map((z) => z.nombre)).toEqual(["A", "B"])
  })

  it("descarta SOLO el dibujo roto y lo anota por nombre", () => {
    const r = resolverZonas([
      fila("z1", "La buena", cuadrado(-58.45, -34.56)),
      fila("z2", "La rota", { type: "Polygon", coordinates: [[[-58.4, -34.5]]] }), // 1 punto: no es un anillo
    ])

    expect(r.poligonos).toHaveLength(1)
    expect(r.usadas.map((z) => z.nombre)).toEqual(["La buena"])
    expect(r.invalidas).toEqual(["La rota"])
  })

  it("cuando NINGUNA sirve devuelve cero polígonos: quien llama tiene que avisar, no buscar sin filtro", () => {
    const r = resolverZonas([fila("z2", "La rota", { type: "Point", coordinates: [-58.4, -34.5] })])

    expect(r.poligonos).toEqual([])
    expect(r.usadas).toEqual([])
    expect(r.invalidas).toEqual(["La rota"])
  })

  it("corta en el tope de zonas por búsqueda", () => {
    const muchas = Array.from({ length: MAX_ZONAS_POR_BUSQUEDA + 3 }, (_, i) =>
      fila(`z${i}`, `Zona ${i}`, cuadrado(-58.45 - i * 0.02, -34.56))
    )

    const r = resolverZonas(muchas)

    expect(r.poligonos).toHaveLength(MAX_ZONAS_POR_BUSQUEDA)
    expect(r.usadas).toHaveLength(MAX_ZONAS_POR_BUSQUEDA)
  })

  it("una lista vacía no es un error: cero polígonos y nada anotado", () => {
    const r = resolverZonas([])

    expect(r).toEqual({ poligonos: [], usadas: [], invalidas: [] })
  })
})
```

- [ ] **Step 2: Correr el test y verlo fallar**

```
npx vitest run lib/acm/zonas-poligonos.test.ts
```

Esperado: FALLA con "Failed to resolve import ./zonas-poligonos".

- [ ] **Step 3: Escribir la implementación mínima**

Crear `lib/acm/zonas-poligonos.ts`:

```ts
// ACM · de las zonas que el asesor dibujó en el mapa a los literales de polígono de Postgres.
//
// Vive acá y no en lib/mapa a propósito: lib/mapa corre sus tests con `node --test` (así lo
// excluye vitest.config.ts) y esto se testea con vitest junto al resto del ACM. La conversión
// en sí no se reescribe: la hace `poligonoParaSql`, que ya está probada en producción desde el
// 26-ago-2026 con el Buscador IA.
import { poligonoParaSql } from "@/lib/mapa/poligono-sql"

/**
 * Cuántas zonas puede sumar una sola búsqueda.
 *
 * El tope de VÉRTICES por zona ya lo pone `poligonoParaSql` (5.000). Este es el otro lado: el
 * filtro se resuelve por índice con `<@ any(array)`, pero el array igual se recorre, y diez
 * zonas es más de lo que un ACM defendible necesita.
 */
export const MAX_ZONAS_POR_BUSQUEDA = 10

/** Una fila de `mapa_zonas`, con lo poco que hace falta acá. */
export interface ZonaFila {
  id: string
  nombre: string
  geojson: unknown
}

export interface ZonasResueltas {
  /** Literales `((lng,lat),...)` listos para `p_poligonos`. Mismo orden que `usadas`. */
  poligonos: string[]
  /** Las que efectivamente entraron a la búsqueda (para el snapshot y el chip de pantalla). */
  usadas: { id: string; nombre: string }[]
  /** Nombres de las que no se pudieron convertir. Se avisan; NUNCA se ignoran en silencio. */
  invalidas: string[]
}

/**
 * Un dibujo roto descarta SOLO a esa zona, no a la búsqueda: si alguna quedó mal guardada, las
 * demás tienen que seguir sirviendo. Pero se devuelve su nombre para que quien llama lo diga.
 *
 * Si NINGUNA convierte, esto devuelve `poligonos: []`. Quien llama tiene que avisar y no buscar:
 * buscar sin filtro sería devolver una búsqueda distinta de la que el asesor pidió.
 */
export function resolverZonas(filas: ZonaFila[]): ZonasResueltas {
  const poligonos: string[] = []
  const usadas: { id: string; nombre: string }[] = []
  const invalidas: string[] = []

  for (const fila of filas.slice(0, MAX_ZONAS_POR_BUSQUEDA)) {
    const poligono = poligonoParaSql(fila.geojson)
    if (poligono) {
      poligonos.push(poligono)
      usadas.push({ id: fila.id, nombre: fila.nombre })
    } else {
      invalidas.push(fila.nombre)
    }
  }

  return { poligonos, usadas, invalidas }
}
```

- [ ] **Step 4: Correr el test y verlo pasar**

```
npx vitest run lib/acm/zonas-poligonos.test.ts
```

Esperado: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/acm/zonas-poligonos.ts lib/acm/zonas-poligonos.test.ts
git commit -m "feat(acm): convertir las zonas dibujadas en polígonos de Postgres"
```

---

## Task 2: Guardar el estado actual de las dos funciones como rollback

**Files:**
- Create: `supabase/rollback/20260908_acm_zona_dibujada_rollback.sql`
- Create: `scripts/sql-produccion.mjs`

**Interfaces:**
- Produces: `scripts/sql-produccion.mjs` exporta `sql(query: string): Promise<any[]>` y, si se lo llama con un argumento, lo imprime. Lo usan las Tasks 3, 4 y 9.

Esta tarea no tiene test propio: su entregable **es** la red de seguridad de las dos siguientes. Se verifica comprobando que el archivo de rollback contiene las dos definiciones completas.

- [ ] **Step 1: Escribir el ayudante de consultas a producción**

Crear `scripts/sql-produccion.mjs`:

```js
// Consulta y DDL contra la base de producción por Management API.
//
// Las migraciones del repo NO se aplican solas: este es el camino. Leer es libre; aplicar DDL
// necesita el OK de Leonardo, y va siempre en transacción con su rollback escrito antes.
import fs from 'node:fs'
import path from 'node:path'

const raiz = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const env = Object.fromEntries(
  fs.readFileSync(path.join(raiz, '.env'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_0-9]+=/.test(l))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, '')]
    })
)

const REF = env.SUPABASE_PROJECT_REF
const KEY = env.SUPABASE_API_KEY_MANAGEMENT

export async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const texto = await r.text()
  if (!r.ok) throw new Error(`${r.status} ${texto}`)
  return JSON.parse(texto)
}

// Solo corre como script si le pasan la consulta; importado, no hace nada.
if (process.argv[2]) console.log(JSON.stringify(await sql(process.argv[2]), null, 2))
```

- [ ] **Step 2: Bajar las definiciones de hoy**

```bash
node -e "import('./scripts/sql-produccion.mjs').then(async ({sql}) => {
  const fs = await import('node:fs');
  let out = '-- ROLLBACK · acm_match_properties y acm_match_roomix como estaban el 8-sep-2026,\n';
  out += '-- ANTES de agregarles p_poligonos. Bajadas con pg_get_functiondef desde produccion.\n';
  out += '-- Para volver atras: aplicar este archivo entero por Management API.\n\n';
  for (const fn of ['acm_match_properties','acm_match_roomix']) {
    const r = await sql(\"select pg_get_functiondef(p.oid) d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='\" + fn + \"'\");
    out += r[0].d + ';\n\n';
  }
  fs.writeFileSync('supabase/rollback/20260908_acm_zona_dibujada_rollback.sql', out);
})"
```

- [ ] **Step 3: Verificar que el rollback está completo**

```bash
grep -c "CREATE OR REPLACE FUNCTION" supabase/rollback/20260908_acm_zona_dibujada_rollback.sql
```

Esperado: `2`. Si da otra cosa, PARAR: sin rollback no se toca producción.

- [ ] **Step 4: Commit**

```bash
git add scripts/sql-produccion.mjs supabase/rollback/20260908_acm_zona_dibujada_rollback.sql
git commit -m "chore(acm): rollback de las dos funciones antes de agregarles p_poligonos"
```

---

## Task 3: `acm_match_properties` acepta `p_poligonos`

**Files:**
- Create: `supabase/migrations/20260908120000_acm_zona_dibujada.sql` (en esta tarea se escribe la primera mitad)
- Usa: `scripts/sql-produccion.mjs`

**Interfaces:**
- Consumes: nada de tareas anteriores salvo el script de la Task 2.
- Produces: `acm_match_properties(..., p_poligonos text[] DEFAULT NULL)` — el parámetro va **al final** de la lista para no correr ninguno de los existentes.

**Los cambios exactos.** Partir de la definición que quedó guardada en el rollback y aplicarle estos cinco cambios, nada más:

1. Agregar el parámetro al final de la firma: `, p_poligonos text[] DEFAULT NULL::text[]`
2. En el `declare`, después de `v_usar_zonas boolean := false;`:

```sql
  -- Zona dibujada a mano. Cuando viene, REEMPLAZA al gate de barrio: no se suma. Es el mismo
  -- criterio del Buscador IA (el dibujo reemplaza al barrio guardado); sumarlos daría cero
  -- comparables apenas la zona cruce dos barrios.
  v_geo boolean := (p_poligonos is not null and coalesce(array_length(p_poligonos, 1), 0) > 0);
```

3. Apagar el mapa de barrios cuando hay dibujo:

```sql
  if p_zona_niveles and v_key <> '' and not v_geo then
    v_usar_zonas := exists (select 1 from public.acm_barrio_relacion r where r.barrio = v_key);
  end if;
```

4. En el `where` del CTE `cand`, agregar el recorte geográfico justo después de `and p.is_active`:

```sql
      -- MISMA expresion que indexa el geo de la tabla: escrito de otra forma Postgres lee todo.
      and (not v_geo or (p.lat is not null and p.lng is not null
                         and point(p.lng, p.lat) <@ any(p_poligonos::polygon[])))
```

   y cambiar el gate de zona por:

```sql
      -- GATE de ZONA: el dibujo si lo hay; si no, por niveles de barrio; si no, patrones.
      and (case when v_geo then true
                when v_usar_zonas then z.score is not null
                else (array_length(p_loc_patterns,1) is null
                  or exists (select 1 from unnest(p_loc_patterns) lp
                             where public.acm_norm(coalesce(p.city,'') || ' ' ||
                                   coalesce(p.tokko_data->'location'->>'name','') || ' ' ||
                                   coalesce(p.tokko_data->'location'->>'full_location','')) like public.acm_norm(lp)))
           end)
```

5. En el CTE `scored` y en el `select` final, el puntaje de zona:

```sql
      (case when v_usar_zonas or v_geo then 20 else 0 end) as w_zona,
      (case when v_geo then 1 else (c.zona / 100.0) end)::numeric as s_zona,
```

```sql
    case when v_geo then 100
         when v_usar_zonas then s.zona
         when array_length(p_loc_patterns,1) is not null then 100 else null end as sc_zona,
```

- [ ] **Step 1: Escribir la prueba que tiene que fallar**

Crear `scratch/prueba-zona-acm.mjs` (archivo de trabajo, no se commitea):

```js
// La prueba de regresión de la CARTERA: con una zona elegida, ningún comparable puede caer
// fuera del dibujo. Hoy tiene que FALLAR (la función ni siquiera acepta el parámetro).
//
// La zona TIENE que ser la de La Plata: la cartera de PRISMAIA está toda ahí y las tres zonas
// viejas son de CABA, donde PRISMAIA no tiene ni una propiedad. Ver "Datos verificados".
import { sql } from '../scripts/sql-produccion.mjs'

const AGENCIA = '57c6134b-89dc-4968-bd1a-27364cf99195'  // PRISMAIA - VAKDOR
const ZONA = process.argv[2]                            // la zona dibujada sobre La Plata

const [z] = await sql(`select nombre, geojson from public.mapa_zonas where id = '${ZONA}'`)
const poligono = '(' + z.geojson.coordinates[0].map((p) => `(${p[0]},${p[1]})`).join(',') + ')'

const filas = await sql(`
  with r as (
    select * from public.acm_match_properties(
      p_agency_id => '${AGENCIA}'::uuid,
      p_query_embedding => null,
      p_operation => 'venta',
      p_m2 => 100,
      p_barrio => 'La Plata',
      p_zona_niveles => true,
      p_m2_cubierta => true,
      p_limit => 100,
      p_poligonos => array['${poligono}']
    )
  )
  select count(*) total,
         count(*) filter (where not (point(p.lng, p.lat) <@ '${poligono}'::polygon)) afuera,
         count(*) filter (where r.sc_zona is distinct from 100) zona_distinta_de_100
    from r join public.properties p on p.id = r.id`)

console.log(`zona="${z.nombre}"`, filas[0])
// Primero: ¿midió algo? Un "afuera: 0" sobre "total: 0" es verde y no significa nada.
if (Number(filas[0].total) === 0) throw new Error('FALLA: la prueba no midió nada (0 comparables). ¿La zona está sobre La Plata?')
if (Number(filas[0].afuera) > 0) throw new Error('FALLA: hay comparables fuera del dibujo')
if (Number(filas[0].zona_distinta_de_100) > 0) throw new Error('FALLA: sc_zona no es 100')
console.log('OK')
```

- [ ] **Step 2: Dibujar la zona de La Plata y correr la prueba para verla fallar**

Antes que nada, dibujar la zona (esto no se puede saltear: sin ella la prueba mide cero). Levantar la app con `npm run dev`, entrar con `osterrietchleonardo@vakdor.com`, ir al **Buscador IA → solapa Mapa**, dibujar un área sobre La Plata (centro aproximado lat −34,9296 / lng −57,9571) que abarque unas cuantas propiedades de la cartera, y guardarla como **"ACM prueba La Plata"**. Después sacar su id:

```bash
node scripts/sql-produccion.mjs "select z.id, z.nombre, u.email, z.created_at from public.mapa_zonas z join auth.users u on u.id = z.user_id order by z.created_at desc"
```

Confirmar que la zona recién dibujada efectivamente contiene propiedades propias — si da 0, se redibuja más grande:

```bash
node scripts/sql-produccion.mjs "select count(*) n from public.properties p, public.mapa_zonas z where z.id = '<ZONA_LA_PLATA>' and p.agency_id = '57c6134b-89dc-4968-bd1a-27364cf99195' and p.lat is not null and point(p.lng, p.lat) <@ (select '(' || string_agg('(' || (c->>0) || ',' || (c->>1) || ')', ',') || ')' from jsonb_array_elements(z.geojson->'coordinates'->0) c)::polygon"
```

Anotar también, ANTES de tocar nada, la huella sin zona del Step 6. Recién ahí:

```bash
node scratch/prueba-zona-acm.mjs <ZONA_LA_PLATA>
```

Esperado: FALLA con `function ... does not exist` o `p_poligonos is not a known parameter`.

- [ ] **Step 3: Escribir la migración**

Crear `supabase/migrations/20260908120000_acm_zona_dibujada.sql` con el encabezado y la función completa:

```sql
-- ACM · buscar comparables solo dentro de las zonas que el asesor dibujó en el mapa.
--
-- El ACM acotaba por BARRIO (acm_barrio_relacion). Esto le trae el recorte geográfico que el
-- Buscador IA ya usa en producción desde el 26-ago-2026.
--
-- Cuando p_poligonos viene con al menos un dibujo:
--   · REEMPLAZA al gate de barrio (no se suma: sumarlos da cero apenas la zona cruce dos barrios)
--   · la dimensión "zona" puntúa 100 con peso 20, igual que hoy puntúa el mismo barrio
-- Cuando NO viene, no cambia absolutamente nada.
--
-- La condición se escribe  point(lng,lat) <@ any(p_poligonos::polygon[])  A PROPÓSITO: medido el
-- 7-sep-2026 sobre las 3 zonas reales, esa forma resuelve por Bitmap Heap Scan en 30 ms; escrita
-- como  exists (select 1 from unnest(...) ...)  el índice no entra (184 ms y creciendo).
--
-- Aplicado por Management API. Rollback en supabase/rollback/20260908_acm_zona_dibujada_rollback.sql

drop function if exists public.acm_match_properties(uuid, text, text, text[], numeric, integer, integer, integer, integer, text[], text[], uuid, boolean, text, boolean, text, boolean, boolean, smallint, smallint, integer);

-- ... aquí va la definición completa con los cinco cambios de arriba ...
```

Para armar el cuerpo sin transcribirlo a mano —y así garantizar que lo único que cambia son esos cinco puntos— partir del rollback:

```bash
sed -n '/acm_match_properties/,/^\$function\$;/p' supabase/rollback/20260908_acm_zona_dibujada_rollback.sql
```

y aplicarle los cinco cambios sobre esa copia.

- [ ] **Step 4: Aplicar a producción, en transacción**

**Pedirle el OK a Leonardo antes de correr esto.** Es DDL sobre la base del cliente.

```bash
node -e "import('./scripts/sql-produccion.mjs').then(async ({sql}) => {
  const fs = await import('node:fs');
  const ddl = fs.readFileSync('supabase/migrations/20260908120000_acm_zona_dibujada.sql','utf8');
  await sql('begin; ' + ddl + ' commit;');
  console.log('aplicado');
})"
```

- [ ] **Step 5: Correr la prueba y verla pasar**

```bash
node scratch/prueba-zona-acm.mjs <ZONA_LA_PLATA>
```

Esperado: `total` mayor que 0, `afuera: 0`, `zona_distinta_de_100: 0`, y `OK`.

- [ ] **Step 6: Verificar que SIN zona no cambió nada**

```bash
node scripts/sql-produccion.mjs "select md5(string_agg(id::text || ':' || match_pct, ',' order by id::text)) huella, count(*) n from public.acm_match_properties(p_agency_id => '57c6134b-89dc-4968-bd1a-27364cf99195'::uuid, p_query_embedding => null, p_operation => 'venta', p_m2 => 100, p_barrio => 'La Plata', p_zona_niveles => true, p_m2_cubierta => true, p_limit => 100)"
```

Comparar contra la misma huella sacada **antes** de aplicar (correr este mismo comando en el Step 2 y anotarla). Tienen que ser idénticas. Si `n` da 0, la comparación no probó nada: bajar `p_m2` o cambiar el barrio hasta que devuelva filas, y recién ahí comparar. Si las huellas difieren, aplicar el rollback y revisar.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260908120000_acm_zona_dibujada.sql
git commit -m "feat(acm): acm_match_properties recorta por la zona dibujada"
```

---

## Task 4: `acm_match_roomix` acepta `p_poligonos`, y se mide que el índice entre

**Files:**
- Modify: `supabase/migrations/20260908120000_acm_zona_dibujada.sql` (se le agrega la segunda función)

**Interfaces:**
- Consumes: `scripts/sql-produccion.mjs`.
- Produces: `acm_match_roomix(..., p_poligonos text[] DEFAULT NULL)` — parámetro al final.

**Los cambios exactos.** `acm_match_roomix` tiene dos ramas de ~190 líneas (`v_usar_zonas` sí/no). El camino del dibujo **reusa la rama "sin zonas"** —la que va directo a `mercado_avisos`— y no se agrega una tercera.

1. Parámetro al final de la firma: `, p_poligonos text[] DEFAULT NULL::text[]`
2. En el `declare`, la misma variable que en la Task 3:

```sql
  v_geo boolean := (p_poligonos is not null and coalesce(array_length(p_poligonos, 1), 0) > 0);
```

3. Apagar el mapa de barrios: `if p_zona_niveles and v_key <> '' and not v_geo then`
4. En el `where` de la rama 2 (la del `else`), agregar después de `and r.estado = 'activo' and r.calidad = 'ok'`:

```sql
        -- MISMA expresion que indexa mercado_avisos_punto_idx (gist(point(lng,lat)) where
        -- estado='activo' and calidad='ok'), que es exactamente el filtro de arriba.
        and (not v_geo or (r.lat is not null and r.lng is not null
             and point(r.lng, r.lat) <@ any(p_poligonos::polygon[])))
```

   y desactivar el gate por patrones cuando hay dibujo:

```sql
        and (v_geo or array_length(p_loc_patterns,1) is null
          or public.acm_norm(coalesce(r.barrio,'') || ' ' || coalesce(r.ciudad,'')) like any (v_loc_norm))
```

5. El puntaje de zona en la rama 2. **Ojo con esto:** hoy esa rama tiene `0 as w_zona` y `0::numeric as s_zona` (líneas 282-283 de la definición de producción) pero **muestra** `sc_zona = 100` (línea 371). O sea: la zona se ve al 100 % y pesa cero. Para el camino del dibujo hay que forzar el peso, si no el % sale distinto de lo decidido:

```sql
        (case when v_geo then 20 else 0 end) as w_zona,
        (case when v_geo then 1 else 0 end)::numeric as s_zona,
```

```sql
      case when v_geo then 100
           when array_length(p_loc_patterns,1) is not null then 100 else null end as sc_zona,
```

- [ ] **Step 1: Escribir la prueba que tiene que fallar**

Crear `scratch/prueba-zona-red.mjs`:

```js
// Con zona elegida, ningún aviso de la RED puede caer fuera del dibujo, y sc_zona tiene que
// ser 100. Además se mide que el filtro use el índice: es la diferencia entre 30 ms y leer
// la tabla entera.
import { sql } from '../scripts/sql-produccion.mjs'

const ZONA = process.argv[2]

const [z] = await sql(`select nombre, geojson from public.mapa_zonas where id = '${ZONA}'`)
const poligono = '(' + z.geojson.coordinates[0].map((p) => `(${p[0]},${p[1]})`).join(',') + ')'

const llamada = `public.acm_match_roomix(
  p_query_embedding => null, p_operation => 'venta', p_m2 => 100,
  p_barrio => 'Belgrano', p_zona_niveles => true, p_m2_cubierta => true,
  p_dedup => true, p_limit => 100, p_poligonos => array['${poligono}'])`

const filas = await sql(`
  with r as (select * from ${llamada})
  select count(*) total,
         count(*) filter (where not (point(m.lng, m.lat) <@ '${poligono}'::polygon)) afuera,
         count(*) filter (where r.sc_zona is distinct from 100) zona_distinta_de_100
    from r join public.mercado_avisos m on m.id::varchar = r.id`)

console.log(`zona="${z.nombre}"`, filas[0])
if (Number(filas[0].total) === 0) throw new Error('FALLA: la prueba no midió nada (0 filas)')
if (Number(filas[0].afuera) > 0) throw new Error('FALLA: hay avisos fuera del dibujo')
if (Number(filas[0].zona_distinta_de_100) > 0) throw new Error('FALLA: sc_zona no es 100')

// Segunda corrida, ya en tibio, para medir sin el ruido del disco frío.
await sql(`select count(*) from ${llamada}`)
const t0 = Date.now()
await sql(`select count(*) from ${llamada}`)
const ms = Date.now() - t0
console.log(`tibio: ${ms} ms`)
if (ms > 3000) throw new Error(`FALLA: ${ms} ms en tibio — el índice no está entrando`)
console.log('OK')
```

- [ ] **Step 2: Correrla y verla fallar**

Acá la zona es una de **CABA** (`test` o `zona prueba`), no la de La Plata: la red no tiene ni un aviso en La Plata. Ver "Datos verificados".

```bash
node scratch/prueba-zona-red.mjs <ZONA_CABA>
```

Esperado: FALLA porque la función todavía no acepta `p_poligonos`.

Anotar además, ANTES de tocar nada, la huella sin zona (para el Step 6):

```bash
node scripts/sql-produccion.mjs "select md5(string_agg(id || ':' || match_pct, ',' order by id)) huella, count(*) n from public.acm_match_roomix(p_query_embedding => null, p_operation => 'venta', p_m2 => 100, p_barrio => 'Belgrano', p_zona_niveles => true, p_m2_cubierta => true, p_dedup => true, p_limit => 100)"
```

- [ ] **Step 3: Escribir la segunda mitad de la migración**

Agregar al final de `supabase/migrations/20260908120000_acm_zona_dibujada.sql` el `drop function` de la firma vieja de `acm_match_roomix` (la de 26 argumentos, tal cual figura en el rollback) y la definición nueva con los cinco cambios.

- [ ] **Step 4: Aplicar a producción, en transacción**

**Pedirle el OK a Leonardo.** Mismo comando de la Task 3, Step 4 (el archivo ahora trae las dos funciones; volver a aplicarlo entero es idempotente porque son `drop` + `create or replace`).

- [ ] **Step 5: Correr la prueba y verla pasar**

```bash
node scratch/prueba-zona-red.mjs <ZONA_CABA>
```

Esperado: `afuera: 0`, `zona_distinta_de_100: 0`, tibio por debajo de 3.000 ms, `OK`.

**Si el tiempo en tibio se dispara** (varios segundos, o un plan sin `Bitmap Heap Scan`), el problema es que Postgres no puede plegar `not v_geo` en un plan genérico y deja de usar el índice. Comprobarlo:

```bash
node scripts/sql-produccion.mjs "explain (analyze, format text) select count(*) from public.acm_match_roomix(p_query_embedding => null, p_operation => 'venta', p_m2 => 100, p_barrio => 'Belgrano', p_zona_niveles => true, p_m2_cubierta => true, p_dedup => true, p_limit => 100, p_poligonos => array['<POLIGONO>'])"
```

**El arreglo, si pasa:** en la rama 2, reemplazar el `return query` por un `return query execute` que arme el texto de la consulta concatenando la cláusula geográfica **solo cuando `v_geo`**, y pasando `p_poligonos` con `using` (parámetro, nunca interpolado):

```sql
    return query execute
      v_sql_base ||
      case when v_geo then ' and r.lat is not null and r.lng is not null
                            and point(r.lng, r.lat) <@ any($1::polygon[]) ' else '' end ||
      v_sql_resto
      using p_poligonos;
```

Así el plan que ve Postgres ya no tiene el `or` y el índice entra. No se interpola ningún dato: el array viaja por `using`.

- [ ] **Step 6: Verificar que SIN zona no cambió nada**

Volver a sacar la huella del Step 2 y comparar. Idénticas o se aplica el rollback.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260908120000_acm_zona_dibujada.sql
git commit -m "feat(acm): acm_match_roomix recorta por la zona dibujada"
```

---

## Task 5: El campo `zonas` en el tipo `Sujeto`

**Files:**
- Modify: `lib/tasacion/types.ts` (junto a `incluir_linderos`, alrededor de la línea 62)

**Interfaces:**
- Produces: `Sujeto.zonas?: { id: string; nombre: string }[]`

Sin test propio: es una declaración de tipo. La verifica el compilador, y la usan las Tasks 6, 7 y 8.

- [ ] **Step 1: Agregar el campo**

En `lib/tasacion/types.ts`, inmediatamente después de `incluir_linderos?: boolean;`:

```ts
  /**
   * Zonas del mapa con las que se acotó esta búsqueda. Vive acá —y no en un estado aparte— por
   * el mismo motivo que `incluir_linderos`: `sujeto` es lo único que queda fotografiado en
   * `acm_searches.sujeto`, así que es el único lugar desde donde "Mis ACM" puede reabrir la
   * búsqueda sabiendo con qué zonas se hizo.
   *
   * Se guarda el id y el nombre, NO el dibujo: los comparables ya vienen fotografiados en
   * `resultados`, y una zona que después se borra o se redibuja no tiene que cambiar un ACM
   * que ya se le mandó a un cliente.
   *
   * Ausente o vacío = búsqueda por barrio, que es el modo por defecto.
   */
  zonas?: { id: string; nombre: string }[];
```

- [ ] **Step 2: Verificar que compila**

```
npx tsc --noEmit
```

Esperado: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add lib/tasacion/types.ts
git commit -m "feat(acm): el sujeto recuerda con qué zonas se buscó"
```

---

## Task 6: El endpoint recibe `zona_ids`, los resuelve por `user_id` y filtra

**Files:**
- Modify: `app/api/acm/comparables/route.ts`
- Test: `app/api/acm/comparables/route.test.ts` *(nuevo)*

**Interfaces:**
- Consumes: `resolverZonas`, `ZonaFila` de `lib/acm/zonas-poligonos` (Task 1); `Sujeto.zonas` (Task 5); `p_poligonos` en las dos RPC (Tasks 3 y 4).
- Produces: el body acepta `zona_ids?: string[]`; la respuesta suma `meta.zonas_usadas: string[]` (nombres) y `meta.zonas_invalidas: string[]`; ante un pedido con `zona_ids` que no resuelve ninguna zona válida, devuelve `400` con `{ error: string }`.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `app/api/acm/comparables/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * BUSCAR COMPARABLES DENTRO DE LAS ZONAS DIBUJADAS.
 *
 * Las cuatro reglas que sostiene este archivo:
 *  1. Las zonas se leen SIEMPRE filtrando por user_id. createAdminClient saltea RLS: sin ese
 *     filtro, mandando un id ajeno se podría buscar dentro del dibujo de otra persona.
 *  2. El navegador manda IDS, nunca un polígono. Un polígono en el body se ignora.
 *  3. Si el pedido trae zonas pero ninguna resuelve, NO se busca: se avisa. Buscar sin filtro
 *     sería devolver una búsqueda distinta de la que el asesor pidió.
 *  4. Sin zona_ids, a las RPC les llega p_poligonos = null y todo sigue como antes.
 *
 * Los testigos son de CONDUCTA: qué llegó a cada RPC y qué se guardó en el historial.
 */

const AGENCIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const USUARIO = "11111111-1111-4111-8111-111111111111"

const anillo = [[-58.45, -34.56], [-58.44, -34.56], [-58.44, -34.55], [-58.45, -34.55], [-58.45, -34.56]]

// Lo que "hay" en mapa_zonas, y con qué filtros se la consultó.
const zonasEnBase = [
  { id: "z1", nombre: "Belgrano bajo", geojson: { type: "Polygon", coordinates: [anillo] }, user_id: USUARIO },
  { id: "z2", nombre: "Rota", geojson: { type: "Point", coordinates: [-58.4, -34.5] }, user_id: USUARIO },
  { id: "zAjena", nombre: "De otro", geojson: { type: "Polygon", coordinates: [anillo] }, user_id: "otro-usuario" },
]

const espia = {
  rpc: [] as { fn: string; args: any }[],
  filtrosZonas: [] as Record<string, any>[],
  guardado: null as any,
}

vi.mock("@/lib/auth/tenant-validation", () => ({
  requireTenant: async () => ({ userId: USUARIO, agencyId: AGENCIA }),
}))

vi.mock("@/lib/gemini", () => ({ generateEmbedding: async () => [] }))

// Constructor de consultas mínimo: registra los .eq() y devuelve las filas que matcheen.
function tablaZonas() {
  const filtros: Record<string, any> = {}
  const q: any = {
    select: () => q,
    eq: (col: string, val: any) => { filtros[col] = val; return q },
    in: (col: string, vals: any[]) => { filtros[col] = vals; return q },
    then: (resolve: any) => {
      espia.filtrosZonas.push({ ...filtros })
      const filas = zonasEnBase
        .filter((z) => (filtros.id ? filtros.id.includes(z.id) : true))
        .filter((z) => (filtros.user_id ? z.user_id === filtros.user_id : true))
        .map(({ user_id, ...resto }) => resto)
      return resolve({ data: filas, error: null })
    },
  }
  return q
}

const clienteFalso = {
  rpc: async (fn: string, args: any) => {
    espia.rpc.push({ fn, args })
    return { data: [], error: null }
  },
  from: (tabla: string) => {
    if (tabla === "mapa_zonas") return tablaZonas()
    const q: any = {
      select: () => q,
      in: () => q,
      insert: (fila: any) => { espia.guardado = fila; return q },
      single: async () => ({ data: { id: "search-1" }, error: null }),
      then: (resolve: any) => resolve({ data: [], error: null }),
    }
    return q
  },
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => clienteFalso }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => clienteFalso }))

const { POST } = await import("./route")

const pedido = (body: any) =>
  new Request("http://localhost/api/acm/comparables", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sujeto: { barrio: "Belgrano", m2_cubiertos: 100 }, operacion: "venta", ...body }),
  })

beforeEach(() => {
  espia.rpc = []
  espia.filtrosZonas = []
  espia.guardado = null
})

describe("POST /api/acm/comparables · zonas dibujadas", () => {
  it("sin zona_ids, a las dos RPC les llega p_poligonos null", async () => {
    const res = await POST(pedido({}))

    expect(res.status).toBe(200)
    expect(espia.rpc).toHaveLength(2)
    for (const llamada of espia.rpc) expect(llamada.args.p_poligonos).toBeNull()
  })

  it("con una zona válida, a las dos RPC les llega su polígono", async () => {
    const res = await POST(pedido({ zona_ids: ["z1"] }))
    const data = await res.json()

    expect(res.status).toBe(200)
    for (const llamada of espia.rpc) {
      expect(llamada.args.p_poligonos).toHaveLength(1)
      expect(llamada.args.p_poligonos[0]).toContain("(-58.45,-34.56)")
    }
    expect(data.meta.zonas_usadas).toEqual(["Belgrano bajo"])
  })

  it("SIEMPRE filtra las zonas por user_id: una zona ajena no existe", async () => {
    const res = await POST(pedido({ zona_ids: ["zAjena"] }))

    expect(espia.filtrosZonas[0].user_id).toBe(USUARIO)
    expect(res.status).toBe(400)
    expect(espia.rpc).toHaveLength(0)
  })

  it("ignora un polígono mandado a mano desde el navegador", async () => {
    await POST(pedido({ p_poligonos: ["((0,0),(1,0),(1,1))"], poligonos: ["((0,0),(1,0),(1,1))"] }))

    for (const llamada of espia.rpc) expect(llamada.args.p_poligonos).toBeNull()
  })

  it("si pidió zonas y ninguna resuelve, NO busca: avisa", async () => {
    const res = await POST(pedido({ zona_ids: ["z2"] }))
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(espia.rpc).toHaveLength(0)
    expect(data.error).toContain("Rota")
  })

  it("una rota entre dos buenas no cancela la búsqueda, pero queda anotada", async () => {
    const res = await POST(pedido({ zona_ids: ["z1", "z2"] }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(espia.rpc[0].args.p_poligonos).toHaveLength(1)
    expect(data.meta.zonas_invalidas).toEqual(["Rota"])
  })

  it("guarda las zonas usadas dentro del sujeto, para poder reabrir el ACM", async () => {
    await POST(pedido({ zona_ids: ["z1"] }))

    expect(espia.guardado.sujeto.zonas).toEqual([{ id: "z1", nombre: "Belgrano bajo" }])
  })
})
```

- [ ] **Step 2: Correr los tests y verlos fallar**

```
npx vitest run app/api/acm/comparables/route.test.ts
```

Esperado: FALLAN — `p_poligonos` llega `undefined` en vez de `null`, no se consulta `mapa_zonas`, y los pedidos con `zona_ids` devuelven 200 en vez de 400.

- [ ] **Step 3: Implementar en el endpoint**

En `app/api/acm/comparables/route.ts`:

Agregar el import junto a los otros de `lib/acm`:

```ts
import { resolverZonas, type ZonaFila } from "@/lib/acm/zonas-poligonos";
```

Después de leer `const considerarPh = ...` (alrededor de la línea 62), agregar el bloque de resolución:

```ts
    // ── Zonas dibujadas en el mapa ──────────────────────────────────────────────
    // Del navegador llegan IDS, nunca polígonos: si aceptáramos el dibujo hecho, cualquiera
    // podría pedir cualquier recorte. Y la lectura filtra por user_id ADEMÁS de por id porque
    // createAdminClient saltea RLS y las zonas son privadas: ni el director ve las de un asesor.
    const zonaIds: string[] = Array.isArray(body.zona_ids)
      ? body.zona_ids.filter((x: unknown) => typeof x === "string" && x.length > 0).slice(0, 20)
      : [];

    let poligonos: string[] | null = null;
    let zonasUsadas: { id: string; nombre: string }[] = [];
    let zonasInvalidas: string[] = [];

    if (zonaIds.length > 0) {
      const { data: filas, error: zonasErr } = await createAdminClient()
        .from("mapa_zonas")
        .select("id, nombre, geojson")
        .in("id", zonaIds)
        .eq("user_id", userId);
      if (zonasErr) throw zonasErr;

      const resuelto = resolverZonas((filas || []) as ZonaFila[]);
      zonasUsadas = resuelto.usadas;
      zonasInvalidas = resuelto.invalidas;

      // Pidió buscar dentro de un dibujo y no hay dibujo utilizable. Buscar por barrio acá sería
      // devolverle una búsqueda distinta de la que pidió, sin que se note.
      if (resuelto.poligonos.length === 0) {
        const detalle = zonasInvalidas.length > 0
          ? `El trazo de ${zonasInvalidas.join(", ")} no se puede usar.`
          : "No encontramos esas zonas entre las tuyas.";
        return NextResponse.json(
          { error: `No pudimos buscar dentro de las zonas elegidas. ${detalle}` },
          { status: 400 }
        );
      }
      poligonos = resuelto.poligonos;
    }
```

En las dos llamadas `supabase.rpc(...)`, agregar como último parámetro:

```ts
        p_poligonos: poligonos,
```

Con dibujo, el barrio deja de filtrar; el modo de linderos ya no significa nada. Justo antes de las RPC, dejarlo explícito:

```ts
    // Con dibujo, el gate de barrio queda apagado del lado de la función (v_geo). p_barrio se
    // sigue mandando porque el checklist muestra el barrio del sujeto, pero no filtra.
```

En el `insert` del historial, guardar las zonas dentro del sujeto:

```ts
          sujeto: zonasUsadas.length > 0 ? { ...sujeto, zonas: zonasUsadas } : sujeto,
```

Y en el `meta` de la respuesta:

```ts
        zonas_usadas: zonasUsadas.map((z) => z.nombre),
        zonas_invalidas: zonasInvalidas,
```

- [ ] **Step 4: Correr los tests y verlos pasar**

```
npx vitest run app/api/acm/comparables/route.test.ts
```

Esperado: 7 tests PASS.

- [ ] **Step 5: Volver a meter el bug y ver la prueba fallar**

Sacar el `.eq("user_id", userId)` de la consulta a `mapa_zonas` y correr los tests de nuevo. El test "SIEMPRE filtra las zonas por user_id" tiene que ponerse en rojo. Volver a poner el `.eq` y confirmar que vuelve a verde. **Una prueba que no falla con el bug no es una prueba.**

- [ ] **Step 6: Commit**

```bash
git add app/api/acm/comparables/route.ts app/api/acm/comparables/route.test.ts
git commit -m "feat(acm): el endpoint acota la busqueda a las zonas propias del usuario"
```

---

## Task 7: El selector de dos modos excluyentes en el formulario

**Files:**
- Modify: `app/asesor/acm/components/subject-input.tsx`
- Modify: `app/asesor/acm/components/acm-module.tsx`

**Interfaces:**
- Consumes: `GET /api/mapa/zonas` (ya existe, devuelve `{ zonas: [{ id, nombre, descripcion, geojson, filtros, created_at }] }` filtradas por `user_id`); `Sujeto.zonas` (Task 5); `meta.zonas_usadas` (Task 6).
- Produces: cuatro props nuevas en `SubjectInputProps`:
  ```ts
  modoZona: "barrio" | "zonas";
  onModoZonaChange: (m: "barrio" | "zonas") => void;
  zonasElegidas: string[];
  onZonasElegidasChange: (ids: string[]) => void;
  ```
  y en `AcmModule`, `handleBuscar(opts?: { sinZona?: boolean })`.

- [ ] **Step 1: Agregar el estado y el cableado en `acm-module.tsx`**

Junto a `const [incluirLinderos, setIncluirLinderos] = useState(false);`:

```tsx
  // Dónde buscar: en el barrio (lo de siempre) o dentro de las zonas dibujadas. Son EXCLUYENTES
  // y el modo barrio es el que viene puesto: un ACM que se abre y se busca sin tocar nada tiene
  // que devolver exactamente lo mismo que devolvía antes de que esto existiera.
  const [modoZona, setModoZona] = useState<"barrio" | "zonas">("barrio");
  const [zonasElegidas, setZonasElegidas] = useState<string[]>([]);
  const [zonasUsadas, setZonasUsadas] = useState<string[]>([]);
```

En `handleReset()`, agregar:

```tsx
    setModoZona("barrio");
    setZonasElegidas([]);
```

Cambiar la firma de la búsqueda y el body. `sinZona` es un parámetro y no estado porque el botón "Buscar sin la zona" de los resultados tiene que buscar YA, no en el render siguiente:

```tsx
  const handleBuscar = async (opts?: { sinZona?: boolean }) => {
    const usarZonas = !opts?.sinZona && modoZona === "zonas" && zonasElegidas.length > 0;
    if (opts?.sinZona) {
      setModoZona("barrio");
      setZonasElegidas([]);
    }
    setLoading(true);
    try {
      const res = await fetch("/api/acm/comparables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sujeto: { ...sujeto, descripcion_ia: (sujeto.descripcion_ia || "").trim(), incluir_linderos: incluirLinderos },
          operacion,
          exclude_id: excludeId,
          considerar_ph: considerarPh,
          // Solo viaja en el modo zonas: así el servidor no tiene que adivinar la intención a
          // partir de un array vacío.
          ...(usarZonas ? { zona_ids: zonasElegidas } : {}),
          limit: TOPE_COMPARABLES,
        }),
      });
```

Después de `setResults({...})`, agregar:

```tsx
      setZonasUsadas(data.meta?.zonas_usadas || []);
      if ((data.meta?.zonas_invalidas || []).length > 0) {
        toast.warning(`No se pudo usar el trazo de: ${data.meta.zonas_invalidas.join(", ")}.`);
      }
```

En `handleAbrirGuardado`, restaurar el modo:

```tsx
      const zonasGuardadas: { id: string; nombre: string }[] = data.sujeto?.zonas || [];
      setModoZona(zonasGuardadas.length > 0 ? "zonas" : "barrio");
      setZonasElegidas(zonasGuardadas.map((z) => z.id));
      setZonasUsadas(zonasGuardadas.map((z) => z.nombre));
```

Pasarle las props nuevas a `<SubjectInput>`:

```tsx
              modoZona={modoZona}
              onModoZonaChange={setModoZona}
              zonasElegidas={zonasElegidas}
              onZonasElegidasChange={setZonasElegidas}
              onBuscar={() => handleBuscar()}
```

y a `<ComparablesResult>` (lo consume la Task 8):

```tsx
                zonasUsadas={zonasUsadas}
                onBuscarSinZona={() => handleBuscar({ sinZona: true })}
```

- [ ] **Step 2: Agregar las props y el estado de la lista en `subject-input.tsx`**

En `SubjectInputProps`, después de `onIncluirLinderosChange`:

```ts
  modoZona: "barrio" | "zonas";
  onModoZonaChange: (m: "barrio" | "zonas") => void;
  /** Ids de `mapa_zonas` tildados. Solo cuentan en el modo "zonas". */
  zonasElegidas: string[];
  onZonasElegidasChange: (ids: string[]) => void;
```

Agregarlas al destructuring del componente, y dentro del cuerpo:

```tsx
  const [zonas, setZonas] = useState<{ id: string; nombre: string }[]>([]);
  const [zonasCargando, setZonasCargando] = useState(true);

  // Las zonas son PRIVADAS: este endpoint ya devuelve solo las del usuario logueado. No hay que
  // filtrar acá nada más — y tampoco se puede pedir las de otro.
  useEffect(() => {
    let vivo = true;
    fetch("/api/mapa/zonas")
      .then((r) => r.json())
      .then((d) => { if (vivo) setZonas(d.zonas || []); })
      .catch(() => { if (vivo) setZonas([]); })
      .finally(() => { if (vivo) setZonasCargando(false); });
    return () => { vivo = false; };
  }, []);

  const sinZonasGuardadas = !zonasCargando && zonas.length === 0;
  const modoZonasSinElegir = modoZona === "zonas" && zonasElegidas.length === 0;
```

- [ ] **Step 3: Reemplazar el bloque de "Incluir barrios linderos" por el selector de dos modos**

Sustituir el `<label>` de barrios linderos (`subject-input.tsx:298-313`) por:

```tsx
      {/* DÓNDE BUSCAR · dos opciones excluyentes. La de barrio es la que viene puesta: sin tocar
          nada, el ACM se comporta igual que antes de que esto existiera. */}
      <div className="rounded-2xl border border-accent/10 bg-card/20 overflow-hidden">
        <p className="px-4 pt-4 text-[10px] font-bold uppercase tracking-widest text-accent">Dónde buscar</p>

        {/* Opción 1 · el barrio de la propiedad */}
        <label className="flex items-start gap-3 p-4 cursor-pointer">
          <input
            type="radio"
            name="acm-donde-buscar"
            checked={modoZona === "barrio"}
            onChange={() => { onModoZonaChange("barrio"); onZonasElegidasChange([]); }}
            className="mt-1 accent-[hsl(var(--accent))]"
          />
          <span className="text-sm">
            <span className="font-bold">En el barrio de la propiedad</span>
            <span className="block text-xs text-muted-foreground mt-0.5">
              Se comparan propiedades del mismo barrio y sus sub-barrios.
            </span>
          </span>
        </label>

        {/* El switch de linderos pertenece al modo barrio: en el modo zonas no significa nada. */}
        <label
          className={cn(
            "flex items-start gap-3 px-4 pb-4 pl-11",
            modoZona === "zonas" ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
          )}
        >
          <Checkbox
            checked={incluirLinderos}
            disabled={modoZona === "zonas"}
            onCheckedChange={(v) => onIncluirLinderosChange(v === true)}
            className="mt-0.5"
          />
          <span className="text-sm">
            <span className="font-bold">Incluir barrios linderos</span>
            <span className="block text-xs text-muted-foreground mt-0.5">
              {modoZona === "zonas"
                ? "No aplica: el dibujo reemplaza al barrio."
                : "Tildá si necesitás ampliar a los barrios vecinos; los que entren van marcados como “lindero”."}
            </span>
          </span>
        </label>

        {/* Opción 2 · las zonas dibujadas en el mapa */}
        <div className="border-t border-accent/10">
          <label
            className={cn(
              "flex items-start gap-3 p-4",
              sinZonasGuardadas ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
            )}
          >
            <input
              type="radio"
              name="acm-donde-buscar"
              checked={modoZona === "zonas"}
              disabled={sinZonasGuardadas}
              onChange={() => onModoZonaChange("zonas")}
              className="mt-1 accent-[hsl(var(--accent))]"
            />
            <span className="text-sm">
              <span className="font-bold">Solo dentro de mis zonas del mapa</span>
              <span className="block text-xs text-muted-foreground mt-0.5">
                {sinZonasGuardadas
                  ? "Todavía no dibujaste ninguna. Se crean en el Buscador IA, en la solapa Mapa: dibujás el área y la guardás con un nombre."
                  : "Se compara únicamente con lo que cae adentro del dibujo. Podés tildar más de una y se suman."}
              </span>
            </span>
          </label>

          {modoZona === "zonas" && zonas.length > 0 && (
            <div className="px-4 pb-4 pl-11 flex flex-col gap-2">
              {zonas.map((z) => (
                <label key={z.id} className="flex items-center gap-2.5 cursor-pointer">
                  <Checkbox
                    checked={zonasElegidas.includes(z.id)}
                    onCheckedChange={(v) =>
                      onZonasElegidasChange(
                        v === true ? [...zonasElegidas, z.id] : zonasElegidas.filter((id) => id !== z.id)
                      )
                    }
                  />
                  <span className="text-sm">{z.nombre}</span>
                </label>
              ))}
              {modoZonasSinElegir && (
                <p className="text-xs text-amber-500 mt-1">Elegí al menos una zona para poder buscar.</p>
              )}
            </div>
          )}
        </div>
      </div>
```

- [ ] **Step 4: Bloquear el botón cuando el modo zonas no tiene ninguna tildada**

Cambiar la línea 245 y el `disabled` del botón:

```tsx
  const isValido = sujeto.barrio && sujeto.m2_cubiertos > 0 && !modoZonasSinElegir;
```

- [ ] **Step 5: Verificar que compila y que no se rompió nada**

```
npx tsc --noEmit
npm test
```

Esperado: sin errores de tipos, y toda la batería en verde.

- [ ] **Step 6: Commit**

```bash
git add app/asesor/acm/components/subject-input.tsx app/asesor/acm/components/acm-module.tsx
git commit -m "feat(acm): elegir entre buscar por barrio o dentro de las zonas del mapa"
```

---

## Task 8: El chip, el cartel y el botón "Buscar sin la zona" en los resultados

**Files:**
- Modify: `app/asesor/acm/components/comparables-result.tsx`

**Interfaces:**
- Consumes: `zonasUsadas` y `onBuscarSinZona`, que `acm-module.tsx` ya pasa (Task 7).
- Produces: dos props nuevas en `Props`:
  ```ts
  zonasUsadas?: string[];
  onBuscarSinZona?: () => void;
  ```

- [ ] **Step 1: Agregar las props**

En `interface Props` de `comparables-result.tsx`, antes de `onVolver`:

```ts
  /** Nombres de las zonas dibujadas con las que se acotó esta búsqueda. Vacío = búsqueda por barrio. */
  zonasUsadas?: string[];
  /** Rehace la búsqueda por barrio, destildando las zonas. */
  onBuscarSinZona?: () => void;
```

Y al destructuring de la línea 433: `zonasUsadas = [], onBuscarSinZona,`.

- [ ] **Step 2: Mostrar el chip y el cartel**

Justo después del bloque del sujeto (el `</div>` que cierra el recuadro "Propiedad analizada", alrededor de la línea 768) insertar:

```tsx
      {/* Búsqueda acotada a un dibujo: se dice con qué zonas, cuántos entraron, y se ofrece la
          salida. El sistema nunca amplía solo — pero tampoco te deja sin el botón para hacerlo. */}
      {zonasUsadas.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl border border-accent/20 bg-accent/5">
          <div className="text-sm">
            <p className="font-bold">
              Dentro de: {zonasUsadas.join(" + ")}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {cartera.length + roomix.length === 0
                ? "No hay ningún comparable adentro del dibujo."
                : `${cartera.length + roomix.length} comparables adentro del dibujo.`}
              {" "}Las propiedades sin ubicación en el mapa quedan afuera de una búsqueda por zona.
            </p>
          </div>
          {onBuscarSinZona && (
            <Button variant="outline" size="sm" className="border-accent/20 shrink-0" onClick={onBuscarSinZona}>
              Buscar sin la zona
            </Button>
          )}
        </div>
      )}
```

- [ ] **Step 3: Verificar que compila y la batería sigue verde**

```
npx tsc --noEmit
npm test
```

- [ ] **Step 4: Commit**

```bash
git add app/asesor/acm/components/comparables-result.tsx
git commit -m "feat(acm): decir con que zonas se busco y ofrecer la salida"
```

---

## Task 9: Probarlo de verdad, en el navegador

**Files:** ninguno (verificación).

**Interfaces:** consume todo lo anterior.

Esta es la tarea que decide si se mergea. Nada de esto se da por hecho leyendo el código.

- [ ] **Step 1: Levantar el entorno**

```bash
npm run dev
```

Entrar con la cuenta propia (**PRISMAIA - VAKDOR**, `osterrietchleonardo@vakdor.com`), que ya tiene dos zonas guardadas ("test" y "zona prueba"). **Nunca con la cuenta del cliente ni como un asesor.**

- [ ] **Step 2: El camino de siempre no cambió**

Abrir el ACM, cargar una propiedad, y buscar **sin tocar el selector**. Verificar:
- El modo que viene puesto es "En el barrio de la propiedad".
- No hay ninguna zona tildada.
- Los resultados no muestran el chip "Dentro de:".

- [ ] **Step 3: Los dos modos no se mezclan**

- Pasar a "Solo dentro de mis zonas del mapa" → el switch "Incluir barrios linderos" queda gris y dice "No aplica: el dibujo reemplaza al barrio".
- Sin tildar ninguna zona → el botón "Buscar comparables" no se puede apretar, y aparece "Elegí al menos una zona para poder buscar".
- Tildar una, volver a "En el barrio de la propiedad" → las zonas quedan destildadas.

- [ ] **Step 4: El recorte funciona de verdad**

Se prueba **dos veces**, porque la cartera y la red no viven en el mismo lado del mapa:

**a) Con la zona de La Plata** (`ACM prueba La Plata`) y una propiedad de La Plata: tienen que aparecer comparables **de la cartera**, y la sección de la red va a decir 0. **Eso está bien, no es un error:** `mercado_avisos` no tiene un solo aviso en La Plata. Confirmar que el cartel dice "no hay comparables", no que la búsqueda falló (el banner rojo de fallo NO tiene que aparecer).

**b) Con una zona de CABA** (`test` o `zona prueba`) y una propiedad de Belgrano: tienen que aparecer comparables **de la red**, y la cartera va a decir 0 (PRISMAIA no tiene propiedades en CABA).

Y en los dos casos, contra la base:

```bash
node scratch/prueba-zona-acm.mjs <ZONA_LA_PLATA>
node scratch/prueba-zona-red.mjs <ZONA_CABA>
```

Y a ojo: abrir uno o dos comparables de la lista y confirmar que la dirección está adentro del área que se dibujó.

- [ ] **Step 5: El botón de salida**

Con resultados de una zona chica, apretar "Buscar sin la zona": tiene que rehacer la búsqueda por barrio, desaparecer el chip, y al volver a "Editar" el formulario tiene que estar en el modo barrio con las zonas destildadas.

- [ ] **Step 6: "Mis ACM" reabre bien**

Ir a la solapa "Mis ACM", abrir el ACM que se hizo con zona: tiene que mostrar el chip con el nombre de la zona. Abrir uno viejo (de antes de este cambio): tiene que abrirse sin chip y sin errores.

- [ ] **Step 7: El celular**

Repetir los pasos 3 y 4 con emulación de celular. Verificar que el bloque "Dónde buscar" no desborda, que los radios y las casillas se pueden **tocar** de verdad (no solo que se vean), y que el botón "Buscar sin la zona" no se sale del recuadro.

- [ ] **Step 8: Limpiar los archivos de trabajo**

```bash
rm scratch/prueba-zona-acm.mjs scratch/prueba-zona-red.mjs
```

- [ ] **Step 9: Mostrarle el resultado a Leonardo y pedirle el OK**

Antes del merge. El flujo es: rama → navegador → su OK → commit → docs → merge. El push a `main` lo hace él.

---

## Autorrevisión del plan

**Cobertura del spec:**

| Requisito del spec | Task |
|---|---|
| `p_poligonos` en `acm_match_properties` | 3 |
| `p_poligonos` en `acm_match_roomix`, con la medición del índice | 4 |
| `point <@ any(...)`, nunca `exists(unnest(...))` | Constraint global + 3 y 4 |
| Zona = 100 con peso 20, y el detalle de `w_zona = 0` en la rama vieja | 3 y 4 |
| Sin zona, resultado idéntico al de hoy | 3 Step 6, 4 Step 6, 9 Step 2 |
| `zona_ids` resueltos por `user_id`, nunca un polígono del navegador | 6 |
| Tope de 10 zonas | 1 |
| Zona rota: se ignora esa y se avisa; ninguna válida: no se busca | 1 y 6 |
| `zonas` guardado en `sujeto` para "Mis ACM" | 5, 6, 7 Step 1, 9 Step 6 |
| Dos modos excluyentes, barrio por defecto, cero zonas al abrir | 7 |
| Modo zonas con cero tildadas: no se puede buscar | 7 Step 4, 9 Step 3 |
| Volver a barrio destilda las zonas | 7 Steps 1 y 3, 9 Step 3 |
| Sin zonas guardadas: opción 2 deshabilitada con la explicación | 7 Step 3 |
| Chip "Dentro de:", cartel del total, aviso de las sin coordenadas | 8 |
| Botón "Buscar sin la zona" | 7 Step 1 + 8, probado en 9 Step 5 |
| Rollback escrito antes del DDL | 2 |
| Prueba de regresión que falla con el bug puesto | 6 Step 5 |
| Navegador, escritorio y celular, con la cuenta propia | 9 |
| Confirmar que la medición midió (abortar con 0 filas) | 3 Step 1, 4 Step 1, 9 Step 4 |

Sin huecos.

**Un agujero que se tapó al escribir el plan:** las tres zonas guardadas están en CABA y la cartera de PRISMAIA está en La Plata, así que la prueba de la cartera con cualquiera de ellas habría devuelto `total: 0, afuera: 0` — verde, y sin haber probado nada. Y al revés: la red no tiene avisos en La Plata. De ahí la sección "Datos verificados", las dos zonas distintas y el corte por `total === 0` en las dos pruebas.

**Sin marcadores de posición:** revisado — todos los pasos traen el código o el comando exacto. El único punto con dos caminos (Task 4, Step 5) tiene el criterio de decisión medible escrito (`> 3.000 ms` en tibio o un plan sin `Bitmap Heap Scan`) y las dos ramas completas, así que no es un "ya veremos".

**Consistencia de nombres y tipos:** `resolverZonas` / `ZonaFila` / `ZonasResueltas` / `MAX_ZONAS_POR_BUSQUEDA` (Task 1) se usan igual en la Task 6. `modoZona` / `zonasElegidas` / `onModoZonaChange` / `onZonasElegidasChange` (Task 7) se usan igual en las Tasks 7 y 8. `zonasUsadas` / `onBuscarSinZona` (Task 7) coinciden con las props de la Task 8. `meta.zonas_usadas` es `string[]` (nombres) en la Task 6 y se consume como `string[]` en las Tasks 7 y 8. `Sujeto.zonas` es `{id, nombre}[]` en la Task 5 y se escribe y lee así en las Tasks 6 y 7. `p_poligonos` es `text[]` en las Tasks 3, 4 y 6.
