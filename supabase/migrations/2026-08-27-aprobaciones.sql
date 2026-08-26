-- ═══════════════════════════════════════════════════════════════════════════════
-- APROBACIONES CONSUME-ONCE (plan V4 §III.2.8.3) — primera pieza de la fase 2
-- TODO ADITIVO: solo CREATE. Rollback = DROP TABLE aprobaciones. Cero ALTER.
-- Se aplica por Management API (las migraciones del repo NO corren solas).
-- ═══════════════════════════════════════════════════════════════════════════════

-- El mecanismo ÚNICO de aprobación humana: se guarda la ACCIÓN EXACTA a ejecutar; al
-- aprobar, el sistema re-ejecuta eso server-side. Una aprobación se consume una sola vez.
-- Fail-closed: sin respuesta, no se ejecuta nada.
create table if not exists aprobaciones (
  id              uuid primary key default gen_random_uuid(),
  agency_id       uuid not null,
  conversation_id uuid,
  tipo            text not null,            -- 'reasignar' | 'plantilla_nueva' | ...
  solicitada_por  text not null,            -- 'asesor:<id>' | 'agente_seguimiento' | 'escalera'
  accion          jsonb not null,           -- la llamada exacta a re-ejecutar al aprobar
  aprobador       text not null default 'director',  -- 'director' | 'asesor:<id>'
  justificacion   text not null,            -- la lee el humano
  estado          text not null default 'pendiente'
                  check (estado in ('pendiente','aprobada','rechazada','vencida')),
  decision        jsonb,                    -- qué eligió el humano (p.ej. a quién reasignó)
  decidida_por    uuid,
  decidida_en     timestamptz,
  consumida       boolean not null default false,
  vence_en        timestamptz,
  creado_en       timestamptz not null default now()
);
create index if not exists aprobaciones_agencia_estado_idx
  on aprobaciones (agency_id, estado, creado_en desc);
create index if not exists aprobaciones_conv_idx
  on aprobaciones (conversation_id, estado);

-- RLS: el director de la agencia LEE (la pantalla /director/aprobaciones). Toda escritura
-- la hace el servidor (service role) desde las server actions, después de verificar el rol.
alter table aprobaciones enable row level security;
create policy aprobaciones_select_director on aprobaciones for select
  using (agency_id = get_my_agency_id() and get_my_role() = 'director');
