-- ═══════════════════════════════════════════════════════════════════════════════
-- SUPER AGENTE DE SEGUIMIENTO — FASE 1
-- Plan: docs/superpowers/plans/2026-08-22-super-agente-v4.md (Task 3)
-- TODO ADITIVO: solo CREATE. Rollback = DROP de lo creado. Cero ALTER de tablas
-- existentes. Se aplica por Management API (las migraciones del repo NO corren solas).
-- Aplicada el 24/8/2026 con OK de Leonardo.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══ Config por agencia: la personalización es data ═══
create table if not exists seguimiento_config (
  agency_id              uuid primary key,
  modo                   text not null default 'apagado'
                         check (modo in ('apagado','sombra','activo')),
  silencio_minimo_horas  int  not null default 20,
  max_intentos           int  not null default 3,
  max_mensajes_dia       int  not null default 50,   -- presupuesto diario por agencia
  escalamiento_horas     int  not null default 2,    -- espera antes de avisar al director
  max_escalamientos_dia  int  not null default 3,
  llamadas_habilitadas   boolean not null default false,  -- habilitación L (futuro)
  creado_en              timestamptz default now(),
  actualizado_en         timestamptz default now()
);

-- ═══ Toda decisión del agente queda registrada ═══
create table if not exists seguimiento_decisiones (
  id               uuid primary key default gen_random_uuid(),
  agency_id        uuid not null,
  conversation_id  uuid not null,
  modo             text not null check (modo in ('sombra','activo')),
  canal            text not null default 'whatsapp'
                   check (canal in ('whatsapp','email','llamada','interno')),
  accion           text not null check (accion in ('contactar','posponer','abandonar','escalar')),
  plantilla        text,
  frase_cierre     text,
  proximo_intento_horas int,
  razon            text not null,          -- en castellano, la ve el asesor
  confianza        numeric(3,2) not null,
  score            int not null default 0,
  contexto_snapshot jsonb not null default '{}',  -- el trace: pasos + tokens + metricas
  decision_cruda   jsonb not null default '{}',   -- salida literal del agente (incluye evidencia)
  ejecutada        boolean not null default false,
  resultado        text,                   -- enviada | bloqueada_<motivo> | error_<detalle>
  costo_usd        numeric(10,6),
  creado_en        timestamptz default now()
);
create index if not exists seguimiento_decisiones_conv_idx
  on seguimiento_decisiones (conversation_id, creado_en desc);
create index if not exists seguimiento_decisiones_agencia_idx
  on seguimiento_decisiones (agency_id, creado_en desc);

-- ═══ Compromisos: lo que el sistema persigue (la pieza más valiosa) ═══
create table if not exists compromisos (
  id               uuid primary key default gen_random_uuid(),
  agency_id        uuid not null,
  conversation_id  uuid not null,
  tipo             text not null check (tipo in
                   ('visita_agendada','respuesta_pendiente','documentacion_pendiente',
                    'envio_prometido','llamada_prometida')),
  descripcion      text not null,
  asumido_por      text not null check (asumido_por in ('lead','asesor','agente')),
  vence_en         timestamptz,
  estado           text not null default 'activo'
                   check (estado in ('activo','cumplido','vencido','cancelado')),
  origen           text,                   -- decision_id o 'visita' o 'manual'
  metadata         jsonb default '{}',
  creado_en        timestamptz default now(),
  cerrado_en       timestamptz
);
create index if not exists compromisos_conv_idx on compromisos (conversation_id, estado);
create index if not exists compromisos_agencia_idx on compromisos (agency_id, estado, vence_en);

-- ═══ Línea de tiempo por lead: la columna vertebral de la memoria unificada ═══
create table if not exists lead_eventos (
  id               bigserial primary key,
  agency_id        uuid not null,
  conversation_id  uuid not null,
  tipo             text not null,
  -- decision | envio | envio_bloqueado | compromiso_creado | compromiso_cerrado
  -- escalamiento | cambio_estado | error
  actor            text not null default 'agente_seguimiento',
  descripcion      text not null,          -- en castellano, legible
  datos            jsonb default '{}',
  ts               timestamptz default now()
);
create index if not exists lead_eventos_conv_idx on lead_eventos (conversation_id, ts desc);
create index if not exists lead_eventos_agencia_idx on lead_eventos (agency_id, tipo, ts desc);

-- ═══ RLS: mismo patrón verificado de wa_conversations (24/8): el director ve toda su
--     agencia; el asesor solo sus conversaciones (wa_conversations.agent_id). El service
--     role (runner) bypassa RLS; estas policies son para la ficha en el navegador. ═══
alter table seguimiento_config     enable row level security;
alter table seguimiento_decisiones enable row level security;
alter table compromisos            enable row level security;
alter table lead_eventos           enable row level security;

create policy seguimiento_config_select on seguimiento_config for select
  using (agency_id = get_my_agency_id());

create policy seguimiento_decisiones_select on seguimiento_decisiones for select
  using (agency_id = get_my_agency_id() and (get_my_role() = 'director'
    or exists (select 1 from wa_conversations wc
               where wc.id = conversation_id and wc.agent_id = auth.uid())));

create policy compromisos_select on compromisos for select
  using (agency_id = get_my_agency_id() and (get_my_role() = 'director'
    or exists (select 1 from wa_conversations wc
               where wc.id = conversation_id and wc.agent_id = auth.uid())));

create policy lead_eventos_select on lead_eventos for select
  using (agency_id = get_my_agency_id() and (get_my_role() = 'director'
    or exists (select 1 from wa_conversations wc
               where wc.id = conversation_id and wc.agent_id = auth.uid())));

-- ═══ Capa 1: elegibilidad en SQL puro ═══
create or replace function seguimiento_candidatos(p_limit int default 40)
returns setof wa_conversations
language sql stable as $$
  select wc.*
  from wa_conversations wc
  join whatsapp_instances wi on wi.agency_id = wc.agency_id
  join seguimiento_config  sc on sc.agency_id = wc.agency_id
  where sc.modo in ('sombra','activo')
    and wc.requires_follow_up = true
    and wc.opt_out = false
    and wc.bot_active = true                          -- humano al mando => afuera
    and wc.next_follow_up_at <= now()
    and wc.funnel_status not in ('closed_won','closed_lost','snoozed')
    and wc.visit_status not in ('scheduled','confirmed')
    -- SOLO el nombre de metricas (decisión 24/8): sin él no hay plantilla, y el nombre
    -- del perfil de WhatsApp NO se usa jamás. Los sin-nombre son mayormente del envío
    -- masivo de reclutamiento, no leads de propiedades.
    and coalesce(btrim(wc.metricas->>'nombre'),'') <> ''
    and wi.flows_active = true
    and wi.templates_status = 'approved'
    -- regla de silencio: si hubo CUALQUIER mensaje hace menos de
    -- silencio_minimo_horas, la conversación está viva y acá no se toca nada
    and (wc.last_message_at is null
         or wc.last_message_at < now() - make_interval(hours => sc.silencio_minimo_horas))
    and wc.follow_ups_sent < sc.max_intentos
  order by wc.next_follow_up_at asc
  limit p_limit
$$;

-- ═══ Escalamiento: leads con humano a cargo que nadie atiende (versión mínima) ═══
create or replace function seguimiento_esperando_humano(p_horas int default 2)
returns setof wa_conversations
language sql stable as $$
  select wc.*
  from wa_conversations wc
  join seguimiento_config sc on sc.agency_id = wc.agency_id
  where sc.modo = 'activo'
    and wc.bot_active = false                          -- hubo handoff a humano
    and wc.opt_out = false
    and wc.last_message_at < now() - make_interval(hours => p_horas)
    -- el filtro "último mensaje es del LEAD" (role='lead', verificado 24/8) se
    -- completa en código (escalamiento.ts) con una consulta a wa_messages por caso
$$;

-- ═══ Visitas auto-realizadas (portado del nodo viejo Auto_Realizada; columnas
--     verificadas 24/8 en scheduled_visits) ═══
create or replace function seguimiento_marcar_visitas_realizadas() returns void
language sql as $$
  update public.scheduled_visits set estado_visita = 'realizada'
  where estado_visita = 'confirmada'
    and (fecha_visita + hora_visita) at time zone 'America/Argentina/Buenos_Aires' < now();
$$;

-- Filas iniciales: LAS DOS agencias en sombra (decisión 24/8; sombra no envía nada)
insert into seguimiento_config (agency_id, modo) values
  ('57c6134b-89dc-4968-bd1a-27364cf99195', 'sombra'),  -- PRISMAIA - VAKDOR
  ('4962bf85-a92c-4c33-ba07-380686bbab76', 'sombra')   -- Central Real Estate (SOLO sombra)
on conflict (agency_id) do nothing;
