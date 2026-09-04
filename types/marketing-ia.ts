export type CopyType = 'video' | 'post';
export type CopyAngle = 'pas' | 'autoridad' | 'transformacion' | 'social_proof' | 'curiosidad' | 'urgencia' | 'aspiracional' | 'datos';
export type ConsciousnessLevel = 0 | 1 | 2 | 3 | 4;
// 'historia' quedo RETIRADA de la pantalla el 3-sep-2026 (era el mismo tamano que 'reels'), pero
// sigue viva en la base y en las placas ya generadas, asi que no se saca del tipo.
// Las medidas de cada uno estan en lib/marketing-ia/formatos.ts, no aca.
export type ImageFormat = 'reels' | 'post' | 'post_vertical' | 'historia';
export type ImageStyle = 'moderno' | 'lujoso' | 'calido' | 'corporativo' | 'vibrante';

export interface CaptarFlowData {
  tipo_propietario: string;
  motivo_venta: string;
  etapa_hoy: string;
  urgencia_necesidad: string;
  dependencia_venta: 'Si' | 'No';
  preocupaciones: string[];
  objecion_principal: string;
  freno_hoy: string;
  miedo_frecuente: string;
  logro_esperado: string;
  valor_prioridad: string;
  tipo_inmobiliaria_confia: string;
  prueba_confianza: string[];
  angulo_marketing: string;
  tono_comunicacion: string;
  canal_formato: string[];
  no_prometer: string;
  resumen_frase: string;
  promesa_central: string;
  cta_recomendado: string;
  nivel_conciencia: string;
}

export interface VenderFlowData {
  tipo_comprador_ideal: string;
  situacion_vida: string;
  necesidad_concreta: string;
  problema_resolver: string;
  resultado_querido: string;
  valor_prioridad: string;
  atractivo_propiedad: string[];
  factores_duda: string[];
  objecion_comun: string;
  evidencia_necesaria: string[];
  angulo_marketing: string;
  promesa_central: string;
  tono: string;
  formato_anuncio: string[];
  no_mostrar: string;
  resumen_frase: string;
  mensaje_central: string;
  cta: string;
  nivel_conciencia: string;
}

export interface IpcProfile {
  id: string;
  user_id: string;
  nombre_perfil: string;
  tipo_ipc: 'captar' | 'vender';
  objetivo: string;
  tipo_inmueble: string[];
  zona_principal: string;
  rango_valor_precio: string;
  propiedad_tokko_id?: number;
  flow_data: CaptarFlowData | VenderFlowData;
  created_at: string;
  updated_at: string;
  // Legacy fields (optional for compatibility)
  tipo_lead?: string;
  rango_edad?: string;
  genero?: string;
  zona_geografica?: string;
  presupuesto_estimado?: string;
  situacion_actual?: string;
  motivacion_principal?: string;
  problema_resuelve?: string;
  nivel_urgencia?: number;
  mayor_miedo?: string[];
  objeciones?: string;
  estilo_vida?: string;
  intereses?: string[];
  redes_sociales?: string[];
  tipo_contenido?: string[];
  formato_preferido?: string;
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
  /** Opcional desde los guiones por bloques: ahí el CTA es el último bloque. */
  cta?: string;
  // ─── Guiones de video con estructura elegible ───
  estructura?: EstructuraId;
  duracion_estimada?: number;
  bloques?: BloqueGuion[];
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
  session_id?: string | null;
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

// ─────────────────────────────────────────────────────────────────────────────
// Forma de trabajar del asesor (oferta irresistible, fórmula de Hormozi)
// ─────────────────────────────────────────────────────────────────────────────

export type EstructuraId = 'variante_1' | 'variante_2' | 'aida' | 'pas' | 'bab' | 'storytelling';

// OJO: los tres bloques van como `type` y no como `interface` a propósito. Una interface no tiene
// índice implícito, así que `Partial<PerfilOperacion>` NO sería asignable a `Record<string, unknown>`
// y el recorrido genérico de campos (lib/marketing-ia/operacion-context.ts) no compilaría.

export type PerfilOperacion = {
  anios_experiencia: string;
  zona_dominio: string;
  especialidad: string;
  operaciones_cerradas: string;
  casos_reales: string;
  servicio_incluye: string;
  no_prometer: string;
};

export type CaptacionOperacion = {
  propiedades_vendidas_6m: string;
  porcentaje_acm: string;
  diferencial_confianza: string;
  compradores_activos: string;
  tiempo_entrega_acm: string;
  tiempo_primera_oferta: string;
  diferencial_esfuerzo: string;
};

export type VentaOperacion = {
  diferencial_confianza: string;
  rebaja_promedio: string;
  exclusivas_offmarket: string;
  tiempo_primera_seleccion: string;
  semanas_hasta_reserva: string;
  diferencial_esfuerzo: string;
};

/** Una fila por usuario en la tabla advisor_operations. */
export interface AdvisorOperation {
  id: string;
  user_id: string;
  perfil: Partial<PerfilOperacion>;
  captacion: Partial<CaptacionOperacion>;
  venta: Partial<VentaOperacion>;
  oferta_captacion: string | null;
  oferta_venta: string | null;
  oferta_captacion_editada: boolean;
  oferta_venta_editada: boolean;
  ofertas_generadas_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Un bloque de un guion de video ya generado (lo que el asesor lee a cámara). */
export interface BloqueGuion {
  id: string;
  titulo: string;
  texto: string;
  segundos: number;
  indicacion: string;
  por_que: string;
}
