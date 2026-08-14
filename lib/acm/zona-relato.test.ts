import { describe, it, expect } from "vitest";
import { construirPromptZona, sanearRelato, MAX_RELATO } from "./zona-relato";
import type { FichaZonaPoi } from "./ficha";

const pois: FichaZonaPoi[] = [
  { categoria: "subte", titulo: "Juramento", detalle: "Línea D", metros: 547, cantidad: null, lat: -34.5, lon: -58.4 },
  { categoria: "espacio_verde", titulo: "Plaza Gral. Manuel Belgrano", detalle: "", metros: 412, cantidad: null, lat: -34.5, lon: -58.4 },
  { categoria: "escuela", titulo: "12 escuelas", detalle: "8 estatales", metros: null, cantidad: 12, lat: null, lon: null },
];

const DATOS = { barrio: "Belgrano", comuna: 13, area_km2: 8.1, espacios_verdes_barrio: 31, pois };

/**
 * Solo el bloque de datos del prompt. Hace falta porque las instrucciones traen ejemplos de lo
 * que NO hay que escribir ("Un hospital no te cubre ante cualquier urgencia"), y buscar
 * "hospital" en el prompt entero da un falso positivo: lo que importa es que la categoría no
 * esté entre los datos que se le pasan como existentes.
 */
function bloqueDeDatos(prompt: string): string {
  return prompt.split("DATOS DISPONIBLES (lo único que existe):")[1].split("LO QUE MÁS SE ROMPE")[0];
}

describe("construirPromptZona", () => {
  it("expresa las distancias en cuadras, no en metros", () => {
    const p = construirPromptZona(DATOS);
    expect(p).toContain("cinco cuadras");  // 547 m
    expect(p).toContain("cuatro cuadras"); // 412 m
    expect(p).not.toContain("547");
    expect(p).not.toContain("412");
  });

  it("incluye todos los datos disponibles", () => {
    const p = construirPromptZona(DATOS);
    expect(p).toContain("Belgrano");
    expect(p).toContain("Juramento");
    expect(p).toContain("Línea D");
    expect(p).toContain("Plaza Gral. Manuel Belgrano");
    expect(p).toContain("12 escuelas");
    expect(p).toContain("8 estatales");
  });

  it("prohíbe explícitamente nombrar lugares que no estén en la lista", () => {
    const p = construirPromptZona(DATOS);
    expect(p).toMatch(/NING[UÚ]N NOMBRE PROPIO QUE NO EST[EÉ] EN LA LISTA/);
    // Los tres inventos que de verdad cometió el modelo cuando la regla era más blanda.
    expect(p).toMatch(/estaciones de destino/i);
    expect(p).toMatch(/zonas/i);
    expect(p).toMatch(/NO INVENTES PARA QU[EÉ] SIRVE/);
  });

  it("prohíbe enumerar los números de las líneas de colectivo", () => {
    expect(construirPromptZona(DATOS)).toMatch(/NUNCA enumeres n[uú]meros de l[ií]neas de colectivo/i);
  });

  it("prohíbe opinar sobre el valor de la propiedad", () => {
    const p = construirPromptZona(DATOS);
    expect(p).toMatch(/inversi[oó]n/i);
    expect(p).toMatch(/oportunidad/i);
  });

  it("pide la estructura de tres movimientos del storytelling", () => {
    const p = construirPromptZona(DATOS);
    expect(p).toContain("UBICAR");
    expect(p).toContain("CAMINAR");
    expect(p).toContain("CERRAR");
  });

  it("no lista como existentes las categorías que no vinieron en los datos", () => {
    const datos = bloqueDeDatos(construirPromptZona(DATOS));
    expect(datos).not.toMatch(/farmacia/i);
    expect(datos).not.toMatch(/hospital/i);
    expect(datos).not.toMatch(/colectivo/i);
  });

  it("omite el contexto del barrio cuando no hay (caso GBA)", () => {
    const datos = bloqueDeDatos(
      construirPromptZona({ barrio: "Olivos", comuna: null, area_km2: null, espacios_verdes_barrio: null, pois })
    );
    expect(datos).toContain("Olivos");
    expect(datos).not.toMatch(/comuna/i);
    expect(datos).not.toMatch(/km²/);
  });

  it("no le pasa al modelo el radio en metros: mezclaba unidades en el mismo párrafo", () => {
    const conFarmacias = construirPromptZona({
      ...DATOS,
      pois: [{ categoria: "farmacia", titulo: "15 farmacias", detalle: "a menos de 500 m", metros: null, cantidad: 15, lat: null, lon: null }],
    });
    expect(bloqueDeDatos(conFarmacias)).not.toContain("500 m");
    expect(bloqueDeDatos(conFarmacias)).toContain("cinco cuadras");
  });
});

describe("sanearRelato", () => {
  it("saca los encabezados en markdown que a veces mete el modelo", () => {
    expect(sanearRelato("## El barrio\n\nBelgrano es tranquilo.")).toBe("Belgrano es tranquilo.");
  });

  it("saca las negritas y las cursivas pero conserva el texto", () => {
    expect(sanearRelato("**Belgrano** es *muy* tranquilo.")).toBe("Belgrano es muy tranquilo.");
  });

  it("saca las viñetas: la hoja es prosa, no una lista", () => {
    expect(sanearRelato("- Uno.\n- Dos.")).toBe("Uno.\nDos.");
  });

  it("junta los saltos de línea múltiples en párrafos simples", () => {
    expect(sanearRelato("Uno.\n\n\n\nDos.")).toBe("Uno.\n\nDos.");
  });

  it("recorta a MAX_RELATO sin cortar una palabra al medio", () => {
    const r = sanearRelato("palabra ".repeat(400));
    expect(r.length).toBeLessThanOrEqual(MAX_RELATO);
    expect(r.endsWith("palabra")).toBe(true);
  });

  it("devuelve cadena vacía si le entra basura", () => {
    expect(sanearRelato("")).toBe("");
    expect(sanearRelato("   \n  ")).toBe("");
    expect(sanearRelato(null as any)).toBe("");
  });
});
