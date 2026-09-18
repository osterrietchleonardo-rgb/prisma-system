import { describe, it, expect, vi, beforeEach } from "vitest";

const tenant = vi.fn(async () => ({ userId: "u1", agencyId: "a1", role: "asesor" }));
vi.mock("@/lib/auth/tenant-validation", () => ({ requireTenant: () => tenant() }));

let filasPuertas: any[] = [{ smp: "053-050-006", es_esquina: false }];
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabla: string) => ({
      select: () => ({
        eq: () => ({ eq: () => ({ order: async () => ({ data: tabla === "gcba_puertas" ? filasPuertas : [] }) }) }),
      }),
      upsert: async () => ({ error: null }),
    }),
    rpc: async () => ({ data: [], error: null }),
  }),
}));

// La base falsa de centroides que usa el desempate por distancia: la dependencia se mockea entera,
// así el resto de `dependenciasSupabase` (curDe, cache, terrenosCerca) no hace falta simularlo.
// `tiraErrorPorSmp` simula que el catastro no responde para un candidato puntual.
let centroidesPorSmp: Record<string, [number, number]> = {};
let tiraErrorPorSmp = new Set<string>();
vi.mock("@/lib/prefactibilidad/dependencias-supabase", () => ({
  dependenciasSupabase: () => ({
    gcba: {
      parcela: async (smp: string) => {
        if (tiraErrorPorSmp.has(smp)) throw new Error("El catastro de la Ciudad no está respondiendo, probá en unos minutos");
        return centroidesPorSmp[smp] ? { centroide: centroidesPorSmp[smp] } : null;
      },
    },
  }),
}));

const analizar = vi.fn(async (...a: any[]) => ({ smp: a[0], edificabilidad: { modo: "oficial" }, avisos: [] }));
vi.mock("@/lib/prefactibilidad/analizar", async (orig) => ({ ...(await orig<any>()), analizarParcela: (...a: any[]) => analizar(...a) }));

import { POST } from "./route";
const req = (body: unknown) => new Request("http://x/api/prefactibilidad/analizar", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => { filasPuertas = [{ smp: "053-050-006", es_esquina: false }]; centroidesPorSmp = {}; tiraErrorPorSmp = new Set(); analizar.mockClear(); });

describe("POST /api/prefactibilidad/analizar", () => {
  it("resuelve la puerta a parcela y devuelve el informe", async () => {
    const r = await POST(req({ calle: "ROOSEVELT FRANKLIN D.", altura: 4554, direccion: "Roosevelt 4554" }));
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.prefactibilidad.smp).toBe("053-050-006");
    expect(analizar).toHaveBeenCalledWith("053-050-006", "Roosevelt 4554", expect.anything());
  });
  it("puerta inexistente → 404 con el mensaje de la spec", async () => {
    filasPuertas = [];
    const r = await POST(req({ calle: "ROOSEVELT FRANKLIN D.", altura: 99999, direccion: "x" }));
    expect(r.status).toBe(404);
    expect((await r.json()).error).toBe("No encontramos ese número. Probá con otro número de la misma cuadra");
  });
  it("body inválido → 400; sin sesión → 401", async () => {
    expect((await POST(req({ calle: "", altura: "no" }))).status).toBe(400);
    tenant.mockRejectedValueOnce(new Error("Unauthorized"));
    expect((await POST(req({ calle: "X", altura: 1, direccion: "x" }))).status).toBe(401);
  });
  it("dos smp con la misma clave+altura y hay lat/lng → se queda con el de centroide más cerca", async () => {
    filasPuertas = [{ smp: "AAA", es_esquina: false }, { smp: "BBB", es_esquina: false }];
    centroidesPorSmp = { AAA: [-58.40, -34.55], BBB: [-58.45, -34.60] };
    const r = await POST(req({ calle: "AV. SAN MARTIN", altura: 100, direccion: "San Martin 100", lat: -34.601, lng: -58.451 }));
    expect(r.status).toBe(200);
    expect(analizar).toHaveBeenCalledWith("BBB", "San Martin 100", expect.anything());
  });
  it("dos smp con la misma clave+altura y NO hay lat/lng → toma el primero y avisa que es ambigua", async () => {
    filasPuertas = [{ smp: "AAA", es_esquina: false }, { smp: "BBB", es_esquina: false }];
    const r = await POST(req({ calle: "AV. SAN MARTIN", altura: 100, direccion: "San Martin 100" }));
    expect(r.status).toBe(200);
    expect(analizar).toHaveBeenCalledWith("AAA", "San Martin 100", expect.anything());
    const j = await r.json();
    expect(j.prefactibilidad.avisos).toEqual([{ clave: "puerta_ambigua", fuerte: false, texto: "Hay más de una parcela con esta calle y número; se tomó la más probable. Verificá la dirección." }]);
  });
  it("un candidato tira error al pedir su parcela (catastro caído): el otro sigue pudiendo ganar el desempate", async () => {
    filasPuertas = [{ smp: "AAA", es_esquina: false }, { smp: "BBB", es_esquina: false }];
    tiraErrorPorSmp = new Set(["AAA"]);
    centroidesPorSmp = { BBB: [-58.45, -34.60] };
    const r = await POST(req({ calle: "AV. SAN MARTIN", altura: 100, direccion: "San Martin 100", lat: -34.601, lng: -58.451 }));
    expect(r.status).toBe(200);
    expect(analizar).toHaveBeenCalledWith("BBB", "San Martin 100", expect.anything());
  });
  it("con lat/lng pero ningún candidato resuelve su centroide → toma el primero y avisa que es ambigua", async () => {
    filasPuertas = [{ smp: "AAA", es_esquina: false }, { smp: "BBB", es_esquina: false }];
    const r = await POST(req({ calle: "AV. SAN MARTIN", altura: 100, direccion: "San Martin 100", lat: -34.601, lng: -58.451 }));
    expect(r.status).toBe(200);
    expect(analizar).toHaveBeenCalledWith("AAA", "San Martin 100", expect.anything());
    const j = await r.json();
    expect(j.prefactibilidad.avisos).toEqual([{ clave: "puerta_ambigua", fuerte: false, texto: "Hay más de una parcela con esta calle y número; se tomó la más probable. Verificá la dirección." }]);
  });
});
