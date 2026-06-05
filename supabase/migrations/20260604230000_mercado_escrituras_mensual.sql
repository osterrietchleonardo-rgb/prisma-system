      DROP TABLE IF EXISTS mercado_escrituras;

      CREATE TABLE mercado_escrituras (
        periodo             TEXT PRIMARY KEY,
        label               TEXT NOT NULL,
        cantidad_mensual    INTEGER NOT NULL,
        monto_millones_ars  NUMERIC,
        var_mensual_pct     NUMERIC,
        var_anual_pct       NUMERIC,
        fuente              TEXT DEFAULT 'Colegio de Escribanos CABA',
        fecha_actualizacion TIMESTAMPTZ DEFAULT now()
      );

      ALTER TABLE mercado_escrituras ENABLE ROW LEVEL SECURITY;

      CREATE POLICY "mercado_escrituras_select_public"
        ON mercado_escrituras FOR SELECT USING (true);
