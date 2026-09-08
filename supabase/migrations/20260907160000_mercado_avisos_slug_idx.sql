-- Índice para buscar UN aviso de la red por su código (slug).
--
-- EL PROBLEMA. Tres lugares de la app traen un aviso suelto por su código: abrir la ficha
-- desde el mapa (`/api/mapa/propiedad`), armar la ficha del cliente (`/api/seleccion`) y el
-- ACM. Los tres pasan por la vista `roomix_properties`, que expone el código como
-- `COALESCE(slug, id::text)`.
--
-- Ese COALESCE es el detalle que rompía todo: **un índice sobre `slug` a secas no se puede
-- usar** para una condición sobre `COALESCE(slug, ...)`, así que Postgres hacía Seq Scan
-- sobre las DOS particiones. Medido el 7-sep-2026 con caché caliente: 58 ms el mejor caso y
-- 217 ms el peor, recorriendo hasta 62.002 filas de 62.761.
--
-- Con caché fría se pasa del tope de 8 segundos del rol `authenticated` y la operación
-- falla. Pasó de verdad durante las pruebas:
--   Ficha — falló la consulta a roomix_properties: 57014 canceling statement due to
--   statement timeout  ->  POST /api/seleccion 503 in 10171ms
--
-- LA SOLUCIÓN. Un índice sobre la MISMA expresión que usa la vista. `id` es bigint, así que
-- `id::text` es inmutable y la expresión se puede indexar.
--
-- POR QUÉ NO ES PARCIAL. Se evaluó acotarlo al filtro de la vista (venta + calidad ok +
-- activo). No se hace: son 60.278 de 62.761 filas, o sea que el índice completo pesa
-- prácticamente lo mismo, y así sirve TAMBIÉN para las consultas que no usan la vista (el
-- mapa filtra por `is_active`, no por los tres campos) y no se rompe si mañana la vista
-- expone alquileres.
--
-- SOBRE EL BLOQUEO. `mercado_avisos` está particionada, y CREATE INDEX CONCURRENTLY no se
-- puede usar sobre la tabla padre. Con 62.761 filas el índice se construye en segundos; el
-- bloqueo de escritura dura eso. Si en algún momento la tabla crece mucho, la alternativa es
-- crear el índice CONCURRENTLY en cada partición y después adjuntarlos al padre.

CREATE INDEX IF NOT EXISTS mercado_avisos_slug_idx
  ON public.mercado_avisos ((COALESCE(slug, id::text)));

COMMENT ON INDEX public.mercado_avisos_slug_idx IS
  'Buscar un aviso por su codigo publico. La vista roomix_properties lo expone como COALESCE(slug, id::text); sin este indice esa busqueda hace Seq Scan de las dos particiones y con cache fria se pasa del statement_timeout.';
