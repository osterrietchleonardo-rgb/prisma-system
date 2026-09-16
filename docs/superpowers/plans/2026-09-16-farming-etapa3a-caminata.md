# Farming · Etapa 3-A — La caminata: direcciones y propietarios

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el asesor, parado en la vereda con el teléfono en la mano, pueda cargar la dirección que acaba de caminar —aunque no esté publicada en ningún portal— con sus propietarios, y que eso quede en su zona sin que nadie más de la agencia lo vea.

**Architecture:** Tres tablas nuevas (`farming_direcciones`, `farming_propietarios`, `farming_contactos`) colgadas de `farming_zonas`, con la misma compuerta de acceso que ya usa la etapa 2 (`zonaAccesible`). Un módulo puro para las reglas que no dependen de la base (unidades totales, normalización de la dirección, validación), endpoints con `createAdminClient` y validación explícita, y una solapa «Relevamiento» que por ahora es un formulario y una lista agrupada por etapa. **El tablero de 6 columnas, el historial que se llena solo y los 9 indicadores son el plan 3-B**, que se apoya entero en esto.

**Tech Stack:** Next.js 14 (App Router), React 18, Supabase (Postgres + PostGIS + RLS), vitest, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-09-11-farming-zonas-design.md` — secciones «La carga a pie», «El modelo de datos: 6 tablas nuevas» y «Las 6 columnas».

## Por qué este plan se corta acá

El spec describe la etapa 3 entera: los datos, el tablero, el historial, los indicadores y el enganche con Tracking. Es demasiado para un solo plan, y las dos mitades se entregan por separado sin quedar a medias:

- **3-A (este):** los datos y la caminata. Al terminar, el asesor **ya puede trabajar**: carga lo que camina, guarda propietarios y teléfonos, y convierte un aviso en tarjeta. La lista está agrupada por etapa, que es exactamente el dato que el tablero va a dibujar después.
- **3-B (el siguiente):** el tablero con `@dnd-kit`, el diálogo obligatorio al mover una tarjeta, `farming_contactos` llenándose solo, la regla de `fuera_de_zona` al editar el trazo, archivar una zona con tarjetas, los 9 indicadores y el botón «→ pasarlo a mi pipeline».

`farming_contactos` se crea **acá** aunque recién se llene en 3-B: las tres tablas van en una sola migración, con un solo ataque de RLS que las cubre. Partir una migración en dos para que la segunda mitad quede huérfana un mes es peor.

## Global Constraints

- **No se toca nada de lo que ya está en producción:** ni `farming_zonas`, ni `farming_zonas_compartidas`, ni `farming_avisos_marca` (salvo escribir `estado='convertido'` y `direccion_id`, que son columnas que esa tabla ya tiene y que nadie llena todavía), ni `mercado_avisos`.
- **`createAdminClient` se saltea la RLS.** El acceso a la zona se valida SIEMPRE con `zonaAccesible` (dueño o compartido, misma agencia, zona activa) antes de leer o escribir cualquier tarjeta. Es la misma compuerta de la etapa 2, no se escribe una segunda.
- **La app escribe con `service_role`:** la migración revoca `insert/update/delete` a `authenticated` y `anon` sobre las tres tablas.
- **Un arreglo de seguridad no está hecho hasta que el ataque falla:** `scripts/farming-rls-ataque.mjs` se extiende y se corre contra producción después de aplicar.
- **Lo único obligatorio para guardar una dirección es la calle y el tipo** (spec). Todo lo demás se completa después. El asesor está en la vereda, no llenando una planilla.
- **`unidades_totales` no se carga a mano**: sale de `pisos × unidades_por_piso`, o de `unidades_manual` cuando no hay pisos.
- **El encargado se guarda por su nombre**, no como un sí/no.
- **Los propietarios son filas propias**, nunca una columna de texto.
- **Nada de globitos:** lo que el asesor necesita leer va como línea visible. En el celular no se abren.
- **44 px de alto mínimo** en todo lo que se toca. Se mide en el navegador, con el celular emulado.
- Copy y comentarios en castellano rioplatense, mismo registro que el resto de `lib/farming/`.
- Nunca `git add -A`. Rama nueva desde `main` (`a0dbbd9` o posterior).
- **La migración se aplica con el OK de Leonardo**, con el rollback escrito antes. El clasificador del entorno bloquea el «Production Deploy» desde el agente: el comando lo corre él.

## Decisiones tomadas al escribir este plan

1. **La ubicación (lat/lng) sale del buscador que el mapa ya usa.** `components/mapa/mapa-buscador.tsx` geocodifica con MapTiler (`NEXT_PUBLIC_MAPTILER_KEY`) y devuelve `punto: { lat, lng }`. El formulario reusa ese buscador: el asesor escribe «Conde 900», elige la sugerencia y la tarjeta queda con coordenadas. **Si no elige ninguna, la dirección se guarda igual, sin coordenadas** — obligarlo a acertar una sugerencia sería la planilla que el spec quiere evitar. La verificación «cae dentro de la zona» solo corre cuando hay coordenadas, y **avisa, no bloquea**.
2. **`unidades_totales` se declara `integer`, no `smallint`** como dice la tabla del spec: `smallint × smallint` puede desbordar en Postgres y un edificio de 40 pisos × 900 unidades no tiene por qué tirar un error. El dato que se muestra es el mismo.
3. **Se revoca también `truncate`** sobre las tres tablas nuevas. No reemplaza la limpieza general del repo (todas las tablas del proyecto lo tienen abierto por el grant por default de Supabase, y no es alcanzable por PostgREST), pero estas tres guardan el trabajo del asesor y la línea cuesta nada.
4. **Al convertir un aviso en tarjeta, la marca pasa a `convertido`, no a `descartado`.** Y se escribe con `update`, no con el `upsert … ON CONFLICT DO NOTHING` del descarte: si el aviso ya estaba descartado, un upsert que ignora el conflicto **no haría nada en silencio**. Esto ya estaba anotado como trampa al cerrar la etapa 2.

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/20260917120000_farming_direcciones.sql` | Las 3 tablas, la función inmutable, el índice único, RLS y los revoke. |
| `supabase/rollback/20260917_farming_direcciones_rollback.sql` | Cómo volver atrás. |
| `lib/farming/direcciones.ts` | **Puro.** Tipos, las listas cerradas (tipo, etapa, cartel, origen), `unidadesTotales`, `normalizarDireccion`, `validarDireccion`. |
| `lib/farming/direcciones.test.ts` | Sus tests. |
| `lib/farming/servidor.ts` | **Modificar:** `direccionAccesible` (la tarjeta y su zona en un solo paso). |
| `app/api/farming/direcciones/route.ts` | GET (lista de la zona) y POST (alta, a pie o desde un aviso). |
| `app/api/farming/direcciones/[id]/route.ts` | PATCH y DELETE. |
| `app/api/farming/direcciones/[id]/propietarios/route.ts` | POST. |
| `app/api/farming/direcciones/[id]/propietarios/[pid]/route.ts` | PATCH y DELETE. |
| `components/farming/relevamiento.tsx` | La solapa: lista agrupada por etapa + el botón «+ agregar dirección». |
| `components/farming/direccion-dialog.tsx` | El formulario de alta y edición, con el buscador de direcciones. |
| `components/farming/propietarios.tsx` | Las personas de una dirección. |
| `components/farming/avisos-en-zona.tsx` | **Modificar:** el botón «crear tarjeta de relevamiento» que quedó marcado `// ETAPA 3:`. |
| `components/farming/farming-page.tsx` | **Modificar:** la tercera solapa. |
| `scripts/farming-rls-ataque.mjs` | **Modificar:** los ataques sobre las tres tablas nuevas. |
| Guía del asesor §25 · bitácora · spec | Docs. |

---

### Task 1: La migración — tres tablas, la función inmutable y los candados

**Files:**
- Create: `supabase/migrations/20260917120000_farming_direcciones.sql`
- Create: `supabase/rollback/20260917_farming_direcciones_rollback.sql`

**Interfaces:**
- Produces: tablas `public.farming_direcciones`, `public.farming_propietarios`, `public.farming_contactos`; función `public.farming_direccion_normalizada(text, text)`. Las tareas 3 a 6 dependen de estos nombres y de los valores exactos de cada `check`.

**Alcance de este dispatch:** escribir y commitear los dos archivos. **NO aplicar nada a ninguna base de datos.** No importar `scripts/sql-produccion.mjs` (ejecuta `process.argv[2]` como SQL al cargarse). La aplica el controlador con el OK del dueño del producto.

- [ ] **Step 1: El rollback primero**

```sql
-- supabase/rollback/20260917_farming_direcciones_rollback.sql
-- Deshace 20260917120000_farming_direcciones.sql.
--
-- OJO: esto borra el trabajo de campo del asesor (direcciones, propietarios y contactos).
-- Solo se corre si la migración recién se aplicó y todavía no cargó nadie.
begin;
drop table if exists public.farming_contactos;
drop table if exists public.farming_propietarios;
drop table if exists public.farming_direcciones;
-- Las funciones van DESPUÉS de las tablas: mientras exista una política o un índice que las
-- use, el drop falla.
drop function if exists public.farming_puede_ver_zona(uuid, uuid);
drop function if exists public.farming_direccion_normalizada(text, text);
commit;
```

- [ ] **Step 2: La migración**

```sql
-- supabase/migrations/20260917120000_farming_direcciones.sql
--
-- Farming · etapa 3-A: las tarjetas de la caminata.
-- Spec: docs/superpowers/specs/2026-09-11-farming-zonas-design.md
--
-- QUÉ NO SE TOCA: farming_zonas, farming_zonas_compartidas y farming_avisos_marca (etapa 1 y 2,
-- en producción y en uso por un asesor real), ni mercado_avisos.
--
-- Aplicar por Management API con el OK de Leonardo.
-- Rollback: supabase/rollback/20260917_farming_direcciones_rollback.sql
-- Después de aplicar: volver a correr scripts/farming-rls-ataque.mjs. No está hecho hasta que
-- el ataque falla.

begin;

-- ── La dirección comparable ──
-- Para que dos asesores que comparten zona no carguen «Av. Ejemplo 1200» y «av ejemplo 1200».
--
-- POR QUÉ UNA FUNCIÓN Y NO UNA COLUMNA GENERADA: unaccent() depende de un diccionario que se
-- puede cambiar, así que Postgres no la considera inmutable y no la deja entrar en un índice.
-- Pasándole el diccionario explícito el resultado deja de depender de la configuración. Es el
-- mismo envoltorio que ya usa barrio_normalizado() en 20260811100000_mapa_indice_barrio.sql
-- —esa NO se toca ni se reusa: su nombre dice barrio—.
create or replace function public.farming_direccion_normalizada(p_calle text, p_altura text)
returns text
language sql
immutable
parallel safe
as $$
  -- El diccionario va calificado con el esquema: sin eso la función falla recién al
  -- ejecutarse, no al crearse.
  select regexp_replace(
           lower(public.unaccent('public.unaccent'::regdictionary,
             btrim(coalesce(p_calle, '')) || ' ' || btrim(coalesce(p_altura, '')))),
           '\s+', ' ', 'g')
$$;

comment on function public.farming_direccion_normalizada(text, text) is
  'Direccion comparable: minusculas, sin acentos, sin espacios de mas. Inmutable para poder indexarla. La consulta que busca duplicados tiene que escribir la expresion EXACTAMENTE igual que el indice, o Postgres no lo reconoce.';

-- ── Las tarjetas (hoja 1 del Excel) ──
create table if not exists public.farming_direcciones (
  id                 uuid primary key default gen_random_uuid(),
  zona_id            uuid not null references public.farming_zonas(id) on delete cascade,
  agency_id          uuid not null,            -- denormalizado para la RLS
  tramo              text,                     -- la «cuadra / tramo» de la hoja 1
  calle              text not null,
  altura             text,                     -- texto y no número: existe el «s/n»
  tipo               text not null check (tipo in ('edificio','casa','ph','local','oficina','lote','otro')),
  pisos              smallint check (pisos is null or pisos between 1 and 200),
  unidades_por_piso  smallint check (unidades_por_piso is null or unidades_por_piso between 1 and 200),
  unidades_manual    smallint check (unidades_manual is null or unidades_manual between 1 and 5000),
  -- Regla de las slides: no se carga a mano. Integer y no smallint: smallint × smallint puede
  -- desbordar, y un edificio grande no tiene por qué tirar un error.
  unidades_totales   integer generated always as (
                       case when pisos is not null and unidades_por_piso is not null
                            then pisos::int * unidades_por_piso::int
                            else unidades_manual::int end
                     ) stored,
  encargado_nombre   text,                     -- el NOMBRE, no un sí/no
  encargado_turno    text,
  encargado_notas    text,
  lat                double precision,
  lng                double precision,
  etapa              text not null default 'relevado'
                       check (etapa in ('relevado','presentado','en_secuencia','respondio','tasacion','captada','descartada')),
  orden              integer not null default 0,
  proxima_accion     text,
  proxima_accion_en  date,
  relevada_en        date,
  a_la_venta         boolean not null default false,   -- aunque NO esté publicada
  cartel             text check (cartel is null or cartel in ('dueno','inmobiliaria','sin_cartel')),
  inmobiliaria_cartel text,
  precio_pedido      numeric(14,2),
  moneda             text check (moneda is null or moneda in ('USD','ARS')),
  -- Las DOS: la PK de mercado_avisos es compuesta por la partición. Sin FK dura a propósito.
  aviso_id                bigint,
  aviso_es_dueno_directo  boolean,
  origen             text not null check (origen in ('caminata','aviso')),
  fuera_de_zona      boolean not null default false,
  fuera_de_zona_desde timestamptz,
  observaciones      text,
  creada_por         uuid not null references auth.users(id) on delete cascade,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.farming_direcciones is
  'Las tarjetas del tablero de farming: una por puerta caminada. La mayoria NO esta publicada en ningun portal — mercado_avisos es una ayuda, no la fuente.';

create index if not exists farming_direcciones_tablero_idx on public.farming_direcciones (zona_id, etapa, orden);
create index if not exists farming_direcciones_agencia_idx on public.farming_direcciones (agency_id);

-- Una sola vez la misma puerta por zona. La expresión tiene que escribirse igual en la consulta.
create unique index if not exists farming_direcciones_sin_repetir_idx
  on public.farming_direcciones (zona_id, public.farming_direccion_normalizada(calle, altura));

-- ── Las personas de cada dirección ──
create table if not exists public.farming_propietarios (
  id              uuid primary key default gen_random_uuid(),
  direccion_id    uuid not null references public.farming_direcciones(id) on delete cascade,
  agency_id       uuid not null,
  piso            text,                        -- «3», «PB», «3° B»
  unidad          text,
  nombre          text not null,
  vinculo         text not null default 'propietario'
                    check (vinculo in ('propietario','inquilino','encargado','familiar','otro')),
  telefono        text,                        -- normalizado con normalizePhoneE164 antes de llegar
  email           text,
  notas           text,
  tracking_log_id uuid,                        -- ETAPA 3-B: si ya se pasó al pipeline de Tracking
  creado_por      uuid not null references auth.users(id) on delete cascade,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists farming_propietarios_direccion_idx on public.farming_propietarios (direccion_id);

-- ── El historial firmado (hoja 2 del Excel) ──
-- Se crea acá, con sus hermanas y su ataque, pero recién se llena en la etapa 3-B: cada
-- movimiento de tarjeta escribe una fila, sin que el asesor cargue ninguna planilla.
create table if not exists public.farming_contactos (
  id                uuid primary key default gen_random_uuid(),
  direccion_id      uuid not null references public.farming_direcciones(id) on delete cascade,
  propietario_id    uuid references public.farming_propietarios(id) on delete set null,
  agency_id         uuid not null,
  user_id           uuid not null references auth.users(id) on delete cascade,
  fecha             date not null default current_date,
  tipo              text not null check (tipo in (
                      'carta_1','carta_2','carta_3','carta_4','carta_5','carta_6','carta_7',
                      'carta_otra','visita_encargado','llamada','whatsapp','email','tasacion',
                      'entrevista','otro')),
  cartas_entregadas smallint,
  etapa_desde       text,
  etapa_hasta       text,
  nota              text,
  created_at        timestamptz not null default now()
);

create index if not exists farming_contactos_direccion_idx on public.farming_contactos (direccion_id, fecha desc);

-- ── Quién ve qué ──
alter table public.farming_direcciones  enable row level security;
alter table public.farming_propietarios enable row level security;
alter table public.farming_contactos    enable row level security;

-- La regla de quién ve qué vive en UNA sola función, que las tres políticas usan.
--
-- POR QUÉ UNA FUNCIÓN Y NO «que la política de propietarios consulte a la de direcciones»: esa
-- versión se apoyaría en cómo Postgres evalúa la RLS de una tabla consultada adentro de otra
-- política. Si esa suposición fuera falsa, `exists (select 1 from farming_direcciones where
-- id = ...)` daría verdadero para CUALQUIER dirección existente y los propietarios de todas las
-- agencias quedarían legibles. Una regla de acceso no se escribe apoyada en un supuesto: la
-- condición se escribe completa, una vez, acá.
create or replace function public.farming_puede_ver_zona(p_zona uuid, p_agency uuid)
returns boolean
language sql
stable
security invoker
as $$
  select exists (
    select 1 from public.farming_zonas z
    where z.id = p_zona
      and (z.owner_user_id = auth.uid()
           or exists (select 1 from public.farming_zonas_compartidas c
                      where c.zona_id = z.id and c.user_id = auth.uid()))
  )
  -- El director de la agencia mira, no edita (la escritura está revocada más abajo para todos).
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.agency_id = p_agency and p.role = 'director'
  )
$$;

comment on function public.farming_puede_ver_zona(uuid, uuid) is
  'Quien puede ver el trabajo de una zona de farming: su dueno, con quien la comparte, y el director de la agencia. Una sola definicion para las tres tablas.';

drop policy if exists farming_direcciones_de_mi_zona on public.farming_direcciones;
create policy farming_direcciones_de_mi_zona on public.farming_direcciones
  for select to authenticated
  using (public.farming_puede_ver_zona(zona_id, agency_id));

drop policy if exists farming_propietarios_de_mi_zona on public.farming_propietarios;
create policy farming_propietarios_de_mi_zona on public.farming_propietarios
  for select to authenticated
  using (exists (
    select 1 from public.farming_direcciones d
    where d.id = farming_propietarios.direccion_id
      and public.farming_puede_ver_zona(d.zona_id, d.agency_id)
  ));

drop policy if exists farming_contactos_de_mi_zona on public.farming_contactos;
create policy farming_contactos_de_mi_zona on public.farming_contactos
  for select to authenticated
  using (exists (
    select 1 from public.farming_direcciones d
    where d.id = farming_contactos.direccion_id
      and public.farming_puede_ver_zona(d.zona_id, d.agency_id)
  ));

-- La app escribe SIEMPRE con service_role. Sin esto, cualquier usuario logueado podría escribir
-- por PostgREST: es el mismo agujero que cerró 20260912130000 en farming_zonas.
revoke insert, update, delete, truncate on public.farming_direcciones  from authenticated, anon;
revoke insert, update, delete, truncate on public.farming_propietarios from authenticated, anon;
revoke insert, update, delete, truncate on public.farming_contactos    from authenticated, anon;

commit;
```

- [ ] **Step 3: Commit (sin aplicar)**

```bash
git add supabase/migrations/20260917120000_farming_direcciones.sql supabase/rollback/20260917_farming_direcciones_rollback.sql
git commit -m "feat(farming): migracion de la etapa 3-A — direcciones, propietarios y contactos

Todavia NO aplicada en produccion: se aplica con OK de Leonardo."
```

---

### Task 2: Las reglas que no dependen de la base

**Files:**
- Create: `lib/farming/direcciones.ts`
- Test: `lib/farming/direcciones.test.ts`

**Interfaces:**
- Produces:
  - `type TipoDireccion = "edificio" | "casa" | "ph" | "local" | "oficina" | "lote" | "otro"`
  - `type EtapaDireccion = "relevado" | "presentado" | "en_secuencia" | "respondio" | "tasacion" | "captada" | "descartada"`
  - `type Vinculo = "propietario" | "inquilino" | "encargado" | "familiar" | "otro"`
  - `const TIPOS: { clave: TipoDireccion; etiqueta: string }[]`, `const ETAPAS: { clave: EtapaDireccion; etiqueta: string }[]`, `const VINCULOS: { clave: Vinculo; etiqueta: string }[]`
  - `interface EntradaDireccion { calle: string; altura?: string | null; tipo: TipoDireccion; tramo?: string | null; pisos?: number | null; unidades_por_piso?: number | null; unidades_manual?: number | null; encargado_nombre?: string | null; encargado_turno?: string | null; encargado_notas?: string | null; lat?: number | null; lng?: number | null; a_la_venta?: boolean; cartel?: "dueno" | "inmobiliaria" | "sin_cartel" | null; inmobiliaria_cartel?: string | null; precio_pedido?: number | null; moneda?: "USD" | "ARS" | null; observaciones?: string | null; relevada_en?: string | null }`
  - `unidadesTotales(e: Pick<EntradaDireccion, "pisos" | "unidades_por_piso" | "unidades_manual">): number | null`
  - `normalizarDireccion(calle: string, altura?: string | null): string`
  - `validarDireccion(e: Partial<EntradaDireccion>): string[]` — lista de errores en criollo, vacía si está bien
  - `etiquetaDe(etapa: EtapaDireccion): string`

- [ ] **Step 1: Escribir el test, que va a fallar porque el módulo no existe**

```ts
// lib/farming/direcciones.test.ts
import { describe, it, expect } from "vitest"
import { unidadesTotales, normalizarDireccion, validarDireccion, TIPOS, ETAPAS } from "./direcciones"

/**
 * Las reglas de la tarjeta de la caminata. Lo que sostiene este archivo:
 *  1. Las unidades NO se cargan a mano: salen de pisos × unidades por piso, o del número suelto
 *     cuando no hay pisos (una casa es 1).
 *  2. La dirección comparable tiene que dar IGUAL para «Av. Ejemplo 1200» y «av  ejemplo 1200»,
 *     o dos asesores que comparten zona cargan la misma puerta dos veces.
 *  3. Lo único obligatorio es la calle y el tipo. El asesor está en la vereda, no en la oficina.
 *  4. Las seis columnas del tablero, más «descartada», en el orden del spec.
 */

describe("unidadesTotales", () => {
  it("un edificio: pisos por unidades por piso", () => {
    expect(unidadesTotales({ pisos: 8, unidades_por_piso: 4, unidades_manual: null })).toBe(32)
  })

  it("sin pisos, vale el número suelto (una casa es 1)", () => {
    expect(unidadesTotales({ pisos: null, unidades_por_piso: null, unidades_manual: 1 })).toBe(1)
  })

  it("los pisos le ganan al número suelto: la regla es que no se carga a mano", () => {
    expect(unidadesTotales({ pisos: 3, unidades_por_piso: 2, unidades_manual: 99 })).toBe(6)
  })

  it("sin nada, no inventa un número", () => {
    expect(unidadesTotales({ pisos: null, unidades_por_piso: null, unidades_manual: null })).toBeNull()
    expect(unidadesTotales({ pisos: 8, unidades_por_piso: null, unidades_manual: null })).toBeNull()
  })
})

describe("normalizarDireccion", () => {
  it("la misma puerta escrita de dos maneras da lo mismo", () => {
    expect(normalizarDireccion("Av. Ejemplo", "1200")).toBe(normalizarDireccion("av. ejemplo", " 1200 "))
  })

  it("los acentos no cuentan", () => {
    expect(normalizarDireccion("Güemes", "450")).toBe(normalizarDireccion("Guemes", "450"))
  })

  it("los espacios de más tampoco", () => {
    expect(normalizarDireccion("Av   Ejemplo", "1200")).toBe("av ejemplo 1200")
  })

  it("sin altura (el «s/n») no rompe", () => {
    expect(normalizarDireccion("Camino Real", null)).toBe("camino real")
  })
})

describe("validarDireccion", () => {
  it("con calle y tipo alcanza", () => {
    expect(validarDireccion({ calle: "Conde", tipo: "edificio" })).toEqual([])
  })

  it("sin calle no se guarda, y lo dice en criollo", () => {
    const e = validarDireccion({ tipo: "casa" })
    expect(e).toHaveLength(1)
    expect(e[0]).toMatch(/calle/i)
  })

  it("un tipo que no existe se rechaza", () => {
    expect(validarDireccion({ calle: "Conde", tipo: "castillo" as any })).toHaveLength(1)
  })

  it("pisos sin unidades por piso avisa, porque el total quedaría en blanco", () => {
    const e = validarDireccion({ calle: "Conde", tipo: "edificio", pisos: 8 })
    expect(e.some((x) => /unidades/i.test(x))).toBe(true)
  })

  it("un precio sin moneda no se guarda", () => {
    const e = validarDireccion({ calle: "Conde", tipo: "casa", precio_pedido: 180000 })
    expect(e.some((x) => /moneda/i.test(x))).toBe(true)
  })

  it("junta todos los problemas, no corta en el primero", () => {
    expect(validarDireccion({ pisos: 8, precio_pedido: 1 }).length).toBeGreaterThan(2)
  })
})

describe("las listas cerradas", () => {
  it("las seis columnas más descartada, en el orden del spec", () => {
    expect(ETAPAS.map((e) => e.clave)).toEqual([
      "relevado", "presentado", "en_secuencia", "respondio", "tasacion", "captada", "descartada",
    ])
  })

  it("los tipos de propiedad son los del spec", () => {
    expect(TIPOS.map((t) => t.clave)).toEqual(["edificio", "casa", "ph", "local", "oficina", "lote", "otro"])
  })
})
```

- [ ] **Step 2: Correrlo y verlo fallar**

Run: `npx vitest run lib/farming/direcciones.test.ts`
Expected: FAIL — `Cannot find module './direcciones'`.

- [ ] **Step 3: Escribir la implementación**

```ts
// lib/farming/direcciones.ts
//
// Farming · las reglas de la tarjeta de la caminata, sin base de datos en el medio.
//
// La mayoría de lo que el asesor releva NO está publicado en ningún portal: `mercado_avisos` es
// una ayuda, no la fuente. Por eso la tarjeta se crea desde cero y lo único que se le exige es
// la calle y el tipo — está parado en la vereda con el teléfono en la mano.

export type TipoDireccion = "edificio" | "casa" | "ph" | "local" | "oficina" | "lote" | "otro"
export type EtapaDireccion =
  | "relevado" | "presentado" | "en_secuencia" | "respondio" | "tasacion" | "captada" | "descartada"
export type Vinculo = "propietario" | "inquilino" | "encargado" | "familiar" | "otro"

export const TIPOS: { clave: TipoDireccion; etiqueta: string }[] = [
  { clave: "edificio", etiqueta: "Edificio" },
  { clave: "casa", etiqueta: "Casa" },
  { clave: "ph", etiqueta: "PH" },
  { clave: "local", etiqueta: "Local" },
  { clave: "oficina", etiqueta: "Oficina" },
  { clave: "lote", etiqueta: "Lote" },
  { clave: "otro", etiqueta: "Otro" },
]

/** Las seis columnas del tablero, más «descartada» al costado. El orden es el del spec. */
export const ETAPAS: { clave: EtapaDireccion; etiqueta: string }[] = [
  { clave: "relevado", etiqueta: "Relevado" },
  { clave: "presentado", etiqueta: "Presentado" },
  { clave: "en_secuencia", etiqueta: "En secuencia" },
  { clave: "respondio", etiqueta: "Respondió" },
  { clave: "tasacion", etiqueta: "Tasación" },
  { clave: "captada", etiqueta: "Captada" },
  { clave: "descartada", etiqueta: "Descartada" },
]

export const VINCULOS: { clave: Vinculo; etiqueta: string }[] = [
  { clave: "propietario", etiqueta: "Propietario" },
  { clave: "inquilino", etiqueta: "Inquilino" },
  { clave: "encargado", etiqueta: "Encargado" },
  { clave: "familiar", etiqueta: "Familiar" },
  { clave: "otro", etiqueta: "Otro" },
]

export interface EntradaDireccion {
  calle: string
  altura?: string | null
  tipo: TipoDireccion
  tramo?: string | null
  pisos?: number | null
  unidades_por_piso?: number | null
  unidades_manual?: number | null
  encargado_nombre?: string | null
  encargado_turno?: string | null
  encargado_notas?: string | null
  lat?: number | null
  lng?: number | null
  a_la_venta?: boolean
  cartel?: "dueno" | "inmobiliaria" | "sin_cartel" | null
  inmobiliaria_cartel?: string | null
  precio_pedido?: number | null
  moneda?: "USD" | "ARS" | null
  observaciones?: string | null
  relevada_en?: string | null
}

export function etiquetaDe(etapa: EtapaDireccion): string {
  return ETAPAS.find((e) => e.clave === etapa)?.etiqueta ?? etapa
}

/** Regla de las slides: las unidades NO se cargan a mano. */
export function unidadesTotales(
  e: Pick<EntradaDireccion, "pisos" | "unidades_por_piso" | "unidades_manual">,
): number | null {
  if (e.pisos && e.unidades_por_piso) return e.pisos * e.unidades_por_piso
  return e.unidades_manual ?? null
}

/**
 * La dirección comparable. Tiene que dar lo mismo que `farming_direccion_normalizada` en la
 * base, que es la que sostiene el índice único: acá sirve para avisarle al asesor ANTES de
 * mandar el formulario, pero el candado de verdad es el de Postgres.
 */
export function normalizarDireccion(calle: string, altura?: string | null): string {
  return `${(calle || "").trim()} ${(altura || "").trim()}`
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

const CLAVES_TIPO = TIPOS.map((t) => t.clave) as string[]

/** Todos los problemas juntos, en criollo. Vacío = se puede guardar. */
export function validarDireccion(e: Partial<EntradaDireccion>): string[] {
  const errores: string[] = []

  if (!e.calle?.trim()) errores.push("Falta la calle.")
  if (!e.tipo || !CLAVES_TIPO.includes(e.tipo)) errores.push("Elegí qué tipo de propiedad es.")

  // Si carga pisos, hace falta el otro número: si no, el total queda en blanco y el indicador
  // de «unidades potenciales» miente.
  if (e.pisos && !e.unidades_por_piso) errores.push("Pusiste los pisos: falta cuántas unidades hay por piso.")
  if (e.unidades_por_piso && !e.pisos) errores.push("Pusiste las unidades por piso: faltan los pisos.")

  if (e.precio_pedido != null && !e.moneda) errores.push("Un precio sin moneda no dice nada: elegí USD o pesos.")
  if (e.cartel === "inmobiliaria" && !e.inmobiliaria_cartel?.trim()) {
    errores.push("Decinos de qué inmobiliaria es el cartel.")
  }

  return errores
}
```

- [ ] **Step 4: Correr y ver pasar**

Run: `npx vitest run lib/farming/direcciones.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/farming/direcciones.ts lib/farming/direcciones.test.ts
git commit -m "feat(farming): las reglas de la tarjeta de la caminata (unidades, direccion comparable, validacion)"
```

---

### Task 3: La compuerta de la tarjeta, y el endpoint que lista y da de alta

**Files:**
- Modify: `lib/farming/servidor.ts`
- Create: `app/api/farming/direcciones/route.ts`
- Test: `app/api/farming/direcciones/route.test.ts`

**Interfaces:**
- Consumes: `zonaAccesible(admin, zonaId, agencyId, userId)` → `{ zona, puede }` (ya existe, de la etapa 2); `requireTenant()` → `{ userId, agencyId, role }`; `responderError`; `validarDireccion`, `normalizarDireccion` de `@/lib/farming/direcciones`.
- Produces:
  - `servidor.ts`: `direccionAccesible(admin, direccionId, agencyId, userId): Promise<{ direccion: any | null; puede: boolean }>` — busca la tarjeta, después valida su zona con `zonaAccesible`. La usan las tareas 4 y 5.
  - `GET /api/farming/direcciones?zona_id=<uuid>` → 200 `{ zona: {id,nombre}, direcciones: FilaDireccion[] }` · 400 · 403 · 404
  - `POST /api/farming/direcciones` body `{ zona_id, ...EntradaDireccion, aviso_id?, aviso_es_dueno_directo? }` → 201 `{ direccion }` · 400 (validación) · 403 · 404 · **409 si esa puerta ya está cargada en la zona**

- [ ] **Step 1: Escribir los tests**

Casos que el archivo tiene que cubrir, con el mismo molde de mock que `app/api/farming/avisos/route.test.ts` (leerlo antes: `vi.mock` de `requireTenant` y de `createAdminClient`, `baseFalsa` como doble, ids con forma de uuid porque `zonaAccesible` los exige):

1. GET devuelve las direcciones de mi zona, ordenadas por `etapa` y `orden`.
2. GET de la zona de un colega que no comparte conmigo → 403; de otra agencia o liberada → 404; sin `zona_id` → 400.
3. POST guarda con el `agency_id` y el `creada_por` **de la sesión, nunca del body** — mandar un `agency_id` y un `creada_por` ajenos en el body y verificar que la fila guardada tiene los de la sesión.
4. POST sin calle → 400 con el texto de `validarDireccion`, y **no escribe nada**.
5. POST en la zona de un colega → 403 y no escribe.
6. POST con `origen: "caminata"` cuando no viene `aviso_id`, y `origen: "aviso"` cuando viene — lo decide el servidor, no el body.
7. POST de una puerta que ya existe en esa zona (misma calle y altura escritas distinto) → 409 con un mensaje que diga cuál es.
8. POST con `aviso_id` marca el aviso como `convertido` en `farming_avisos_marca` con el `direccion_id` nuevo, **con `update`** (ver Task 6; acá alcanza con afirmar el estado final de la tabla).

Cada test tiene que morir si se borra la línea de producción que vigila. Para el 3, borrar `agency_id: agencyId` y ver que falla.

- [ ] **Step 2: Correr y verlos fallar**

Run: `npx vitest run app/api/farming/direcciones/route.test.ts`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: El helper compartido**

En `lib/farming/servidor.ts`, al final:

```ts
/**
 * ¿Puede esta persona tocar esta tarjeta? Se resuelve por su zona: la tarjeta no tiene una
 * regla propia. Devuelve la tarjeta aunque no pueda, para distinguir 403 (es de la zona de un
 * colega) de 404 (no existe).
 */
export async function direccionAccesible(
  admin: SupabaseClient<any, any, any>,
  direccionId: string,
  agencyId: string,
  userId: string,
): Promise<{ direccion: any | null; puede: boolean }> {
  if (!FORMA_UUID.test(direccionId)) return { direccion: null, puede: false }

  const { data, error } = await admin
    .from("farming_direcciones")
    .select("*")
    .eq("id", direccionId)
    .eq("agency_id", agencyId)
    .maybeSingle()
  if (error) throw error
  if (!data) return { direccion: null, puede: false }

  const { puede } = await zonaAccesible(admin, (data as any).zona_id, agencyId, userId)
  return { direccion: data, puede }
}
```

`FORMA_UUID` ya existe en ese archivo (lo agregó la etapa 2). Si no estuviera exportada dentro del módulo, usarla tal como la usa `zonaAccesible`.

- [ ] **Step 4: El endpoint**

`app/api/farming/direcciones/route.ts` con `export const dynamic = "force-dynamic"`, `GET` y `POST`. Las reglas que el código tiene que sostener, en este orden:

1. `requireTenant()` y `createAdminClient()`.
2. `zonaAccesible` **antes de tocar `farming_direcciones`**, en las dos operaciones.
3. En el POST: `validarDireccion(body)`; si devuelve errores, 400 con `{ error: errores.join(" ") }` sin escribir nada.
4. `origen` lo decide el servidor: `body.aviso_id ? "aviso" : "caminata"`.
5. `agency_id` y `creada_por` salen de la sesión.
6. El duplicado se busca **con la misma expresión que el índice**, y se consulta antes de insertar para poder contestar 409 con el nombre de la puerta ya cargada. Como `createAdminClient` no puede llamar a la función desde PostgREST, la comprobación se hace trayendo las direcciones de la zona y comparando con `normalizarDireccion` — y **el insert igual puede fallar con `23505`**, que se traduce al mismo 409. Las dos cosas: el chequeo da el mensaje lindo, el índice es el candado.
7. `lat`/`lng` opcionales. Si vienen, **no se rechaza** la tarjeta por caer fuera del polígono: se guarda y la respuesta trae `{ fuera_de_zona: true }` para que la pantalla avise.

- [ ] **Step 5: Correr y ver pasar**

Run: `npx vitest run app/api/farming lib/farming` → todo verde.

- [ ] **Step 6: Commit**

```bash
git add lib/farming/servidor.ts app/api/farming/direcciones/route.ts app/api/farming/direcciones/route.test.ts
git commit -m "feat(farming): listar y dar de alta direcciones de la zona"
```

---

### Task 4: Editar y borrar una tarjeta

**Files:**
- Create: `app/api/farming/direcciones/[id]/route.ts`
- Test: `app/api/farming/direcciones/[id]/route.test.ts`

**Interfaces:**
- Consumes: `direccionAccesible` (Task 3).
- Produces: `PATCH /api/farming/direcciones/<id>` body: cualquier subconjunto de `EntradaDireccion` + `etapa` + `orden` → 200 `{ direccion }`; `DELETE` → 200 `{ ok: true }`.

Reglas:
- **Las columnas que el body NO puede tocar nunca:** `id`, `zona_id`, `agency_id`, `creada_por`, `created_at`, `unidades_totales` (es generada: mandarla hace fallar el UPDATE), `aviso_id`, `aviso_es_dueno_directo`, `origen`. Se filtran con una lista blanca explícita, no con un `delete` de las prohibidas.
- `updated_at` se pisa siempre en el servidor.
- Un `PATCH` que cambia `etapa` **no** escribe historial todavía: eso es la etapa 3-B. Dejar el comentario `// ETAPA 3-B:` donde va.
- `DELETE` borra de verdad (los propietarios y contactos se van por cascada). El diálogo de confirmación de la pantalla es el que avisa que se pierde el trabajo.
- Tests: PATCH de la tarjeta de un colega → 403; PATCH que intenta cambiar `zona_id` o `agency_id` → se ignora el campo y la fila queda igual (y el test muere si se saca la lista blanca); PATCH con una `etapa` que no existe → 400; DELETE de algo que no existe → 404.

Commit: `feat(farming): editar y borrar una tarjeta de relevamiento`.

---

### Task 5: Los propietarios

**Files:**
- Create: `app/api/farming/direcciones/[id]/propietarios/route.ts` (POST)
- Create: `app/api/farming/direcciones/[id]/propietarios/[pid]/route.ts` (PATCH, DELETE)
- Test: `app/api/farming/direcciones/[id]/propietarios/route.test.ts`

**Interfaces:**
- Consumes: `direccionAccesible`; `normalizePhoneE164` de `@/lib/whatsapp/phone`.
- Produces: `POST` body `{ nombre, piso?, unidad?, vinculo?, telefono?, email?, notas? }` → 201 `{ propietario }`; `PATCH` y `DELETE` sobre `<pid>`.

Reglas:
- El teléfono se guarda **normalizado** con `normalizePhoneE164` (la función ya existe y es la que usa WhatsApp). Si el número no se puede normalizar, se guarda tal como lo escribió el asesor y **no se rechaza**: un teléfono mal anotado es mejor que perderlo. Dejarlo dicho en un comentario.
- `nombre` es obligatorio; el resto no.
- `agency_id` y `creado_por` de la sesión.
- El `pid` tiene que pertenecer a la `<id>` de la ruta: un propietario de otra dirección da 404 aunque el que llama tenga acceso a las dos. Test propio.
- `tracking_log_id` **no se toca acá** (es de la etapa 3-B): va en la lista negra del PATCH.

Commit: `feat(farming): los propietarios de cada direccion`.

---

### Task 6: «Crear tarjeta de relevamiento» desde un aviso

**Files:**
- Modify: `components/farming/avisos-en-zona.tsx`
- Modify: `app/api/farming/direcciones/route.ts` (la parte del aviso, si no quedó cerrada en Task 3)
- Test: agregar a `app/api/farming/direcciones/route.test.ts`

Esto cierra lo que la etapa 2 dejó marcado con `// ETAPA 3:`.

Reglas:
1. En cada tarjeta de la solapa «A la venta en mi zona», al lado de «descartar», va **«crear tarjeta»**. Mismo alto de 44 px.
2. Manda al POST de direcciones: `zona_id`, `aviso_id`, `aviso_es_dueno_directo`, y lo que el aviso ya trae — `calle` y `altura` salidas de `aviso.direccion` (partida con una regex simple: todo lo que no sea el número final es la calle), `tipo` mapeado desde `aviso.tipo` (`Departamento` → `edificio`, `Casa` → `casa`, `PH` → `ph`, `Local` → `local`, `Oficina` → `oficina`, `Terreno` → `lote`, cualquier otra cosa → `otro`), `a_la_venta: true`, `precio_pedido` y `moneda: "USD"`, y `observaciones` con el título del aviso.
3. El servidor marca el aviso como `convertido` en `farming_avisos_marca` **con `update` … `upsert` no**: si ya estaba `descartado`, un `ON CONFLICT DO NOTHING` no haría nada en silencio. Si no existe la marca, se inserta.
4. El aviso **desaparece de la lista** de «A la venta en mi zona» igual que un descarte (la marca lo excluye), y el mensaje dice: *«Lo pasaste a Relevamiento»*, con **deshacer**.
5. Si la puerta ya estaba cargada (409), el mensaje no es un error crudo: *«Esa dirección ya está en tu tablero»*.

Tests: el POST con `aviso_id` deja la marca en `convertido` con el `direccion_id`; si la marca ya existía como `descartado`, queda en `convertido` (este muere si alguien usa `upsert … ignoreDuplicates`); la tarjeta nace con `origen: "aviso"`.

Commit: `feat(farming): pasar un aviso a Relevamiento`.

---

### Task 7: La solapa «Relevamiento»

**Files:**
- Create: `components/farming/relevamiento.tsx`
- Create: `components/farming/direccion-dialog.tsx`
- Create: `components/farming/propietarios.tsx`
- Modify: `components/farming/farming-page.tsx`

**Interfaces:**
- Consumes: `pedir` de `@/lib/farming/cliente`; `TIPOS`, `ETAPAS`, `VINCULOS`, `validarDireccion`, `unidadesTotales`, `etiquetaDe` de `@/lib/farming/direcciones`; `MapaBuscador` de `@/components/mapa/mapa-buscador` (devuelve `Lugar` con `punto: { lat, lng }`); `ZonaFarming` de `@/lib/farming/tipos`.
- Produces: `Relevamiento({ zonas }: { zonas: ZonaFarming[] })`.

Qué tiene que haber:

1. **La tercera solapa** en `farming-page.tsx`, con el mismo molde que las dos que ya están. El comentario de la cabecera del archivo se actualiza: ya no dice que Relevamiento llega después.
2. **Selector de zona** (solo si hay más de una), igual que en la solapa de avisos.
3. **La lista agrupada por etapa**, en el orden de `ETAPAS`, con el conteo al lado de cada título. Las etapas vacías no se dibujan, salvo «Relevado». Cada tarjeta muestra: calle y altura, tipo, unidades totales («32 unidades»), el encargado por su nombre si lo hay, y **la próxima acción con su fecha como línea visible** — nunca en un globito.
4. **El cartel de fuera de zona** cuando `fuera_de_zona` es true: *«esta dirección quedó fuera de tu zona»*. Se sigue pudiendo trabajar.
5. **«+ agregar dirección»** arriba, abre `direccion-dialog.tsx`:
   - Arriba de todo, el buscador de direcciones (`MapaBuscador`). Al elegir una sugerencia se completan calle, altura y las coordenadas. **Se puede escribir todo a mano y guardar sin elegir ninguna**: en ese caso la tarjeta va sin coordenadas.
   - Campos, en este orden: calle*, altura, tipo*, tramo, pisos, unidades por piso (o unidades, si el tipo no es edificio), encargado (nombre, turno, notas), «está a la venta» con cartel / inmobiliaria / precio y moneda, fecha de relevamiento, próxima acción y cuándo, observaciones.
   - **Las unidades totales se muestran calculadas, en gris, y no se pueden escribir.**
   - `validarDireccion` corre en el cliente para mostrar los errores antes de mandar; el servidor vuelve a validar igual.
   - El mismo diálogo sirve para editar (`PATCH`).
6. **Los propietarios** (`propietarios.tsx`) se abren desde la tarjeta: lista de personas con piso, unidad, vínculo y teléfono, y un formulario corto para sumar una. El teléfono es un link `tel:`. Dejar el lugar marcado con `// ETAPA 3-B:` donde va «→ pasarlo a mi pipeline».
7. **Borrar una tarjeta** pide confirmación y dice lo que se pierde: *«Se borra la dirección, sus propietarios y todo su historial. No se puede deshacer.»*

Verificación antes de commitear: `npx tsc --noEmit`, `npm run lint` y `npm test`, los tres limpios en los archivos de farming.

Commit: `feat(farming): la solapa Relevamiento — cargar lo que se camina`.

---

### Task 8: El ataque, aplicar, probar y documentar

**Este es el turno del controlador**, no de un implementador.

- [ ] **Step 1: Extender el ataque de RLS**

En `scripts/farming-rls-ataque.mjs`, con el mismo estilo que los 10 casos que ya tiene, agregar sobre las tablas nuevas: B intenta **leer** una dirección de la zona de A (tiene que fallar), **insertar** una dirección en la zona de A, **actualizar** y **borrar** una de A, y lo mismo sobre `farming_propietarios`. Control positivo: B **sí** lee las direcciones de una zona que A le compartió. Y, como en la etapa 2, si el seed no puede correr porque la migración no está aplicada, el veredicto final tiene que decirlo y salir con código 2 — nunca en verde.

- [ ] **Step 2: Pedir el OK y aplicar**

Explicar en criollo: **qué NO se toca** (las tres tablas de farming que ya están en producción y en uso, y `mercado_avisos`), **qué se crea** (tres tablas vacías y una función de texto), **qué pasa si sale mal** (el rollback las borra; nacen vacías), y **que después corre el ataque**. El comando lo corre Leonardo:

```
! cd "C:\Users\LENOVO\Desktop\CODE\Antigravity - Apps\PRISMA-SYSTEM-farming2"; node scratch/aplicar-sql.mjs supabase/migrations/20260917120000_farming_direcciones.sql
```

Después, verificar contra producción: que las tres tablas existan, que `authenticated` y `anon` tengan **solo SELECT**, que la RLS esté encendida, y que el índice único rechace la segunda «av ejemplo 1200».

- [ ] **Step 3: Correr el ataque**

Tiene que dar **todos los ataques fallando** y los controles positivos pasando, con salida 0.

- [ ] **Step 4: Probar en el navegador**

Con `prueba-farming-a@vakdor.com` y la zona «Palermo de prueba», **nunca con la cuenta de un asesor real**. Escritorio y celular (390×844), los dos temas:
1. Cargar una dirección a pie con lo mínimo (calle y tipo) y que se guarde.
2. Cargar un edificio con 8 pisos × 4 unidades y que muestre **32 unidades** sin haberlas escrito.
3. Cargar la misma puerta escrita distinto («Av. Ejemplo 1200» y «av ejemplo 1200») y que **avise que ya está**, sin crear la segunda.
4. Sumar dos propietarios con teléfono y que el teléfono quede como link.
5. Desde «A la venta en mi zona», **«crear tarjeta»**: aparece en Relevamiento, desaparece de la lista de avisos, y el deshacer funciona.
6. Editar y borrar una tarjeta, con el aviso de lo que se pierde.
7. Medir que todo lo tocable llegue a 44 px y que ninguna línea quede cortada.

- [ ] **Step 5: Documentar**

Guía del asesor §25 (la solapa nueva, sin tecnicismos), la bitácora del día, y el spec si algo se decidió distinto. Después, ofrecer el merge.

---

## Lo que este plan deja listo para la 3-B

- `farming_contactos` ya existe, con su RLS y su ataque: la 3-B solo escribe en ella.
- `farming_propietarios.tracking_log_id` está creado y bloqueado en los PATCH: el botón «→ pasarlo a mi pipeline» lo llena.
- La lista ya viene agrupada por etapa y con `orden`: el tablero cambia cómo se dibuja, no de dónde sale.
- Los lugares exactos donde va cada regla quedan marcados con `// ETAPA 3-B:`.
- **Para la 3-B, dos cosas que ya están medidas:** `savePerformanceLog` exige `type` y `proceso`, y `PROCESOS_POR_ETAPA.prospeccion` admite cuatro valores — así que el botón a Tracking manda `proceso: "vendedor"` por defecto (farming es captación) y deja elegir «locador». Y `PipelineStageDialog` (`components/tracking/pipeline/PipelineStageDialog.tsx`) es el molde del diálogo obligatorio al mover una tarjeta.
