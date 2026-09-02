-- CORTE a mercado_avisos (2-sep-2026) · parte 2: la vista de compatibilidad.
--
-- roomix_properties (congelada desde el 1-sep, sin crawler) pasa a ser una VISTA sobre
-- mercado_avisos con el contrato de columnas viejo, para que los re-fetch por PK del código
-- (`.from('roomix_properties').select(...).in('id', ...)`) sigan andando sin tocar TypeScript.
-- La tabla vieja queda archivada como roomix_properties_legacy: NO se borra (rollback, y la
-- decisión de borrarla es de Leonardo).
--
-- Decisiones que viajan acá (spec 2026-09-02-corte-mercado-avisos-design.md):
--  * Corte limpio: la vista expone SOLO venta + calidad ok + estado activo. Alquileres y
--    zonas no cargadas devuelven vacío, nunca error (decidido por Leonardo el 2-sep).
--  * id::text — el código trata el id como string (roomix_${id}, .in('id', [...])).
--  * operation con los VALORES viejos ('sale'): el ACM y el Buscador comparan contra 'sale'.
--  * slug con coalesce a id::text: el Buscador arma el id de pantalla como roomix_${slug}.
--  * security_invoker: la RLS de mercado_avisos aplica con el rol del que consulta.
--    Auditado contra producción (2-sep): authenticated ve filas, anon no ve nada.
--  * Las funciones calientes (acm_match_roomix, buscar_roomix, mapa_colaboracion) NO leen
--    esta vista: leen mercado_avisos directo (ver 20260902121000) para no perder los índices.
--
-- IMPORTANTE: aplicar JUNTO con 20260902121000_corte_mercado_funciones.sql, en UNA sola
-- transacción (si se renombra la tabla sin reemplazar las funciones, las funciones viejas
-- pasan a leer la vista sin índices y el ACM/Buscador/Mapa degradan).

alter table public.roomix_properties rename to roomix_properties_legacy;

comment on table public.roomix_properties_legacy is
  'ARCHIVO. La tabla roomix vieja, congelada el 1-sep-2026 y renombrada en el corte del 2-sep. Solo lectura; no borrar sin OK de Leonardo.';

create view public.roomix_properties with (security_invoker = true) as
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
  r.actualizado_en                                  as updated_at
from public.mercado_avisos r
left join public.mercado_publicadores p on p.id = r.publicador_id
where r.operacion = 'venta' and r.calidad = 'ok' and r.estado = 'activo';

grant select on public.roomix_properties to authenticated, service_role;

comment on view public.roomix_properties is
  'Vista de compatibilidad sobre mercado_avisos (venta + calidad ok + activo). El corte del 2-sep-2026. La tabla vieja es roomix_properties_legacy.';
