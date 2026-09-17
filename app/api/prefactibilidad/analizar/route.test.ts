import { describe, it, expect, vi, beforeEach } from "vitest";

const tenant = vi.fn(async () => ({ userId: "u1", agencyId: "a1", role: "asesor" }));
vi.mock("@/lib/auth/tenant-validation", () => ({ requireTenant: () => tenant() }));

const puerta = { smp: "053-050-006", es_esquina: false };
let filaPuerta: any = puerta;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabla: string) => ({
      select: () => ({
        eq: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: tabla === "gcba_puertas" ? filaPuerta : null }) }) }), maybeSingle: async () => ({ data: null }) }),
      }),
      upsert: async () => ({ error: null }),
    }),
    rpc: async () => ({ data: [], error: null }),
  }),
}));

const analizar = vi.fn(async (..._a: any[]) => ({ smp: "053-050-006", edificabilidad: { modo: "oficial" } }));
vi.mock("@/lib/prefactibilidad/analizar", async (orig) => ({ ...(await orig<any>()), analizarParcela: (...a: any[]) => analizar(...a) }));

import { POST } from "./route";
const req = (body: unknown) => new Request("http://x/api/prefactibilidad/analizar", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => { filaPuerta = puerta; analizar.mockClear(); });

describe("POST /api/prefactibilidad/analizar", () => {
  it("resuelve la puerta a parcela y devuelve el informe", async () => {
    const r = await POST(req({ calle: "ROOSEVELT FRANKLIN D.", altura: 4554, direccion: "Roosevelt 4554" }));
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.prefactibilidad.smp).toBe("053-050-006");
    expect(analizar).toHaveBeenCalledWith("053-050-006", "Roosevelt 4554", expect.anything());
  });
  it("puerta inexistente → 404 con el mensaje de la spec", async () => {
    filaPuerta = null;
    const r = await POST(req({ calle: "ROOSEVELT FRANKLIN D.", altura: 99999, direccion: "x" }));
    expect(r.status).toBe(404);
    expect((await r.json()).error).toBe("No encontramos ese número. Probá con otro número de la misma cuadra");
  });
  it("body inválido → 400; sin sesión → 401", async () => {
    expect((await POST(req({ calle: "", altura: "no" }))).status).toBe(400);
    tenant.mockRejectedValueOnce(new Error("Unauthorized"));
    expect((await POST(req({ calle: "X", altura: 1, direccion: "x" }))).status).toBe(401);
  });
});
