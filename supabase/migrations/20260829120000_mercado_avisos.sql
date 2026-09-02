-- ============================================================================
-- mercado_avisos: el espejo del mercado (reemplazo de roomix_properties)
-- Fuente: API interna de ZonaProp (v3 búsqueda / v4 detalle) vía barridos.
-- Diseño completo y verificaciones: docs/superpowers + artifact "El espejo del
-- mercado" (29-ago-2026). Solo venta en fase 1-5; preparada para alquiler.
--
-- Decisiones clave (todas verificadas contra producción el 28-29/8):
--  * Particionada por es_dueno_directo: físicamente dos tablas (dueños /
--    inmobiliarias), lógicamente una. PG 17.6 mueve filas entre particiones
--    con un UPDATE sin perder id ni histórico.
--  * El teléfono va en la tabla principal, PARA TODOS los avisos (pedido de
--    Leonardo): el scraper lo trae también para inmobiliarias.
--  * calidad/cuarentena: nada se borra; el mapa y el ACM leen calidad='ok'.
--  * h3_res6/h3_res8 las calcula el crawler con h3-js (no hay extensión h3).
--  * Sin FK desde las satélites hacia la particionada: la PK compuesta
--    (id, es_dueno_directo) haría la FK frágil ante el cambio de publicador.
--    aviso_id es el id público de ZonaProp, estable; integridad por índice.
--
-- Esta migración NO toca roomix_properties ni ninguna tabla existente.
-- La vista de compatibilidad es una migración APARTE, para el día del corte.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. La tabla principal, particionada
-- --------------------------------------------------------------------------

create table public.mercado_avisos (
  -- identidad
  id                          bigint       not null,               -- postingId de ZonaProp
  es_dueno_directo            boolean      not null default false, -- clave de partición; by_owner ⇔ type_id=1
  portal                      text         not null default 'zonaprop',
  url_publica                 text         not null,
  url_api                     text,
  slug                        text,
  codigo_anunciante           text,                                -- código interno de la inmobiliaria (cruza portales)
  crm_detectado               text,                                -- p.ej. XINTEL, extraído de la descripción

  -- calidad (el bloque que roomix no tiene)
  calidad                     text         not null default 'ok'
                              check (calidad in ('ok','cuarentena','conflicto')),
  calidad_motivos             text[]       not null default '{}',
  duplicado_de                bigint,                              -- aviso más antiguo del mismo inmueble
  completitud                 smallint,                            -- % de campos clave con dato (loader)

  -- ciclo de vida (nuestro)
  estado                      text         not null default 'activo'
                              check (estado in ('activo','pausado','sospechoso','caido')),
  visto_primera_vez           timestamptz  not null default now(),
  visto_ultima_vez            timestamptz  not null default now(),
  verificado_en               timestamptz,
  caido_en                    timestamptz,
  dias_en_mercado             int          generated always as (
                                case when caido_en is not null and publicado_desde is not null
                                     then greatest(0, (extract(epoch from (caido_en - publicado_desde)) / 86400)::int)
                                end) stored,
  barridos_sin_ver            int          not null default 0,
  hash_contenido              text,

  -- publicación (del portal; fechas reales en publicationListCard, NO en publicationDetail)
  publicado_desde             timestamptz,
  primera_publicacion         timestamptz,
  republicado                 boolean      generated always as (
                                publicado_desde is not null and primera_publicacion is not null
                                and (publicado_desde - primera_publicacion) > interval '1 day') stored,
  veces_republicado           smallint     not null default 0,
  plan_publicacion            text,                                -- SIMPLE | HIGHLIGHTED | SUPERHIGHLIGHTED
  dias_publicado              int,                                 -- parseado de publicationStatistics
  visualizaciones             int,                                 -- idem; no existe en otra fuente

  -- operación y tipo
  operacion                   text         not null default 'venta'
                              check (operacion in ('venta','alquiler','alquiler-temporario')),
  tipo                        text,                                -- Departamento, Casa, PH, Cochera…
  subtipo                     text,
  tipo_id                     smallint,                            -- real_estate_type_id (estable)
  es_emprendimiento           boolean      not null default false,
  en_construccion             boolean      not null default false,
  funcion_negocio             text,

  -- precio
  precio                      numeric(14,2),
  moneda                      text,
  precio_usd                  numeric(14,2),                       -- normalizado por el loader
  precio_m2                   numeric(12,2) generated always as (
                                case when precio > 0 and superficie_total_m2 > 0
                                     then round(precio / superficie_total_m2, 2) end) stored,
  precio_inicial              numeric(14,2),                       -- el primero que vimos; no se pisa
  variacion_precio_pct        numeric(7,2) generated always as (
                                case when precio_inicial > 0 and precio is not null
                                     then round((precio - precio_inicial) / precio_inicial * 100, 2) end) stored,
  expensas                    numeric(14,2),
  expensas_moneda             text         default 'ARS',          -- el portal no la declara; se asume peso
  apto_credito                boolean      not null default false,
  acepta_mascotas             boolean      not null default false,
  precio_bajo_pct             numeric(6,2),                        -- low_price_percentage del portal

  -- medidas y distribución
  superficie_total_m2         numeric(10,2),
  superficie_cubierta_m2      numeric(10,2),
  superficie_semicubierta_m2  numeric(10,2),
  superficie_descubierta_m2   numeric(10,2) generated always as (
                                case when superficie_total_m2 >= superficie_cubierta_m2
                                     then superficie_total_m2 - superficie_cubierta_m2 end) stored,
  ambientes                   smallint,
  dormitorios                 smallint,
  banos                       smallint,
  cocheras                    smallint,
  antiguedad_anios            smallint,
  piso                        smallint,                            -- parseado del texto; solo ~18% lo declara
  pisos_edificio              smallint,
  disposicion                 text,                                -- frente | contrafrente | lateral | interno
  orientacion                 text,                                -- N, S, E, O, NE…

  -- ubicación
  direccion                   text,
  direccion_exacta            boolean      not null default false, -- visibility = EXACT
  barrio                      text,
  sub_barrio                  text,                                -- Belgrano C / R / Chico / Barrio Chino
  ciudad                     text,
  provincia                   text,
  region                      text,                                -- CABA | GBA Norte | GBA Sur | GBA Oeste | Interior
  pais                        text         not null default 'AR',
  lat                         double precision,
  lng                         double precision,
  geom                        geography(point, 4326) generated always as (
                                case when lat is not null and lng is not null
                                     then st_setsrid(st_makepoint(lng, lat), 4326)::geography end) stored,
  h3_res6                     text,                                -- calculadas por el crawler (h3-js)
  h3_res8                     text,
  distancia_centroide_m       int,                                 -- vs centroide del barrio (loader)
  url_mapa                    text,

  -- texto y características
  titulo                      text,
  descripcion                 text,                                -- SIEMPRE description; list_description viene truncada
  amenities                   text[]       not null default '{}',
  caracteristicas             jsonb        not null default '{}'::jsonb,
  apto_profesional            boolean      not null default false,
  luminoso                    boolean      not null default false,
  embedding                   vector(768),

  -- medios
  fotos                       text[]       not null default '{}',  -- pictureUrlsDetailOnly (una resolución)
  fotos_cantidad              smallint     generated always as (cardinality(fotos)) stored,
  foto_portada                text,
  planos                      text[]       not null default '{}',
  videos                      text[]       not null default '{}',
  tours                       text[]       not null default '{}',
  tiene_plano                 boolean      generated always as (cardinality(planos) > 0) stored,
  tiene_video                 boolean      generated always as (cardinality(videos) > 0) stored,
  tiene_tour                  boolean      generated always as (cardinality(tours) > 0) stored,

  -- quién publica (teléfono acá, para todos)
  publicador_id               bigint,
  publicador_nombre           text,                                -- publisher.name (list_publisher_name viene null)
  publicador_premier          boolean      not null default false,
  publicador_puntaje          numeric(3,1),
  publicador_resenas          int,
  publicador_respuesta        numeric(3,1),
  telefono                    text,
  tiene_whatsapp              boolean      not null default false,

  -- técnicas
  payload                     jsonb,                               -- requestResponses crudo, para reprocesar
  barrido_id                  bigint,
  creado_en                   timestamptz  not null default now(),
  actualizado_en              timestamptz  not null default now(),

  primary key (id, es_dueno_directo)
) partition by list (es_dueno_directo);

comment on table public.mercado_avisos is
  'Espejo del mercado publicado (ZonaProp). Reemplaza a roomix_properties. Particionada por es_dueno_directo. El mapa/ACM leen calidad=''ok''. Nada se borra: los caídos guardan dias_en_mercado.';

create table public.mercado_avisos_duenos
  partition of public.mercado_avisos for values in (true);

create table public.mercado_avisos_inmobiliarias
  partition of public.mercado_avisos for values in (false);

comment on table public.mercado_avisos_duenos is
  'Partición: avisos publicados por dueño directo. Consultable directo para el módulo de captación.';
comment on table public.mercado_avisos_inmobiliarias is
  'Partición: avisos publicados por inmobiliarias.';

-- Índices (declarados en el padre: se propagan a cada partición)
create index mercado_avisos_estado_idx        on public.mercado_avisos (estado) where calidad = 'ok';
create index mercado_avisos_barrio_idx        on public.mercado_avisos (barrio, tipo_id) where estado = 'activo' and calidad = 'ok';
create index mercado_avisos_geom_idx          on public.mercado_avisos using gist (geom);
create index mercado_avisos_visto_idx         on public.mercado_avisos (visto_ultima_vez);
create index mercado_avisos_publicador_idx    on public.mercado_avisos (publicador_id);
create index mercado_avisos_calidad_idx       on public.mercado_avisos (calidad) where calidad <> 'ok';
create index mercado_avisos_barrio_trgm_idx   on public.mercado_avisos using gin (barrio gin_trgm_ops);
create index mercado_avisos_h3_res8_idx       on public.mercado_avisos (h3_res8);
create index mercado_avisos_embedding_idx     on public.mercado_avisos using hnsw (embedding vector_cosine_ops);

-- --------------------------------------------------------------------------
-- 2. Satélites
-- --------------------------------------------------------------------------

-- Histórico de precios: una fila por cada cambio detectado. Nunca se borra.
create table public.mercado_precios (
  id             bigint generated always as identity primary key,
  aviso_id       bigint       not null,        -- sin FK: ver cabecera
  precio         numeric(14,2) not null,
  moneda         text          not null,
  expensas       numeric(14,2),
  visto_en       timestamptz   not null default now(),
  variacion_pct  numeric(7,2)                  -- vs el precio anterior registrado
);
create index mercado_precios_aviso_idx on public.mercado_precios (aviso_id, visto_en desc);
comment on table public.mercado_precios is
  'Histórico de precios de mercado_avisos. En la principal vive solo el precio actual.';

-- Publicadores normalizados (inmobiliarias y dueños).
create table public.mercado_publicadores (
  id              bigint       primary key,    -- publisher.id de ZonaProp
  nombre          text,
  es_dueno        boolean      not null default false,
  premier         boolean      not null default false,
  puntaje         numeric(3,1),
  resenas         int,
  puntaje_respuesta numeric(3,1),
  logo            text,
  avisos_activos  int          not null default 0,
  visto_primera_vez timestamptz not null default now(),
  actualizado_en  timestamptz  not null default now()
);
comment on table public.mercado_publicadores is
  'Quién publica: inmobiliarias y dueños directos, con su reputación pública. resenas es proxy del tamaño real.';

-- Emprendimientos: avisos con rangos ("1 a 2 amb."). NO son propiedades
-- individuales; mezclados con el resto arruinan el precio/m².
create table public.mercado_emprendimientos (
  id             bigint       primary key,     -- postingId
  url_publica    text         not null,
  titulo         text,
  descripcion    text,
  barrio         text,
  sub_barrio     text,
  lat            double precision,
  lng            double precision,
  precio_desde   numeric(14,2),
  moneda         text,
  ambientes_rango text,                        -- "1 a 2 amb." tal cual
  superficie_rango text,                       -- "20 a 67 m2" tal cual
  unidades       smallint,
  publicador_id  bigint,
  en_construccion boolean     not null default true,
  payload        jsonb,
  estado         text         not null default 'activo'
                 check (estado in ('activo','pausado','sospechoso','caido')),
  visto_primera_vez timestamptz not null default now(),
  visto_ultima_vez  timestamptz not null default now(),
  caido_en       timestamptz
);
comment on table public.mercado_emprendimientos is
  'Avisos con rangos (pozos/edificios). Separados a propósito: no entran en promedios ni comparables.';

-- Auditoría de barridos: lo que hace confiable a todo el sistema.
create table public.mercado_barridos (
  id             bigint generated always as identity primary key,
  tipo           text         not null check (tipo in ('descubrimiento','refresco','verificacion')),
  zona           text         not null,        -- p.ej. 'belgrano', 'palermo-p1'
  filtros        jsonb        not null default '{}'::jsonb,
  inicio         timestamptz  not null default now(),
  fin            timestamptz,
  esperados      int,                          -- lo que declara el título del portal
  obtenidos      int          not null default 0,
  paginas        int          not null default 0,
  errores        int          not null default 0,
  completo       boolean      not null default false,
  -- REGLA DURA: solo un barrido con habilita_bajas=true puede abrir sospechas.
  -- Requiere: obtenidos >= 95% de esperados, todas las páginas, cero errores.
  habilita_bajas boolean      not null default false,
  costo_usd      numeric(8,4),
  run_apify      text,
  notas          text
);
create index mercado_barridos_zona_idx on public.mercado_barridos (zona, inicio desc);
comment on table public.mercado_barridos is
  'Una fila por corrida. Si no quedó registrada, no pasó. Un barrido parcial suma información; jamás resta.';

-- --------------------------------------------------------------------------
-- 3. RLS: leer pueden los usuarios de la app; escribir, solo el servicio
-- --------------------------------------------------------------------------

alter table public.mercado_avisos            enable row level security;
alter table public.mercado_avisos_duenos     enable row level security;
alter table public.mercado_avisos_inmobiliarias enable row level security;
alter table public.mercado_precios           enable row level security;
alter table public.mercado_publicadores      enable row level security;
alter table public.mercado_emprendimientos   enable row level security;
alter table public.mercado_barridos          enable row level security;

-- Lectura para usuarios autenticados (el mapa, el ACM y el buscador corren
-- con sesión). Sin políticas de escritura: solo service_role (bypassa RLS).
create policy mercado_avisos_select on public.mercado_avisos
  for select to authenticated using (true);
-- Las particiones tienen RLS propia: sin política, consultarlas directo
-- (p.ej. mercado_avisos_duenos para captación) devolvería vacío.
create policy mercado_avisos_duenos_select on public.mercado_avisos_duenos
  for select to authenticated using (true);
create policy mercado_avisos_inmobiliarias_select on public.mercado_avisos_inmobiliarias
  for select to authenticated using (true);
create policy mercado_precios_select on public.mercado_precios
  for select to authenticated using (true);
create policy mercado_publicadores_select on public.mercado_publicadores
  for select to authenticated using (true);
create policy mercado_emprendimientos_select on public.mercado_emprendimientos
  for select to authenticated using (true);
create policy mercado_barridos_select on public.mercado_barridos
  for select to authenticated using (true);

-- --------------------------------------------------------------------------
-- 4. Trigger de actualizado_en (solo cuando la fila realmente cambia)
-- --------------------------------------------------------------------------

create or replace function public.mercado_touch_actualizado()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

create trigger mercado_avisos_touch
  before update on public.mercado_avisos
  for each row
  when (old.hash_contenido is distinct from new.hash_contenido)
  execute function public.mercado_touch_actualizado();

create trigger mercado_publicadores_touch
  before update on public.mercado_publicadores
  for each row execute function public.mercado_touch_actualizado();
