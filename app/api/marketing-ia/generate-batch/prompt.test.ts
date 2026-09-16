import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sellarContenidoPost, contarParrafos } from "@/lib/marketing-ia/parrafos";

const fuente = (archivo: string) =>
  readFileSync(join(process.cwd(), "app/api/marketing-ia", archivo), "utf8");

describe("el prompt del post pide parrafos", () => {
  it("generate-batch le pide una LISTA de parrafos, no un texto suelto", () => {
    // El bug: el prompt decia solo "cuerpo usando el angulo pas" y salia un bloque.
    const src = fuente("generate-batch/route.ts");
    expect(src).toContain('"parrafos"');
    expect(src).not.toContain('"desarrollo":"cuerpo usando el ángulo pas"');
  });

  it("generate-copy dice lo mismo que generate-batch", () => {
    // Habia dos prompts que decian cosas distintas y solo uno corria. Si vuelven a
    // separarse, esto tiene que gritar.
    expect(fuente("generate-copy/route.ts")).toContain('"parrafos"');
  });

  it("las reglas del post viajan desde un solo lugar", () => {
    for (const archivo of ["generate-batch/route.ts", "generate-copy/route.ts"]) {
      expect(fuente(archivo), archivo).toContain("REGLAS_POST");
    }
  });
});

describe("sellarContenidoPost", () => {
  it("convierte los parrafos en un desarrollo con renglones en blanco", () => {
    const sellado = sellarContenidoPost({
      hook: "Los números no mienten",
      parrafos: ["Uno.", "Dos.", "Tres."],
      cta: "Escribinos 📲",
    });
    expect(contarParrafos(sellado.desarrollo)).toBe(3);
  });

  it("EN LA IMAGEN NO VA NINGUN EMOJI: el hook sale limpio", () => {
    const sellado = sellarContenidoPost({
      hook: "🏡 Belgrano lidera la demanda 🔑",
      parrafos: ["Uno."],
      cta: "Escribinos 📲",
    });
    expect(sellado.hook).toBe("Belgrano lidera la demanda");
  });

  it("el CTA si puede llevar su emoji: no se dibuja en la placa", () => {
    const sellado = sellarContenidoPost({ hook: "Hola", parrafos: ["Uno."], cta: "Escribinos 📲" });
    expect(sellado.cta).toBe("Escribinos 📲");
  });

  it("no deja el campo parrafos dando vueltas en lo que se guarda", () => {
    // copy_drafts.content tiene que seguir siendo {hook, desarrollo, cta}.
    const sellado = sellarContenidoPost({ hook: "Hola", parrafos: ["Uno."], cta: "Chau" });
    expect(sellado).not.toHaveProperty("parrafos");
    expect(Object.keys(sellado).sort()).toEqual(["cta", "desarrollo", "hook"]);
  });

  it("un borrador viejo (ya con desarrollo) pasa sin romperse", () => {
    const sellado = sellarContenidoPost({ hook: "Hola", desarrollo: "Bloque viejo.", cta: "Chau" });
    expect(sellado.desarrollo).toBe("Bloque viejo.");
  });
});
