import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * UNA PLANTILLA: leer, editar, borrar. Lo que se protege acá:
 *  - una plantilla de otra agencia no existe (404, no 403: no se filtra que está);
 *  - un asesor no escribe, y no se escribe nada;
 *  - no se activa con el cuerpo vacío, ni entra HTML como cuerpo;
 *  - si ya se compartió, NO se borra: se desactiva.
 */

const AGENCIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTRA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const sesion = { agencyId: AGENCIA, userId: "u1", role: "director" as string | null };
const base = {
  plantilla: null as Record<string, unknown> | null,
  compartidos: 0,
  updates: [] as Record<string, unknown>[],
  deletes: 0,
};

vi.mock("@/lib/auth/tenant-validation", () => ({ requireTenant: async () => sesion }));
vi.mock("@/lib/documentos/storage", () => ({ urlPublica: (p: string | null) => (p ? `https://cdn/${p}` : null) }));

// Un cliente falso que imita SOLO el encadenado que usa el endpoint:
//   .select().eq("id").eq("agency_id").maybeSingle()   → la plantilla, si es de esa agencia
//   .select(_, {count, head}).eq("plantilla_id")        → cuántas veces se compartió
//   .update(datos).eq().eq().select().single()
//   .delete().eq().eq()
const cliente = () => ({
  from: (tabla: string) => ({
    select: () => ({
      eq: (_col: string, _val: unknown) => {
        if (tabla === "shared_documentos") return Promise.resolve({ count: base.compartidos, error: null });
        return {
          eq: (_col2: string, agencia: unknown) => ({
            maybeSingle: async () => ({
              data: base.plantilla && base.plantilla.agency_id === agencia ? base.plantilla : null,
              error: null,
            }),
          }),
        };
      },
    }),
    update: (datos: Record<string, unknown>) => ({
      eq: () => ({
        eq: () => ({
          select: () => ({
            single: async () => { base.updates.push(datos); return { data: { ...base.plantilla, ...datos }, error: null }; },
          }),
        }),
      }),
    }),
    delete: () => ({ eq: () => ({ eq: async () => { base.deletes++; return { error: null }; } }) }),
  }),
});
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => cliente() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => cliente() }));

const { GET, PUT, DELETE } = await import("./route");
const params = { params: { id: "p-1" } };
const req = (method: string, body?: unknown) =>
  new Request("http://x/api/documentos-plantillas/p-1", {
    method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
  });

const DOC = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hola" }] }] };

beforeEach(() => {
  sesion.role = "director";
  base.plantilla = {
    id: "p-1", agency_id: AGENCIA, nombre: "X", version: 2, activa: false, cuerpo: DOC,
    header_path: null, footer_path: null, bloque_asesor: { texto: DOC, posicion: "footer" },
  };
  base.compartidos = 0; base.updates = []; base.deletes = 0;
});

describe("aislamiento", () => {
  it("una plantilla de otra agencia es 404, no se filtra que existe", async () => {
    base.plantilla!.agency_id = OTRA;
    expect((await GET(req("GET"), params)).status).toBe(404);
  });
  it("un asesor no edita ni borra", async () => {
    sesion.role = "asesor";
    expect((await PUT(req("PUT", { nombre: "Y" }), params)).status).toBe(403);
    expect((await DELETE(req("DELETE"), params)).status).toBe(403);
    expect(base.updates).toEqual([]);
    expect(base.deletes).toBe(0);
  });
});

describe("editar", () => {
  it("guarda nombre, cuerpo, bloque y activa, y sube la versión en 1", async () => {
    const res = await PUT(req("PUT", { nombre: "Nueva", cuerpo: DOC, bloque_asesor: { texto: DOC, posicion: "ambos" }, activa: true }), params);
    expect(res.status).toBe(200);
    expect(base.updates[0]).toMatchObject({ nombre: "Nueva", activa: true, version: 3 });
    expect((base.updates[0].bloque_asesor as { posicion: string }).posicion).toBe("ambos");
  });
  it("no se puede activar con el cuerpo vacío", async () => {
    const res = await PUT(req("PUT", { nombre: "Nueva", cuerpo: { type: "doc", content: [] }, activa: true }), params);
    expect(res.status).toBe(400);
    expect(base.updates).toEqual([]);
  });
  it("un cuerpo que es HTML no entra: cae en el doc vacío y, si se quería activar, se rechaza", async () => {
    const res = await PUT(req("PUT", { nombre: "N", cuerpo: "<img onerror=alert(1)>", activa: true }), params);
    expect(res.status).toBe(400);
  });
});

describe("borrar", () => {
  it("si nunca se compartió, se borra", async () => {
    const { borrada } = await (await DELETE(req("DELETE"), params)).json();
    expect(borrada).toBe(true);
    expect(base.deletes).toBe(1);
  });
  it("si ya tiene links, NO se borra: se desactiva, y el cliente con el link no ve un 404", async () => {
    base.compartidos = 3;
    const { borrada, desactivada } = await (await DELETE(req("DELETE"), params)).json();
    expect(borrada).toBe(false);
    expect(desactivada).toBe(true);
    expect(base.deletes).toBe(0);
    expect(base.updates[0]).toMatchObject({ activa: false });
  });
});

describe("leer", () => {
  it("trae la plantilla con las urls públicas de las imágenes y cuántas veces se compartió", async () => {
    base.plantilla!.header_path = `${AGENCIA}/documentos/p-1/header-x.png`;
    base.compartidos = 5;
    const { plantilla, header_url, footer_url, compartidos } = await (await GET(req("GET"), params)).json();
    expect(plantilla.id).toBe("p-1");
    expect(header_url).toBe(`https://cdn/${AGENCIA}/documentos/p-1/header-x.png`);
    expect(footer_url).toBeNull();
    expect(compartidos).toBe(5);
  });
});
