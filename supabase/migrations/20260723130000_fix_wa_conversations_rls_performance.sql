-- ==========================================================================
-- Bandeja WhatsApp: la lista de conversaciones daba "statement timeout"
-- ==========================================================================
--
-- Sintoma: los asesores veian "canceling statement due to statement timeout"
-- en lugar de la lista de conversaciones (reportado por marianan@maxre.com.ar
-- el 23/07/2026).
--
-- Causa: la policy anterior usaba un EXISTS correlacionado contra profiles.
-- Al depender de wa_conversations.agency_id y .agent_id, Postgres no podia
-- cachear el subquery y lo re-ejecutaba UNA VEZ POR FILA: 1.436 ejecuciones
-- por cada carga de la bandeja, con seq scan sobre profiles en cada una.
-- Medido con EXPLAIN ANALYZE en produccion (22/07):
--   asesor sin conversaciones asignadas .... 2.396 ms
--   asesor con 17 conversaciones ........... 1.457 ms
--   director ...............................    37 ms
-- Con statement_timeout=8s en el rol authenticated y la pantalla refrescando
-- cada 5 segundos, pg_stat_statements mostraba ejecuciones de 7.997 ms:
-- es decir, consultas ya canceladas por timeout.
--
-- Arreglo: reescribir la condicion sin subquery correlacionado, usando las
-- funciones helper get_my_agency_id() / get_my_role() que ya existen y que ya
-- usa la policy de profiles. Envueltas en (SELECT ...) para que el planner las
-- evalue una sola vez (InitPlan) en lugar de por fila.
--
-- Equivalencia verificada antes de aplicar: se compararon los pares
-- (usuario, conversacion) visibles con la logica vieja y con la nueva sobre
-- TODOS los perfiles y TODAS las conversaciones de la base:
--   5.864 pares con la vieja, 5.864 con la nueva, 0 diferencias en ambos
--   sentidos. Nadie gana ni pierde acceso a nada.
--
-- Resultado medido (misma consulta, transaccion revertida):
--   asesor sin conversaciones .... 2.396 ms -> 1,6 ms
--   asesor con 17 ................ 1.457 ms -> 1,6 ms
--   director .....................    37 ms -> 2,8 ms
-- ==========================================================================

DROP POLICY IF EXISTS "wa_conversations_access_policy" ON wa_conversations;

CREATE POLICY "wa_conversations_access_policy" ON wa_conversations
FOR ALL
TO authenticated
USING (
  -- Solo conversaciones de mi agencia...
  agency_id = (SELECT get_my_agency_id())
  AND (
    -- ...y de ahi: el director ve todas, el asesor solo las suyas.
    (SELECT get_my_role()) = 'director'
    OR agent_id = (SELECT auth.uid())
  )
);

-- La bandeja filtra por instance_id y ordena por last_message_at desc.
-- Sin este indice la tabla se escanea entera en cada refresco.
CREATE INDEX IF NOT EXISTS idx_wa_conv_instance_last_msg
  ON wa_conversations (instance_id, last_message_at DESC);

-- Ahora que la policy compara agent_id directamente (sin subquery), este
-- indice si es aprovechable para filtrar las conversaciones del asesor.
CREATE INDEX IF NOT EXISTS idx_wa_conv_agent
  ON wa_conversations (agent_id);

ANALYZE wa_conversations;
