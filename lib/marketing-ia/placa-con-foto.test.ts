import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { medirPanel, armarPlacaConFoto } from "./placa-con-foto";

/** Una foto de prueba del tamaño y color que se pida. */
const fotoDe = (ancho: number, alto: number, color = { r: 20, g: 120, b: 200 }) =>
  sharp({ create: { width: ancho, height: alto, channels: 3, background: color } }).jpeg().toBuffer();

const CONTENIDO = {
  titulo: "Belgrano lidera la demanda de alquileres",
  bajada: "Monoambiente full amenities — La Pampa 1300",
  precio: "USD 130.000",
  datos: ["1 ambiente", "45 m²", "Pileta", "Gimnasio", "Seguridad 24 h"],
};

describe("medirPanel", () => {
  it("la foto nunca baja del 45% del alto de la placa", () => {
    // El tope existe para que el panel no se coma la propiedad. Con un titulo larguisimo el
    // panel tiene que achicar la letra y soltar casillas, no crecer sin limite.
    const m = medirPanel({
      ancho: 1080, alto: 1350, reservadoAbajo: 200,
      contenido: { ...CONTENIDO, titulo: "Un titulo absurdamente largo ".repeat(12) },
    });
    expect(m.altoPanel).toBeLessThanOrEqual(1350 * 0.55);
    expect(m.altoFoto).toBeGreaterThanOrEqual(1350 * 0.45);
  });

  it("el cuerpo del titulo es SIEMPRE un entero", () => {
    // Con un cuerpo fraccionario opentype.js devuelve NaN y el texto se corta a la mitad
    // sin ningun error. Ya paso en produccion el 31-ago-2026 con el aviso legal.
    for (const [ancho, alto] of [[1080, 1920], [1080, 1350], [1080, 1080], [1024, 1024]]) {
      const m = medirPanel({ ancho, alto, reservadoAbajo: 200, contenido: CONTENIDO });
      expect(Number.isInteger(m.cuerpoTitulo), `${ancho}x${alto}`).toBe(true);
    }
  });

  it("el panel deja lugar para lo que va abajo: nada se monta sobre el aviso legal", () => {
    // Este es el choque que aparecio en el mockup del 16-sep: en 4:5 las casillas se metian
    // abajo del aviso legal y el logo se montaba encima.
    const reservadoAbajo = 260;
    const m = medirPanel({ ancho: 1080, alto: 1350, reservadoAbajo, contenido: CONTENIDO });
    expect(m.fondoDelContenido).toBeLessThanOrEqual(1350 - reservadoAbajo);
  });

  it("las casillas se sueltan antes que achicar el titulo a ilegible", () => {
    const apretado = medirPanel({
      ancho: 1080, alto: 1080, reservadoAbajo: 400,
      contenido: { ...CONTENIDO, titulo: "Un titulo bastante largo que ocupa varios renglones enteros" },
    });
    expect(apretado.datosDibujados).toBeLessThan(CONTENIDO.datos.length);
    expect(apretado.cuerpoTitulo).toBeGreaterThanOrEqual(28);
  });

  it("ninguna casilla se pasa del ancho util", () => {
    const m = medirPanel({ ancho: 1080, alto: 1920, reservadoAbajo: 200, contenido: CONTENIDO });
    for (const c of m.casillas) expect(c.left + c.ancho).toBeLessThanOrEqual(1080 - m.margen);
  });

  it("con el aviso legal REAL del cliente, nada se mete abajo de la franja", async () => {
    // El aviso legal de Central mide 165px de franja a 1080 de ancho: con el logo y los margenes,
    // reservadoAbajo real = 319, no los 200 de las otras pruebas. Medido el 16-sep-2026 con
    // armarFranjaLegal sobre su texto de verdad. Con 319 el formato cuadrado desbordaba: el
    // precio se dibujaba abajo de la franja legal.
    for (const [ancho, alto] of [[1080, 1920], [1080, 1350], [1080, 1080]]) {
      const m = medirPanel({ ancho, alto, reservadoAbajo: 319, contenido: CONTENIDO });
      expect(m.fondoDelContenido, `${ancho}x${alto}`).toBeLessThanOrEqual(alto - 319);
      expect(m.desborda, `${ancho}x${alto}`).toBe(false);
    }
  });

  it("la foto cede antes que el contenido pise el aviso legal", async () => {
    // El piso del 45% es una preferencia, no una ley. Lo que NO se negocia es la franja legal.
    const m = medirPanel({ ancho: 1080, alto: 1080, reservadoAbajo: 319, contenido: CONTENIDO });
    expect(m.altoFoto).toBeLessThan(1080 * 0.45);
    expect(m.altoFoto).toBeGreaterThanOrEqual(1080 * 0.3);
  });

  it("cuando de verdad no entra, lo dice en vez de taparlo", async () => {
    // El ultimo recurso tiene que ser VISIBLE. Antes, `Math.min(altoPanel, techoPanel)` aceptaba el
    // desborde en silencio y el precio se dibujaba abajo del aviso legal. Ahora la placa igual sale
    // —no se rompe nada— pero avisa, y la ruta lo registra en el log.
    // Caso alcanzable de verdad: un titulo largo de aviso real con un pie legal mas grande todavia.
    const tituloLargo =
      "Excelente departamento de tres ambientes con balcon aterrazado y cochera cubierta en el corazon de Belgrano";
    const m = medirPanel({
      ancho: 1080, alto: 1080, reservadoAbajo: 500,
      contenido: { ...CONTENIDO, titulo: tituloLargo },
    });
    expect(m.desborda).toBe(true);
    // Y aun desbordando, el piso duro del 30% se respeta: la foto nunca desaparece.
    expect(m.altoFoto).toBeGreaterThanOrEqual(Math.floor(1080 * 0.3));
  });

  it("en el caso normal el desborde es false", async () => {
    // Si un refactor deja `desborda` clavado en true o en false, una de las dos pruebas cae.
    const m = medirPanel({ ancho: 1080, alto: 1350, reservadoAbajo: 319, contenido: CONTENIDO });
    expect(m.desborda).toBe(false);
  });
});

describe("armarPlacaConFoto", () => {
  it("la placa sale de la medida exacta que se pidio", async () => {
    const r = await armarPlacaConFoto({
      foto: await fotoDe(1500, 1120), ancho: 1080, alto: 1350,
      reservadoAbajo: 200, contenido: CONTENIDO,
    });
    const m = await sharp(r.imagen).metadata();
    expect(m.width).toBe(1080);
    expect(m.height).toBe(1350);
  });

  it("LA FOTO NO SE TOCA: el centro de la zona de foto sigue siendo la foto", async () => {
    // Es lo que sostiene todo el diseno. Si esto falla, la placa no muestra la propiedad real.
    const COLOR = { r: 20, g: 120, b: 200 };
    const r = await armarPlacaConFoto({
      foto: await fotoDe(1500, 1120, COLOR), ancho: 1080, alto: 1350,
      reservadoAbajo: 200, contenido: CONTENIDO,
    });
    const px = await sharp(r.imagen)
      .extract({ left: 500, top: Math.round(r.altoFoto / 2), width: 4, height: 4 })
      .raw().toBuffer();
    expect(px[0]).toBeCloseTo(COLOR.r, -1);
    expect(px[1]).toBeCloseTo(COLOR.g, -1);
    expect(px[2]).toBeCloseTo(COLOR.b, -1);
  });

  it("EN LA IMAGEN NO VA NINGUN EMOJI: si llega uno, se ve en el contador", async () => {
    const r = await armarPlacaConFoto({
      foto: await fotoDe(1500, 1120), ancho: 1080, alto: 1350, reservadoAbajo: 200,
      contenido: { ...CONTENIDO, titulo: "Belgrano lidera 🏡" },
    });
    expect(r.letrasSinDibujo).toBeGreaterThan(0);
  });

  it("un titulo limpio no deja ninguna letra sin dibujar", async () => {
    const r = await armarPlacaConFoto({
      foto: await fotoDe(1500, 1120), ancho: 1080, alto: 1350,
      reservadoAbajo: 200, contenido: CONTENIDO,
    });
    expect(r.letrasSinDibujo).toBe(0);
  });

  it("avisa cuando la foto es mas chica que la placa y hay que agrandarla", async () => {
    // 7 de 40 portadas de Central miden menos de 1080 px de ancho. Esas salen blandas.
    const r = await armarPlacaConFoto({
      foto: await fotoDe(575, 431), ancho: 1080, alto: 1350,
      reservadoAbajo: 200, contenido: CONTENIDO,
    });
    expect(r.escalaFoto).toBeGreaterThan(1);
  });

  it("con la foto tipica de Central la achica, no la agranda", async () => {
    // Foto tipica medida el 16-sep-2026: 4:3, mediana de ancho 1500 px.
    const r = await armarPlacaConFoto({
      foto: await fotoDe(1500, 1120), ancho: 1080, alto: 1350,
      reservadoAbajo: 200, contenido: CONTENIDO,
    });
    expect(r.escalaFoto).toBeLessThan(1);
  });

  it("anda en los tres formatos", async () => {
    for (const [ancho, alto] of [[1080, 1920], [1080, 1350], [1080, 1080]]) {
      const r = await armarPlacaConFoto({
        foto: await fotoDe(1500, 1120), ancho, alto, reservadoAbajo: 200, contenido: CONTENIDO,
      });
      const m = await sharp(r.imagen).metadata();
      expect(m.width, `${ancho}x${alto}`).toBe(ancho);
      expect(m.height, `${ancho}x${alto}`).toBe(alto);
      expect(r.letrasSinDibujo, `${ancho}x${alto}`).toBe(0);
    }
  });

  it("sin bajada, sin precio y sin datos igual arma la placa", async () => {
    const r = await armarPlacaConFoto({
      foto: await fotoDe(1500, 1120), ancho: 1080, alto: 1350,
      reservadoAbajo: 200, contenido: { titulo: "Belgrano lidera la demanda" },
    });
    expect(r.datosDibujados).toBe(0);
    expect((await sharp(r.imagen).metadata()).height).toBe(1350);
  });
});
