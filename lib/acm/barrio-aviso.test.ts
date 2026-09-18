import { afterEach, describe, expect, it, vi } from "vitest";
import { elegirBarrio } from "./barrio-aviso";

// Valores tal cual los traen los portales en su JSON-LD (páginas reales, 16-sep-2026):
// addressLocality es la ciudad y addressRegion es el barrio.
const AP_URL = "https://www.argenprop.com/departamento-en-venta-en-palermo-chico-4-ambientes--20432877";
const ZP_URL = "https://www.zonaprop.com.ar/propiedades/clasificado/veclapin-venta-dos-ambientes-chacarita-58056724.html";

describe("elegirBarrio", () => {
  it("Argenprop: la ciudad viene primero y gana el barrio", () => {
    expect(elegirBarrio(["CABA, Argentina", "Palermo Chico"], AP_URL)).toBe("Palermo Chico");
  });

  it("Zonaprop: lo mismo con 'Capital Federal, Argentina, '", () => {
    expect(elegirBarrio(["Capital Federal, Argentina, ", "Chacarita"], ZP_URL)).toBe("Chacarita");
  });

  it("el barrio que confirma el link le gana a otro que diga una sola fuente", () => {
    expect(elegirBarrio(["Belgrano", "Palermo Chico"], AP_URL)).toBe("Palermo Chico");
  });

  it("sin confirmación del link, gana el que repiten más fuentes", () => {
    expect(elegirBarrio(["Núñez", "Belgrano", "Belgrano"], "https://x.com/aviso-123")).toBe("Belgrano");
  });

  it("si nada es un barrio real, queda vacío (no se inventa)", () => {
    expect(elegirBarrio(["CABA, Argentina", "Capital Federal", "Buenos Aires", "", null], AP_URL)).toBe("");
    expect(elegirBarrio(["Ciudad Autónoma de Buenos Aires"], "https://x.com/a")).toBe("");
  });

  it("'Caballito, Capital Federal' se queda con Caballito", () => {
    expect(elegirBarrio(["Caballito, Capital Federal"], "https://x.com/a")).toBe("Caballito");
  });

  it("no rompe con un link mal codificado", () => {
    expect(elegirBarrio(["Chacarita"], "https://x.com/%E0%A4%A")).toBe("Chacarita");
  });
});

// El camino rápido del lector de links (sin navegador), con una página como la de Argenprop.
vi.mock("@/lib/gemini", () => ({
  prismaIA: {
    generateContent: async () => ({
      response: { text: () => JSON.stringify({ tipo_propiedad: "departamento", barrio: "", m2_cubiertos: 125, dormitorios: 3, banos: 3, precio: 395000, moneda: "USD", operacion: "venta" }) },
    }),
  },
}));

// La página no se baja de verdad: se simula lo que devuelve el pedido seguro (url-segura.ts).
const pagina = vi.hoisted(() => ({ html: "" }));
vi.mock("@/lib/acm/url-segura", async (original) => {
  const real: any = await original();
  return {
    ...real,
    validarUrlPublica: async (url: string) => ({ ok: true, url: new URL(url) }),
    obtenerPaginaSegura: async (url: string) => ({ status: 200, html: pagina.html, urlFinal: url }),
  };
});

describe("extractFromUrl · barrio del JSON-LD de Argenprop", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("devuelve 'Palermo Chico', no 'CABA, Argentina'", async () => {
    const ld = {
      "@context": "https://schema.org", "@type": "Apartment", name: "Venta Departamento",
      address: { "@type": "PostalAddress", addressLocality: "CABA, Argentina", addressRegion: "Palermo Chico", streetAddress: "Juan María Gutiérrez 3900" },
      floorSize: { value: 125 }, numberOfBedrooms: 3, numberOfBathroomsTotal: 3,
    };
    const html = `<html><head><title>Venta Departamento | Argenprop</title>
      <script type="application/ld+json">${JSON.stringify(ld)}</script></head>
      <body>${"Departamento luminoso con balcón al frente. ".repeat(20)}</body></html>`;
    pagina.html = html;
    const { extractFromUrl } = await import("./extract");
    const r = await extractFromUrl(AP_URL);
    expect(r.sujeto.barrio).toBe("Palermo Chico");
    expect(r.sujeto.direccion).toBe("Juan María Gutiérrez 3900");
  });
});
