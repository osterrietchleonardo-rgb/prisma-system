-- Índices para el Dashboard del director (15/9/2026).
--
-- El Dashboard filtra por inmobiliaria y período en tres tablas y ninguna tenía un índice para
-- eso: cada consulta recorría la tabla entera. Hoy son chicas (22 mil mensajes, 11 mil leads),
-- pero el rol authenticated tiene un tope de 8 s por consulta y un período largo podía cortarse.
--
-- CONCURRENTLY: se construyen sin trabar las escrituras (el bot escribe mensajes todo el tiempo).
-- No puede ir dentro de una transacción: cada sentencia se aplica sola.
-- Deshacer: DROP INDEX CONCURRENTLY IF EXISTS <nombre>; (no cambia ningún dato).

create index concurrently if not exists wa_conversations_agency_created_idx
  on public.wa_conversations (agency_id, created_at);

create index concurrently if not exists wa_messages_agency_created_idx
  on public.wa_messages (agency_id, created_at);

create index concurrently if not exists leads_agency_tokko_created_idx
  on public.leads (agency_id, tokko_created_date);
