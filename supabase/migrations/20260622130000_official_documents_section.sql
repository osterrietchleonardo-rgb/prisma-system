-- ─────────────────────────────────────────────────────────────
-- Documentos Oficiales descargables (sección aparte de la IA)
-- Tablas propias y aisladas: la IA (agency_documents / match_agency_documents)
-- NUNCA toca estas tablas.
-- ─────────────────────────────────────────────────────────────

-- Carpetas de documentos oficiales
create table if not exists public.official_document_folders (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  name        text not null,
  description text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_official_doc_folders_agency on public.official_document_folders(agency_id);

-- Archivos oficiales
create table if not exists public.official_documents (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  folder_id   uuid references public.official_document_folders(id) on delete set null,
  title       text not null,
  file_url    text not null,            -- ruta dentro del bucket "documents" (prefijo official/)
  file_type   text,
  file_size   bigint,
  version     integer not null default 1,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_official_docs_agency on public.official_documents(agency_id);
create index if not exists idx_official_docs_folder on public.official_documents(folder_id);

-- RLS
alter table public.official_document_folders enable row level security;
alter table public.official_documents enable row level security;

-- ── Carpetas: ver = cualquier miembro de la agencia; gestionar = solo director ──
create policy "view official folders"
  on public.official_document_folders for select
  using (agency_id in (select agency_id from public.profiles where id = auth.uid()));

create policy "directors manage official folders"
  on public.official_document_folders for all
  using (agency_id in (select agency_id from public.profiles where id = auth.uid() and role = 'director'))
  with check (agency_id in (select agency_id from public.profiles where id = auth.uid() and role = 'director'));

-- ── Documentos: ver = cualquier miembro de la agencia; gestionar = solo director ──
create policy "view official documents"
  on public.official_documents for select
  using (agency_id in (select agency_id from public.profiles where id = auth.uid()));

create policy "directors manage official documents"
  on public.official_documents for all
  using (agency_id in (select agency_id from public.profiles where id = auth.uid() and role = 'director'))
  with check (agency_id in (select agency_id from public.profiles where id = auth.uid() and role = 'director'));
