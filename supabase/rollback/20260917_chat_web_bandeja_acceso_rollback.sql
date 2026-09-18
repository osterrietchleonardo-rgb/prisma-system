-- supabase/rollback/20260917_chat_web_bandeja_acceso_rollback.sql
--
-- Vuelve a las políticas anteriores: cualquier miembro de la agencia puede LEER las
-- conversaciones del chat web. Ojo: eso abre los datos de contacto a todo el equipo.

begin;

drop policy if exists web_conversaciones_ver_bandeja on public.web_conversaciones;
create policy web_conversaciones_ver_agencia on public.web_conversaciones
  for select to authenticated
  using (agency_id in (select agency_id from public.profiles where id = auth.uid()));

drop policy if exists web_mensajes_ver_bandeja on public.web_mensajes;
create policy web_mensajes_ver_agencia on public.web_mensajes
  for select to authenticated
  using (agency_id in (select agency_id from public.profiles where id = auth.uid()));

grant select (costo_usd) on public.web_conversaciones to authenticated, anon;
grant select (costo_usd) on public.web_mensajes to authenticated, anon;

commit;
