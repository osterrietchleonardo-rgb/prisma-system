import { describe, expect, it } from "vitest";
import { amenityLabels, amenityTokens } from "./subject";
import { tokkoTagsToAmenidades } from "./tokko";

// Laundry (pedido de una asesora, 16-sep). "Laundry" es el servicio del edificio; "Laundry room"
// es como Tokko traduce el lavadero de la unidad, y "Lavadero" en la red también es la unidad.
// Medido en producción el 16-sep: de 30.173 avisos con alguno de los dos, solo 3.623 traen ambos.
// La expresión se evalúa en Postgres con ~* (la búsqueda) y en JavaScript (sumar por link):
// estas pruebas usan la misma cadena que viaja a la base.
describe("laundry", () => {
  const patron = () => new RegExp(amenityTokens({ laundry: true } as any)[0], "i");

  it("es una amenidad que el sujeto puede pedir, con su nombre", () => {
    expect(amenityTokens({ laundry: true } as any)).toHaveLength(1);
    expect(amenityLabels({ laundry: true } as any)).toEqual(["Laundry"]);
  });

  it("encuentra el laundry del edificio, en la red y en Tokko", () => {
    expect(patron().test("SUM Laundry Pileta")).toBe(true);
    expect(patron().test("Public Laundry")).toBe(true);
  });

  it("NO confunde el lavadero de la unidad", () => {
    expect(patron().test("Laundry room")).toBe(false);
    expect(patron().test("Lavadero")).toBe(false);
  });

  it("Tokko: 'Laundry' y 'Public Laundry' sí, 'Laundry room' no", () => {
    expect(tokkoTagsToAmenidades(["Laundry"]).laundry).toBe(true);
    expect(tokkoTagsToAmenidades(["Public Laundry"]).laundry).toBe(true);
    expect(tokkoTagsToAmenidades(["Laundry room"]).laundry).toBe(false);
  });

  it("un sujeto guardado antes de que existiera (sin la clave) no la pide", () => {
    expect(amenityTokens({ pileta: true } as any).some((t) => /laundry/.test(t))).toBe(false);
  });
});
