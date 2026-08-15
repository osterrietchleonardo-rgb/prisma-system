-- Mapa · el indice que el filtro por barrio nunca pudo usar.
--
-- Va con el cambio de funciones de 20260815130000_mapa_barrio_primero.sql, pero en su
-- propio archivo: ver la advertencia del final.
--
-- QUE ESTABA PASANDO
-- Existia `idx_roomix_barrio_normalizado` sobre `barrio_normalizado(neighborhood)`, pero
-- las funciones del mapa comparaban escribiendo la normalizacion a mano:
-- `lower(unaccent(btrim(coalesce(...))))`, con el `unaccent` de UN argumento. La funcion
-- indexada usa el de DOS —con el diccionario explicito, que es lo que la vuelve inmutable
-- e indexable—, asi que para Postgres son expresiones distintas y el indice no aplicaba.
-- El barrio se evaluaba fila por fila.
--
-- Con filas de ~10 KB (fotos, descripcion, embedding), eso significa traer del disco las
-- 3.585 filas del rectangulo para quedarse con 808. Con "1 ambiente" ademas puesto, la
-- consulta se pasaba de los 8 s y el endpoint devolvia 500.
--
-- Este indice lleva tambien `operation` y `rooms`, que es como se lo consulta siempre, y
-- reemplaza al anterior (mismo primer campo). Pesa 2 MB. El viejo se borra en el archivo
-- de las funciones.
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

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_roomix_barrio_filtros
  ON public.roomix_properties
  USING btree (barrio_normalizado((neighborhood)::text), operation, rooms)
  WHERE is_active;
