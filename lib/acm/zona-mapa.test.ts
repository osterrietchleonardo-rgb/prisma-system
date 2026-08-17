import { describe, it, expect } from "vitest";
import { CATEGORIAS_ZONA, type FichaZonaPoi } from "./ficha";
import { ANCHO, ALTO, COLOR_ZONA, marcadoresDibujados, categoriasEnElMapa } from "./zona-mapa";

const CENTRO = { lat: -34.5624, lon: -58.4561 }; // Av. Cabildo 2500, Belgrano

function poi(categoria: FichaZonaPoi["categoria"], lat: number | null, lon: number | null): FichaZonaPoi {
  return { categoria, titulo: categoria, detalle: "", metros: null, cantidad: null, lat, lon };
}

describe("marcadores del mapa de la zona", () => {
  it("todas las categorías tienen color: un punto gris sin referencia no le dice nada al cliente", () => {
    for (const c of CATEGORIAS_ZONA) expect(COLOR_ZONA[c], `falta el color de ${c}`).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("un punto pegado a la propiedad cae adentro de la imagen", () => {
    const m = marcadoresDibujados(CENTRO, [poi("subte", CENTRO.lat + 0.001, CENTRO.lon + 0.001)]);
    expect(m).toHaveLength(1);
    expect(m[0].x).toBeGreaterThan(0);
    expect(m[0].x).toBeLessThan(ANCHO);
    expect(m[0].y).toBeGreaterThan(0);
    expect(m[0].y).toBeLessThan(ALTO);
  });

  it("descarta los que no tienen punto propio (los conteos, como las farmacias)", () => {
    expect(marcadoresDibujados(CENTRO, [poi("farmacia", null, null)])).toHaveLength(0);
  });

  it("descarta los que quedaron fuera del recorte", () => {
    // Un hospital a ~5 km: existe y se nombra en la lista, pero no está en el mapa.
    expect(marcadoresDibujados(CENTRO, [poi("hospital", CENTRO.lat + 0.05, CENTRO.lon)])).toHaveLength(0);
  });

  it("sin centro no hay mapa ni referencias", () => {
    expect(marcadoresDibujados(null, [poi("subte", CENTRO.lat, CENTRO.lon)])).toHaveLength(0);
  });

  it("las referencias son exactamente las categorías dibujadas", () => {
    const pois = [
      poi("subte", CENTRO.lat + 0.001, CENTRO.lon),          // entra
      poi("farmacia", null, null),                            // conteo, no entra
      poi("hospital", CENTRO.lat + 0.05, CENTRO.lon),         // lejos, no entra
    ];
    const refs = categoriasEnElMapa({ centro: CENTRO, pois });
    expect([...refs]).toEqual(["subte"]);
  });
});
