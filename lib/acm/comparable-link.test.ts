import { beforeEach, describe, expect, it, vi } from "vitest";

// El extractor lee portales de verdad: acá se lo reemplaza por lo que devolvería.
const extractor = vi.hoisted(() => ({ resultado: null as any, llamadas: [] as any[] }));
vi.mock("@/lib/acm/extract", () => ({
  extractFromUrl: async (url: string, opts: any) => {
    extractor.llamadas.push({ url, opts });
    return extractor.resultado;
  },
}));
vi.mock("@/lib/gemini", () => ({ prismaIA: {}, generateEmbedding: async () => [] }));

import { comparableDesdeLink, hashCorto, normBarrio, zonaScore } from "./comparable-link";

/** Base falsa: `acm_barrio_relacion` y `mercado_avisos` con las filas que se le den. */
function baseFalsa(tablas: { relaciones?: any[]; avisos?: any[] }) {
  return {
    from(tabla: string) {
      const filtros: Record<string, any> = {};
      const q: any = {
        select: () => q,
        eq: (col: string, val: any) => ((filtros[col] = val), q),
        limit: () => q,
        then: (resolve: any) => {
          if (tabla === "acm_barrio_relacion") {
            return resolve({ data: (tablas.relaciones || []).filter((r) => r.barrio === filtros.barrio), error: null });
          }
          if (tabla === "mercado_avisos") {
            return resolve({ data: (tablas.avisos || []).filter((a) => a.id === filtros.id), error: null });
          }
          return resolve({ data: [], error: null });
        },
      };
      return q;
    },
  } as any;
}

const RELACIONES = [
  { barrio: "belgrano", relacionado: "belgrano r", zona_score: 70 },
  { barrio: "belgrano", relacionado: "nunez", zona_score: 50 },
];

describe("normBarrio", () => {
  it("normaliza igual que acm_norm: minúsculas y sin tildes", () => {
    expect(normBarrio("  Núñez ")).toBe("nunez");
    expect(normBarrio("VILLA ORTÚZAR")).toBe("villa ortuzar");
  });
});

describe("hashCorto", () => {
  it("el mismo aviso con distinto seguimiento en el link da el mismo id", () => {
    const a = "https://departamento.mercadolibre.com.ar/MLA-3558606264-venta-_JM#polycard_client=search&position=2";
    const b = "https://departamento.mercadolibre.com.ar/MLA-3558606264-venta-_JM";
    expect(hashCorto(a)).toBe(hashCorto(b));
    expect(hashCorto(b)).not.toBe(hashCorto("https://departamento.mercadolibre.com.ar/MLA-1-otro-_JM"));
  });
});

describe("zonaScore", () => {
  const admin = baseFalsa({ relaciones: RELACIONES });

  it("con el barrio en la tabla: 100 mismo barrio, 70 sub-barrio, 50 lindero, 0 otro", async () => {
    expect(await zonaScore(admin, "Belgrano", ["Belgrano"])).toBe(100);
    expect(await zonaScore(admin, "Belgrano", ["Palermo", "Belgrano R"])).toBe(70);
    expect(await zonaScore(admin, "Belgrano", ["Núñez"])).toBe(50);
    expect(await zonaScore(admin, "Belgrano", ["Palermo"])).toBe(0);
  });

  it("fuera de la tabla: el mismo lugar no puntúa (como la búsqueda) y otro lugar pesa 0", async () => {
    expect(await zonaScore(admin, "Luján", ["Luján"])).toBeNull();
    expect(await zonaScore(admin, "Luján", ["Mendoza"])).toBe(0);
  });

  it("un country que el portal publica con el nombre de la ciudad: si el título lo nombra, es el mismo lugar", async () => {
    // Caso real (queja del 18-sep): Zonaprop pone "San Carlos de Bariloche" como barrio de una
    // casa en Arelauquen. El título lo dice; el barrio no.
    const arelauquen = "Arelauquen Golf & Country Club";
    expect(await zonaScore(admin, arelauquen, ["San Carlos de Bariloche"], "Casa en Arelauquen")).toBeNull();
    // El link del portal también cuenta (el título de uno de sus avisos era solo "Lenga").
    expect(await zonaScore(admin, arelauquen, ["San Carlos de Bariloche"], "https://www.zonaprop.com.ar/propiedades/clasificado/veclcain-casa-venta-arelauquen-54246180.html")).toBeNull();
    // Lo genérico del nombre ("golf", "country", "club") no alcanza para decir que es el mismo.
    expect(await zonaScore(admin, arelauquen, ["San Carlos de Bariloche"], "Casa en Cumelen Country Club")).toBe(0);
    // Y sin texto que lo nombre, sigue siendo otro lugar.
    expect(await zonaScore(admin, arelauquen, ["San Carlos de Bariloche"])).toBe(0);
  });

  it("si el aviso no dice el barrio (solo la ciudad), la zona no se compara: no es 'otro barrio'", async () => {
    expect(await zonaScore(admin, "Belgrano", ["CABA, Argentina"])).toBeNull();
    expect(await zonaScore(admin, "Belgrano", ["Capital Federal", ""])).toBeNull();
    expect(await zonaScore(admin, "Luján", ["Buenos Aires"])).toBeNull();
    // Con un barrio real al lado, cuenta el barrio.
    expect(await zonaScore(admin, "Belgrano", ["Capital Federal", "Núñez"])).toBe(50);
  });

  it("sin barrio en la propiedad no se compara la zona", async () => {
    expect(await zonaScore(admin, "", ["Belgrano"])).toBeNull();
  });
});

const SUJETO = {
  tipo_propiedad: "departamento" as const,
  barrio: "Belgrano",
  m2_cubiertos: 50,
  dormitorios: 1,
  banos: 1,
  antiguedad_anios: 20,
  amenidades: {
    cochera_cubierta: false, cochera_descubierta: false, baulera: false, pileta: false, gimnasio: false,
    sum: false, seguridad_24hs: false, jardin_privado: false, terraza_privada: false, laundry: true,
  },
};

const AVISO_RED = {
  id: 58056724, estado: "activo", calidad: "ok", operacion: "venta", tipo: "Departamento",
  titulo: "Venta dos ambientes", descripcion: "Luminoso", direccion: "Conesa 1500", barrio: "Belgrano", sub_barrio: null,
  ciudad: "Capital Federal", precio: 100000, moneda: "USD", superficie_total_m2: "55.00", superficie_cubierta_m2: "50.00",
  ambientes: 2, dormitorios: 1, banos: 1, cocheras: 0, antiguedad_anios: 20, piso: 3, orientacion: null, disposicion: null,
  en_construccion: false, amenities: ["Laundry", "SUM"],
  fotos: ["https://imgar.zonapropcdn.com/avisos/1/00/58/05/67/24/720x532/1.jpg"],
  url_publica: "https://www.zonaprop.com.ar/propiedades/clasificado/x-58056724.html", publicador_nombre: "DE BLAS",
  publicado_desde: null, dias_publicado: 10, variacion_precio_pct: null, expensas: null, expensas_moneda: null,
  es_dueno_directo: false, apto_credito: false,
};

describe("comparableDesdeLink", () => {
  beforeEach(() => {
    extractor.resultado = null;
    extractor.llamadas = [];
  });

  it("un aviso de Zonaprop que está en la red entra como comparable de la red, con su %, sin leer el portal", async () => {
    const admin = baseFalsa({ relaciones: RELACIONES, avisos: [AVISO_RED] });
    const r = await comparableDesdeLink({
      admin, url: "https://www.zonaprop.com.ar/propiedades/clasificado/x-58056724.html?foo=1",
      sujeto: SUJETO, operacion: "venta", pesoSemantica: 10,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.comparable.id).toBe("roomix_58056724");
    expect(r.comparable.source).toBe("roomix");
    expect(r.comparable.agregado_por_link).toBe(true);
    expect(r.comparable.link_datos).toBeUndefined();
    expect(r.comparable.m2).toBe(50); // "50.00" de la base, como número
    expect(r.comparable.antiguedad).toBe(20);
    expect(r.comparable.match_pct).toBe(100);
    expect(r.comparable.imagen).toMatch(/^\/api\/foto-red\?u=/);
    expect(extractor.llamadas).toHaveLength(0);
  });

  it("un aviso de la red que ya no está publicado entra con sus datos guardados y un aviso", async () => {
    const admin = baseFalsa({ relaciones: RELACIONES, avisos: [{ ...AVISO_RED, estado: "caido" }] });
    const r = await comparableDesdeLink({
      admin, url: "https://www.zonaprop.com.ar/propiedades/clasificado/x-58056724.html",
      sujeto: SUJETO, operacion: "venta", pesoSemantica: 10,
    });
    expect(r.ok && r.comparable.source).toBe("link");
    expect(r.ok && r.comparable.link_datos?.fotos).toHaveLength(1);
    expect(r.ok && r.aviso).toMatch(/ya no está publicado/);
  });

  it("un aviso de otro portal se lee con el extractor, pidiendo las fotos, y marca lo que no coincide", async () => {
    extractor.resultado = {
      ok: true, precio: 90000, moneda: "USD", operacion: "alquiler", expensas: null, responsable: "Inmo X",
      fecha_publicacion: null,
      sujeto: { tipo_propiedad: "casa", barrio: "Palermo", direccion: "Gorriti 4000", m2_cubiertos: 50, dormitorios: 1, banos: 1, antiguedad_anios: 0 },
      fotos: ["https://www.argenprop.com/static-content/77823402/a.jpg"],
      descripcion: "Casa reciclada",
    };
    const admin = baseFalsa({ relaciones: RELACIONES });
    const url = "https://www.argenprop.com/casa-en-venta-en-palermo--20432877";
    const r = await comparableDesdeLink({ admin, url, sujeto: SUJETO, operacion: "venta", pesoSemantica: 10 });
    expect(extractor.llamadas).toEqual([{ url, opts: { conFotos: true } }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.comparable.source).toBe("link");
    expect(r.comparable.link_datos).toEqual({ fotos: ["https://www.argenprop.com/static-content/77823402/a.jpg"], amenities: [], descripcion: "Casa reciclada" });
    // El 0 de antigüedad del extractor es ambiguo ("a estrenar" o "no lo dice"): no se inventa.
    expect(r.comparable.antiguedad).toBeNull();
    expect(r.comparable.checklist.find((i) => i.dimension === "zona")?.score).toBe(0);
    expect(r.comparable.checklist.find((i) => i.dimension === "tipo")?.estado).toBe("distinto");
    expect(r.comparable.checklist.find((i) => i.dimension === "operacion")?.estado).toBe("distinto");
  });

  it("si el portal no dejó leer nada, no suma un comparable vacío", async () => {
    extractor.resultado = { ok: false, precio: null, sujeto: {}, fotos: [] };
    const admin = baseFalsa({ relaciones: RELACIONES });
    const r = await comparableDesdeLink({
      admin, url: "https://www.argenprop.com/x--1234567", sujeto: SUJETO, operacion: "venta", pesoSemantica: 10,
    });
    expect(r.ok).toBe(false);
  });
});
