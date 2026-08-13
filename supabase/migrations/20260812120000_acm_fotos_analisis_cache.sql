-- ACM · Caché del análisis de fotos de comparables (3ra capa: fotos contra fotos).
--
-- Por qué existe: analizar 4 fotos con Gemini vision no es gratis (tiempo + costo), y las
-- propiedades de roomix se repiten entre ACM del mismo barrio (mismo comparable aparece en
-- varias búsquedas). Cachear POR PROPIEDAD (no por ACM) hace que el segundo ACM de la zona
-- reuse el análisis ya hecho del primero, en vez de repetirlo.
--
-- La clave incluye un hash de las fotos efectivamente usadas (primeras 4 de `images`, en
-- orden): si la publicación cambia sus fotos, el hash cambia y se vuelve a analizar sola,
-- sin necesidad de invalidar nada a mano.
--
-- Las fotos NO se persisten en ningún lado (tampoco acá): esta tabla guarda el VEREDICTO
-- (descripción + atributos) y el hash de las URLs, nunca la imagen ni la URL en sí.
--
-- Acceso: RLS activado SIN políticas (mismo molde que acm_searches / shared_acm_reports).
-- Solo el admin client (server, app/api/acm/fotos-comparables) lee y escribe acá. No hace
-- falta agency_id: los comparables de `roomix` son la red de colaboración (compartida entre
-- agencias) y los de `cartera` ya llegan pre-filtrados por agencia desde donde se llama a
-- este endpoint (la búsqueda de comparables ya scopeó agency_id antes de que un id de cartera
-- pueda llegar hasta acá).

CREATE TABLE IF NOT EXISTS public.acm_fotos_analisis_cache (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fuente                   text NOT NULL CHECK (fuente IN ('cartera', 'roomix')),
  property_id              text NOT NULL,
  -- sha256 (primeros 32 hex) de las URLs de fotos usadas, unidas con "|", en el orden en que
  -- vienen en `images`. Cambia si la publicación cambia sus fotos → se re-analiza sola.
  fotos_hash               text NOT NULL,
  descripcion              text NOT NULL DEFAULT '',
  fotos_muestran_interior  boolean NOT NULL,
  motivo_no_evaluable      text,
  -- Clasificación interna (ver docs .superpowers/sdd/.../calibracion-final.md): 'excelente' |
  -- 'bueno' | 'regular' | 'a_reciclar' | 'sin_evidencia'. calidad_terminaciones se guarda solo
  -- como dato de contexto (el asesor puede leerlo) — NO participa del ajuste del %.
  estado_conservacion      text,
  calidad_terminaciones    text,
  luminosidad              text,
  analizado_en             timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS acm_fotos_analisis_cache_key_idx
  ON public.acm_fotos_analisis_cache (fuente, property_id, fotos_hash);

ALTER TABLE public.acm_fotos_analisis_cache ENABLE ROW LEVEL SECURITY;
-- Sin políticas: nadie (anon/authenticated) accede directo. Solo service-role (server).
