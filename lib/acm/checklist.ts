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
  sc_banos: number | null;
  sc_amenities: number | null;
  sc_semantica: number | null;
}

const PESOS = { zona: 25, superficie: 25, ambientes: 20, banos: 10, amenities: 10, semantica: 10 } as const;

function estado(score: number | null): ChecklistItem["estado"] {
  if (score === null || score === undefined) return "na";
  if (score >= 80) return "match";
  if (score > 0) return "parcial";
  return "distinto";
}

const fmtNum = (v: number | null | undefined, suf = "") => (v && v > 0 ? `${v}${suf}` : "—");

export function buildChecklist(args: {
  sub: SubScores;
  operacion: string;
  sujeto: { tipo: string; zona: string; m2: number | null; ambientes: number | null; banos: number | null; amenities: string[] };
  comp: { tipo: string; zona: string; m2: number | null; ambientes: number | null; banos: number | null; amenities: string[] };
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
    {
      dimension: "zona",
      label: "Zona / ubicación",
      sujeto_val: sujeto.zona || "—",
      comp_val: comp.zona || "—",
      estado: estado(sub.sc_zona),
      peso: PESOS.zona,
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
      dimension: "banos",
      label: "Baños",
      sujeto_val: fmtNum(sujeto.banos),
      comp_val: fmtNum(comp.banos),
      estado: estado(sub.sc_banos),
      peso: PESOS.banos,
      score: sub.sc_banos,
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
