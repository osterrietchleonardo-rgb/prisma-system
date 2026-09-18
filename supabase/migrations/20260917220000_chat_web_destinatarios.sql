-- supabase/migrations/20260917220000_chat_web_destinatarios.sql
--
-- Chat web · a quién le llegan los leads: también por email, y la persona del equipo por lista.
-- Pedido de Leonardo (17/9).
--
-- QUÉ NO SE TOCA: ninguna tabla existente, ninguna fila. Son DOS COLUMNAS NUEVAS en
-- `web_widgets`, la tabla del chat web que creamos ayer y que todavía no usa nadie más. Las dos
-- nacen vacías y nada deja de funcionar si quedan vacías.
--
-- Por qué:
-- 1. `email_destino`: hoy el lead solo podía ir por WhatsApp. El email es el canal que no
--    depende de que Meta apruebe una plantilla, así que es el que va a funcionar primero.
-- 2. `perfil_equipo_id`: antes, para mandar los "quiero sumarme al equipo" a otra persona había
--    que escribir su número a mano. Si esa persona ya está en PRISMA, pedirle el número al
--    director es pedirle un error de tipeo: se elige de una lista y el sistema ya sabe su
--    celular y su email.
--
-- Aplicar por Management API (scripts/sql-produccion.mjs) con el OK de Leonardo.
-- Rollback: supabase/rollback/20260917_chat_web_destinatarios_rollback.sql

begin;

alter table public.web_widgets
  add column if not exists email_destino text,
  -- Sin clave foránea dura a propósito: si el asesor se desvincula, el widget no tiene que
  -- romperse; el endpoint mira que siga activo antes de usarlo.
  add column if not exists perfil_equipo_id uuid;

comment on column public.web_widgets.email_destino is
  'Email que recibe los leads del chat web. El canal que no depende de Meta.';
comment on column public.web_widgets.perfil_equipo_id is
  'Persona de PRISMA que recibe los "quiero sumarme al equipo". Se elige de una lista: el sistema ya sabe su celular y su email.';

commit;
