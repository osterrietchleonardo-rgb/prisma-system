-- Google Calendar Sync (una dirección: PRISMA -> Google)
-- 1) Guarda la "llave" (refresh token encriptado) de cada asesor que conecta su Google.
-- 2) Guarda en cada visita el id del evento creado en Google, para luego editarlo/borrarlo.

-- ── Tabla de llaves ──────────────────────────────────────────────────────────
create table if not exists public.google_calendar_tokens (
  user_id            uuid primary key references public.profiles(id) on delete cascade,
  refresh_token_enc  text not null,           -- refresh token ENCRIPTADO (AES-256-GCM)
  google_email       text,                    -- email de la cuenta Google conectada
  scope              text,                    -- scopes otorgados
  connected_at       timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.google_calendar_tokens is
  'Llave de Google Calendar por asesor. El refresh token se guarda encriptado. Solo se accede con service_role desde el backend.';

-- RLS: nadie accede vía anon/authenticated. El backend usa service_role (que ignora RLS).
alter table public.google_calendar_tokens enable row level security;

-- Permitimos al propio usuario LEER solo metadatos de conexión (no usamos el token en el cliente,
-- pero esto deja a salvo el patrón por si se consultara estado por RLS). El token igual va encriptado.
drop policy if exists "owner can read own google token row" on public.google_calendar_tokens;
create policy "owner can read own google token row"
  on public.google_calendar_tokens
  for select
  using (auth.uid() = user_id);

-- Sin policies de insert/update/delete para roles normales: solo service_role escribe.

-- ── Columna en scheduled_visits ──────────────────────────────────────────────
alter table public.scheduled_visits
  add column if not exists google_event_id text;

comment on column public.scheduled_visits.google_event_id is
  'ID del evento espejo en el Google Calendar del asesor (null si no sincronizado).';
