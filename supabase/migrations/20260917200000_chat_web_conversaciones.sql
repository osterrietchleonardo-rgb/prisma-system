-- supabase/migrations/20260917200000_chat_web_conversaciones.sql
--
-- Chat web · las conversaciones del sitio y sus mensajes.
-- Spec: docs/superpowers/specs/2026-09-16-chat-web-v1-simple-design.md
--
-- QUÉ NO SE TOCA: nada de lo existente. Ni wa_conversations, ni wa_messages, ni leads, ni
-- contactos. Son dos tablas nuevas que hoy no lee ni escribe nadie. El chat de WhatsApp sigue
-- exactamente igual: esto es otro canal, con su propia bandeja.
--
-- Por qué separadas de wa_conversations: los canales tienen reglas distintas (ventana de 24 h de
-- Meta, plantillas, opt-out) y mezclarlos obliga a poner "si es web…" en cada consulta del bot que
-- hoy funciona. Lo que SÍ se comparte es la persona: cuando el visitante deja su teléfono, se
-- engancha con el contacto que ya existe (`wa_contact_id`), que es la regla de "una persona, una
-- ficha".
--
-- DATOS PERSONALES: acá quedan nombre, teléfono y email de gente que NO es cliente todavía. Por
-- eso: solo los ve su agencia, nadie puede escribir por PostgREST, y se borran a los 90 días (la
-- limpieza se agrega cuando el chat esté andando; la fecha ya queda registrada para poder hacerla).
--
-- Aplicar por Management API (scripts/sql-produccion.mjs) con el OK de Leonardo.
-- Rollback: supabase/rollback/20260917_chat_web_conversaciones_rollback.sql

begin;

create table if not exists public.web_conversaciones (
  id                uuid primary key default gen_random_uuid(),
  widget_id         uuid not null references public.web_widgets(id) on delete cascade,
  agency_id         uuid not null,

  -- Quién es, del lado del navegador. Lo genera el widget y vive en el navegador del visitante:
  -- sirve para que si vuelve mañana, siga la misma conversación y no arranque de cero.
  visitante_id      text not null,

  -- Cuál de los cinco caminos resultó ser (busca_propiedad, vender_propiedad, sumarse_equipo,
  -- consulta_empresa, reclamo). Empieza en null: se sabe recién cuando la persona cuenta algo.
  objetivo          text,
  -- Lo que fue contando: nombre, teléfono, email, zona, presupuesto, detalle.
  datos             jsonb not null default '{}'::jsonb,
  -- Desde qué página del sitio escribió.
  pagina_origen     text,

  estado            text not null default 'abierta'
                    check (estado in ('abierta', 'derivada', 'cerrada')),
  derivada_en       timestamptz,
  -- A qué WhatsApp se mandó (queda el número, para poder auditar a quién le llegó).
  derivada_a        text,

  -- La MISMA persona que en WhatsApp, cuando el teléfono coincide. Sin clave foránea dura a
  -- propósito: si el contacto se borra, la conversación web no tiene que desaparecer.
  wa_contact_id     uuid,

  -- Los topes de la puerta (lib/chat-web/puerta.ts) se miden con estos dos.
  mensajes_count    integer not null default 0,
  costo_usd         numeric(10,5) not null default 0,

  created_at        timestamptz not null default now(),
  last_message_at   timestamptz not null default now()
);

comment on table public.web_conversaciones is
  'Chat web: una conversación del sitio de la agencia. Canal aparte de WhatsApp; la persona se comparte por wa_contact_id. Spec 2026-09-16.';

-- Una sola conversación abierta por visitante y widget: si vuelve, sigue la suya.
create unique index if not exists web_conversaciones_visitante_idx
  on public.web_conversaciones (widget_id, visitante_id);
create index if not exists web_conversaciones_bandeja_idx
  on public.web_conversaciones (agency_id, last_message_at desc);

create table if not exists public.web_mensajes (
  id              uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references public.web_conversaciones(id) on delete cascade,
  agency_id       uuid not null,

  rol             text not null check (rol in ('visitante', 'asistente', 'sistema')),
  texto           text not null,

  -- Qué herramientas usó el asistente para contestar ESTE mensaje, y qué le costó. Es la
  -- trazabilidad: sin esto, cuando algo sale mal no se puede saber por qué contestó lo que
  -- contestó. Es lo mismo que hacemos en el agente de seguimiento.
  pasos           jsonb not null default '[]'::jsonb,
  costo_usd       numeric(10,5) not null default 0,

  created_at      timestamptz not null default now()
);

comment on table public.web_mensajes is
  'Chat web: cada mensaje de una conversación, con las herramientas que usó el asistente y lo que costó. Spec 2026-09-16.';

create index if not exists web_mensajes_conversacion_idx
  on public.web_mensajes (conversacion_id, created_at);

-- ── RLS: cada agencia ve lo suyo; escribir por PostgREST, nadie ──
alter table public.web_conversaciones enable row level security;
alter table public.web_mensajes enable row level security;

drop policy if exists web_conversaciones_ver_agencia on public.web_conversaciones;
create policy web_conversaciones_ver_agencia on public.web_conversaciones
  for select to authenticated
  using (agency_id in (select agency_id from public.profiles where id = auth.uid()));

drop policy if exists web_mensajes_ver_agencia on public.web_mensajes;
create policy web_mensajes_ver_agencia on public.web_mensajes
  for select to authenticated
  using (agency_id in (select agency_id from public.profiles where id = auth.uid()));

-- La app escribe con service_role. `anon` y `authenticated` no necesitan escribir NUNCA acá:
-- el visitante del sitio no tiene cuenta y entra por el endpoint, no por la base.
revoke insert, update, delete, truncate on public.web_conversaciones from authenticated, anon;
revoke insert, update, delete, truncate on public.web_mensajes from authenticated, anon;

commit;
