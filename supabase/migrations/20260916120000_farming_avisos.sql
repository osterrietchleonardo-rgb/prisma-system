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
