-- supabase/migrations/20260916120000_chat_web_widget_y_paginas.sql
--
-- Chat web · paso 1: dónde se guarda la configuración del widget y el sitio rastreado.
-- Spec: docs/superpowers/specs/2026-09-16-chat-web-v1-simple-design.md (§3-bis y §5)
--
-- QUÉ NO SE TOCA: nada de lo que existe. Ni whatsapp_ai_settings, ni conversations, ni
-- wa_messages, ni leads, ni properties, ni profiles. Esto es TODO aditivo: dos tablas nuevas
-- que hoy nadie lee ni escribe (el endpoint y la tarjeta de configuración todavía no existen).
-- Si esta migración se aplica y después no seguimos, PRISMA funciona exactamente igual.
--
-- Las conversaciones del chat (web_conversaciones, web_mensajes) NO van acá: van cuando el
-- asistente exista. De a poco.
--
-- Por qué dos tablas y no una: la configuración la escribe el director UNA vez y cambia poco;
-- las páginas se borran y se vuelven a escribir enteras en cada rastreo. Mezclarlas obligaría
-- a reescribir la configuración cada vez que se relee el sitio.
--
-- Escritura: la app escribe estas tablas con createAdminClient (service_role, que se saltea
-- RLS) y filtra por agencia en el endpoint. Por eso `authenticated` y `anon` NO reciben
-- permiso de escritura por PostgREST: nunca lo necesitan. Leer sí, para que el director vea
-- su configuración y la lista de páginas.
--
-- Aplicar por Management API (scripts/sql-produccion.mjs) con el OK de Leonardo.
-- Rollback: supabase/rollback/20260916_chat_web_widget_y_paginas_rollback.sql

begin;

-- ── 1. La configuración del widget: una por agencia ──
create table if not exists public.web_widgets (
  id                  uuid primary key default gen_random_uuid(),
  agency_id           uuid not null unique,

  -- El sitio del cliente, ya normalizado por lib/chat-web/rastreo.ts ("https://central.com/").
  sitio               text not null,
  -- Los dominios desde los que el widget puede hablar con PRISMA. Se compara contra el Origin
  -- del navegador: si no está en esta lista, el pedido se rechaza. Sin esto, cualquier página
  -- de internet podría usar el asistente de la agencia y gastarle la cuenta.
  dominios            text[] not null default '{}',

  -- A qué WhatsApp se deriva el lead. El principal, y uno opcional por objetivo
  -- ("sumarse_equipo" suele ir a otra persona que "vender_propiedad").
  whatsapp_destino    text,
  destinos_por_objetivo jsonb not null default '{}'::jsonb,

  -- Las secciones que el director carga a mano: nombre, link y dos líneas de qué hay.
  -- Son EL MAPA y mandan sobre lo que encuentre el rastreo (spec §3).
  secciones           jsonb not null default '[]'::jsonb,

  -- Apagado hasta que el director lo prenda. Un widget nuevo no atiende a nadie.
  activo              boolean not null default false,

  -- Cómo salió el último rastreo, para mostrarlo en la tarjeta sin adivinar.
  rastreo_estado      text not null default 'nunca'
                      check (rastreo_estado in ('nunca', 'en_curso', 'ok', 'error')),
  rastreo_en          timestamptz,
  -- El motivo exacto que devuelve rastrearSitio() cuando no pudo leer nada.
  rastreo_motivo      text,
  rastreo_paginas     integer not null default 0,
  -- El sitio tenía más páginas de las que entran (tope de 60).
  rastreo_truncado    boolean not null default false,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.web_widgets is
  'Chat web: configuración del widget de una agencia (sitio, dominios permitidos, WhatsApp de derivación, secciones a mano, estado del rastreo). Spec 2026-09-16.';

-- ── 2. El sitio rastreado ──
create table if not exists public.web_paginas (
  id           uuid primary key default gen_random_uuid(),
  widget_id    uuid not null references public.web_widgets(id) on delete cascade,
  -- Repetido a propósito: filtrar por agencia sin tener que unir con web_widgets.
  agency_id    uuid not null,

  url          text not null,
  titulo       text not null default '',
  -- El texto visible de la página, hasta 8.000 caracteres. Si la página era más larga, se
  -- parte y cada pedazo es una fila con su `orden` (0, 1, 2…).
  texto        text not null,
  orden        integer not null default 0,

  -- Para buscar por significado. Se llena en el paso siguiente (gemini-embedding-001, 768,
  -- el mismo que usa el Buscador). Queda null hasta entonces y no rompe nada.
  embedding    vector(768),

  -- El director puede sacar una página de la lista sin tener que rastrear de nuevo.
  excluida     boolean not null default false,

  created_at   timestamptz not null default now(),

  -- La misma página, dos veces, no. Si el rastreo vuelve a leerla, pisa la fila.
  unique (widget_id, url, orden)
);

comment on table public.web_paginas is
  'Chat web: el sitio de la agencia leído (título, link y texto por página). Las fichas de propiedades NO entran: esas están en la cartera. Spec 2026-09-16 §3-bis.';

create index if not exists web_paginas_widget_idx on public.web_paginas (widget_id) where not excluida;
create index if not exists web_paginas_agencia_idx on public.web_paginas (agency_id);

-- Sin índice de vectores a propósito: son 60 páginas por agencia como mucho. Recorrerlas
-- todas es más rápido que mantener un índice, y un ivfflat con tan pocas filas da peores
-- resultados. Si algún día una agencia pasa de unos miles, se agrega.

-- ── 3. RLS ──
alter table public.web_widgets enable row level security;
alter table public.web_paginas enable row level security;

-- Ver: los miembros de la agencia. El contenido es el texto público del propio sitio del
-- cliente; lo que importa es que no se cruce entre agencias.
drop policy if exists web_widgets_ver_agencia on public.web_widgets;
create policy web_widgets_ver_agencia on public.web_widgets
  for select to authenticated
  using (agency_id in (select agency_id from public.profiles where id = auth.uid()));

drop policy if exists web_paginas_ver_agencia on public.web_paginas;
create policy web_paginas_ver_agencia on public.web_paginas
  for select to authenticated
  using (agency_id in (select agency_id from public.profiles where id = auth.uid()));

-- Escribir por PostgREST: nadie. La app lo hace con service_role, que se saltea RLS.
-- (`anon` tiene los grants por default de Supabase aunque ninguna política lo nombre; por eso
-- se le retiran explícitamente. Este es el mismo cierre que hizo falta en farming_zonas.)
revoke insert, update, delete on public.web_widgets from authenticated, anon;
revoke insert, update, delete on public.web_paginas from authenticated, anon;

commit;
