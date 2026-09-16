import { describe, expect, it } from "vitest";
import { fotosDelAviso, idArgenprop, idZonaprop, MAX_FOTOS_AVISO } from "./fotos-aviso";

// Los fragmentos imitan lo que se vio en páginas reales el 16-sep-2026 (Zonaprop 58056724,
// Argenprop 20432877, MercadoLibre MLA-3558606264): la foto propia y, al lado, fotos ajenas.

describe("fotosDelAviso · Zonaprop", () => {
  const url = "https://www.zonaprop.com.ar/propiedades/clasificado/veclapin-venta-dos-ambientes-chacarita-58056724.html";
  const html = `
    <img src="https://imgar.zonapropcdn.com/avisos/1/00/58/05/67/24/720x532/2024213187.jpg?isFirstImage=true">
    <img src="https://imgar.zonapropcdn.com/avisos/resize/1/00/58/05/67/24/1200x1200/2024213187.jpg?isFirstImage=true">
    <img src="https://imgar.zonapropcdn.com/avisos/1/00/58/05/67/24/360x266/2024213184.jpg">
    <img src="https://imgar.zonapropcdn.com/avisos/1/00/59/63/47/02/360x266/2065983405.jpg">`;

  it("lee el número del aviso", () => {
    expect(idZonaprop(url)).toBe("58056724");
    expect(idZonaprop(url + "?utm=x")).toBe("58056724");
  });

  it("devuelve las fotos del aviso en 1200x1200, sin repetir, y deja afuera las de otro aviso", () => {
    expect(fotosDelAviso(url, html)).toEqual([
      "https://imgar.zonapropcdn.com/avisos/1/00/58/05/67/24/1200x1200/2024213187.jpg",
      "https://imgar.zonapropcdn.com/avisos/1/00/58/05/67/24/1200x1200/2024213184.jpg",
    ]);
  });
});

describe("fotosDelAviso · Argenprop", () => {
  const url = "https://www.argenprop.com/departamento-en-venta-en-palermo-chico-4-ambientes--20432877";
  const html = `
    <meta property="og:image" content="https://www.argenprop.com/static-content/77823402/6ab8ed03-7032-468f-8415-1e65f5b8a7de_u_medium.jpg">
    <img src="https://www.argenprop.com/static-content/77823402/6ab8ed03-7032-468f-8415-1e65f5b8a7de.jpg">
    <img src="https://www.argenprop.com/static-content/77823402/6d3669c1-d462-470b-838e-46a1dee6cc66.jpg">
    <img src="https://www.argenprop.com/static-content/17464801/172880d6-8768-46f2-a127-78d9cf97275a.jpg">
    <img src="https://www.argenprop.com/static-content/452241_a/5b0a0314-42e8-4499-8207-dc57ddca0b02_small.jpg">`;

  it("lee el número del aviso", () => {
    expect(idArgenprop(url)).toBe("20432877");
  });

  it("toma solo la carpeta del aviso (su número al revés) y saca el sufijo de tamaño", () => {
    expect(fotosDelAviso(url, html)).toEqual([
      "https://www.argenprop.com/static-content/77823402/6ab8ed03-7032-468f-8415-1e65f5b8a7de.jpg",
      "https://www.argenprop.com/static-content/77823402/6d3669c1-d462-470b-838e-46a1dee6cc66.jpg",
    ]);
  });
});

describe("fotosDelAviso · MercadoLibre", () => {
  const url = "https://departamento.mercadolibre.com.ar/MLA-3558606264-venta-departamentos-3-y-4-ambientes-en-palermo-_JM";
  const galeria = `
    <div class="ui-pdp-gallery__column">
      <img src="https://http2.mlstatic.com/D_Q_NP_926823-MLA114123645021_072026-R.webp">
      <img data-zoom="https://http2.mlstatic.com/D_NQ_NP_2X_926823-MLA114123645021_072026-F.webp">
      <img src="https://http2.mlstatic.com/D_Q_NP_731398-MLA114123645023_072026-R.webp">
    </div>`;
  const unidades = `
    <div class="ui-pdp-container__col"></div>
    <div class="ui-vip-available-units__container">
      <img src="https://http2.mlstatic.com/D_Q_NP_607017-MLA114123645033_072026-R.webp">
    </div>`;
  const recomendado = `<link rel="preload" href="https://http2.mlstatic.com/D_NQ_NP_111111-MLA999999999999_012026-F.webp">`;

  it("toma solo las fotos de la galería, no las de las otras unidades del edificio", () => {
    expect(fotosDelAviso(url, recomendado + galeria + unidades)).toEqual([
      "https://http2.mlstatic.com/D_NQ_NP_2X_926823-MLA114123645021_072026-F.webp",
      "https://http2.mlstatic.com/D_NQ_NP_2X_731398-MLA114123645023_072026-F.webp",
    ]);
  });

  it("sin galería, o sin dónde termina, no devuelve nada", () => {
    expect(fotosDelAviso(url, recomendado)).toEqual([]);
    expect(fotosDelAviso(url, galeria)).toEqual([]);
  });
});

describe("fotosDelAviso · casos generales", () => {
  it("un portal que no conoce no devuelve fotos", () => {
    expect(fotosDelAviso("https://www.properati.com.ar/detalle/abc", '<img src="https://img.properati.com/x.jpg">')).toEqual([]);
  });

  it("sin HTML no devuelve fotos", () => {
    expect(fotosDelAviso("https://www.zonaprop.com.ar/x-58056724.html", "")).toEqual([]);
    expect(fotosDelAviso("https://www.zonaprop.com.ar/x-58056724.html", null)).toEqual([]);
  });

  it(`corta en ${MAX_FOTOS_AVISO} fotos`, () => {
    const url = "https://www.zonaprop.com.ar/propiedades/clasificado/x-58056724.html";
    const html = Array.from({ length: 30 }, (_, i) =>
      `https://imgar.zonapropcdn.com/avisos/1/00/58/05/67/24/360x266/${1000 + i}.jpg`).join(" ");
    expect(fotosDelAviso(url, html)).toHaveLength(MAX_FOTOS_AVISO);
  });
});
