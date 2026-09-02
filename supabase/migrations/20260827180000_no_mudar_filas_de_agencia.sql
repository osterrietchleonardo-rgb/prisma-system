-- ─────────────────────────────────────────────────────────────
-- SEGURIDAD (menor): una fila propia no se puede mudar a otra inmobiliaria.
--
-- Sale de auditar las 120 políticas contra producción buscando el mismo patrón
-- que el agujero de `Profiles: update_self`. El resultado principal fue bueno:
-- NO hay un segundo caso de escalada de privilegios. Pero aparecieron tres
-- tablas con `agency_id` cuya política de escritura solo dice "la fila es tuya"
-- y no dice nada de la agencia.
--
-- Medido: un asesor movió una visita SUYA a otra inmobiliaria y pasó. No expone
-- datos ajenos -- la fila es de él -- pero se la mete en la agenda de otra
-- inmobiliaria. Es inyección de ruido, no fuga.
--
-- Las 30 políticas que salieron en el primer barrido como "escritura sin
-- WITH CHECK" son en su mayoría FALSAS ALARMAS: Postgres deriva el check del
-- USING, y en casi todas el USING ya mira la agencia. El caso de `profiles` era
-- distinto porque su USING (auth.uid() = id) fija QUÉ FILA, y las columnas que
-- deciden la autoridad eran justo las editables.
--
-- Verificado antes de escribir: scheduled_visits tiene 22 filas, 0 que no
-- cumplan, 0 sin agente. Las otras dos no tienen filas en riesgo.
--
-- Se permite `agency_id IS NULL` a propósito: la columna es nullable en las
-- tres y hay filas viejas así. Poner la fila propia en NULL solo la esconde de
-- uno mismo; no toca a nadie más.
-- ─────────────────────────────────────────────────────────────

-- La agencia del que está pidiendo. Ahora es confiable: desde
-- 20260827160000 nadie puede cambiarse el agency_id desde su sesión.
CREATE OR REPLACE FUNCTION public.mi_agencia()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT p.agency_id FROM public.profiles p WHERE p.id = auth.uid() $$;

-- ── Visitas agendadas ────────────────────────────────────────
DROP POLICY IF EXISTS "Agents can update their own visits" ON public.scheduled_visits;
CREATE POLICY "Agents can update their own visits"
  ON public.scheduled_visits FOR UPDATE
  USING (agent_id = auth.uid())
  WITH CHECK (agent_id = auth.uid()
              AND (agency_id IS NULL OR agency_id = public.mi_agencia()));

DROP POLICY IF EXISTS "Agents can insert their own visits" ON public.scheduled_visits;
CREATE POLICY "Agents can insert their own visits"
  ON public.scheduled_visits FOR INSERT
  WITH CHECK (agent_id = auth.uid()
              AND (agency_id IS NULL OR agency_id = public.mi_agencia()));

-- ── Sesiones del consultor ───────────────────────────────────
DROP POLICY IF EXISTS "Users can update their own consultor sessions" ON public.consultor_chat_sessions;
CREATE POLICY "Users can update their own consultor sessions"
  ON public.consultor_chat_sessions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id
              AND (agency_id IS NULL OR agency_id = public.mi_agencia()));

DROP POLICY IF EXISTS "Users can insert their own consultor sessions" ON public.consultor_chat_sessions;
CREATE POLICY "Users can insert their own consultor sessions"
  ON public.consultor_chat_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id
              AND (agency_id IS NULL OR agency_id = public.mi_agencia()));

-- ── Sesiones del tutor ───────────────────────────────────────
DROP POLICY IF EXISTS "Users can manage their own tutor sessions" ON public.tutor_chat_sessions;
CREATE POLICY "Users can manage their own tutor sessions"
  ON public.tutor_chat_sessions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id
              AND (agency_id IS NULL OR agency_id = public.mi_agencia()));

COMMENT ON FUNCTION public.mi_agencia()
  IS 'La inmobiliaria del usuario que está pidiendo. Confiable desde que el agency_id quedó congelado (20260827160000).';
