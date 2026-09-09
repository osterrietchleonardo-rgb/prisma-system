import { describe, it, expect } from "vitest";
import { VARIABLES, valoresDeVariables, variablesQueFaltan, aplicarVariables } from "./variables";

const p = (...c: unknown[]) => ({ type: "paragraph", content: c });
const t = (text: string) => ({ type: "text", text });
const m = (id: string) => ({ type: "mention", attrs: { id, label: `@${id}` } });
const docDe = (...parrafos: unknown[]) => ({ type: "doc" as const, content: parrafos });

const central = {
  full_name: "Ana Pérez", email: "ana@central.com", phone: "5491123456789",
  clasificacion: "client_director", role: "asesor", agencia: "Central Real Estate",
};

describe("VARIABLES", () => {
  it("son cinco, fijas, y cada una explica qué es", () => {
    expect(VARIABLES.map((v) => v.id)).toEqual(["nombre", "email", "celular", "categoria", "agencia"]);
    for (const v of VARIABLES) expect(v.descripcion.length).toBeGreaterThan(10);
  });
});

describe("valoresDeVariables", () => {
  it("saca cada valor de donde corresponde, y el celular formateado", () => {
    const v = valoresDeVariables(central);
    expect(v.nombre).toBe("Ana Pérez");
    expect(v.email).toBe("ana@central.com");
    expect(v.celular).toBe("+54 9 11 2345 6789"); // así lo formatea lib/whatsapp/phone
    expect(v.categoria).toBe("Client Director");
    expect(v.agencia).toBe("Central Real Estate");
  });

  it("lo que falta queda vacío, no 'undefined' ni 'null'", () => {
    const v = valoresDeVariables({ full_name: "Ana", role: "asesor" });
    expect(v.email).toBe("");
    expect(v.celular).toBe("");
    expect(v.agencia).toBe("");
  });

  it("un teléfono que no se puede formatear se muestra crudo antes que vacío", () => {
    expect(valoresDeVariables({ phone: "1234", role: "asesor" }).celular).toBe("1234");
  });
});

describe("variablesQueFaltan", () => {
  it("lista lo que el asesor no tiene cargado", () => {
    expect(variablesQueFaltan({ full_name: "Ana", role: "asesor", agencia: "X" })).toEqual(["email", "celular"]);
  });
  it("la categoría nunca falta: sin clasificación es 'Asesor/a'", () => {
    expect(variablesQueFaltan(central)).toEqual([]);
  });
});

describe("aplicarVariables", () => {
  const valores = valoresDeVariables(central);

  it("reemplaza cada mención por su valor como texto plano", () => {
    const out = aplicarVariables(docDe(p(t("Hola, soy "), m("nombre"), t(" de "), m("agencia"))), valores);
    expect(out).toEqual(docDe(p(t("Hola, soy "), t("Ana Pérez"), t(" de "), t("Central Real Estate"))));
  });

  it("conserva las marcas (negrita) del texto de alrededor", () => {
    const negrita = { type: "mention", attrs: { id: "nombre" }, marks: [{ type: "bold" }] };
    const out = aplicarVariables(docDe(p(negrita)), valores);
    expect(out).toEqual(docDe(p({ type: "text", text: "Ana Pérez", marks: [{ type: "bold" }] })));
  });

  it("si falta el dato, saca la mención Y la etiqueta corta que la precede: 'Cel: @celular' desaparece entero", () => {
    const sinCel = { ...valores, celular: "" };
    const out = aplicarVariables(docDe(p(m("email"), t(" | Cel: "), m("celular"))), sinCel);
    expect(out).toEqual(docDe(p(t("ana@central.com"))));
  });

  it("si falta el dato en medio de una frase larga, saca solo la mención y deja la frase", () => {
    const sinAg = { ...valores, agencia: "" };
    const out = aplicarVariables(docDe(p(t("Trabajo desde hace veinte años en "), m("agencia"))), sinAg);
    expect(out).toEqual(docDe(p(t("Trabajo desde hace veinte años en "))));
  });

  it("una mención con id desconocido se saca sin romper (y la frase larga de antes queda)", () => {
    const out = aplicarVariables(docDe(p(t("Nuestro número de registro es "), m("cuit"))), valores);
    expect(out).toEqual(docDe(p(t("Nuestro número de registro es "))));
  });

  it("no toca nodos que no son menciones (títulos, listas) ni el doc original", () => {
    const original = docDe({ type: "heading", attrs: { level: 2 }, content: [t("Título")] }, p(m("nombre")));
    const copia = JSON.parse(JSON.stringify(original));
    const out = aplicarVariables(original, valores);
    expect(original).toEqual(copia);
    expect(out.content?.[0]).toEqual({ type: "heading", attrs: { level: 2 }, content: [t("Título")] });
  });
});
