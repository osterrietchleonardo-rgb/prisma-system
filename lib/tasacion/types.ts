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
