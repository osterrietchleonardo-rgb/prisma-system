// ─────────────────────────────────────────────────────────────────────────────
// Documentos para clientes · la forma de una plantilla y cómo se limpia lo que llega.
// El cuerpo y el bloque del asesor son documentos de Tiptap (JSON), nunca HTML: el HTML lo
// genera el servidor con una lista fija de extensiones (ver ./tiptap.ts).
// ─────────────────────────────────────────────────────────────────────────────

export type PosicionBloque = "header" | "footer" | "ambos" | "ninguno";
export const POSICIONES: readonly PosicionBloque[] = ["header", "footer", "ambos", "ninguno"];

export type DocTiptap = { type: "doc"; content?: unknown[] };
export const DOC_VACIO: DocTiptap = { type: "doc", content: [] };

export interface BloqueAsesor {
  texto: DocTiptap;
  posicion: PosicionBloque;
}

export interface Plantilla {
  id: string;
  nombre: string;
  cuerpo: DocTiptap;
  header_path: string | null;
  footer_path: string | null;
  bloque_asesor: BloqueAsesor;
  version: number;
  activa: boolean;
  updated_at: string;
}

export const MAX_NOMBRE = 120;

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Un doc de Tiptap válido es `{ type: "doc" }` con un `content` que, si está, es un array. */
export function esDoc(v: unknown): v is DocTiptap {
  return esObjeto(v) && v.type === "doc" && (v.content === undefined || Array.isArray(v.content));
}

const doc = (v: unknown): DocTiptap => (esDoc(v) ? v : DOC_VACIO);

export function normalizarPlantilla(raw: unknown): Plantilla {
  const r = esObjeto(raw) ? raw : {};
  const bloque = esObjeto(r.bloque_asesor) ? r.bloque_asesor : {};
  const posicion = POSICIONES.includes(bloque.posicion as PosicionBloque)
    ? (bloque.posicion as PosicionBloque)
    : "ninguno";

  return {
    id: typeof r.id === "string" ? r.id : "",
    nombre: typeof r.nombre === "string" ? r.nombre.trim().slice(0, MAX_NOMBRE) : "",
    cuerpo: doc(r.cuerpo),
    header_path: typeof r.header_path === "string" && r.header_path ? r.header_path : null,
    footer_path: typeof r.footer_path === "string" && r.footer_path ? r.footer_path : null,
    bloque_asesor: { texto: doc(bloque.texto), posicion },
    version: typeof r.version === "number" && r.version >= 1 ? Math.floor(r.version) : 1,
    activa: r.activa === true,
    updated_at: typeof r.updated_at === "string" ? r.updated_at : "",
  };
}

/** Recorre el doc: hay algo si aparece texto no vacío o una mención. */
export function docVacio(d: unknown): boolean {
  const hayAlgo = (n: unknown): boolean => {
    if (!esObjeto(n)) return false;
    if (n.type === "mention") return true;
    if (n.type === "text" && typeof n.text === "string" && n.text.trim()) return true;
    return Array.isArray(n.content) && n.content.some(hayAlgo);
  };
  return !hayAlgo(d);
}
