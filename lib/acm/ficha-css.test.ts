// Guardia del CSS de la ficha pública.
//
// El CSS de la ficha vive dentro de una plantilla de JavaScript (const CSS = backtick ... backtick)
// en app/ficha-acm/[token]/page.tsx. Eso tiene dos peligros que ya nos mordieron:
//
// 1. Una comilla invertida suelta en un comentario del CSS cierra la plantilla y la página
//    entera devuelve HTTP 500. Pasó DOS veces. Este test lo detecta sin abrir el navegador.
// 2. La vista de celular se apoya en tres candados (media screen, tope de ancho, factor con
//    default 1). Si alguien saca uno, se rompe la impresión o el escritorio en silencio: el PDF
//    saldría escalado y nadie lo notaría hasta que un cliente reciba la ficha mal.
//
// El test lee el archivo como texto a propósito: no importa qué renderiza React, importa que la
// cadena de CSS esté sana.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const RUTA = path.resolve(__dirname, "../../app/ficha-acm/[token]/page.tsx");
const ARCHIVO = readFileSync(RUTA, "utf8");

/** El texto que hay entre la comilla invertida que abre la plantilla y el final del archivo. */
function cuerpoDelCss(): string {
  const inicio = ARCHIVO.indexOf("const CSS = ");
  expect(inicio, "no se encontró la declaración `const CSS =` en page.tsx").toBeGreaterThan(-1);
  const abre = ARCHIVO.indexOf("`", inicio);
  expect(abre, "la declaración de CSS ya no usa una plantilla de JavaScript").toBeGreaterThan(-1);
  return ARCHIVO.slice(abre + 1);
}

describe("CSS de la ficha pública", () => {
  it("no tiene ninguna comilla invertida suelta adentro de la plantilla", () => {
    const cuerpo = cuerpoDelCss();
    const cierra = cuerpo.indexOf("`");
    expect(cierra, "la plantilla de CSS nunca se cierra").toBeGreaterThan(-1);

    // Después del cierre solo puede quedar el punto y coma y el salto de línea final.
    const cola = cuerpo.slice(cierra + 1).trim();
    expect(
      cola,
      `hay una comilla invertida de más adentro del CSS: rompe la página con un 500. Sobra esto después del cierre: ${cola.slice(0, 120)}`,
    ).toBe(";");
  });

  it("mantiene los tres candados de la vista de celular", () => {
    const css = cuerpoDelCss();
    // 1. Solo pantalla: la impresión no se entera.
    expect(css).toContain("@media screen and (max-width: 840px)");
    // 2. La hoja se achica entera, no se reacomoda.
    expect(css).toContain("transform: scale(var(--acm-k, 1))");
    expect(css).toContain("transform-origin: top left");
    // 3. Un elemento escalado sigue ocupando su alto original: hay que descontarlo.
    expect(css).toContain("calc(-297mm * (1 - var(--acm-k, 1))");
  });

  it("deja la hoja de impresión en A4 exacto", () => {
    const css = cuerpoDelCss();
    expect(css).toContain("@page { size: A4; margin: 0; }");
    expect(css).toContain("width: 210mm; height: 297mm; min-height: 297mm;");
  });

  it("el ancho de hoja del cálculo coincide con el del CSS", () => {
    // AjusteAncho.tsx divide el ancho de la pantalla por el ancho de la hoja. Si el CSS deja de
    // ser 210mm, el factor queda mal y la hoja se corta o sobra aire.
    const css = cuerpoDelCss();
    expect(css).toContain("--w: 210mm;");

    const ajuste = readFileSync(path.resolve(__dirname, "../../app/ficha-acm/[token]/AjusteAncho.tsx"), "utf8");
    const declarado = ajuste.match(/const ANCHO_HOJA = ([\d.]+)/)?.[1];
    expect(declarado, "AjusteAncho.tsx ya no declara ANCHO_HOJA").toBeDefined();
    // 210 mm a 96 dpi = 793,7 px. Medio píxel de tolerancia.
    expect(Math.abs(Number(declarado) - (210 / 25.4) * 96)).toBeLessThan(0.5);
  });
});
