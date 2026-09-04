import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { FORMATOS, FORMATOS_OFRECIDOS, formatoDe } from "./formatos";

describe("formatos de placa", () => {
  it("la medida de cada formato es la del ratio que dice tener", () => {
    // El bug que motivo este archivo: la pantalla decia 9:16 y el archivo salia 768x1376
    // (0.5581). Si alguien escribe 1080x1340 y lo llama 4:5, esto tiene que gritar.
    const esperado: Record<string, number> = { "9:16": 9 / 16, "4:5": 4 / 5, "1:1": 1 };
    for (const f of FORMATOS_OFRECIDOS) {
      expect(f.ancho / f.alto, `${f.etiqueta} (${f.ratio})`).toBeCloseTo(esperado[f.ratio], 4);
    }
  });

  it("esta el 4:5 de Instagram, en 1080x1350", () => {
    expect(FORMATOS.post_vertical.ratio).toBe("4:5");
    expect(FORMATOS.post_vertical.ancho).toBe(1080);
    expect(FORMATOS.post_vertical.alto).toBe(1350);
  });

  it("hay un solo formato vertical largo ofrecido", () => {
    // Reels e Historia eran dos botones con el mismo tamano. Si vuelven a ser dos, esto falla.
    const verticalesLargos = FORMATOS_OFRECIDOS.filter((f) => f.ratio === "9:16");
    expect(verticalesLargos).toHaveLength(1);
  });

  it("un formato retirado se sigue pudiendo leer", () => {
    // Hay 12 placas 'historia' en produccion. Si formatoDe devolviera undefined, la galeria
    // rompe al abrirlas.
    const viejo = formatoDe("historia");
    expect(viejo.ancho).toBe(1080);
    expect(viejo.alto).toBe(1920);
  });

  it("todo formato ofrecido esta permitido por el CHECK de la base", () => {
    // Esta es la prueba que importa: agregar un formato a la pantalla SIN la migracion hace que
    // el insert falle con 23514 despues de generar y pagar la imagen. Se lee la ultima migracion
    // que define la restriccion, no el codigo, para que no puedan mentirse entre si.
    const dir = join(process.cwd(), "supabase", "migrations");
    const sql = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => readFileSync(join(dir, f), "utf8"))
      .filter((t) => t.includes("generated_images_format_check"))
      .pop();

    expect(sql, "ninguna migracion define generated_images_format_check").toBeTruthy();

    // Se lee SOLO la clausula CHECK, no el archivo entero: los comentarios de la migracion
    // nombran los formatos y harian pasar la prueba sin que la restriccion real los permita.
    // (Paso: la primera version de esta prueba daba verde con la migracion rota a proposito.)
    const clausula = /CHECK\s*\(\s*format\s+IN\s*\(([^)]*)\)/i.exec(sql!)?.[1];
    expect(clausula, "no se pudo leer la clausula CHECK de la migracion").toBeTruthy();

    const permitidos = clausula!.split(",").map((v) => v.trim().replace(/^'|'$/g, ""));
    for (const f of FORMATOS_OFRECIDOS) {
      expect(permitidos, `falta '${f.id}' en el CHECK de la migracion`).toContain(f.id);
    }
  });
});
