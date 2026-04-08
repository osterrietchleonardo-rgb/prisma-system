export type CopyType = 'video' | 'post';
export type CopyAngle = 'pas' | 'autoridad' | 'transformacion' | 'social_proof' | 'curiosidad' | 'urgencia' | 'aspiracional' | 'datos';
export type ConsciousnessLevel = 0 | 1 | 2 | 3 | 4;
export type ImageFormat = 'reels' | 'post' | 'historia';
export type ImageStyle = 'moderno' | 'lujoso' | 'calido' | 'corporativo' | 'vibrante';

export interface IpcProfile {
  id: string;
  user_id: string;
  nombre_perfil: string;
  tipo_lead: 'Comprador' | 'Vendedor' | 'Inversor' | 'Otro';
  rango_edad: string;
  genero: 'Hombre' | 'Mujer' | 'Mixto';
  zona_geografica: string;
  presupuesto_estimado?: string;
  situacion_actual: string;
  motivacion_principal: string;
  problema_resuelve: string;
  nivel_urgencia: number;
  mayor_miedo: string[];
  objeciones: string;
  estilo_vida: string;
  intereses: string[];
  redes_sociales: string[];
  tipo_contenido: string[];
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
