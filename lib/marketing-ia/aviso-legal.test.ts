import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { armarFranjaLegal } from "./aviso-legal";

// El aviso real que pidió Central (sugerencia de Kevin Arlandi, 31-ago-2026): 841 caracteres.
const AVISO_LARGO = `AVISO LEGAL: Todas las operaciones de intermediación inmobiliaria son llevadas a cabo y concluidas exclusivamente por los corredores matriculados Gustavo Guastello CUCICBA 869 y Carlos Belsito CMCPSI 5790. En cumplimiento de la Ley 2.340 (CABA), Ley 10.973 (Prov. Bs. As.), DNU 274/2019 de Lealtad Comercial, Ley 24.240 de Defensa del Consumidor, el Código Civil y Comercial de la Nación y los códigos de ética profesional vigentes, se deja expresa constancia de que los asistentes y colaboradores / Client Support actúan únicamente en tareas de asistencia técnica/administrativa y NO ejercen actos de corretaje inmobiliario. Las fotografías, renders e imágenes publicadas son de carácter meramente ilustrativo y no contractual. Más información en www.CentralRE.com.ar
Central Real Estate Argentina | Mendoza 1962, Belgrano, CABA | 4789-3700`;

const AVISO_CORTO = "Mat. CUCICBA 869 - Corredor responsable: Gustavo Guastello.";

/** Cuenta pixeles claros (letra) por franja horizontal de la imagen. */
async function tintaPorTercio(png: Buffer, alto: number) {
  const { data, info } = await sharp(png).flatten({ background: "#000000" }).greyscale().raw()
    .toBuffer({ resolveWithObject: true });
  const tercios = [0, 0, 0];
  for (let y = 0; y < info.height; y++) {
    const t = Math.min(2, Math.floor((y / alto) * 3));
    for (let x = 0; x < info.width; x++) if (data[y * info.width + x] > 150) tercios[t]++;
  }
  return tercios;
}

describe("armarFranjaLegal", () => {
  it("no dibuja nada si no hay texto", async () => {
    expect(await armarFranjaLegal("", 1080, 1080)).toBeNull();
    expect(await armarFranjaLegal("   \n  ", 1080, 1080)).toBeNull();
  });

  it("un aviso corto entra en un renglón y con la letra más grande", async () => {
    const f = (await armarFranjaLegal(AVISO_CORTO, 1080, 1080))!;
    expect(f.renglones).toBe(1);
    expect(f.cuerpo).toBe(22);
  });

  it("un aviso largo achica la letra pero no se pasa del tope de alto", async () => {
    const f = (await armarFranjaLegal(AVISO_LARGO, 1080, 1080))!;
    expect(f.cuerpo).toBeGreaterThanOrEqual(13);
    expect(f.alto).toBeLessThanOrEqual(Math.round(1080 * 0.17) + 1);
  });

  it("no pierde ni una palabra del texto original", async () => {
    const f = (await armarFranjaLegal(AVISO_LARGO, 1080, 1080))!;
    expect(f.texto.join(" ")).toBe(AVISO_LARGO.replace(/\s+/g, " ").trim());
  });

  // LA PRUEBA QUE IMPORTA. El 31-ago-2026 salió a producción una versión que armaba bien los
  // renglones y la banda oscura, pero cuyo dibujo el rasterizador cortaba a las 45 letras: el
  // aviso quedaba en "...de interme" y nada más. Todas las comprobaciones sobre el texto y las
  // medidas pasaban igual, porque el problema aparecía recién al convertir el dibujo en pixeles.
  // Por eso esta prueba MIRA LA IMAGEN: si el aviso se corta, el tercio de abajo queda vacío.
  // Se prueba en VARIOS anchos a proposito: la falla aparecia solo con ciertos tamaños de
  // imagen. Con 1024 px de ancho el cuerpo daba 16,11852 px —fraccionario— y ahi opentype.js
  // devolvia coordenadas NaN; con 1080 px daba 17 justo y todo salia bien. Probar un solo
  // tamaño es exactamente como no probar.
  it.each([768, 1024, 1080, 1200])("dibuja el aviso entero en una imagen de %i px de ancho", async (ancho) => {
    const f = (await armarFranjaLegal(AVISO_LARGO, ancho, ancho))!;
    expect(f.renglones).toBeGreaterThan(4);
    const [arriba, medio, abajo] = await tintaPorTercio(f.png, f.alto);
    expect(arriba).toBeGreaterThan(500);
    expect(medio).toBeGreaterThan(500);
    expect(abajo).toBeGreaterThan(500);
  });

  // ESTA es la prueba que caza la falla de verdad. Un cuerpo de letra fraccionario hace que
  // opentype.js devuelva coordenadas NaN en algunas letras; esas letras no se dibujan y el
  // aviso queda diciendo otra cosa. Se mira en muchos anchos porque depende del tamaño exacto.
  it.each([640, 768, 900, 1024, 1080, 1200, 1440, 1920])(
    "no pierde ni una letra en una imagen de %i px de ancho",
    async (ancho) => {
      const f = (await armarFranjaLegal(AVISO_LARGO, ancho, ancho))!;
      expect(f.letrasSinDibujo).toBe(0);
      expect(Number.isInteger(f.cuerpo)).toBe(true);
    }
  );

  it("la franja se apoya en el borde de abajo de la imagen", async () => {
    const f = (await armarFranjaLegal(AVISO_LARGO, 1080, 1920))!;
    expect(f.top + f.alto).toBe(1920);
    const meta = await sharp(f.png).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(f.alto);
  });

  it("escala con el ancho de la imagen", async () => {
    const chico = (await armarFranjaLegal(AVISO_CORTO, 540, 540))!;
    const grande = (await armarFranjaLegal(AVISO_CORTO, 1080, 1080))!;
    expect(grande.cuerpo).toBeGreaterThan(chico.cuerpo);
  });
});
