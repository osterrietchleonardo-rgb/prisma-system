import { describe, it, expect } from "vitest";
import {
  logoParaDestino,
  logosCargados,
  urlDelLogo,
  varianteDeDestino,
  varianteValida,
} from "./logo-variante";

const LOS_DOS = {
  logo_url: "https://cdn/estandar.png",
  logo_url_lujo: "https://cdn/lujo.png",
};

describe("varianteValida", () => {
  it("solo 'lujo' es lujo; cualquier otra cosa cae en estandar", () => {
    expect(varianteValida("lujo")).toBe("lujo");
    expect(varianteValida("estandar")).toBe("estandar");
    expect(varianteValida("LUJO")).toBe("estandar");
    expect(varianteValida(undefined)).toBe("estandar");
    expect(varianteValida(null)).toBe("estandar");
    expect(varianteValida(7)).toBe("estandar");
  });
});

describe("logosCargados", () => {
  it("dice cuales hay, y un string vacio no cuenta como cargado", () => {
    expect(logosCargados(LOS_DOS)).toEqual({ estandar: true, lujo: true });
    expect(logosCargados({ logo_url: "https://cdn/e.png" })).toEqual({ estandar: true, lujo: false });
    expect(logosCargados({ logo_url: "", logo_url_lujo: "   " })).toEqual({ estandar: false, lujo: false });
    expect(logosCargados(null)).toEqual({ estandar: false, lujo: false });
  });
});

describe("urlDelLogo", () => {
  it("devuelve el logo de la variante pedida", () => {
    expect(urlDelLogo(LOS_DOS, "estandar")).toBe("https://cdn/estandar.png");
    expect(urlDelLogo(LOS_DOS, "lujo")).toBe("https://cdn/lujo.png");
  });

  it("si pidieron lujo y no hay logo de lujo, sale el estandar", () => {
    expect(urlDelLogo({ logo_url: "https://cdn/estandar.png" }, "lujo")).toBe("https://cdn/estandar.png");
  });

  it("si la agencia cargo SOLO el de lujo, tambien sale ese cuando piden el estandar", () => {
    // Si no, la agencia que subio un unico logo en la ranura equivocada se queda sin marca
    // en todas sus piezas, que es peor que salir con el otro.
    expect(urlDelLogo({ logo_url_lujo: "https://cdn/lujo.png" }, "estandar")).toBe("https://cdn/lujo.png");
  });

  it("sin ningun logo cargado devuelve null, y ahi decide quien llama", () => {
    expect(urlDelLogo({}, "lujo")).toBeNull();
    expect(urlDelLogo(null, "estandar")).toBeNull();
  });

  it("una variante inventada no rompe: sale el estandar", () => {
    expect(urlDelLogo(LOS_DOS, "premium")).toBe("https://cdn/estandar.png");
    expect(urlDelLogo(LOS_DOS, undefined)).toBe("https://cdn/estandar.png");
  });
});

describe("varianteDeDestino", () => {
  it("sin nada guardado, las dos fichas salen con el estandar", () => {
    expect(varianteDeDestino({}, "ficha_acm")).toBe("estandar");
    expect(varianteDeDestino(null, "ficha_cliente")).toBe("estandar");
  });

  it("cada ficha guarda su propia eleccion", () => {
    const config = { ...LOS_DOS, logo_destinos: { ficha_acm: "lujo", ficha_cliente: "estandar" } };
    expect(varianteDeDestino(config, "ficha_acm")).toBe("lujo");
    expect(varianteDeDestino(config, "ficha_cliente")).toBe("estandar");
  });

  it("una ficha no puede quedar con las dos variantes a la vez", () => {
    // El dato guarda UNA variante por destino, asi que el estado invalido no se puede escribir.
    const config = { ...LOS_DOS, logo_destinos: { ficha_acm: "lujo" } };
    const elegida = varianteDeDestino(config, "ficha_acm");
    expect(elegida).toBe("lujo");
    expect(urlDelLogo(config, elegida)).toBe("https://cdn/lujo.png");
  });
});

describe("logoParaDestino", () => {
  it("resuelve destino -> variante -> URL", () => {
    const config = { ...LOS_DOS, logo_destinos: { ficha_acm: "lujo" } };
    expect(logoParaDestino(config, "ficha_acm")).toBe("https://cdn/lujo.png");
    expect(logoParaDestino(config, "ficha_cliente")).toBe("https://cdn/estandar.png");
  });

  it("si el director asigno lujo y despues borro ese logo, la ficha sale con el estandar", () => {
    const config = { logo_url: "https://cdn/estandar.png", logo_destinos: { ficha_acm: "lujo" } };
    expect(logoParaDestino(config, "ficha_acm")).toBe("https://cdn/estandar.png");
  });

  it("agencia sin ningun logo: la ficha sale sin logo, como antes de esta funcion", () => {
    expect(logoParaDestino({}, "ficha_cliente")).toBeNull();
  });

  it("con un solo logo cargado, las dos fichas salen con ese", () => {
    const soloLujo = { logo_url_lujo: "https://cdn/lujo.png" };
    expect(logoParaDestino(soloLujo, "ficha_acm")).toBe("https://cdn/lujo.png");
    expect(logoParaDestino(soloLujo, "ficha_cliente")).toBe("https://cdn/lujo.png");
  });
});
