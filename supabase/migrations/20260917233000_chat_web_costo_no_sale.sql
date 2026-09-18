-- supabase/migrations/20260917233000_chat_web_costo_no_sale.sql
--
-- Chat web · que el COSTO no se pueda leer desde la agencia (Leonardo, 17/9).
--
-- POR QUÉ HAY UNA SEGUNDA MIGRACIÓN: en la anterior puse
--   revoke select (costo_usd) on ... from authenticated, anon;
-- y NO hizo nada. Postgres no deja sacar el permiso de una columna cuando el permiso está dado
-- sobre la tabla entera: el grant de tabla cubre todas las columnas y el revoke por columna se
-- ignora en silencio. Verificado contra producción después de aplicar: la columna seguía
-- legible. Se hace al revés: se saca el SELECT de la tabla y se devuelve columna por columna,
-- sin `costo_usd`.
--
-- QUÉ NO SE TOCA: ninguna fila, ninguna columna, ninguna política. La bandeja sigue funcionando
-- igual: la app lee con service_role, que conserva todos sus permisos, y los topes de gasto se
-- siguen midiendo exactamente como antes.
--
-- `anon` (el visitante de la web, sin cuenta) no tiene por qué leer NADA de estas dos tablas:
-- entra por el endpoint, nunca por la base. Se le saca el SELECT entero.
--
-- Aplicar por Management API (scripts/sql-produccion.mjs) con el OK de Leonardo.
-- Rollback: supabase/rollback/20260917_chat_web_costo_no_sale_rollback.sql

begin;

revoke select on public.web_conversaciones from authenticated, anon;
revoke select on public.web_mensajes from authenticated, anon;

grant select (
  id, widget_id, agency_id, visitante_id, objetivo, datos, pagina_origen,
  estado, derivada_en, derivada_a, wa_contact_id, mensajes_count,
  created_at, last_message_at
) on public.web_conversaciones to authenticated;

grant select (
  id, conversacion_id, agency_id, rol, texto, pasos, created_at
) on public.web_mensajes to authenticated;

commit;
