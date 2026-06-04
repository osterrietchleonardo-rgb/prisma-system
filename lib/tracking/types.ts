import { z } from "zod";

export interface DashboardFilters {
  period: "week" | "month" | "3months" | "custom";
  userId?: string;
  startDate?: string;
  endDate?: string;
}

export interface WAMetrics {
  wa_quien_inicio?: "usuario" | "lead" | null;
  wa_tiempo_respuesta_inicial_min?: number | null;
  wa_tiempo_respuesta_promedio_min?: number | null;
  wa_duracion_dias?: number | null;
  wa_total_mensajes?: number | null;
  wa_mensajes_usuario?: number | null;
  wa_mensajes_lead?: number | null;
  wa_ratio?: number | null;
  wa_msgs_por_dia?: number | null;
}

export interface WAAnalysis {
  tono: "formal" | "informal" | "profesional" | "agresivo" | "pasivo";
  nivel_personalizacion: "alto" | "medio" | "bajo";
  ofrecio_visita: boolean;
  ofrecio_propiedades: boolean;
  seguimiento_activo: boolean;
  uso_nombre_lead: boolean;
  escucha_activa: boolean;
  score_profesionalismo: number;
  score_general: number;
  puntos_positivos: string[];
  puntos_mejora: string[];
  resumen: string;
}

export type ActivityType = 'prospeccion' | 'prelisting' | 'prebuying' | 'captacion' | 'reserva' | 'cierre';

export interface PerformanceLog extends WAMetrics, Partial<WAAnalysis> {
  id: string;
  created_at: string;
  updated_at: string;
  agent_id: string;
  agency_id: string;
  
  type: ActivityType;
  propiedad_ref: string | null;
  property_id?: string | null;
  lead_id?: string | null;
  wa_contact_id?: string | null;
  monto_operacion: number | null;
  comision_generada: number | null;
  fecha_actividad: string;
  fecha_cierre: string | null;
  
  metadata: Record<string, any>;
  wa_metrics?: any;
  wa_analysis?: any;
  ai_rating: number | null;
  ai_feedback: string | null;
  status?: 'original' | 'modificada' | 'eliminada';
  status_reason?: string | null;
  profiles?: {
    full_name: string;
    email: string;
  } | null;
  properties?: {
    id: string;
    title: string;
    address: string;
    tokko_id: string;
  } | null;
  leads?: {
    id: string;
    full_name: string;
  } | null;
  wa_contacts?: {
    id: string;
    name: string;
    phone: string;
  } | null;
}

export const performanceLogSchema = z.object({
  type: z.enum(['prospeccion', 'prelisting', 'prebuying', 'captacion', 'reserva', 'cierre']),
  propiedad_ref: z.string().optional().nullable(),
  property_id: z.string().uuid().optional().nullable(),
  lead_id: z.string().uuid().optional().nullable(),
  wa_contact_id: z.string().uuid().optional().nullable(),
  monto_operacion: z.number().optional().nullable(),
  comision_generada: z.number().optional().nullable(),
  fecha_actividad: z.string(),
  fecha_cierre: z.string().optional().nullable(),
  metadata: z.record(z.any()).default({}),
  // WhatsApp data
  waMetrics: z.any().optional(),
  waAnalysis: z.any().optional(),
});

export type PerformanceLogFormData = z.infer<typeof performanceLogSchema>;

export interface PerformanceMetric {
  target: number;
  weight: number;
  description: string;
}

export interface AgencyPerformanceConfig {
  metrics: {
    captacion: PerformanceMetric;
    transaccion: PerformanceMetric;
    facturacion: PerformanceMetric;
    rotacion: PerformanceMetric;
  };
  custom_instructions?: string;
}

