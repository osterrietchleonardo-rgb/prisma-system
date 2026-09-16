// ACM · Cómo se lee y se muestra la antigüedad de una propiedad.
//
// El número guarda también el estado de obra, con la misma convención que las funciones SQL
// (`acm_match_*`) y que `tokko_data.age`: 0 = a estrenar, negativo = en pozo, >0 = años.
// null = la publicación no lo dice, y en ese caso no se muestra nada: no se inventa.

import type { ChecklistItem } from "@/lib/tasacion/types";

export function fmtAntiguedad(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  if (v < 0) return "En pozo";
  if (v === 0) return "A estrenar";
  return `${v} ${v === 1 ? "año" : "años"}`;
}

/**
 * Las búsquedas guardadas antes de sep-2026 no traen `antiguedad` en el comparable, pero sí la
 * dejaron escrita en el checklist ("12 años", "A estrenar", "En pozo"). Se recupera de ahí para
 * que un ACM viejo reabierto desde "Mis ACM" también la muestre en la tarjeta y en la ficha.
 */
export function antiguedadDesdeChecklist(checklist: ChecklistItem[] | undefined): number | null {
  const item = (checklist || []).find((i) => i.dimension === "antiguedad");
  const val = (item?.comp_val || "").trim().toLowerCase();
  if (!val || val === "—") return null;
  if (val === "en pozo") return -1;
  if (val === "a estrenar") return 0;
  const m = val.match(/^(\d{1,3})\s*años?$/);
  return m ? Number(m[1]) : null;
}

/** La antigüedad de la propiedad analizada, con el estado de obra por encima de los años. El
 *  formulario arranca en 0, así que 0 sin la casilla "A estrenar" es "no la cargó", no "nueva". */
export function antiguedadSujeto(s: { antiguedad_anios?: number; a_estrenar?: boolean; en_pozo?: boolean }): number | null {
  if (s.en_pozo) return -1;
  if (s.a_estrenar) return 0;
  const a = Number(s.antiguedad_anios);
  return Number.isFinite(a) && a > 0 ? a : null;
}
