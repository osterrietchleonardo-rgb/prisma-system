import { describe, it, expect } from "vitest";
import {
  normalizarDireccion,
  numerosDe,
  direccionesCoinciden,
  actividadCoincideConDireccion,
  MINIMO_PARA_BUSCAR,
} from "./direcciones";

describe("normalizarDireccion", () => {
  it("saca mayúsculas, acentos y puntuación", () => {
    expect(normalizarDireccion("ESPINOSA 3166 - CABA")).toBe("espinosa 3166 caba");
    expect(normalizarDireccion("Güemes 3720 PB")).toBe("guemes 3720 pb");
    expect(normalizarDireccion("Av. Córdoba 2450 5°B")).toBe("av cordoba 2450 5 b");
  });

  it("colapsa los espacios de más y recorta las puntas", () => {
    expect(normalizarDireccion("  Bulnes   1180  ")).toBe("bulnes 1180");
  });

  it("no rompe con vacío", () => {
    expect(normalizarDireccion("")).toBe("");
    expect(normalizarDireccion(null)).toBe("");
    expect(normalizarDireccion(undefined)).toBe("");
  });
});

describe("numerosDe", () => {
  it("saca la altura y el piso", () => {
    expect(numerosDe("Av. Cordoba 2450 5B")).toEqual(["2450", "5"]);
    expect(numerosDe("MANZANARES 2131 4")).toEqual(["2131", "4"]);
  });

  it("una dirección sin números devuelve lista vacía", () => {
    expect(numerosDe("Barrio El Resuello")).toEqual([]);
  });
});

describe("direccionesCoinciden", () => {
  it("encuentra la misma propiedad escrita de dos formas distintas", () => {
    // El caso real del Excel del cliente contra lo que tipearía otro asesor.
    expect(direccionesCoinciden("ESPINOSA 3166 - CABA", "Espinosa 3166")).toBe(true);
    expect(direccionesCoinciden("Av. Cordoba 2450 5B", "av cordoba 2450 5b")).toBe(true);
    expect(direccionesCoinciden("Güemes 3720 PB", "guemes 3720")).toBe(true);
  });

  it("NO confunde dos alturas parecidas de la misma calle", () => {
    // Como texto se parecen muchísimo. Son dos propiedades distintas, y
    // enlazarlas haría desaparecer una venta entera del volumen.
    expect(direccionesCoinciden("Espinosa 3166", "Espinosa 316")).toBe(false);
    expect(direccionesCoinciden("Espinosa 3166", "Espinosa 2200")).toBe(false);
  });

  it("NO confunde dos calles distintas con la misma altura", () => {
    expect(direccionesCoinciden("Espinosa 3166", "Rivadavia 3166")).toBe(false);
  });

  it("distingue dos departamentos del mismo edificio", () => {
    // Este es el caso que el asesor no puede resolver mirando el aviso a
    // ciegas, así que lo tiene que resolver el algoritmo: pisos distintos son
    // propiedades distintas.
    expect(direccionesCoinciden("Av. Cordoba 2450 5B", "Av. Cordoba 2450 8A")).toBe(false);
  });

  it("NO confunde dos departamentos del mismo piso", () => {
    // 5B y 5A comparten los mismos numeros (2450 y 5) y el texto es casi
    // identico: sin el control de la unidad se enlazaban.
    expect(direccionesCoinciden("Av. Cordoba 2450 5B", "Av. Cordoba 2450 5A")).toBe(false);
    expect(direccionesCoinciden("Humberto Primero 2230 3D", "Humberto Primero 2230 3C")).toBe(false);
  });

  it("si uno no escribio el departamento, igual coincide", () => {
    // Falta el dato, no se contradice: eso lo confirma la persona.
    expect(direccionesCoinciden("Av. Cordoba 2450 5B", "Av. Cordoba 2450")).toBe(true);
  });

  it("un texto demasiado corto no coincide con nada", () => {
    // Sin esto, alguien podría escribir una letra e ir tanteando hasta
    // descubrir en qué direcciones cerró un compañero.
    expect("caba".length).toBeLessThan(MINIMO_PARA_BUSCAR);
    expect(direccionesCoinciden("caba", "ESPINOSA 3166 - CABA")).toBe(false);
    expect(direccionesCoinciden("", "Espinosa 3166")).toBe(false);
  });

  it("dos direcciones sin números deciden solo por el parecido del texto", () => {
    expect(direccionesCoinciden("Barrio El Resuello", "barrio el resuello")).toBe(true);
    expect(direccionesCoinciden("Barrio El Resuello", "Barrio Los Aromos")).toBe(false);
  });

  it("si una tiene número y la otra no, no alcanza", () => {
    // Falta justamente el dato que identifica la propiedad.
    expect(direccionesCoinciden("Espinosa 3166", "Espinosa")).toBe(false);
  });
});

describe("actividadCoincideConDireccion", () => {
  it("mira la referencia en texto", () => {
    const actividad = { propiedad_ref: "ESPINOSA 3166 - CABA", metadata: {} };
    expect(actividadCoincideConDireccion(actividad, "Espinosa 3166")).toBe(true);
  });

  it("también mira la propiedad en colaboración", () => {
    // El caso de Eric Zambrana: la propiedad no era de la cartera, así que la
    // dirección quedó escrita en el campo de colaboración.
    const actividad = {
      propiedad_ref: null,
      metadata: { propiedad_colaboracion: "SAN LUIS 3057" },
    };
    expect(actividadCoincideConDireccion(actividad, "san luis 3057")).toBe(true);
  });

  it("una actividad sin ninguna dirección escrita no coincide", () => {
    expect(actividadCoincideConDireccion({ propiedad_ref: null, metadata: null }, "Espinosa 3166")).toBe(false);
    expect(actividadCoincideConDireccion({}, "Espinosa 3166")).toBe(false);
  });

  it("ignora un campo de colaboración que no sea texto", () => {
    const actividad = { propiedad_ref: null, metadata: { propiedad_colaboracion: 42 } };
    expect(actividadCoincideConDireccion(actividad, "Espinosa 3166")).toBe(false);
  });
});
