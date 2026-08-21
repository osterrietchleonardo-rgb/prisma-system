-- Índice único sobre roomix_properties.slug.
--
-- Por qué: "Compartir ficha" de una propiedad de un colega la busca por slug
-- (app/api/ficha/share/route.ts). Sin índice, eso recorría las 356.314 filas de
-- la tabla: 6,1 a 7,0 s medidos, contra el statement_timeout de 8 s del rol
-- `authenticated`. Cuando se pasaba, el endpoint respondía "No se encontró la
-- propiedad o no pertenece a tu agencia" (falso) y el asesor se quedaba sin la
-- ficha. Le pasó a Carolina Etcheverry el 4/8/2026: a las 22:54 funcionó y a
-- las 23:28, con la misma propiedad, falló.
--
-- UNIQUE porque el slug ya es único hoy: 356.314 filas = 356.314 slugs distintos.
-- CONCURRENTLY para no bloquear la tabla mientras se construye.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_roomix_slug
  ON public.roomix_properties USING btree (slug);
