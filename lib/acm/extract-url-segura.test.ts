import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// El lector de links completo frente al ataque: un link interno (o uno que redirige adentro) no
// tiene que llegar a abrirse por el camino rápido NI mandarse al servicio con navegador de
// EasyPanel, que corre dentro de nuestra red.

vi.mock("@/lib/gemini", () => ({ prismaIA: { generateContent: async () => ({ response: { text: () => "{}" } }) } }));

const control = vi.hoisted(() => ({ redirigeAdentro: false }));
vi.mock("@/lib/acm/url-segura", async (original) => {
  const real: any = await original();
  return {
    ...real,
    // La validación es la real. Solo se simula la bajada de la página, para el caso de un portal
    // que responde con una redirección hacia adentro (lo que haría obtenerPaginaSegura real).
    obtenerPaginaSegura: async (url: string, opts: any) => {
      if (control.redirigeAdentro) throw new real.UrlNoPermitida("el link apunta a una dirección interna");
      return real.obtenerPaginaSegura(url, opts);
    },
  };
});

import { extractFromUrl } from "./extract";

describe("extractFromUrl · links que llevan adentro", () => {
  const fetchEspia = vi.fn(async () => new Response("{}", { status: 200 }));

  beforeEach(() => {
    control.redirigeAdentro = false;
    fetchEspia.mockClear();
    vi.stubGlobal("fetch", fetchEspia);
    vi.stubEnv("ACM_EXTRACTOR_URL", "https://extractor.example.com/extract");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each([
    "http://169.254.169.254/latest/meta-data/",
    "http://127.0.0.1:3000/algo",
    "http://localhost:3000/api/acm/searches",
    "http://n8n:5678/",
    "https://usuario:clave@www.zonaprop.com.ar/x-1.html",
  ])("%s: no se abre ni se manda al servicio con navegador", async (url) => {
    const r = await extractFromUrl(url);
    expect(r.ok).toBe(false);
    expect(r.aviso).toMatch(/^Ese link no se puede abrir/);
    expect(fetchEspia).not.toHaveBeenCalled();
  });

  it("un portal que redirige adentro: corta y tampoco se manda al servicio con navegador", async () => {
    control.redirigeAdentro = true;
    // Un host público con IP literal, para no depender del DNS en la prueba.
    const r = await extractFromUrl("https://93.184.216.34/aviso--20432877");
    expect(r.ok).toBe(false);
    expect(r.aviso).toMatch(/dirección interna/);
    expect(fetchEspia).not.toHaveBeenCalled();
  });
});
