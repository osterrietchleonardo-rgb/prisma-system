// ─────────────────────────────────────────────────────────────────────────────
// Documentos para clientes · LA lista de extensiones de Tiptap. La usan el editor (en el
// navegador) y generarHtml (en el servidor). Es una sola a propósito: lo que el director
// puede escribir es exactamente lo que se puede dibujar, y nada más. Un nodo que no esté acá
// (imagen, iframe, link) hace que Tiptap tire error en vez de dibujarlo, y eso es la defensa
// contra meter código en un documento público: no hace falta sanitizar HTML porque nunca
// se acepta HTML.
//
// La única puerta que Tiptap deja abierta es el atributo textAlign: al serializar lo pone en
// un style tal cual, sin mirar la lista de alineaciones. Por eso antes de dibujar se recorre
// el doc y se tira cualquier textAlign que no sea left/center/right (ver limpiarDoc).
// ─────────────────────────────────────────────────────────────────────────────
import type { Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import TextAlign from "@tiptap/extension-text-align";
import { generateHTML } from "@tiptap/html";
import type { DocTiptap } from "./plantilla";

export const ALINEACIONES = ["left", "center", "right"] as const;

export function extensionesDocumento(): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3] },
      // Sin links, sin código, sin citas, sin líneas: no hacen falta y cada uno es una puerta.
      // underline queda: viene en el StarterKit de Tiptap 3.
      link: false,
      code: false,
      codeBlock: false,
      blockquote: false,
      horizontalRule: false,
      strike: false,
    }),
    TextAlign.configure({ types: ["heading", "paragraph"], alignments: [...ALINEACIONES] }),
    Mention.configure({
      HTMLAttributes: { class: "variable" },
      // En el HTML la mención se ve como su etiqueta (@nombre). Al compartir, aplicarVariables
      // ya la reemplazó por texto, así que acá solo llega en la vista previa sin datos.
      renderText: ({ node }) => String(node.attrs.label ?? `@${node.attrs.id}`),
      renderHTML: ({ node }) => ["span", { class: "variable" }, String(node.attrs.label ?? `@${node.attrs.id}`)],
    }),
  ];
}

type Nodo = { attrs?: Record<string, unknown>; content?: Nodo[] } & Record<string, unknown>;

/** Copia del doc sin ningún textAlign que no esté en la lista. */
export function limpiarDoc(doc: DocTiptap): DocTiptap {
  const limpiar = (n: Nodo): Nodo => {
    const out: Nodo = { ...n };
    if (out.attrs && "textAlign" in out.attrs) {
      const a = out.attrs.textAlign;
      if (typeof a !== "string" || !(ALINEACIONES as readonly string[]).includes(a)) {
        const { textAlign: _fuera, ...resto } = out.attrs;
        out.attrs = resto;
      }
    }
    if (Array.isArray(out.content)) out.content = out.content.map(limpiar);
    return out;
  };
  return limpiar(doc as unknown as Nodo) as unknown as DocTiptap;
}

export function generarHtml(doc: DocTiptap): string {
  return generateHTML(limpiarDoc(doc) as Record<string, unknown>, extensionesDocumento());
}
