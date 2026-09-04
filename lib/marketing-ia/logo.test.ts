import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { halodeContraste, prepararLogo, UMBRAL_CONTRASTE } from "./logo";

const ANCHO_PLACA = 1080;

/** Un logo de `marca` px de ancho, centrado en un lienzo cuadrado con vacio alrededor. */
async function logoConVacio(lado: number, marcaAncho: number, marcaAlto: number, color: string) {
  const x = Math.round((lado - marcaAncho) / 2);
  const y = Math.round((lado - marcaAlto) / 2);
  return sharp({
    create: { width: lado, height: lado, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{
      input: Buffer.from(
        `<svg width="${lado}" height="${lado}">` +
        `<rect x="${x}" y="${y}" width="${marcaAncho}" height="${marcaAlto}" fill="${color}"/></svg>`),
    }])
    .png()
    .toBuffer();
}

/** Una placa lisa del tono pedido. */
function placaLisa(tono: number) {
  return sharp({
    create: { width: ANCHO_PLACA, height: 1350, channels: 3, background: { r: tono, g: tono, b: tono } },
  }).jpeg().toBuffer();
}

describe("preparar el logo", () => {
  it("le saca el vacio: el tamano elegido vale sobre la marca, no sobre el lienzo", async () => {
    // El caso real: lienzo 500x500 con la marca de 411x135 adentro (73% del alto es vacio).
    const conVacio = await logoConVacio(500, 411, 135, "#ffffff");
    const listo = await prepararLogo(conVacio, ANCHO_PLACA, "medium");

    // "medium" = 16% de 1080 = 173 px. Sin recortar, la marca visible quedaria en 173*(411/500)
    // = 142 px, un 18% mas chica de lo que el director pidio.
    expect(listo.ancho).toBe(Math.round(ANCHO_PLACA * 0.16));
    expect(listo.recorto).toBe(true);

    // Y el alto tiene que seguir la proporcion de la MARCA (411x135), no la del lienzo cuadrado.
    expect(listo.alto / listo.ancho).toBeCloseTo(135 / 411, 1);
  });

  it("a un logo sin vacio no le hace nada", async () => {
    const sinVacio = await logoConVacio(400, 400, 400, "#ffffff");
    const listo = await prepararLogo(sinVacio, ANCHO_PLACA, "medium");
    expect(listo.recorto).toBe(false);
    expect(listo.ancho).toBe(listo.alto); // sigue cuadrado
  });

  it("respeta chico, mediano y grande", async () => {
    const logo = await logoConVacio(500, 411, 135, "#ffffff");
    const chico = await prepararLogo(logo, ANCHO_PLACA, "small");
    const mediano = await prepararLogo(logo, ANCHO_PLACA, "medium");
    const grande = await prepararLogo(logo, ANCHO_PLACA, "large");
    expect(chico.ancho).toBe(Math.round(ANCHO_PLACA * 0.12));
    expect(mediano.ancho).toBe(Math.round(ANCHO_PLACA * 0.16));
    expect(grande.ancho).toBe(Math.round(ANCHO_PLACA * 0.22));
  });

  it("un tamano desconocido cae en mediano en vez de romper", async () => {
    const logo = await logoConVacio(500, 411, 135, "#ffffff");
    const listo = await prepararLogo(logo, ANCHO_PLACA, "gigante" as string);
    expect(listo.ancho).toBe(Math.round(ANCHO_PLACA * 0.16));
  });

  it("mide la claridad de la marca y no del vacio", async () => {
    // Si contara los pixeles transparentes (que son negros), un logo blanco daria oscuro.
    const blanco = await prepararLogo(await logoConVacio(500, 411, 135, "#ffffff"), ANCHO_PLACA, "medium");
    const negro = await prepararLogo(await logoConVacio(500, 411, 135, "#111111"), ANCHO_PLACA, "medium");
    expect(blanco.claridad).toBeGreaterThan(200);
    expect(negro.claridad).toBeLessThan(60);
  });
});

describe("el halo segun el contraste", () => {
  const pos = { left: 800, top: 1100 };

  it("logo claro sobre foto clara: halo OSCURO", async () => {
    const logo = await prepararLogo(await logoConVacio(500, 411, 135, "#ffffff"), ANCHO_PLACA, "medium");
    const r = await halodeContraste(await placaLisa(230), logo, pos);
    expect(r.halo).toBe("oscuro");
    expect(r.capas.length).toBeGreaterThan(0);
    expect(r.contraste).toBeLessThan(UMBRAL_CONTRASTE);
  });

  it("logo oscuro sobre foto oscura: halo CLARO", async () => {
    const logo = await prepararLogo(await logoConVacio(500, 411, 135, "#111111"), ANCHO_PLACA, "medium");
    const r = await halodeContraste(await placaLisa(30), logo, pos);
    expect(r.halo).toBe("claro");
    expect(r.capas.length).toBeGreaterThan(0);
  });

  it("si ya contrasta, no le agrega nada", async () => {
    const blancoSobreOscura = await halodeContraste(
      await placaLisa(20),
      await prepararLogo(await logoConVacio(500, 411, 135, "#ffffff"), ANCHO_PLACA, "medium"),
      pos,
    );
    const oscuroSobreClara = await halodeContraste(
      await placaLisa(235),
      await prepararLogo(await logoConVacio(500, 411, 135, "#111111"), ANCHO_PLACA, "medium"),
      pos,
    );
    expect(blancoSobreOscura.halo).toBeNull();
    expect(blancoSobreOscura.capas).toHaveLength(0);
    expect(oscuroSobreClara.halo).toBeNull();
    expect(oscuroSobreClara.capas).toHaveLength(0);
  });

  it("no se rompe si el logo cae pegado al borde", async () => {
    // extract() de sharp tira si la caja se sale aunque sea un pixel: la placa no puede fallar
    // por donde se haya elegido poner el logo.
    const logo = await prepararLogo(await logoConVacio(500, 411, 135, "#ffffff"), ANCHO_PLACA, "large");
    const r = await halodeContraste(await placaLisa(230), logo, { left: ANCHO_PLACA - 10, top: 1340 });
    expect(r.contraste).toBeGreaterThanOrEqual(0);
  });

  it("el halo tapa el logo entero, con margen", async () => {
    const logo = await prepararLogo(await logoConVacio(500, 411, 135, "#ffffff"), ANCHO_PLACA, "medium");
    const r = await halodeContraste(await placaLisa(230), logo, pos);
    const capa = r.capas[0] as { input: Buffer; top: number; left: number };
    const m = await sharp(capa.input).metadata();
    expect(m.width!).toBeGreaterThan(logo.ancho);
    expect(m.height!).toBeGreaterThan(logo.alto);
    // y arranca antes que el logo, para quedar centrado detras
    expect(capa.left).toBeLessThan(pos.left);
    expect(capa.top).toBeLessThan(pos.top);
  });
});
