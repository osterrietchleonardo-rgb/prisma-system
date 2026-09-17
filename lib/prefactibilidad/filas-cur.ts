// Del CSV codigo-urbanistico.csv (318.128 filas, columnas gid,smp,seccion,manzana,parcela,
// uni_edif_1..4,…,tipo_mza,…,barrio,comuna,plano_l,…,dist_cpu_1,…,fot_em_1,…,alicuota,inc_uva_21,…)
// a la fila de gcba_parcelas_cur. El contenido del Código es al 31-dic-2024 (nombre del recurso).
export const FUENTE_FECHA = "2024-12-31";

export interface FilaCurDb {
  smp: string; seccion: string; manzana: string; parcela: string;
  uni_edif: number[]; plano_l: number | null; tipo_mza: string | null; catalogado: number;
  dist_1_grp: string | null; dist_1_esp: string | null; dist_2_grp: string | null; dist_2_esp: string | null;
  dist_cpu_1: string | null; fot_em_1: number | null; barrio: string | null; comuna: string | null;
  alicuota: number | null; inc_uva_21: number | null; fuente_fecha: string; publicado: string;
}

const num = (s: string | undefined): number | null => { const n = parseFloat(String(s ?? "").trim()); return Number.isFinite(n) ? n : null; };
const txt = (s: string | undefined): string | null => { const t = String(s ?? "").trim(); return t ? t : null; };

export function filaCurDesdeCsv(f: Record<string, string>, publicado: string): FilaCurDb | null {
  const smp = txt(f.smp)?.toLowerCase();
  if (!smp) return null;
  const uni_edif = [f.uni_edif_1, f.uni_edif_2, f.uni_edif_3, f.uni_edif_4].map(num).filter((n): n is number => n !== null && n > 0);
  return {
    smp, seccion: txt(f.seccion) ?? "", manzana: txt(f.manzana) ?? "", parcela: txt(f.parcela) ?? "",
    uni_edif, plano_l: num(f.plano_l) || null, tipo_mza: txt(f.tipo_mza), catalogado: num(f.catalogado) ?? 0,
    dist_1_grp: txt(f.dist_1_grp), dist_1_esp: txt(f.dist_1_esp), dist_2_grp: txt(f.dist_2_grp), dist_2_esp: txt(f.dist_2_esp),
    dist_cpu_1: txt(f.dist_cpu_1), fot_em_1: num(f.fot_em_1), barrio: txt(f.barrio), comuna: txt(f.comuna),
    alicuota: num(f.alicuota), inc_uva_21: num(f.inc_uva_21), fuente_fecha: FUENTE_FECHA, publicado,
  };
}
