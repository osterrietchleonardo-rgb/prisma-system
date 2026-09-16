import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "app/api/marketing-ia/generate-image/route.ts"), "utf8");

describe("la ruta de la placa", () => {
  it("con foto no llama a Gemini", () => {
    // Si la foto real pasara por generateImage, el modelo redibuja la propiedad.
    const conFoto = src.slice(src.indexOf("payload.foto_url"));
    const antesDelElse = conFoto.slice(0, conFoto.indexOf("// ─── Camino sin foto"));
    expect(antesDelElse).not.toContain("generateImage(");
  });

  it("con foto no consume creditos de imagen", () => {
    expect(src).toContain("if (!payload.foto_url)");
    const i = src.indexOf('consumeAiCredits("marketing_ia", 2');
    expect(i, "el consumo de creditos tiene que estar adentro del camino sin foto").toBeGreaterThan(0);
  });

  it("la propiedad la busca el servidor, no la manda la pantalla", () => {
    // El bug: flow_data.tokko_property_details viene vacio.
    expect(src).toContain("propiedad_tokko_id");
    expect(src).toContain("tokkobroker.com/api/v1/property/");
  });

  it("el titulo de la placa pasa por sinEmojis", () => {
    // EN LA IMAGEN NO VA NINGUN EMOJI.
    expect(src).toContain("sinEmojis(");
  });

  it("no se descarga la foto sin verificar que sea de esta propiedad y esta agencia", () => {
    // Ruling B: sin este chequeo, un tenant podria pasar el id de una propiedad de OTRA agencia
    // y publicar su foto bajo su propio logo (y de paso, hacer que el servidor haga fetch() a
    // una URL arbitraria). La verificacion tiene que estar ANTES de bajar la foto.
    expect(src).toContain('.eq("agency_id", agencyId)');
    expect(src).toContain('.eq("tokko_id", payload.propiedad_tokko_id)');
    const iVerificacion = src.indexOf(".eq(\"tokko_id\", payload.propiedad_tokko_id)");
    const iFetchFoto = src.indexOf("fetch(payload.foto_url)");
    expect(iVerificacion, "la verificacion tiene que existir").toBeGreaterThan(0);
    expect(iFetchFoto, "el fetch de la foto tiene que existir").toBeGreaterThan(0);
    expect(iVerificacion).toBeLessThan(iFetchFoto);
  });
});
