import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const src = readFileSync(join(process.cwd(), "app/api/marketing-ia/generate-image/route.ts"), "utf8");

// ─── Pruebas de texto: solo lo que un cambio de formato no puede tumbar por accidente ─────────
// Fix round 1 (16-sep-2026): estas eran, hasta acá, TODA la cobertura de esta ruta. La revisión
// marcó que no probaban nada — "con foto no llama a Gemini" era vacía porque el primer
// "payload.foto_url" en el archivo es la condición misma, y el comentario "Camino sin foto" es
// la línea siguiente, así que el recorte que se analizaba no incluía nunca el cuerpo real de
// ninguna rama. Se borró. La del crédito tenía una segunda aserción con el mismo defecto (cierto
// también en el archivo ANTES de este cambio) — se dejó solo la primera, que si sirve como humo:
// que la palabra exista. La cobertura real está en el describe de abajo, que corre el handler.
describe("la ruta de la placa (grep de texto, supletorio — no es la cobertura)", () => {
  it("existe la rama explícita para cuando no hay foto", () => {
    expect(src).toContain("if (!payload.foto_url)");
  });

  it("la propiedad la busca el servidor, no la manda la pantalla", () => {
    // El bug: flow_data.tokko_property_details venía vacío.
    expect(src).toContain("propiedad_tokko_id");
    expect(src).toContain("tokkobroker.com/api/v1/property/");
  });

  it("el título de la placa pasa por sinEmojis", () => {
    // EN LA IMAGEN NO VA NINGÚN EMOJI.
    expect(src).toContain("sinEmojis(");
  });
});

// ─── Mocks de los colaboradores: nada de red ni de Supabase de verdad ─────────────────────────
// Con vi.hoisted porque vi.mock se sube arriba del archivo antes que estos const existan; el
// objeto mutable permite que cada test configure la fila de `agencies`/`properties` que
// necesita sin tener que redefinir el mock entero.
const mocks = vi.hoisted(() => ({
  requireTenant: vi.fn(),
  consumeAiCredits: vi.fn(),
  updateAiTransactionCost: vi.fn(),
  generateImage: vi.fn(),
  state: {
    agencyRow: null as any,
    propertyRow: null as any,
  },
}));

vi.mock("@/lib/auth/tenant-validation", () => ({
  requireTenant: mocks.requireTenant,
  consumeAiCredits: mocks.consumeAiCredits,
  updateAiTransactionCost: mocks.updateAiTransactionCost,
}));

vi.mock("@/lib/gemini", () => ({
  generateImage: mocks.generateImage,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "agencies") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: mocks.state.agencyRow, error: null }) }) }) };
      }
      if (table === "generated_images") {
        return { insert: () => ({ select: () => ({ single: async () => ({ data: { id: "img-1" }, error: null }) }) }) };
      }
      throw new Error(`[mock] tabla admin no cubierta por esta prueba: ${table}`);
    },
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        download: async () => ({ data: null, error: new Error("[mock] storage.download no cubierto por esta prueba") }),
      }),
    },
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === "properties") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: mocks.state.propertyRow, error: null }) }),
            }),
          }),
        };
      }
      throw new Error(`[mock] tabla de sesión no cubierta por esta prueba: ${table}`);
    },
    storage: {
      from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "https://example.com/placa.jpg" } }) }),
    },
  }),
}));

// Importa DESPUÉS de los vi.mock (vitest los sube igual, pero así queda explícito el orden).
const { POST } = await import("./route");

const FOTO_PROPIA = "https://static.tokkobroker.com/pictures/1234/PROPIA.jpg";
const FOTO_AJENA = "https://static.tokkobroker.com/pictures/9999/AJENA.jpg";

function pedido(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/marketing-ia/generate-image", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

let imagenDePrueba: Buffer;

describe("POST /api/marketing-ia/generate-image (comportamiento real, colaboradores mockeados)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.state.agencyRow = { logo_url: null, marketing_ai_config: {}, tokko_api_key: null };
    mocks.state.propertyRow = null;
    mocks.requireTenant.mockResolvedValue({ userId: "user-1", agencyId: "agencia-1" });
    // Sin esto, traerPropiedad usaría la clave global del .env de verdad y llamaría a
    // tokkobroker.com en cada prueba. Vacía, cae en su propio "sin clave -> no hay fetch".
    vi.stubEnv("TOKKO_API_KEY", "");
    if (!imagenDePrueba) {
      imagenDePrueba = await sharp({
        create: { width: 800, height: 600, channels: 3, background: { r: 90, g: 110, b: 130 } },
      })
        .jpeg()
        .toBuffer();
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("la foto de OTRA propiedad: 400 y fetch() nunca se llama (prueba la Ruling B)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    mocks.state.propertyRow = { images: [FOTO_PROPIA] };

    const res = await POST(
      pedido({
        draft_id: "draft-1",
        copy_content: { hook: "Departamento en el centro" },
        format: "post",
        style: "moderno",
        propiedad_tokko_id: 1234,
        foto_url: FOTO_AJENA, // no está en propertyRow.images
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no pertenece/i);

    // Esta es la aserción que prueba el control: si la ruta llegara a bajar la foto antes de
    // verificar de quién es, este fetch() existiría. No existe ninguno.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("foto válida de la propia propiedad: no se gasta crédito ni se llama al modelo", async () => {
    const fetchSpy = vi.fn(async (url: string | URL) => {
      if (String(url) === FOTO_PROPIA) {
        return { ok: true, status: 200, arrayBuffer: async () => imagenDePrueba } as unknown as Response;
      }
      throw new Error(`[mock] fetch no esperado en esta prueba: ${url}`);
    });
    vi.stubGlobal("fetch", fetchSpy);

    mocks.state.propertyRow = { images: [FOTO_PROPIA] };

    const res = await POST(
      pedido({
        draft_id: "draft-2",
        copy_content: { hook: "Departamento en el centro" },
        format: "post",
        style: "moderno",
        propiedad_tokko_id: 1234,
        foto_url: FOTO_PROPIA,
      })
    );

    expect(res.status).toBe(200);
    expect(mocks.consumeAiCredits).not.toHaveBeenCalled();
    expect(mocks.generateImage).not.toHaveBeenCalled();
    // Sí se llamó a fetch, pero solo para bajar LA foto de la propiedad — no hay otro fetch.
    expect(fetchSpy).toHaveBeenCalledWith(FOTO_PROPIA);
  });

  it("sin foto_url: corre el camino de Gemini (se llama al modelo y se gasta crédito)", async () => {
    mocks.generateImage.mockResolvedValue(imagenDePrueba);
    mocks.consumeAiCredits.mockResolvedValue("tx-1");

    const res = await POST(
      pedido({
        draft_id: "draft-3",
        copy_content: { hook: "Departamento en el centro" },
        format: "post",
        style: "moderno",
        // sin foto_url ni propiedad_tokko_id: es el flujo de siempre.
      })
    );

    expect(res.status).toBe(200);
    expect(mocks.generateImage).toHaveBeenCalledTimes(1);
    expect(mocks.consumeAiCredits).toHaveBeenCalledTimes(1);
  });
});
