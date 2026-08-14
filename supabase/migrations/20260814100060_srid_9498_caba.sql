-- EPSG:9498 — "POSGAR 2007 / CABA 2019", el sistema de coordenadas local del gobierno porteño.
--
-- POR QUE HACE FALTA ESTO
-- El dataset de establecimientos educativos publica sus puntos en este sistema, no en lat/lon
-- (ver scripts/cargar-zona-pois.mjs → poisEscuelas). PostGIS 3.3.7 NO lo trae en
-- spatial_ref_sys, así que ST_Transform(..., 9498, 4326) falla con "Cannot find SRID (9498)".
--
-- La definición NO está inventada: es la oficial de EPSG (epsg.io/9498). Los parámetros que
-- importan son el falso este (20.000) y el falso norte (70.000), que son los que ubican el
-- origen; errarles corre TODAS las escuelas de la ciudad varios kilómetros, en silencio.
-- El control de calidad del script de carga es lo que detecta ese error si algún día se toca.
insert into public.spatial_ref_sys (srid, auth_name, auth_srid, proj4text, srtext)
values (
  9498, 'EPSG', 9498,
  '+proj=tmerc +lat_0=-34.6292666666667 +lon_0=-58.4633083333333 +k=1 +x_0=20000 +y_0=70000 +ellps=WGS84 +towgs84=-0.41,0.46,-0.35,0,0,0,0 +units=m +no_defs',
  'PROJCS["POSGAR 2007 / CABA 2019",GEOGCS["POSGAR 2007",DATUM["Posiciones_Geodesicas_Argentinas_2007",SPHEROID["WGS 84",6378137,298.257223563],TOWGS84[-0.41,0.46,-0.35,0,0,0,0]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","5340"]],PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",-34.6292666666667],PARAMETER["central_meridian",-58.4633083333333],PARAMETER["scale_factor",1],PARAMETER["false_easting",20000],PARAMETER["false_northing",70000],UNIT["metre",1,AUTHORITY["EPSG","9001"]],AUTHORITY["EPSG","9498"]]'
)
on conflict (srid) do nothing;
