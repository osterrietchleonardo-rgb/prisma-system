-- ============================================================================
-- escalera_casos: el estado de todos los casos de la escalera en UN viaje.
--
-- El problema (14/9): la escalera del Super Agente (lib/seguimiento/escalamiento.ts)
-- hacía, por cada conversación que espera a un humano, 3 consultas una atrás de la otra
-- (último mensaje del lead, si hubo humano después, niveles ya mandados) más las de la
-- nota y la despedida. Con 72 casos esperando tardaba 107 s y el reloj de n8n la cortaba
-- a los 120 (5 corridas fallidas el 14/9, 14-17 por día entre el 8 y el 10/9).
--
-- Esta función devuelve, para una lista de conversaciones, lo que esas 3 consultas
-- traían, calculado en la base: t0 (el último mensaje del LEAD), si un humano escribió
-- después, si el asesor dejó una nota interna real después, y los niveles de escalera ya
-- mandados PARA ESE t0. El código sigue decidiendo igual que antes con esos datos.
--
-- Qué NO toca: ninguna tabla, ninguna fila, ninguna política de RLS. Solo lectura
-- (STABLE). La llama el service role desde la ruta /api/seguimiento/run.
-- ============================================================================

create or replace function escalera_casos(p_ids uuid[], p_desde timestamptz)
returns table (
  conversation_id uuid,
  t0 timestamptz,
  humano_despues boolean,
  nota_despues boolean,
  niveles int[]
)
language sql stable as $$
  with ult as (
    select m.conversation_id, max(m.created_at) as t0
    from wa_messages m
    where m.conversation_id = any(p_ids) and m.role = 'lead'
    group by m.conversation_id
  )
  select
    u.conversation_id,
    u.t0,
    exists (
      select 1 from wa_messages h
      where h.conversation_id = u.conversation_id and h.role = 'human' and h.created_at > u.t0
    ) as humano_despues,
    -- la nota REAL del asesor: el marcador "⚠️ Handoff activado" lo escribe el sistema
    exists (
      select 1 from wa_messages n
      where n.conversation_id = u.conversation_id and n.role = 'internal'
        and n.created_at > u.t0 and n.content not like '⚠️ Handoff activado%'
    ) as nota_despues,
    coalesce((
      select array_agg(distinct (e.datos->>'nivel')::int)
      from lead_eventos e
      where e.conversation_id = u.conversation_id
        and e.tipo in ('escalera', 'escalera_simulada')
        and e.datos ? 't0' and e.datos ? 'nivel'
        and (e.datos->>'t0')::timestamptz = u.t0
    ), '{}'::int[]) as niveles
  from ult u
  where u.t0 >= p_desde
$$;
