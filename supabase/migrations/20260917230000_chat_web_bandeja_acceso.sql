-- supabase/migrations/20260917230000_chat_web_bandeja_acceso.sql
--
-- Chat web · quién puede VER las conversaciones: el director, y el asesor que el director eligió.
-- Regla de Leonardo (17/9).
--
-- QUÉ NO SE TOCA: ninguna tabla, ninguna fila, ninguna columna. Solo se reemplazan las dos
-- políticas de LECTURA de `web_conversaciones` y `web_mensajes`, que hoy dejan mirar a cualquier
-- miembro de la agencia. Nadie está usando todavía esas tablas, así que no hay nada que romper.
--
-- Por qué importa: ahí adentro hay nombres, teléfonos y emails de gente que entró a la web de la
-- inmobiliaria y todavía no es cliente de nadie. Que todo el equipo los pueda mirar —y llamar—
-- es exactamente lo que no queremos.
--
-- La misma regla está en el código (lib/chat-web/acceso.ts), que es por donde entra la app. Esta
-- es la red de abajo, para quien entre por PostgREST directo.
--
-- Aplicar por Management API (scripts/sql-produccion.mjs) con el OK de Leonardo.
-- Rollback: supabase/rollback/20260917_chat_web_bandeja_acceso_rollback.sql

begin;

drop policy if exists web_conversaciones_ver_agencia on public.web_conversaciones;
create policy web_conversaciones_ver_bandeja on public.web_conversaciones
  for select to authenticated
  using (
    -- El director de esa agencia ve todas.
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.agency_id = web_conversaciones.agency_id
        and p.role = 'director'
    )
    -- El asesor elegido en el desplegable ve SOLO los "quiero sumarme al equipo", que es
    -- justamente para lo que lo eligieron.
    or (
      web_conversaciones.objetivo = 'sumarse_equipo'
      and exists (
        select 1
        from public.web_widgets w
        join public.profiles p on p.id = auth.uid()
        where w.id = web_conversaciones.widget_id
          and w.perfil_equipo_id = auth.uid()
          and p.agency_id = web_conversaciones.agency_id
      )
    )
  );

drop policy if exists web_mensajes_ver_agencia on public.web_mensajes;
create policy web_mensajes_ver_bandeja on public.web_mensajes
  for select to authenticated
  using (
    exists (
      select 1 from public.web_conversaciones c
      where c.id = web_mensajes.conversacion_id
        and (
          exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.agency_id = c.agency_id and p.role = 'director'
          )
          or (
            c.objetivo = 'sumarse_equipo'
            and exists (
              select 1
              from public.web_widgets w
              join public.profiles p on p.id = auth.uid()
              where w.id = c.widget_id
                and w.perfil_equipo_id = auth.uid()
                and p.agency_id = c.agency_id
            )
          )
        )
    )
  );

-- Y el COSTO no se ve desde la agencia (Leonardo, 17/9): es un dato nuestro. Sacarlo de la
-- pantalla no alcanza, porque la fila se puede leer por PostgREST; se cierra la columna.
-- `service_role` (la app) conserva todo: los topes de gasto se siguen midiendo igual.
revoke select (costo_usd) on public.web_conversaciones from authenticated, anon;
revoke select (costo_usd) on public.web_mensajes from authenticated, anon;

commit;
