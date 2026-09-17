-- supabase/migrations/20260917180000_farming_tablero.sql
--
-- Farming · etapa 3-B: el índice que aparece recién ahora, cuando el historial se empieza a
-- llenar (farming_contactos está vacía desde que la creó 20260917120000; esta etapa es la que
-- la llena).
--
-- QUÉ NO SE TOCA: ninguna tabla, ninguna columna, ninguna política. Es un índice.
-- Aplicar por Management API con el OK de Leonardo.
-- Rollback: supabase/rollback/20260917_farming_tablero_rollback.sql
--
-- SE DESCARTÓ EL SEGUNDO ÍNDICE DEL BRIEF (direccion_id, tipo, etapa_hasta): la única consulta
-- que hoy lee tipo/etapa_hasta de farming_contactos es la de los nueve indicadores
-- (app/api/farming/direcciones/route.ts, tarea 4 de este mismo plan), y esa consulta filtra
-- SOLO por direccion_id (las direcciones de la zona pedida) — tipo y etapa_hasta se traen como
-- columnas y se cuentan en JS, en lib/farming/tablero.ts:calcularIndicadores, no en un WHERE.
-- El índice de 3-A, farming_contactos_direccion_idx (direccion_id, fecha desc), ya resuelve
-- exactamente esa consulta: nunca recorre el historial de la agencia, porque ya se detiene en
-- las direcciones de la zona. Un índice que nadie filtra no gana nada y sí paga un escritura de
-- más en cada insert de farming_contactos, que es justo la tabla que esta etapa va a llenar.
-- Si el día de mañana aparece una consulta que SÍ filtra por tipo o por etapa_hasta, se agrega
-- ese índice en una migración nueva, con esa consulta como prueba.

begin;

-- La etapa 3-A dejó `propietario_id` con `on delete set null` y sin índice. Mientras la tabla
-- estuvo vacía no importó; desde que el historial se llena, borrar una persona
-- (DELETE en app/api/farming/direcciones/[id]/propietarios/[pid]/route.ts, que ya existe y ya
-- se usa) recorre toda farming_contactos para poner en null sus filas. Parcial: solo indexa las
-- filas que de verdad tienen una persona asociada.
create index if not exists farming_contactos_propietario_idx
  on public.farming_contactos (propietario_id)
  where propietario_id is not null;

commit;
