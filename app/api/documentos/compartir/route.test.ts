import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * COMPARTIR. Lo que se protege: el snapshot que queda escrito lleva los datos de QUIEN
 * comparte con las variables ya aplicadas; una plantilla inactiva o de otra agencia no se
 * comparte y no se escribe nada.
 */

const AGENCIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const sesion = { agencyId: AGENCIA, userId: "u1", role: "asesor" as string | null };
const base = {
  plantilla: null as Record<string, unknown> | null,
  insertadas: [] as Record<string, unknown>[],
};
const DOC = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hola " }, { type: "mention", attrs: { id: "nombre" } }] }] };

vi.mock("@/lib/auth/tenant-validation", () => ({ requireTenant: async () => sesion }));
vi.mock("@/lib/ficha/token", () => ({ generarToken: () => "tok123" }));
vi.mock("@/lib/documentos/storage", () => ({ urlPublica: (p: string | null) => (p ? `https://cdn/${p}` : null) }));

const plantillaVisible = () => (base.plantilla?.agency_id === AGENCIA ? base.plantilla : null);

const cliente = () => ({
  from: (tabla: string) => ({
    select: () => ({
      eq: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: plantillaVisible() }) }),
        single: async () =>
          tabla === "profiles"
            ? { data: { full_name: "Ana", email: "a@x", phone: "5491123456789", clasificacion: null, role: "asesor", avatar_url: null } }
            : { data: { id: AGENCIA, name: "Central", marketing_ai_config: { brand_colors: ["#123"] } } },
      }),
    }),
    insert: async (fila: Record<string, unknown>) => { base.insertadas.push(fila); return { error: null }; },
  }),
});
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => cliente() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => cliente() }));

const { POST } = await import("./route");
const compartir = (plantilla_id: string) =>
  POST(new Request("http://x/api/documentos/compartir", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plantilla_id }),
  }));

beforeEach(() => {
  sesion.role = "asesor";
  base.plantilla = {
    id: "p-1", agency_id: AGENCIA, nombre: "Presentación", version: 2, activa: true, cuerpo: DOC,
    header_path: "h.png", footer_path: null, bloque_asesor: { texto: DOC, posicion: "footer" },
  };
  base.insertadas = [];
});

describe("compartir", () => {
  it("el asesor puede, y el snapshot lleva SUS datos con las variables aplicadas", async () => {
    const res = await compartir("p-1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ token: "tok123", path: "/documento/tok123" });
    const fila = base.insertadas[0];
    expect(fila).toMatchObject({ token: "tok123", plantilla_id: "p-1", created_by: "u1", agency_id: AGENCIA });
    const snap = fila.snapshot as { plantilla: { cuerpo: unknown; header_url: string; version: number }; agent: { full_name: string }; brand: { colors: string[] } };
    expect(JSON.stringify(snap.plantilla.cuerpo)).toContain("\"Ana\"");
    expect(JSON.stringify(snap.plantilla.cuerpo)).not.toContain("mention");
    expect(snap.plantilla.header_url).toBe("https://cdn/h.png");
    expect(snap.plantilla.version).toBe(2);
    expect(snap.agent.full_name).toBe("Ana");
    expect(snap.brand.colors).toEqual(["#123"]);
  });

  it("una plantilla inactiva no se comparte", async () => {
    base.plantilla!.activa = false;
    expect((await compartir("p-1")).status).toBe(404);
    expect(base.insertadas).toEqual([]);
  });

  it("una plantilla de otra agencia no se comparte", async () => {
    base.plantilla!.agency_id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    expect((await compartir("p-1")).status).toBe(404);
    expect(base.insertadas).toEqual([]);
  });
});
