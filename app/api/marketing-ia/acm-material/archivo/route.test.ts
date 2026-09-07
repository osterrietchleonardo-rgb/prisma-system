import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * SUBIR Y BORRAR EL MATERIAL DEL ACM, Y LAS DOS REGLAS QUE NO SE PUEDEN ROMPER.
 *
 * 1. Solo el director escribe. En la pantalla la solapa se le esconde al asesor, pero eso
 *    es comodidad: la defensa real es este 403.
 * 2. Una agencia solo borra lo suyo. El `path` llega del navegador, así que sin el chequeo
 *    de prefijo un director podría borrar el material de otra inmobiliaria.
 *
 * Los testigos son de CONDUCTA: miran si el storage se tocó, no el texto del error. Un test
 * que solo mirara el mensaje seguiría en verde con la negativa invertida.
 */

const AGENCIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTRA_AGENCIA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const sesion = { agencyId: AGENCIA, userId: "u1", role: "director" as string | null };

vi.mock("@/lib/auth/tenant-validation", () => ({
  requireTenant: async () => sesion,
}));

/** Lo que el endpoint le pidió al storage. Vacío = no lo tocó. */
const storage = { subidas: [] as string[], borrados: [] as string[][] };

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: {
      from: () => ({
        upload: async (path: string) => {
          storage.subidas.push(path);
          return { error: null };
        },
        remove: async (paths: string[]) => {
          storage.borrados.push(paths);
          return { error: null };
        },
      }),
    },
  }),
}));

const { POST, DELETE } = await import("./route");

const pedidoDeSubida = (nombre: string, bytes = 10) => {
  const form = new FormData();
  form.append("file", new File(["x".repeat(bytes)], nombre, { type: "application/pdf" }));
  return new Request("http://localhost/api/marketing-ia/acm-material/archivo", {
    method: "POST",
    body: form,
  });
};

const pedidoDeBorrado = (path: string) =>
  new Request("http://localhost/api/marketing-ia/acm-material/archivo", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });

beforeEach(() => {
  sesion.role = "director";
  storage.subidas = [];
  storage.borrados = [];
});

describe("solo el director escribe", () => {
  it("un asesor no puede subir, y el archivo NO llega al storage", async () => {
    sesion.role = "asesor";
    const res = await POST(pedidoDeSubida("carpeta.pdf"));
    expect(res.status).toBe(403);
    expect(storage.subidas).toEqual([]);
  });

  it("un asesor no puede borrar, y el storage NO se toca", async () => {
    sesion.role = "asesor";
    const res = await DELETE(pedidoDeBorrado(`${AGENCIA}/algo.pdf`));
    expect(res.status).toBe(403);
    expect(storage.borrados).toEqual([]);
  });

  it("un perfil sin rol tampoco pasa", async () => {
    sesion.role = null;
    const res = await POST(pedidoDeSubida("carpeta.pdf"));
    expect(res.status).toBe(403);
    expect(storage.subidas).toEqual([]);
  });
});

describe("una agencia solo borra lo suyo", () => {
  it("rechaza borrar un archivo de otra agencia", async () => {
    const res = await DELETE(pedidoDeBorrado(`${OTRA_AGENCIA}/robado.pdf`));
    expect(res.status).toBe(400);
    expect(storage.borrados).toEqual([]);
  });

  it("rechaza salirse de su carpeta con una ruta relativa", async () => {
    const res = await DELETE(pedidoDeBorrado("../otra/cosa.pdf"));
    expect(res.status).toBe(400);
    expect(storage.borrados).toEqual([]);
  });

  it("borra el suyo", async () => {
    const res = await DELETE(pedidoDeBorrado(`${AGENCIA}/propio.pdf`));
    expect(res.status).toBe(200);
    expect(storage.borrados).toEqual([[`${AGENCIA}/propio.pdf`]]);
  });
});

describe("qué archivos entran", () => {
  it("guarda el PDF dentro de la carpeta de su agencia y devuelve la ficha del archivo", async () => {
    const res = await POST(pedidoDeSubida("Nueva bienvenida.pdf"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.nombre).toBe("Nueva bienvenida.pdf");
    expect(body.path).toMatch(new RegExp(`^${AGENCIA}/[0-9a-f-]+\\.pdf$`));
    expect(storage.subidas).toEqual([body.path]);
  });

  it("acepta Word", async () => {
    const res = await POST(pedidoDeSubida("plan.docx"));
    expect(res.status).toBe(200);
    expect(storage.subidas).toHaveLength(1);
  });

  it("rechaza un formato que no sabe leer, sin tocar el storage", async () => {
    const res = await POST(pedidoDeSubida("presentacion.pptx"));
    expect(res.status).toBe(400);
    expect(storage.subidas).toEqual([]);
  });

  it("rechaza un archivo de más de 25 MB", async () => {
    const res = await POST(pedidoDeSubida("enorme.pdf", 25 * 1024 * 1024 + 1));
    expect(res.status).toBe(400);
    expect(storage.subidas).toEqual([]);
  });
});
