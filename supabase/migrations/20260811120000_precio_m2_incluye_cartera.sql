-- Mapa · el precio por m2 de una manzana se calcula con TODO lo que hay en esa manzana.
--
-- QUE FALTABA
-- El calculo usaba solo la red de colaboracion. Las propiedades de la cartera propia se
-- dibujaban como pines pero no movian ningun precio: uno veia propiedades en una manzana y
-- al pasar el mouse no salia el cartelito. Medido el 2026-08-11: 461 propiedades propias
-- caian dentro de una manzana y quedaban afuera de la cuenta.
--
-- Ahora entran las dos fuentes, sean todas de la red, todas propias o mezcladas.
--
-- POR QUE HAY QUE DESCARTAR REPETIDAS
-- Una misma propiedad puede estar publicada por la agencia Y en la red compartida. Si se
-- cuenta dos veces, pesa el doble en la mediana de su manzana. Se detectan por precio y
-- superficie identicos a menos de 60 m. Medido: 35 de 440 propias utiles estaban
-- repetidas. Gana la de la red, que es la que ven todas las agencias.
--
-- LO QUE ESTO NO ARREGLA (y es correcto que no lo haga)
-- Una manzana sigue sin precio si sus propiedades no traen superficie o traen un precio de
-- relleno: sin metros no hay precio por metro. Y sigue sin pintarse si sus propiedades son
-- de otra operacion o moneda que la que se esta mirando: con el mapa en Venta y dolares,
-- una manzana con solo alquileres en pesos no tiene nada que mostrar.

CREATE OR REPLACE FUNCTION refrescar_precio_m2_manzanas()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  n integer;
BEGIN
  DELETE FROM mapa_precio_m2_manzanas;

  INSERT INTO mapa_precio_m2_manzanas (manzana_id, operacion, moneda, propiedades, mediana_m2)
  WITH todas AS (
    SELECT
      CASE WHEN r.operation = 'rent' THEN 'Alquiler' ELSE 'Venta' END AS operacion,
      r.currency::text        AS moneda,
      r.lat, r.lng,
      r.price / r.area_m2     AS m2
    FROM roomix_properties r
    WHERE r.is_active
      AND r.lat IS NOT NULL AND r.lng IS NOT NULL
      AND r.area_m2 >= 15 AND r.price >= 1000
      AND r.currency IS NOT NULL

    UNION ALL

    SELECT
      -- En la cartera "Alquiler" incluye tambien "Temporary rent".
      CASE WHEN p.status = 'Venta' THEN 'Venta' ELSE 'Alquiler' END,
      p.currency,
      p.lat, p.lng,
      p.price / p.total_area
    FROM properties p
    WHERE p.is_active
      AND p.lat IS NOT NULL AND p.lng IS NOT NULL
      AND p.total_area >= 15 AND p.price >= 1000
      AND p.currency IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM roomix_properties r
        WHERE r.is_active
          AND r.price = p.price
          AND r.area_m2 = p.total_area
          AND ST_DWithin(
                ST_SetSRID(ST_MakePoint(r.lng, r.lat), 4326)::geography,
                ST_SetSRID(ST_MakePoint(p.lng, p.lat), 4326)::geography,
                60)
      )
  )
  SELECT
    m.id,
    t.operacion,
    t.moneda,
    count(*)::integer,
    round(percentile_cont(0.5) WITHIN GROUP (ORDER BY t.m2)::numeric, 0)
  FROM todas t
  JOIN mapa_manzanas m
    ON ST_Contains(m.geom, ST_SetSRID(ST_MakePoint(t.lng, t.lat), 4326))
  GROUP BY m.id, t.operacion, t.moneda;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

SELECT refrescar_precio_m2_manzanas();
