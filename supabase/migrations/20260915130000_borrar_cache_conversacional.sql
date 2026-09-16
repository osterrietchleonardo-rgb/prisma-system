-- Borra la caché vieja de Inteligencia Conversacional (15/9/2026, OK de Leonardo).
--
-- Desde la tanda 3 de la auditoría del Dashboard, la sección se calcula en vivo en cada carga
-- (lib/queries/conversacional.ts) y ya nadie lee ni escribe esta tabla: se borraron las rutas
-- /api/conversational-insights/{analyze,status}. Tenía 18 filas, todas de PRISMAIA - VAKDOR
-- (Central nunca tuvo un análisis guardado). Sin vistas, claves foráneas ni disparadores que
-- dependan de ella; sus 4 políticas RLS se van con la tabla.
--
-- ORDEN: aplicar recién cuando el código nuevo esté publicado. El código viejo la lee.
-- Respaldo de filas, columnas, políticas y restricciones: guardado antes de aplicar (ver bitácora).

drop table if exists public.dashboard_conversational_insights;
