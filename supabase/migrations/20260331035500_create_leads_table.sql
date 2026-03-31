-- Create leads table
CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Relaciones
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id),

  -- Datos del lead (Sección 1)
  nombre_lead text NOT NULL,
  telefono text,
  canal_origen text CHECK (canal_origen IN ('whatsapp','portal','referido','redes','llamada','presencial')),
  fecha_primer_contacto date NOT NULL DEFAULT CURRENT_DATE,
  estado text DEFAULT 'activo' CHECK (estado IN ('activo','visita_agendada','en_negociacion','cerrado','perdido')),
  notas text,

  -- Actividad (Sección 2)
  visita_realizada boolean DEFAULT false,
  fecha_visita date,
  propuesta_enviada boolean DEFAULT false,
  propiedad_ofrecida text,

  -- Resultado (Sección 3, solo si cerrado)
  tipo_operacion text CHECK (tipo_operacion IN ('venta','alquiler','temporal')),
  precio_operacion numeric(14,2),
  comision_generada numeric(12,2),
  dias_hasta_cierre int2,

  -- WA cuantitativo (Sección 4, calculado client-side)
  wa_quien_inicio text CHECK (wa_quien_inicio IN ('usuario','lead')),
  wa_tiempo_respuesta_inicial_min int2,
  wa_tiempo_respuesta_promedio_min int2,
  wa_duracion_dias int2,
  wa_total_mensajes int2,
  wa_mensajes_usuario int2,
  wa_mensajes_lead int2,
  wa_ratio numeric(4,2),
  wa_msgs_por_dia numeric(5,1),

  -- WA cualitativo (Server Action → Anthropic)
  wa_tono text,
  wa_nivel_personalizacion text,
  wa_ofrecio_visita boolean,
  wa_ofrecio_propiedades boolean,
  wa_seguimiento_activo boolean,
  wa_uso_nombre_lead boolean,
  wa_escucha_activa boolean,
  wa_score_profesionalismo int2,
  wa_score_general int2,
  wa_puntos_positivos text[],
  wa_puntos_mejora text[],
  wa_resumen text,
  wa_analisis_pendiente boolean DEFAULT false
);

-- Índices
CREATE INDEX idx_leads_user_id ON leads(user_id);
CREATE INDEX idx_leads_organization_id ON leads(organization_id);
CREATE INDEX idx_leads_estado ON leads(estado);
CREATE INDEX idx_leads_fecha ON leads(fecha_primer_contacto);

-- Updated_at automático
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER leads_updated_at BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Asesor: solo sus propios leads
CREATE POLICY "asesores_own_leads" ON leads
  FOR ALL USING (user_id = auth.uid());

-- Director: todos los leads de su organización
CREATE POLICY "directores_org_leads" ON leads
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role = 'director'
    )
  );
