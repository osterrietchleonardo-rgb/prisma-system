// ACM · Ficha pública de comparables.
// Tipos del snapshot + cálculos deterministas (pulso de mercado por barrio/ambientes y comparación de $/m²).
// SIN IA: todos los % salen de fórmulas sobre datos reales:
//   - mercado_barrios: cierre/oferta $/m² por barrio (9 barrios con cierre, 45 con oferta).
//   - mercado_stats:   cierre $/m² CABA segmentado por ambientes (monoambiente / 2 amb / 3 amb / promedio).

// Cierre CABA por segmento de ambientes (dato real de mercado_stats).
export interface AmbienteStats {
  monoambiente_cierre: number | null;
  dos_ambientes_cierre: number | null;
  tres_ambientes_cierre: number | null;
  promedio_caba_cierre: number | null;
  brecha_general_pct?: number | null;
}

// ── Pulso de mercado para una zona + segmento de ambientes (banner superior de cada hoja) ──
export interface FichaPulso {
  barrio: string;                  // barrio matcheado (o la zona del comparable si no hubo match)
  ambiente_label: string;          // "Monoambiente" | "2 ambientes" | "3 ambientes" | "4+ ambientes" | "Promedio"
  barrio_m2: number | null;        // $/m² de oferta/lista del barrio
  barrio_cierre_est_m2: number | null; // $/m² estimado de cierre del barrio (lista * (1 + brecha/100))
  barrio_m2_tipo: "cierre" | "oferta" | null;
  caba_amb_m2: number | null;      // cierre CABA del segmento de ambientes (real, mercado_stats)
  brecha_pct: number | null;       // brecha % real CABA utilizada para estimar el cierre del barrio
  fuente: string;                  // fuente del dato de barrio
  matched: boolean;                // true si matcheó un barrio real de mercado_barrios
}

// ── Un comparable dentro de la ficha (comparable del ACM + fotos/amenities/desc) ──
export interface FichaComparable {
  id: string;
  source: "cartera" | "roomix";
  match_pct: number;
  titulo: string;
  direccion: string;
  zona: string;
  tipo: string;
  m2: number | null;
  ambientes: number | null;
  dormitorios: number | null;
  banos: number | null;
  precio: number | null;
  moneda: string;
  precio_m2: number | null;
  descripcion: string;
  amenities: string[];
  images: string[];
  responsable: string;
  pulso: FichaPulso;
}

// ── Comparación calculada final (matriz $/m² + conclusiones) ──────────────────
// Cada comparable se compara contra el cierre de SU PROPIO barrio (dato local, más fiel que un
// promedio CABA). Si el barrio no tiene cierre, se usa su oferta; si no, el cierre CABA por ambientes.
export interface FichaComparisonRow {
  id: string;
  titulo: string;
  m2: number | null;
  precio: number | null;
  moneda: string;
  precio_m2: number | null;
  ref_m2: number | null;    // cierre de referencia de la zona del comparable
  ref_label: string;        // "Recoleta (cierre est.)" | "Caballito (oferta)" | "CABA 2 amb (cierre)"
  desvio_pct: number | null; // $/m² del comparable vs ref_m2
  calificacion: string;
}

export interface FichaComparison {
  moneda: string;
  promedio_m2: number | null;   // promedio de oferta $/m² de los elegidos (solo USD)
  min_m2: number | null;
  max_m2: number | null;
  promedio_sup?: number | null;    // promedio de superficie (m²) de los comparables con dato
  promedio_precio?: number | null; // promedio de precio de los comparables en USD
  desvio_prom_pct: number | null; // desvío promedio de la muestra vs. el cierre de su zona
  rows: FichaComparisonRow[];
  conclusiones: string[];
}

// ── Snapshot completo que se guarda en shared_acm_reports.snapshot ────────────
export interface FichaAgent {
  full_name: string;
  email: string;
  phone: string;
  avatar_url: string | null;
  role: string;
  /** Clasificación secundaria que pone el director en "Asesores": client_director | client_support | null. */
  clasificacion?: string | null;
}
export interface FichaBrand {
  colors: string[];
  font: string;
  logo_url: string | null;
  legal_notice: string; // aviso legal ("" si no está configurado → no se muestra)
}
export interface AcmFichaSnapshot {
  subject: { direccion: string; barrio: string; tipo: string; m2: number | null; dormitorios: number | null; banos: number | null };
  operacion: string;
  comparables: FichaComparable[];
  comparison: FichaComparison;
  agent: FichaAgent;
  agency: { id: string; name: string };
  brand: FichaBrand;
  created_at: string;
}

export interface MercadoBarrioLite {
  barrio: string;
  precio_m2_usd: number | null;
  precio_cierre_m2_usd: number | null;
  fuente?: string | null;
}

/** Normaliza un texto de zona/barrio para comparar: minúsculas, sin acentos, sin puntuación, trim. */
export function normalizeBarrio(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // saca acentos (marcas diacríticas combinantes)
    .replace(/[^a-z0-9\s]/g, " ") // saca puntuación
    .replace(/\s+/g, " ")
    .trim();
}

/** Etiqueta del segmento de ambientes. */
export function ambienteLabel(amb: number | null): string {
  if (amb == null || amb <= 0) return "Promedio";
  if (amb === 1) return "Monoambiente";
  if (amb >= 4) return "4+ ambientes";
  return `${amb} ambientes`;
}

/** Cierre CABA (real) del segmento de ambientes. 4+ y sin dato → promedio CABA. */
export function cabaAmbCierre(amb: number | null, stats: AmbienteStats): number | null {
  if (amb === 1) return stats.monoambiente_cierre ?? stats.promedio_caba_cierre;
  if (amb === 2) return stats.dos_ambientes_cierre ?? stats.promedio_caba_cierre;
  if (amb === 3) return stats.tres_ambientes_cierre ?? stats.promedio_caba_cierre;
  return stats.promedio_caba_cierre;
}

/**
 * Pulso de una zona + segmento de ambientes: matchea la zona contra mercado_barrios (cierre/oferta $/m²)
 * y agrega el cierre CABA del segmento de ambientes (mercado_stats). Todo dato real, nada inventado.
 */
export function matchBarrioPulso(
  zona: string,
  ambientes: number | null,
  barrios: MercadoBarrioLite[],
  stats: AmbienteStats
): FichaPulso {
  const z = normalizeBarrio(zona);
  let hit: MercadoBarrioLite | null = null;

  if (z) {
    for (const b of barrios) {
      const nb = normalizeBarrio(b.barrio);
      if (!nb) continue;
      if (z === nb || z.includes(nb) || nb.includes(z)) {
        hit = b;
        break;
      }
    }
  }

  let barrio_m2: number | null = null;
  let barrio_cierre_est_m2: number | null = null;
  let barrio_m2_tipo: "cierre" | "oferta" | null = null;

  if (hit) {
    if (hit.precio_cierre_m2_usd != null) {
      barrio_m2 = hit.precio_cierre_m2_usd;
      barrio_cierre_est_m2 = hit.precio_cierre_m2_usd;
      barrio_m2_tipo = "cierre";
    } else if (hit.precio_m2_usd != null) {
      barrio_m2 = hit.precio_m2_usd;
      barrio_m2_tipo = "oferta";
      if (stats.brecha_general_pct != null) {
        barrio_cierre_est_m2 = Math.round(hit.precio_m2_usd * (1 + stats.brecha_general_pct / 100));
      }
    }
  }

  return {
    barrio: hit?.barrio || zona || "CABA",
    ambiente_label: ambienteLabel(ambientes),
    barrio_m2,
    barrio_cierre_est_m2,
    barrio_m2_tipo,
    caba_amb_m2: cabaAmbCierre(ambientes, stats),
    brecha_pct: stats.brecha_general_pct ?? null,
    fuente: hit?.fuente || "Reporte inmobiliario",
    matched: !!hit,
  };
}

const round = (n: number) => Math.round(n);

/** Calificación textual de un comparable según su desvío % respecto del cierre de referencia. */
function calificar(desvio: number | null): string {
  if (desvio === null) return "Sin dato de $/m²";
  if (desvio <= -3) return "Por debajo del mercado (oportunidad)";
  if (desvio < 3) return "Alineado al mercado";
  if (desvio < 8) return "Levemente por encima";
  return "Premium / por encima del mercado";
}

// Cierre de referencia de la zona de UN comparable (para su desvío): cierre est. del barrio → oferta del
// barrio → cierre CABA por ambientes. Devuelve el valor y una etiqueta que dice de dónde salió.
function refZona(c: FichaComparable): { m2: number | null; label: string } {
  const p = c.pulso;
  if (p.barrio_cierre_est_m2 != null) {
    return { m2: p.barrio_cierre_est_m2, label: `${p.barrio} (cierre est.)` };
  }
  if (p.barrio_m2 != null) {
    return { m2: p.barrio_m2, label: `${p.barrio} (${p.barrio_m2_tipo === "cierre" ? "cierre" : "oferta"})` };
  }
  if (p.caba_amb_m2 != null) {
    return { m2: p.caba_amb_m2, label: `CABA · ${p.ambiente_label} (cierre)` };
  }
  return { m2: null, label: "s/d" };
}

/**
 * Comparación determinista de los comparables elegidos sobre el $/m².
 * Cada comparable se mide contra el **cierre de su propio barrio** (dato local). El promedio de la
 * muestra y su desvío promedio se calculan solo sobre los comparables en USD (no mezcla monedas).
 */
export function computeComparison(comparables: FichaComparable[], _stats: AmbienteStats): FichaComparison {
  const moneda = "USD";
  const usd = comparables.filter((c) => c.moneda === "USD" && c.precio_m2 != null && c.precio_m2 > 0);
  const valores = usd.map((c) => c.precio_m2 as number);

  const promedio = valores.length ? round(valores.reduce((a, b) => a + b, 0) / valores.length) : null;
  const min = valores.length ? Math.min(...valores) : null;
  const max = valores.length ? Math.max(...valores) : null;

  // Promedios de las columnas "Sup." y "Precio" de la matriz.
  // Superficie: todos los que tengan m². Precio: solo los publicados en USD (no mezcla monedas).
  const sups = comparables.map((c) => c.m2).filter((m): m is number => m != null && m > 0);
  const promedioSup = sups.length ? round(sups.reduce((a, b) => a + b, 0) / sups.length) : null;
  const precios = comparables
    .filter((c) => c.moneda === "USD" && c.precio != null && c.precio > 0)
    .map((c) => c.precio as number);
  const promedioPrecio = precios.length ? round(precios.reduce((a, b) => a + b, 0) / precios.length) : null;

  const desvios: number[] = [];
  const rows: FichaComparisonRow[] = comparables.map((c) => {
    const esUsd = c.moneda === "USD" && c.precio_m2 != null && c.precio_m2 > 0;
    const ref = refZona(c);
    const desvio = esUsd && ref.m2 ? round(((c.precio_m2 as number) - ref.m2) / ref.m2 * 100) : null;
    if (desvio != null) desvios.push(desvio);
    return {
      id: c.id,
      titulo: c.titulo || c.direccion || "Comparable",
      m2: c.m2,
      precio: c.precio,
      moneda: c.moneda,
      precio_m2: c.precio_m2,
      ref_m2: ref.m2,
      ref_label: ref.label,
      desvio_pct: desvio,
      calificacion: calificar(desvio),
    };
  });

  const desvioProm = desvios.length ? round(desvios.reduce((a, b) => a + b, 0) / desvios.length) : null;

  const conclusiones: string[] = [];
  const fmt = (n: number | null) => (n != null ? `USD ${n.toLocaleString("es-AR")}` : "s/d");
  if (promedio != null && desvioProm != null) {
    const dir = desvioProm > 0 ? "por encima" : desvioProm < 0 ? "por debajo" : "en línea con";
    conclusiones.push(
      `El promedio de oferta de los comparables elegidos es ${fmt(promedio)}/m². En promedio, la muestra se ubica un ${Math.abs(
        desvioProm
      )}% ${dir} del precio de cierre de su propia zona (lo que efectivamente se paga).`
    );
  } else if (promedio != null) {
    conclusiones.push(`El promedio de oferta de los comparables elegidos es ${fmt(promedio)}/m².`);
  }
  if (min != null && max != null && min !== max) {
    const amplitud = round((max - min) / min * 100);
    conclusiones.push(
      `El rango de valores va de ${fmt(min)}/m² a ${fmt(max)}/m², una amplitud del ${amplitud}% entre el más económico y el más caro de la muestra (influye la superficie y el barrio de cada uno).`
    );
  }
  if (usd.length > 0 && usd.length < comparables.length) {
    conclusiones.push(
      `Se promediaron ${usd.length} de ${comparables.length} comparables (los publicados en USD); el resto se muestra a título informativo.`
    );
  }

  return {
    moneda,
    promedio_m2: promedio,
    min_m2: min,
    max_m2: max,
    promedio_sup: promedioSup,
    promedio_precio: promedioPrecio,
    desvio_prom_pct: desvioProm,
    rows,
    conclusiones,
  };
}
