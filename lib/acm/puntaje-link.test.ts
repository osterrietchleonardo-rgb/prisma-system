import { describe, expect, it } from "vitest";
import { puntuarCandidato, valoresCandidato, type Candidato, type ParamsSujeto } from "./puntaje-link";

const base: Candidato = {
  superficie_cubierta_m2: null, superficie_total_m2: null, ambientes: null, dormitorios: null, banos: null,
  antiguedad_anios: null, en_construccion: false, piso: null, orientacion: null, disposicion: null, cocheras: null, texto: "",
};
const sinNada: ParamsSujeto = {
  m2: null, ambientes: null, dormitorios: null, banos: null, antiguedad: null, amenities: [],
  cochera: false, cocheraPatron: "cocher|garage|garaje|estacionamiento", piso: null, orientacion: null, disposicion: null,
};

describe("puntuarCandidato", () => {
  it("hace la misma cuenta que acm_match_roomix, dimensión por dimensión", () => {
    const s: ParamsSujeto = {
      ...sinNada, m2: 50, ambientes: 2, dormitorios: 1, banos: 1, antiguedad: 20,
      amenities: ["pileta|piscina|pool"], piso: 3, orientacion: "N", disposicion: "frente",
    };
    const c: Candidato = {
      ...base, superficie_cubierta_m2: 45, superficie_total_m2: 50, ambientes: 2, dormitorios: 1, banos: 2,
      antiguedad_anios: 30, piso: 6, orientacion: "NE", disposicion: "contrafrente", cocheras: 0, texto: "Linda PILETA",
    };
    const r = puntuarCandidato(s, c, 70);
    // 14 + 19,8 + 16 + 14 + 6 + 7 + 12 + 0 + 2,5 + 0 = 91,3 sobre 126 de peso → 72,46
    expect(r.match_pct).toBe(72);
    expect(r.sub).toEqual({
      sc_zona: 70, sc_superficie: 90, sc_ambientes: 100, sc_dormitorios: 100, sc_banos: 50, sc_antiguedad: 50,
      sc_amenities: 100, sc_semantica: null, sc_cocheras: null, sc_piso: 0, sc_orientacion: 50, sc_disposicion: 0,
    });
  });

  it("redondea el .5 para arriba, como Postgres (caso real: Villa Devoto, aviso 60116371)", () => {
    // Daba 66 en vez de 67: 79,8 / 120 llega como 66,4999… en coma flotante.
    const s: ParamsSujeto = {
      ...sinNada, m2: 250, ambientes: 4, dormitorios: 3, banos: 3, antiguedad: 50, amenities: ["jard|garden"], cochera: true,
    };
    const c: Candidato = {
      ...base, superficie_cubierta_m2: 275, superficie_total_m2: 365, ambientes: 5, dormitorios: 4, banos: 2,
      antiguedad_anios: 60, cocheras: 3, texto: "casa con jardín",
    };
    expect(puntuarCandidato(s, c, 50).match_pct).toBe(67);
  });

  it("lo que falta en cualquiera de los dos lados no cuenta, y el resto se reparte", () => {
    const r = puntuarCandidato({ ...sinNada, m2: 100, banos: 2 }, { ...base, superficie_total_m2: 100 }, null);
    expect(r.match_pct).toBe(100);
    expect(r.sub.sc_banos).toBeNull();
    expect(r.sub.sc_zona).toBeNull();
  });

  it("un aviso de otro barrio (zona 0) baja el %", () => {
    const s = { ...sinNada, m2: 100 };
    const c = { ...base, superficie_total_m2: 100 };
    expect(puntuarCandidato(s, c, 100).match_pct).toBe(100);
    expect(puntuarCandidato(s, c, 0).match_pct).toBe(52); // 22 / 42
  });

  it("la cochera cuenta por el número o, si viene en 0, por el texto", () => {
    const s = { ...sinNada, cochera: true };
    expect(puntuarCandidato(s, { ...base, cocheras: 1 }, null).sub.sc_cocheras).toBe(100);
    expect(puntuarCandidato(s, { ...base, cocheras: 0, texto: "con Cochera fija" }, null).sub.sc_cocheras).toBe(100);
    expect(puntuarCandidato(s, { ...base, cocheras: 0, texto: "sin nada" }, null).sub.sc_cocheras).toBe(0);
  });

  it("el laundry del edificio cuenta; el laundry room (lavadero de la unidad) no", () => {
    const s = { ...sinNada, amenities: ["laundry(?! ?room)"] };
    expect(puntuarCandidato(s, { ...base, texto: "SUM Laundry Pileta" }, null).sub.sc_amenities).toBe(100);
    expect(puntuarCandidato(s, { ...base, texto: "Laundry room" }, null).sub.sc_amenities).toBe(0);
  });

  it("la orientación se mide en la rosa: N y NO son vecinas", () => {
    const s = { ...sinNada, orientacion: "N" };
    expect(puntuarCandidato(s, { ...base, orientacion: "NO" }, null).sub.sc_orientacion).toBe(50);
    expect(puntuarCandidato(s, { ...base, orientacion: "S" }, null).sub.sc_orientacion).toBe(0);
  });
});

describe("valoresCandidato", () => {
  it("usa la superficie cubierta y cae a la total si no hay", () => {
    expect(valoresCandidato({ ...base, superficie_cubierta_m2: 40, superficie_total_m2: 55 }).m2).toBe(40);
    expect(valoresCandidato({ ...base, superficie_cubierta_m2: 0, superficie_total_m2: 55 }).m2).toBe(55);
  });

  it("sin ambientes, los deduce de los dormitorios", () => {
    expect(valoresCandidato({ ...base, dormitorios: 2 }).ambientes).toBe(3);
  });

  it("en construcción no tiene antigüedad", () => {
    expect(valoresCandidato({ ...base, antiguedad_anios: 0, en_construccion: true }).antiguedad).toBeNull();
    expect(valoresCandidato({ ...base, antiguedad_anios: 0 }).antiguedad).toBe(0);
  });
});
