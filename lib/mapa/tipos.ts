// Tipos compartidos del mapa del Buscador IA.
// Importante: todo lo que cruza archivos dentro de lib/mapa se importa con `import type`,
// para que Node pueda correr los tests sin resolver rutas en tiempo de ejecucion.
import type { UnifiedProperty } from "@/components/shared/consultor-results"

/** Rectangulo visible del mapa. Mismo orden que usa Leaflet: sur, oeste, norte, este. */
export interface BBox {
  sur: number
  oeste: number
  norte: number
  este: number
}

/**
 * De donde sale cada propiedad. Los valores son los que ya usa el chat:
 * "roomix" es el valor interno; en pantalla SIEMPRE se dice "Colaboracion".
 */
export type FuenteMapa = "own" | "agency" | "roomix"

export interface FiltrosMapa {
  operacion: "Venta" | "Alquiler"
  tipo: string | null
  precio_min: number | null
  precio_max: number | null
  moneda: "USD" | "ARS"
  ambientes_min: number | null
  fuentes: FuenteMapa[]
  /**
   * Barrio elegido en el buscador, tal como se escribe ("Núñez"). null = sin filtro.
   *
   * Se guarda la grafia que se muestra, no la normalizada: el chip de la pantalla y el
   * parametro de la consulta salen del mismo dato, y normalizarTexto() —que da lo mismo
   * que lower(unaccent(...)) de Postgres— hace la traduccion al consultar.
   */
  barrio: string | null
}

/** Una propiedad del mapa: la misma forma que ya usa el chat, mas la ubicacion. */
export type PropiedadMapa = UnifiedProperty & {
  lat: number | null
  lng: number | null
}

export interface RespuestaMapa {
  propiedades: PropiedadMapa[]
  /** true cuando habia mas propiedades que el tope y la respuesta viene cortada. */
  truncado: boolean
  total_devuelto: number
  /**
   * Fuentes que quedaron sin consultar porque no distinguen el tipo elegido
   * (la red de colaboracion, por ejemplo, no tiene lotes). Se avisa en pantalla:
   * "no hay" y "no se pudo preguntar" no son lo mismo.
   */
  sin_ese_tipo: { cartera: boolean; colaboracion: boolean }
}

export interface ZonaGuardada {
  id: string
  nombre: string
  descripcion: string | null
  geojson: unknown
  filtros: FiltrosMapa | null
  created_at: string
}

/**
 * Un pin del mapa. Puede contener varias propiedades: en la misma coordenada exacta
 * llegan a caer decenas de avisos (edificios enteros, o avisos que el portal ubica
 * en la esquina). Se dibuja UN pin y al clickearlo se abre la lista.
 */
export interface GrupoUbicacion {
  lat: number
  lng: number
  /** Clave estable "lat,lng" redondeada, para React. */
  clave: string
  propiedades: PropiedadMapa[]
  /** Color del pin: la cartera propia le gana a la agencia, y esta a colaboracion. */
  fuente_del_pin: FuenteMapa
  /**
   * Grupos de ids que parecen ser LA MISMA propiedad publicada por inmobiliarias
   * distintas. No se oculta ninguno: se muestran juntos y marcados.
   */
  posibles_repetidas: string[][]
}

// Este archivo es SOLO de tipos, a proposito: no exporta nada ejecutable.
// Asi todos los cruces dentro de lib/mapa son `import type`, que desaparecen al
// compilar, y los tests de Node corren sin tener que resolver rutas ni alias.
// Las constantes viven en el archivo que las usa (TOPE_PUNTOS en consulta.ts).
