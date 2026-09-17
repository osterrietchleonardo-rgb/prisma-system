import { describe, it, expect, vi, beforeEach } from "vitest";

const tenant = vi.fn(async () => ({ userId: "u1", agencyId: "a1", role: "asesor" }));
vi.mock("@/lib/auth/tenant-validation", () => ({ requireTenant: () => tenant() }));

let ultimoInsert: any = null;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    // dependenciasSupabase(admin) solo arma closures: mientras analizarParcela esté mockeado,
    // sus métodos (curDe, puertaEsquina, terrenosCerca, cache.*) nunca se llaman de verdad.
    from: (tabla: string) => {
      if (tabla === "prefactibilidades") {
        return {
          insert: (payload: any) => {
            ultimoInsert = payload;
            return { select: () => ({ single: async () => ({ data: { id: "p1" }, error: null }) }) };
          },
        };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) };
    },
    rpc: async () => ({ data: [], error: null }),
  }),
}));

const analizar = vi.fn(async (..._a: any[]) => ({ smp: "053-050-006", direccion: "Roosevelt 4554", edificabilidad: { modo: "oficial" } }));
vi.mock("@/lib/prefactibilidad/analizar", async (orig) => ({ ...(await orig<any>()), analizarParcela: (...a: any[]) => analizar(...a) }));

import { POST } from "./route";
const req = (body: unknown) => new Request("http://x/api/prefactibilidad", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => { ultimoInsert = null; analizar.mockClear(); });

describe("POST /api/prefactibilidad", () => {
  it("guarda lo que el SERVIDOR recalcula a partir del smp, no lo que manda el navegador", async () => {
    const r = await POST(req({ smp: "053-050-006", direccion: "Roosevelt 4554" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ id: "p1" });
    expect(analizar).toHaveBeenCalledWith("053-050-006", "Roosevelt 4554", expect.anything());
    // El insert lleva el resultado que devolvió analizarParcela, no el body.
    expect(ultimoInsert.resultado).toEqual({ smp: "053-050-006", direccion: "Roosevelt 4554", edificabilidad: { modo: "oficial" } });
    expect(ultimoInsert.smp).toBe("053-050-006");
    expect(ultimoInsert.modo).toBe("oficial");
  });

  it("body con números forjados pero sin smp → 400 con el mensaje exacto, y no se recalcula nada", async () => {
    const r = await POST(req({ direccion: "Roosevelt 4554", edificabilidad: { modo: "oficial", m2Construibles: 999999 } }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("No hay un análisis para guardar.");
    expect(analizar).not.toHaveBeenCalled();
    expect(ultimoInsert).toBeNull();
  });
});
