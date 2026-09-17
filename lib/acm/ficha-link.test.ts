import { describe, expect, it } from "vitest";
import { datosDeLink } from "./ficha";

// Un comparable sumado por link y fuera de la red trae sus fotos DENTRO del pedido, que pasó por
// el navegador. Lo que se prueba: que a la ficha pública del cliente solo lleguen fotos de los
// portales conocidos, por nuestro proxy, y textos acotados.
describe("datosDeLink", () => {
  it("deja pasar las fotos de los portales y las manda por el proxy", () => {
    const r = datosDeLink(
      {
        fotos: [
          "https://www.argenprop.com/static-content/77823402/a.jpg",
          "https://http2.mlstatic.com/D_NQ_NP_2X_1-MLA1_1-F.webp",
          "https://imgar.zonapropcdn.com/avisos/1/00/58/05/67/24/1200x1200/1.jpg",
        ],
      },
      16,
    );
    expect(r.images).toHaveLength(3);
    for (const u of r.images) expect(u).toMatch(/^\/api\/foto-red\?u=https%3A%2F%2F/);
  });

  it("descarta una foto de cualquier otro lado, o que no sea https", () => {
    const r = datosDeLink(
      { fotos: ["https://evil.com/x.jpg", "http://www.argenprop.com/static-content/1/a.jpg", "javascript:alert(1)", 42] },
      16,
    );
    expect(r.images).toEqual([]);
  });

  it("respeta el tope de fotos", () => {
    const fotos = Array.from({ length: 30 }, (_, i) => `https://www.argenprop.com/static-content/1/${i}.jpg`);
    expect(datosDeLink({ fotos }, 16).images).toHaveLength(16);
  });

  it("acota características y descripción, y descarta lo que no es texto", () => {
    const r = datosDeLink(
      { amenities: ["Laundry", "", 7, "x".repeat(200), ...Array.from({ length: 40 }, () => "SUM")], descripcion: "y".repeat(9000) },
      16,
    );
    expect(r.amenities[0]).toBe("Laundry");
    expect(r.amenities[1]).toHaveLength(60);
    expect(r.amenities).toHaveLength(30);
    expect(r.descripcion).toHaveLength(4000);
  });

  it("sin datos devuelve todo vacío", () => {
    expect(datosDeLink(undefined, 16)).toEqual({ images: [], amenities: [], descripcion: "" });
    expect(datosDeLink({ descripcion: { html: "<b>" } }, 16).descripcion).toBe("");
  });
});
