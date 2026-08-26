import { describe, it, expect } from "vitest";
import { normalizarFotoRoomix, normalizarImagenes, urlFotoRed, urlsFotoRed } from "./fotos-url";

// El caso real que motivó el arreglo: la propiedad 2a998e59 ("Excelente departamento 3
// ambientes EN DUPLEX", La Cle Estudio Inmobiliario) tenía sus 6 fotos en `.webp` y las 6
// daban 404 en cdn.roomix.ai. El mismo archivo en `.jpg` devuelve 200 (verificado 21-ago-2026).
const ROTA = "https://cdn.roomix.ai/1/17337018/57885550/2019600402_exterior.webp";
const SANA = "https://cdn.roomix.ai/1/17337018/57885550/2019600402_exterior.jpg";

describe("normalizarFotoRoomix", () => {
  it("pide el .jpg en vez del .webp que el CDN de roomix no tiene", () => {
    expect(normalizarFotoRoomix(ROTA)).toBe(SANA);
  });

  it("no toca las fotos que ya vienen en .jpg", () => {
    expect(normalizarFotoRoomix(SANA)).toBe(SANA);
  });

  it("solo toca el CDN de roomix: una foto de Tokko o del Storage sale igual", () => {
    const tokko = "https://static.tokkobroker.com/pics/123_frente.webp";
    const storage = "https://abc.supabase.co/storage/v1/object/public/props/frente.webp";
    expect(normalizarFotoRoomix(tokko)).toBe(tokko);
    expect(normalizarFotoRoomix(storage)).toBe(storage);
  });

  it("no confunde un host que solo TERMINA parecido a roomix", () => {
    const impostor = "https://cdn.roomix.ai.evil.com/1/2/3/foto.webp";
    expect(normalizarFotoRoomix(impostor)).toBe(impostor);
  });

  it("respeta la query: cambia la extensión, no lo que viene después del ?", () => {
    expect(normalizarFotoRoomix(`${ROTA}?v=2`)).toBe(`${SANA}?v=2`);
  });

  it("una URL inválida sale tal cual, sin romper la lista entera", () => {
    expect(normalizarFotoRoomix("no-es-una-url.webp")).toBe("no-es-una-url.webp");
  });
});

describe("normalizarImagenes", () => {
  it("arregla las fotos de roomix de toda la galería, no solo la primera", () => {
    const galeria = [
      "https://cdn.roomix.ai/1/1/1/a_exterior.webp",
      { url: "https://cdn.roomix.ai/1/1/1/b_bathroom.webp" },
      "https://static.tokkobroker.com/pics/c.webp",
    ];
    expect(normalizarImagenes(galeria)).toEqual([
      "https://cdn.roomix.ai/1/1/1/a_exterior.jpg",
      "https://cdn.roomix.ai/1/1/1/b_bathroom.jpg",
      "https://static.tokkobroker.com/pics/c.webp",
    ]);
  });

  it("sigue filtrando la basura del campo images", () => {
    expect(normalizarImagenes([null, "", { url: null }, 42, "https://cdn.roomix.ai/1/1/1/d.webp"])).toEqual([
      "https://cdn.roomix.ai/1/1/1/d.jpg",
    ]);
  });
});

// El proxy propio (26-ago-2026): el navegador no le pide más ninguna foto al CDN de roomix.
// Lo que se prueba acá es la parte pura — armar la URL. La descarga y el cacheo viven en
// `app/api/foto-red/route.ts`.
describe("urlFotoRed", () => {
  it("manda la foto de la red por nuestro proxy", () => {
    expect(urlFotoRed(SANA)).toBe(`/api/foto-red?u=${encodeURIComponent(SANA)}`);
  });

  it("pide el .jpg, no el .webp roto, para no llenar el caché de 404", () => {
    expect(urlFotoRed(ROTA)).toBe(`/api/foto-red?u=${encodeURIComponent(SANA)}`);
  });

  it("no toca la cartera propia: Tokko y Storage siguen saliendo directo", () => {
    const tokko = "https://static.tokkobroker.com/pics/123_frente.webp";
    const storage = "https://abc.supabase.co/storage/v1/object/public/props/frente.webp";
    expect(urlFotoRed(tokko)).toBe(tokko);
    expect(urlFotoRed(storage)).toBe(storage);
  });

  it("no cae con un host que solo TERMINA parecido a roomix", () => {
    const impostor = "https://cdn.roomix.ai.evil.com/1/2/3/foto.webp";
    expect(urlFotoRed(impostor)).toBe(impostor);
  });

  it("no toca http: solo se proxean URLs https", () => {
    const inseguro = "http://cdn.roomix.ai/1/2/3/foto.jpg";
    expect(urlFotoRed(inseguro)).toBe(inseguro);
  });

  it("una URL basura sale igual, sin romper", () => {
    expect(urlFotoRed("no soy una url")).toBe("no soy una url");
  });

  it("es idempotente: aplicarla dos veces no anida proxies", () => {
    expect(urlFotoRed(urlFotoRed(SANA))).toBe(`/api/foto-red?u=${encodeURIComponent(SANA)}`);
  });

  it("urlsFotoRed convierte solo las de la red y deja el resto", () => {
    expect(urlsFotoRed([SANA, "https://static.tokkobroker.com/pics/c.jpg"])).toEqual([
      `/api/foto-red?u=${encodeURIComponent(SANA)}`,
      "https://static.tokkobroker.com/pics/c.jpg",
    ]);
  });
});
