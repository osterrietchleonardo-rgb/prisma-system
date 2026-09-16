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
  -- Tres pasos, y el orden importa: sacar acentos y bajar a minúsculas, después tirar todo lo
  -- que no sea letra, número o espacio (así «Av. Ejemplo» y «Av Ejemplo» son la misma puerta:
  -- el punto de la abreviatura es la diferencia más común entre dos asesores), y recién
  -- entonces colapsar los espacios que quedaron.
  select btrim(regexp_replace(
           regexp_replace(
             lower(public.unaccent('public.unaccent'::regdictionary,
               btrim(coalesce(p_calle, '')) || ' ' || btrim(coalesce(p_altura, '')))),
             '[^a-z0-9 ]', '', 'g'),
           '\s+', ' ', 'g'))
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
