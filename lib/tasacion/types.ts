export type TipoPropiedad = 'departamento' | 'casa' | 'ph' | 'local' | 'oficina' | 'terreno';
export type EstadoConservacion = 'muy_bueno' | 'bueno' | 'regular' | 'malo' | 'muy_malo';
export type CalidadConstruccion = 'economica' | 'estandar' | 'buena' | 'premium' | 'lujo';
export type Orientacion = 'norte' | 'sur' | 'este' | 'oeste' | 'ne' | 'no' | 'se' | 'so' | 'nd';
export type Vista = 'frente' | 'contrafrente' | 'lateral' | 'al_verde' | 'panoramica' | 'nd';
export type SituacionOcupacion = 'libre' | 'alquilado' | 'ocupado';
export type Moneda = 'ARS' | 'USD';

export interface Amenidades {
  cochera_cubierta: boolean;
  cochera_descubierta: boolean;
  baulera: boolean;
  pileta: boolean;
  gimnasio: boolean;
  sum: boolean;
  seguridad_24hs: boolean;
  jardin_privado: boolean;
  terraza_privada: boolean;
}

export interface Sujeto {
  // Identificación
  direccion: string;
  barrio: string;
  tipo_propiedad: TipoPropiedad;
  
  // Superficies
  m2_cubiertos: number;
  m2_semicubiertos: number;
  m2_descubiertos: number;
  m2_terreno?: number;
  
  // Características físicas
  antiguedad_anios: number;
  estado_conservacion: EstadoConservacion;
  calidad_construccion: CalidadConstruccion;
  dormitorios: number;
  banos: number;
  orientacion: Orientacion;
  piso: number; // 0 para PB, o null/undefined si no aplica (casa)
  vista: Vista;
  amenidades: Amenidades;
  
  // Situación
  ocupacion: SituacionOcupacion;
  moneda: Moneda;
}

export interface Comparable extends Omit<Sujeto, 'ocupacion'> {
  id: string; // ID interno o de Tokko
  fuente: 'Tokko' | 'ZonaProp' | 'Argenprop' | 'MercadoLibre' | 'Portal propio' | 'Operación propia cerrada' | 'Colega' | 'Otro';
  url_referencia?: string;
  precio: number;
  fecha_operacion: string; // ISO String
  tipo_precio: 'oferta' | 'cierre';
  peso: number; // 1 a 5, por defecto 3, si es cerrado tokko 5
}

// ─────────────────────────────────────────────────────────────────────────────
// ACM — Análisis Comparativo de Mercado
// ─────────────────────────────────────────────────────────────────────────────

export type Operacion = 'venta' | 'alquiler';
export type AcmSource = 'cartera' | 'roomix';

// Cada renglón del checklist de comparabilidad (qué coincide y qué no).
export interface ChecklistItem {
  dimension: 'tipo' | 'operacion' | 'zona' | 'superficie' | 'ambientes' | 'banos' | 'amenities' | 'semantica';
  label: string;
  sujeto_val: string;
  comp_val: string;
  estado: 'match' | 'parcial' | 'distinto' | 'na';
  peso: number;     // peso base de la dimensión (0..25)
  score: number | null; // 0..100 o null si no aplica (sin dato)
}

// Un comparable encontrado por el ACM (propiedad real de la cartera o de la red).
export interface AcmComparable {
  id: string;
  source: AcmSource;
  match_pct: number;
  checklist: ChecklistItem[];

  titulo: string;
  direccion: string;
  zona: string;
  tipo: string;
  m2: number | null;
  ambientes: number | null;
  dormitorios: number | null;
  banos: number | null;

  // Precio: dato aparte, NO entra en el %.
  precio: number | null;
  moneda: string;
  precio_m2: number | null;

  imagen: string | null;
  url: string | null;

  // Responsable de la publicación + fecha (para la red de colaboración / portales).
  responsable: string;
  fecha_publicacion: string | null; // ISO o null
}

// Lo que devuelve la extracción por URL (modo "Analizar").
export interface ExtractResult {
  ok: boolean;
  sujeto: Partial<Sujeto>;
  precio: number | null;
  moneda: Moneda | null;      // null = no se pudo determinar (se completa a mano; NO se asume USD)
  operacion: Operacion | null; // null = no se pudo determinar (NO se asume "venta")
  responsable: string | null;
  fecha_publicacion: string | null;
  fuente_portal: string | null;
  metodo: 'json-ld' | 'next-data' | 'opengraph' | 'ia' | 'extractor-service';
  requiere_completar_manual: boolean;
  aviso?: string;
}

export interface FactorAjusteValor {
  superficie: number;
  antiguedad_estado: number;
  piso_vista: number;
  amenidades: number;
  temporal: number;
  oferta_cierre: number;
  manual: number;
  total_porcentaje: number;
  nota_manual?: string;
}

export interface ResultadoComparable {
  comparable_id: string;
  superficie_equivalente: number;
  precio_base_m2: number;
  factores_aplicados: FactorAjusteValor; 
  precio_m2_ajustado: number;
  es_outlier: boolean;
  excluido: boolean;
}

export interface ResultadoTasacion {
  superficie_equivalente_sujeto: number;
  precio_minimo_m2: number;
  precio_medio_m2: number;
  precio_maximo_m2: number;
  precio_medio_m2_ponderado: number;
  valor_minimo: number;
  valor_medio: number;
  valor_maximo: number;
  valor_sugerido_publicacion: number;
  resultados_comparables: ResultadoComparable[];
}

export interface TasacionRow {
  id: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  sujeto: Sujeto;
  comparables: Comparable[];
  factores_configuracion: Record<string, any>;
  resultado: ResultadoTasacion;
  observaciones: string;
  cliente_nombre: string;
  estado: 'borrador' | 'finalizada';
}
