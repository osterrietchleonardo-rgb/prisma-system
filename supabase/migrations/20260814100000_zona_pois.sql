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
create index        if not exists zona_barrios_geom_idx        on public.zona_barrios using gist (geom);

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
  -- El punto. En parques y ciclovías es un punto sobre la propia forma: es lo que se dibuja
  -- en el mapa.
  geom           geometry(Point, 4326) not null,
  -- La forma real cuando no es un punto (el polígono del parque, el trazado de la ciclovía).
  -- La distancia se mide contra ESTO cuando existe: el centro de las Barrancas está mucho más
  -- lejos que su borde, y al que camina le importa el borde.
  geom_forma     geometry(Geometry, 4326),
  fuente         text not null,
  actualizado_at timestamptz not null default now()
);

create unique index if not exists zona_pois_cat_ext_idx    on public.zona_pois (categoria, ext_id);
create index        if not exists zona_pois_geom_idx       on public.zona_pois using gist (geom);
create index        if not exists zona_pois_forma_idx      on public.zona_pois using gist (geom_forma)
  where geom_forma is not null;
create index        if not exists zona_pois_categoria_idx  on public.zona_pois (categoria);

-- RLS: lectura para cualquier usuario logueado, escritura solo para el service role (que
-- saltea RLS). Sin políticas de escritura a propósito: nadie edita esto desde la app.
alter table public.zona_barrios enable row level security;
alter table public.zona_pois    enable row level security;

drop policy if exists "zona_barrios lectura autenticada" on public.zona_barrios;
create policy "zona_barrios lectura autenticada"
  on public.zona_barrios for select to authenticated using (true);

drop policy if exists "zona_pois lectura autenticada" on public.zona_pois;
create policy "zona_pois lectura autenticada"
  on public.zona_pois for select to authenticated using (true);
