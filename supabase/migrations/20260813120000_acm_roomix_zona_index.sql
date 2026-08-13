-- ACM: índice funcional para la clave de zona de roomix_properties.
--
-- Motivo (diagnóstico completo en .superpowers/sdd/2026-08-06-acm-zona-estricta-y-fotos-ia/
-- diagnostico-timeout-roomix.md): el gate de zona de acm_match_roomix hoy resuelve con un
-- Hash Join contra una expresión SIN índice (acm_norm(coalesce(neighborhood, city))), lo que
-- obliga a Postgres a escanear la tabla ENTERA (255k filas, 463 MB) para saber a qué barrio
-- pertenece cada fila, antes de poder ordenar por similitud de vector. La siguiente migración
-- reescribe la función para resolver la zona PRIMERO (zonas del barrio → join indexado →
-- candidato ya chico) en vez de al final.
--
-- Por qué compuesto con `operation` (y no solo la clave de zona): medido en producción
-- (EXPLAIN ANALYZE, BUFFERS, Palermo/zona 70/con embedding, ver task-13-report.md) — un índice
-- de una sola columna SÍ lo usa el planner, pero el tiempo casi no bajó (8,6-8,8 s, contra los
-- 8-11 s del plan viejo): las filas de un barrio NO están agrupadas físicamente en la tabla
-- (se cargaron con el crawler mezcladas de todos los barrios), así que igual hay que traer del
-- disco ~14.400 páginas dispersas de a una. Agregando `operation` (venta/alquiler, ~46/54% del
-- volumen de Palermo) el índice descarta la mitad ANTES de tocar el heap: bajó a ~8.350 páginas
-- y 4,7-4,9 s, consistente en corridas repetidas. `operation` se eligió por ser el filtro más
-- selectivo y presente en el 100% de las búsquedas reales (siempre 'venta' o 'alquiler', nunca
-- ausente) entre los que se pueden expresar como igualdad indexable — el resto de los filtros
-- (tipo de propiedad por patrones ILIKE, m², ambientes) no son sargables con un btree simple sin
-- agregar más superficie de índice de la que se puede justificar con esta medición.
--
-- La expresión de la clave de zona tiene que ser IDÉNTICA a la que usa la función (mismo
-- btrim/coalesce/nullif) para que el planner pueda matchearla. acm_norm es IMMUTABLE (requisito
-- de Postgres para indexar una expresión).
--
-- CONCURRENTLY: la tabla está viva (el crawler de roomix inserta/actualiza todo el tiempo);
-- sin CONCURRENTLY, CREATE INDEX toma un ACCESS EXCLUSIVE lock que bloquearía esos inserts
-- (y cualquier SELECT) mientras se construye sobre 255k filas. CONCURRENTLY es más lento y
-- hace dos pasadas, pero no bloquea lecturas/escrituras normales.
--
-- OJO: CONCURRENTLY no puede correr dentro de un bloque de transacción. Este archivo tiene que
-- aplicarse SOLO (una única sentencia), nunca junto a otras sentencias en el mismo request —
-- si se manda junto con otro SQL en la misma llamada a /database/query, Postgres las envuelve
-- en una transacción implícita y esta sentencia falla con "cannot run inside a transaction block".
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_roomix_zona_operacion
  ON public.roomix_properties (
    (public.acm_norm(btrim(coalesce(nullif(neighborhood, ''), city, '')))),
    operation
  );
