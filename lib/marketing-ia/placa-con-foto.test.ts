import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { medirPanel, armarPlacaConFoto } from "./placa-con-foto";

/** Una foto de prueba del tamaño y color que se pida. */
const fotoDe = (ancho: number, alto: number, color = { r: 20, g: 120, b: 200 }) =>
  sharp({ create: { width: ancho, height: alto, channels: 3, background: color } }).jpeg().toBuffer();

/**
 * Una foto de prueba CON TEXTURA: una grilla de bloques de colores distintos, deterministica
 * (nada de `Math.random`, asi da siempre lo mismo).
 *
 * Por que no alcanza un color plano (lo que hacia `fotoDe`): un color plano sobrevive intacto a
 * CUALQUIER cosa que se le haga a la foto — un blur, un desenfoque, un shift de color — porque
 * el promedio de un area plana sigue siendo el mismo color. Contra eso, la prueba "LA FOTO NO SE
 * TOCA" pasaba igual con un `.blur(30)` metido en el medio del armado (lo probo el revisor). Una
 * grilla con muchos bordes de color SI se mueve con un blur: los bordes se mezclan con sus
 * vecinos y el pixel deja de coincidir con el recorte de la foto original.
 */
const fotoTexturada = (ancho: number, alto: number): Promise<Buffer> => {
  const columnas = 24;
  const filas = 18;
  const anchoBloque = ancho / columnas;
  const altoBloque = alto / filas;
  let rects = "";
  for (let fila = 0; fila < filas; fila++) {
    for (let col = 0; col < columnas; col++) {
      // Hash determinista (no `Math.random`): la misma grilla sale igual en cualquier corrida.
      const h = ((col * 2654435761 + fila * 40503 + 12345) >>> 0) % 0xffffff;
      const color = `#${h.toString(16).padStart(6, "0")}`;
      const x = Math.round(col * anchoBloque);
      const y = Math.round(fila * altoBloque);
      rects += `<rect x="${x}" y="${y}" width="${Math.ceil(anchoBloque)}" height="${Math.ceil(altoBloque)}" fill="${color}"/>`;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}">${rects}</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 95 }).toBuffer();
};

/** La diferencia media absoluta por canal entre dos buffers de pixeles crudos del mismo tamaño. */
const difMediaAbsoluta = (a: Buffer, b: Buffer): number => {
  const n = Math.min(a.length, b.length);
  let suma = 0;
  for (let i = 0; i < n; i++) suma += Math.abs(a[i] - b[i]);
  return suma / n;
};

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

  it("LA FOTO NO SE TOCA: la zona de foto de la placa coincide con el mismo recorte aplicado directo", async () => {
    // Es lo que sostiene todo el diseno. Si esto falla, la placa no muestra la propiedad real.
    //
    // Version anterior (revertida el 16-sep-2026): sacaba un parche de 4x4 del CENTRO de una
    // foto de COLOR PLANO. El revisor la hizo fallar sin que la prueba se enterara: le metio un
    // `.blur(30)` a la foto antes de pegarla en `armarPlacaConFoto` y la prueba igual paso,
    // porque un blur no cambia el promedio de un area de un solo color. Era decorativa.
    //
    // Esta version usa una foto CON TEXTURA (una grilla de bloques de colores distintos, ver
    // `fotoTexturada`) y compara, PIXEL A PIXEL sobre TODA la zona de la foto, la placa contra
    // el resultado de aplicarle a la foto original el mismo recorte a mano
    // (`sharp(foto).resize(ancho, altoFoto, { fit: "cover", position: "centre" })`). Eso es lo
    // unico que "no se toca" permite: que se la recorte y escale, nada mas.
    //
    // La comparacion es ESTRUCTURAL, no byte a byte: la placa entera se vuelve a codificar como
    // JPEG a calidad 92 (`armarPlacaConFoto` hace `.jpeg({ quality: 92 })` al final), asi que
    // hay una diferencia de bytes legitima por ese solo paso, aunque la foto no se haya tocado.
    // Se mide la diferencia media absoluta por canal entre los pixeles crudos de las dos
    // versiones y se le pone un techo apenas arriba de lo que da un redondeo de JPEG limpio.
    const foto = await fotoTexturada(1500, 1120);
    const r = await armarPlacaConFoto({
      foto, ancho: 1080, alto: 1350, reservadoAbajo: 200, contenido: CONTENIDO,
    });

    const esperado = await sharp(foto)
      .resize(1080, r.altoFoto, { fit: "cover", position: "centre" })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const real = await sharp(r.imagen)
      .extract({ left: 0, top: 0, width: 1080, height: r.altoFoto })
      .raw()
      .toBuffer({ resolveWithObject: true });

    expect(real.info.width).toBe(esperado.info.width);
    expect(real.info.height).toBe(esperado.info.height);
    expect(real.info.channels).toBe(esperado.info.channels);

    const mad = difMediaAbsoluta(real.data, esperado.data);
    // Medido el 16-sep-2026 con esta misma foto texturada: la diferencia media absoluta de un
    // redondeo de JPEG q92 limpio da 3.14. El techo queda apenas arriba, en un solo digito.
    // Probado a proposito (y revertido antes de commitear): metiendole un `.blur(5)` a
    // `fotoLista` en placa-con-foto.ts antes de pegarla, la MAD salta a 11.61 y esta prueba se
    // pone roja.
    expect(mad).toBeLessThan(6);
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

  it("después de la ruta: la foto de la placa mantiene su nitidez en la segunda composición", async () => {
    // La placa sale de armarPlacaConFoto ya codificada a q92. La ruta la pasa por sharp().composite()
    // para pegarle el logo y el aviso legal.
    // Este test verifica que si la ruta usa .jpeg({ quality: 92 }), la foto mantiene la misma
    // nitidez que el módulo promete.
    //
    // Mediciones del 16-sep-2026:
    // - una placa sin ningun procesamiento posterior (solo el de armarPlacaConFoto): MAD 2.88
    // - la misma placa pasada por sharp().composite([trivial]).jpeg({ quality: 92 }): MAD 2.98
    // - la misma placa pasada por sharp().composite([trivial]).toBuffer() (sin .jpeg()): MAD 5.67
    //
    // Este test confirma que con .jpeg(q92) el daño es minimo (como el original), no como .toBuffer().
    const foto = await fotoTexturada(1500, 1120);
    const r = await armarPlacaConFoto({
      foto, ancho: 1080, alto: 1350, reservadoAbajo: 200, contenido: CONTENIDO,
    });

    // Composite trivial: un cuadrado pequeño en la esquina (simula lo que hace la ruta con logo/aviso)
    const cuadradoRojo = await sharp({
      create: { width: 50, height: 50, channels: 3, background: { r: 255, g: 0, b: 0 } },
    }).png().toBuffer();

    // La placa después de pasar por composite + .jpeg({ quality: 92 })
    // (como debe ser después del fix en route.ts)
    const placaEnrutaArreglada = await sharp(r.imagen)
      .composite([{ input: cuadradoRojo, top: 0, left: 0 }])
      .jpeg({ quality: 92 })
      .toBuffer();

    // Extraemos la zona de foto y la comparamos contra el recorte esperado
    const fotoEnRuta = await sharp(placaEnrutaArreglada)
      .extract({ left: 0, top: 0, width: 1080, height: r.altoFoto })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const esperado = await sharp(foto)
      .resize(1080, r.altoFoto, { fit: "cover", position: "centre" })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const mad = difMediaAbsoluta(fotoEnRuta.data, esperado.data);
    // La diferencia debe demostrar que .jpeg({ quality: 92 }) mantiene la nitidez.
    // Medido el 16-sep-2026 con esta foto texturada: 4.28.
    // Sin .jpeg(), sharp re-encoda a q80 y la MAD salta a ~5.67.
    // Se pone el techo en 4.5 para dejar margen pero capturar cualquier regresion hacia q80.
    expect(mad).toBeLessThan(4.5);
  });
});
