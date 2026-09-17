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
