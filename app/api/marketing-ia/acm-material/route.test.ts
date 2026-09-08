import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * GUARDAR EL MATERIAL SIN PISAR LA MARCA DE LA AGENCIA.
 *
 * Es el error más caro de esta función. El endpoint viejo de Marketing IA reemplaza el jsonb
 * ENTERO; si esta pantalla guardara así, mandando nada más que el material, le borraría a la
 * agencia los colores, el logo y el aviso legal de todas sus fichas.
 *
 * El testigo es de CONDUCTA: mira el jsonb que efectivamente quedó escrito, no el 200.
 */

const AGENCIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const sesion = { agencyId: AGENCIA, userId: "u1", role: "director" as string | null };

/** El jsonb como está hoy en la base, con la marca ya configurada. */
const CONFIG_INICIAL = {
  brand_colors: ["#8B5E3C", "#1B1B1B"],
  logo_url: "https://cdn/logo.png",
  brand_font: "serif",
  legal_notice: "El texto legal que puso la agencia.",
  creative_directive: "Fotos cálidas, nada de stock.",
};

const base = { config: {} as Record<string, unknown>, escrituras: [] as Record<string, unknown>[] };

vi.mock("@/lib/auth/tenant-validation", () => ({
  requireTenant: async () => sesion,
}));

const clienteFalso = () => ({
  from: () => ({
    select: () => ({
      eq: () => ({
        single: async () => ({ data: { marketing_ai_config: base.config }, error: null }),
      }),
    }),
    update: (datos: Record<string, unknown>) => {
      base.escrituras.push(datos);
      return { eq: async () => ({ error: null }) };
    },
  }),
});

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => clienteFalso() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => clienteFalso() }));

const { GET, PUT } = await import("./route");

const guardar = (material: unknown) =>
  PUT(new Request("http://localhost/api/marketing-ia/acm-material", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ material }),
  }));

/** El jsonb que quedó escrito en la última llamada. */
const configEscrita = () =>
  base.escrituras.at(-1)?.marketing_ai_config as Record<string, unknown> | undefined;

beforeEach(() => {
  sesion.role = "director";
  base.config = { ...CONFIG_INICIAL };
  base.escrituras = [];
});

describe("guardar el material NO pisa la marca", () => {
  it("los colores, el logo, la tipografía y el aviso legal siguen ahí después de guardar", async () => {
    const res = await guardar({ secciones: { quienes_somos: "Somos Central." } });
    expect(res.status).toBe(200);

    const escrita = configEscrita()!;
    expect(escrita.brand_colors).toEqual(["#8B5E3C", "#1B1B1B"]);
    expect(escrita.logo_url).toBe("https://cdn/logo.png");
    expect(escrita.brand_font).toBe("serif");
    expect(escrita.legal_notice).toBe("El texto legal que puso la agencia.");
    expect(escrita.creative_directive).toBe("Fotos cálidas, nada de stock.");
  });

  it("y sí escribe el material", async () => {
    await guardar({ secciones: { quienes_somos: "Somos Central." } });
    const material = configEscrita()!.acm_material as { secciones: Record<string, string> };
    expect(material.secciones.quienes_somos).toBe("Somos Central.");
  });

  it("guardar material vacío tampoco borra la marca", async () => {
    await guardar({ secciones: {} });
    expect(configEscrita()!.logo_url).toBe("https://cdn/logo.png");
  });

  it("una agencia sin marca configurada no rompe", async () => {
    base.config = {};
    const res = await guardar({ secciones: { quienes_somos: "Hola." } });
    expect(res.status).toBe(200);
    expect(configEscrita()!.acm_material).toBeDefined();
  });
});

describe("lo que se guarda ya viene limpio", () => {
  it("recorta al tope y descarta secciones inventadas", async () => {
    await guardar({
      secciones: { quienes_somos: "a".repeat(9999), inventada: "no va" },
      archivos: [{ id: "1", nombre: "x.pdf", path: `${AGENCIA}/x.pdf`, subido_el: "2026-09-05T10:00:00Z" }],
    });

    const material = configEscrita()!.acm_material as {
      secciones: Record<string, string>; archivos: unknown[];
    };
    expect(material.secciones.quienes_somos).toHaveLength(1200);
    expect(material.secciones).not.toHaveProperty("inventada");
    expect(material.archivos).toHaveLength(1);
  });

  it("con basura en el cuerpo guarda la forma vacía en vez de romper", async () => {
    const res = await guardar("no soy un objeto");
    expect(res.status).toBe(200);
    const material = configEscrita()!.acm_material as { secciones: Record<string, string> };
    expect(material.secciones.quienes_somos).toBe("");
  });
});

describe("solo el director guarda", () => {
  it("un asesor recibe 403 y NO se escribe nada", async () => {
    sesion.role = "asesor";
    const res = await guardar({ secciones: { quienes_somos: "Colado." } });
    expect(res.status).toBe(403);
    expect(base.escrituras).toEqual([]);
  });
});

describe("GET", () => {
  it("devuelve el material y la marca para mostrarla", async () => {
    base.config = { ...CONFIG_INICIAL, acm_material: { secciones: { roles_venta: "El propietario define el precio." } } };

    const res = await GET();
    const { material, marca } = await res.json();

    expect(material.secciones.roles_venta).toBe("El propietario define el precio.");
    expect(marca.colors).toEqual(["#8B5E3C", "#1B1B1B"]);
    expect(marca.logo_url).toBe("https://cdn/logo.png");
    expect(marca.legal_notice).toBe("El texto legal que puso la agencia.");
  });

  it("una agencia sin nada configurado devuelve la forma vacía, no un error", async () => {
    base.config = {};
    const res = await GET();
    const { material, marca } = await res.json();

    expect(material.secciones.quienes_somos).toBe("");
    expect(material.archivos).toEqual([]);
    expect(marca).toEqual({
      colors: [],
      logo_url: null,
      logo_variante: "estandar",
      dos_logos: false,
      legal_notice: "",
    });
  });

  // Esta pantalla dice "así se va a ver tu ficha". Si mostrara el logo estándar mientras la
  // ficha sale con el de lujo, el director configuraría a ciegas creyendo que verificó.
  it("si el director le asignó el logo de lujo a la ficha del ACM, la vista previa muestra ESE", async () => {
    base.config = {
      ...CONFIG_INICIAL,
      logo_url_lujo: "https://cdn/logo-lujo.png",
      logo_destinos: { ficha_acm: "lujo", ficha_cliente: "estandar" },
    };

    const res = await GET();
    const { marca } = await res.json();

    expect(marca.logo_url).toBe("https://cdn/logo-lujo.png");
    expect(marca.logo_variante).toBe("lujo");
    expect(marca.dos_logos).toBe(true);
  });

  it("con un solo logo cargado no dice de qué versión es: no hay nada que distinguir", async () => {
    base.config = { ...CONFIG_INICIAL, logo_destinos: { ficha_acm: "lujo" } };

    const res = await GET();
    const { marca } = await res.json();

    // Pidió lujo, pero esa ranura está vacía: sale el que hay, y sin etiqueta que confunda.
    expect(marca.logo_url).toBe("https://cdn/logo.png");
    expect(marca.dos_logos).toBe(false);
  });
});
