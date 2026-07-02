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
}

// Pesos base del % (deben coincidir con los de las funciones SQL acm_match_*). La ZONA ya NO
// pesa: es un filtro duro (todos los comparables son del mismo barrio) → se muestra como "filtro".
const PESOS = { superficie: 22, ambientes: 16, dormitorios: 14, banos: 12, antiguedad: 14, amenities: 12, semantica: 10 } as const;

function estado(score: number | null): ChecklistItem["estado"] {
  if (score === null || score === undefined) return "na";
  if (score >= 80) return "match";
  if (score > 0) return "parcial";
  return "distinto";
}

const fmtNum = (v: number | null | undefined, suf = "") => (v && v > 0 ? `${v}${suf}` : "—");
// La antigüedad admite 0 ("a estrenar") como valor válido a mostrar.
const fmtAnios = (v: number | null | undefined) => (v !== null && v !== undefined && v >= 0 ? `${v} años` : "—");

export function buildChecklist(args: {
  sub: SubScores;
  operacion: string;
  sujeto: { tipo: string; zona: string; m2: number | null; ambientes: number | null; dormitorios: number | null; banos: number | null; antiguedad: number | null; amenities: string[] };
  comp: { tipo: string; zona: string; m2: number | null; ambientes: number | null; dormitorios: number | null; banos: number | null; antiguedad: number | null; amenities: string[] };
}): ChecklistItem[] {
  const { sub, sujeto, comp, operacion } = args;
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
    // Zona es filtro duro (gate): todo comparable es del mismo barrio que el sujeto → "filtro".
    {
      dimension: "zona",
      label: "Zona / barrio",
      sujeto_val: sujeto.zona || "—",
      comp_val: comp.zona || sujeto.zona || "—",
      estado: "match",
      peso: 0,
      score: null,
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
    {
      dimension: "antiguedad",
      label: "Antigüedad",
      sujeto_val: fmtAnios(sujeto.antiguedad),
      comp_val: fmtAnios(comp.antiguedad),
      estado: estado(sub.sc_antiguedad),
      peso: PESOS.antiguedad,
      score: sub.sc_antiguedad,
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
      peso: PESOS.semantica,
      score: sub.sc_semantica,
    },
  ];
  return items;
}
