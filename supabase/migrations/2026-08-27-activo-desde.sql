-- ═══════════════════════════════════════════════════════════════════════════════
-- SUPER AGENTE — "el reloj arranca el día que se enciende" (decisión de Leonardo, 27/8/2026)
-- Aditivo: una columna nueva en seguimiento_config y la función de candidatos que la respeta.
-- Rollback: alter table seguimiento_config drop column activo_desde; y volver a la versión
-- anterior de seguimiento_candidatos (migración 2026-08-24-super-agente-fase1.sql).
-- ═══════════════════════════════════════════════════════════════════════════════

-- Desde cuándo está encendida la agencia. Todo lo anterior a esta fecha no se persigue:
-- ni seguimientos al cliente ni escalera al equipo. Reactivar el backlog es una decisión aparte.
alter table seguimiento_config add column if not exists activo_desde timestamptz;
comment on column seguimiento_config.activo_desde is
  'Momento del encendido. Solo cuentan conversaciones con movimiento posterior (decisión 27/8/2026).';

-- Capa 1: mismos filtros de siempre + el corte por activo_desde
create or replace function seguimiento_candidatos(p_limit int default 40)
returns setof wa_conversations
language sql stable as $$
  select wc.*
  from wa_conversations wc
  join whatsapp_instances wi on wi.agency_id = wc.agency_id
  join seguimiento_config  sc on sc.agency_id = wc.agency_id
  where sc.modo in ('sombra','activo')
    and wc.requires_follow_up = true
    and wc.opt_out = false
    and wc.bot_active = true
    and wc.next_follow_up_at <= now()
    and wc.funnel_status not in ('closed_won','closed_lost','snoozed')
    and wc.visit_status not in ('scheduled','confirmed')
    and coalesce(btrim(wc.metricas->>'nombre'),'') <> ''
    and wi.flows_active = true
    and wi.templates_status = 'approved'
    and (wc.last_message_at is null
         or wc.last_message_at < now() - make_interval(hours => sc.silencio_minimo_horas))
    and wc.follow_ups_sent < sc.max_intentos
    -- el reloj arranca el día del encendido: lo anterior no se persigue
    and (sc.activo_desde is null or wc.last_message_at >= sc.activo_desde)
  order by wc.next_follow_up_at asc
  limit p_limit
$$;
