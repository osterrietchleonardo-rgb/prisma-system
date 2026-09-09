-- ============================================================================
-- `operacion_id`: qué filas de performance_logs son el MISMO negocio.
--
-- El problema: cada fila es la actividad de UN asesor. Cuando dos asesores
-- trabajan la misma venta —uno la punta del vendedor, el otro la del
-- comprador— quedan dos filas con el mismo `monto_operacion`, y el sistema no
-- tiene forma de saber que son la misma propiedad vendida una sola vez. El
-- volumen se suma dos veces, y con él el "Honorario Real", que se calcula
-- sobre el volumen.
--
-- El conteo de negocios NO tiene este problema: ya lo resuelve el campo
-- Participación (media punta = 0,5). Y la facturación (GCI) tampoco, desde que
-- el formulario pide el honorario DE TU PUNTA y no el total de la operación:
-- ahí sumar fila por fila es correcto. Lo único que falta es el volumen.
--
-- NULLABLE a propósito, y sin backfill. `operacion_id IS NULL` significa "esta
-- fila es su propia operación", que es exactamente lo que corresponde a todo lo
-- ya cargado: hoy no hay forma honesta de adivinar qué filas históricas fueron
-- el mismo negocio. Agrupar por dirección y fecha seria inventar: las
-- direcciones son texto libre ("ESPINOSA 3166 - CABA" vs "Espinosa 3166") y dos
-- ventas en el mismo edificio el mismo día colisionarían.
--
-- Es un uuid suelto y no una FK a una tabla `operaciones`: por ahora lo único
-- que hace falta es agrupar. Si más adelante hay datos propios de la operación
-- (la propiedad, el precio de cierre, la fecha de escritura), esa tabla se
-- puede crear después y esta columna pasa a apuntarle sin migrar los valores.
--
-- Qué NO toca esta migración: ninguna fila existente cambia de valor, ningún
-- monto se mueve, ningún `type`, `proceso` ni `status` se modifica, y ninguna
-- política de RLS se altera (las de performance_logs no nombran columnas, así
-- que agregar una no las afecta). Es sólo una columna nueva, vacía, más su
-- índice. Revertirla es un DROP COLUMN.
-- ============================================================================

ALTER TABLE public.performance_logs
  ADD COLUMN IF NOT EXISTS operacion_id uuid;

-- El dashboard siempre pregunta por las operaciones de UNA agencia. El índice
-- es parcial porque la enorme mayoría de las filas tiene la columna en NULL
-- (cada una es su propia operación) y esas no se agrupan por acá.
CREATE INDEX IF NOT EXISTS performance_logs_operacion_idx
  ON public.performance_logs (agency_id, operacion_id)
  WHERE operacion_id IS NOT NULL;

COMMENT ON COLUMN public.performance_logs.operacion_id IS
  'Agrupa las filas que son el mismo negocio (dos asesores, una punta cada uno). NULL = esta fila es su propia operacion. Se usa para no contar dos veces el volumen.';
