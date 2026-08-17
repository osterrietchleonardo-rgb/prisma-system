-- ACM · Todo lo que necesita la hoja del entorno, en UNA llamada.
-- Devuelve jsonb y no una tabla porque cada categoría tiene forma distinta (unas devuelven el
-- más cercano, otras un conteo, otras las dos cosas): una tabla obligaría a columnas nullables
-- para todo y el que la lee tendría que adivinar cuáles mirar.

-- El más cercano de una categoría dentro de un radio, o null.
-- VA PRIMERO: zona_resumen la llama, y una función tiene que existir antes que quien la usa.
-- Una versión anterior de esta función llevaba un cuarto parámetro con default. Como
-- `create or replace` no puede cambiar la firma, la vieja quedaba viva al lado de la nueva y
-- Postgres fallaba con "function is not unique". Se borra explícitamente.
drop function if exists public.zona_cercano(text, geography, int, numeric);

create or replace function public.zona_cercano(p_categoria text, p_geo geography, p_radio int)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'nombre',  p.nombre,
    'subtipo', p.subtipo,
    -- Contra geom_forma cuando existe (el borde del parque, el trazado de la ciclovía) y
    -- contra geom cuando no. Medir un parque desde su centro miente: el borde de las
    -- Barrancas está a la mitad de distancia que su centro.
    'metros',  round(ST_Distance(coalesce(p.geom_forma, p.geom)::geography, p_geo))::int,
    -- El punto SIEMPRE sale de geom (que en polígonos ya es un punto sobre la superficie):
    -- es lo que se dibuja en el mapa.
    'lat',     ST_Y(p.geom),
    'lon',     ST_X(p.geom),
    'extra',   p.extra)
  from zona_pois p
  where p.categoria = p_categoria
    and p.nombre <> ''
    and ST_DWithin(coalesce(p.geom_forma, p.geom)::geography, p_geo, p_radio)
  order by ST_Distance(coalesce(p.geom_forma, p.geom)::geography, p_geo)
  limit 1;
$$;

-- QUE CUENTA COMO ESPACIO VERDE
-- El dataset del gobierno mete en la misma bolsa las Barrancas de Belgrano (21.000 m²) y un
-- cantero de 19 m² en una esquina. Sin filtrar, la hoja de una propiedad en Cabildo y Juramento
-- decía "espacio verde a 11 metros: Plaza Joaquín Sánchez" — que son 152 m², el tamaño de un
-- living. El cliente lee "espacio verde a 11 metros" e imagina un parque: es engañoso aunque
-- sea literalmente cierto.
--
-- Con el piso puesto, esa misma propiedad muestra la Plaza General Manuel Belgrano (4.671 m²,
-- a 68 m), que es la plaza de la iglesia La Redonda — la respuesta que daría cualquiera del
-- barrio.
--
-- 1.000 m² son unos 30 x 30 metros: una plaza chica donde te podés sentar. Por debajo de eso
-- es una esquina con árboles. Y CANTERO CENTRAL queda afuera por tipo, sea del tamaño que sea:
-- el cantero de una avenida no es un espacio verde ni midiendo media hectárea.
--
-- LOS QUE NO TIENEN NOMBRE
-- El dataset deja sin nombre 142 espacios verdes. Casi todos son plazoletas de mil y pico de
-- metros: retazos de vereda que no le sirven a nadie en un informe (en Palermo, uno de esos
-- de 1.051 m² le ganaba al Parque Ferroviario, que está a media cuadra más). Pero SIETE de
-- ellos pasan la hectárea, y el mayor tiene 5,4 — ésos son parques de verdad y dejarlos afuera
-- sería peor. Por eso: con nombre valen desde 1.000 m²; sin nombre, solo desde una hectárea,
-- que es cuando ya no hay duda de que es un parque aunque nadie le haya puesto nombre.
create or replace function public.zona_verde_cercano(p_geo geography, p_radio int)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'nombre',  p.nombre,
    'subtipo', p.subtipo,
    'metros',  round(ST_Distance(coalesce(p.geom_forma, p.geom)::geography, p_geo))::int,
    'lat',     ST_Y(p.geom),
    'lon',     ST_X(p.geom),
    'extra',   p.extra)
  from zona_pois p
  where p.categoria = 'espacio_verde'
    and coalesce(p.subtipo, '') <> 'CANTERO CENTRAL'
    and (
      (p.nombre <> ''  and coalesce((p.extra->>'area_m2')::numeric, 0) >=  1000) or
      (p.nombre =  ''  and coalesce((p.extra->>'area_m2')::numeric, 0) >= 10000)
    )
    and ST_DWithin(coalesce(p.geom_forma, p.geom)::geography, p_geo, p_radio)
  order by ST_Distance(coalesce(p.geom_forma, p.geom)::geography, p_geo)
  limit 1;
$$;

-- Los radios NO son un parámetro. Son una decisión de producto, medida en cuadras de CABA:
-- 500 m de farmacias son 5 cuadras (lo que se camina por un remedio), 3 km de hospital es lo
-- que se recorre en auto sin pensarlo. Que vivan acá adentro evita que alguien los cambie
-- desde el llamador y produzca dos fichas con criterios distintos.
create or replace function public.zona_resumen(p_lat double precision, p_lon double precision)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  punto    geometry(Point, 4326);
  geo      geography;
  v_barrio record;
begin
  punto := ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326);
  geo   := punto::geography;

  -- El barrio. Si el punto no cae en ninguno, no es CABA: devolvemos null y el llamador se va
  -- al respaldo de OpenStreetMap.
  select b.id, b.nombre, b.comuna, b.area_km2, b.geom
    into v_barrio
  from zona_barrios b
  where ST_Contains(b.geom, punto)
  limit 1;

  if v_barrio.nombre is null then
    return null;
  end if;

  return jsonb_build_object(
    'barrio',   v_barrio.nombre,
    'comuna',   v_barrio.comuna,
    'area_km2', round(v_barrio.area_km2::numeric, 1),

    -- Contexto del banner: espacios verdes del barrio ENTERO, no del radio. MISMO criterio de
    -- tamaño que zona_verde_cercano: si no, el banner dice "112 espacios verdes" contando
    -- canteros y contradice a la propia hoja.
    'espacios_verdes_barrio', (
      select count(*)::int from zona_pois p
      where p.categoria = 'espacio_verde'
        and coalesce(p.subtipo, '') <> 'CANTERO CENTRAL'
        and (
          (p.nombre <> '' and coalesce((p.extra->>'area_m2')::numeric, 0) >=  1000) or
          (p.nombre =  '' and coalesce((p.extra->>'area_m2')::numeric, 0) >= 10000)
        )
        and ST_Contains(v_barrio.geom, p.geom)
    ),

    -- ── Los más cercanos ──
    'subte',         zona_cercano('subte',     geo, 1500),
    'espacio_verde', zona_verde_cercano(       geo, 1200),
    'hospital',      zona_cercano('hospital',  geo, 3000),
    'comisaria',     zona_cercano('comisaria', geo, 1500),
    'ciclovia',      zona_cercano('ciclovia',  geo,  400),

    -- ── Los que se cuentan ──
    'escuela', (
      select jsonb_build_object(
        'cantidad',  count(*)::int,
        'estatales', count(*) filter (where p.subtipo ilike 'estatal')::int)
      from zona_pois p
      where p.categoria = 'escuela' and ST_DWithin(p.geom::geography, geo, 1000)
    ),
    'farmacia', (
      select jsonb_build_object('cantidad', count(*)::int)
      from zona_pois p
      where p.categoria = 'farmacia' and ST_DWithin(p.geom::geography, geo, 500)
    ),
    'ecobici', (
      select jsonb_build_object('cantidad', count(*)::int)
      from zona_pois p
      where p.categoria = 'ecobici' and ST_DWithin(p.geom::geography, geo, 600)
    ),
    -- Las líneas de colectivo se juntan de TODAS las paradas del radio y se deduplican: al que
    -- pregunta le importa qué líneas tiene, no cuántos carteles hay.
    'parada_colectivo', (
      select jsonb_build_object(
        'lineas',   coalesce(jsonb_agg(distinct l), '[]'::jsonb),
        'cantidad', count(distinct l)::int)
      from zona_pois p, jsonb_array_elements_text(p.extra->'lineas') as l
      where p.categoria = 'parada_colectivo' and ST_DWithin(p.geom::geography, geo, 300)
    )
  );
end;
$$;

-- La app la llama con la sesión del usuario logueado.
grant execute on function public.zona_resumen(double precision, double precision) to authenticated;
