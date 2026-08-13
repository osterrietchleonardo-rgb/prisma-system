// ─────────────────────────────────────────────────────────────────────────────
// ACM · Tercera capa de comparación: fotos contra fotos.
//
// Este módulo es el corazón de la Feature B (docs .superpowers/sdd/2026-08-06-acm-zona-
// estricta-y-fotos-ia/task-12-report.md). Junta tres cosas que antes vivían separadas:
//
//  1) El prompt + schema de análisis de fotos — el MISMO para el sujeto y para cada
//     comparable, verbatim de la ronda 3 de calibración (calibracion-final.md), que fue
//     la que dio mejor resultado (r=0.96 en su propia muestra) de las cuatro rondas.
//  2) `extraerAnalisisFotos` — parsea la respuesta estructurada de Gemini.
//  3) La fórmula de ajuste ±5 (`scoreComparacionFotos` + `ajustePorScore`), pura y sin
//     dependencias de Node, para que la pueda usar tanto el endpoint (server) como el
//     componente de resultados (client) — así el ajuste se recalcula al toque cuando el
//     asesor corrige el anclaje del sujeto, sin volver a llamar a Gemini.
//
// LA ADVERTENCIA QUE HAY QUE LEER ANTES DE TOCAR ESTO:
// `validacion-holdout.md` midió que esta misma fórmula, aplicada tal cual sobre datos que
// nunca vio (San Telmo), se cae a r=0.13 con 36% de pares invertidos — el modelo se
// equivocó calificando al SUJETO mismo (límite bueno/excelente), y como el score es
// relativo al sujeto, ese error de anclaje contamina las seis comparaciones a la vez.
// La mitigación que este módulo habilita —y que NO está probada, es una hipótesis— es
// dejar que el asesor corrija el anclaje de su propia propiedad con un tap antes de que
// la comparación corra (ver `fotos-ia.tsx`). Por eso el ajuste SIEMPRE se muestra con su
// antes/después y su motivo (nunca un número que cambió solo), y por eso la capa entera
// tiene que poder apagarse si el asesor la ve ordenando mal en la práctica.
// ─────────────────────────────────────────────────────────────────────────────
import { SchemaType, type Schema } from "@google/generative-ai";
import { recortarAPalabra, MAX_DESC_IA } from "./descripcion-ia";

export const MAX_FOTOS_ANALISIS = 4;
/** Tope de comparables analizados por corrida (dato real: 12.8 comparables ≥90% en promedio,
 *  máximo 54 — sin tope, el peor caso serían 54 llamadas de visión con el cliente esperando). */
export const MAX_COMPARABLES_ANALISIS = 10;
/** Piso de match_pct para entrar a esta capa: por debajo de 90 las dos primeras capas ya
 *  discriminan bien: no hace falta gastar una llamada de visión. */
export const PISO_MATCH_PCT_ANALISIS = 90;

// ── Niveles de la clasificación interna (calibracion-final.md, prompt v2) ──
export type EstadoConservacionFoto = "excelente" | "bueno" | "regular" | "a_reciclar" | "sin_evidencia";
export type LuminosidadFoto = "alta" | "media" | "baja" | "sin_evidencia";
/** Informativo únicamente: NO participa del ajuste ±5 (calibracion-final.md, flipeó 33% de
 *  las veces en el mismo caso límite dos rondas seguidas — inestable, se sigue generando
 *  porque el dato es útil como contexto, pero no debe mover puntos de una valuación real). */
export type CalidadTerminacionesFoto = "alta" | "estandar" | "basica" | "sin_evidencia";

export const NIVELES_ESTADO: EstadoConservacionFoto[] = ["excelente", "bueno", "regular", "a_reciclar", "sin_evidencia"];
export const NIVELES_LUMINOSIDAD: LuminosidadFoto[] = ["alta", "media", "baja", "sin_evidencia"];
export const NIVELES_TERMINACIONES: CalidadTerminacionesFoto[] = ["alta", "estandar", "basica", "sin_evidencia"];

export const LABEL_ESTADO: Record<EstadoConservacionFoto, string> = {
  excelente: "Excelente",
  bueno: "Bueno",
  regular: "Regular",
  a_reciclar: "A reciclar",
  sin_evidencia: "Sin evidencia en las fotos",
};
export const LABEL_LUMINOSIDAD: Record<LuminosidadFoto, string> = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
  sin_evidencia: "Sin evidencia en las fotos",
};

export interface AtributosFotoIA {
  fotos_muestran_interior: boolean;
  /** Motivo si `fotos_muestran_interior` es false (render, palier, planos). null si es true. */
  motivo_no_evaluable: string | null;
  estado_conservacion: EstadoConservacionFoto;
  calidad_terminaciones: CalidadTerminacionesFoto;
  luminosidad: LuminosidadFoto;
}

export interface AnalisisFotoIA {
  descripcion: string;
  /** null = el modelo no devolvió el bloque de clasificación (JSON roto, campo ausente). */
  atributos: AtributosFotoIA | null;
}

// ── Prompt (verbatim de calibracion-final.md, con el mismo armazón que ya usaba la Task 6
//    para la descripción comercial: no se tocó una palabra de esa parte) ──

/** Arma el bloque "Datos cargados: ..." a partir de los datos que ya tiene la propiedad
 *  (sujeto o comparable). Mismo formato para los dos casos, así las dos descripciones que
 *  se muestran lado a lado están armadas con el mismo criterio. */
export function contextoParaPrompt(d: {
  tipo_propiedad?: string | null;
  barrio?: string | null;
  m2_cubiertos?: number | null;
  dormitorios?: number | null;
  banos?: number | null;
}): string {
  return [
    d.tipo_propiedad && `Tipo: ${d.tipo_propiedad}`,
    d.barrio && `Barrio: ${d.barrio}`,
    d.m2_cubiertos && `Superficie cubierta: ${d.m2_cubiertos} m²`,
    d.dormitorios && `Dormitorios: ${d.dormitorios}`,
    d.banos && `Baños: ${d.banos}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function construirPromptAnalisisFotos(args: { cuantas: string; contexto: string; foco?: string }): string {
  const { cuantas, contexto, foco } = args;
  return `Sos un redactor inmobiliario argentino. Vas a describir una propiedad a partir de sus fotos.

Análisis visual previo: Observá detenidamente ${cuantas} buscando indicadores de luminosidad (fuentes de luz natural, sombras), estado de conservación (pisos, paredes, humedad) y distribución espacial.

Describí únicamente lo que se ve en las fotos basándote en el análisis anterior. Si algo no se ve, no lo afirmes.

Nunca contradigas los datos cargados de la propiedad.${contexto ? `\nDatos cargados: ${contexto}` : ""}

Tono de aviso profesional argentino, español rioplatense. Sin superlativos vacíos ("espectacular", "único", "soñado"), sin signos de exclamación.

No omitas ni disimules lo que está deteriorado, pero decilo con honestidad y sin castigar: "cocina original, con posibilidad de actualización" en lugar de "cocina vieja" o de no mencionarla.

Sin precio, sin datos de contacto, sin nombre de inmobiliaria.

Entre 400 y 600 caracteres, en un solo párrafo corrido.
${foco ? `\nEl asesor pidió enfocarse en: ${foco}. Priorizalo sin ignorar el resto de las características clave.` : ""}

Además de la descripción, completá una CLASIFICACIÓN INTERNA (no se le muestra al cliente, es solo para comparar propiedades entre sí) con estos campos:

- "fotos_muestran_interior": true si al menos una foto muestra el interior habitable de la unidad (cocina, baño, living, dormitorio). false si las fotos son SOLO de: palier/hall/lobby del edificio, fachada exterior, amenities comunes (piscina, gimnasio, SUM), renders 3D de marketing o planos. Si es false, dejá los 3 campos siguientes en null.
- "motivo_no_evaluable": si "fotos_muestran_interior" es false, explicá en pocas palabras qué muestran las fotos en cambio. Si es true, dejalo en null.

- "estado_conservacion": juzgá el DESGASTE FÍSICO visible (no el estilo ni la decoración suelta, no los muebles/objetos personales). Elegí uno de estos 5 valores según lo que efectivamente se ve:
  · "excelente" = sin ningún desgaste visible (sin rayones ni manchas en pisos, pintura pareja) Y al menos una señal concreta de renovación reciente o construcción nueva (ej. mesada de piedra/granito/cuarzo, muebles de cocina o baño sin marcas de uso, artefactos con aspecto nuevo, pisos sin desgaste). No hace falta que sea de lujo: alcanza con "sin desgaste" + "señal de actualización". Si el ambiente se ve simplemente ordenado y prolijo pero SIN ninguna señal de renovación (ej. una habitación vacía recién pintada, sin cocina/baño a la vista), no alcanza para "excelente": es "bueno".
  · "bueno" = sin daños visibles (sin humedad, sin roturas, sin faltantes) pero sin señal clara de renovación reciente: desgaste leve de uso normal, o simplemente no hay evidencia suficiente para afirmar que fue reciclado.
  · "regular" = desgaste evidente pero sin daño estructural: pisos visiblemente opacos o gastados, pintura deslucida/amarillenta, artefactos de aspecto anticuado — pero SIN manchas de humedad, roturas ni faltantes.
  · "a_reciclar" = al menos un daño concreto y visible: manchas de humedad, pintura descascarada o burbujeada, roturas, faltantes (azulejos rotos/faltantes, canillas rotas, zócalos despegados), etc.
  · "sin_evidencia" = ninguna foto muestra superficies suficientes (tomas muy cerradas, oscuras, o solo de detalles/objetos) para juzgar el estado. Usá este valor en vez de adivinar.

- "calidad_terminaciones": juzgá los MATERIALES Y EQUIPAMIENTO de cocina y baño específicamente (mesadas, muebles, grifería, artefactos, revestimientos). Elegí uno de estos 4 valores:
  · "alta" = materiales de gama alta identificables en cocina o baño: piedra natural/cuarzo, muebles a medida o con terminación mate/laqueada (no laminado básico), grifería de diseño (monocomando, tipo cascada), pisos de madera maciza o porcelanato de gran formato.
  · "estandar" = materiales de línea media: melamina o laminado de buena calidad, mesada de granito o cuarzo genérico, grifería cromada estándar, piso flotante o cerámico común.
  · "basica" = materiales económicos o visiblemente desactualizados: azulejo simple sin actualizar, muebles de melamina básica con marcas de desgaste, artefactos antiguos (heladeras, cocinas de época), piso de mosaico o granítico sin pulir.
  · "sin_evidencia" = NINGUNA foto muestra cocina ni baño con el detalle suficiente (mesada, muebles, grifería) para juzgar materiales. Esto es obligatorio incluso si el resto de la unidad (living, dormitorio, pisos) se ve muy bien: la calidad de terminaciones se juzga por cocina/baño, no se extrapola del resto de la unidad. No rellenes con "estandar" por default.

- "luminosidad": juzgá por el tamaño y cantidad de aberturas visibles y cuán clara se ve cada foto (más allá de si hay luz artificial prendida). Elegí uno de estos 4 valores:
  · "alta" = al menos un ambiente con ventanales grandes o balcón, foto clara sin necesidad de luz artificial evidente.
  · "media" = aberturas moderadas, o mezcla de luz natural y artificial.
  · "baja" = fotos oscuras, ventanas chicas, o luz artificial claramente predominante.
  · "sin_evidencia" = ninguna foto permite juzgar esto (ej. todas son tomas nocturnas, o son solo detalles/objetos sin ver ninguna abertura).

FORMATO DE SALIDA: devolvé un JSON con estos campos. En "analisis" va el análisis visual previo (es un paso interno, nadie lo ve). En "descripcion" va únicamente el párrafo final para el cliente, sin encabezados, sin viñetas, sin repetir las consignas, sin prefijos como "Análisis:" o "Descripción:" y sin markdown. Los campos de clasificación interna van aparte, tal cual se describieron arriba.`;
}

/** `responseSchema` de Gemini para el prompt de arriba. Mismo para sujeto y comparables. */
export const SCHEMA_ANALISIS_FOTOS: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    analisis: { type: SchemaType.STRING },
    descripcion: { type: SchemaType.STRING },
    fotos_muestran_interior: { type: SchemaType.BOOLEAN },
    motivo_no_evaluable: { type: SchemaType.STRING, nullable: true },
    estado_conservacion: { type: SchemaType.STRING, format: "enum", enum: NIVELES_ESTADO },
    calidad_terminaciones: { type: SchemaType.STRING, format: "enum", enum: NIVELES_TERMINACIONES },
    luminosidad: { type: SchemaType.STRING, format: "enum", enum: NIVELES_LUMINOSIDAD },
  },
  required: ["analisis", "descripcion", "fotos_muestran_interior", "estado_conservacion", "calidad_terminaciones", "luminosidad"],
} as Schema;

/**
 * Parsea el JSON crudo que devuelve Gemini para el prompt de arriba.
 * `descripcion` se devuelve tal cual (el saneado/recorte lo hace `descripcion-ia.ts`, no acá).
 * Si el JSON no trae el bloque de clasificación (roto o campo ausente), `atributos` es null:
 * la descripción puede seguir siendo válida, simplemente esta capa no tiene con qué comparar.
 */
export function extraerAnalisisFotos(crudo: string): AnalisisFotoIA {
  if (!crudo) return { descripcion: "", atributos: null };
  try {
    // Gemini a veces envuelve el JSON en un cerco de markdown (```json ... ```) aunque se pida
    // responseMimeType: "application/json" — rareza conocida del modelo (ver descripcion-ia.ts).
    const sinCerco = crudo.trim().replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/, "");
    const j = JSON.parse(sinCerco);
    const descripcion = typeof j?.descripcion === "string" ? j.descripcion : "";
    const fmi = j?.fotos_muestran_interior;
    if (typeof fmi !== "boolean") return { descripcion, atributos: null };

    const estado = NIVELES_ESTADO.includes(j?.estado_conservacion) ? (j.estado_conservacion as EstadoConservacionFoto) : "sin_evidencia";
    const terminaciones = NIVELES_TERMINACIONES.includes(j?.calidad_terminaciones)
      ? (j.calidad_terminaciones as CalidadTerminacionesFoto)
      : "sin_evidencia";
    const luminosidad = NIVELES_LUMINOSIDAD.includes(j?.luminosidad) ? (j.luminosidad as LuminosidadFoto) : "sin_evidencia";

    const atributos: AtributosFotoIA = {
      fotos_muestran_interior: fmi,
      // Gotcha conocido (calibracion-final.md): con fotos_muestran_interior=true, el modelo a
      // veces devuelve el NOMBRE del campo ("motivo_no_evaluable") como si fuera su propio
      // valor, en vez de null. El campo solo tiene sentido cuando es false: se fuerza acá en
      // vez de confiar en que el modelo lo deje vacío.
      // Recortado igual que `descripcion` (mismo tope, `MAX_DESC_IA`): es texto libre del
      // modelo sin ningún tope propio, y se muestra tal cual en la tarjeta del comparable y en
      // la lista de advertencias antes de crear la ficha — un texto desmedido rompería esa UI.
      motivo_no_evaluable: fmi
        ? null
        : typeof j?.motivo_no_evaluable === "string"
          ? recortarAPalabra(j.motivo_no_evaluable, MAX_DESC_IA)
          : null,
      estado_conservacion: estado,
      calidad_terminaciones: terminaciones,
      luminosidad,
    };
    return { descripcion, atributos };
  } catch {
    return { descripcion: "", atributos: null };
  }
}

// ── Coerción de valores leídos de la caché (acm_fotos_analisis_cache) ──────────────────────
// Las columnas `estado_conservacion` / `calidad_terminaciones` / `luminosidad` son `text`
// nullable SIN CHECK en la base (deliberado: evita otra migración de producción solo para
// esto). El código que las escribe siempre manda uno de los niveles válidos, pero nada en el
// schema lo garantiza — un `null` viejo, una fila tocada a mano, o un futuro `INSERT` que se
// salte este módulo pasarían de largo. Sin coercionar, `fotos-comparables/route.ts` hacía
// `as any` y un valor así llegaba intacto hasta `ORDEN_ESTADO[valor]` → `undefined` →
// `NaN` en el % de la tarjeta y en el comparador de orden (inestable). Coercionar acá, en el
// único lugar que lee la caché, hace que un dato corrupto se trate igual que "sin_evidencia"
// (ya es un valor esperado en todo el resto del código) en vez de propagar `undefined`.
export function coercionarEstado(v: unknown): EstadoConservacionFoto {
  return NIVELES_ESTADO.includes(v as EstadoConservacionFoto) ? (v as EstadoConservacionFoto) : "sin_evidencia";
}
export function coercionarTerminaciones(v: unknown): CalidadTerminacionesFoto {
  return NIVELES_TERMINACIONES.includes(v as CalidadTerminacionesFoto) ? (v as CalidadTerminacionesFoto) : "sin_evidencia";
}
export function coercionarLuminosidad(v: unknown): LuminosidadFoto {
  return NIVELES_LUMINOSIDAD.includes(v as LuminosidadFoto) ? (v as LuminosidadFoto) : "sin_evidencia";
}

// ── Fórmula de ajuste ±5 (calibracion-final.md: estado_conservacion 70% + luminosidad 30%,
//    calidad_terminaciones excluido por inestable). Pura, sin dependencias de Node. ──

const ORDEN_ESTADO: Record<Exclude<EstadoConservacionFoto, "sin_evidencia">, number> = {
  a_reciclar: 0,
  regular: 1,
  bueno: 2,
  excelente: 3,
};
const ORDEN_LUMINOSIDAD: Record<Exclude<LuminosidadFoto, "sin_evidencia">, number> = { baja: 0, media: 1, alta: 2 };

/** Distancia ordinal → score 0-100 (100 = mismo nivel, 0 = los dos extremos opuestos). */
function scorePorDistancia(a: number, b: number, maxDistancia: number): number {
  return Math.round(100 * (1 - Math.abs(a - b) / maxDistancia));
}

export interface ResultadoComparacionFotos {
  /** 0-100: qué tan parecida es la condición del comparable a la del sujeto. */
  score: number;
  /** true si `luminosidad` no participó (sin_evidencia de un lado): el score es solo estado_conservacion. */
  soloEstado: boolean;
}

/**
 * Compara la condición del sujeto (con el anclaje ya corregido por el asesor, si corrigió
 * algo) contra la de un comparable. null = el par no se puede puntuar: `estado_conservacion`
 * es `sin_evidencia` en cualquiera de los dos lados (mismo tratamiento que
 * `fotos_muestran_interior=false` — no se inventa un número, se señala al asesor).
 */
export function scoreComparacionFotos(
  sujeto: { estado_conservacion: EstadoConservacionFoto; luminosidad: LuminosidadFoto },
  comp: { estado_conservacion: EstadoConservacionFoto; luminosidad: LuminosidadFoto }
): ResultadoComparacionFotos | null {
  if (sujeto.estado_conservacion === "sin_evidencia" || comp.estado_conservacion === "sin_evidencia") return null;

  const scoreEstado = scorePorDistancia(ORDEN_ESTADO[sujeto.estado_conservacion], ORDEN_ESTADO[comp.estado_conservacion], 3);

  const lumSujeto = sujeto.luminosidad;
  const lumComp = comp.luminosidad;
  if (lumSujeto === "sin_evidencia" || lumComp === "sin_evidencia") return { score: scoreEstado, soloEstado: true };

  const scoreLuminosidad = scorePorDistancia(ORDEN_LUMINOSIDAD[lumSujeto], ORDEN_LUMINOSIDAD[lumComp], 2);
  return { score: Math.round(scoreEstado * 0.7 + scoreLuminosidad * 0.3), soloEstado: false };
}

export interface AjustePorFotos {
  /** -5..+5. Nunca más de ±5 (tope acordado con el project owner). */
  delta: number;
  /** Motivo legible para mostrar SIEMPRE junto al ajuste (nunca un número que cambió solo). */
  texto: string;
}

/**
 * Tabla de anclaje de calibracion-final.md (score de comparación → ajuste ±5). Los rangos del
 * informe son bandas (ej. "80-100 → +4 a +5"); acá se interpola linealmente dentro de cada
 * banda para que el ajuste sea una función continua del score, en vez de un salto brusco.
 */
export function ajustePorScore(score: number): AjustePorFotos {
  if (score >= 80) {
    const delta = Math.round(4 + ((score - 80) / 20) * 1);
    return { delta, texto: "las fotos muestran una condición muy similar a la de tu propiedad" };
  }
  if (score >= 55) {
    const delta = Math.round(1 + ((score - 55) / 24) * 2);
    return { delta, texto: "las fotos muestran una condición parecida a la de tu propiedad" };
  }
  if (score >= 40) {
    return { delta: 0, texto: "las fotos no muestran una diferencia clara con la condición de tu propiedad" };
  }
  if (score >= 20) {
    const delta = -Math.round(1 + ((39 - score) / 19) * 2);
    return { delta, texto: "las fotos muestran una condición notoriamente distinta a la de tu propiedad" };
  }
  const delta = -Math.round(4 + ((19 - Math.max(score, 0)) / 19) * 1);
  return { delta: Math.max(delta, -5), texto: "las fotos muestran una condición muy distinta a la de tu propiedad" };
}

/** Aplica el ajuste a un match_pct, siempre acotado a 0-100. */
export function aplicarAjuste(matchPct: number, delta: number): number {
  return Math.max(0, Math.min(100, Math.round(matchPct + delta)));
}
