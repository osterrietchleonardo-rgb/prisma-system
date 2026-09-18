import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const src = readFileSync(path.resolve(__dirname, "../../app/prefactibilidad/[token]/page.tsx"), "utf8");

describe("la ficha pública de prefactibilidad", () => {
  it("lee por token con el cliente admin y no indexa", () => {
    expect(src).toContain('from("prefactibilidades")');
    expect(src).toContain('.eq("token", ');
    expect(src).toContain("createAdminClient");
    expect(src).toContain("robots: { index: false, follow: false }");
    expect(src).toContain('export const dynamic = "force-dynamic"');
  });
  it("lleva la leyenda y las reglas de impresión", () => {
    expect(src).toContain("LEYENDA");
    expect(src).toContain("@media print");
    expect(src).toContain("@page { size: A4; margin: 0; }");
  });
  it("el plano es un SVG generado, no una captura", () => {
    expect(src).toContain("planoSvg(");
  });
});
