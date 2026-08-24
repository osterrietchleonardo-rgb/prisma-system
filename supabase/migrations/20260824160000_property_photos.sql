-- Fotos de propiedades retocadas con IA (Marketing → solapa "Fotos").
--
-- Antes vivían en `generated_images` con `draft_id` en NULL, pero esa tabla es
-- para las imágenes de anuncios: su `format` tiene un CHECK que solo acepta
-- reels/post/historia, y el contexto había que guardarlo como JSON dentro de
-- `extra_prompt`. Esta tabla guarda cada cosa en su columna.
--
-- `sesion_id` agrupa todo lo que se le hizo a una misma foto: los tres modos y
-- los retoques posteriores son una sola tarjeta en la galería.

create table if not exists public.property_photos (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  -- Se guarda para poder abrir la galería a toda la agencia más adelante sin
  -- tener que migrar datos. Hoy la RLS es por usuario.
  agency_id      uuid references public.agencies(id) on delete cascade,

  sesion_id      uuid not null,
  tokko_id       bigint,
  propiedad      text,

  modo           text not null check (modo in ('mejorar', 'limpiar', 'ambientar', 'retoque')),
  estilo         text,

  storage_path   text not null,
  public_url     text not null,
  width          integer not null default 0,
  height         integer not null default 0,

  -- La foto de la ficha de la que salió todo: es la primera del carrusel.
  foto_original  text,
  -- Contra qué foto controla la IA que no se haya cambiado nada.
  referencia_url text,
  -- El relevamiento del ambiente, para poder seguir editándola después.
  relevamiento   jsonb,

  aprobado       boolean not null default true,
  costo_usd      numeric(10, 4),
  created_at     timestamptz not null default now()
);

create index if not exists property_photos_user_fecha_idx
  on public.property_photos (user_id, created_at desc);
create index if not exists property_photos_sesion_idx
  on public.property_photos (sesion_id);
create index if not exists property_photos_tokko_idx
  on public.property_photos (tokko_id);

alter table public.property_photos enable row level security;

-- Misma política que las imágenes de anuncios: cada uno ve y maneja las suyas.
drop policy if exists "Cada usuario maneja sus fotos" on public.property_photos;
create policy "Cada usuario maneja sus fotos"
  on public.property_photos
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table public.property_photos is
  'Fotos de propiedades retocadas con IA. sesion_id agrupa los pasos de una misma foto.';
