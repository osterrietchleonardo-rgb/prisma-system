-- Motor de contenido: ejes de cruce (cluster, proposito) + escenas con area y momento.
-- Todo aditivo: columnas nuevas nullable y create table if not exists. El unico cambio
-- sobre algo existente es el check de `tipo`, que solo AMPLIA el conjunto permitido.
--
-- Diseno: docs/superpowers/specs/2026-08-14-marketing-motor-cruces-y-seo-design.md

-- 1. Clusters: territorio unico para blog y LinkedIn.
--    `url_pilar` es el destino previsto de la pagina pilar; sembrar la taxonomia NO implica
--    que esas paginas existan todavia.
create table if not exists marketing_clusters (
  clave         text primary key,
  titulo        text not null,
  descripcion   text not null,
  keyword_pilar text not null,
  url_pilar     text not null,
  fractura      text,
  areas         text[] not null default '{}',
  activo        boolean not null default true,
  created_at    timestamptz not null default now()
);

alter table marketing_clusters enable row level security;
-- Sin politicas: solo service_role, mismo criterio que marketing_ideas y marketing_recursos.

-- 2. Ejes nuevos en las ideas. Nullable a proposito: las ideas ya creadas no tienen
--    cluster ni proposito y tienen que seguir funcionando igual.
alter table marketing_ideas add column if not exists cluster          text;
alter table marketing_ideas add column if not exists proposito        text;
alter table marketing_ideas add column if not exists keyword_objetivo text;

-- 3. Ejes nuevos en el banco de recursos.
--    area/momento solo se llenan en tipo='escena'; propositos solo en tipo='estructura'.
--    Sin check que lo fuerce: el filtrado vive en el codigo y ya tolera nulos.
alter table marketing_recursos add column if not exists area       text;
alter table marketing_recursos add column if not exists momento    text;
alter table marketing_recursos add column if not exists propositos text[] not null default '{}';

-- 4. El banco admite un tipo mas.
alter table marketing_recursos drop constraint if exists marketing_recursos_tipo_check;
alter table marketing_recursos add constraint marketing_recursos_tipo_check
  check (tipo in ('canon','estructura','escena','comentario','proposito'));

-- 5. Indice para el filtrado de escenas por momento y area.
create index if not exists marketing_recursos_escena_idx
  on marketing_recursos (tipo, momento, area) where activo;
