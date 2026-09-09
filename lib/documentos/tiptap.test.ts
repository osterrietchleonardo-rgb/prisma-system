import { describe, it, expect } from "vitest";
import { generarHtml } from "./tiptap";

const doc = (...content: unknown[]) => ({ type: "doc" as const, content });

describe("generarHtml", () => {
  it("dibuja párrafos, negrita, cursiva, subrayado, títulos, listas y alineación", () => {
    const html = generarHtml(doc(
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Quiénes somos" }] },
      { type: "paragraph", attrs: { textAlign: "center" }, content: [
        { type: "text", text: "Somos ", marks: [{ type: "bold" }] },
        { type: "text", text: "Central", marks: [{ type: "italic" }, { type: "underline" }] },
      ] },
      { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "uno" }] }] }] },
    ));
    expect(html).toContain("<h2>Quiénes somos</h2>");
    expect(html).toContain("<strong>Somos </strong>");
    expect(html).toContain("<u>");
    expect(html).toContain("<em>");
    expect(html).toContain("text-align: center");
    expect(html).toContain("<ul>");
  });

  it("una mención se dibuja como su etiqueta, para la vista previa sin datos", () => {
    const html = generarHtml(doc({ type: "paragraph", content: [{ type: "mention", attrs: { id: "nombre", label: "@nombre" } }] }));
    expect(html).toContain("@nombre");
  });

  it("escapa el texto: no hay forma de meter HTML desde el contenido", () => {
    const html = generarHtml(doc({ type: "paragraph", content: [{ type: "text", text: "<script>alert(1)</script>" }] }));
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("un nodo que no está en la lista no se dibuja", () => {
    // Un "image" o un "iframe" colado en el JSON no tiene extensión: Tiptap lo rechaza.
    expect(() => generarHtml(doc({ type: "image", attrs: { src: "http://x/y.png" } }))).toThrow();
    expect(() => generarHtml(doc({ type: "iframe", attrs: { src: "http://x" } }))).toThrow();
  });

  it("una marca de link no existe: se apagó en el StarterKit", () => {
    expect(() =>
      generarHtml(doc({ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] })),
    ).toThrow();
  });

  it("un textAlign que no es left/center/right no llega al style: TextAlign no lo valida solo", () => {
    const html = generarHtml(doc({ type: "paragraph", attrs: { textAlign: "left; background: url(http://x/pixel)" }, content: [{ type: "text", text: "x" }] }));
    expect(html).not.toContain("background");
    expect(html).not.toContain("url(");
    expect(html).toContain("<p>x</p>");
  });

  it("el doc vacío no rompe", () => {
    expect(() => generarHtml({ type: "doc", content: [] })).not.toThrow();
  });
});
