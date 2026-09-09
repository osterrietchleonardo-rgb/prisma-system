// ─────────────────────────────────────────────────────────────────────────────
// Documentos para clientes · LA lista de extensiones de Tiptap. La usan el editor (en el
// navegador) y generarHtml (en el servidor). Es una sola a propósito: lo que el director
// puede escribir es exactamente lo que se puede dibujar, y nada más. Un nodo que no esté acá
// (imagen, iframe, link) hace que Tiptap tire error en vez de dibujarlo, y eso es la defensa
// contra meter código en un documento público: no hace falta sanitizar HTML porque nunca
// se acepta HTML.
// ─────────────────────────────────────────────────────────────────────────────
import type { Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import TextAlign from "@tiptap/extension-text-align";
import { generateHTML } from "@tiptap/html";
import type { DocTiptap } from "./plantilla";

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
    TextAlign.configure({ types: ["heading", "paragraph"], alignments: ["left", "center", "right"] }),
    Mention.configure({
      HTMLAttributes: { class: "variable" },
      // En el HTML la mención se ve como su etiqueta (@nombre). Al compartir, aplicarVariables
      // ya la reemplazó por texto, así que acá solo llega en la vista previa sin datos.
      renderText: ({ node }) => String(node.attrs.label ?? `@${node.attrs.id}`),
      renderHTML: ({ node }) => ["span", { class: "variable" }, String(node.attrs.label ?? `@${node.attrs.id}`)],
    }),
  ];
}

export function generarHtml(doc: DocTiptap): string {
  return generateHTML(doc as Record<string, unknown>, extensionesDocumento());
}
