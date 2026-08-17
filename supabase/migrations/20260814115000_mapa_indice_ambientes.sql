-- Mapa · el indice que hace posible filtrar por ambientes.
--
-- Va con el cambio de funciones de 20260814120000_mapa_filtro_ambientes.sql, pero en su
-- propio archivo: ver la advertencia del final.
--
-- POR QUE NO ES UNA OPTIMIZACION
-- El filtro de ambientes sin este indice tira `canceling statement due to statement
-- timeout` (8,6 s, HTTP 500) apenas se aprieta un boton. `idx_roomix_geo_filtros` no
-- llevaba `rooms`, asi que la base armaba el bitmap con las 25.223 filas del rectangulo y
-- despues descartaba a mano 3.902 por cada 1.000 utiles, tocando 3.985 bloques de disco.
-- Con `rooms` adentro, el filtro entra en el `Index Cond` y el bitmap ya sale chico.
-- Medido sobre Chacarita-La Boca con ambientes = 3:
--
--   sin rooms en el indice   4.033 ms   bitmap de 25.223 filas, 3.985 bloques
--   con rooms en el indice      72 ms   bitmap de  5.526 filas,   951 bloques
--
-- Es el indice anterior MAS `rooms`, asi que lo reemplaza: el planner lo elige tambien
-- para las consultas que no filtran ambientes (verificado con EXPLAIN). El viejo se borra
-- en el archivo de las funciones; dejar los dos costaria el doble en cada sync nocturno.
-- 24 MB pasan a 29 MB.
--
-- CONCURRENTLY porque la tabla esta viva: el sync de roomix escribe todo el tiempo y un
-- CREATE INDEX comun tomaria un ACCESS EXCLUSIVE sobre 178.351 filas.
--
-- ══════════════════════════════════════════════════════════════════════════════════════
-- ⚠️  APLICAR ESTE ARCHIVO SOLO — EN SU PROPIA LLAMADA A /database/query, SIN NINGUN OTRO
--     SQL EN EL MISMO REQUEST. Mandado junto a otras sentencias, el cliente las envuelve
--     en una transaccion y Postgres corta con:
--       ERROR: 25001: CREATE INDEX CONCURRENTLY cannot run inside a transaction block
--     Ademas, si CONCURRENTLY se interrumpe a mitad de camino, deja un indice INVALID que
--     existe pero no se usa y NO avisa: verificar con
--       SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
-- ══════════════════════════════════════════════════════════════════════════════════════

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_roomix_geo_filtros_amb
  ON public.roomix_properties
  USING gist (point(lng, lat), operation, property_type, currency, price, rooms)
  WHERE is_active;
