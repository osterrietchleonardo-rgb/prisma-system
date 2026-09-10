// ─────────────────────────────────────────────────────────────────────────────
// Documentos para clientes · las variables que el director puede poner con @, de dónde sale
// cada una, y cómo se reemplazan en el doc de Tiptap al compartir.
//
// Son CINCO y son fijas. Si un día hace falta otra (matrícula, CUIT), se agrega acá con su
// fuente; no se inventan desde la pantalla.
// ─────────────────────────────────────────────────────────────────────────────
import { formatPhoneInternational } from "@/lib/whatsapp/phone";
import { etiquetaDeCategoria } from "@/lib/ficha/etiqueta-categoria";
import type { DocTiptap } from "./plantilla";

export type VariableId = "nombre" | "email" | "celular" | "categoria" | "agencia";

export const VARIABLES: readonly { id: VariableId; label: string; descripcion: string }[] = [
  { id: "nombre",    label: "@nombre",    descripcion: "Nombre y apellido del asesor, como está en su perfil." },
  { id: "email",     label: "@email",     descripcion: "El email con el que entra a PRISMA." },
  { id: "celular",   label: "@celular",   descripcion: "Su celular, con el formato +54 9 11 …" },
  { id: "categoria", label: "@categoria", descripcion: "Client Director / Client Support, o Asesor/a si no tiene." },
  { id: "agencia",   label: "@agencia",   descripcion: "El nombre de la inmobiliaria." },
];

const IDS = new Set<string>(VARIABLES.map((v) => v.id));

export interface DatosParaVariables {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  clasificacion?: string | null;
  role?: string | null;
  agencia?: string | null;
}

const limpio = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function valoresDeVariables(d: DatosParaVariables): Record<VariableId, string> {
  const crudo = limpio(d.phone);
  return {
    nombre: limpio(d.full_name),
    email: limpio(d.email),
    // Formateado como en la ficha del ACM. Si no se puede, crudo: un número raro es mejor que
    // un asesor que aparece sin teléfono.
    celular: crudo ? (formatPhoneInternational(crudo) ?? crudo) : "",
    categoria: etiquetaDeCategoria(d.clasificacion, d.role),
    agencia: limpio(d.agencia),
  };
}

export function variablesQueFaltan(d: DatosParaVariables): VariableId[] {
  const v = valoresDeVariables(d);
  return VARIABLES.map((x) => x.id).filter((id) => !v[id]);
}

type Nodo = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: unknown[];
  content?: Nodo[];
};

/**
 * Cuando una mención no tiene dato, además de sacarla se saca la "etiqueta corta" que la
 * precede: en `@email | Cel: @celular` sin celular, tiene que irse " | Cel: " entero.
 * Se considera etiqueta corta un nodo de texto de hasta ETIQUETA_MAX caracteres que está
 * pegado antes de la mención. Un texto más largo es una frase, y esa se deja.
 */
const ETIQUETA_MAX = 12;

function aplicarEnLinea(nodos: Nodo[], valores: Record<VariableId, string>): Nodo[] {
  const out: Nodo[] = [];
  for (const n of nodos) {
    if (n.type !== "mention") {
      out.push(n.content ? { ...n, content: aplicarEnLinea(n.content, valores) } : n);
      continue;
    }
    const id = String(n.attrs?.id ?? "");
    const valor = IDS.has(id) ? valores[id as VariableId] : "";
    if (valor) {
      out.push({ type: "text", text: valor, ...(n.marks ? { marks: n.marks } : {}) });
      continue;
    }
    // Falta el dato: se descarta la mención y, si lo que quedó antes es una etiqueta corta, también.
    const previo = out[out.length - 1];
    if (previo && previo.type === "text" && typeof previo.text === "string" && previo.text.length <= ETIQUETA_MAX) {
      out.pop();
    }
  }
  return out;
}

export function aplicarVariables(doc: DocTiptap, valores: Record<VariableId, string>): DocTiptap {
  const copia = JSON.parse(JSON.stringify(doc)) as DocTiptap & { content?: Nodo[] };
  return { ...copia, content: copia.content ? aplicarEnLinea(copia.content, valores) : [] };
}
