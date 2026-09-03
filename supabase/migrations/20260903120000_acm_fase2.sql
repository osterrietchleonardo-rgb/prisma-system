-- ACM FASE 2 (3-sep-2026): el checklist aprovecha la riqueza de mercado_avisos.
-- Spec: docs/superpowers/specs/2026-09-02-acm-checklist-fase2-design.md
-- Plan: docs/superpowers/plans/2026-09-03-acm-checklist-fase2.md
--
-- Secciones: (1) vista de compatibilidad con columnas nuevas (aditivo);
--            (2) índice de sub-barrio + acm_match_roomix v2 (params y salidas nuevas).
-- Deploy: DDL primero es inocuo para el código viejo (params con default, columnas extra
-- ignoradas). Aplicar por Management API; las migraciones del repo NO se aplican solas.

-- ────────────────────────── 1. La vista, con más columnas ──────────────────────────
-- `create or replace view` solo permite AGREGAR columnas AL FINAL — por eso las nuevas
-- van después de updated_at. El contrato viejo queda intacto.

create or replace view public.roomix_properties with (security_invoker = true) as
select
  r.id::text                                        as id,
  coalesce(r.slug, r.id::text)                      as slug,
  r.titulo                                          as title,
  r.descripcion                                     as description,
  r.direccion                                       as address,
  r.barrio                                          as neighborhood,
  r.region                                          as region,
  r.ciudad                                          as city,
  r.tipo                                            as property_type,
  case r.operacion when 'venta' then 'sale'
                   when 'alquiler' then 'rent'
                   when 'alquiler-temporario' then 'rent' end as operation,
  r.precio                                          as price,
  r.moneda                                          as currency,
  r.superficie_total_m2                             as area_m2,
  r.superficie_cubierta_m2                          as covered_area_m2,
  r.ambientes                                       as rooms,
  r.dormitorios                                     as bedrooms,
  r.banos                                           as bathrooms,
  r.piso                                            as floor,
  r.antiguedad_anios                                as property_age_years,
  r.amenities                                       as amenities,
  r.fotos                                           as images,
  r.embedding                                       as embedding,
  (r.estado = 'activo')                             as is_active,
  r.publicador_nombre                               as roomix_agency_name,
  p.logo                                            as roomix_agency_logo,
  null::text                                        as roomix_agency_source_url,
  r.url_publica                                     as canonical_url,
  r.url_publica                                     as source_listing_url,
  r.publicado_desde                                 as date_posted,
  r.telefono                                        as phone,
  case when r.tiene_whatsapp then r.telefono end    as whatsapp,
  r.lat                                             as lat,
  r.lng                                             as lng,
  r.actualizado_en                                  as updated_at,
  -- ── Fase 2: la riqueza de mercado_avisos, con sus nombres reales ──
  r.cocheras                                        as cocheras,
  r.expensas                                        as expensas,
  r.expensas_moneda                                 as expensas_moneda,
  r.dias_publicado                                  as dias_publicado,
  r.variacion_precio_pct                            as variacion_precio_pct,
  r.precio_inicial                                  as precio_inicial,
  r.disposicion                                     as disposicion,
  r.orientacion                                     as orientacion,
  r.es_dueno_directo                                as es_dueno_directo,
  r.apto_credito                                    as apto_credito,
  r.en_construccion                                 as en_construccion,
  r.precio_m2                                       as precio_m2,
  p.puntaje                                         as publicador_puntaje,
  p.resenas                                         as publicador_resenas
from public.mercado_avisos r
left join public.mercado_publicadores p on p.id = r.publicador_id
where r.operacion = 'venta' and r.calidad = 'ok' and r.estado = 'activo';

grant select on public.roomix_properties to authenticated, service_role;
