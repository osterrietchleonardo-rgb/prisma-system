// ACM · El % de UN comparable que el asesor sumó pegando su link.
//
// La búsqueda normal calcula el % dentro de Postgres (`acm_match_roomix`, última versión en
// supabase/migrations/20260908120000_acm_zona_dibujada.sql). Un aviso de otro portal no está en
// la base, así que no hay función SQL que lo pueda puntuar: esta es la MISMA cuenta, dimensión
// por dimensión y con los mismos pesos, para un solo candidato.
//
// Dos diferencias, las dos a propósito:
//   1. No hay filtros duros. En la búsqueda, un aviso con 60% más de m² ni aparece; acá el asesor
//      lo eligió a mano, así que entra igual y el % dice cuánto se parece.
//   2. No hay similitud descriptiva (IA). Necesitaría el embedding del aviso, que un aviso de
//      afuera no tiene. Su peso no se cuenta y el resto se reparte, igual que hace la función
//      SQL con cualquier dato que falte. En el checklist sale como "n/a".
//
// Si cambian los pesos o una dimensión en la función SQL, hay que cambiarlos acá también. La
// prueba `puntaje-link.test.ts` fija los números; la paridad contra la base real se verificó el
// 16-sep-2026 corriendo las dos cuentas sobre los mismos avisos.

import type { SubScores } from "@/lib/acm/checklist";

/** Lo que el sujeto aporta a la cuenta, ya resuelto como lo manda /api/acm/comparables. */
export interface ParamsSujeto {
  m2: number | null;
  ambientes: number | null;
  dormitorios: number | null;
  banos: number | null;
  antiguedad: number | null;
  /** Patrones de amenities (`amenityTokens`), evaluados sin distinguir mayúsculas. */
  amenities: string[];
  cochera: boolean;
  cocheraPatron: string;
  piso: number | null;
  /** Rosa de los vientos: N, NE, E, SE, S, SO, O, NO. */
  orientacion: string | null;
  disposicion: string | null;
}

/** El candidato con los mismos campos que lee la función SQL de `mercado_avisos`. */
export interface Candidato {
  superficie_cubierta_m2: number | null;
  superficie_total_m2: number | null;
  ambientes: number | null;
  dormitorios: number | null;
  banos: number | null;
  antiguedad_anios: number | null;
  en_construccion: boolean;
  piso: number | null;
  orientacion: string | null;
  disposicion: string | null;
  cocheras: number | null;
  /** descripción + título + amenities, en ese orden, como arma el texto la función SQL. */
  texto: string;
}

export interface ValoresCandidato {
  m2: number | null;
  ambientes: number | null;
  dormitorios: number | null;
  antiguedad: number | null;
}

const ROSA: Record<string, number> = { N: 0, NE: 1, E: 2, SE: 3, S: 4, SO: 5, O: 6, NO: 7 };

/** Redondeo como el `round()` de Postgres sobre numeric: el .5 va para arriba. Sin el recorte
 *  previo, un 66,5 exacto llega como 66,4999999 en coma flotante y queda en 66 (Postgres dice 67):
 *  pasó en 2 de 305 avisos al comparar las dos cuentas. */
function redondear(x: number): number {
  return Math.round(Number(x.toFixed(9)));
}

const pos = (v: number | null | undefined): v is number => v !== null && v !== undefined && Number.isFinite(v) && v > 0;

/** Los valores del candidato tal como los normaliza el CTE `cand` de la función SQL. */
export function valoresCandidato(c: Candidato): ValoresCandidato {
  const m2 = pos(c.superficie_cubierta_m2) ? c.superficie_cubierta_m2 : c.superficie_total_m2 ?? null;
  const ambientes = pos(c.ambientes) ? c.ambientes : pos(c.dormitorios) ? c.dormitorios + 1 : null;
  const dormitorios = pos(c.dormitorios) ? c.dormitorios : null;
  const antiguedad = c.en_construccion ? null : c.antiguedad_anios !== null && c.antiguedad_anios >= 0 ? c.antiguedad_anios : null;
  return { m2, ambientes, dormitorios, antiguedad };
}

function regex(patron: string): RegExp | null {
  try {
    return new RegExp(patron, "i");
  } catch {
    return null;
  }
}

/**
 * @param zonaScore 100 mismo barrio · 70 sub-barrio · 50 lindero · 0 otro barrio. null = el
 *   sujeto no tiene barrio y la zona no se compara.
 */
export function puntuarCandidato(
  s: ParamsSujeto,
  c: Candidato,
  zonaScore: number | null,
): { match_pct: number; sub: SubScores; valores: ValoresCandidato } {
  const v = valoresCandidato(c);
  const texto = (c.texto || "").toLowerCase();

  const dims: { w: number; s: number }[] = [];
  const add = (w: number, sc: number) => {
    dims.push({ w, s: sc });
    return sc;
  };

  const sZona = zonaScore !== null ? add(20, zonaScore / 100) : null;

  const sSup = pos(s.m2) && pos(v.m2) ? add(22, Math.max(0, 1 - Math.abs(v.m2 - s.m2) / s.m2)) : null;

  const escalon = (a: number, b: number, medio: number) => (a === b ? 1 : Math.abs(a - b) <= medio ? 0.5 : 0);
  const sAmb = s.ambientes !== null && v.ambientes !== null ? add(16, escalon(v.ambientes, s.ambientes, 1)) : null;
  const sDorm = s.dormitorios !== null && v.dormitorios !== null ? add(14, escalon(v.dormitorios, s.dormitorios, 1)) : null;
  const sBan = s.banos !== null && pos(c.banos) ? add(12, escalon(c.banos, s.banos, 1)) : null;
  const sAnt = s.antiguedad !== null && v.antiguedad !== null
    ? add(14, Math.max(0, 1 - Math.abs(v.antiguedad - s.antiguedad) / 20))
    : null;

  let sAmen: number | null = null;
  if (s.amenities.length > 0) {
    const hits = s.amenities.filter((p) => regex(p)?.test(texto)).length;
    sAmen = add(12, hits / s.amenities.length);
  }

  let sCoch: number | null = null;
  if (s.cochera) {
    const porTexto = regex(s.cocheraPatron)?.test(texto) ?? false;
    sCoch = add(10, (c.cocheras ?? 0) > 0 || porTexto ? 1 : 0);
  }

  const sPiso = s.piso !== null && c.piso !== null ? add(6, escalon(c.piso, s.piso, 2)) : null;

  const oriS = s.orientacion ? ROSA[s.orientacion] : undefined;
  const oriC = c.orientacion ? ROSA[c.orientacion] : undefined;
  let sOri: number | null = null;
  if (oriS !== undefined && oriC !== undefined) {
    const d = Math.min(Math.abs(oriC - oriS), 8 - Math.abs(oriC - oriS));
    sOri = add(5, d === 0 ? 1 : d === 1 ? 0.5 : 0);
  }

  const sDisp = s.disposicion !== null && c.disposicion !== null ? add(5, c.disposicion === s.disposicion ? 1 : 0) : null;

  const wTotal = dims.reduce((a, d) => a + d.w, 0);
  const match_pct = wTotal > 0 ? redondear((dims.reduce((a, d) => a + d.s * d.w, 0) / wTotal) * 100) : 0;
  const pct = (x: number | null) => (x === null ? null : redondear(x * 100));

  return {
    match_pct,
    valores: v,
    sub: {
      sc_zona: zonaScore,
      sc_superficie: pct(sSup),
      sc_ambientes: pct(sAmb),
      sc_dormitorios: pct(sDorm),
      sc_banos: pct(sBan),
      sc_antiguedad: pct(sAnt),
      sc_amenities: pct(sAmen),
      sc_semantica: null,
      sc_cocheras: pct(sCoch),
      sc_piso: pct(sPiso),
      sc_orientacion: pct(sOri),
      sc_disposicion: pct(sDisp),
    },
  };
}
