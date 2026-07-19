-- Análisis diario del rendimiento real de posts (Buffer): qué contenido rinde más.
-- Lo escribe el worker 1x/día; lo leen el worker (contenido) y el motor de ideas.
create table if not exists marketing_insights (
  fecha date primary key,
  resumen text not null,
  data jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default now()
);
alter table marketing_insights enable row level security;
comment on table marketing_insights is 'Análisis diario del rendimiento real de posts (Buffer): qué contenido rinde más. Lo escribe el worker 1x/día; lo leen el worker (contenido) y el motor de ideas.';
