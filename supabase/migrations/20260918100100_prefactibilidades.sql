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
  token text unique,                     -- null hasta que se comparte
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