// Prefactibilidad · tipos compartidos. GeoJSON escribe [lng, lat].
import type { Feature, MultiPolygon, Polygon } from "geojson";

export type Unidad = "CA" | "CM" | "USAA" | "USAM" | "USAB2" | "USAB1" | "USAB0";
export type TipoVolumen = "cuerpo principal" | "retiro 1" | "retiro 2" | "basamento";
export type Poligono = Polygon | MultiPolygon;

/** Un polígono de la capa oficial `volumen_edif` de Ciudad 3D, ya en lon/lat. */
export interface VolumenOficial {
  smp: string;
  tipo: TipoVolumen;
  unidad: Unidad;
  alturaInicial: number;
  alturaFinal: number;
  geom: Poligono;
}

export interface Planta {
  /** "Planta baja y 5 pisos", "Primer retirado", "Segundo retirado", "Basamento (PB y 1º)". */
  nombre: string;
  unidad: Unidad;
  m2PorNivel: number;
  niveles: number;
  desdeM: number;
  hastaM: number;
}

export interface Edificabilidad {
  modo: "oficial" | "regla";
  unidades: Unidad[];
  alturaMaxima: number;
  planoLimite: number;
  plantas: Planta[];
  m2Construibles: number;
  m2Vendibles: number;
  /** Huella del cuerpo principal recortada al lote, para dibujar. */
  huella: Poligono | null;
  /** Solo en modo regla: piso y techo del rango. */
  rango?: { piso: number; techo: number };
}

export interface CatastroParcela {
  smp: string;
  direccion: string;
  superficieTotal: number | null;
  superficieCubierta: number | null;
  frente: number | null;
  fondo: number | null;
  propiedadHorizontal: boolean;
  pisosSobreRasante: number | null;
  unidadesFuncionales: number | null;
  centroide: [number, number]; // [lng, lat]
}

export interface FilaCur {
  smp: string;
  uniEdif: number[];      // uni_edif_1..4 sin ceros
  planoL: number | null;
  tipoMza: "TIPICA" | "ATIPICA" | null;
  catalogado: number;
  distGrp: string | null;  // AE, U, APH, RUA, UP, ...
  distEsp: string | null;
  distCpu: string | null;
  barrio: string | null;
  comuna: string | null;
  publicado: string;       // fecha de publicación del dataset
}

export interface Aviso {
  clave: "esquina" | "atipica" | "area_especial" | "catalogado" | "dos_alturas" | "ph_consolidado" | "plano_limite_raro" | "sin_envolvente" | "sin_dato_codigo" | "puerta_ambigua";
  texto: string;
  /** true = exige la leyenda "requiere estudio profesional" arriba del bloque. */
  fuerte: boolean;
}

export interface TerrenoCerca {
  id: number;
  titulo: string | null;
  direccion: string | null;
  barrio: string | null;
  precioUsd: number;
  superficieM2: number;
  distanciaM: number;
  url: string;
  foto: string | null;
}

export interface ValorTierra {
  comparables: TerrenoCerca[];
  usdM2Mediana: number;
  usdM2P25: number;
  usdM2P75: number;
  valorLote: { desde: number; mediana: number; hasta: number };
}

export interface Prefactibilidad {
  direccion: string;
  smp: string;
  lote: CatastroParcela;
  geomLote: Poligono;
  geomManzana: Poligono | null;
  manzanaTipo: "TIPICA" | "ATIPICA" | null;
  cur: FilaCur | null;
  edificabilidad: Edificabilidad;
  avisos: Aviso[];
  tierra: ValorTierra | null;
  fuentes: { curPublicado: string | null; consultadoEn: string };
}

export type FeatureVolumen = Feature<Poligono, { smp: string; tipo: string; edificabil: string; altura_inicial: number; altura_final: number }>;
