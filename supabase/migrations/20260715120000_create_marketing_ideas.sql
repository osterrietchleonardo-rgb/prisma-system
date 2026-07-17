-- Módulo Marketing — pipeline de ideas de contenido (Agente IA de Marketing).
-- Tabla de back-office admin: RLS activado SIN políticas públicas (acceso solo service role).

create table if not exists public.marketing_ideas (
  id uuid primary key default gen_random_uuid(),
  estado text not null default 'idea'
    check (estado in ('idea','en_proceso','en_revision','aprobada','publicada','rechazada')),
  fuente text not null
    check (fuente in ('linkedin','instagram','blog')),
  formato text not null
    check (formato in ('post_texto','carrusel','imagen','encuesta','articulo_linkedin','reel','lead_magnet','articulo_blog')),
  titulo text not null,
  angulo text,
  estructura text,
  gancho text,
  contenido text,
  primer_comentario text,
  hashtags text[] default '{}',
  motivo text,
  comentario text,
  brief jsonb default '{}'::jsonb,
  blog jsonb default '{}'::jsonb,
  assets jsonb default '[]'::jsonb,
  programada_para timestamptz,
  publicado_en jsonb,
  origen text not null default 'manual'
    check (origen in ('motor','manual')),
  historial jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_marketing_ideas_estado on public.marketing_ideas(estado);
create index if not exists idx_marketing_ideas_fuente on public.marketing_ideas(fuente);
create index if not exists idx_marketing_ideas_created on public.marketing_ideas(created_at desc);

-- updated_at automático (reutiliza patrón existente si la función ya existe).
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_marketing_ideas_updated_at on public.marketing_ideas;
create trigger trg_marketing_ideas_updated_at
  before update on public.marketing_ideas
  for each row execute function public.set_updated_at();

-- RLS: activado, sin políticas (el service role las saltea; nadie más entra).
alter table public.marketing_ideas enable row level security;

-- Bucket privado para assets (PDF de lead magnet, PNG de carrusel).
insert into storage.buckets (id, name, public)
values ('marketing-assets', 'marketing-assets', false)
on conflict (id) do nothing;
