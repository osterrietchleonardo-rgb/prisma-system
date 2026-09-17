// La puerta "calle + número" se traduce a parcela con el dataset de frentes del GCBA. USIG dice
// "CABILDO AV." y frentes "AV. CABILDO": la clave común saca puntos y tildes y manda las
// partículas al final. num_dom trae varias puertas pegadas por punto ("3939.3943").
const PARTICULAS = new Set(["AV", "AVDA", "GRAL", "DR", "DRA", "PTE", "ING", "TTE", "CNEL", "PJE", "PSJE", "DIAG", "CMTE", "ALTE", "BRIG", "MTRO", "PROF", "SGTO", "CAP", "MCAL"]);

export function calleClave(nombre: string): string {
  const base = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  const palabras = base.split(" ").filter(Boolean);
  const principales = palabras.filter((p) => !PARTICULAS.has(p));
  const particulas = palabras.filter((p) => PARTICULAS.has(p)).sort();
  return [...principales, ...particulas].join(" ");
}

export function abrirPuertas(numDom: string): number[] {
  return String(numDom || "").split(".").map((s) => parseInt(s, 10)).filter((n) => Number.isFinite(n) && n > 0);
}

export interface FilaFrentes { frente: string; num_dom: string; smp: string; parc_esq: string; ochava: string; clase: string }
export interface PuertaRow { calle: string; calle_clave: string; altura: number; smp: string; es_esquina: boolean; tiene_ochava: boolean }

export function filaPuertas(f: FilaFrentes): PuertaRow[] {
  if (f.clase !== "PARCELA" || !f.smp || !f.frente) return [];
  return abrirPuertas(f.num_dom).map((altura) => ({ calle: f.frente.trim(), calle_clave: calleClave(f.frente), altura, smp: f.smp.trim().toLowerCase(), es_esquina: f.parc_esq === "S", tiene_ochava: f.ochava === "S" }));
}
