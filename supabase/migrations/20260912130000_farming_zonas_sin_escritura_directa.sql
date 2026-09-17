-- supabase/migrations/20260912130000_farming_zonas_sin_escritura_directa.sql
--
-- Farming · revisión final — cerrar la escritura directa por PostgREST.
--
-- El hallazgo (revisión de la rama farming-zonas, Important 1): la política de UPDATE de
-- `farming_zonas` deja pasar cualquier `with check` donde `owner_user_id = auth.uid()`, SIN
-- mirar a qué `agency_id` se está escribiendo. Un asesor, con su propio JWT (no el
-- service_role de la app), puede hacer:
--
--   PATCH /rest/v1/farming_zonas?id=eq.<la suya>   { "agency_id": "<otra agencia>" }
--
-- Sigue siendo el dueño de la fila, así que la política lo deja pasar, y su zona aparece en
-- el mapa de farming de OTRA inmobiliaria: agency_id es la llave de visibilidad de esta
-- tabla, así que esto no es una regla de negocio salteada, es escribir en el tenant de otro.
-- Por el mismo camino puede reescribir `geojson` y `area_km2` sin pasar por los 5 km², el
-- tope de 3 zonas ni el control de choque (todo eso vive en app/api/farming, no en la base).
--
-- La app entera escribe estas dos tablas con `createAdminClient` (service_role, que se
-- saltea RLS) y filtra a mano por agencia y dueño en cada endpoint (ver
-- lib/farming/servidor.ts y app/api/farming/**). Por eso la corrección de fondo no es
-- "arreglar el with check": es que `authenticated` (y `anon`, que hoy tiene el mismo grant
-- por default de Supabase aunque ninguna política lo nombre) directamente NO necesitan poder
-- escribir estas tablas por PostgREST. Nunca lo hacen desde la app.
--
-- Qué NO cambia: el SELECT sigue igual (toda la agencia ve el contorno y de quién es cada
-- zona; es lo que evita dibujar a ciegas). Las políticas de INSERT/UPDATE/DELETE de la
-- migración anterior (20260912120000_farming_zonas.sql) NO se borran: quedan como
-- documentación de la intención ("el dueño edita la suya, el director libera"), pero ya no
-- las puede alcanzar nadie sin service_role, porque el grant que las activa se retira acá.
-- `service_role` no tiene estos grants (los tiene todos, siempre) así que la app sigue
-- escribiendo exactamente igual.
--
-- Después de aplicar esto en producción hay que volver a correr scripts/farming-rls-ataque.mjs:
-- "no está hecho hasta que el ataque falla" (dos ataques nuevos: A cambiándose su propio
-- agency_id, y A reescribiendo su geojson por PostgREST salteando los topes).
--
-- Aplicar por Management API (scripts/sql-produccion.mjs) con el OK de Leonardo.
-- Rollback: supabase/rollback/20260912_farming_zonas_sin_escritura_directa_rollback.sql

begin;

revoke insert, update, delete on public.farming_zonas from authenticated, anon;
revoke insert, update, delete on public.farming_zonas_compartidas from authenticated, anon;

commit;
