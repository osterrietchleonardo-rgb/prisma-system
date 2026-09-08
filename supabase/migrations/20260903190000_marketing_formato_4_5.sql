-- Marketing IA · Sumar el formato 4:5 (post vertical de Instagram) a las placas.
--
-- POR QUE: la pantalla solo ofrecia 9:16 y 1:1. Instagram muestra el feed en 4:5, que es el que
-- mas pantalla ocupa, y es el que pidio el cliente. La columna `format` tiene un CHECK, asi que
-- sin esto el insert falla con 23514 y la placa se genera, se paga y se pierde.
--
-- QUE NO SE TOCA: 'reels', 'post' e 'historia' siguen permitidos. Al 3-sep-2026 hay 45 placas
-- 'reels', 19 'post' y 12 'historia' en produccion; sacar cualquiera de esos valores dejaria
-- filas violando su propia restriccion. 'historia' se retira de la PANTALLA (era el mismo tamano
-- que 'reels'), pero sigue siendo un valor valido para lo ya generado.
--
-- Es aditiva y reversible: para volver atras, alcanza con recrear el CHECK sin 'post_vertical',
-- siempre que no se haya generado ninguna placa con ese formato todavia.

ALTER TABLE generated_images
  DROP CONSTRAINT IF EXISTS generated_images_format_check;

ALTER TABLE generated_images
  ADD CONSTRAINT generated_images_format_check
  CHECK (format IN ('reels', 'post', 'post_vertical', 'historia'));
