# Farming · Etapa 2 — «A la venta en mi zona» — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el asesor abra Farming y vea, sin cargar nada, todas las propiedades publicadas dentro de su zona, con los atajos de captación que hoy tienen datos, y pueda descartar las que ya miró.

**Architecture:** Una tabla nueva (`farming_avisos_marca`) y dos funciones SQL que leen `mercado_avisos` recortando por el polígono de la zona con PostGIS (índice `mercado_avisos_geom_idx`; medido: 24,5 ms sobre la zona real del cliente). Un endpoint de lectura y otro de marca, ambos con `createAdminClient` y validación explícita de acceso a la zona. En la pantalla, una solapa nueva junto a «Mis zonas», con lógica pura y testeada para decidir qué atajos se dibujan.

**Tech Stack:** Next.js 14.2 (App Router), React 18, Supabase (Postgres + PostGIS + RLS), vitest (`lib/**` y `app/api/**`), shadcn/ui (`Tabs`, `Button`, `Select`).

**Spec:** `docs/superpowers/specs/2026-09-11-farming-zonas-design.md` — sección «Solapa 3 · A la venta en mi zona» y la fila 2 de «En qué orden se construye».

## Global Constraints

- **No se toca `mercado_avisos`.** Solo se lee: ni una columna nueva, ni un índice nuevo. Tampoco se tocan `farming_zonas` ni `farming_zonas_compartidas` (etapa 1, en producción y **en uso por un asesor real de Central**).
- **`createAdminClient` se saltea la RLS.** Toda consulta filtra por `agency_id`, y el acceso a una zona se valida siempre (dueño o compartido) antes de devolver nada.
- **La app escribe con `service_role`:** la migración **revoca** `insert/update/delete` a `authenticated` y `anon` sobre la tabla nueva, igual que `20260912130000_farming_zonas_sin_escritura_directa.sql`.
- **Los atajos se dibujan solo si tienen datos** (decisión de Leonardo, 16-sep). Medido hoy en producción: de 67.577 avisos de venta, `caidos = 0` y `bajaron precio = 20`; con volumen real quedan `+120 días` (13.950) y `dueño directo` (823).
- **Un aviso caído entra a propósito** (spec): para buscar es ruido, para captar es la mejor señal. Por eso esta consulta **no** usa la vista `roomix_properties`, que expone solo activos.
- **Acá no se tapa al colega** (spec): se muestra `publicador_nombre`. Es la pantalla interna del asesor, no viaja a ningún cliente. Las fotos **sí** pasan por `urlFotoRed`, que es lo que el CSP exige.
- **Nada de globitos:** lo que el asesor necesita leer va como línea visible (regla del proyecto; en el celular los tooltips no se abren).
- Copy en castellano rioplatense. Comentarios en el mismo registro que el resto de `lib/farming/`.
- Nunca `git add -A`. Rama `feat/farming-avisos-en-mi-zona` (worktree `PRISMA-SYSTEM-farming2`, creado desde `origin/main` 6406363).
- La migración se aplica **con el OK de Leonardo**, por Management API, con el rollback escrito antes.

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `lib/farming/avisos.ts` | **Puro.** Los tipos de la solapa, las cuatro señales, qué atajos se dibujan y cómo se arma un aviso para la pantalla. |
| `lib/farming/avisos.test.ts` | Los tests de lo anterior. |
| `supabase/migrations/20260916120000_farming_avisos.sql` | Tabla `farming_avisos_marca` + RLS + revoke + las dos funciones SQL. |
| `supabase/rollback/20260916_farming_avisos_rollback.sql` | Cómo volver atrás. |
| `lib/farming/servidor.ts` | **Modificar:** helper `zonaAccesible` (la usan los dos endpoints nuevos). |
| `app/api/farming/avisos/route.ts` | GET: los avisos de una zona, con conteos y paginado. |
| `app/api/farming/avisos/route.test.ts` | |
| `app/api/farming/avisos/marca/route.ts` | POST (descartar) y DELETE (deshacer). |
| `app/api/farming/avisos/marca/route.test.ts` | |
| `lib/farming/base-falsa.ts` | **Modificar:** el doble aprende `rpc()`. |
| `components/farming/avisos-en-zona.tsx` | La solapa: selector de zona, atajos, lista y «descartar». |
| `components/farming/farming-page.tsx` | **Modificar:** dos solapas. |
| `docs/compartible/estandarizada/FUNCIONAL-ASESOR-PRISMA.md` · `docs/interno/bitacora-sesiones.md` · el spec | Docs. |

---

### Task 1: Los tipos y la lógica pura de la solapa

**Files:**
- Create: `lib/farming/avisos.ts`
- Test: `lib/farming/avisos.test.ts`

**Interfaces:**
- Consumes: `urlFotoRed(url: string): string` de `@/lib/acm/fotos-url`.
- Produces:
  - `type Senal = "duenos" | "caidos" | "viejos" | "bajaron"`
  - `const SENALES: { clave: Senal; etiqueta: string; porque: string }[]` (en ese orden)
  - `interface ConteosSenales { total: number; duenos: number; caidos: number; viejos: number; bajaron: number }`
  - `interface FilaAviso { id: number; es_dueno_directo: boolean; titulo: string | null; tipo: string | null; direccion: string | null; barrio: string | null; precio_usd: number | string | null; superficie_total_m2: number | string | null; ambientes: number | null; url_publica: string; foto_portada: string | null; publicador_nombre: string | null; estado: string; dias_publicado: number | null; variacion_precio_pct: number | string | null; caido_en: string | null }`
  - `interface AvisoEnZona { id: number; es_dueno_directo: boolean; titulo: string; tipo: string | null; direccion: string | null; barrio: string | null; precio_usd: number | null; m2: number | null; ambientes: number | null; url_publica: string; foto: string | null; publicador: string | null; senales: Senal[] }`
  - `interface RespuestaAvisos { zona: { id: string; nombre: string }; conteos: ConteosSenales; atajos: Senal[]; avisos: AvisoEnZona[]; pagina: number; hay_mas: boolean }`
  - `atajosVisibles(c: ConteosSenales): Senal[]`
  - `senalesDe(f: FilaAviso): Senal[]`
  - `armarAviso(f: FilaAviso): AvisoEnZona`
  - `POR_PAGINA = 60`

- [ ] **Step 1: Escribir el test, que va a fallar porque el módulo no existe**

```ts
// lib/farming/avisos.test.ts
import { describe, it, expect } from "vitest"
import { atajosVisibles, armarAviso, senalesDe, SENALES, POR_PAGINA, type FilaAviso } from "./avisos"

/**
 * La solapa «A la venta en mi zona». Las reglas que sostiene este archivo:
 *  1. Un atajo se dibuja SOLO si tiene al menos un aviso (decisión de Leonardo, 16-sep):
 *     hoy «se cayó» y «bajó el precio» dan cero en todo el sistema y un botón que da cero
 *     se siente roto.
 *  2. El orden de los atajos es el del spec: dueño directo, caído, +120 días, bajó el precio.
 *  3. Un aviso puede tener varias señales a la vez.
 *  4. La foto SIEMPRE pasa por el proxy (el CSP de la app no deja CDNs de terceros).
 *  5. Un aviso sin título no rompe la pantalla: se lo nombra por su dirección.
 */

const base: FilaAviso = {
  id: 1, es_dueno_directo: false, titulo: "Depto 3 amb", tipo: "Departamento",
  direccion: "Conde 900", barrio: "Colegiales", precio_usd: "185000", superficie_total_m2: "78",
  ambientes: 3, url_publica: "https://www.zonaprop.com.ar/x-123.html",
  foto_portada: "https://imgar.zonapropcdn.com/avisos/1/x.jpg", publicador_nombre: "Inmobiliaria X",
  estado: "activo", dias_publicado: 30, variacion_precio_pct: null, caido_en: null,
}

describe("atajosVisibles", () => {
  it("solo los que tienen al menos un aviso", () => {
    expect(atajosVisibles({ total: 170, duenos: 1, caidos: 0, viejos: 30, bajaron: 0 })).toEqual(["duenos", "viejos"])
  })

  it("con todo en cero no se dibuja ningún atajo", () => {
    expect(atajosVisibles({ total: 12, duenos: 0, caidos: 0, viejos: 0, bajaron: 0 })).toEqual([])
  })

  it("respeta el orden del spec, no el de los números", () => {
    expect(atajosVisibles({ total: 9, duenos: 2, caidos: 5, viejos: 1, bajaron: 3 })).toEqual(["duenos", "caidos", "viejos", "bajaron"])
    expect(SENALES.map((s) => s.clave)).toEqual(["duenos", "caidos", "viejos", "bajaron"])
  })
})

describe("senalesDe", () => {
  it("un aviso sin nada especial no tiene señales", () => {
    expect(senalesDe(base)).toEqual([])
  })

  it("dueño directo, caído, viejo y con baja de precio, todas juntas", () => {
    const f: FilaAviso = { ...base, es_dueno_directo: true, estado: "caido", caido_en: "2026-09-01T00:00:00Z", dias_publicado: 200, variacion_precio_pct: "-8.5" }
    expect(senalesDe(f)).toEqual(["duenos", "caidos", "viejos", "bajaron"])
  })

  it("120 días justos NO es «lleva mucho publicado»; 121 sí", () => {
    expect(senalesDe({ ...base, dias_publicado: 120 })).toEqual([])
    expect(senalesDe({ ...base, dias_publicado: 121 })).toEqual(["viejos"])
  })

  it("una SUBA de precio no es señal de captación", () => {
    expect(senalesDe({ ...base, variacion_precio_pct: "7" })).toEqual([])
  })
})

describe("armarAviso", () => {
  it("pasa la foto por el proxy y normaliza los números", () => {
    const a = armarAviso(base)
    expect(a.foto?.startsWith("/api/")).toBe(true)
    expect(a.precio_usd).toBe(185000)
    expect(a.m2).toBe(78)
    expect(a.publicador).toBe("Inmobiliaria X")
  })

  it("sin foto queda en null, no en una cadena rota", () => {
    expect(armarAviso({ ...base, foto_portada: null }).foto).toBeNull()
  })

  it("sin título, el aviso se nombra por su dirección", () => {
    expect(armarAviso({ ...base, titulo: null }).titulo).toBe("Conde 900")
    expect(armarAviso({ ...base, titulo: null, direccion: null }).titulo).toBe("Sin título")
  })

  it("un precio que no es número queda en null (la pantalla no muestra NaN)", () => {
    expect(armarAviso({ ...base, precio_usd: null }).precio_usd).toBeNull()
    expect(armarAviso({ ...base, precio_usd: "a consultar" }).precio_usd).toBeNull()
  })

  it("60 por página", () => {
    expect(POR_PAGINA).toBe(60)
  })
})
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `npx vitest run lib/farming/avisos.test.ts`
Expected: FAIL — `Cannot find module './avisos'`.

- [ ] **Step 3: Escribir la implementación**

```ts
// lib/farming/avisos.ts
//
// Farming · la solapa «A la venta en mi zona»: lo que se publica HOY adentro de la zona del
// asesor. Es la lista que le da trabajo el primer día, sin que cargue nada.
//
// Las cuatro señales salen de columnas que `mercado_avisos` ya tiene. Medido en producción el
// 16-sep sobre 67.577 avisos de venta: dueño directo 823, +120 días 13.950, caídos 0 y con baja
// de precio 20. Por eso un atajo se dibuja SOLO si tiene datos: un botón que siempre da cero se
// siente roto, y cuando el pipeline de mercado vuelva a marcar caídos aparece solo.
import { urlFotoRed } from "@/lib/acm/fotos-url"

export type Senal = "duenos" | "caidos" | "viejos" | "bajaron"

/** En el orden del spec, que es el del valor para captar: primero el dueño que vende solo. */
export const SENALES: { clave: Senal; etiqueta: string; porque: string }[] = [
  { clave: "duenos", etiqueta: "Dueño directo", porque: "Vende solo, sin inmobiliaria" },
  { clave: "caidos", etiqueta: "Se cayó del portal", porque: "Lo bajó sin venderlo" },
  { clave: "viejos", etiqueta: "Lleva +120 días", porque: "El colega no lo mueve" },
  { clave: "bajaron", etiqueta: "Bajó el precio", porque: "Ya aceptó que estaba caro" },
]

/** Más de 120 días publicado. El día 120 justo todavía no es «lleva mucho». */
const DIAS_VIEJO = 120

export const POR_PAGINA = 60

export interface ConteosSenales {
  total: number
  duenos: number
  caidos: number
  viejos: number
  bajaron: number
}

/** Una fila cruda de `farming_avisos_en_zona`. */
export interface FilaAviso {
  id: number
  es_dueno_directo: boolean
  titulo: string | null
  tipo: string | null
  direccion: string | null
  barrio: string | null
  precio_usd: number | string | null
  superficie_total_m2: number | string | null
  ambientes: number | null
  url_publica: string
  foto_portada: string | null
  publicador_nombre: string | null
  estado: string
  dias_publicado: number | null
  variacion_precio_pct: number | string | null
  caido_en: string | null
}

export interface AvisoEnZona {
  id: number
  es_dueno_directo: boolean
  titulo: string
  tipo: string | null
  direccion: string | null
  barrio: string | null
  precio_usd: number | null
  m2: number | null
  ambientes: number | null
  url_publica: string
  foto: string | null
  publicador: string | null
  senales: Senal[]
}

export interface RespuestaAvisos {
  zona: { id: string; nombre: string }
  conteos: ConteosSenales
  atajos: Senal[]
  avisos: AvisoEnZona[]
  pagina: number
  hay_mas: boolean
}

/** Los atajos que se dibujan: los que tienen al menos un aviso, en el orden del spec. */
export function atajosVisibles(c: ConteosSenales): Senal[] {
  return SENALES.filter((s) => (c[s.clave] ?? 0) > 0).map((s) => s.clave)
}

const num = (v: number | string | null): number | null => {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Qué señales de captación tiene un aviso. Un mismo aviso puede tener varias. */
export function senalesDe(f: FilaAviso): Senal[] {
  const s: Senal[] = []
  if (f.es_dueno_directo) s.push("duenos")
  if (f.estado === "caido") s.push("caidos")
  if ((f.dias_publicado ?? 0) > DIAS_VIEJO) s.push("viejos")
  if ((num(f.variacion_precio_pct) ?? 0) < 0) s.push("bajaron")
  return s
}

export function armarAviso(f: FilaAviso): AvisoEnZona {
  return {
    id: f.id,
    es_dueno_directo: f.es_dueno_directo,
    // Sin título el aviso igual tiene que poder nombrarse: el asesor lo busca por la puerta.
    titulo: f.titulo?.trim() || f.direccion?.trim() || "Sin título",
    tipo: f.tipo,
    direccion: f.direccion,
    barrio: f.barrio,
    precio_usd: num(f.precio_usd),
    m2: num(f.superficie_total_m2),
    ambientes: f.ambientes,
    url_publica: f.url_publica,
    // La foto SIEMPRE por el proxy: el CSP de la app (img-src) no permite CDNs de terceros, y
    // así el navegador del asesor tampoco deja su Referer en el CDN ajeno.
    foto: f.foto_portada ? urlFotoRed(f.foto_portada) : null,
    publicador: f.publicador_nombre,
    senales: senalesDe(f),
  }
}
```

- [ ] **Step 4: Correr y ver pasar**

Run: `npx vitest run lib/farming/avisos.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/farming/avisos.ts lib/farming/avisos.test.ts
git commit -m "feat(farming): tipos y logica pura de la solapa de avisos (los atajos se dibujan solo si tienen datos)"
```

---

### Task 2: La migración — tabla de marcas y las dos funciones SQL

**Files:**
- Create: `supabase/migrations/20260916120000_farming_avisos.sql`
- Create: `supabase/rollback/20260916_farming_avisos_rollback.sql`

**Interfaces:**
- Produces: tabla `public.farming_avisos_marca`; funciones `public.farming_avisos_en_zona(text, text, bigint[], integer, integer)` y `public.farming_avisos_conteos(text, bigint[])`. Las tareas 3 y 4 dependen de estos nombres y del orden de los parámetros.

**Alcance de este dispatch:** escribir y commitear los dos archivos. **NO aplicar nada a la base**: la aplica el controlador con el OK de Leonardo.

- [ ] **Step 1: El rollback primero**

```sql
-- supabase/rollback/20260916_farming_avisos_rollback.sql
-- Deshace 20260916120000_farming_avisos.sql. Borra SOLO lo de la etapa 2 de Farming.
-- No toca mercado_avisos, farming_zonas ni farming_zonas_compartidas.
begin;
drop function if exists public.farming_avisos_en_zona(text, text, bigint[], integer, integer);
drop function if exists public.farming_avisos_conteos(text, bigint[]);
drop table if exists public.farming_avisos_marca;
commit;
```

- [ ] **Step 2: La migración**

```sql
-- supabase/migrations/20260916120000_farming_avisos.sql
--
-- Farming · etapa 2: «A la venta en mi zona».
-- Spec: docs/superpowers/specs/2026-09-11-farming-zonas-design.md
--
-- QUÉ NO SE TOCA: mercado_avisos (solo se lee; ni una columna ni un índice nuevo),
-- farming_zonas y farming_zonas_compartidas (etapa 1, EN USO por un asesor de Central).
--
-- POR QUÉ ESTA CONSULTA Y NO LA VISTA roomix_properties: la vista expone solo avisos activos,
-- y acá el caído entra a propósito — para buscar es ruido, para captar es la mejor señal.
--
-- EL ÍNDICE: el recorte va como ST_Intersects(geom, <poligono>::geography), que es lo que
-- engancha mercado_avisos_geom_idx en las DOS particiones. Medido contra producción el
-- 16-sep-2026 sobre la zona real de Central (170 avisos adentro):
--     Index Scan en mercado_avisos_inmobiliarias_geom_idx + mercado_avisos_duenos_geom_idx
--     Execution Time: 24,5 ms · Buffers: shared hit=457
--
-- Aplicar por Management API con el OK de Leonardo.
-- Rollback: supabase/rollback/20260916_farming_avisos_rollback.sql

begin;

-- ── Lo que el asesor ya miró ──
create table if not exists public.farming_avisos_marca (
  zona_id                uuid    not null references public.farming_zonas(id) on delete cascade,
  -- Sin clave foránea a mercado_avisos A PROPÓSITO: su PK es compuesta por la partición
  -- (id, es_dueno_directo) y el crawler reescribe filas. El id se guarda como referencia suelta.
  aviso_id               bigint  not null,
  aviso_es_dueno_directo boolean not null,
  user_id                uuid    not null,
  estado                 text    not null default 'descartado'
                                 check (estado in ('descartado', 'convertido')),
  -- ETAPA 3: cuando el aviso se convierte en tarjeta de relevamiento, acá va su dirección.
  direccion_id           uuid,
  created_at             timestamptz not null default now(),
  primary key (zona_id, aviso_id)
);

comment on table public.farming_avisos_marca is
  'Avisos que el asesor ya descartó (o convirtió en tarjeta) dentro de una zona de farming. Sin FK a mercado_avisos: su PK es compuesta por la particion.';

create index if not exists farming_avisos_marca_zona_idx on public.farming_avisos_marca (zona_id, estado);

alter table public.farming_avisos_marca enable row level security;

-- Ver y marcar: el dueño de la zona o alguien con quien la comparte.
drop policy if exists farming_avisos_marca_de_mi_zona on public.farming_avisos_marca;
create policy farming_avisos_marca_de_mi_zona on public.farming_avisos_marca
  for select to authenticated
  using (exists (
    select 1 from public.farming_zonas z
    where z.id = zona_id
      and (z.owner_user_id = auth.uid()
           or exists (select 1 from public.farming_zonas_compartidas c
                      where c.zona_id = z.id and c.user_id = auth.uid()))
  ));

-- La app escribe SIEMPRE con service_role (el endpoint valida el acceso a la zona). Sin esto,
-- cualquier usuario logueado podría escribir la tabla por PostgREST: es el mismo agujero que
-- cerró 20260912130000 en farming_zonas.
revoke insert, update, delete on public.farming_avisos_marca from authenticated, anon;

-- ── Los avisos de la zona ──
-- p_geojson: el polígono de la zona (GeoJSON como texto), que el endpoint ya leyó tras validar
--            el acceso. p_senal: null = todos. p_excluir: los avisos ya descartados.
create or replace function public.farming_avisos_en_zona(
  p_geojson  text,
  p_senal    text     default null,
  p_excluir  bigint[] default '{}',
  p_limit    integer  default 60,
  p_offset   integer  default 0
)
returns table (
  id bigint, es_dueno_directo boolean, titulo text, tipo text, direccion text, barrio text,
  precio_usd numeric, superficie_total_m2 numeric, ambientes smallint, url_publica text,
  foto_portada text, publicador_nombre text, estado text, dias_publicado integer,
  variacion_precio_pct numeric, caido_en timestamptz
)
language sql
stable
parallel safe
as $$
  select m.id, m.es_dueno_directo, m.titulo, m.tipo, m.direccion, m.barrio,
         m.precio_usd, m.superficie_total_m2, m.ambientes, m.url_publica,
         m.foto_portada, m.publicador_nombre, m.estado, m.dias_publicado,
         m.variacion_precio_pct, m.caido_en
  from public.mercado_avisos m
  where m.geom is not null
    and ST_Intersects(m.geom, ST_GeomFromGeoJSON(p_geojson)::geography)
    and m.calidad = 'ok'
    and m.operacion = 'venta'
    -- El caído entra a propósito, pero solo el reciente: uno de hace un año no se capta.
    and (m.estado = 'activo' or (m.estado = 'caido' and m.caido_en > now() - interval '180 days'))
    and not (m.id = any (p_excluir))
    and (p_senal is null
         or (p_senal = 'duenos'  and m.es_dueno_directo)
         or (p_senal = 'caidos'  and m.estado = 'caido')
         or (p_senal = 'viejos'  and m.dias_publicado > 120)
         or (p_senal = 'bajaron' and m.variacion_precio_pct < 0))
  -- El orden es el del valor para captar: el dueño que vende solo primero, después el que se
  -- cayó, después el que lleva más tiempo colgado.
  order by m.es_dueno_directo desc,
           (m.estado = 'caido') desc,
           m.dias_publicado desc nulls last,
           m.id
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;

comment on function public.farming_avisos_en_zona is
  'Avisos de venta publicados dentro de una zona de farming. El caido reciente entra a proposito (senal de captacion). Lo llama el endpoint con service_role, que ya valido el acceso a la zona.';

-- ── Los conteos, para saber qué atajos dibujar ──
create or replace function public.farming_avisos_conteos(
  p_geojson text,
  p_excluir bigint[] default '{}'
)
returns table (total bigint, duenos bigint, caidos bigint, viejos bigint, bajaron bigint)
language sql
stable
parallel safe
as $$
  select count(*)                                                   as total,
         count(*) filter (where m.es_dueno_directo)                 as duenos,
         count(*) filter (where m.estado = 'caido')                 as caidos,
         count(*) filter (where m.dias_publicado > 120)             as viejos,
         count(*) filter (where m.variacion_precio_pct < 0)         as bajaron
  from public.mercado_avisos m
  where m.geom is not null
    and ST_Intersects(m.geom, ST_GeomFromGeoJSON(p_geojson)::geography)
    and m.calidad = 'ok'
    and m.operacion = 'venta'
    and (m.estado = 'activo' or (m.estado = 'caido' and m.caido_en > now() - interval '180 days'))
    and not (m.id = any (p_excluir));
$$;

comment on function public.farming_avisos_conteos is
  'Cuantos avisos de cada senal hay en la zona. La pantalla dibuja el atajo solo si su conteo es mayor a cero.';

-- Solo el servidor: la app entra con service_role y valida el acceso a la zona antes de llamar.
revoke execute on function public.farming_avisos_en_zona(text, text, bigint[], integer, integer) from public, anon, authenticated;
revoke execute on function public.farming_avisos_conteos(text, bigint[]) from public, anon, authenticated;
grant execute on function public.farming_avisos_en_zona(text, text, bigint[], integer, integer) to service_role;
grant execute on function public.farming_avisos_conteos(text, bigint[]) to service_role;

commit;
```

- [ ] **Step 3: Commit (sin aplicar)**

```bash
git add supabase/migrations/20260916120000_farming_avisos.sql supabase/rollback/20260916_farming_avisos_rollback.sql
git commit -m "feat(farming): migracion de la etapa 2 — marcas de aviso y las dos funciones de zona

Todavia NO aplicada en produccion: se aplica con OK de Leonardo."
```

---

### Task 3: El doble de base aprende `rpc`, y el endpoint que lista los avisos

**Files:**
- Modify: `lib/farming/base-falsa.ts`
- Modify: `lib/farming/servidor.ts`
- Create: `app/api/farming/avisos/route.ts`
- Test: `app/api/farming/avisos/route.test.ts`

**Interfaces:**
- Consumes: `requireTenant()` → `{ userId, agencyId, role }`; `createAdminClient()`; `responderError` de `@/lib/farming/servidor`; `armarAviso`, `atajosVisibles`, `POR_PAGINA`, tipos de `@/lib/farming/avisos`.
- Produces:
  - `servidor.ts`: `zonaAccesible(admin, zonaId, agencyId, userId): Promise<{ zona: { id: string; nombre: string; geojson: unknown } | null; puede: boolean }>`
  - `base-falsa.ts`: `baseFalsa(tablas, rpcs?)` — `rpcs` es `Record<string, (args: any) => any[]>`; el doble expone `rpc(fn, args)`.
  - `GET /api/farming/avisos?zona_id=<uuid>&senal=<Senal|vacío>&pagina=<n>` → 200 `RespuestaAvisos` · 400 (sin `zona_id`, señal desconocida) · 403 (la zona es de otro) · 404 (no existe o no está activa).

- [ ] **Step 1: Escribir los tests**

```ts
// app/api/farming/avisos/route.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest"
import { baseFalsa } from "@/lib/farming/base-falsa"

/**
 * Los avisos publicados dentro de una zona. Las reglas que sostiene este archivo:
 *  1. La zona se valida SIEMPRE: de otro asesor → 403; de otra agencia o liberada → 404.
 *     createAdminClient se saltea la RLS, así que el filtro explícito no es opcional.
 *  2. Los descartados NO vuelven: viajan a la función como p_excluir, para que la página
 *     no quede corta y los conteos no mientan.
 *  3. Los atajos que se devuelven son solo los que tienen datos.
 *  4. Una señal desconocida es 400, no una consulta sin filtro.
 */

const AGENCIA = "ag-1"
const YO = "u-yo", JUAN = "u-juan"
const cuadrado = { type: "Polygon", coordinates: [[[-58.46, -34.56], [-58.45, -34.56], [-58.45, -34.55], [-58.46, -34.55], [-58.46, -34.56]]] }

const sesion = { userId: YO, agencyId: AGENCIA, role: "asesor" }
vi.mock("@/lib/auth/tenant-validation", () => ({ requireTenant: async () => ({ ...sesion }) }))

const espia = { rpc: [] as { fn: string; args: any }[] }
let base = baseFalsa({})
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => base }))

const { GET } = await import("./route")

const fila = (id: number, extra: any = {}) => ({
  id, es_dueno_directo: false, titulo: `Aviso ${id}`, tipo: "Departamento", direccion: "Conde 900",
  barrio: "Colegiales", precio_usd: "185000", superficie_total_m2: "78", ambientes: 3,
  url_publica: `https://www.zonaprop.com.ar/x-${id}.html`, foto_portada: null,
  publicador_nombre: "Inmobiliaria X", estado: "activo", dias_publicado: 30,
  variacion_precio_pct: null, caido_en: null, ...extra,
})

const pedir = (qs: string) => GET(new Request(`http://localhost/api/farming/avisos?${qs}`))

beforeEach(() => {
  espia.rpc = []
  base = baseFalsa(
    {
      farming_zonas: [
        { id: "z-mia", agency_id: AGENCIA, owner_user_id: YO, nombre: "Colegiales", geojson: cuadrado, estado: "activa" },
        { id: "z-juan", agency_id: AGENCIA, owner_user_id: JUAN, nombre: "De Juan", geojson: cuadrado, estado: "activa" },
        { id: "z-liberada", agency_id: AGENCIA, owner_user_id: YO, nombre: "Vieja", geojson: cuadrado, estado: "liberada" },
        { id: "z-ajena", agency_id: "ag-2", owner_user_id: "u-x", nombre: "Otra agencia", geojson: cuadrado, estado: "activa" },
      ],
      farming_zonas_compartidas: [{ zona_id: "z-juan", user_id: YO, agregado_por: JUAN, created_at: "" }],
      farming_avisos_marca: [{ zona_id: "z-mia", aviso_id: 7, aviso_es_dueno_directo: false, user_id: YO, estado: "descartado", created_at: "" }],
    },
    {
      farming_avisos_en_zona: (args: any) => { espia.rpc.push({ fn: "farming_avisos_en_zona", args }); return [fila(1), fila(2, { es_dueno_directo: true })] },
      farming_avisos_conteos: (args: any) => { espia.rpc.push({ fn: "farming_avisos_conteos", args }); return [{ total: 170, duenos: 1, caidos: 0, viejos: 30, bajaron: 0 }] },
    },
  )
})

describe("GET /api/farming/avisos", () => {
  it("devuelve los avisos de mi zona con los conteos y solo los atajos con datos", async () => {
    const r = await pedir("zona_id=z-mia")
    const d = await r.json()
    expect(r.status).toBe(200)
    expect(d.zona).toEqual({ id: "z-mia", nombre: "Colegiales" })
    expect(d.conteos.total).toBe(170)
    expect(d.atajos).toEqual(["duenos", "viejos"])
    expect(d.avisos).toHaveLength(2)
    expect(d.avisos[0].titulo).toBe("Aviso 1")
  })

  it("los descartados viajan como p_excluir a las DOS funciones", async () => {
    await pedir("zona_id=z-mia")
    expect(espia.rpc).toHaveLength(2)
    for (const llamada of espia.rpc) expect(llamada.args.p_excluir).toEqual([7])
  })

  it("una zona compartida conmigo también se puede ver", async () => {
    expect((await pedir("zona_id=z-juan")).status).toBe(200)
  })

  it("la zona de otro asesor que NO comparte conmigo: 403", async () => {
    base.tablas.farming_zonas_compartidas = []
    expect((await pedir("zona_id=z-juan")).status).toBe(403)
  })

  it("una zona de otra agencia: 404", async () => {
    expect((await pedir("zona_id=z-ajena")).status).toBe(404)
  })

  it("una zona liberada: 404", async () => {
    expect((await pedir("zona_id=z-liberada")).status).toBe(404)
  })

  it("sin zona_id: 400", async () => {
    expect((await pedir("")).status).toBe(400)
  })

  it("una señal que no existe: 400 y no se consulta nada", async () => {
    const r = await pedir("zona_id=z-mia&senal=cualquiera")
    expect(r.status).toBe(400)
    expect(espia.rpc).toEqual([])
  })

  it("una señal válida viaja tal cual, y la página se traduce a offset", async () => {
    await pedir("zona_id=z-mia&senal=duenos&pagina=2")
    const lista = espia.rpc.find((x) => x.fn === "farming_avisos_en_zona")!
    expect(lista.args.p_senal).toBe("duenos")
    expect(lista.args.p_offset).toBe(120)
    expect(lista.args.p_limit).toBe(61)
  })

  it("hay_mas es true solo si vino una fila de más", async () => {
    const d = await (await pedir("zona_id=z-mia")).json()
    expect(d.hay_mas).toBe(false)
    expect(d.pagina).toBe(0)
  })
})
```

- [ ] **Step 2: Verlos fallar**

Run: `npx vitest run app/api/farming/avisos/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: El doble aprende `rpc`**

En `lib/farming/base-falsa.ts`, cambiar la firma y agregar el método. La función pasa a ser:

```ts
export function baseFalsa(inicial: Record<string, Fila[]>, rpcs: Record<string, (args: any) => Fila[]> = {}) {
```

y antes del `return { from, tablas }` final, agregar:

```ts
  /** Las funciones SQL: el doble no ejecuta SQL, devuelve lo que el test programó.
   *  Igual que el cliente real, responde { data, error } y nunca tira. */
  async function rpc(fn: string, args: any) {
    const impl = rpcs[fn]
    if (!impl) return { data: null, error: { message: `rpc desconocida: ${fn}` } }
    return { data: impl(args), error: null }
  }
```

y devolver `{ from, rpc, tablas }`.

- [ ] **Step 4: El helper de acceso a una zona**

En `lib/farming/servidor.ts`, agregar al final:

```ts
/**
 * ¿Puede esta persona ver esta zona? Dueño o compartido, de su agencia y activa.
 * Devuelve la zona aunque no pueda, para distinguir 403 (es de un colega) de 404 (no existe,
 * es de otra agencia, o ya no está activa): son dos cosas distintas para quien mira la pantalla.
 */
export async function zonaAccesible(
  admin: SupabaseClient<any, any, any>,
  zonaId: string,
  agencyId: string,
  userId: string,
): Promise<{ zona: { id: string; nombre: string; geojson: unknown } | null; puede: boolean }> {
  const { data, error } = await admin
    .from("farming_zonas")
    .select("id, nombre, geojson, owner_user_id")
    .eq("id", zonaId)
    .eq("agency_id", agencyId)
    .eq("estado", "activa")
    .maybeSingle()
  if (error) throw error
  if (!data) return { zona: null, puede: false }

  const fila = data as any
  if (fila.owner_user_id === userId) {
    return { zona: { id: fila.id, nombre: fila.nombre, geojson: fila.geojson }, puede: true }
  }

  const { data: compartida, error: e2 } = await admin
    .from("farming_zonas_compartidas")
    .select("zona_id")
    .eq("zona_id", zonaId)
    .eq("user_id", userId)
    .maybeSingle()
  if (e2) throw e2

  return { zona: { id: fila.id, nombre: fila.nombre, geojson: fila.geojson }, puede: !!compartida }
}
```

- [ ] **Step 5: El endpoint**

```ts
// app/api/farming/avisos/route.ts
//
// Farming · lo que se publica HOY adentro de una zona. La lista no se guarda en ningún lado:
// se calcula del polígono en cada carga, así el trazo y la lista nunca se desfasan.
//
// createAdminClient se saltea la RLS: el acceso a la zona se valida a mano, siempre.
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireTenant } from "@/lib/auth/tenant-validation"
import { responderError, zonaAccesible } from "@/lib/farming/servidor"
import { armarAviso, atajosVisibles, POR_PAGINA, SENALES, type ConteosSenales, type FilaAviso, type Senal } from "@/lib/farming/avisos"

export const dynamic = "force-dynamic"

const CLAVES: string[] = SENALES.map((s) => s.clave)

export async function GET(req: Request) {
  try {
    const { userId, agencyId } = await requireTenant()
    const q = new URL(req.url).searchParams

    const zonaId = q.get("zona_id")?.trim()
    if (!zonaId) return NextResponse.json({ error: "Falta la zona" }, { status: 400 })

    const senal = q.get("senal")?.trim() || null
    if (senal && !CLAVES.includes(senal)) {
      return NextResponse.json({ error: "No conozco ese filtro" }, { status: 400 })
    }

    const pagina = Math.max(0, Number(q.get("pagina") ?? 0) || 0)

    const admin = createAdminClient()
    const { zona, puede } = await zonaAccesible(admin, zonaId, agencyId, userId)
    if (!zona) return NextResponse.json({ error: "No encontramos esa zona activa" }, { status: 404 })
    if (!puede) return NextResponse.json({ error: "Esa zona es de un colega" }, { status: 403 })

    // Lo ya descartado no vuelve a aparecer: va a la consulta, no se filtra después, para que
    // la página no quede corta ni los conteos mientan.
    const { data: marcas, error: eM } = await admin
      .from("farming_avisos_marca")
      .select("aviso_id")
      .eq("zona_id", zonaId)
      .eq("estado", "descartado")
    if (eM) throw eM
    const excluir = (marcas || []).map((m: any) => Number(m.aviso_id))

    const geojson = JSON.stringify(zona.geojson)

    // Se pide UNA fila de más que la página: así se sabe si hay más sin contar dos veces.
    const [lista, conteos] = await Promise.all([
      admin.rpc("farming_avisos_en_zona", {
        p_geojson: geojson,
        p_senal: senal,
        p_excluir: excluir,
        p_limit: POR_PAGINA + 1,
        p_offset: pagina * POR_PAGINA,
      }),
      admin.rpc("farming_avisos_conteos", { p_geojson: geojson, p_excluir: excluir }),
    ])
    if (lista.error) throw lista.error
    if (conteos.error) throw conteos.error

    const filas = (lista.data || []) as FilaAviso[]
    const hayMas = filas.length > POR_PAGINA
    const c = ((conteos.data || [])[0] || { total: 0, duenos: 0, caidos: 0, viejos: 0, bajaron: 0 }) as ConteosSenales

    return NextResponse.json({
      zona: { id: zona.id, nombre: zona.nombre },
      conteos: {
        total: Number(c.total) || 0,
        duenos: Number(c.duenos) || 0,
        caidos: Number(c.caidos) || 0,
        viejos: Number(c.viejos) || 0,
        bajaron: Number(c.bajaron) || 0,
      },
      atajos: atajosVisibles({
        total: Number(c.total) || 0,
        duenos: Number(c.duenos) || 0,
        caidos: Number(c.caidos) || 0,
        viejos: Number(c.viejos) || 0,
        bajaron: Number(c.bajaron) || 0,
      }) as Senal[],
      avisos: filas.slice(0, POR_PAGINA).map(armarAviso),
      pagina,
      hay_mas: hayMas,
    })
  } catch (e) {
    return responderError(e, "avisos de la zona")
  }
}
```

- [ ] **Step 6: Verlos pasar**

Run: `npx vitest run app/api/farming/avisos/route.test.ts lib/farming`
Expected: PASS (10 del endpoint + los de `lib/farming`).

- [ ] **Step 7: Commit**

```bash
git add lib/farming/base-falsa.ts lib/farming/servidor.ts app/api/farming/avisos/route.ts app/api/farming/avisos/route.test.ts
git commit -m "feat(farming): GET /api/farming/avisos — los avisos de la zona, con conteos y descartados fuera"
```

---

### Task 4: Descartar un aviso (y deshacerlo)

**Files:**
- Create: `app/api/farming/avisos/marca/route.ts`
- Test: `app/api/farming/avisos/marca/route.test.ts`

**Interfaces:**
- Consumes: `zonaAccesible`, `responderError` de `@/lib/farming/servidor`.
- Produces:
  - `POST /api/farming/avisos/marca` body `{ zona_id: string; aviso_id: number; es_dueno_directo: boolean }` → 200 `{ ok: true }` · 400 · 403 · 404
  - `DELETE /api/farming/avisos/marca?zona_id=<uuid>&aviso_id=<n>` → 200 `{ ok: true }` · 400 · 403 · 404

- [ ] **Step 1: Escribir los tests**

```ts
// app/api/farming/avisos/marca/route.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest"
import { baseFalsa } from "@/lib/farming/base-falsa"

/**
 * Descartar un aviso de la zona. Reglas:
 *  1. Solo en una zona a la que tengo acceso (dueño o compartido): si no, 403/404.
 *  2. Descartar dos veces el mismo aviso no duplica la fila ni falla.
 *  3. Deshacer borra la marca; deshacer algo que no existe no rompe.
 *  4. La marca guarda quién la hizo (queda firmada, como todo en Farming).
 */

const AGENCIA = "ag-1"
const YO = "u-yo", JUAN = "u-juan"
const cuadrado = { type: "Polygon", coordinates: [[[-58.46, -34.56], [-58.45, -34.56], [-58.45, -34.55], [-58.46, -34.55], [-58.46, -34.56]]] }

const sesion = { userId: YO, agencyId: AGENCIA, role: "asesor" }
vi.mock("@/lib/auth/tenant-validation", () => ({ requireTenant: async () => ({ ...sesion }) }))
let base = baseFalsa({})
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => base }))

const { POST, DELETE } = await import("./route")

const descartar = (body: any) =>
  POST(new Request("http://localhost/api/farming/avisos/marca", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }))
const deshacer = (qs: string) =>
  DELETE(new Request(`http://localhost/api/farming/avisos/marca?${qs}`, { method: "DELETE" }))

beforeEach(() => {
  base = baseFalsa({
    farming_zonas: [
      { id: "z-mia", agency_id: AGENCIA, owner_user_id: YO, nombre: "Colegiales", geojson: cuadrado, estado: "activa" },
      { id: "z-juan", agency_id: AGENCIA, owner_user_id: JUAN, nombre: "De Juan", geojson: cuadrado, estado: "activa" },
      { id: "z-ajena", agency_id: "ag-2", owner_user_id: "u-x", nombre: "Otra", geojson: cuadrado, estado: "activa" },
    ],
    farming_zonas_compartidas: [],
    farming_avisos_marca: [],
  })
})

describe("POST (descartar)", () => {
  it("guarda la marca firmada por quien la hizo", async () => {
    const r = await descartar({ zona_id: "z-mia", aviso_id: 42, es_dueno_directo: true })
    expect(r.status).toBe(200)
    expect(base.tablas.farming_avisos_marca).toEqual([
      expect.objectContaining({ zona_id: "z-mia", aviso_id: 42, aviso_es_dueno_directo: true, user_id: YO, estado: "descartado" }),
    ])
  })

  it("descartar dos veces el mismo aviso no duplica", async () => {
    await descartar({ zona_id: "z-mia", aviso_id: 42, es_dueno_directo: false })
    const r = await descartar({ zona_id: "z-mia", aviso_id: 42, es_dueno_directo: false })
    expect(r.status).toBe(200)
    expect(base.tablas.farming_avisos_marca).toHaveLength(1)
  })

  it("en la zona de un colega que no comparte conmigo: 403 y no guarda", async () => {
    const r = await descartar({ zona_id: "z-juan", aviso_id: 42, es_dueno_directo: false })
    expect(r.status).toBe(403)
    expect(base.tablas.farming_avisos_marca).toEqual([])
  })

  it("en una zona de otra agencia: 404", async () => {
    expect((await descartar({ zona_id: "z-ajena", aviso_id: 42, es_dueno_directo: false })).status).toBe(404)
  })

  it.each([
    ["sin zona", { aviso_id: 42, es_dueno_directo: false }],
    ["sin aviso", { zona_id: "z-mia", es_dueno_directo: false }],
    ["aviso que no es número", { zona_id: "z-mia", aviso_id: "x", es_dueno_directo: false }],
  ])("%s: 400", async (_, body) => {
    expect((await descartar(body)).status).toBe(400)
  })
})

describe("DELETE (deshacer)", () => {
  it("borra la marca", async () => {
    await descartar({ zona_id: "z-mia", aviso_id: 42, es_dueno_directo: false })
    const r = await deshacer("zona_id=z-mia&aviso_id=42")
    expect(r.status).toBe(200)
    expect(base.tablas.farming_avisos_marca).toEqual([])
  })

  it("deshacer algo que no estaba marcado no rompe", async () => {
    expect((await deshacer("zona_id=z-mia&aviso_id=999")).status).toBe(200)
  })

  it("en la zona de un colega: 403", async () => {
    expect((await deshacer("zona_id=z-juan&aviso_id=42")).status).toBe(403)
  })
})
```

- [ ] **Step 2: Verlos fallar**

Run: `npx vitest run app/api/farming/avisos/marca/route.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: El endpoint**

```ts
// app/api/farming/avisos/marca/route.ts
//
// Farming · «ya miré este aviso». Descartar saca el aviso de la lista de la zona; deshacer lo
// devuelve. La marca queda firmada por quien la hizo: la zona puede ser compartida.
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireTenant } from "@/lib/auth/tenant-validation"
import { responderError, zonaAccesible } from "@/lib/farming/servidor"

export const dynamic = "force-dynamic"

/** El acceso a la zona se valida igual en las dos operaciones. */
async function permiso(admin: ReturnType<typeof createAdminClient>, zonaId: string, agencyId: string, userId: string) {
  const { zona, puede } = await zonaAccesible(admin, zonaId, agencyId, userId)
  if (!zona) return { error: "No encontramos esa zona activa", status: 404 as const }
  if (!puede) return { error: "Esa zona es de un colega", status: 403 as const }
  return null
}

export async function POST(req: Request) {
  try {
    const { userId, agencyId } = await requireTenant()
    const body = await req.json().catch(() => ({}))

    const zonaId = String(body?.zona_id || "").trim()
    const avisoId = Number(body?.aviso_id)
    if (!zonaId || !Number.isInteger(avisoId)) {
      return NextResponse.json({ error: "Falta la zona o el aviso" }, { status: 400 })
    }

    const admin = createAdminClient()
    const no = await permiso(admin, zonaId, agencyId, userId)
    if (no) return NextResponse.json({ error: no.error }, { status: no.status })

    // Descartar dos veces el mismo aviso no puede fallar: la PK es (zona_id, aviso_id).
    const { data: ya, error: e1 } = await admin
      .from("farming_avisos_marca")
      .select("aviso_id")
      .eq("zona_id", zonaId)
      .eq("aviso_id", avisoId)
      .maybeSingle()
    if (e1) throw e1

    if (!ya) {
      const { error: e2 } = await admin.from("farming_avisos_marca").insert({
        zona_id: zonaId,
        aviso_id: avisoId,
        aviso_es_dueno_directo: !!body?.es_dueno_directo,
        user_id: userId,
        estado: "descartado",
      })
      if (e2) throw e2
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return responderError(e, "descartar aviso")
  }
}

export async function DELETE(req: Request) {
  try {
    const { userId, agencyId } = await requireTenant()
    const q = new URL(req.url).searchParams

    const zonaId = q.get("zona_id")?.trim() || ""
    const avisoId = Number(q.get("aviso_id"))
    if (!zonaId || !Number.isInteger(avisoId)) {
      return NextResponse.json({ error: "Falta la zona o el aviso" }, { status: 400 })
    }

    const admin = createAdminClient()
    const no = await permiso(admin, zonaId, agencyId, userId)
    if (no) return NextResponse.json({ error: no.error }, { status: no.status })

    const { error } = await admin.from("farming_avisos_marca").delete().eq("zona_id", zonaId).eq("aviso_id", avisoId)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (e) {
    return responderError(e, "deshacer descarte")
  }
}
```

- [ ] **Step 4: Verlos pasar**

Run: `npx vitest run app/api/farming lib/farming`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/farming/avisos/marca/route.ts app/api/farming/avisos/marca/route.test.ts
git commit -m "feat(farming): descartar un aviso de la zona y deshacerlo"
```

---

### Task 5: La solapa en pantalla

**Files:**
- Create: `components/farming/avisos-en-zona.tsx`
- Modify: `components/farming/farming-page.tsx`

**Interfaces:**
- Consumes: `pedir` de `@/lib/farming/cliente`; `SENALES`, tipos de `@/lib/farming/avisos`; `ZonaFarming` de `@/lib/farming/tipos`; `Tabs, TabsList, TabsTrigger, TabsContent` de `@/components/ui/tabs`; `Select, SelectTrigger, SelectValue, SelectContent, SelectItem` de `@/components/ui/select`; `Button`.
- Produces: `AvisosEnZona({ zonas }: { zonas: ZonaFarming[] })`.

- [ ] **Step 1: El componente**

```tsx
// components/farming/avisos-en-zona.tsx
"use client"

// Farming · «A la venta en mi zona»: lo que se publica HOY adentro del territorio del asesor.
// Es lo que le da trabajo el primer día, sin cargar nada.
//
// Los atajos se dibujan solo si tienen avisos (decisión de Leonardo, 16-sep): hoy «se cayó» y
// «bajó el precio» dan cero en todo el sistema, y un botón que da cero se siente roto.
//
// Acá NO se tapa al colega que publica (spec): es la pantalla interna del asesor, no viaja a
// ningún cliente, y saber quién publica es justamente el dato que necesita.
import { useCallback, useEffect, useState } from "react"
import { ExternalLink, Loader2, Undo2, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { pedir } from "@/lib/farming/cliente"
import { SENALES, type AvisoEnZona, type RespuestaAvisos, type Senal } from "@/lib/farming/avisos"
import type { ZonaFarming } from "@/lib/farming/tipos"

const plata = (n: number | null) => (n === null ? "Precio a consultar" : `USD ${n.toLocaleString("es-AR")}`)

function Tarjeta({ aviso, onDescartar }: { aviso: AvisoEnZona; onDescartar: (a: AvisoEnZona) => void }) {
  return (
    <div className="flex gap-3 rounded-xl border border-zinc-200 bg-card p-3 dark:border-zinc-800">
      {aviso.foto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={aviso.foto} alt="" className="h-24 w-32 shrink-0 rounded-lg object-cover" loading="lazy" />
      ) : (
        <div className="flex h-24 w-32 shrink-0 items-center justify-center rounded-lg bg-muted text-[11px] text-muted-foreground">sin foto</div>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{aviso.titulo}</p>
        <p className="text-sm">{plata(aviso.precio_usd)}</p>
        <p className="truncate text-xs text-muted-foreground">
          {[aviso.tipo, aviso.direccion, aviso.barrio].filter(Boolean).join(" · ")}
          {aviso.m2 ? ` · ${aviso.m2} m²` : ""}
          {aviso.ambientes ? ` · ${aviso.ambientes} amb` : ""}
        </p>
        {aviso.publicador && <p className="truncate text-xs text-muted-foreground">Publica: {aviso.publicador}</p>}

        {aviso.senales.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {aviso.senales.map((s) => (
              <span key={s} className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                {SENALES.find((x) => x.clave === s)?.etiqueta}
              </span>
            ))}
          </div>
        )}

        <div className="mt-2 flex flex-wrap gap-2">
          <a
            href={aviso.url_publica}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-xs font-medium dark:border-zinc-800"
          >
            <ExternalLink className="h-3.5 w-3.5" /> ver el aviso
          </a>
          <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-xs" onClick={() => onDescartar(aviso)}>
            <X className="h-3.5 w-3.5" /> descartar
          </Button>
          {/* ETAPA 3: acá va «crear tarjeta de relevamiento», que manda esta dirección al tablero. */}
        </div>
      </div>
    </div>
  )
}

export function AvisosEnZona({ zonas }: { zonas: ZonaFarming[] }) {
  const [zonaId, setZonaId] = useState(zonas[0]?.id ?? "")
  const [senal, setSenal] = useState<Senal | null>(null)
  const [datos, setDatos] = useState<RespuestaAvisos | null>(null)
  const [avisos, setAvisos] = useState<AvisoEnZona[]>([])
  const [pagina, setPagina] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [ultimoDescarte, setUltimoDescarte] = useState<AvisoEnZona | null>(null)

  const traer = useCallback(async (p: number, reemplazar: boolean) => {
    if (!zonaId) return
    setCargando(true)
    try {
      const qs = new URLSearchParams({ zona_id: zonaId, pagina: String(p) })
      if (senal) qs.set("senal", senal)
      const d: RespuestaAvisos = await pedir(`/api/farming/avisos?${qs}`)
      setDatos(d)
      setAvisos((prev) => (reemplazar ? d.avisos : [...prev, ...d.avisos]))
      setPagina(p)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setCargando(false)
    }
  }, [zonaId, senal])

  useEffect(() => { traer(0, true) }, [traer])

  const descartar = async (a: AvisoEnZona) => {
    setAvisos((prev) => prev.filter((x) => x.id !== a.id))
    setUltimoDescarte(a)
    try {
      await pedir("/api/farming/avisos/marca", {
        method: "POST",
        body: JSON.stringify({ zona_id: zonaId, aviso_id: a.id, es_dueno_directo: a.es_dueno_directo }),
      })
    } catch (e: any) {
      // Si no se pudo guardar, el aviso vuelve a la lista: nada desaparece en silencio.
      setAvisos((prev) => [a, ...prev])
      setUltimoDescarte(null)
      toast.error(e.message)
    }
  }

  const deshacer = async () => {
    if (!ultimoDescarte) return
    const a = ultimoDescarte
    setUltimoDescarte(null)
    try {
      await pedir(`/api/farming/avisos/marca?zona_id=${zonaId}&aviso_id=${a.id}`, { method: "DELETE" })
      setAvisos((prev) => [a, ...prev])
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  if (zonas.length === 0) {
    return <p className="text-sm text-muted-foreground">Dibujá una zona en «Mis zonas» y acá vas a ver lo que está a la venta adentro.</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {zonas.length > 1 && (
          <Select value={zonaId} onValueChange={(v) => { setZonaId(v); setSenal(null) }}>
            <SelectTrigger className="h-10 w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {zonas.map((z) => <SelectItem key={z.id} value={z.id}>{z.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <p className="text-sm text-muted-foreground">
          {datos ? `${datos.conteos.total} ${datos.conteos.total === 1 ? "propiedad publicada" : "propiedades publicadas"} en «${datos.zona.nombre}»` : "Buscando…"}
        </p>
      </div>

      {/* Los atajos: solo los que tienen avisos. La línea de abajo explica para qué sirve cada uno. */}
      {datos && datos.atajos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Button variant={senal === null ? "default" : "outline"} size="sm" className="h-9" onClick={() => setSenal(null)}>
            Todas ({datos.conteos.total})
          </Button>
          {datos.atajos.map((clave) => {
            const s = SENALES.find((x) => x.clave === clave)!
            return (
              <Button
                key={clave}
                variant={senal === clave ? "default" : "outline"}
                size="sm"
                className="h-9"
                onClick={() => setSenal(senal === clave ? null : clave)}
                title={s.porque}
              >
                {s.etiqueta} ({datos.conteos[clave]})
              </Button>
            )
          })}
        </div>
      )}

      {senal && (
        <p className="text-xs text-muted-foreground">{SENALES.find((x) => x.clave === senal)?.porque}.</p>
      )}

      {ultimoDescarte && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-xs">
          <span>Descartaste «{ultimoDescarte.titulo}». No vuelve a aparecer en esta zona.</span>
          <Button variant="ghost" size="sm" className="h-9 gap-1.5" onClick={deshacer}>
            <Undo2 className="h-3.5 w-3.5" /> deshacer
          </Button>
        </div>
      )}

      {cargando && avisos.length === 0 && (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      )}

      {!cargando && avisos.length === 0 && (
        <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-muted-foreground dark:border-zinc-700">
          {senal ? "Ningún aviso de tu zona cumple ese filtro." : "No hay propiedades publicadas dentro de esta zona."}
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {avisos.map((a) => <Tarjeta key={a.id} aviso={a} onDescartar={descartar} />)}
      </div>

      {datos?.hay_mas && (
        <Button variant="outline" className="h-10 w-full" disabled={cargando} onClick={() => traer(pagina + 1, false)}>
          {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ver más"}
        </Button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Las dos solapas en la página**

En `components/farming/farming-page.tsx`:

1. Cambiar el comentario de cabecera (líneas 3-4) por:
```tsx
// La página Farming del asesor: «Mis zonas» (el territorio) y «A la venta en mi zona» (lo que
// se publica adentro). La solapa «Relevamiento» llega en la etapa 3: acá no se dibujan solapas
// vacías.
```
2. Sumar a los imports:
```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AvisosEnZona } from "./avisos-en-zona"
```
3. Reemplazar el bloque `{modo ? (...) : (<ListaZonas ... />)}` por:
```tsx
      {modo ? (
        // Key con el modo: MapaFarming arranca lapizActivo a partir de modo.tipo solo al
        // montarse, así que cambiar de "ver" a "redibujar" (u otro modo) sin desmontar dejaría
        // el lápiz en el estado del modo anterior.
        <MapaFarming
          key={`${modo.tipo}-${"zonaId" in modo ? modo.zonaId : ""}`}
          modo={modo}
          ajenas={contornosParaDibujar(datos, "zonaId" in modo ? modo.zonaId : undefined)}
          titulo={modo.tipo === "ver" ? tituloVer : undefined}
          onGuardar={guardar}
          onCerrar={() => setModo(null)}
        />
      ) : (
        <Tabs defaultValue="zonas" className="flex flex-col">
          <TabsList className="mb-4 self-start rounded-xl border border-accent/10 bg-muted/50 p-1">
            <TabsTrigger value="zonas" className="h-9 rounded-lg px-4 text-sm data-[state=active]:bg-card data-[state=active]:text-accent">
              Mis zonas
            </TabsTrigger>
            <TabsTrigger value="avisos" className="h-9 rounded-lg px-4 text-sm data-[state=active]:bg-card data-[state=active]:text-accent">
              A la venta en mi zona
            </TabsTrigger>
          </TabsList>

          <TabsContent value="zonas" className="mt-0 data-[state=inactive]:hidden">
            <ListaZonas
              mias={datos.mias}
              compartidasConmigo={datos.compartidas_conmigo}
              topes={datos.topes}
              miId={datos.mi_id}
              onNueva={() => setModo({ tipo: "nueva" })}
              onVer={(z) => {
                const esMia = datos.mias.some((m) => m.id === z.id)
                setTituloVer(esMia ? `«${z.nombre}»` : `«${z.nombre}» · zona de ${z.owner_nombre}`)
                setModo({ tipo: "ver", actual: z.geojson })
              }}
              onRedibujar={(z) => setModo({ tipo: "redibujar", zonaId: z.id, actual: z.geojson })}
              onSumar={(z) => setModo({ tipo: "sumar", zonaId: z.id, actual: z.geojson })}
              onCompartir={(z) => setCompartiendo(z)}
              onBorrar={borrar}
            />
          </TabsContent>

          <TabsContent value="avisos" className="mt-0 data-[state=inactive]:hidden">
            {/* Las compartidas conmigo también cuentan: la zona se trabaja entre los dos. */}
            <AvisosEnZona zonas={[...datos.mias, ...datos.compartidas_conmigo]} />
          </TabsContent>
        </Tabs>
      )}
```

- [ ] **Step 3: Verificar que compila y no rompe nada**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "components/farming|lib/farming|app/api/farming"` → sin líneas.
Run: `npm run lint 2>&1 | grep -E "components/farming|lib/farming|app/api/farming"` → sin líneas.
Run: `npm test` → todo verde.

- [ ] **Step 4: Commit**

```bash
git add components/farming/avisos-en-zona.tsx components/farming/farming-page.tsx
git commit -m "feat(farming): la solapa «A la venta en mi zona» con los atajos que tienen datos"
```

---

### Task 6: Aplicar, probar en el navegador y documentar

**Files:**
- Modify: `docs/superpowers/specs/2026-09-11-farming-zonas-design.md`
- Modify: `docs/compartible/estandarizada/FUNCIONAL-ASESOR-PRISMA.md`
- Modify: `docs/interno/bitacora-sesiones.md`

**Este es el turno del controlador**, no de un implementador: aplica la migración con el OK de Leonardo y verifica en el navegador.

- [ ] **Step 1: Pedir el OK y aplicar la migración**

Decir en criollo: **qué NO se toca** (mercado_avisos, las dos tablas de la etapa 1 que ya usa Central), **qué se crea** (una tabla vacía de marcas y dos funciones de lectura), **qué pasa si sale mal** (el rollback borra las tres cosas; la tabla nace vacía), **cómo se aplica** (Management API, en una transacción). Después:

```bash
node scratch/aplicar-sql.mjs supabase/migrations/20260916120000_farming_avisos.sql
node scripts/sql-produccion.mjs "select table_name from information_schema.tables where table_schema='public' and table_name='farming_avisos_marca'"
node scripts/sql-produccion.mjs "select proname from pg_proc where proname like 'farming_avisos%' order by 1"
```

- [ ] **Step 2: Medir la función ya creada, contra la zona real**

```bash
node scripts/sql-produccion.mjs "explain (analyze, buffers) select * from farming_avisos_en_zona((select geojson::text from farming_zonas where nombre='Matias Luciano Di Leo'), null, '{}', 61, 0)"
```
Expected: `Index Scan` sobre `mercado_avisos_*_geom_idx` y un `Execution Time` del orden de los 25 ms medidos el 16-sep. Si aparece `Seq Scan`, **no está terminado**: revisar que el recorte se escriba como `ST_Intersects(m.geom, …::geography)`.

- [ ] **Step 3: Probar en el navegador (escritorio y celular, los dos temas)**

Con `prueba-farming-a@vakdor.com` (credenciales en `scratch/farming-prueba-credenciales.json`), **nunca con la cuenta de un asesor real**:
1. Dibujar una zona en **CABA** (la red solo tiene CABA y Don Torcuato cargados).
2. Solapa «A la venta en mi zona»: aparece el total, y **solo** los atajos «Dueño directo» y «Lleva +120 días» (los otros dos dan cero hoy).
3. Tocar un atajo filtra; tocarlo de nuevo vuelve a todas.
4. «descartar» saca el aviso al instante y ofrece **deshacer**; recargar la página y comprobar que el descartado no volvió y que el total bajó en uno.
5. «Ver más» trae la página siguiente sin repetir avisos.
6. Con una segunda zona, el desplegable cambia de zona y la lista cambia.
7. En el celular (390×844): las tarjetas se leen, los botones miden ≥ 44 px de alto, y nada queda tapado por el globito del chat (abajo a la derecha).
8. Consola sin errores de la app.

- [ ] **Step 4: Documentar**

- **Spec:** en «Solapa 3 · A la venta en mi zona», agregar la decisión del 16-sep (un atajo se dibuja solo si tiene datos) y los números medidos ese día.
- **Guía del asesor (§25):** una sección corta, sin tecnicismos: qué es la solapa, qué significa cada atajo, qué hace «descartar» y que lo descartado no vuelve.
- **Bitácora:** entrada del día con qué se construyó, la medición de la función, lo que salió del navegador y **el estado del pipeline de mercado** (descubrimiento caído desde el 9-sep por el tope de Apify; los avisos están congelados al 13-sep).

- [ ] **Step 5: Commit y pedir el OK para mergear**

```bash
git add docs/superpowers/specs/2026-09-11-farming-zonas-design.md docs/compartible/estandarizada/FUNCIONAL-ASESOR-PRISMA.md docs/interno/bitacora-sesiones.md
git commit -m "docs(farming): etapa 2 — spec, guia del asesor y bitacora"
```

---

## Lo que esta etapa deja listo para la 3

- `farming_avisos_marca` ya tiene la columna `direccion_id` y el estado `convertido`: cuando exista `farming_direcciones`, «crear tarjeta de relevamiento» escribe ahí. El lugar exacto está marcado con `// ETAPA 3:` en `avisos-en-zona.tsx`.
- `zonaAccesible` en `lib/farming/servidor.ts` es el mismo control que van a necesitar los endpoints del tablero.
