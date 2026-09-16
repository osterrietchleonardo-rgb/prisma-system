import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sinEmojis, unEmojiPorParrafo, armarDesarrollo, contarParrafos, sellarContenidoPost } from "./parrafos";

describe("sinEmojis", () => {
  it("saca los emojis y no deja doble espacio", () => {
    // La Inter incrustada tiene 515 glifos y devuelve .notdef para cualquier emoji:
    // si uno llega al titulo de la placa, se dibuja como nada y nadie se entera.
    expect(sinEmojis("Belgrano lidera 🏡 la demanda 🔑")).toBe("Belgrano lidera la demanda");
  });

  it("no toca los acentos, la enie ni los simbolos que Inter si tiene", () => {
    expect(sinEmojis("Departamento de 45 m² en Núñez — USD 130.000")).toBe(
      "Departamento de 45 m² en Núñez — USD 130.000"
    );
  });

  it("un texto sin emojis vuelve igual", () => {
    expect(sinEmojis("Los números no mienten")).toBe("Los números no mienten");
  });

  it("saca los emojis de tecla, que traen caracteres invisibles pegados", () => {
    // "3️⃣ razones para invertir" es un titular plausible. La base es un dígito ASCII, así que
    // el regex de pictogramas no los agarraba y el U+FE0F y el U+20E3 llegaban a la placa.
    expect(sinEmojis("Paso 1️⃣ listo")).toBe("Paso listo");
  });

  it("saca las banderas", () => {
    expect(sinEmojis("Invertí en Argentina \u{1F1E6}\u{1F1F7}")).toBe("Invertí en Argentina");
  });

  it("no deja ningún carácter invisible suelto", () => {
    // Lo que de verdad importa: un U+FE0F huérfano se dibuja como nada y nadie se entera.
    const r = sinEmojis("Paso 1️⃣ y \u{1F1E6}\u{1F1F7} y \u{1F3E1}");
    expect([...r].filter((c) => ["️", "‍", "⃣"].includes(c))).toHaveLength(0);
  });

  it("respeta las marcas legales, que Inter sí sabe dibujar", () => {
    // Medido contra la fuente incrustada: copyright, registered y trademark existen como glifos.
    expect(sinEmojis("Central Real Estate® © 2026")).toBe("Central Real Estate® © 2026");
  });

  it("saca la estrella, que Inter NO sabe dibujar", () => {
    expect(sinEmojis("Una estrella ★ suelta")).toBe("Una estrella suelta");
  });
});

describe("unEmojiPorParrafo", () => {
  it("deja el ultimo emoji, que es el que va al final", () => {
    expect(unEmojiPorParrafo("🏡 Tu próxima casa te espera 🔑")).toBe("Tu próxima casa te espera 🔑");
  });

  it("deja en paz al parrafo que ya tiene uno solo", () => {
    expect(unEmojiPorParrafo("Tu próxima casa te espera 🔑")).toBe("Tu próxima casa te espera 🔑");
  });

  it("deja en paz al parrafo que no tiene ninguno", () => {
    expect(unEmojiPorParrafo("Tu próxima casa te espera")).toBe("Tu próxima casa te espera");
  });

  it("de tres emojis deja uno", () => {
    const r = unEmojiPorParrafo("✨ Mirá 🏡 esto ⚠️");
    expect(Array.from(r.matchAll(/\p{Extended_Pictographic}/gu))).toHaveLength(1);
    expect(r).toContain("Mirá");
    expect(r).toContain("esto");
  });
});

describe("armarDesarrollo", () => {
  it("pega los parrafos con un renglon en blanco", () => {
    expect(armarDesarrollo(["Uno.", "Dos.", "Tres."])).toBe("Uno.\n\nDos.\n\nTres.");
  });

  it("descarta los vacios y recorta los espacios de los bordes", () => {
    expect(armarDesarrollo(["  Uno.  ", "", "   ", "Dos."])).toBe("Uno.\n\nDos.");
  });

  it("le aplica el tope de un emoji a cada parrafo", () => {
    expect(armarDesarrollo(["🏡 Hola 🔑", "Chau ✨"])).toBe("Hola 🔑\n\nChau ✨");
  });

  it("si el modelo manda un texto en vez de una lista, lo respeta y no rompe", () => {
    // Red de seguridad: si algun dia el modelo vuelve a mandar un string, la app no se cae.
    expect(armarDesarrollo("Un solo bloque.")).toBe("Un solo bloque.");
  });

  it("si no manda nada, devuelve vacio", () => {
    expect(armarDesarrollo(undefined)).toBe("");
    expect(armarDesarrollo(null)).toBe("");
    expect(armarDesarrollo([])).toBe("");
  });
});

describe("contarParrafos", () => {
  it("cuenta los bloques separados por renglon en blanco", () => {
    expect(contarParrafos("Uno.\n\nDos.\n\nTres.")).toBe(3);
  });

  it("el bug que motivo este trabajo: un bloque solo cuenta 1", () => {
    // El copy real de Maximiliano (copy_drafts 30b0f771) tenia 89 palabras en un bloque.
    expect(contarParrafos("Sabemos lo dificil que es encontrar un destino seguro para tu capital.")).toBe(1);
  });

  it("un texto vacio cuenta 0", () => {
    expect(contarParrafos("")).toBe(0);
    expect(contarParrafos("   ")).toBe(0);
  });
});

describe("sellarContenidoPost — el guardián del video", () => {
  it("un guion de video pasa intacto, no se sella", () => {
    // Si el guion se sellara, sus bloques desaparecerían y el asesor vería un teleprompter vacío.
    const guion = {
      estructura: "pas",
      duracion_estimada: 45,
      bloques: [{ texto: "Hola", segundos: 5, indicacion: "cálido", por_que: "abre" }],
    };
    expect(sellarContenidoPost(guion)).toBe(guion);
  });

  it("un post con bloques vacíos SÍ se sella", () => {
    // El guardián mira que `bloques` sea un arreglo, no que exista la clave.
    const sellado = sellarContenidoPost({ hook: "Hola", parrafos: ["Uno."], cta: "Chau", bloques: undefined });
    expect(sellado.desarrollo).toBe("Uno.");
  });
});

describe("el regex está escrito con escapes, no con caracteres invisibles", () => {
  it("la línea del regex es ASCII puro", () => {
    // Esta es la única línea del repo cuyo trabajo es sacar caracteres invisibles. Si alguna vez
    // se guarda con los invisibles adentro, un re-guardado en otra codificación la corrompe sin
    // que se vea nada en el diff. Ya pasó dos veces escribiendo este archivo.
    const fuente = readFileSync(join(process.cwd(), "lib/marketing-ia/parrafos.ts"), "utf8");
    const linea = fuente.split("\n").find((l) => l.includes("const EMOJI"));
    expect(linea, "no se encontró la línea del regex").toBeDefined();
    const noAscii = [...linea!].filter((c) => c.codePointAt(0)! > 127);
    expect(noAscii, `caracteres no-ASCII en la línea: ${JSON.stringify(noAscii)}`).toHaveLength(0);
  });
});
