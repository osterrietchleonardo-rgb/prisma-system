-- Mapa del Buscador IA · Etapa 1
-- Aplicada en produccion el 2026-08-05 por Management API.
-- Todo aditivo: no modifica ni borra nada existente.

-- 1) Coordenadas propias en la cartera. Hasta ahora solo vivian dentro de tokko_data,
--    donde no se pueden indexar ni filtrar por rectangulo.
ALTER TABLE properties ADD COLUMN IF NOT EXISTS lat double precision;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS lng double precision;

-- Relleno inicial. De aca en mas lo mantiene lib/tokko-sync.ts en cada sync.
-- La condicion con regex evita romper si algun tokko_data trae texto en vez de un numero.
UPDATE properties SET
  lat = NULLIF(tokko_data->>'geo_lat','')::double precision,
  lng = NULLIF(tokko_data->>'geo_long','')::double precision
WHERE tokko_data->>'geo_lat'  ~ '^-?[0-9]+(\.[0-9]+)?$'
  AND tokko_data->>'geo_long' ~ '^-?[0-9]+(\.[0-9]+)?$';
-- Resultado verificado: 631 de 631 propiedades con coordenadas, 0 activas sin ubicacion.

-- 2) Indice espacial GiST nativo (sin PostGIS), parcial sobre las activas.
--    Sin esto cada movimiento del mapa recorre la tabla entera.
--    Medido el 2026-08-05 sobre 156.803 filas (70.809 activas), consulta real del mapa
--    con filtros y LIMIT 1000:  sin indice 267-1.700 ms  ->  con indice 9,5 ms.
--    El operador tiene que ser  point(lng,lat) <@ box  ; con BETWEEN el indice NO se usa.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_roomix_geo
  ON roomix_properties USING gist (point(lng, lat)) WHERE is_active;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_properties_geo
  ON properties USING gist (point(lng, lat)) WHERE is_active;

-- 3) Zonas dibujadas a mano alzada, guardadas por el usuario.
--    Privadas: ni el director ve las de un asesor.
CREATE TABLE IF NOT EXISTS mapa_zonas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agency_id   uuid NOT NULL,
  nombre      text NOT NULL,
  descripcion text,
  geojson     jsonb NOT NULL,   -- el trazo dibujado
  filtros     jsonb,            -- los filtros que estaban puestos al guardarlo
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mapa_zonas_user ON mapa_zonas (user_id, created_at DESC);

ALTER TABLE mapa_zonas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mapa_zonas_propias ON mapa_zonas;
CREATE POLICY mapa_zonas_propias ON mapa_zonas
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
