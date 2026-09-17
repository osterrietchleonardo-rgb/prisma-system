// ACM · Sumar un comparable pegando el link del aviso (pedido de un asesor de Central, 31-ago).
//
// El camino tiene dos ramas y la primera se intenta siempre antes:
//
//   1. El aviso YA está en la red (hoy: Zonaprop, identificado por su número). Se lee de
//      `mercado_avisos` con todo lo que tiene: fotos, amenities, descripción, antigüedad. Si
//      además está activo y es venta, entra exactamente como cualquier comparable de la red
//      (source "roomix"), así la ficha y la comparación por fotos lo tratan igual que al resto.
//   2. Si no está, se lee la página del portal con el extractor (el mismo del modo "Desde un
//      link"), que además devuelve las fotos del propio aviso (lib/acm/fotos-aviso.ts).
//
// El % sale de `puntaje-link.ts`, la misma cuenta que la función SQL de la búsqueda.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AcmComparable, Operacion, Sujeto } from "@/lib/tasacion/types";
import { buildChecklist } from "@/lib/acm/checklist";
import { extractFromUrl } from "@/lib/acm/extract";
import { idZonaprop } from "@/lib/acm/fotos-aviso";
import { normalizarImagenes, urlFotoRed } from "@/lib/acm/fotos-url";
import { puntuarCandidato, type Candidato, type ParamsSujeto } from "@/lib/acm/puntaje-link";
import { antiguedadSujeto } from "@/lib/acm/antiguedad";
import { ZONA_GENERAL } from "@/lib/acm/barrio-aviso";
import {
  amenityLabels,
  amenityTokens,
  COCHERA_PATRON,
  disposicionParam,
  orientacionParam,
  sujetoAmbientes,
  sujetoAntiguedad,
  sujetoCochera,
  sujetoDormitorios,
  sujetoM2,
} from "@/lib/acm/subject";

/** Misma normalización que `acm_norm` en la base: minúsculas y sin tildes. */
export function normBarrio(t: string | null | undefined): string {
  const de = "áàäâãéèëêíìïîóòöôõúùüûñç";
  const a = "aaaaaeeeeiiiiooooouuuunc";
  return (t || "")
    .trim()
    .toLowerCase()
    .split("")
    .map((ch) => {
      const i = de.indexOf(ch);
      return i >= 0 ? a[i] : ch;
    })
    .join("");
}

/**
 * El puntaje de zona, con la misma tabla que usa la búsqueda (`acm_barrio_relacion`).
 *
 * - El barrio de la propiedad está en la tabla: 100 mismo barrio · 70 sub-barrio · 50 lindero,
 *   igual que la búsqueda. Cualquier otro barrio: 0.
 * - No está en la tabla (fuera de CABA, un barrio escrito raro): ahí la búsqueda no puntúa la
 *   zona, así que un aviso del mismo lugar tampoco la puntúa (null). Pero uno de OTRO lugar
 *   pesa 0: es exactamente el caso que motivó el pedido — un ACM de Luján que traía Luján de
 *   Cuyo. Que el asesor lo haya elegido no lo hace del mismo barrio.
 */
export async function zonaScore(
  admin: SupabaseClient,
  barrioSujeto: string,
  barriosAviso: (string | null | undefined)[],
): Promise<number | null> {
  const key = normBarrio(barrioSujeto);
  if (!key) return null;
  // "CABA, Argentina" no es un barrio: es lo que devuelve un portal cuando no lo dice (visto en
  // Argenprop el 16-sep). No saber el barrio no es ser de otro barrio: la zona no se compara.
  const claves = Array.from(
    new Set(barriosAviso.map((b) => normBarrio((b || "").split(",")[0])).filter((b) => b && !ZONA_GENERAL.test(b))),
  );
  if (claves.length === 0) return null;
  const { data, error } = await admin.from("acm_barrio_relacion").select("relacionado, zona_score").eq("barrio", key);
  if (error) throw error;
  const relaciones = data || [];
  if (relaciones.length === 0) {
    const mismo = claves.some((c) => c === key || c.includes(key) || key.includes(c));
    return mismo ? null : 0;
  }
  if (claves.includes(key)) return 100;
  const scores = relaciones.filter((r: any) => claves.includes(r.relacionado)).map((r: any) => Number(r.zona_score));
  return scores.length ? Math.max(...scores) : 0;
}

/** Lo que el sujeto aporta a la cuenta, igual que lo arma /api/acm/comparables. */
export function paramsSujeto(s: Partial<Sujeto>): ParamsSujeto {
  return {
    m2: sujetoM2(s),
    ambientes: sujetoAmbientes(s),
    dormitorios: sujetoDormitorios(s),
    banos: s.banos && s.banos > 0 ? s.banos : null,
    antiguedad: sujetoAntiguedad(s),
    amenities: amenityTokens(s.amenidades),
    cochera: sujetoCochera(s),
    cocheraPatron: COCHERA_PATRON,
    piso: s.piso ?? null,
    orientacion: orientacionParam(s),
    disposicion: disposicionParam(s),
  };
}

// Lo que se lee de la red. Mismas columnas que la función SQL, más lo que se muestra.
const COLUMNAS_AVISO =
  "id, estado, calidad, operacion, tipo, titulo, descripcion, direccion, barrio, sub_barrio, ciudad, precio, moneda, " +
  "superficie_total_m2, superficie_cubierta_m2, ambientes, dormitorios, banos, cocheras, antiguedad_anios, piso, " +
  "orientacion, disposicion, en_construccion, amenities, fotos, url_publica, publicador_nombre, publicado_desde, " +
  "dias_publicado, variacion_precio_pct, expensas, expensas_moneda, es_dueno_directo, apto_credito";

const TIPOS_RED: Record<string, string> = {
  departamento: "departamento|apart|condo", casa: "casa|house|chalet", ph: "\\bph\\b", local: "local|premises",
  oficina: "oficina|office", terreno: "terreno|lote|land",
};

export type ResultadoLink =
  | { ok: true; comparable: AcmComparable; aviso?: string }
  | { ok: false; error: string };

export async function comparableDesdeLink(args: {
  admin: SupabaseClient;
  url: string;
  sujeto: Partial<Sujeto>;
  operacion: Operacion;
  pesoSemantica: number;
}): Promise<ResultadoLink> {
  const { admin, url, sujeto, operacion, pesoSemantica } = args;
  const ps = paramsSujeto(sujeto);
  const sujetoChecklist = {
    tipo: sujeto.tipo_propiedad || "—",
    zona: sujeto.barrio || "",
    m2: ps.m2,
    ambientes: ps.ambientes,
    dormitorios: ps.dormitorios,
    banos: ps.banos,
    antiguedad: antiguedadSujeto(sujeto as any),
    amenities: amenityLabels(sujeto.amenidades),
    cocheras: ps.cochera,
    piso: ps.piso,
    orientacion: ps.orientacion,
    disposicion: ps.disposicion,
  };

  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return { ok: false, error: "Ese link no es válido." };
  }

  // ── 1. ¿Está en la red? ──────────────────────────────────────────────────────────────────
  const idZp = /(^|\.)zonaprop\.com\.ar$/.test(host) ? idZonaprop(url) : null;
  if (idZp) {
    const { data: filas, error } = await admin.from("mercado_avisos").select(COLUMNAS_AVISO).eq("id", Number(idZp)).limit(1);
    if (error) throw error;
    const r: any = filas?.[0];
    if (r) {
      const candidato: Candidato = {
        superficie_cubierta_m2: num(r.superficie_cubierta_m2),
        superficie_total_m2: num(r.superficie_total_m2),
        ambientes: num(r.ambientes),
        dormitorios: num(r.dormitorios),
        banos: num(r.banos),
        antiguedad_anios: num(r.antiguedad_anios),
        en_construccion: Boolean(r.en_construccion),
        piso: num(r.piso),
        orientacion: r.orientacion ?? null,
        disposicion: r.disposicion ?? null,
        cocheras: num(r.cocheras),
        texto: `${r.descripcion ?? ""} ${r.titulo ?? ""} ${(r.amenities || []).join(" ")}`,
      };
      const zona = await zonaScore(admin, sujeto.barrio || "", [r.barrio, r.sub_barrio, r.ciudad]);
      const { match_pct, sub, valores } = puntuarCandidato(ps, candidato, zona);
      const fotos = normalizarImagenes(r.fotos).slice(0, 16);
      const enLaRed = r.estado === "activo" && r.calidad === "ok" && r.operacion === "venta";
      const checklist = buildChecklist({
        sub, operacion, pesoSemantica, sujeto: sujetoChecklist,
        comp: {
          tipo: r.tipo || "", zona: [r.barrio, r.direccion].filter(Boolean).join(" "),
          m2: valores.m2, ambientes: valores.ambientes, dormitorios: valores.dormitorios, banos: num(r.banos),
          antiguedad: valores.antiguedad, amenities: (r.amenities || []).slice(0, 12),
          cocheras: r.cocheras ?? null, piso: r.piso ?? null, orientacion: r.orientacion ?? null, disposicion: r.disposicion ?? null,
        },
      });
      marcarFiltros(checklist, sujeto, operacion, r.tipo, r.operacion);
      const comparable: AcmComparable = {
        id: enLaRed ? `roomix_${r.id}` : `link_zonaprop_${r.id}`,
        source: enLaRed ? "roomix" : "link",
        agregado_por_link: true,
        match_pct,
        checklist,
        titulo: r.titulo || "",
        direccion: r.direccion || r.barrio || "",
        zona: r.barrio || "",
        tipo: r.tipo || "",
        m2: valores.m2,
        ambientes: valores.ambientes,
        dormitorios: valores.dormitorios,
        banos: num(r.banos),
        antiguedad: r.en_construccion ? -1 : valores.antiguedad,
        precio: r.precio != null ? Number(r.precio) : null,
        moneda: r.moneda || "USD",
        precio_m2: r.precio && valores.m2 ? Math.round(Number(r.precio) / valores.m2) : null,
        imagen: fotos[0] ? urlFotoRed(fotos[0]) : null,
        url: r.url_publica || url,
        responsable: r.publicador_nombre || "Inmobiliaria colaboradora",
        fecha_publicacion: r.publicado_desde || null,
        variacion_pct: r.variacion_precio_pct != null ? Number(r.variacion_precio_pct) : null,
        dias_publicado: r.dias_publicado ?? null,
        expensas: r.expensas != null ? Number(r.expensas) : null,
        expensas_moneda: r.expensas_moneda || "ARS",
        dueno_directo: Boolean(r.es_dueno_directo),
        apto_credito: Boolean(r.apto_credito),
        en_construccion: Boolean(r.en_construccion),
        ...(enLaRed ? {} : { link_datos: { fotos, amenities: (r.amenities || []).slice(0, 30), descripcion: r.descripcion || "" } }),
      };
      const aviso = r.estado !== "activo"
        ? "Ojo: este aviso ya no está publicado en el portal. Lo sumamos con los datos que tenía."
        : undefined;
      return { ok: true, comparable, aviso };
    }
  }

  // ── 2. Leer la página del portal ─────────────────────────────────────────────────────────
  const ex = await extractFromUrl(url, { conFotos: true });
  const S = ex.sujeto || {};
  const tieneDatos = Boolean(ex.precio || (S.m2_cubiertos && S.m2_cubiertos > 0) || (S.dormitorios && S.dormitorios > 0));
  if (!tieneDatos) {
    return {
      ok: false,
      error: ex.aviso?.startsWith("Ese link no se puede abrir")
        ? ex.aviso
        : "No pudimos leer ese aviso: el portal no dejó ver los datos. Probá de nuevo en un rato o con otro link.",
    };
  }

  const amenFlags = (S.amenidades || {}) as Record<string, boolean>;
  const amenLabels = amenityLabels(S.amenidades as any);
  const descripcion = (ex.descripcion || "").trim();
  const m2Cub = S.m2_cubiertos && S.m2_cubiertos > 0 ? S.m2_cubiertos : null;
  // La IA del extractor pone 0 tanto en "a estrenar" como en "no lo dice": no se puede
  // distinguir, así que el 0 se toma como que no está. Mejor sin dato que inventar un a estrenar.
  const ant = S.antiguedad_anios && S.antiguedad_anios > 0 ? S.antiguedad_anios : null;
  const ORIENT: Record<string, string> = { norte: "N", sur: "S", este: "E", oeste: "O", ne: "NE", no: "NO", se: "SE", so: "SO" };
  const candidato: Candidato = {
    superficie_cubierta_m2: m2Cub,
    superficie_total_m2: m2Cub,
    ambientes: null,
    dormitorios: S.dormitorios ?? null,
    banos: S.banos ?? null,
    antiguedad_anios: ant,
    en_construccion: false,
    piso: S.piso ?? null,
    orientacion: S.orientacion ? ORIENT[S.orientacion] ?? null : null,
    disposicion: null,
    cocheras: amenFlags.cochera_cubierta || amenFlags.cochera_descubierta ? 1 : null,
    texto: `${descripcion} ${S.direccion ?? ""} ${amenLabels.join(" ")}`,
  };
  const zona = await zonaScore(admin, sujeto.barrio || "", [S.barrio]);
  const { match_pct, sub, valores } = puntuarCandidato(ps, candidato, zona);
  const checklist = buildChecklist({
    sub, operacion, pesoSemantica, sujeto: sujetoChecklist,
    comp: {
      tipo: S.tipo_propiedad || "", zona: [S.barrio, S.direccion].filter(Boolean).join(" "),
      m2: valores.m2, ambientes: valores.ambientes, dormitorios: valores.dormitorios, banos: S.banos ?? null,
      antiguedad: valores.antiguedad, amenities: amenLabels,
      cocheras: candidato.cocheras, piso: candidato.piso, orientacion: candidato.orientacion, disposicion: null,
    },
  });
  marcarFiltros(checklist, sujeto, operacion, S.tipo_propiedad, ex.operacion);

  const fotos = (ex.fotos || []).slice(0, 16);
  const portal = host.replace(/^www\./, "").split(".")[0];
  const comparable: AcmComparable = {
    id: `link_${portal}_${hashCorto(url)}`,
    source: "link",
    agregado_por_link: true,
    match_pct,
    checklist,
    titulo: S.direccion || "",
    direccion: S.direccion || S.barrio || "",
    zona: S.barrio || "",
    tipo: S.tipo_propiedad || "",
    m2: valores.m2,
    ambientes: valores.ambientes,
    dormitorios: valores.dormitorios,
    banos: S.banos ?? null,
    antiguedad: ant,
    precio: ex.precio ?? null,
    moneda: ex.moneda || "USD",
    precio_m2: ex.precio && valores.m2 ? Math.round(ex.precio / valores.m2) : null,
    imagen: fotos[0] ? urlFotoRed(fotos[0]) : null,
    url,
    responsable: ex.responsable || portalLegible(host),
    fecha_publicacion: ex.fecha_publicacion ?? null,
    expensas: ex.expensas ?? null,
    expensas_moneda: "ARS",
    link_datos: { fotos, amenities: amenLabels, descripcion },
  };

  const faltantes: string[] = [];
  if (!ex.precio) faltantes.push("el precio");
  if (!m2Cub) faltantes.push("la superficie");
  if (fotos.length === 0) faltantes.push("las fotos");
  const aviso = faltantes.length
    ? `Lo sumamos, pero el portal no dejó leer ${faltantes.join(", ").replace(/, ([^,]*)$/, " ni $1")}.`
    : undefined;
  return { ok: true, comparable, aviso };
}

/** Tipo y operación son filtros en la búsqueda, así que el checklist los da siempre por
 *  coincidentes. Un aviso sumado a mano puede no coincidir: se dice. */
function marcarFiltros(
  checklist: AcmComparable["checklist"],
  sujeto: Partial<Sujeto>,
  operacion: Operacion,
  tipoAviso: string | null | undefined,
  operacionAviso: string | null | undefined,
) {
  const tipo = checklist.find((i) => i.dimension === "tipo");
  if (tipo && tipoAviso) {
    tipo.comp_val = tipoAviso;
    const patron = TIPOS_RED[sujeto.tipo_propiedad || ""];
    if (patron && !new RegExp(patron, "i").test(tipoAviso)) tipo.estado = "distinto";
  }
  const op = checklist.find((i) => i.dimension === "operacion");
  if (op && operacionAviso) {
    op.comp_val = operacionAviso;
    if (operacionAviso !== operacion) op.estado = "distinto";
  }
}

/** Las columnas numeric pueden llegar como texto ("275.00") según el cliente que las lea. */
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function portalLegible(host: string): string {
  if (host.includes("zonaprop")) return "Zonaprop";
  if (host.includes("argenprop")) return "Argenprop";
  if (host.includes("mercadolibre")) return "MercadoLibre";
  return host.replace(/^www\./, "");
}

/** Identificador estable del link (sin la parte de seguimiento `?…`/`#…`), para que el mismo
 *  aviso pegado dos veces no entre dos veces. */
export function hashCorto(url: string): string {
  const limpio = url.split(/[?#]/)[0].replace(/\/+$/, "").toLowerCase();
  let h = 5381;
  for (let i = 0; i < limpio.length; i++) h = ((h << 5) + h + limpio.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
