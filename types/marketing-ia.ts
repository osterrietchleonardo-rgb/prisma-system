export type CopyType = 'video' | 'post';
export type CopyAngle = 'pas' | 'autoridad' | 'transformacion' | 'social_proof' | 'curiosidad' | 'urgencia' | 'aspiracional' | 'datos';
export type ConsciousnessLevel = 0 | 1 | 2 | 3 | 4;
export type ImageFormat = 'reels' | 'post' | 'historia';
export type ImageStyle = 'moderno' | 'lujoso' | 'calido' | 'corporativo' | 'vibrante';

export interface IpcProfile {
  id: string;
  user_id: string;
  nombre_perfil: string;
  rango_edad: string;
  genero: 'Hombre' | 'Mujer' | 'Mixto';
  zona_geografica: string;
  rol_sector: string;
  problema_principal: string;
  mayor_frustracion: string;
  pierde_tiempo_dinero: string;
  mayor_estres: string;
  mayor_miedo: string[];
  freno_para_avanzar: string;
  objeciones: string;
  meta_12_meses: string;
  negocio_ideal: string;
  vida_transformada: string;
  motiva_decision: string[];
  valora_en_proveedor: string;
  trigger_decision: string;
  redes_sociales: string[];
  tipo_contenido: string[];
  frecuencia_publica: string;
  created_at: string;
  updated_at: string;
}

export interface TokkoProperty {
  id: number;
  reference_code: string;
  title: string;
  address: string;
  zone: string;
  property_type: string;
  operation_type: string;
  price: number;
  currency: string;          // "USD" | "ARS"
  surface_total: number;
  surface_covered: number;
  rooms: number;
  bathrooms: number;
  description: string;
  photos: Array<{ thumb: string; image: string }>;
  tags: string[];
}

export interface CopyContent {
  hook: string;
  problema?: string;
  agitacion?: string;
  solucion?: string;
  desarrollo?: string;
  cta: string;
}

export interface CopyDraft {
  id: string;
  user_id: string;
  ipc_id: string;
  copy_type: CopyType;
  angle: CopyAngle;
  consciousness_level: ConsciousnessLevel;
  extra_context?: string;
  content: CopyContent;
  tokko_property?: TokkoProperty | null;
  version: number;
  parent_draft_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface GeneratedImage {
  id: string;
  user_id: string;
  draft_id: string;
  format: ImageFormat;
  style: ImageStyle;
  storage_path: string;
  public_url: string;
  width: number;
  height: number;
  extra_prompt?: string;
  created_at: string;
}

export interface GenerateCopyPayload {
  ipc_id: string;
  copy_type: CopyType;
  angle: CopyAngle;
  consciousness_level: ConsciousnessLevel;
  extra_context?: string;
}

export interface GenerateImagePayload {
  draft_id: string;
  copy_content: CopyContent;
  tokko_property?: TokkoProperty | null;
  format: ImageFormat;
  style: ImageStyle;
  extra_prompt?: string;
}
