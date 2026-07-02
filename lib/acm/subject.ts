// ─────────────────────────────────────────────────────────────────────────────
// ACM · Helpers del sujeto: derivar lo que necesitan las funciones SQL de matching
// (embedding text, ambientes, patrones de tipo/zona, tokens de amenities) a partir
// del Sujeto cargado (manual, por link o desde la cartera).
// ─────────────────────────────────────────────────────────────────────────────

import type { Sujeto, TipoPropiedad, Amenidades } from "@/lib/tasacion/types";

// Ambientes = dormitorios + 1 (living/cocina). 0 si no hay dato.
export function sujetoAmbientes(s: Partial<Sujeto>): number | null {
  const d = s.dormitorios ?? 0;
  return d > 0 ? d + 1 : null;
}

export function sujetoM2(s: Partial<Sujeto>): number | null {
  const cub = s.m2_cubiertos ?? 0;
  const semi = s.m2_semicubiertos ?? 0;
  const m2 = cub + semi; // superficie comparable aproximada
  return m2 > 0 ? m2 : null;
}

// Dormitorios reales del sujeto (dato propio, distinto de "ambientes"). 0 = sin dato → null.
export function sujetoDormitorios(s: Partial<Sujeto>): number | null {
  const d = s.dormitorios ?? 0;
  return d > 0 ? d : null;
}

// Antigüedad en años. 0 se trata como "sin dato" (el form arranca en 0), NO como "a estrenar":
// así no se puntúa antigüedad contra un default que el asesor no cargó. Solo compara si hay dato.
export function sujetoAntiguedad(s: Partial<Sujeto>): number | null {
  const a = s.antiguedad_anios ?? 0;
  return a > 0 ? a : null;
}

// Texto descriptivo para el embedding (mismo estilo con el que se indexan properties/roomix).
export function sujetoToEmbeddingText(s: Partial<Sujeto>): string {
  const amen = s.amenidades ? amenityLabels(s.amenidades) : [];
  return [
    s.tipo_propiedad,
    s.barrio,
    s.direccion,
    sujetoAmbientes(s) ? `${sujetoAmbientes(s)} ambientes` : "",
    s.dormitorios ? `${s.dormitorios} dormitorios` : "",
    s.banos ? `${s.banos} baños` : "",
    sujetoM2(s) ? `${sujetoM2(s)} m2` : "",
    amen.join(", "),
  ]
    .filter(Boolean)
    .join(". ")
    .trim();
}

// ── Patrones ILIKE de tipo de propiedad ──
// properties: tipos en español/Tokko (Departamento, Casa, Condo, Bussiness Premises, Lote…).
const PROP_TYPE: Record<TipoPropiedad, string[]> = {
  departamento: ["%departamento%", "%condo%", "%apart%"],
  casa: ["%casa%", "%weekend house%", "%chalet%"],
  ph: ["%ph%"],
  local: ["%premises%", "%local%"],
  oficina: ["%oficina%", "%office%"],
  terreno: ["%lote%", "%terreno%", "%land%"],
};
// roomix: tipos schema.org en inglés (Apartment, Accommodation, House).
const ROOMIX_TYPE: Record<TipoPropiedad, string[]> = {
  departamento: ["%apartment%", "%accommodation%", "%condo%"],
  casa: ["%house%", "%singlefamily%"],
  ph: ["%apartment%", "%house%", "%accommodation%"],
  local: ["%commercial%", "%store%"],
  oficina: ["%office%"],
  terreno: ["%land%"],
};

export function propTypePatterns(tipo?: TipoPropiedad): string[] {
  return tipo ? PROP_TYPE[tipo] ?? [] : [];
}
export function roomixTypePatterns(tipo?: TipoPropiedad): string[] {
  return tipo ? ROOMIX_TYPE[tipo] ?? [] : [];
}

// ── Patrones de zona ──
export function locPatterns(s: Partial<Sujeto>): string[] {
  const out: string[] = [];
  const push = (v?: string) => {
    const t = (v || "").trim();
    if (t.length > 2) out.push(`%${t.toLowerCase()}%`);
  };
  push(s.barrio);
  // primer token significativo de la dirección suele ser la calle (ruido); usamos solo barrio.
  return Array.from(new Set(out));
}

// ── Amenities → patrones regex (ES + EN) ──
// Tokko guarda los servicios en inglés ("Pool", "Gym", "Garden"…); las descripciones
// suelen estar en español. Por eso cada amenity es una alternancia ES|EN que evalúa SQL con ~*.
const AMENITY_TOKENS: Record<keyof Amenidades, string> = {
  cochera_cubierta: "cocher|garage|garaje",
  cochera_descubierta: "cocher|garage|garaje",
  baulera: "bauler|storage room",
  pileta: "pileta|piscina|pool",
  gimnasio: "gimnas|gym|fitness",
  sum: "sum|salon de usos|salón de usos",
  seguridad_24hs: "segurid|vigilan|security|24 hour|24hs",
  jardin_privado: "jard|garden",
  terraza_privada: "terraz|terrace",
};
const AMENITY_LABEL: Record<keyof Amenidades, string> = {
  cochera_cubierta: "Cochera cubierta",
  cochera_descubierta: "Cochera descubierta",
  baulera: "Baulera",
  pileta: "Pileta",
  gimnasio: "Gimnasio",
  sum: "SUM",
  seguridad_24hs: "Seguridad 24hs",
  jardin_privado: "Jardín privado",
  terraza_privada: "Terraza privada",
};

export function amenityTokens(a?: Amenidades): string[] {
  if (!a) return [];
  const out: string[] = [];
  (Object.keys(AMENITY_TOKENS) as (keyof Amenidades)[]).forEach((k) => {
    if (a[k]) out.push(AMENITY_TOKENS[k]);
  });
  return Array.from(new Set(out));
}

export function amenityLabels(a?: Amenidades): string[] {
  if (!a) return [];
  return (Object.keys(AMENITY_LABEL) as (keyof Amenidades)[]).filter((k) => a[k]).map((k) => AMENITY_LABEL[k]);
}
