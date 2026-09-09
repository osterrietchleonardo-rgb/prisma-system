import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { validarImagen, MAX_IMAGEN, ANCHO_MINIMO, GUIA_IMAGEN } from "./imagen";

const png = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: "#fff" } }).png().toBuffer();
const jpg = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: "#fff" } }).jpeg().toBuffer();

describe("validarImagen", () => {
  it("acepta un PNG apaisado de 1600 de ancho y dice sus medidas", async () => {
    const r = await validarImagen(await png(1600, 300), "image/png");
    expect(r).toEqual({ ok: true, ext: "png", ancho: 1600, alto: 300 });
  });

  it("acepta JPG", async () => {
    const r = await validarImagen(await jpg(2000, 400), "image/jpeg");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ext).toBe("jpg");
  });

  it("rechaza menos de 1600 de ancho, midiendo el archivo (no el nombre ni el mime)", async () => {
    const r = await validarImagen(await png(800, 200), "image/png");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain(String(ANCHO_MINIMO));
  });

  it("rechaza un formato que no es PNG ni JPG", async () => {
    const webp = await sharp({ create: { width: 1600, height: 200, channels: 3, background: "#fff" } }).webp().toBuffer();
    const r = await validarImagen(webp, "image/webp");
    expect(r.ok).toBe(false);
  });

  it("rechaza más de 2 MB antes de mirar nada más", async () => {
    const r = await validarImagen(Buffer.alloc(MAX_IMAGEN + 1), "image/png");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("2 MB");
  });

  it("un archivo que no es una imagen no explota: dice que no se pudo leer", async () => {
    const r = await validarImagen(Buffer.from("esto no es una imagen"), "image/png");
    expect(r.ok).toBe(false);
  });

  it("la guía le dice al director el ancho, el peso y que NO dibuje los datos del asesor", () => {
    expect(GUIA_IMAGEN).toContain("1600");
    expect(GUIA_IMAGEN).toContain("2 MB");
    expect(GUIA_IMAGEN.toLowerCase()).toContain("datos del asesor");
  });
});
