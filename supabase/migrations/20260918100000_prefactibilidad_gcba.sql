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
  geom_lote      geometry(Geometry, 4326),     -- epok devuelve MultiPolygon, pero un Polygon también tiene que entrar
  geom_manzana   geometry(Geometry, 4326),
  catastro       jsonb,                       -- respuesta de epok catastro/parcela
  volumenes      jsonb,                       -- VolumenOficial[] de las teselas, ya en lon/lat
  manzana_tipo   text,                        -- TIPICA | ATIPICA según la tesela manzana
  esquina_oficial boolean not null default false, -- 2+ líneas oficiales con rumbo distinto
  consultado_en  timestamptz not null default now()
);
comment on table public.gcba_parcela_cache is 'Lo que se le pidió en vivo al catastro (epok) y a Ciudad 3D. La segunda consulta no toca al GCBA.';
create index if not exists gcba_parcela_cache_geom_idx on public.gcba_parcela_cache using gist (geom_lote);

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
