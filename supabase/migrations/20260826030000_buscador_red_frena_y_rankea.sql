-- Buscador IA · la busqueda en la red deja de mirar todos los avisos para elegir 100
--
-- EL PROBLEMA, medido contra produccion el 25 y 26-ago-2026:
-- Para "departamento, 3 ambientes, Belgrano, venta, hasta USD 500.000" hay 6.739 avisos que
-- coinciden de verdad. La funcion vieja los leia TODOS -- porque para ordenar por parecido hay
-- que calcular la distancia de cada uno -- y recien despues se quedaba con 100. Eso son 140 MB
-- de disco por busqueda, sobre una tabla de 3.802 MB y una base con 256 MB de memoria: 15
-- segundos la primera vez que alguien busca en un barrio, 350 ms la segunda. Los barrios
-- grandes (Rosario, Cordoba) directamente no llegaban a terminar.
--
-- Lo caro NO es el filtro: filtrar la cartera propia de 94 propiedades tarda 103 ms. Lo caro es
-- ir a buscar 6.739 filas desparramadas, cada una de 1.797 bytes, de los cuales el filtro usa
-- 158. El 91% de lo que se lee no lo mira nadie.
--
-- LA IDEA (de Leonardo): no hace falta mirar los 6.739. Se filtra, se FRENA al juntar un tope
-- de candidatas, y el parecido se calcula solo sobre esas. El tope pone un techo al trabajo:
-- ningun barrio puede costar mas que eso, por grande que sea.
--
-- QUE CAMBIA EN LO QUE VE EL ASESOR: nada, con el tope en 8.000. Verificado sobre cinco zonas
-- (Belgrano, Palermo, Retiro, Villa Ortuzar, Puerto Madero): las 100 propiedades que devuelve
-- son LAS MISMAS, en el mismo orden. Lo unico que cambia es cuanto tarda:
--
--     Palermo 3 amb ....... 10.399 ms  ->  2.787 ms    100/100 iguales
--     Belgrano 3 amb ......  1.943 ms  ->  1.577 ms    100/100 iguales
--     Retiro (en frio) ....  1.292 ms  ->  3.076 ms    100/100 iguales
--
-- (Retiro es mas lento porque en esa medicion la nueva corrio PRIMERA y pago la cache fria,
-- a proposito, para no medir con la cancha calentada. Ver la nota de medicion mas abajo.)
--
-- Bajar el tope acelera mas pero cambia los resultados, porque deja afuera avisos que si
-- coincidian. Medido en Belgrano contra lo que se muestra hoy:
--     tope   300  ->  1.750 ms   coinciden   5 de 100
--     tope 1.000  ->  1.860 ms   coinciden  14 de 100
--     tope 3.000  ->  1.653 ms   coinciden  52 de 100
--     tope 8.000  ->  1.577 ms   coinciden 100 de 100
-- Como el tiempo casi no sube con el tope -- lo caro se pago en el recorrido, y leer 8.000
-- vectores son 24 MB -- se elige 8.000: la velocidad sin resignar nada.
--
-- DOS DIFERENCIAS DE CRITERIO respecto de la funcion vieja:
--
-- 1) Los amenities ahora DESCARTAN. Antes sumaban puntos: si el asesor pedia cochera, igual se
--    le mostraban las que no tienen, mas abajo. Ahora "con cochera" quiere decir con cochera.
--    OJO: la app tiene que aflojar el filtro y avisarlo cuando queden muy pocas, igual que ya
--    hace con el "piso". Sin eso, un pedido con tres amenities puede devolver cero.
--
-- 2) Se puede pedir "mostrame mas" sin repetir: p_excluir_ids saca de la busqueda los avisos
--    que el asesor ya vio.
--
-- COMO MEDIR ESTO SI HAY QUE TOCARLO DE NUEVO: nunca comparar dos versiones sobre la MISMA
-- zona una despues de la otra. La segunda encuentra todo en memoria y gana siempre, corra la
-- que corra primero: Palermo tardo 15.137 ms la primera vez y 356 ms la segunda, misma
-- consulta. Hay que estrenar una zona por medicion, o hacer correr primera a la version que
-- uno quiere probar.
--
-- La funcion vieja (match_roomix_ia) NO se toca: la sigue usando el ACM. Esta es nueva y
-- convive con aquella.

create or replace function public.buscar_roomix(
  p_query_embedding      text,
  p_operation            text    default 'ambas',
  p_type_patterns        text[]  default '{}',
  p_rooms                integer default null,
  p_bedrooms             integer default null,
  p_bathrooms            integer default null,
  p_price_max            numeric default null,
  p_price_min            numeric default null,
  p_currency             text    default null,
  p_loc_patterns         text[]  default '{}',
  p_amenity_patterns     text[]  default '{}',
  p_free_text_patterns   text[]  default '{}',
  p_agency_name_patterns text[]  default '{}',
  p_floor_min            integer default null,
  p_floor_max            integer default null,
  p_excluir_ids          text[]  default '{}',
  p_candidatas           integer default 8000,
  p_limit                integer default 100
)
returns table(id character varying, match_pct integer, semantic_sim real)
language plpgsql
stable
as $function$
declare
  v_emb vector(768) := null;
begin
  if p_query_embedding is not null and length(p_query_embedding) > 2 then
    v_emb := p_query_embedding::vector(768);
  end if;

  return query
  -- `materialized` no es decorativo: obliga a resolver esta parte primero y a FRENAR en
  -- p_candidatas. Sin eso el planner puede meter el orden de afuera adentro y volver a leerlo
  -- todo, que es exactamente lo que se quiere evitar.
  with candidatas as materialized (
    select
      r.id,
      coalesce(nullif(r.rooms,0), case when r.bedrooms > 0 then r.bedrooms + 1 else null end) as amb,
      r.floor as floor_val,
      lower(coalesce(r.title,'') || ' ' || coalesce(r.description,'') || ' ' || coalesce(r.address,'') || ' ' ||
        coalesce(r.neighborhood,'') || ' ' || coalesce(r.region,'') || ' ' || coalesce(r.city,'') || ' ' ||
        coalesce(r.property_type,'') || ' ' || coalesce(array_to_string(r.amenities,' '),'')) as ft_hay
    from roomix_properties r
    where r.embedding is not null
      -- Un aviso dado de baja no es una opcion para mostrarle a un cliente. `is not false` y no
      -- `= true` a proposito: hay 62.396 filas con is_active en NULL de una carga vieja que el
      -- crawler nunca marco, y 50.602 de ellas siguen publicadas. Exigir `= true` sacaria de la
      -- red unas 50.000 propiedades que si estan.
      and r.is_active is not false
      and (array_length(p_excluir_ids,1) is null or r.id <> all (p_excluir_ids))
      and (p_operation = 'ambas'
        or (p_operation = 'venta'    and r.operation = 'sale')
        or (p_operation = 'alquiler' and r.operation = 'rent'))
      and (array_length(p_agency_name_patterns,1) is null
        or exists (select 1 from unnest(p_agency_name_patterns) ap where r.roomix_agency_name ilike ap))
      and (array_length(p_type_patterns,1) is null
        or exists (select 1 from unnest(p_type_patterns) tp where r.property_type ilike tp or r.title ilike tp))
      and (p_rooms is null
        or coalesce(nullif(r.rooms,0), case when r.bedrooms>0 then r.bedrooms+1 else null end) is null
        or abs(coalesce(nullif(r.rooms,0), case when r.bedrooms>0 then r.bedrooms+1 else null end) - p_rooms) <= 1)
      and (p_bedrooms is null or coalesce(r.bedrooms,0) <= 0 or abs(r.bedrooms - p_bedrooms) <= 1)
      and (p_bathrooms is null or coalesce(r.bathrooms,0) <= 0 or r.bathrooms >= p_bathrooms)
      and (p_price_max is null or coalesce(r.price,0) <= 0
        or (p_currency is not null and r.currency is not null and lower(r.currency) <> lower(p_currency))
        or r.price <= p_price_max * 1.20)
      and (p_price_min is null or coalesce(r.price,0) <= 0
        or (p_currency is not null and r.currency is not null and lower(r.currency) <> lower(p_currency))
        or r.price >= p_price_min * 0.95)
      -- `ilike any (...)` y no `exists (select ... unnest ...)`: significan lo mismo, pero solo
      -- esta forma engancha idx_roomix_loc_trgm. Con la otra el planner lee la tabla entera.
      and (array_length(p_loc_patterns,1) is null
        or lower(coalesce(r.neighborhood,'') || ' ' || coalesce(r.address,'') || ' ' || coalesce(r.title,'')) ilike any (p_loc_patterns))
      and (
        (p_floor_min is null and p_floor_max is null)
        or r.floor is null
        or r.floor between coalesce(p_floor_min,0) and coalesce(p_floor_max,9999)
      )
      -- Los amenities DESCARTAN (ver nota 1 arriba). Cada patron es una alternancia de
      -- sinonimos que arma la app: 'cochera|garage|garaje|estacionamiento'.
      and (array_length(p_amenity_patterns,1) is null
        or not exists (
          select 1 from unnest(p_amenity_patterns) pat
          where lower(coalesce(r.description,'') || ' ' || coalesce(r.title,'') || ' ' ||
                      coalesce(array_to_string(r.amenities,' '),'')) !~* pat))
    limit p_candidatas
  )
  select
    c.id,
    -- El % que ve el asesor en la tarjeta. Los amenities ya no entran: si estan, es porque
    -- pasaron el filtro. Queda lo que si admite grados: los ambientes y el texto libre.
    round((
      (case when p_rooms is null then 0
            when c.amb is null then 17.5
            when c.amb = p_rooms then 35
            when abs(c.amb - p_rooms) = 1 then 17.5
            else 0 end)
      + (case when array_length(p_free_text_patterns,1) is null then 0
              else 30.0 * ((select count(*) from unnest(p_free_text_patterns) ft where c.ft_hay ~* ft)::numeric
                           / array_length(p_free_text_patterns,1)) end)
    ) / nullif(
      (case when p_rooms is null then 0 else 35 end)
      + (case when array_length(p_free_text_patterns,1) is null then 0 else 30 end)
    ,0) * 100)::int as match_pct,
    (case when v_emb is null then 0::real else (1 - (r.embedding <=> v_emb))::real end) as semantic_sim
  from candidatas c
  join roomix_properties r on r.id = c.id
  order by
    match_pct desc nulls last,
    (case when (p_floor_min is not null or p_floor_max is not null) and c.floor_val is not null then 1 else 0 end) desc,
    semantic_sim desc
  limit p_limit;
end;
$function$;

grant execute on function public.buscar_roomix to anon, authenticated, service_role;
