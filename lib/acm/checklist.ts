// ─────────────────────────────────────────────────────────────────────────────
// ACM · Arma el checklist de comparabilidad (qué coincide y qué no) a partir de
// los sub-scores que devuelven las funciones SQL + los valores reales del sujeto
// y del comparable. El precio NO entra acá (es dato aparte).
// ─────────────────────────────────────────────────────────────────────────────

import type { ChecklistItem } from "@/lib/tasacion/types";

// sub-scores tal cual los devuelve la RPC (0..100 o null si la dimensión no aplica).
export interface SubScores {
  sc_zona: number | null;
  sc_superficie: number | null;
  sc_ambientes: number | null;
  sc_dormitorios: number | null;
  sc_banos: number | null;
  sc_antiguedad: number | null;
  sc_amenities: number | null;
  sc_semantica: number | null;
  // Fase 2 (3-sep-2026). Opcionales: las búsquedas guardadas viejas no los traen → "na".
  sc_cocheras?: number | null;
  sc_piso?: number | null;
  sc_orientacion?: number | null;
  sc_disposicion?: number | null;
}

// Pesos base del % (deben coincidir con los de las funciones SQL acm_match_*). La ZONA volvió a
// pesar: dejó de ser un filtro binario y ahora puntúa por nivel (100 mismo barrio · 70 sub-barrio
// hermano · 50 limítrofe), así un comparable de Núñez nunca le gana a uno de Belgrano.
// El semántico NO está acá: es variable (10, o 20 cuando el sujeto trae descripción de la IA) y
// llega por argumento.
const PESOS = { zona: 20, superficie: 22, ambientes: 16, dormitorios: 14, banos: 12, antiguedad: 14, amenities: 12, cocheras: 10, piso: 6, orientacion: 5, disposicion: 5 } as const;

function estado(score: number | null): ChecklistItem["estado"] {
  if (score === null || score === undefined) return "na";
  if (score >= 80) return "match";
  if (score > 0) return "parcial";
  return "distinto";
}

const fmtNum = (v: number | null | undefined, suf = "") => (v && v > 0 ? `${v}${suf}` : "—");
// La antigüedad admite el estado de obra como valor válido: 0 = a estrenar, negativo = en pozo.
const fmtAnios = (v: number | null | undefined) => {
  if (v === null || v === undefined) return "—";
  if (v < 0) return "En pozo";
  if (v === 0) return "A estrenar";
  return `${v} años`;
};

// Fase 2: qué se muestra en las filas nuevas. El sujeto declara cochera como sí/no
// (los switches), el comparable como número contado; el piso 0 es PB.
const fmtCochera = (v: boolean | number | null | undefined) => {
  if (v === true) return "Sí";
  if (v === false || v === null || v === undefined) return "—";
  return String(v);
};
const fmtPiso = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : v === 0 ? "PB" : `Piso ${v}`;
const fmtTexto = (v: string | null | undefined) => (v ? v : "—");

interface LadoChecklist {
  tipo: string; zona: string; m2: number | null; ambientes: number | null;
  dormitorios: number | null; banos: number | null; antiguedad: number | null; amenities: string[];
  // Fase 2 (opcionales: el ACM de cartera y las búsquedas viejas no los traen).
  cocheras?: boolean | number | null;
  piso?: number | null;
  orientacion?: string | null;
  disposicion?: string | null;
}

export function buildChecklist(args: {
  sub: SubScores;
  operacion: string;
  /** Peso del ítem semántico: 20 si el sujeto trae descripción de la IA, 10 si no. */
  pesoSemantica: number;
  sujeto: LadoChecklist;
  comp: LadoChecklist;
}): ChecklistItem[] {
  const { sub, sujeto, comp, operacion, pesoSemantica } = args;
  const amenSujeto = sujeto.amenities.length ? sujeto.amenities.join(", ") : "—";
  const amenComp = comp.amenities.length ? comp.amenities.join(", ") : "—";

  const items: ChecklistItem[] = [
    // Tipo y operación son filtros duros (gate): todo comparable los cumple por definición.
    {
      dimension: "tipo",
      label: "Tipo de propiedad",
      sujeto_val: sujeto.tipo || "—",
      comp_val: comp.tipo || sujeto.tipo || "—",
      estado: "match",
      peso: 0,
      score: null,
    },
    {
      dimension: "operacion",
      label: "Operación",
      sujeto_val: operacion,
      comp_val: operacion,
      estado: "match",
      peso: 0,
      score: null,
    },
    // Zona: 100 = mismo barrio · 70 = sub-barrio hermano (Belgrano R) · 50 = limítrofe (Núñez).
    // Las búsquedas viejas guardadas traen sc_zona = 100 fijo, así que se siguen viendo igual.
    {
      dimension: "zona",
      label: "Zona / barrio",
      sujeto_val: sujeto.zona || "—",
      comp_val: comp.zona || sujeto.zona || "—",
      estado: estado(sub.sc_zona),
      peso: sub.sc_zona === null ? 0 : PESOS.zona,
      score: sub.sc_zona,
    },
    {
      dimension: "superficie",
      label: "Superficie",
      sujeto_val: fmtNum(sujeto.m2, " m²"),
      comp_val: fmtNum(comp.m2, " m²"),
      estado: estado(sub.sc_superficie),
      peso: PESOS.superficie,
      score: sub.sc_superficie,
    },
    {
      dimension: "ambientes",
      label: "Ambientes",
      sujeto_val: fmtNum(sujeto.ambientes),
      comp_val: fmtNum(comp.ambientes),
      estado: estado(sub.sc_ambientes),
      peso: PESOS.ambientes,
      score: sub.sc_ambientes,
    },
    {
      dimension: "dormitorios",
      label: "Dormitorios",
      sujeto_val: fmtNum(sujeto.dormitorios),
      comp_val: fmtNum(comp.dormitorios),
      estado: estado(sub.sc_dormitorios),
      peso: PESOS.dormitorios,
      score: sub.sc_dormitorios,
    },
    {
      dimension: "banos",
      label: "Baños",
      sujeto_val: fmtNum(sujeto.banos),
      comp_val: fmtNum(comp.banos),
      estado: estado(sub.sc_banos),
      peso: PESOS.banos,
      score: sub.sc_banos,
    },
    // ── Fase 2: estructura (después de baños) ──
    {
      dimension: "cocheras",
      label: "Cochera",
      sujeto_val: fmtCochera(sujeto.cocheras),
      comp_val: fmtCochera(comp.cocheras),
      estado: estado(sub.sc_cocheras ?? null),
      peso: sub.sc_cocheras == null ? 0 : PESOS.cocheras,
      score: sub.sc_cocheras ?? null,
    },
    {
      dimension: "piso",
      label: "Piso",
      sujeto_val: fmtPiso(sujeto.piso),
      comp_val: fmtPiso(comp.piso),
      estado: estado(sub.sc_piso ?? null),
      peso: sub.sc_piso == null ? 0 : PESOS.piso,
      score: sub.sc_piso ?? null,
    },
    {
      dimension: "antiguedad",
      label: "Antigüedad",
      sujeto_val: fmtAnios(sujeto.antiguedad),
      comp_val: fmtAnios(comp.antiguedad),
      estado: estado(sub.sc_antiguedad),
      peso: PESOS.antiguedad,
      score: sub.sc_antiguedad,
    },
    // ── Fase 2: la cara del departamento (después de antigüedad) ──
    {
      dimension: "orientacion",
      label: "Orientación",
      sujeto_val: fmtTexto(sujeto.orientacion),
      comp_val: fmtTexto(comp.orientacion),
      estado: estado(sub.sc_orientacion ?? null),
      peso: sub.sc_orientacion == null ? 0 : PESOS.orientacion,
      score: sub.sc_orientacion ?? null,
    },
    {
      dimension: "disposicion",
      label: "Disposición",
      sujeto_val: fmtTexto(sujeto.disposicion),
      comp_val: fmtTexto(comp.disposicion),
      estado: estado(sub.sc_disposicion ?? null),
      peso: sub.sc_disposicion == null ? 0 : PESOS.disposicion,
      score: sub.sc_disposicion ?? null,
    },
    {
      dimension: "amenities",
      label: "Amenities / características",
      sujeto_val: amenSujeto,
      comp_val: amenComp,
      estado: estado(sub.sc_amenities),
      peso: PESOS.amenities,
      score: sub.sc_amenities,
    },
    {
      dimension: "semantica",
      label: "Similitud descriptiva (IA)",
      sujeto_val: "—",
      comp_val: sub.sc_semantica !== null ? `${sub.sc_semantica}%` : "—",
      estado: estado(sub.sc_semantica),
      peso: pesoSemantica,
      score: sub.sc_semantica,
    },
  ];
  return items;
}
