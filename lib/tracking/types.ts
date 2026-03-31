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

export interface Lead extends WAMetrics, Partial<WAAnalysis> {
  id: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  organization_id: string;

  nombre_lead: string;
  telefono: string | null;
  canal_origen: "whatsapp" | "portal" | "referido" | "redes" | "llamada" | "presencial" | null;
  fecha_primer_contacto: string;
  estado: "activo" | "visita_agendada" | "en_negociacion" | "cerrado" | "perdido";
  notas: string | null;

  visita_realizada: boolean;
  fecha_visita: string | null;
  propuesta_enviada: boolean;
  propiedad_ofrecida: string | null;

  tipo_operacion: "venta" | "alquiler" | "temporal" | null;
  precio_operacion: number | null;
  comision_generada: number | null;
  dias_hasta_cierre: number | null;

  wa_score_general?: number | null;
  wa_resumen?: string | null;
  wa_analisis_pendiente: boolean;
  seguimiento_activo?: boolean;
}

export const leadFormSchema = z.object({
  nombre_lead: z.string().min(1, "El nombre es requerido"),
  telefono: z.string().optional(),
  canal_origen: z.enum(["whatsapp", "portal", "referido", "redes", "llamada", "presencial"]).optional().nullable(),
  fecha_primer_contacto: z.string(), // YYYY-MM-DD
  estado: z.enum(["activo", "visita_agendada", "en_negociacion", "cerrado", "perdido"]),
  notas: z.string().optional().nullable(),

  visita_realizada: z.boolean().default(false),
  fecha_visita: z.string().optional().nullable(),
  propuesta_enviada: z.boolean().default(false),
  propiedad_ofrecida: z.string().optional().nullable(),

  tipo_operacion: z.enum(["venta", "alquiler", "temporal"]).optional().nullable(),
  precio_operacion: z.number().optional().nullable(),
  comision_generada: z.number().optional().nullable(),
  
  // Para mandar el JSON de wa metrics the API call
  waMetrics: z.any().optional(),
  waAnalysis: z.any().optional(),
  wa_analisis_pendiente: z.boolean().optional(),
});

export type LeadFormData = z.infer<typeof leadFormSchema>;

export interface KPIData {
  leadsCaptadosActual: number;
  leadsCaptadosAnterior: number;
  leadsCaptadosVar: number;

  operacionesActual: number;
  operacionesAnterior: number;
  operacionesVar: number;

  comisionActual: number;
  comisionAnterior: number;
  comisionVar: number;

  scorePromedioActual: number;
  scorePromedioAnterior: number;
  scorePromedioVar: number;
}
