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
  // Estado de obra. Si alguna está en true, la propiedad no tiene uso y `antiguedad_anios`
  // se ignora: el ACM la compara solo contra propiedades del mismo estado.
  a_estrenar?: boolean;
  en_pozo?: boolean;
  // Descripción generada por la IA a partir de las fotos y editada por el asesor.
  // Entra al texto que se embebe para buscar comparables por similitud descriptiva.
  descripcion_ia?: string;
  // Si va o no en la ficha que recibe el cliente. Solo aplica si hay descripcion_ia.
  incluir_desc_ficha?: boolean;
  // ── 3ra capa de comparación: fotos contra fotos (lib/acm/analisis-fotos.ts) ──
  // Lo que la IA clasificó a partir de las MISMAS fotos que generaron descripcion_ia. Se guarda
  // tal cual lo devolvió el modelo, sin corregir — es el "antes" que se le muestra al asesor.
  atributos_fotos_ia?: import("@/lib/acm/analisis-fotos").AtributosFotoIA | null;
  // El anclaje que efectivamente se usa para comparar contra cada comparable: arranca en lo
  // que dijo la IA (atributos_fotos_ia) y el asesor lo corrige con un tap si no coincide con
  // lo que ve en persona. Mitigación directa del error de anclaje medido en
  // validacion-holdout.md (el modelo se equivocó calificando al SUJETO mismo en el límite
  // bueno/excelente, y como el score es relativo al sujeto, ese único error contaminaba las
  // seis comparaciones a la vez). Ausente = usar atributos_fotos_ia sin corregir.
  anclaje_estado_conservacion?: import("@/lib/acm/analisis-fotos").EstadoConservacionFoto;
  anclaje_luminosidad?: import("@/lib/acm/analisis-fotos").LuminosidadFoto;
  // Si el ACM buscó también en barrios linderos (zona_score 50) o se quedó estricto
  // (mismo barrio + sub-barrios). Vive acá, no en estado aparte, por el mismo motivo que
  // descripcion_ia: `sujeto` es lo que efectivamente se guarda en acm_searches.sujeto, así
  // que es el único lugar desde el que "Mis ACM" puede reconstruir qué modo produjo cada
  // resultado. Ausente/undefined en una búsqueda vieja = estricto (nunca hereda el default
  // 50 de la función SQL).
  incluir_linderos?: boolean;
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

/**
 * Tope de comparables que devuelve cada fuente (cartera y red) en una búsqueda.
 *
 * No es un recorte de calidad, es el techo de lo que tiene sentido mostrar: en un barrio grande
 * la función SQL llega a 2.000 coincidencias y ni el navegador ni el asesor procesan eso. La
 * lista viene ordenada de mayor a menor coincidencia, así que lo que queda afuera es siempre lo
 * que menos se parece.
 *
 * Lo usan los tres lados a la vez —el pedido del front, el tope duro del endpoint y el aviso que
 * lee el asesor— para que no puedan quedar diciendo números distintos.
 */
export const TOPE_COMPARABLES = 100;

// Cada renglón del checklist de comparabilidad (qué coincide y qué no).
export interface ChecklistItem {
  dimension: 'tipo' | 'operacion' | 'zona' | 'superficie' | 'ambientes' | 'dormitorios' | 'banos' | 'antiguedad' | 'amenities' | 'semantica';
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
  expensas: number | null;     // expensas mensuales si el aviso las muestra (parte del costo)
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
