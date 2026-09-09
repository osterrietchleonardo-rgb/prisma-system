import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * CREAR Y LISTAR PLANTILLAS. Los testigos son de CONDUCTA: miran qué fila quedó escrita, no
 * el mensaje. Lo que importa acá: un asesor no crea (y no se escribe nada), y la plantilla
 * nace inactiva en la agencia de la sesión.
 */

const AGENCIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const sesion = { agencyId: AGENCIA, userId: "u1", role: "director" as string | null };
const base = { filas: [] as Record<string, unknown>[], insertadas: [] as Record<string, unknown>[] };

vi.mock("@/lib/auth/tenant-validation", () => ({ requireTenant: async () => sesion }));

const cliente = () => ({
  from: () => ({
    select: () => ({
      eq: () => ({
        order: async () => ({ data: base.filas.filter((f) => f.agency_id === AGENCIA), error: null }),
      }),
    }),
    insert: (fila: Record<string, unknown>) => ({
      select: () => ({
        single: async () => {
          const nueva = { id: "p-1", version: 1, activa: false, ...fila };
          base.insertadas.push(nueva);
          return { data: nueva, error: null };
        },
      }),
    }),
  }),
});
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => cliente() }));

const { GET, POST } = await import("./route");

const crear = (nombre: unknown) =>
  POST(new Request("http://x/api/documentos-plantillas", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre }),
  }));

beforeEach(() => { sesion.role = "director"; base.filas = []; base.insertadas = []; });

describe("solo el director", () => {
  it("un asesor no puede crear y NO se escribe nada", async () => {
    sesion.role = "asesor";
    expect((await crear("Presentación")).status).toBe(403);
    expect(base.insertadas).toEqual([]);
  });
});

describe("crear", () => {
  it("nace inactiva, con la agencia de la sesión, y el nombre limpio", async () => {
    const res = await crear("  Presentación de la inmobiliaria  ");
    expect(res.status).toBe(200);
    expect(base.insertadas[0]).toMatchObject({ agency_id: AGENCIA, nombre: "Presentación de la inmobiliaria", activa: false, created_by: "u1" });
  });
  it("sin nombre no crea", async () => {
    expect((await crear("   ")).status).toBe(400);
    expect(base.insertadas).toEqual([]);
  });
});

describe("listar", () => {
  it("devuelve las de la agencia normalizadas", async () => {
    base.filas = [{ id: "p-1", agency_id: AGENCIA, nombre: "X", version: 3, activa: true, cuerpo: { type: "doc", content: [] } }];
    const { plantillas } = await (await GET()).json();
    expect(plantillas).toHaveLength(1);
    expect(plantillas[0]).toMatchObject({ id: "p-1", nombre: "X", version: 3, activa: true });
  });
});
