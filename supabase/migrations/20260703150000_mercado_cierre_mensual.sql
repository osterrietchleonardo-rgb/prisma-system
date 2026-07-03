-- Serie histórica mensual de precios de CIERRE reales en CABA.
-- Fuente: "Índice Real m2 by REMAX y UCEMA" (PDF mensual en ucema.edu.ar,
-- con respaldo de Reporte Inmobiliario). Cada informe trae la serie completa
-- desde 2020, por lo que el sync repuebla todos los meses en cada corrida.

CREATE TABLE IF NOT EXISTS mercado_cierre_mensual (
  periodo             TEXT PRIMARY KEY,   -- 'YYYY-MM'
  cierre_general_usd  NUMERIC,            -- USD/m² cierre promedio CABA
  cierre_1amb_usd     NUMERIC,
  cierre_2amb_usd     NUMERIC,
  cierre_3amb_usd     NUMERIC,
  brecha_general_pct  NUMERIC,            -- % cierre vs publicado (negativo = cierra por debajo)
  brecha_1amb_pct     NUMERIC,
  brecha_2amb_pct     NUMERIC,
  brecha_3amb_pct     NUMERIC,
  fuente              TEXT DEFAULT 'Índice Real m2 by REMAX y UCEMA',
  url_pdf             TEXT,
  fecha_actualizacion TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE mercado_cierre_mensual ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mercado_cierre_mensual_select_public"
  ON mercado_cierre_mensual FOR SELECT USING (true);
