// El editor tipo Word de las plantillas: negrita, cursiva, subrayado, títulos, listas,
// alineación, y variables al tipear @. Usa LA MISMA lista de extensiones que el servidor
// (lib/documentos/tiptap.ts), más la sugerencia de variables, que es solo del navegador.
"use client";
import { useEditor, EditorContent, ReactRenderer } from "@tiptap/react";
import Mention from "@tiptap/extension-mention";
import type { JSONContent } from "@tiptap/core";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import tippy, { type Instance as Tippy } from "tippy.js";
import {
  Bold, Italic, Underline as UnderlineIcon, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, Heading2, Heading3, AtSign,
} from "lucide-react";
import { extensionesDocumento } from "@/lib/documentos/tiptap";
import type { DocTiptap } from "@/lib/documentos/plantilla";
import { MenuVariables, itemsDeVariables, type ItemVariable, type MenuVariablesRef } from "./MenuVariables";

/** Las mismas extensiones que el servidor, y además la sugerencia de variables al tipear @. */
function extensionesConSugerencia() {
  return extensionesDocumento().map((ext) =>
    ext.name === "mention"
      ? Mention.configure({
          HTMLAttributes: { class: "variable" },
          renderText: ({ node }) => String(node.attrs.label ?? `@${node.attrs.id}`),
          suggestion: {
            char: "@",
            items: ({ query }) => itemsDeVariables(query),
            render: () => {
              let comp: ReactRenderer<MenuVariablesRef>;
              let pop: Tippy[];
              return {
                onStart: (props: SuggestionProps<ItemVariable>) => {
                  comp = new ReactRenderer(MenuVariables, { props, editor: props.editor }) as unknown as ReactRenderer<MenuVariablesRef>;
                  if (!props.clientRect) return;
                  pop = tippy("body", {
                    getReferenceClientRect: props.clientRect as () => DOMRect,
                    appendTo: () => document.body,
                    content: comp.element,
                    showOnCreate: true,
                    interactive: true,
                    trigger: "manual",
                    placement: "bottom-start",
                  });
                },
                onUpdate: (props: SuggestionProps<ItemVariable>) => {
                  comp.updateProps(props);
                  if (props.clientRect) pop?.[0]?.setProps({ getReferenceClientRect: props.clientRect as () => DOMRect });
                },
                onKeyDown: (props: SuggestionKeyDownProps) => {
                  if (props.event.key === "Escape") { pop?.[0]?.hide(); return true; }
                  return comp.ref?.onKeyDown(props) ?? false;
                },
                onExit: () => { pop?.[0]?.destroy(); comp.destroy(); },
              };
            },
          },
        })
      : ext,
  );
}

function Boton({ on, activo, title, children }: { on: () => void; activo?: boolean; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={!!activo}
      onMouseDown={(e) => { e.preventDefault(); on(); }}
      className={`h-8 w-8 inline-flex items-center justify-center rounded ${activo ? "bg-accent/20 text-accent" : "hover:bg-muted"}`}
    >
      {children}
    </button>
  );
}

export function EditorDocumento({
  value, onChange, compacto = false, testId,
}: { value: DocTiptap; onChange: (doc: DocTiptap) => void; compacto?: boolean; testId?: string }) {
  const editor = useEditor({
    extensions: extensionesConSugerencia(),
    content: value as JSONContent,
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getJSON() as DocTiptap),
    editorProps: {
      attributes: {
        class: `prose prose-sm max-w-none focus:outline-none ${compacto ? "min-h-[64px]" : "min-h-[320px]"} px-3 py-2`,
        ...(testId ? { "data-testid": testId } : {}),
      },
    },
  });
  if (!editor) return null;

  const Sep = () => <span className="mx-1 h-5 w-px bg-accent/15" />;

  return (
    <div className="rounded-lg border border-accent/15 bg-background">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-accent/10 px-2 py-1">
        <Boton title="Negrita" activo={editor.isActive("bold")} on={() => editor.chain().focus().toggleBold().run()}><Bold className="h-4 w-4" /></Boton>
        <Boton title="Cursiva" activo={editor.isActive("italic")} on={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-4 w-4" /></Boton>
        <Boton title="Subrayado" activo={editor.isActive("underline")} on={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon className="h-4 w-4" /></Boton>
        {!compacto && (
          <>
            <Sep />
            <Boton title="Título" activo={editor.isActive("heading", { level: 2 })} on={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="h-4 w-4" /></Boton>
            <Boton title="Subtítulo" activo={editor.isActive("heading", { level: 3 })} on={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 className="h-4 w-4" /></Boton>
            <Boton title="Lista" activo={editor.isActive("bulletList")} on={() => editor.chain().focus().toggleBulletList().run()}><List className="h-4 w-4" /></Boton>
            <Boton title="Lista numerada" activo={editor.isActive("orderedList")} on={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></Boton>
            <Sep />
            <Boton title="Izquierda" activo={editor.isActive({ textAlign: "left" })} on={() => editor.chain().focus().setTextAlign("left").run()}><AlignLeft className="h-4 w-4" /></Boton>
            <Boton title="Centro" activo={editor.isActive({ textAlign: "center" })} on={() => editor.chain().focus().setTextAlign("center").run()}><AlignCenter className="h-4 w-4" /></Boton>
            <Boton title="Derecha" activo={editor.isActive({ textAlign: "right" })} on={() => editor.chain().focus().setTextAlign("right").run()}><AlignRight className="h-4 w-4" /></Boton>
          </>
        )}
        <Sep />
        <Boton title="Insertar variable (o escribí @)" on={() => editor.chain().focus().insertContent("@").run()}><AtSign className="h-4 w-4" /></Boton>
        <span className="ml-auto text-[11px] text-muted-foreground pr-1 hidden sm:inline">
          Escribí <b>@</b> para poner el nombre, el mail o el celular del asesor
        </span>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
