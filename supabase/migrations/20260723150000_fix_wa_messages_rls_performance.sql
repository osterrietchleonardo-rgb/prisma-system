-- ==========================================================================
-- wa_messages: mismo problema de RLS por fila que wa_conversations
-- ==========================================================================
--
-- Continuacion de 20260723130000_fix_wa_conversations_rls_performance.sql.
--
-- La policy anterior tenia el antipatron al cuadrado: un EXISTS contra
-- profiles que a su vez contenia otro EXISTS contra wa_conversations, todo
-- correlacionado con la fila de wa_messages. Postgres lo re-ejecutaba una vez
-- por mensaje.
--
-- Donde se notaba: NO al abrir un chat (esa consulta filtra por
-- conversation_id y siempre fue barata), sino en el DASHBOARD. La consulta de
-- "Response Time Analytics" (lib/queries/dashboard.ts:334) recorre todos los
-- mensajes de la agencia con un join lateral a wa_conversations, sin filtrar
-- por conversacion. Medido en produccion, para un asesor:
--
--   antes del fix de wa_conversations ......... ~6.100 ms (pg_stat_statements)
--   despues de aquel fix, antes de este ....... 669 a 896 ms
--   con este fix .............................. 5,3 a 5,5 ms
--
-- Para el director pasa de 64 ms a 48 ms (nunca fue el caso malo: la rama
-- 'director' corta antes por el OR y no evalua el EXISTS).
--
-- Equivalencia verificada antes de aplicar, igual que en la migracion
-- anterior: se compararon los pares (usuario, mensaje) visibles con la logica
-- vieja y con la nueva sobre TODOS los perfiles y TODOS los mensajes:
--   19.315 pares con la vieja, 19.315 con la nueva, 0 diferencias en ambos
--   sentidos. Nadie gana ni pierde acceso a ningun mensaje.
-- ==========================================================================

DROP POLICY IF EXISTS "wa_messages_access_policy" ON wa_messages;

CREATE POLICY "wa_messages_access_policy" ON wa_messages
FOR ALL
TO authenticated
USING (
  -- Solo mensajes de mi agencia...
  agency_id = (SELECT get_my_agency_id())
  AND (
    -- ...y de ahi: el director ve todos, el asesor solo los de sus chats.
    (SELECT get_my_role()) = 'director'
    OR EXISTS (
      SELECT 1 FROM wa_conversations c
      WHERE c.id = wa_messages.conversation_id
        AND c.agent_id = (SELECT auth.uid())
    )
  )
);

-- Todas las lecturas de mensajes de la app filtran por conversation_id y
-- ordenan por created_at (components/whatsapp/ActiveChat.tsx). No habia
-- ningun indice por conversation_id: solo la PK por id y el unique por wamid.
CREATE INDEX IF NOT EXISTS idx_wa_messages_conv_created
  ON wa_messages (conversation_id, created_at DESC);

-- NOTA: se probo tambien un indice (agency_id, created_at) para la consulta
-- del dashboard y se descarto: medido, empeoraba las dos consultas (abrir un
-- chat pasaba de 1,6 ms a 6,9 ms) porque el planner lo elegia en lugar del de
-- conversacion. Un indice de mas no es gratis.

ANALYZE wa_messages;
