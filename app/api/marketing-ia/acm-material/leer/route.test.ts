import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * RELEER EL MATERIAL, Y LAS TRES REGLAS QUE NO SE PUEDEN ROMPER.
 *
 * 1. Solo el director. La solapa escondida es comodidad; la defensa es este 403.
 * 2. Solo se leen archivos de la propia agencia: la lista de rutas llega del navegador, así
 *    que sin el filtro un director podría hacer que PRISMA le lea el material a otra.
 * 3. No se cobra un crédito si no había nada que leer.
 *
 * Los testigos son de CONDUCTA: qué se bajó del storage y si se consumió un crédito.
 */

const AGENCIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTRA_AGENCIA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const sesion = { agencyId: AGENCIA, userId: "u1", role: "director" as string | null };
const creditos = { consumidos: 0 };
const storage = { bajados: [] as string[], vacios: [] as string[] };
const ia = { llamadas: [] as string[], respuesta: '{"quienes_somos":"Somos Central."}' };

vi.mock("@/lib/auth/tenant-validation", () => ({
  requireTenant: async () => sesion,
  consumeAiCredits: async () => {
    creditos.consumidos += 1;
    return "tx-1";
  },
  updateAiTransactionCost: () => {},
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: {
      from: () => ({
        download: async (path: string) => {
          storage.bajados.push(path);
          return { data: { arrayBuffer: async () => new ArrayBuffer(8) }, error: null };
        },
      }),
    },
  }),
}));

// Lo que devuelva la extracción: por defecto texto, salvo que el path esté en `vacios`.
vi.mock("@/lib/acm/material-extraer", async (original) => ({
  ...(await original<typeof import("@/lib/acm/material-extraer")>()),
  extraerTexto: async () => (storage.vacios.length > 0 ? "" : "texto del carpeton"),
}));

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return {
        generateContent: async (prompt: string) => {
          ia.llamadas.push(prompt);
          return { response: { text: () => ia.respuesta, usageMetadata: null } };
        },
      };
    }
  },
}));

const { POST } = await import("./route");

const pedido = (paths: string[]) =>
  new Request("http://localhost/api/marketing-ia/acm-material/leer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths }),
  });

beforeEach(() => {
  sesion.role = "director";
  creditos.consumidos = 0;
  storage.bajados = [];
  storage.vacios = [];
  ia.llamadas = [];
});

describe("solo el director relee", () => {
  it("un asesor recibe 403 y no gasta un credito", async () => {
    sesion.role = "asesor";
    const res = await POST(pedido([`${AGENCIA}/uno.pdf`]));
    expect(res.status).toBe(403);
    expect(creditos.consumidos).toBe(0);
    expect(storage.bajados).toEqual([]);
  });
});

describe("solo lee lo de su propia agencia", () => {
  it("ignora las rutas de otra agencia", async () => {
    await POST(pedido([`${AGENCIA}/propio.pdf`, `${OTRA_AGENCIA}/ajeno.pdf`]));
    expect(storage.bajados).toEqual([`${AGENCIA}/propio.pdf`]);
  });

  it("si TODAS las rutas son ajenas, no baja nada ni gasta credito", async () => {
    const res = await POST(pedido([`${OTRA_AGENCIA}/ajeno.pdf`]));
    expect(res.status).toBe(400);
    expect(storage.bajados).toEqual([]);
    expect(creditos.consumidos).toBe(0);
  });
});

describe("no cobra por nada", () => {
  it("sin archivos no gasta credito", async () => {
    const res = await POST(pedido([]));
    expect(res.status).toBe(400);
    expect(creditos.consumidos).toBe(0);
  });

  it("si los archivos no tienen texto (un escaneo) avisa y no gasta credito", async () => {
    storage.vacios = ["si"];
    const res = await POST(pedido([`${AGENCIA}/escaneado.pdf`]));
    expect(res.status).toBe(400);
    expect(await res.json()).toHaveProperty("error", expect.stringContaining("escaneadas"));
    expect(creditos.consumidos).toBe(0);
    expect(ia.llamadas).toEqual([]);
  });
});

describe("el camino feliz", () => {
  it("lee, cobra UN credito y devuelve las cuatro secciones", async () => {
    const res = await POST(pedido([`${AGENCIA}/uno.pdf`, `${AGENCIA}/dos.pdf`]));
    expect(res.status).toBe(200);
    expect(creditos.consumidos).toBe(1);

    const { secciones } = await res.json();
    expect(secciones.quienes_somos).toBe("Somos Central.");
    // Las que la IA no devolvió vuelven vacías, nunca inventadas.
    expect(secciones.como_preparar).toBe("");
  });

  it("una respuesta ilegible de la IA no rompe: devuelve las cuatro vacias", async () => {
    ia.respuesta = "perdon, no pude";
    const res = await POST(pedido([`${AGENCIA}/uno.pdf`]));
    expect(res.status).toBe(200);

    const { secciones } = await res.json();
    expect(secciones).toEqual({
      quienes_somos: "", como_comercializamos: "", como_preparar: "", roles_venta: "",
    });
    ia.respuesta = '{"quienes_somos":"Somos Central."}';
  });
});
