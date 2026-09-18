-- supabase/migrations/20260918100000_chat_web_freno_por_ip.sql
--
-- Chat web · el freno por conexión (Leonardo, 17/9: "hay que ver el freno por IP, es importante").
--
-- QUÉ NO SE TOCA: ninguna tabla existente, ninguna fila, ninguna política. Es UNA COLUMNA NUEVA
-- en `web_mensajes` —la tabla del chat web, que todavía no usa nadie más— y su índice.
--
-- Por qué hace falta: los topes que ya están se miden POR CONVERSACIÓN, y una conversación la
-- abre cualquiera (basta con borrar lo que el navegador guardó). Contra un bucle, eso no alcanza.
-- La conexión sí es difícil de cambiar, así que se cuenta por ahí: 60 mensajes cada 10 minutos.
--
-- **La IP NO se guarda.** Se guarda una huella irreversible: la IP mezclada con un secreto
-- nuestro y pasada por una función de una sola dirección. Sirve para contar y para nada más. Si
-- alguien se llevara la base, no se lleva las IP de los visitantes de nuestros clientes.
--
-- Sin Upstash no hay dónde llevar la cuenta en memoria; contra la base es una consulta más por
-- mensaje, sobre un índice, en una tabla chica. Cuando haya Upstash, esto se puede sacar.
--
-- Aplicar por Management API (scripts/sql-produccion.mjs) con el OK de Leonardo.
-- Rollback: supabase/rollback/20260918_chat_web_freno_por_ip_rollback.sql

begin;

alter table public.web_mensajes
  add column if not exists ip_huella text;

comment on column public.web_mensajes.ip_huella is
  'Huella irreversible de la conexión (NO la IP), solo para frenar abuso: 60 mensajes cada 10 minutos.';

-- El índice es lo que hace que contar sea barato: se pregunta siempre por huella + fecha.
create index if not exists web_mensajes_freno_idx
  on public.web_mensajes (ip_huella, created_at desc)
  where ip_huella is not null;

-- La huella no la ve la agencia: no le sirve para nada y es un dato de sus visitantes.
-- (Las columnas legibles se enumeran, como en 20260917233000: un grant de tabla taparía esto.)
revoke select on public.web_mensajes from authenticated, anon;
grant select (
  id, conversacion_id, agency_id, rol, texto, pasos, created_at
) on public.web_mensajes to authenticated;

commit;
