-- Mapa · el filtro por barrio hacia timeout. Indice sobre el barrio normalizado.
--
-- QUE PASABA
-- mapa_colaboracion compara `lower(unaccent(btrim(neighborhood))) = p_barrio`. Esa cuenta
-- se hace FILA POR FILA y no hay indice que la sirva, asi que Postgres recorria todas las
-- filas del rectangulo normalizando cada barrio para descartarlo. Medido el 2026-08-11
-- pidiendo Belgrano: 8.337 ms y "canceling statement due to statement timeout".
--
-- Es exactamente el mismo error que ya habia pasado con el filtro por tipo: un filtro que
-- la base no puede resolver con indice se come el rectangulo entero.
--
-- POR QUE UN INDICE DE EXPRESION Y NO UNA COLUMNA NUEVA
-- Una columna generada seria mas comoda, pero obliga a reescribir la tabla entera —2,2 GB,
-- con bloqueo— y ademas Postgres no acepta unaccent() en una columna generada porque no
-- esta declarada inmutable. El indice de expresion no toca los datos y se arma al lado.
--
-- POR QUE HACE FALTA EL ENVOLTORIO
-- unaccent() depende de un diccionario que se puede cambiar, asi que Postgres la trata
-- como no inmutable y no la deja entrar en un indice. Pasandole el diccionario explicito
-- el resultado ya no depende de la configuracion, y ahi si se puede declarar inmutable.
-- Es el envoltorio estandar para esto.

CREATE OR REPLACE FUNCTION barrio_normalizado(texto text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  -- El diccionario va con el esquema explicito: en este proyecto unaccent vive en
  -- `public`, y sin calificarlo la funcion falla con "unaccent(unknown, text) does not
  -- exist" recien al ejecutarse, no al crearse.
  SELECT lower(public.unaccent('public.unaccent'::regdictionary, btrim(coalesce(texto, ''))))
$$;

COMMENT ON FUNCTION barrio_normalizado(text) IS
  'Barrio comparable: minusculas, sin acentos. Inmutable para poder indexarla.';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_roomix_barrio_normalizado
  ON roomix_properties (barrio_normalizado(neighborhood::text))
  WHERE is_active;

-- La cartera son ~640 filas por agencia: ahi el recorrido es instantaneo y el indice no
-- se justifica. Igual se usa la misma funcion en las dos, para que no puedan divergir.

-- mapa_colaboracion pasa a usar barrio_normalizado() en vez de escribir la cuenta a mano.
-- Tiene que estar escrito EXACTAMENTE igual que en el indice: si difiere aunque sea en un
-- parentesis, Postgres no lo reconoce, no usa el indice y vuelve el timeout.
-- Aplicado por separado; ver el cuerpo completo en la funcion en produccion.
--
-- MEDIDO despues del cambio, mismo rectangulo y mismo barrio:
--   antes   8.337 ms -> statement timeout (la consulta se cancelaba sola)
--   despues   909 ms en frio, 62-68 ms en caliente
