-- ═══════════════════════════════════════════════════════════════════════════════
-- SUPER AGENTE — interacciones_canal (fase 2, adelantada para el gate de internos, Task 12e P2)
-- Plan: docs/superpowers/plans/2026-08-22-super-agente-v4.md (§III.2.2)
-- ADITIVO: solo CREATE. Rollback = DROP TABLE interacciones_canal.
-- Toda interacción por canales no-WhatsApp-de-lead (email, llamadas) y los mensajes INTERNOS
-- del equipo por WhatsApp. NUNCA se mezcla con wa_messages (que es de leads y de producción).
-- ═══════════════════════════════════════════════════════════════════════════════
create table if not exists interacciones_canal (
  id               uuid primary key default gen_random_uuid(),
  agency_id        uuid not null,
  conversation_id  uuid,                  -- null si el destinatario es asesor/director
  destinatario     text not null check (destinatario in ('lead','asesor','director')),
  destinatario_ref text not null,         -- profiles.id, teléfono o email según el caso
  canal            text not null check (canal in ('email','llamada','whatsapp','interno')),
  direccion        text not null check (direccion in ('salida','entrada')),
  asunto           text,
  contenido        text not null,         -- cuerpo del email, transcript de la llamada o texto del WhatsApp
  wamid            text,                  -- id del mensaje de WhatsApp (dedupe de reenvíos del webhook)
  metadata         jsonb default '{}',    -- message-id, retell_call_id, teléfono, etc.
  ts               timestamptz default now()
);
create index if not exists interacciones_canal_conv_idx on interacciones_canal (conversation_id, ts desc);
create index if not exists interacciones_canal_dest_idx on interacciones_canal (agency_id, destinatario, ts desc);
create unique index if not exists interacciones_canal_wamid_idx on interacciones_canal (wamid) where wamid is not null;

alter table interacciones_canal enable row level security;
create policy interacciones_canal_select on interacciones_canal for select
  using (agency_id = get_my_agency_id() and (get_my_role() = 'director'
    or destinatario_ref = auth.uid()::text
    or exists (select 1 from wa_conversations wc
               where wc.id = conversation_id and wc.agent_id = auth.uid())));
