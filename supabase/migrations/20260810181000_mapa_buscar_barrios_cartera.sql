-- Mapa · buscador de lugares: los barrios de la cartera PROPIA.
--
-- POR QUE HACE FALTA ADEMAS DEL CATALOGO
-- mapa_barrios se arma solo con la red de colaboracion, para no dejar ver a una agencia
-- en que barrios trabajan las demas. Pero hay lugares donde la agencia tiene propiedades
-- y la red no tiene ninguna, y son justo los que un asesor busca por nombre. Medido el
-- 2026-08-10 sobre la cartera de Central: "Vista Flores" (4), "Barrio Vicente López" (4),
-- "Campos de Roca II" (3), "Grand Bell" (2), "Canning (Ezeiza)" (2)... countries y
-- barrios cerrados que no existen en el catalogo compartido.
--
-- Aca no hace falta tabla ni indice: son ~640 filas por agencia y el recorrido es
-- instantaneo. Lo que si hace falta es el filtro por agencia, que es el que sostiene la
-- separacion entre inquilinos.

CREATE OR REPLACE FUNCTION mapa_buscar_barrios_cartera(
  p_agency_id uuid,
  p_q         text,
  p_limit     integer DEFAULT 4
)
RETURNS TABLE (
  nombre   text,
  cantidad integer,
  sur      double precision,
  oeste    double precision,
  norte    double precision,
  este     double precision,
  parecido real
)
LANGUAGE sql
STABLE
AS $$
  WITH consulta AS (
    SELECT lower(unaccent(btrim(coalesce(p_q, '')))) AS texto
  ),
  mios AS (
    SELECT
      lower(unaccent(btrim(p.city))) AS normalizado,
      btrim(p.city)                  AS nombre,
      p.lat,
      p.lng
    FROM properties p
    WHERE p.is_active
      AND p.agency_id = p_agency_id
      AND p.city IS NOT NULL
      AND btrim(p.city) <> ''
      AND p.lat IS NOT NULL
      AND p.lng IS NOT NULL
  )
  SELECT
    m.nombre,
    count(*)::integer,
    min(m.lat),
    min(m.lng),
    max(m.lat),
    max(m.lng),
    max(CASE WHEN m.normalizado LIKE c.texto || '%' THEN 1.0
             ELSE similarity(m.normalizado, c.texto) END)::real AS parecido
  FROM mios m, consulta c
  WHERE c.texto <> ''
    AND (m.normalizado LIKE c.texto || '%' OR m.normalizado % c.texto)
  GROUP BY m.nombre
  ORDER BY parecido DESC, count(*) DESC
  LIMIT greatest(coalesce(p_limit, 4), 1)
$$;

COMMENT ON FUNCTION mapa_buscar_barrios_cartera(uuid, text, integer) IS
  'Barrios de la cartera de UNA agencia, tolerante a acentos y errores de tipeo.';
