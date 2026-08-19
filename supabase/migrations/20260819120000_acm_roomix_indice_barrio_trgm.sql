-- ⚠️ APLICAR SOLO / APLICAR ESTE ARCHIVO SOLO ⚠️
-- Contiene CREATE INDEX CONCURRENTLY, que NO puede correr dentro de una transaccion.
-- La Management API envuelve en una transaccion todo lo que le mandes junto, asi que si
-- esta sentencia viaja con otras falla con "25001: cannot run inside a transaction block".
-- Va sola, igual que 20260813120000_acm_roomix_zona_index.sql.

-- Indice para la RAMA DE RESPALDO de acm_match_roomix: la que corre cuando el barrio del
-- sujeto no resuelve contra el mapa de zonas (acm_barrio_relacion). Pasa con barrios de
-- zona norte tipo "Los Lagartos", y con barrios mal escritos ("vill devoto").
--
-- Esa rama filtra por texto:
--   acm_norm(neighborhood || ' ' || city) like '%los lagartos%'
-- Un LIKE con comodin adelante no lo puede resolver ningun btree, asi que hacia un Seq Scan
-- de las 251.229 filas activas: 4.589 ms y 526 MB leidos, para devolver CERO comparables.
-- Con el statement_timeout de 8s del rol `authenticated`, la busqueda completa se cortaba y
-- el asesor veia "No pudimos completar la busqueda en la red de comparables".
--
-- Un GIN de trigramas SI resuelve ese LIKE. Medido sobre "Los Lagartos": 4.589 ms -> 7 ms.
--
-- Se puede indexar porque acm_norm es IMMUTABLE (verificado en pg_proc.provolatile = 'i').
-- La expresion indexada es EXACTAMENTE la del filtro; si se cambia una, hay que cambiar la
-- otra o el indice deja de engancharse en silencio.
--
-- El WHERE is_active acompaña al de la funcion y achica el indice: ocupa 13 MB (medido),
-- contra los 1.309 MB que ocupa el HNSW de embeddings. El crawler paga un poco mas por
-- escritura sobre una columna de texto corto; a cambio deja de haber un Seq Scan de 526 MB.
--
-- La rama de respaldo ademas tuvo que reescribir su filtro de `exists (unnest ...)` a
-- `like any (array)` para que el planner pudiera usar este indice: misma condicion, otra
-- forma de escribirla. Va en la migracion 20260819120100.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_roomix_zona_texto_trgm
  ON public.roomix_properties
  USING gin ((public.acm_norm(coalesce(neighborhood,'') || ' ' || coalesce(city,''))) gin_trgm_ops)
  WHERE is_active;
